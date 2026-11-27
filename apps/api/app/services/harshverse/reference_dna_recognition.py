"""Reference DNA v0.9: conservative local recognition + externally reviewed evidence.

No remote calls, no raw frame persistence, no copyrighted media reuse.
Optional OpenCV Haar face detection measures likely presenter presence, not identity.
Candidate typography is a heuristic and NEVER asserted as confirmed text.
Semantic labels require reviewed external annotations with explicit provenance.
Caller must authorize input media; this diagnostic must not be exposed to arbitrary paths.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any
import json
import math
import numpy as np

from .reference_dna_creative import analyze_reference_v08, _sample_creative_frames

LABELS = frozenset({
    'presenter', 'full_screen_graphics', 'split_screen', 'kinetic_typography',
    'lower_third', 'chart', 'calendar', 'money_stack', 'illustration',
    'b_roll', 'transition', 'unknown',
})
MAX_ANNOTATIONS = 256


def _optional_face_regions(frame: np.ndarray) -> list[list[float]]:
    """Return normalized rectangles if cv2 and its built-in face cascade are present."""
    try:
        import cv2  # optional dependency, never required for local baseline
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        cascade = cv2.CascadeClassifier(cascade_path)
        if cascade.empty():
            return []
        gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
        faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5,
                                         minSize=(max(20, frame.shape[1] // 10), 20))
        h, w = frame.shape[:2]
        return [[round(x/w, 3), round(y/h, 3), round(fw/w, 3), round(fh/h, 3)]
                for x, y, fw, fh in faces[:4]]
    except (ImportError, AttributeError, ValueError):
        return []


def _frame_evidence(frame: np.ndarray, time: float) -> dict[str, Any]:
    """Measured image hints, not object-recognition claims."""
    f = frame.astype(np.float32) / 255.0
    gray = .2126*f[..., 0]+.7152*f[..., 1]+.0722*f[..., 2]
    h, w = gray.shape
    gx = np.abs(np.diff(gray, axis=1))
    region_density = [float(gx[a:b].mean()) for a,b in ((0,h//3),(h//3,2*h//3),(2*h//3,h))]
    # Text-like line candidate: horizontal region with dense alternating strokes.
    # Deliberately abstain if evidence is weak or could be textured clothing.
    row_strength = gx.mean(axis=1)
    active = row_strength > max(.055, float(np.quantile(row_strength, .90)))
    band_rows = int(active.sum())
    faces = _optional_face_regions(frame)
    return {
        'time_seconds': round(float(time), 3),
        'face_region_candidates': faces,
        'face_detector': 'opencv_haar_optional' if faces else 'no_face_evidence',
        'edge_density_by_vertical_third': [round(v, 4) for v in region_density],
        'text_like_stroke_rows': band_rows,
        'text_like_candidate': bool(band_rows >= 3 and float(row_strength.max()) > .085),
    }


def _aggregate_shot(frames: np.ndarray, times: np.ndarray, a: float, b: float) -> dict[str, Any]:
    ids = np.where((times >= a) & (times < b))[0]
    if not len(ids):
        return {'start_seconds': round(a, 3), 'end_seconds': round(b, 3),
                'observations': 0, 'candidate_labels': [], 'layout': 'unknown'}
    # Cap observations per shot; repeated frames reduce false positives.
    selected = np.unique(np.linspace(ids[0], ids[-1], min(len(ids), 12)).astype(int))
    samples = [_frame_evidence(frames[k], float(times[k])) for k in selected]
    face_ratio = sum(bool(s['face_region_candidates']) for s in samples) / len(samples)
    stroke_ratio = sum(s['text_like_candidate'] for s in samples) / len(samples)
    candidates = []
    if face_ratio >= .6 and len(samples) >= 2:
        candidates.append({'label':'presenter', 'confidence':round(min(.78, .38 + .4*face_ratio), 2),
                           'origin':'local_face_detector', 'evidence':'face-like region recurs across sampled frames'})
    if stroke_ratio >= .6 and len(samples) >= 2:
        candidates.append({'label':'unknown', 'hypothesis':'possible_typography',
                           'confidence':round(min(.44, .18 + .25*stroke_ratio), 2),
                           'origin':'pixel_heuristic', 'evidence':'repeated dense horizontal stroke regions; not verified as text'})
    return {'start_seconds':round(a,3), 'end_seconds':round(b,3),
            'observations':len(samples), 'candidate_labels':candidates,
            'layout':'presenter_candidate' if face_ratio >= .6 else 'unknown',
            'sample_times_seconds':[s['time_seconds'] for s in samples],
            'face_presence_ratio':round(face_ratio,3), 'stroke_candidate_ratio':round(stroke_ratio,3)}


def validate_reviewed_annotations(annotations: Any, duration: float) -> list[dict[str, Any]]:
    """Accept reviewed annotation records, never arbitrary generated JS or paths."""
    if not isinstance(annotations, list) or len(annotations) > MAX_ANNOTATIONS:
        raise ValueError('annotations must be a bounded list')
    clean = []
    for a in annotations:
        if not isinstance(a, dict) or a.get('label') not in LABELS:
            raise ValueError('Unknown annotation label')
        start, end = a.get('start_seconds'), a.get('end_seconds')
        if not all(type(v) in (int,float) and math.isfinite(v) for v in (start,end)):
            raise ValueError('Invalid annotation times')
        if not 0 <= start < end <= duration + .025:
            raise ValueError('Annotation outside video')
        if a.get('reviewed_by') not in ('human', 'verified_benchmark'):
            raise ValueError('Only explicitly reviewed annotations accepted')
        clean.append({'label':a['label'], 'start_seconds':round(float(start),3),
                      'end_seconds':round(float(end),3), 'reviewed_by':a['reviewed_by']})
    return clean


def evaluate_intervals(predictions: list[dict[str, Any]], ground_truth: list[dict[str, Any]],
                       iou_threshold: float = .5) -> dict[str, Any]:
    """One-to-one exact-label temporal IoU matching; prevents duplicate TP inflation."""
    if not 0 < iou_threshold <= 1:
        raise ValueError('Bad IoU threshold')
    matches = []
    for pi,p in enumerate(predictions):
        for gi,g in enumerate(ground_truth):
            if p.get('label') != g.get('label'):
                continue
            overlap = max(0, min(p['end_seconds'],g['end_seconds']) - max(p['start_seconds'],g['start_seconds']))
            union = max(p['end_seconds'],g['end_seconds']) - min(p['start_seconds'],g['start_seconds'])
            if union and overlap / union >= iou_threshold:
                matches.append((overlap/union,pi,gi))
    seen_p,seen_g = set(),set()
    for _,pi,gi in sorted(matches,reverse=True):
        if pi not in seen_p and gi not in seen_g:
            seen_p.add(pi);seen_g.add(gi)
    tp=len(seen_p);fp=len(predictions)-tp;fn=len(ground_truth)-tp
    return {'true_positive':tp,'false_positive':fp,'false_negative':fn,
            'precision':round(tp/(tp+fp),3) if tp+fp else None,
            'recall':round(tp/(tp+fn),3) if tp+fn else None,
            'temporal_iou_threshold':iou_threshold}


def analyze_reference_v09(path: str | Path, *, threshold: float = .32,
                          reviewed_annotations: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    result=analyze_reference_v08(path, threshold=threshold)
    duration=float(result['video']['duration_seconds'])
    frames,times,fps=_sample_creative_frames(Path(path).expanduser().resolve(),duration)
    cuts=result['editing_rhythm']['detected_cut_times_seconds']
    boundaries=[0.,*cuts,duration]
    shots=[_aggregate_shot(frames,times,a,b) for a,b in zip(boundaries,boundaries[1:])][:80]
    annotations=validate_reviewed_annotations(reviewed_annotations, duration) if reviewed_annotations is not None else []
    result['schema_version']='reference-dna/v0.4'
    result['creative_recognition']={
        'mode':'local_evidence_with_optional_reviewed_annotations',
        'local_capabilities':{'face_like_region':'optional_opencv_haar',
                              'text_like_regions':'heuristic_not_recognition',
                              'specific_animation_recognition':'not_supported',
                              'transition_effect_recognition':'not_supported'},
        'shot_candidates':shots,
        'reviewed_annotations':annotations,
        'quality_gate':{'semantic_module_selection_allowed':False,
                        'reason':'Do not map unverified pixel heuristics to animation names; reviewed dataset and calibrated model required'},
        'privacy':{'frames_persisted':False,'reference_audio_copied':False,'reference_content_reused':False},
    }
    return result
