import json
import subprocess
import pytest
from app.services.harshverse.reference_dna_semantic import (
    validate_prediction, sample_times, extract_jpeg, analyze_reference_v010, FixtureProvider,
    OllamaVisionProvider, AbstainProvider,
)


def test_validation_abstains_on_unknown_and_single_frame_motion():
    labels=validate_prediction({'labels':[
        {'label':'money_stack','confidence':.76,'evidence':'visible stacked currency illustration'},
        {'label':'kinetic_typography','confidence':.9,'evidence':'looks like changing headline'},
        {'label':'transition','confidence':.9,'evidence':'moving scene supposedly'},
        {'label':'invented','confidence':1.,'evidence':'something magical'}]},1.25)
    assert [p['label'] for p in labels]==['money_stack']
    assert labels[0]['provenance']=='vision_model_unreviewed'


def test_untrusted_model_confidence_rejected():
    labels=validate_prediction({'labels':[
        {'label':'chart','confidence':float('nan'),'evidence':'visible chart line'},
        {'label':'chart','confidence':True,'evidence':'visible chart line'},
        {'label':'chart','confidence':1.3,'evidence':'visible chart line'},
        {'label':'chart','confidence':.7,'evidence':'a chart graphic is visible'}]},0.5)
    assert len(labels)==1


def test_duplicate_labels_dropped():
    clean=validate_prediction({'labels':[
        {'label':'presenter','confidence':.7,'evidence':'person on camera'},
        {'label':'presenter','confidence':.9,'evidence':'same presenter'}]},0.)
    assert len(clean)==1


def test_bad_provider_response_rejected():
    with pytest.raises(ValueError): validate_prediction({'incorrect':[]},0)
    with pytest.raises(ValueError): validate_prediction({'labels':[{}]*13},0)


def test_sample_times_bounded_and_near_cuts():
    report={'video':{'duration_seconds':12},'editing_rhythm':{'detected_cut_times_seconds':[4,8]}}
    times=sample_times(report,max_frames=6)
    assert len(times)<=6 and all(0<=t<12 for t in times)
    assert any(abs(t-3.88)<.01 for t in times) or any(abs(t-4.12)<.01 for t in times)


def test_reject_invalid_frame_budget():
    report={'video':{'duration_seconds':12},'editing_rhythm':{'detected_cut_times_seconds':[]}}
    with pytest.raises(ValueError): sample_times(report,max_frames=0)
    with pytest.raises(ValueError): sample_times(report,max_frames=100)


def test_local_model_name_validation():
    with pytest.raises(ValueError): OllamaVisionProvider('model name with spaces')
    with pytest.raises(ValueError): OllamaVisionProvider('ok',port=0)


def test_fixture_is_offline():
    result=FixtureProvider({'1.500':{'labels':[{'label':'chart','confidence':.8,'evidence':'bar chart present'}]}}).classify(b'jpeg',time_seconds=1.5)
    assert result['labels'][0]['label']=='chart'


def test_real_video_offline_abstain(tmp_path):
    path=tmp_path/'video.mp4'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i',
                    'color=c=white:s=160x284:r=8:d=2', '-an','-c:v','mpeg4','-y',str(path)],check=True)
    assert extract_jpeg(path,1.0).startswith(b'\xff\xd8')
    result=analyze_reference_v010(path,max_frames=3)
    info=result['semantic_vision']
    assert result['schema_version']=='reference-dna/v0.5'
    assert info['prediction_count']==0
    assert info['semantic_module_selection_allowed'] is False
    assert info['privacy']['frames_persisted'] is False
    assert len(info['frame_observations'])>=1


def test_fixture_predictions_are_advisory(tmp_path):
    path=tmp_path/'video.mp4'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i',
                    'color=c=white:s=160x284:r=8:d=2', '-an','-c:v','mpeg4','-y',str(path)],check=True)
    fixture=FixtureProvider({'1.000':{'labels':[{'label':'calendar','confidence':.8,
                                             'evidence':'calendar date grid is visible'}]}})
    result=analyze_reference_v010(path,provider=fixture,provider_name='fixture')
    info=result['semantic_vision']
    assert info['prediction_count']==1
    assert info['semantic_module_selection_allowed'] is False
    assert info['frame_observations'][0]['predictions'][0]['label']=='calendar'
