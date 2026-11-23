import numpy as np
import pytest
from app.services.harshverse.reference_dna_visual import _visual_signals, _audio_signals, analyze_reference_v07


def test_visual_uniform_color():
    frames = np.zeros((3, 20, 30, 3), dtype=np.uint8)
    frames[:, :, :] = [200, 100, 50]
    result = _visual_signals(frames)
    assert result['frame_samples'] == 3
    assert result['mean_rgb_8bit'] == [200, 100, 50]
    assert result['frame_change_proxy_mean'] == 0.0


def test_visual_change():
    frames = np.stack([np.full((20, 30, 3), 50, dtype=np.uint8), np.full((20, 30, 3), 250, dtype=np.uint8)])
    assert _visual_signals(frames)['frame_change_proxy_mean'] > 0.5


def test_empty_audio_no_ffmpeg():
    result = _audio_signals(None, 2, False)
    assert result['has_audio'] is False
    assert result['transient_candidates_seconds'] == []


def test_invalid_reference():
    with pytest.raises(ValueError):
        analyze_reference_v07('/path/does/not/exist.mp4')


def test_media_without_audio(tmp_path):
    import shutil
    import subprocess
    if shutil.which('ffmpeg') is None:
        pytest.skip('FFmpeg unavailable')
    video = tmp_path / 'silent.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x284:r=10:d=2',
                    '-an', '-c:v', 'mpeg4', '-y', str(video)], check=True)
    result = analyze_reference_v07(video)
    assert result['schema_version'] == 'reference-dna/v0.2'
    assert result['audio_signals']['has_audio'] is False
    assert result['visual_signals']['frame_samples'] >= 1
    assert result['safety']['reference_audio_reused'] is False
