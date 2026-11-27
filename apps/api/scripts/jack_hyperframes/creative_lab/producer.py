"""Bounded storyboard revision runners. Never authorize publication."""
import copy,hashlib,json,logging,resource,sys,time
from pathlib import Path
from evaluation_contracts import canonical_json,defect_cost,validate_evaluation
DIMENSIONS=("composition","readability","relevance","originality","lighting")
logger=logging.getLogger(__name__)


class ProducerConfigurationError(ValueError): pass
class ProducerBudgetExceeded(RuntimeError): pass
class ProducerStageError(RuntimeError): pass
def gate(report):
    if not isinstance(report,dict): return False
    scores=report.get("scores")
    defects=report.get("defects")
    return (isinstance(scores,dict) and set(scores)==set(DIMENSIONS)
            and all(type(v) is int and 60<=v<=100 for v in scores.values())
            and isinstance(defects,list) and all(isinstance(d,dict) and d.get("severity") in ("medium","low") for d in defects))
def iterate(plan,render,review,revise,validate,output,max_revisions=2):
    if type(max_revisions) is not int or not 0<=max_revisions<=3: raise ValueError("Invalid revision budget")
    output=Path(output)
    output.mkdir(parents=True,exist_ok=False)
    history=[]
    def save(status,**extra):
        result=dict(status=status,history=history,publish_authorized=False,**extra)
        tmp=output/"producer_report.tmp"
        tmp.write_text(json.dumps(result,indent=2))
        tmp.replace(output/"producer_report.json")
        return result
    plan=copy.deepcopy(plan)
    for i in range(max_revisions+1):
        stage="validate"
        try:
            validate(plan)
            attempt=output/f"attempt_{i}"
            stage="render"
            video=render(copy.deepcopy(plan),attempt)
            stage="review"
            report=review(video,attempt,copy.deepcopy(plan))
            passed=gate(report)
            history.append(dict(attempt=i,review=report,passed=passed))
            result=save("visual_gate_pass" if passed else "blocked")
            if passed or i==max_revisions: return result
            stage="revise"
            updated=revise(copy.deepcopy(plan),copy.deepcopy(report))
            stage="validate_revision"
            validate(updated)
            if updated==plan: return save("blocked",reason="unchanged_revision")
            plan=updated
        except Exception as exc:
            return save("blocked",failed_stage=stage,error_type=type(exc).__name__,attempt=i)


def _atomic(path,value):
    tmp=path.with_suffix(path.suffix+".tmp")
    tmp.write_text(json.dumps(value,indent=2))
    tmp.replace(path)


def _attempt_dir(output,index):
    base=output/f"attempt_{index:03d}"
    if not base.exists(): return base
    counter=1
    while (output/f"attempt_{index:03d}_resume_{counter}").exists(): counter+=1
    return output/f"attempt_{index:03d}_resume_{counter}"


def _call_with_retries(callback,args,retries,stage):
    last=None
    for retry in range(retries+1):
        try: return callback(*args),retry
        except Exception as exc:
            last=exc
            logger.warning("JACK %s transient failure retry=%s type=%s",stage,retry,type(exc).__name__)
    raise ProducerStageError(f"{stage} failed after {retries+1} executions: {type(last).__name__}") from last


def _peak_rss_bytes():
    """Normalize ru_maxrss (bytes on macOS, KiB on Linux) to bytes."""
    raw=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return raw if sys.platform=="darwin" else raw*1024


