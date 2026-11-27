from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest

from approved_selection import VISUAL, approved_candidates, automatic_music, authorized_music
from content_intelligence import cached_request, corroboration_sources, independently_supported, trends, verify
from faceless_duration import Duration, runtime
from paid_budget import Budget, BudgetError, issue


@pytest.mark.parametrize("target,nominal", [(30,75),(45,112),(60,150),(90,225)])
def test_duration_contract(target, nominal):
    timing=Duration(target)
    assert timing.bounds[0]<=nominal<=timing.bounds[1]
    timing.check(runtime(target-.35))
    timing.check(target-max(1,target*.04)+.01)
    with pytest.raises(ValueError,match="mismatch"):
        timing.check(target+max(1,target*.04)+.01)
    assert timing.adjust("word "*nominal,target*1.2).bounds[1]<timing.bounds[1]


def test_cache_expiry_corruption_and_rate_limit(tmp_path,monkeypatch):
    import time
    current=[1000]
    monkeypatch.setattr(time,"time",lambda:current[0])
    observed=[]
    def fetch(url):
        observed.append(url)
        if len(observed)==4:
            raise HTTPError(url,429,"rate limited",{},None)
        return {"version":len(observed)}
    cached=cached_request(fetch,tmp_path,ttl=10)
    assert cached("url")==cached("url")=={"version":1}
    current[0]+=11
    assert cached("url")=={"version":2}
    next(tmp_path.glob("*.json")).write_text("corrupt")
    assert cached("url")=={"version":3}
    current[0]+=11
    with pytest.raises(HTTPError):
        cached("url")
    assert len(observed)==4


def test_discussion_duplicates_and_stale_records():
    now=datetime(2026,11,25,tzinfo=timezone.utc)
    instant=now.timestamp()-1
    source={"name":"owner/product","id":1,"stars":10}
    def fetch(url):
        if "algolia" in url:
            return {"hits":[dict(title="Product discussion",objectID=k,created_at_i=ts,url=link)
                            for k,ts,link in [("1",instant,"https://example.test/item?src=one"),
                                               ("2",instant,"https://example.test/item?src=two"),
                                               ("3",instant-40*86400,"https://example.test/old")]]}
        raise HTTPError(url,429,"slow down",{},None)
    report=trends([source],fetch,now,use_env_cache=False)
    assert len(report["discussions"])==1
    assert report["signals"][0]["http_status"]==429
    assert report["signals"][0]["status"]=="search_snapshot"


def provenance(owner,quote,role="independent",original=None,url=None):
    url=url or f"https://{owner}.example.test/review"
    return dict(owner=owner,original_publisher=owner,source_type=role,
                original_url=original or url,url=url,quote=quote)


def test_corroboration_requires_distinct_original_ownership():
    primary=provenance("maker","The test finished in 30 seconds on a specific configuration.","primary")
    independent=provenance("lab","Results: elapsed time was half a minute under the same configuration.")
    assert independently_supported([primary,independent])
    assert not independently_supported([primary,{**independent,"original_publisher":"MAKER"}])
    assert not independently_supported([primary,{**independent,"quote":primary["quote"]}])
    assert not independently_supported([primary,{**independent,"original_url":primary["url"]}])
    assert not independently_supported([primary,{**independent,"source_type":"community"}])


@pytest.mark.parametrize("mode,passed",[("same_owner",False),("independent",True),("invalid_id",False),("contradiction",False)])
def test_atomic_gate_enforces_independence_and_final_ids(mode,passed):
    primary=provenance("maker","The benchmark reports 30 seconds.","primary")
    supporting=provenance("lab","Our elapsed time measurement was half a minute.")
    if mode=="same_owner":
        supporting["original_publisher"]="maker"
    sources=[{**entry,"id":i+1,"description":entry["quote"]} for i,entry in enumerate([primary,supporting])]
    draft={"segments":[{"text":"The benchmark finished in 30 seconds.","source_ids":[1,2]}]}
    def structured(client,prompt,payload,schema,check):
        keys=list(payload["segments"][0]["passages"])
        if "claims" in schema["properties"]["segments"]["items"]["properties"]:
            row=dict(index=0,claims=[dict(text=draft["segments"][0]["text"],
                                         verdict="uncertain" if mode=="contradiction" else "supported",
                                         evidence_ids=keys if mode!="invalid_id" else ["bad"],requires_independent=True)])
        else:
            row=dict(index=0,verdict="supported",evidence_ids=keys,reason="Fixture")
        value={"segments":[row]}
        check(value)
        return value
    assert verify(None,structured,draft,sources)["passed"] is passed


