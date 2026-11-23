from scripts.render_jack_cdc_cinematic_v09 import DURATION, FPS, H, W, ease, render_frame


def test_cinematic_frame_dimensions():
    for timestamp in (0, 2.5, 5.5, 6.95):
        frame = render_frame(timestamp)
        assert frame.size == (W, H)
        assert frame.mode == "RGB"


def test_cinematic_duration_and_easing():
    assert DURATION == 7
    assert FPS == 24
    assert ease(-1) == 0
    assert ease(2) == 1
