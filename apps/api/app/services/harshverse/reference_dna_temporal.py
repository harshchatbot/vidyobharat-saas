"""Reference DNA v0.12: opt-in multi-frame observations, not automated edit decisions.

Temporal claims require >=2 distinct frame timestamps. No asset copying or inference
unless a provider is explicitly passed. Model confidence is NOT calibrated.
"""
from __future__ import annotations

import base64
import json
import math
from pathlib import Path
from typing import Any, Protocol

from .reference_dna_semantic import extract_jpeg
from .reference_dna_hosted import (_post, _parse_object, _check, MODEL_RE,
                                   MAX_FRAME_BYTES)

TEMPORAL_LABELS = frozenset({
    'presenter', 'full_screen_graphics', 'split_screen', 'lower_third',
    'chart', 'calendar', 'money_stack', 'illustration', 'b_roll',
    'kinetic_typography', 'text_reveal', 'zoom', 'slide', 'transition',
})
MOTION_LABELS = frozenset({'kinetic_typography', 'text_reveal', 'zoom', 'slide', 'transition'})
MAX_WINDOWS = 10
MAX_FRAMES_PER_WINDOW = 4
TEMPORAL_PROMPT = (
    'You are analyzing ordered frames from ONE short reference-video interval. '
    'Frames are labeled by timestamp. Report only directly visible creative elements. '
    'For motion labels (kinetic_typography, text_reveal, zoom, slide, transition), '
    'cite two DISTINCT frames showing a measurable change; never infer motion from one image. '
    'Allow multiple simultaneous labels, including presenter and lower_third. '
    'Never invent audio, font family, b-roll identity, amounts or offscreen content. '
    'Be conservative; return an empty observations array when uncertain. '
    'Each observation requires label, start_seconds, end_seconds, evidence_times_seconds, '
    'confidence, and evidence. The times must be drawn from the supplied frame times. '
    'Confidence is subjective, NOT calibrated. Output JSON only.'
)
OBSERVATION_SCHEMA = {
    'type': 'object', 'properties': {'observations': {'type': 'array', 'items': {
        'type': 'object', 'properties': {
            'label': {'type': 'string', 'enum': sorted(TEMPORAL_LABELS)},
            'start_seconds': {'type': 'number'}, 'end_seconds': {'type': 'number'},
            'evidence_times_seconds': {'type': 'array', 'items': {'type': 'number'}},
            'confidence': {'type': 'number'}, 'evidence': {'type': 'string'},
        }, 'required': ['label', 'start_seconds', 'end_seconds',
                        'evidence_times_seconds', 'confidence', 'evidence'],
        'additionalProperties': False}}},
    'required': ['observations'], 'additionalProperties': False,
}


class TemporalProvider(Protocol):
    def classify_window(self, frames: list[tuple[float, bytes]]) -> Any: ...


class AbstainTemporalProvider:
    def classify_window(self, frames: list[tuple[float, bytes]]) -> dict:
        return {'observations': []}


class FixtureTemporalProvider:
    def __init__(self, predictions: list[dict]):
        self.predictions = predictions
        self.calls = 0

    def classify_window(self, frames: list[tuple[float, bytes]]) -> dict:
        self.calls += 1
        return self.predictions[self.calls - 1] if self.calls <= len(self.predictions) else {'observations': []}