def test_curated_source_expiry(tmp_path):
    manifest=tmp_path/"research.json"
    now=datetime(2026,11,25,tzinfo=timezone.utc)
    record=provenance("lab","A real independently tested result.")
    record.update(fetched_at="2026-11-24T23:00:00+00:00",published_at="2026-11-10T00:00:00+00:00",
                  name="Lab",excerpt=record["quote"])
    manifest.write_text(json.dumps({"sources":[record]}))
    assert corroboration_sources(manifest,5,3601,now)[0]["id"]==6
    assert corroboration_sources(manifest,5,3599,now)==[]


def test_approved_fixture_assets_fail_closed(tmp_path):
    library=tmp_path/"library"
    library.mkdir()
    image=library/"image.png"
    image.write_bytes(b"fixture")
    (tmp_path/"outside.png").write_bytes(b"fixture")
    (library/"symlink.png").symlink_to(tmp_path/"outside.png")
    music=library/"tone.wav"
    music.write_bytes(b"original music")
    item=dict(kind="illustration", approved=True, source="Original", evidence="Fixture",
              license="CC0-1.0",path=image.name,sha256=hashlib.sha256(image.read_bytes()).hexdigest())
    bed=dict(item,kind="music",instrumental=True,path=music.name,sha256=hashlib.sha256(music.read_bytes()).hexdigest(),
             tags=["ambient"],bpm=82)
    manifest=library/"approved.json"
    manifest.write_text(json.dumps({"assets":{"good":item,"unapproved":dict(item,approved=False),
        "bad_checksum":dict(item,sha256="0"*64),"missing":dict(item,path="missing.png"),
        "traversal":dict(item,path="../outside.png"),"unsafe":dict(item,path="symlink.png"),
        "invalid_license":dict(item,license="unknown"),"bed":bed}}))
    assert set(approved_candidates(manifest,VISUAL))=={"good"}
    assert automatic_music(manifest,[],"short introduction",6)["id"]=="bed"
    assert automatic_music(None,[],"short introduction",6) is None
    assert authorized_music(manifest,music)["id"]=="bed"
    with pytest.raises(ValueError,match="approved instrumental"):
        authorized_music(manifest,image)


def budget_args(tmp_path, **options):
    rate={"max_input":10000,"max_output":1000,"input_usd":"1","output_usd":"2"}
    pricing=tmp_path/"pricing.json"
    pricing.write_text(json.dumps({"as_of":"2025-01-01","source":"https://operator.example.test/pricing",
                                  "models":{"gpt-4.1-mini":rate}}))
    return SimpleNamespace(**dict(dict(pricing_file=str(pricing),topic="fixture",content_only=True,
                            max_budget="2",output=str(tmp_path/"unused"),approval=None),**options))


def test_budget_bound_to_run_and_config_and_records_actual(tmp_path):
    args=budget_args(tmp_path)
    args.approval=str(tmp_path/"approval.json")
    issue(args,args.approval)
    with pytest.raises(BudgetError,match="configuration"):
        Budget(SimpleNamespace(**dict(vars(args),topic="changed")))
    budget=Budget(args)
    received=[]
    def call(**kwargs):
        received.append(kwargs)
        return SimpleNamespace(usage=SimpleNamespace(prompt_tokens=10,completion_tokens=2))
    budget.call("llm",call,{"model":"gpt-4.1-mini"})
    assert received[0]["max_completion_tokens"]==1000
    assert budget.spent==Decimal("0.000014")
    assert [json.loads(line)["status"] for line in budget.ledger.read_text().splitlines()]==["reserved","actual"]
    with pytest.raises(BudgetError,match="already been used"):
        Budget(args)


def test_budget_no_approval_underfunded_and_retry_accounting(tmp_path):
    args=budget_args(tmp_path,max_budget="0.01")
    with pytest.raises(BudgetError,match="explicitly approve"):
        Budget(args)
    args.approval=str(tmp_path/"underfunded.json")
    issue(args,args.approval)
    with pytest.raises(BudgetError,match="below"):
        Budget(args)
    args.max_budget="2"
    args.approval=str(tmp_path/"approved.json")
    issue(args,args.approval)
    budget=Budget(args)
    def provider_failure(**kwargs):
        raise TimeoutError
    with pytest.raises(TimeoutError):
        budget.call("llm",provider_failure,{"model":"gpt-4.1-mini"})
    assert budget.spent==Decimal("0.012")
    budget.counts["gpt-4.1-mini"]=100
    with pytest.raises(BudgetError,match="exhausted"):
        budget.call("llm",provider_failure,{"model":"gpt-4.1-mini"})
    with pytest.raises(BudgetError,match="Unbounded"):
        budget.call("llm",provider_failure,{"model":"unpriced"})


