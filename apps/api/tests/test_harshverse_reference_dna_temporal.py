import pytest
from app.services.harshverse.reference_dna_temporal import (
    validate_temporal, build_windows, analyze_temporal,
    OpenAITemporalProvider, GeminiTemporalProvider,
)


@pytest.fixture
def base():
    return {'video': {'duration_seconds': 6.},
            'editing_rhythm': {'detected_cut_times_seconds': [2.,4.]}}


def obs(label='kinetic_typography', et=None):
    return {'label': label, 'start_seconds': 1.8, 'end_seconds': 2.2,
            'evidence_times_seconds': et if et is not None else [1.8, 2.2],
            'confidence': .8, 'evidence': 'Text grows between these two visible reference frames'}


def test_windows_stay_within_video(base):
    windows = build_windows(base, max_windows=4)
    assert 1 <= len(windows) <= 4
    assert all(len(t) == 3 and 0 <= min(t) < max(t) < 6 for t in windows)


def test_multilabel_and_temporal_motion():
    raw = {'observations': [obs(), obs('presenter')]}
    assert len(validate_temporal(raw, [1.8,2.,2.2], duration=6)) == 2


def test_motion_requires_two_evidence_frames():
    assert validate_temporal({'observations': [obs(et=[2.])]}, [1.8,2.,2.2], duration=6) == []


def test_unknown_timestamps_are_rejected():
    assert validate_temporal({'observations': [obs(et=[1.8, 2.199])]}, [1.8,2.,2.2], duration=6) == []


def test_bad_confidence_is_rejected():
    candidate = obs(); candidate['confidence'] = 7
    assert validate_temporal({'observations': [candidate]}, [1.8,2.,2.2], duration=6) == []


def test_invalid_contract_fails():
    with pytest.raises(ValueError):
        validate_temporal({'labels': []}, [1.8,2.,2.2], duration=6)


def test_no_frames_embedded_and_auto_selection_off(base, monkeypatch):
    from app.services.harshverse import reference_dna_temporal as temporal
    monkeypatch.setattr(temporal, 'extract_jpeg', lambda *a, **kw: b'\xff\xd8mock')
    result = analyze_temporal('/unused.mp4', base, max_windows=2)
    assert result['temporal_vision']['semantic_module_selection_allowed'] is False
    assert result['temporal_vision']['observation_count'] == 0
    assert result['schema_version'] == 'reference-dna/v0.6'


def test_provider_error_isolated(base, monkeypatch):
    from app.services.harshverse import reference_dna_temporal as temporal
    monkeypatch.setattr(temporal, 'extract_jpeg', lambda *a, **kw: b'\xff\xd8mock')
    class Broken:
        def classify_window(self, frames):
            raise RuntimeError('provider problem')
    result = analyze_temporal('/unused.mp4', base, provider=Broken(), max_windows=1)
    assert result['temporal_vision']['windows'][0]['error'] == 'RuntimeError'


def test_openai_multi_image_payload(monkeypatch):
    from app.services.harshverse import reference_dna_temporal as temporal
    recorded = {}
    def fake_post(url, headers, payload, timeout):
        recorded.update(payload)
        return {'status':'completed','output':[{'type':'message','content':[
            {'type':'output_text','text':'{"observations":[]}'}]}]}
    monkeypatch.setattr(temporal, '_post', fake_post)
    provider = OpenAITemporalProvider('gpt-4.1-mini','test-key')
    assert provider.classify_window([(1.,b'\xff\xd8aaa'),(1.5,b'\xff\xd8bbb')]) == {'observations': []}
    assert sum(p['type']=='input_image' for p in recorded['input'][0]['content']) == 2
    assert recorded['store'] is False


def test_gemini_multi_image_payload(monkeypatch):
    from app.services.harshverse import reference_dna_temporal as temporal
    recorded = {}
    def fake_post(url, headers, payload, timeout):
        recorded.update(payload)
        return {'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'{"observations":[]}'}]}}]}
    monkeypatch.setattr(temporal, '_post', fake_post)
    provider = GeminiTemporalProvider('gemini-2.5-flash','test-key')
    assert provider.classify_window([(1.,b'\xff\xd8aaa'),(1.5,b'\xff\xd8bbb')]) == {'observations': []}
    assert sum('inline_data' in p for p in recorded['contents'][0]['parts']) == 2
