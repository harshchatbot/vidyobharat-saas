import numpy as np
import pytest
from app.services.harshverse.reference_dna_recognition import (
    _frame_evidence,_aggregate_shot,validate_reviewed_annotations,evaluate_intervals,analyze_reference_v09,
)

def test_blank_no_false_text():
    a=_frame_evidence(np.full((90,60,3),190,dtype=np.uint8), 1.0)
    assert not a['text_like_candidate']

def test_empty_shot_abstains():
    a=_aggregate_shot(np.zeros((2,90,60,3),dtype=np.uint8),np.array([0.,.25]),1.,2.)
    assert a['layout']=='unknown' and not a['candidate_labels']

def test_reject_unreviewed_labels():
    with pytest.raises(ValueError):
        validate_reviewed_annotations([{'label':'money_stack','start_seconds':1,'end_seconds':2,'reviewed_by':'ai'}],4)

def test_reject_invented_class():
    with pytest.raises(ValueError):
        validate_reviewed_annotations([{'label':'super_effect','start_seconds':1,'end_seconds':2,'reviewed_by':'human'}],4)

def test_reject_out_of_range():
    with pytest.raises(ValueError):
        validate_reviewed_annotations([{'label':'chart','start_seconds':2,'end_seconds':7,'reviewed_by':'human'}],4)

def test_valid_reviewed():
    assert validate_reviewed_annotations([{'label':'calendar','start_seconds':1.,'end_seconds':2.,'reviewed_by':'human'}],4)[0]['label']=='calendar'

def test_eval_exact_label_matching():
    truth=[{'label':'chart','start_seconds':0.,'end_seconds':2.}]
    preds=[{'label':'chart','start_seconds':0.,'end_seconds':2.}, {'label':'chart','start_seconds':0.,'end_seconds':2.}]
    r=evaluate_intervals(preds,truth)
    assert (r['true_positive'],r['false_positive'],r['false_negative'])==(1,1,0)

def test_eval_abstention():
    r=evaluate_intervals([], [{'label':'presenter','start_seconds':0.,'end_seconds':1.}])
    assert r['recall']==0 and r['precision'] is None

def test_real_video_no_claims(tmp_path):
    import subprocess
    p=tmp_path/'test.mp4'
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=white:s=160x284:r=10:d=2','-an','-c:v','mpeg4','-y',str(p)],check=True)
    report=analyze_reference_v09(p)
    assert report['schema_version']=='reference-dna/v0.4'
    assert not report['creative_recognition']['quality_gate']['semantic_module_selection_allowed']
    assert report['creative_recognition']['privacy']['frames_persisted'] is False
    assert not any(s['layout']=='full_screen_graphics' for s in report['creative_recognition']['shot_candidates'])
