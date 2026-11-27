"""Reference DNA v0.10: opt-in, evidence-backed semantic image understanding.

Local-by-default. No media is uploaded without explicit choice of model provider.
Existing v0.9 analysis is retained; semantic predictions remain advisory/gated.
This module deliberately never executes generated code or trusts provider confidence.
"""
from __future__ import annotations

import base64
import json
import math
import re
import subprocess
import urllib.request
from pathlib import Path
from typing import Any, Protocol

from .reference_dna_recognition import LABELS, evaluate_intervals, analyze_reference_v09, validate_reviewed_annotations

MAX_FRAMES = 16
MAX_RESPONSE_BYTES = 100_000
ALLOWED_LABELS = LABELS - {'unknown'}
PROMPT = ("Describe ONLY visible creative techniques in this video FRAME. "
          "Choose labels only from: presenter, full_screen_graphics, split_screen, "
          "kinetic_typography, lower_third, chart, calendar, money_stack, "
          "illustration, b_roll, transition. "
          "Be conservative: a single frame cannot establish a transition or kinetic motion. "
          "Do not claim sound or font identity. Reply ONLY JSON: "
          '{"labels":[{"label":"presenter","confidence":0.8,"evidence":"visible face speaking"}]}. '
          "Use an empty labels array if uncertain. Confidence is a subjective model estimate, not calibrated.")


class VisionProvider(Protocol):
    def classify(self, frame_jpeg: bytes, *, time_seconds: float) -> Any: ...


class AbstainProvider:
    """Safe default; proves end-to-end plumbing without making assertions."""
    def classify(self, frame_jpeg: bytes, *, time_seconds: float) -> dict:
        return {'labels': []}


class FixtureProvider:
    """Offline reproducible integration tests. Not real AI inference."""
    def __init__(self, records: dict[str, Any]):
        self.records = records

    def classify(self, frame_jpeg: bytes, *, time_seconds: float) -> Any:
        return self.records.get(f'{time_seconds:.3f}', {'labels': []})


