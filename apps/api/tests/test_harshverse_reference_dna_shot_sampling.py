import pytest
from app.services.harshverse.reference_dna_temporal import plan_windows, build_windows, analyze_temporal


def clip(cuts=None, duration=15.733, **more):
    return {'video': {'duration_seconds': duration},
            'editing_rhythm': {'detected_cut_times_seconds': cuts or [1.667, 4.6, 9.667, 14.467]},
            **more}


def test_five_shots_are_all_sampled_with_budget_five():
    p = plan_windows(clip(), max_windows=5)
    assert p['full_shot_coverage']
    assert len(p['windows']) == 5
    assert p['covered_shot_indices'] == list(range(5))
    assert all(x['kind'] == 'shot_center' for x in p['windows'])
    assert 2 < p['windows'][1]['anchor_seconds'] < 4
    assert 11 < p['windows'][3]['anchor_seconds'] < 13


def test_three_windows_report_missing_shots():
    p = plan_windows(clip(), max_windows=3)
    assert len(p['windows']) == 3
    assert not p['full_shot_coverage']
    assert len(p['uncovered_shot_indices']) == 2


def test_extra_budget_uses_cut_windows():
    p = plan_windows(clip(cuts=[4.0], duration=8.), max_windows=4)
    assert p['full_shot_coverage']
    assert any(x['kind'] == 'cut_boundary' for x in p['windows'])


def test_activity_prioritized_before_cuts():
    report = clip(cuts=[4.], duration=8.,
                  creative_evidence={'visual_activity_events': [{'time_seconds': 3.1}]})
    p = plan_windows(report, max_windows=3)
    assert p['full_shot_coverage']
    assert p['windows'][1]['kind'] == 'visual_activity'


def test_invalid_budget_and_nonfinite_cuts_rejected():
    with pytest.raises(ValueError): plan_windows(clip(), max_windows=0)
    with pytest.raises(ValueError): plan_windows(clip(cuts=[float('nan')]), max_windows=5)


def test_backward_compatible_build_windows():
    w = build_windows(clip(), max_windows=5)
    assert len(w) == 5
    assert all(len(times) == 3 and times == sorted(set(times)) for times in w)


def test_report_contains_coverage_and_remains_gated(monkeypatch):
    from app.services.harshverse import reference_dna_temporal as mod
    monkeypatch.setattr(mod, 'extract_jpeg', lambda *args, **kwargs: b'\xff\xd8fixture')
    output = analyze_temporal('/unused', clip(), max_windows=5)
    t = output['temporal_vision']
    assert t['sampling_coverage']['full_shot_coverage']
    assert len(t['windows']) == 5
    assert t['semantic_module_selection_allowed'] is False
    assert all(x['error'] is None for x in t['windows'])