class OpenAITemporalProvider:
    def __init__(self, model: str, api_key: str, timeout: int = 90):
        _check(model, api_key)
        self.model, self.api_key, self.timeout = model, api_key, timeout

    def classify_window(self, frames: list[tuple[float, bytes]]) -> dict:
        _validate_frames(frames)
        content = [{'type': 'input_text', 'text': TEMPORAL_PROMPT}]
        for t, frame in frames:
            content.append({'type': 'input_text', 'text': f'FRAME {t:.3f}s'})
            content.append({'type': 'input_image', 'image_url':
                            'data:image/jpeg;base64,' + base64.b64encode(frame).decode('ascii')})
        payload = {'model': self.model, 'store': False,
                   'input': [{'role': 'user', 'content': content}],
                   'text': {'format': {'type': 'json_schema', 'name': 'reference_dna_temporal',
                                       'strict': True, 'schema': OBSERVATION_SCHEMA}}}
        response = _post('https://api.openai.com/v1/responses',
                         {'Authorization': 'Bearer ' + self.api_key}, payload, self.timeout)
        if response.get('status') not in (None, 'completed'):
            raise ValueError('Incomplete OpenAI response')
        texts = [p['text'] for m in response.get('output', []) if m.get('type') == 'message'
                 for p in m.get('content', []) if p.get('type') == 'output_text' and isinstance(p.get('text'), str)]
        if not texts:
            raise ValueError('No OpenAI text response')
        return _parse_object(''.join(texts))


class GeminiTemporalProvider:
    def __init__(self, model: str, api_key: str, timeout: int = 90):
        _check(model, api_key)
        self.model, self.api_key, self.timeout = model, api_key, timeout

    def classify_window(self, frames: list[tuple[float, bytes]]) -> dict:
        _validate_frames(frames)
        parts = [{'text': TEMPORAL_PROMPT}]
        for t, frame in frames:
            parts.extend([{'text': f'FRAME {t:.3f}s'},
                          {'inline_data': {'mime_type': 'image/jpeg',
                                           'data': base64.b64encode(frame).decode('ascii')}}])
        payload = {'contents': [{'role': 'user', 'parts': parts}],
                   'generationConfig': {'responseMimeType': 'application/json',
                                        'responseJsonSchema': OBSERVATION_SCHEMA,
                                        'temperature': 0}}
        response = _post(f'https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent',
                         {'x-goog-api-key': self.api_key}, payload, self.timeout)
        choices = response.get('candidates') or []
        if not choices or choices[0].get('finishReason') not in (None, 'STOP'):
            raise ValueError('Gemini response incomplete')
        return _parse_object(''.join(p.get('text', '') for p in choices[0].get('content', {}).get('parts', [])))


def _validate_frames(frames: list[tuple[float, bytes]]) -> None:
    if not isinstance(frames, list) or not 2 <= len(frames) <= MAX_FRAMES_PER_WINDOW:
        raise ValueError('Require 2–4 frames')
    times = []
    for t, frame in frames:
        if not isinstance(t, (int, float)) or not math.isfinite(t):
            raise ValueError('Invalid frame time')
        if not isinstance(frame, bytes) or not frame.startswith(b'\xff\xd8') or len(frame) > MAX_FRAME_BYTES:
            raise ValueError('Invalid JPEG frame')
        times.append(float(t))
    if times != sorted(set(times)):
        raise ValueError('Frames must have increasing, distinct timestamps')


def _shot_bounds(analysis: dict) -> list[tuple[float, float]]:
    duration = float(analysis['video']['duration_seconds'])
    if not math.isfinite(duration) or duration < 0.5:
        raise ValueError('Video too short')
    raw = analysis['editing_rhythm']['detected_cut_times_seconds']
    if not isinstance(raw, list):
        raise ValueError('Invalid scene cuts')
    cuts = []
    for value in raw:
        if type(value) not in (float, int) or not math.isfinite(value):
            raise ValueError('Invalid scene cut timestamp')
        if 0 < value < duration:
            cuts.append(float(value))
    cuts = sorted(set(cuts))
    return list(zip([0.0, *cuts], [*cuts, duration]))


def _activity_times(analysis: dict, duration: float) -> list[float]:
    """Only time-grounded activity events; tolerate older Reference DNA formats."""
    creative = analysis.get('creative_evidence') or {}
    if not isinstance(creative, dict):
        return []
    # Different preceding versions used different event containers.
    events = []
    for key in ('visual_activity_events', 'visual_change_events', 'visual_events',
                'activity_events', 'visual_activity_candidates'):
        value = creative.get(key, [])
        if isinstance(value, list):
            events.extend(value)
    found = []
    for event in events:
        if isinstance(event, dict):
            t = event.get('time_seconds', event.get('timestamp_seconds'))
        else:
            t = event
        if type(t) in (float, int) and math.isfinite(t) and 0 < t < duration:
            found.append(float(t))
    return sorted(set(found))