def optimize(plan,render,evaluate,propose,apply,validate,output,*,max_revisions=2,
             transient_retries=1,time_budget_seconds=300,max_peak_rss_bytes=None,resume=True):
    """Run the deterministic evaluator–optimizer and retain the best valid candidate.

    Callbacks are local and explicit. ``render`` receives ``(plan, attempt_dir, scope)``;
    ``evaluate`` receives ``(video, attempt_dir, plan, attempt_id)``. No paid service is
    invoked by this function.
    """
    if type(max_revisions) is not int or not 0<=max_revisions<=3:
        raise ProducerConfigurationError("Revision budget must be between zero and three")
    if type(transient_retries) is not int or not 0<=transient_retries<=3:
        raise ProducerConfigurationError("Transient retry budget must be between zero and three")
    if time_budget_seconds<=0: raise ProducerConfigurationError("Time budget must be positive")
    output=Path(output).resolve();state_path=output/"optimizer_state.json"
    if output.exists() and not resume: raise ProducerConfigurationError("Output exists and resume is disabled")
    output.mkdir(parents=True,exist_ok=True)
    original=copy.deepcopy(plan)
    original_path=output/"original_plan.json"
    if not original_path.exists(): _atomic(original_path,original)
    elif json.loads(original_path.read_text())!=original: raise ProducerConfigurationError("Resume plan differs from immutable original")
    if state_path.exists():
        state=json.loads(state_path.read_text())
        if state.get("terminal"): return state
    else:
        state={"version":1,"status":"render_evaluating","terminal":False,"history":[],"repair_fingerprints":[],
               "best_attempt":None,"best_cost":None,"publish_authorized":False,"human_approval_required":True}
        _atomic(state_path,state)
    deadline=time.monotonic()+time_budget_seconds
    best_plan=copy.deepcopy(original);best_report=None
    if state["best_attempt"] is not None:
        prior=state["history"][state["best_attempt"]]
        best_plan=json.loads(Path(prior["plan_path"]).read_text())
        best_report=json.loads(Path(prior["evaluation_path"]).read_text())
    current=best_plan
    start_index=len(state["history"])
    logger.info("JACK optimizer start revisions=%s prior_attempts=%s",max_revisions,start_index)
    for index in range(start_index,max_revisions+1):
        if time.monotonic()>=deadline: state.update(status="stopped",reason="time_budget_exhausted",terminal=True);break
        if max_peak_rss_bytes is not None and _peak_rss_bytes()>max_peak_rss_bytes:
            state.update(status="stopped",reason="resource_budget_exhausted",terminal=True);break
        validate(copy.deepcopy(current));attempt=_attempt_dir(output,index);attempt.mkdir(parents=True)
        plan_path=attempt/"candidate_plan.json";_atomic(plan_path,current)
        scope=sorted({op.get("scene") for op in state["history"][-1].get("repairs",[]) if op.get("scene") is not None}) if state["history"] else []
        try:
            video,render_retries=_call_with_retries(render,(copy.deepcopy(current),attempt,scope),transient_retries,"render")
            report,evaluate_retries=_call_with_retries(evaluate,(video,attempt,copy.deepcopy(current),f"attempt-{index}"),transient_retries,"evaluate")
        except ProducerStageError as exc:
            state.update(status="blocked",reason="transient_retry_exhausted",failed_stage="render_or_evaluate",
                         error_type=type(exc.__cause__).__name__ if exc.__cause__ else type(exc).__name__,terminal=True)
            _atomic(state_path,state);logger.error("JACK optimizer stopped after transient retries: %s",exc);break
        validate_evaluation(report);evaluation_path=attempt/"rendered_video_evaluation.json"
        if not evaluation_path.exists(): _atomic(evaluation_path,report)
        cost=defect_cost(report);accepted=best_report is None or cost<defect_cost(best_report)
        severe_regression=best_report is not None and (cost[0]>defect_cost(best_report)[0] or any(
            d["severity"]=="critical" for d in report["defects"]))
        if severe_regression: accepted=False
        record={"attempt":index,"attempt_id":report["attempt_id"],"plan_path":str(plan_path),"video_path":str(Path(video).resolve()),
                "evaluation_path":str(evaluation_path.resolve()),"cost":list(cost),"accepted":accepted,
                "severe_regression":severe_regression,"render_retries":render_retries,"evaluate_retries":evaluate_retries,
                "repairs":[],"rollback":False,"scope_requested":scope,"full_final_validation":True}
        if state["history"]:
            previous=state["history"][-1]
            previous_report=json.loads(Path(previous["evaluation_path"]).read_text())
            remaining={item["id"] for item in report["defects"]}
            applied_by_defect={item["defect_id"]:item for item in previous.get("repairs",[])}
            record["resolved_defects"]=[
                {"defect_id":item["id"],"category":item["category"],
                 "actual_correction":applied_by_defect.get(item["id"]),
                 "before_after":{"before":{"present":True,"severity":item["severity"]},
                                  "after":{"present":False}}}
                for item in previous_report["defects"] if item["id"] not in remaining
            ]
        else:
            record["resolved_defects"]=[]
        state["history"].append(record)
        if accepted:
            best_plan=copy.deepcopy(current);best_report=report;state["best_attempt"]=len(state["history"])-1;state["best_cost"]=list(cost)
        else:
            record["rollback"]=True;current=copy.deepcopy(best_plan)
            state.update(status="blocked",reason="severe_regression" if severe_regression else "failed_repair_rolled_back",terminal=True)
            _atomic(state_path,state);break
        if not report["defects"] or not any(d["severity"] in ("critical","high","medium","low") for d in report["defects"]):
            state.update(status="final_awaiting_approval",reason="technical_checks_passed",terminal=True);_atomic(state_path,state);break
        if index==max_revisions:
            state.update(status="blocked",reason="revision_budget_exhausted",terminal=True);_atomic(state_path,state);break
        operations=propose(copy.deepcopy(current),copy.deepcopy(report["defects"]))
        fingerprint=hashlib.sha256(canonical_json(operations).encode()).hexdigest()
        if not operations:
            state.update(status="blocked",reason="no_eligible_repairs",terminal=True);_atomic(state_path,state);break
        if fingerprint in state["repair_fingerprints"]:
            state.update(status="blocked",reason="repeated_or_cyclic_repair",terminal=True);_atomic(state_path,state);break
        state["repair_fingerprints"].append(fingerprint)
        updated,applied=apply(copy.deepcopy(current),copy.deepcopy(operations));validate(copy.deepcopy(updated))
        if updated==current:
            state.update(status="blocked",reason="unchanged_revision",terminal=True);_atomic(state_path,state);break
        record["repairs"]=applied;current=updated;state["status"]="revision_rendering";_atomic(state_path,state)
    if not state.get("terminal"):
        state.update(status="stopped",reason="loop_ended",terminal=True)
    state["publish_authorized"]=False;state["human_approval_required"]=True
    state["original_plan_path"]=str(original_path);state["best_video_path"]=(state["history"][state["best_attempt"]]["video_path"] if state["best_attempt"] is not None else None)
    _atomic(state_path,state);logger.info("JACK optimizer end status=%s attempts=%s",state["status"],len(state["history"]))
    return state
