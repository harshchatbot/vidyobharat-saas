import numpy as np
import pytest

from app.services.harshverse.reference_dna_creative import (
    _spatial_profile, _candidate_motion, _shot_evidence, analyze_reference_v08,
    MAX_CREATIVE_FRAMES,
)


def test_constant_frame_does_not_invent_text():
    frame = np.full((90, 60, 3), 170, dtype=np.uint8)
    p = _spatial_profile(frame)
    assert p['graphic_band_candidates'] == []
    assert p['possible_horizontal_boundary'] is None


def test_row_pattern_bands_are_low_confidence():
    frame = np.full((90, 60, 3), 210, dtype=np.uint8)
    frame[36:43, 5:55:3] = 10
    p = _spatial_profile(frame)
    assert all(b['confidence'] == 'low' for b in p['graphic_band_candidates'])


def test_motion_peak_has_evidence_not_effect_name():
    a = np.zeros((8, 8, 3), dtype=np.uint8)
    b = np.full_like(a, 255)
    frames = np.stack([a, a, a, b, b, b])
    t = np.arange(6) / 4
    candidates = _candidate_motion(frames, t, [0.75])
    assert len(candidates) == 1
    assert candidates[0]['candidate_type'] == 'near_detected_cut'
    assert 'zoom' not in str(candidates)


def test_motion_static_no_events():
    f = np.zeros((8, 6, 8, 3), dtype=np.uint8)
    assert _candidate_motion(f, np.arange(8) / 4, []) == []


def test_shot_buckets_are_independent():
    f = np.stack([np.full((10, 10, 3), v, dtype=np.uint8) for v in [0, 0, 255, 255]])
    s = _shot_evidence(f, np.array([.0,.25,.5,.75]), [.5], 1.)
    assert len(s) == 2
    assert s[0]['mean_rgb_8bit'] == [0, 0, 0]
    assert s[1]['mean_rgb_8bit'] == [255, 255, 255]


def test_missing_video():
    with pytest.raises(ValueError):
        analyze_reference_v08('/missing/preview.mp4')


def test_real_silent_video(tmp_path):
    import shutil, subprocess
    if shutil.which('ffmpeg') is None:
        pytest.skip('ffmpeg missing')
    vid = tmp_path / 'ref.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x284:r=10:d=2',
                    '-an', '-c:v', 'mpeg4', '-y', str(vid)], check=True)
    r = analyze_reference_v08(vid)
    assert r['schema_version'] == 'reference-dna/v0.3'
    assert r['creative_evidence']['sampling']['frames'] <= MAX_CREATIVE_FRAMES
    assert r['audio_signals']['has_audio'] is False
    assert r['safety']['reference_frames_reused'] is False
    assert r['creative_evidence']['recognition_capabilities']['font_identity'] == 'not_supported'
