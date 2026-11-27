"""Reference DNA v0.8: bounded, interpretable creative *evidence*.

Does NOT recognize fonts, characters, money stacks, motion graphics by name,
SFX types, or video semantics. No reference frames or audio are persisted.
Read-only offline diagnostic; caller must enforce media ownership authorization.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any
import numpy as np

from .reference_dna import ReferenceDNAError
from .reference_dna_visual import (
    FRAME_WIDTH, FRAME_HEIGHT, _capture, analyze_reference_v07,
)

MAX_CREATIVE_FRAMES = 240
MAX_CREATIVE_FPS = 4.0


def _sample_creative_frames(source: Path, duration: float) -> tuple[np.ndarray, np.ndarray, float]:
    """Bound sampling to 240 frames for 10-minute clips; 4 fps for short reels."""
    fps = min(MAX_CREATIVE_FPS, max(0.4, (MAX_CREATIVE_FRAMES - 2) / duration))
    frame_size = FRAME_WIDTH * FRAME_HEIGHT * 3
    raw = _capture([
        'ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', str(source),
        '-vf', (f'fps={fps:.6f},scale={FRAME_WIDTH}:{FRAME_HEIGHT}:'
                f'force_original_aspect_ratio=decrease:force_divisible_by=2,'
                f'pad={FRAME_WIDTH}:{FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,format=rgb24'),
        '-an', '-sn', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
    ], min(240, max(30, int(duration * 2))), frame_size * MAX_CREATIVE_FRAMES)
    if len(raw) % frame_size:
        raise ReferenceDNAError('Invalid creative-frame payload')
    n = len(raw) // frame_size
    if not 1 <= n <= MAX_CREATIVE_FRAMES:
        raise ReferenceDNAError('No creative frames or excessive samples')
    return (np.frombuffer(raw, np.uint8).reshape(n, FRAME_HEIGHT, FRAME_WIDTH, 3),
            np.arange(n, dtype=np.float32) / fps, fps)


def _spatial_profile(frame: np.ndarray) -> dict[str, Any]:
    """Appearance evidence only. A graphic band can also be clothing/background."""
    f = frame.astype(np.float32) / 255.0
    gray = f[..., 0] * .2126 + f[..., 1] * .7152 + f[..., 2] * .0722
    # spatial differences within image; left-to-right edges are salient for lettering
    xgrad = np.abs(np.diff(gray, axis=1))
    ygrad = np.abs(np.diff(gray, axis=0))
    h, w = gray.shape
    thirds = []
    for start, end in ((0, h//3), (h//3, 2*h//3), (2*h//3, h)):
        thirds.append(round(float(xgrad[start:end].mean()), 4))
    # Strong alternating vertical strokes grouped into short horizontal bands.
    # Label intentionally cautious: text/graphics are NOT classified reliably.
    row_energy = xgrad.mean(axis=1)
    threshold = max(float(np.quantile(row_energy, .85)), .045)
    active = row_energy >= threshold
    runs: list[tuple[int, int]] = []
    start = None
    for i, flag in enumerate(active.tolist() + [False]):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            if 2 <= i-start <= int(h * .22):
                runs.append((start, i))
            start = None
    bands = []
    for a, b in sorted(runs, key=lambda p: -float(row_energy[p[0]:p[1]].mean()))[:3]:
        bands.append({'y_start_norm': round(a/h, 3), 'y_end_norm': round(b/h, 3),
                      'edge_strength': round(float(row_energy[a:b].mean()), 4),
                      'label': 'text_or_graphic_band_candidate', 'confidence': 'low'})
    # A strong horizontal separator is sometimes present in split layouts;
    # disambiguation would require segmentation or a learned classifier.
    boundary = ygrad.mean(axis=1)
    eligible = np.arange(len(boundary))
    eligible = eligible[(eligible >= int(.2*h)) & (eligible < int(.8*h))]
    peak = int(eligible[np.argmax(boundary[eligible])]) if len(eligible) else 0
    strength = float(boundary[peak]) if len(eligible) else 0.0
    baseline = float(np.median(boundary)) + .01
    return {
        'horizontal_edge_density_by_vertical_third': thirds,
        'graphic_band_candidates': bands,
        'possible_horizontal_boundary': (
            {'y_norm': round((peak+1)/h, 3), 'relative_strength': round(strength/baseline, 2),
             'confidence': 'low', 'label': 'possible_layout_divider'}
            if strength > .12 and strength > 3.0 * baseline else None
        ),
    }


def _candidate_motion(frames: np.ndarray, times: np.ndarray, cut_times: list[float]) -> list[dict[str, Any]]:
    """Detect large inter-sample changes, avoid falsely naming cuts as transitions."""
    if len(frames) < 2:
        return []
    f = frames.astype(np.float32) / 255.0
    delta = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2, 3))
    # Robust threshold + absolute floor, suppress static footage jitter.
    median = float(np.median(delta))
    spread = float(np.median(np.abs(delta - median)))
    threshold = max(.10, median + 3.0 * spread)
    peaks = [i for i, v in enumerate(delta) if float(v) >= threshold]
    ranked = sorted(peaks, key=lambda i: -float(delta[i]))
    selected = []
    for i in ranked:
        t = float(times[i+1])
        if any(abs(t - p['time_seconds']) < .40 for p in selected):
            continue
        nearest = min((abs(t-c) for c in cut_times), default=1e6)
        selected.append({
            'time_seconds': round(t, 3), 'change_score': round(float(delta[i]), 4),
            'candidate_type': 'near_detected_cut' if nearest < .5 else 'visual_change_or_motion',
            'confidence': 'medium' if nearest < .5 else 'low',
            'evidence': 'adjacent sampled frames differ; no effect class inferred',
        })
        if len(selected) >= 24:
            break
    return sorted(selected, key=lambda p: p['time_seconds'])


def _shot_evidence(frames: np.ndarray, times: np.ndarray, cuts: list[float], duration: float) -> list[dict[str, Any]]:
    boundaries = [0.0, *cuts, duration]
    results = []
    # cap to avoid unbounded output on highly cut reference
    for index, (a, b) in enumerate(zip(boundaries, boundaries[1:])):
        if index >= 80:
            break
        ids = np.where((times >= a) & (times < b))[0]
        if not len(ids):
            results.append({'shot_index': index+1, 'start_seconds': round(a,3), 'end_seconds': round(b,3),
                            'sample_count': 0, 'appearance_evidence': None})
            continue
        mid = int(ids[len(ids)//2])
        profile = _spatial_profile(frames[mid])
        chunk = frames[ids].astype(np.float32)
        rgb = chunk.mean(axis=(0, 1, 2))
        results.append({
            'shot_index': index+1, 'start_seconds': round(a,3), 'end_seconds': round(b,3),
            'sample_count': len(ids), 'evidence_time_seconds': round(float(times[mid]),3),
            'mean_rgb_8bit': [int(round(float(v))) for v in rgb],
            'appearance_evidence': profile,
        })
    return results


def analyze_reference_v08(path: str | Path, *, threshold: float = .32) -> dict[str, Any]:
    # v0.7 validates duration/size and preserves existing contracts.
    result = analyze_reference_v07(path, threshold=threshold)
    source = Path(path).expanduser().resolve()
    duration = float(result['video']['duration_seconds'])
    frames, times, fps = _sample_creative_frames(source, duration)
    cuts = result['editing_rhythm']['detected_cut_times_seconds']
    shots = _shot_evidence(frames, times, cuts, duration)
    activity = _candidate_motion(frames, times, cuts)
    result.update({
        'schema_version': 'reference-dna/v0.3',
        'analysis_method': result['analysis_method'] + '_plus_spatiotemporal_evidence',
        'creative_evidence': {
            'sampling': {'fps': round(fps, 4), 'frames': len(frames),
                         'max_frames': MAX_CREATIVE_FRAMES,
                         'strategy': 'bounded_temporal_sampling_with_cut_aligned_shot_summaries',
                         'time_resolution_seconds': round(1/fps, 3)},
            'shot_appearance': shots,
            'visual_activity_candidates': activity,
            'recognition_capabilities': {
                'candidate_text_or_graphic_bands': 'low_confidence_visual_proxy',
                'possible_horizontal_layout_dividers': 'low_confidence_visual_proxy',
                'cut_adjacent_visual_changes': 'measured_signal',
                'font_identity': 'not_supported',
                'kinetic_typography_identity': 'not_supported',
                'lower_third_identity': 'not_supported',
                'chart_calendar_money_stack_identity': 'not_supported',
                'transition_effect_type': 'not_supported',
                'person_or_subject_detection': 'not_supported',
                'sfx_source_classification': 'not_supported',
            },
            'disclaimer': 'Visual layout clues are low-confidence proxies, not object or typography recognition.'
        },
        'not_analyzed': [
            'semantic relevance', 'OCR/text content or font identity', 'person/face detection',
            'specific visual effects or graphic modules', 'transition effect type',
            'SFX classification', 'B-roll identity', 'subject tracking',
        ],
    })
    return result