def test_tts_budget_accepts_documented_token_bound_and_enforces_character_limit(tmp_path):
    args=budget_args(tmp_path,content_only=False,target_duration=30,max_budget="10")
    pricing=Path(args.pricing_file)
    rates=json.loads(pricing.read_text())
    rates["models"].update({"gpt-4o-mini-tts":dict(rates["models"]["gpt-4.1-mini"],max_input=2000),
                            "text-embedding-3-small":dict(rates["models"]["gpt-4.1-mini"],max_output=0)})
    pricing.write_text(json.dumps(rates))
    args.approval=str(tmp_path/"tts.json")
    issue(args,args.approval)
    budget=Budget(args)
    with pytest.raises(BudgetError,match="TTS input"):
        budget.call("tts",lambda **kwargs: None,{"model":"gpt-4o-mini-tts","input":"x"*4097})


def test_normal_cli_reverifies_before_bounded_duration_resynthesis(tmp_path, monkeypatch):
    import content_intelligence
    import run_faceless

    args=budget_args(tmp_path,content_only=False,target_duration=30,max_budget="10",research_ttl=3600,
                     resume=False,no_resource_cta=True,model="gpt-4.1-mini",workspace=str(tmp_path))
    pricing=Path(args.pricing_file)
    rates=json.loads(pricing.read_text())
    rates["models"].update({"gpt-4o-mini-tts":dict(rates["models"]["gpt-4.1-mini"]),
                            "text-embedding-3-small":dict(rates["models"]["gpt-4.1-mini"],max_output=0)})
    pricing.write_text(json.dumps(rates))
    args.approval=str(tmp_path/"run.json")
    issue(args,args.approval)

    def draft(count):
        cta="Save it today."
        body=" ".join(f"word{i}" for i in range(count-6))
        return {"segments":[{"text":"A useful example.","source_ids":[]},
                            {"text":body,"source_ids":[1]},{"text":cta,"source_ids":[]}]}
    events=[]
    state={"last":None}
    monkeypatch.setattr(content_intelligence,"plan",lambda *args:{"fixture":True})
    monkeypatch.setattr(content_intelligence,"trends",lambda *args,**kwargs: {})
    def verify_fake(client, structured, value, sources):
        events.append(("verified",sum(len(segment["text"].split()) for segment in value["segments"])))
        return {"passed":True}
    monkeypatch.setattr(content_intelligence,"verify",verify_fake)

    def structured(client,prompt,data,schema,check=None):
        if "search queries" in prompt:
            return {"queries":["fixture"]}
        result=draft(68 if "Revise to" in prompt else 75)
        if check:
            check(result)
        return result
    monkeypatch.setattr(run_faceless,"structured",structured)

    def request(url):
        return {"items":[dict(full_name=f"org/repo{i}",html_url=f"https://github.com/org/repo{i}",
                              description="Source",license={"spdx_id":"MIT"},updated_at="2026-11-25",
                              stargazers_count=1,forks_count=0,pushed_at="2026-11-25") for i in range(3)]} if "/search/" in url else {"content":"dGVzdA==","html_url":"https://github.com/org/repo/readme"}
    monkeypatch.setattr(run_faceless,"request",request)

    class FakeSpeech:
        def __enter__(self):
            return self
        def __exit__(self,*exc):
            return False
        def stream_to_file(self,path):
            path.write_bytes(b"wav")

    def speech(**kwargs):
        state["last"]=kwargs["input"]
        events.append(("tts",len(kwargs["input"].split())))
        return FakeSpeech()
    def client_factory(**options):
        assert options=={"max_retries":0}
        calls=SimpleNamespace(create=lambda **kw:pytest.fail("Unexpected paid request"))
        return SimpleNamespace(chat=SimpleNamespace(completions=calls),responses=calls,embeddings=calls,
                               audio=SimpleNamespace(speech=SimpleNamespace(with_streaming_response=SimpleNamespace(create=speech))))
    def ffmpeg(command,**kwargs):
        Path(command[-1]).write_bytes(b"wav")
    monkeypatch.setattr(run_faceless.subprocess,"run",ffmpeg)
    def measure(path):
        return {"format":{"duration":33 if Path(path).name=="narration-attempt-0.wav" else 29.65}}
    def aligner_factory(*args,**kwargs):
        def transcribe(*args,**kwargs):
            words=[SimpleNamespace(word=word,start=i*.4,end=i*.4+.3) for i,word in enumerate(state["last"].split())]
            return [SimpleNamespace(words=words)],None
        return SimpleNamespace(transcribe=transcribe)
    def render_fake(args):
        source=Path(args.source)
        assert (source/"narration.wav").exists()
        assert (source/"script.txt").read_text()==state["last"]
        events.append(("render",len(state["last"].split())))
    run_faceless.run(args,client_factory=client_factory,aligner_factory=aligner_factory,render=render_fake,probe=measure)
    assert events==[("verified",75),("verified",75),("tts",75),("verified",68),("tts",68),("render",68)]
    report=json.loads((Path(args.source)/"duration_report.json").read_text())
    assert len(report["attempts"])==2
    assert report["final_seconds"]==29.65
