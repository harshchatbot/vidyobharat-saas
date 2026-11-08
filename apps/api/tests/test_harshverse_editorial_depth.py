"""HarshVerse reference-quality editorial typography/matte contract tests.

The reference video is not used in unit tests, copied into the repo, or
treated as a source of audio or graphics.
"""
from pathlib import Path
import subprocess

import pytest
from PIL import Image

from app.services.harshverse.layered_type import (
    choose_speech_keyword, make_editorial_title_layers,
    build_editorial_intro_filter, render_editorial_intro,
)
from app.services.harshverse.person_matte import build_person_matte


def test_title_uses_a_genuinely_spoken_keyword_not_a_generated_claim():
    assert choose_speech_keyword([
        "Have", "you", "ever", "wondered", "how", "ChatGPT", "understands",
        "your", "questions"
    ]) == "CHATGPT"
    assert choose_speech_keyword(["The", "workflow", "moves", "data"]) == "WORKFLOW"


def test_safe_title_layers_have_separate_alphas(tmp_path):
    back, front = make_editorial_title_layers(tmp_path, "CHATGPT")
    with Image.open(back) as rear, Image.open(front) as badge:
        assert rear.size == badge.size == (720, 1280)
        assert rear.mode == badge.mode == "RGBA"
        assert rear.getpixel((710, 1200))[3] == 0
        assert badge.getpixel((710, 1200))[3] == 0
    with pytest.raises(ValueError):
        make_editorial_title_layers(tmp_path, "{\\drawtext:injected}")


def test_true_subject_occlusion_has_explicit_alphamerge():
    graph = build_editorial_intro_filter(matte=True,start=.2,end=2.25)
    assert "split[base][personbase]" in graph
    assert "[3:v]scale=720:1280" in graph
    assert "alphamerge[personalpha]" in graph
    assert "[backtitle][personalpha]overlay=" in graph
    assert "[depth][2:v]overlay=" in graph


def test_no_person_mask_never_claims_behind_text():
    graph = build_editorial_intro_filter(matte=False,start=.2,end=2.25)
    assert "alphamerge" not in graph
    assert "split[base][personbase]" not in graph
    assert "null[depth]" in graph


def test_editorial_intro_render_reports_actual_mask_mode(monkeypatch,tmp_path):
    source = tmp_path/"speaker.mp4"
    source.write_bytes(b"video-fixture")
    matte = tmp_path/"person.mkv"
    matte.write_bytes(b"mask-fixture")
    output = tmp_path/"layered.mp4"
    def fake_run(command, **kwargs):
        assert "-filter_complex" in command
        assert "[3:v]" in command[command.index("-filter_complex")+1]
        assert command[command.index("-c:a")+1] == "copy"
        output.write_bytes(b"rendered-video")
        return subprocess.CompletedProcess(command, 0)
    monkeypatch.setattr(
        "app.services.harshverse.layered_type.subprocess.run",fake_run
    )
    result = render_editorial_intro(
        source,output,headline="CHATGPT",duration=15.733,matte=matte
    )
    assert result.mode == "subject_matte_occlusion"
    assert result.headline == "CHATGPT"
    assert result.path.is_file()


def test_model_missing_fails_closed_instead_of_faking_depth(tmp_path):
    video=tmp_path/"video.mp4"
    video.write_bytes(b"fixture")
    with pytest.raises(FileNotFoundError):
        build_person_matte(
            video,tmp_path/"missing.tflite",tmp_path/"person.mkv"
        )


def test_selfie_segmenter_accepts_one_foreground_confidence_mask():
    import numpy as np
    from types import SimpleNamespace
    from app.services.harshverse.person_matte import _extract_person_confidence

    mask = np.array([[.02, .94], [.75, .12]], dtype=np.float32)
    result = SimpleNamespace(confidence_masks=[SimpleNamespace(numpy_view=lambda: mask)])
    person = _extract_person_confidence(result)
    assert person.shape == (2, 2)
    assert float(person[0, 1]) == pytest.approx(.94)
    assert float(person[1, 0]) == pytest.approx(.75)


def test_two_class_confidence_masks_use_person_index_one():
    import numpy as np
    from types import SimpleNamespace
    from app.services.harshverse.person_matte import _extract_person_confidence

    bg = np.full((2, 2), .9, dtype=np.float32)
    fg = np.full((2, 2), .1, dtype=np.float32)
    result = SimpleNamespace(confidence_masks=[
        SimpleNamespace(numpy_view=lambda: bg),
        SimpleNamespace(numpy_view=lambda: fg),
    ])
    assert np.allclose(_extract_person_confidence(result), fg)


def test_person_matte_rejects_absent_or_malformed_confidence_masks():
    import numpy as np
    from types import SimpleNamespace
    from app.services.harshverse.person_matte import _extract_person_confidence

    with pytest.raises(RuntimeError, match="expected 1"):
        _extract_person_confidence(SimpleNamespace(confidence_masks=[]))
    with pytest.raises(RuntimeError, match="nonempty 2D"):
        _extract_person_confidence(SimpleNamespace(confidence_masks=[
            SimpleNamespace(numpy_view=lambda: np.array([.1, .8]))
        ]))
    with pytest.raises(RuntimeError, match="Invalid person confidence"):
        _extract_person_confidence(SimpleNamespace(confidence_masks=[
            SimpleNamespace(numpy_view=lambda: np.array([[float("nan")]]))
        ]))


@pytest.mark.parametrize("shape", [(5, 6), (5, 6, 1)])
def test_mediapipe_person_confidence_accepts_grayscale_and_vec32f1(shape):
    import numpy as np
    from types import SimpleNamespace
    from app.services.harshverse.person_matte import _extract_person_confidence

    arr = np.full(shape, .72, dtype=np.float32)
    segmentation = SimpleNamespace(
        confidence_masks=[SimpleNamespace(numpy_view=lambda: arr)]
    )
    person = _extract_person_confidence(segmentation)
    assert person.shape == (5, 6)
    assert np.allclose(person, .72)


def test_packed_two_channel_confidence_selects_foreground():
    import numpy as np
    from types import SimpleNamespace
    from app.services.harshverse.person_matte import _extract_person_confidence

    packed = np.zeros((5, 6, 2), dtype=np.float32)
    packed[..., 0] = .8
    packed[..., 1] = .2
    segmentation = SimpleNamespace(
        confidence_masks=[SimpleNamespace(numpy_view=lambda: packed)]
    )
    assert np.allclose(_extract_person_confidence(segmentation), .2)


@pytest.mark.parametrize("shape", [(1, 5, 6), (5, 6, 3), (5, 6, 4)])
def test_ambiguous_person_confidence_layout_fails_closed(shape):
    import numpy as np
    from types import SimpleNamespace
    from app.services.harshverse.person_matte import _extract_person_confidence

    arr = np.ones(shape, dtype=np.float32)
    segmentation = SimpleNamespace(
        confidence_masks=[SimpleNamespace(numpy_view=lambda: arr)]
    )
    with pytest.raises(RuntimeError, match="Unsupported person confidence mask shape"):
        _extract_person_confidence(segmentation)