def _sample_times(anchor: float, a: float, b: float, span: float) -> list[float]:
    """Return three distinct frame times within the intended shot or cut range."""
    right_bound = max(a, b - 0.001)
    half = min(span / 2, (b-a)/2)
    left = max(a, anchor - half)
    right = min(right_bound, anchor + half)
    if right-left < 0.08:
        left, right = a, right_bound
    if right-left < 0.08:
        return []
    return sorted(set(round(left + (right-left)*i/2, 3) for i in range(3)))


def plan_windows(analysis: dict, *, max_windows: int = 6,
                 span: float = 0.8) -> dict:
    """Cover distinct shots before spending the remaining budget on cut/activity evidence.

    If there are more shots than budget, the report explicitly identifies uncovered
    shots instead of incorrectly claiming full coverage.
    """
    if type(max_windows) is not int or not 1 <= max_windows <= MAX_WINDOWS:
        raise ValueError('Invalid window budget')
    if type(span) not in (int, float) or not math.isfinite(span) or not 0.2 <= span <= 2:
        raise ValueError('Invalid window span')
    bounds = _shot_bounds(analysis)
    duration = bounds[-1][1]
    candidates = []
    for index, (a, b) in enumerate(bounds):
        midpoint = (a+b)/2
        times = _sample_times(midpoint, a, b, span)
        if times:
            candidates.append({'kind': 'shot_center', 'shot_index': index,
                               'anchor_seconds': round(midpoint, 3),
                               'sampled_times_seconds': times})

    # Prioritize the first/last shot and spread remaining slots across timeline
    # when budget cannot cover every shot. Deterministic and transparent.
    if len(candidates) > max_windows:
        if max_windows == 1:
            selected = [candidates[len(candidates)//2]]
        else:
            indexes = sorted(set(round(i*(len(candidates)-1)/(max_windows-1))
                                 for i in range(max_windows)))
            selected = [candidates[i] for i in indexes]
    else:
        selected = list(candidates)

    # Extra windows only after all feasible shot-center coverage is allocated.
    # First use previously identified visual-activity timestamps, then cuts.
    if len(selected) < max_windows:
        extras = [('visual_activity', t) for t in _activity_times(analysis, duration)]
        extras += [('cut_boundary', bounds[i][1]) for i in range(len(bounds)-1)]
        for kind, t in extras:
            if len(selected) >= max_windows:
                break
            if any(abs(t - x['anchor_seconds']) < span*0.75 for x in selected):
                continue
            times = _sample_times(t, 0., duration, span)
            if len(times) != 3:
                continue
            if any(len(set(times) & set(x['sampled_times_seconds'])) >= 2 for x in selected):
                continue
            selected.append({'kind': kind, 'shot_index': None,
                             'anchor_seconds': round(t, 3),
                             'sampled_times_seconds': times})
    selected.sort(key=lambda x: x['anchor_seconds'])
    covered = sorted({x['shot_index'] for x in selected if x['shot_index'] is not None})
    uncovered = [i for i in range(len(bounds)) if i not in covered]
    return {'windows': selected, 'shot_count': len(bounds),
            'covered_shot_indices': covered, 'uncovered_shot_indices': uncovered,
            'full_shot_coverage': not uncovered,
            'budget_exhausted': len(selected) >= max_windows}


def build_windows(analysis: dict, *, max_windows: int = 6,
                  span: float = 0.8) -> list[list[float]]:
    """Backwards-compatible list-of-time-triples API, now shot-first."""
    return [item['sampled_times_seconds'] for item in
            plan_windows(analysis, max_windows=max_windows, span=span)['windows']]


def validate_temporal(raw: Any, times: list[float], *, duration: float) -> list[dict]:
    """Reject hallucinated timestamps, invalid labels, unsupported temporal claims."""
    if not isinstance(raw, dict) or not isinstance(raw.get('observations'), list) or len(raw['observations']) > 16:
        raise ValueError('Temporal response contract violated')
    valid_times = {round(t, 3) for t in times}
    accepted = []
    seen = set()
    for entry in raw['observations']:
        if not isinstance(entry, dict) or entry.get('label') not in TEMPORAL_LABELS:
            continue
        name, a, b = entry['label'], entry.get('start_seconds'), entry.get('end_seconds')
        confidence, evidence = entry.get('confidence'), entry.get('evidence')
        et = entry.get('evidence_times_seconds')
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in (a,b,confidence)):
            continue
        if not (0 <= a < b <= duration and 0 <= confidence <= 1):
            continue
        if (not isinstance(evidence, str) or not 12 <= len(evidence) <= 300 or
            not isinstance(et, list) or not 1 <= len(et) <= MAX_FRAMES_PER_WINDOW or
            any(type(t) not in (int, float) or not math.isfinite(t) for t in et)):
            continue
        et_rounded = sorted({round(t, 3) for t in et})
        if not set(et_rounded).issubset(valid_times):
            continue
        if name in MOTION_LABELS and len(et_rounded) < 2:
            continue
        if a < min(et_rounded) - .05 or b > max(et_rounded) + .05:
            continue
        key = (name, round(a, 3), round(b, 3))
        if key in seen:
            continue
        seen.add(key)
        accepted.append({'label': name, 'start_seconds': round(a, 3),
                         'end_seconds': round(b, 3), 'evidence_times_seconds': et_rounded,
                         'confidence_uncalibrated': round(float(confidence), 3),
                         'evidence': evidence, 'provenance': 'temporal_vision_unreviewed'})
    return accepted


def analyze_temporal(reference: str | Path, base_report: dict, *,
                     provider: TemporalProvider | None = None,
                     provider_name: str = 'none', max_windows: int = 6) -> dict:
    """Enhance a v0.11 report without changing its semantic_vision or prior fields."""
    duration = float(base_report['video']['duration_seconds'])
    plan = plan_windows(base_report, max_windows=max_windows)
    windows = plan['windows']
    provider = provider or AbstainTemporalProvider()
    output = []
    for planned in windows:
        times = planned['sampled_times_seconds']
        try:
            frames = [(t, extract_jpeg(reference, t)) for t in times]
            _validate_frames(frames)
            raw = provider.classify_window(frames)
            predictions = validate_temporal(raw, times, duration=duration)
            output.append({'sampled_times_seconds': times, 'sampling_reason': planned['kind'],
                           'shot_index': planned['shot_index'],
                           'observations': predictions, 'error': None})
        except Exception as exc:
            output.append({'sampled_times_seconds': times, 'sampling_reason': planned['kind'],
                           'shot_index': planned['shot_index'], 'observations': [],
                           'error': type(exc).__name__})
    result = dict(base_report)
    result['schema_version'] = 'reference-dna/v0.6'
    result['temporal_vision'] = {
        'provider': provider_name, 'windows': output,
        'sampling_strategy': 'shot_coverage_then_activity_then_cuts/v0.12.1',
        'sampling_coverage': {k: v for k, v in plan.items() if k != 'windows'},
        'observation_count': sum(len(item['observations']) for item in output),
        'semantic_module_selection_allowed': False,
        'quality_gate_reason': 'Unreviewed temporal predictions; evaluate with interval annotations first',
        'confidence_calibrated': False,
        'evidence_requirements': 'motion labels require two distinct source frame timestamps',
        'privacy': {'reference_frames_embedded_in_report': False,
                    'reference_audio_reused': False},
    }
    return result
