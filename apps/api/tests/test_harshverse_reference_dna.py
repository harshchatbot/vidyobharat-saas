import json
import subprocess
from pathlib import Path
from app.services.harshverse.reference_dna import (
    ReferenceDNAError, _parse_scene_times, _pacing, analyze_reference,
)
import pytest


def test_parse_deduplicates_nearby_cuts():
    log = 'pts_time:0.10\npts_time:1.100\npts_time:1.200\npts_time:4.50\n'
    assert _parse_scene_times(log, 6.0) == [1.1, 4.5]


def test_pacing():
    assert _pacing([0.8, 1.1]) == 'fast'
    assert _pacing([2.0, 3.0]) == 'moderate'
    assert _pacing([4.0, 5.0]) == 'slow'
    assert _pacing([]) == 'unknown'


def test_read_only_contract(tmp_path):
    video = tmp_path / 'reference.mp4'
    video.write_bytes(b'test')
    commands = []
    def fake_runner(args, timeout):
        commands.append(args)
        if args[0] == 'ffprobe':
            return subprocess.CompletedProcess(args, 0, json.dumps({
                'format': {'duration': '10.0'},
                'streams': [{'codec_type': 'video', 'width': 1080, 'height': 1920}],
            }), '')
        return subprocess.CompletedProcess(args, 0, '', 'pts_time:1.500\npts_time:5.000\n')
    result = analyze_reference(video, runner=fake_runner)
    assert result['editing_rhythm']['detected_cut_times_seconds'] == [1.5, 5.0]
    assert result['editing_rhythm']['shot_durations_seconds'] == [1.5, 3.5, 5.0]
    assert result['safety']['reference_media_embedded'] is False
    assert str(video) not in json.dumps(result)
    assert commands[-1][0] == 'ffmpeg'


def test_missing_video(tmp_path):
    with pytest.raises(ReferenceDNAError):
        analyze_reference(tmp_path / 'missing.mp4')


def test_invalid_threshold(tmp_path):
    p = tmp_path / 'x.mp4'
    p.write_bytes(b'a')
    with pytest.raises(ReferenceDNAError):
        analyze_reference(p, threshold=0.01)