class OllamaVisionProvider:
    """Opt-in on-device HTTP provider; fixed loopback host prevents SSRF."""
    def __init__(self, model: str, *, port: int = 11434, timeout: int = 90):
        if not re.fullmatch(r'[A-Za-z0-9._:/-]{1,100}', model):
            raise ValueError('Invalid Ollama model name')
        if not 1 <= port <= 65535:
            raise ValueError('Invalid port')
        self.model, self.port, self.timeout = model, port, timeout

    def classify(self, frame_jpeg: bytes, *, time_seconds: float) -> Any:
        body = json.dumps({'model': self.model, 'stream': False, 'format': 'json',
                           'messages': [{'role': 'user', 'content': PROMPT,
                                         'images': [base64.b64encode(frame_jpeg).decode('ascii')]}]}).encode()
        request = urllib.request.Request(f'http://127.0.0.1:{self.port}/api/chat', body,
                                         {'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(request, timeout=self.timeout) as res:
            outer = json.loads(res.read(MAX_RESPONSE_BYTES + 1))
        content = outer['message']['content']
        if len(content) > MAX_RESPONSE_BYTES:
            raise ValueError('Oversize provider response')
        return json.loads(content)


class OpenAIVisionProvider:
    """Optional hosted provider; explicit opt-in, never called by default."""
    def __init__(self, model: str, api_key: str, timeout: int = 90):
        if not api_key or not re.fullmatch(r'[A-Za-z0-9._-]{1,100}', model):
            raise ValueError('Invalid hosted provider configuration')
        self.model, self.api_key, self.timeout = model, api_key, timeout

    def classify(self, frame_jpeg: bytes, *, time_seconds: float) -> Any:
        data_url = 'data:image/jpeg;base64,' + base64.b64encode(frame_jpeg).decode('ascii')
        payload = {'model': self.model, 'messages': [
            {'role': 'user', 'content': [{'type': 'text', 'text': PROMPT},
                                         {'type': 'image_url', 'image_url': {'url': data_url}}]}],
                   'response_format': {'type': 'json_object'}, 'max_tokens': 350}
        body = json.dumps(payload).encode()
        request = urllib.request.Request('https://api.openai.com/v1/chat/completions', body,
                                         {'Authorization': f'Bearer {self.api_key}',
                                          'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(request, timeout=self.timeout) as res:
            outer = json.loads(res.read(MAX_RESPONSE_BYTES + 1))
        return json.loads(outer['choices'][0]['message']['content'])


def sample_times(analysis: dict, *, max_frames: int = MAX_FRAMES) -> list[float]:
    """Shot centers plus ±0.12s near cuts, bounded, de-duplicated."""
    if not isinstance(max_frames, int) or not 1 <= max_frames <= MAX_FRAMES:
        raise ValueError('max_frames outside limit')
    duration = float(analysis['video']['duration_seconds'])
    cuts = [float(t) for t in analysis['editing_rhythm']['detected_cut_times_seconds']]
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Invalid duration')
    boundaries = [0.0, *sorted(t for t in cuts if 0 < t < duration), duration]
    centers = [(a+b)/2 for a,b in zip(boundaries,boundaries[1:])]
    near = [min(duration-.01,max(0.0,c + offset)) for c in cuts for offset in (-.12,.12)]
    times = sorted({round(min(duration-.01,max(0.,t)),3) for t in centers + near})
    if len(times) <= max_frames:
        return times
    # Retain evenly distributed samples when budget is constrained.
    return [times[round(i*(len(times)-1)/(max_frames-1))] for i in range(max_frames)] if max_frames > 1 else [times[len(times)//2]]


def extract_jpeg(video: str | Path, timestamp: float, *, ffmpeg: str = 'ffmpeg') -> bytes:
    """Pipe a low-res JPEG in memory. Caller must authorize the reference path."""
    result = subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-ss', f'{timestamp:.3f}',
                             '-i', str(video), '-frames:v', '1', '-vf', 'scale=384:-2',
                             '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'],
                            capture_output=True, timeout=30, check=True)
    if not result.stdout.startswith(b'\xff\xd8') or len(result.stdout) > 1_500_000:
        raise ValueError('Could not decode bounded frame')
    return result.stdout


def validate_prediction(raw: Any, timestamp: float) -> list[dict[str, Any]]:
    """Drop unsupported/ambiguous claims; no unchecked provider records survive."""
    if not isinstance(raw, dict) or not isinstance(raw.get('labels'), list) or len(raw['labels']) > 12:
        raise ValueError('Model output does not follow labels contract')
    clean = []
    seen = set()
    for item in raw['labels']:
        if not isinstance(item, dict) or item.get('label') not in ALLOWED_LABELS:
            continue
        label = item['label']
        confidence = item.get('confidence')
        evidence = item.get('evidence')
        if (label in seen or type(confidence) not in (int,float) or
                not math.isfinite(confidence) or not 0 <= confidence <= 1 or
                not isinstance(evidence, str) or not (8 <= len(evidence) <= 240)):
            continue
        # A single still cannot prove motion or transition. Abstain.
        if label in {'transition', 'kinetic_typography'}:
            continue
        seen.add(label)
        clean.append({'label': label, 'confidence_uncalibrated': round(float(confidence),3),
                      'evidence': evidence, 'frame_time_seconds': timestamp,
                      'provenance': 'vision_model_unreviewed'})
    return clean


def analyze_reference_v010(video: str | Path, *, provider: VisionProvider | None = None,
                            provider_name: str = 'abstain', threshold: float = .32,
                            max_frames: int = 10,
                            reviewed_annotations: list[dict] | None = None) -> dict:
    """No network requests unless caller explicitly supplies a network provider."""
    report = analyze_reference_v09(video, threshold=threshold, reviewed_annotations=reviewed_annotations)
    duration = float(report['video']['duration_seconds'])
    times = sample_times(report, max_frames=max_frames)
    provider = provider or AbstainProvider()
    snapshots = []
    for t in times:
        try:
            image = extract_jpeg(video, t)
            labels = validate_prediction(provider.classify(image, time_seconds=t), t)
            snapshots.append({'time_seconds': t, 'predictions': labels, 'error': None})
        except Exception as exc:
            # Treat failed inference as abstention, not hallucinated class.
            snapshots.append({'time_seconds': t, 'predictions': [],
                              'error': type(exc).__name__})
    count = sum(len(s['predictions']) for s in snapshots)
    annotations = validate_reviewed_annotations(reviewed_annotations, duration) if reviewed_annotations is not None else []
    report['schema_version'] = 'reference-dna/v0.5'
    report['semantic_vision'] = {
        'mode': provider_name, 'sampled_times_seconds': times, 'frame_observations': snapshots,
        'prediction_count': count,
        'semantic_module_selection_allowed': False,
        'quality_gate_reason': ('Model classifications are single-frame, unreviewed and uncalibrated. '
                                'Do not drive automatic module selection.'),
        'reviewed_annotation_count': len(annotations),
        'evaluation': {'status': 'requires reviewed, interval-aligned predictions',
                       'method': 'evaluate_intervals(label + temporal IoU ≥ 0.5)'},
        'privacy': {'frames_persisted': False, 'reference_audio_reused': False,
                    'network_provider_selected': isinstance(provider,(OllamaVisionProvider,OpenAIVisionProvider))},
    }
    return report
