from __future__ import annotations

import json
import subprocess
from pathlib import Path

from app.services.lipsync_face_service import composite_lipsync_result, crop_face_for_lipsync


def _ffprobe_nb_frames(path: str) -> int:
    raw = subprocess.check_output(
        [
            'ffprobe',
            '-v',
            'error',
            '-show_streams',
            '-print_format',
            'json',
            path,
        ],
        text=True,
    )
    data = json.loads(raw)
    v = next((s for s in (data.get('streams') or []) if s.get('codec_type') == 'video'), None) or {}
    nb = v.get('nb_frames')
    return int(nb) if str(nb or '').isdigit() else 0


def test_crop_and_composite_smoke(tmp_path: Path) -> None:
    # Synthetic clip with no face; crop should fall back to center box and still produce stable outputs.
    src = tmp_path / 'base.mp4'
    subprocess.run(
        [
            'ffmpeg',
            '-y',
            '-v',
            'error',
            '-f',
            'lavfi',
            '-i',
            'testsrc=size=320x240:rate=24',
            '-t',
            '1.0',
            '-pix_fmt',
            'yuv420p',
            str(src),
        ],
        check=True,
        capture_output=True,
    )

    face_crop, track = crop_face_for_lipsync(str(src))
    assert Path(face_crop).exists()
    assert int(track.get('frame_count') or 0) > 0
    assert int(track.get('crop_w') or 0) > 0
    assert int(track.get('crop_h') or 0) > 0

    # Composite the crop back onto the original as a smoke test.
    out = composite_lipsync_result(str(src), str(face_crop), track)
    assert Path(out).exists()

    nb_in = _ffprobe_nb_frames(str(src))
    nb_out = _ffprobe_nb_frames(str(out))
    assert nb_in > 0 and nb_out > 0
    assert nb_in == nb_out

