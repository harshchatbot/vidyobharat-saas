"""Run-bound estimates and enforcement for the normal JACK faceless CLI.

Prices are operator-supplied USD rates per million units, pinned by dated
source. Context bounds must cover the provider's full input context, including
vision, and speech output rates must cover the provider's audio token billing.
Failed and interrupted calls retain their reservation.

Pricing JSON keys: as_of (ISO date), source (credential-free HTTPS URL),
models (mapping of model IDs to input_usd, output_usd, max_input, max_output).
Use USD per million billable tokens. For speech, include both text input and
audio output prices and a conservative audio-token upper bound. Vision input
must include image tokens. Pricing is supplied by the approving operator.
Preflight values and the local render-time range are planning assumptions.
Use --preflight FILE first and pass the same flags with --approval FILE to
authorize the single run. No approval is generated or recorded implicitly.
"""
from datetime import date
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from faceless_duration import Duration

# These are enforced global call caps, including all creative/SDK-level attempts.
SPEECH = "gpt-4o-mini-tts"
EMBEDDING = "text-embedding-3-small"
SPEECH_MAX_INPUT_TOKENS = 2000
SPEECH_MAX_INPUT_CHARACTERS = 4096


class BudgetError(RuntimeError):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def money(value):
    try:
        result = Decimal(str(value))
        if not result.is_finite() or result < 0:
            raise ValueError
        return result
    except (InvalidOperation, ValueError) as exc:
        raise BudgetError("Invalid USD amount") from exc


def preflight(args):
    path = getattr(args, "pricing_file", None)
    if not path:
        raise BudgetError("A dated --pricing-file is required before paid execution")
    pricing = json.loads(Path(path).read_text())
    try:
        dated = date.fromisoformat(pricing["as_of"])
        source=urlsplit(pricing["source"])
        if dated > date.today() or source.scheme!="https" or not source.hostname or source.username or source.query or source.fragment:
            raise ValueError
        render = not getattr(args, "content_only", False)
        target = getattr(args, "target_duration", None)
        revisions = 2
        limits = {"gpt-4.1-mini": ("llm", 100)}
        if render:
            model = getattr(args, "model", "gpt-4.1-mini")
            limits[model] = ("llm", limits.get(model, ("llm", 0))[1] + 25)
            limits[SPEECH] = ("tts", revisions + 1 if target else 1)
            limits[EMBEDDING] = ("embedding", 8)
        models = {}
        for key, (category, calls) in limits.items():
            rate = pricing["models"][key]
            max_input, max_output = rate["max_input"], rate["max_output"]
            if type(max_input) is not int or type(max_output) is not int or max_input < 1 or max_output < (0 if category == "embedding" else 1):
                raise ValueError
            if category == "tts" and max_input < SPEECH_MAX_INPUT_TOKENS:
                raise ValueError
            models[key] = dict(category=category, calls=calls, max_input=max_input, max_output=max_output,
                               input_usd=str(money(rate["input_usd"])), output_usd=str(money(rate["output_usd"])))
    except (TypeError, AttributeError, KeyError, ValueError) as exc:
        raise BudgetError("Missing or invalid dated pricing or provider bounds") from exc
    if any(models[k]["category"] != "llm" for k in {"gpt-4.1-mini", getattr(args,"model","gpt-4.1-mini")} if k in models):
        raise BudgetError("The renderer model must be a text model")
    ignored = {"pricing_file", "preflight", "approval", "max_budget", "client"}
    # Bind file-backed inputs by content in addition to binding all CLI options.
    config = {k: v for k, v in vars(args).items() if k not in ignored}
    if config.get("music"):
        from approved_selection import authorized_music
        try:
            authorized_music(config.get("approved_assets"),config["music"])
        except ValueError as exc:
            raise BudgetError(str(exc)) from exc
    inputs = {}
    for key in ("approved_assets", "product_manifest", "sfx_manifest", "corroboration", "music", "display_font", "body_font"):
        if config.get(key):
            inputs[key] = hashlib.sha256(Path(config[key]).expanduser().read_bytes()).hexdigest()
    config["inputs_sha256"] = inputs
    if config.get("source"):
        source=Path(config["source"]).expanduser()
        config["source_sha256"]={name:hashlib.sha256((source/name).read_bytes()).hexdigest()
                                 for name in ("script.txt","narration.wav","alignment.json","research.json")
                                 if (source/name).is_file()}
    if getattr(args, "resume", False):
        source = Path(args.output).expanduser()
        config["cache_sha256"] = {name: hashlib.sha256((source / name).read_bytes()).hexdigest()
                                  for name in ("research.json", "research_snapshot.json", "editorial_checkpoint.json") if (source / name).is_file()}
    estimate = sum(cost(rate, rate["max_input"], rate["max_output"]) * rate["calls"] for rate in models.values())
    return dict(version=1, config_sha256=hashlib.sha256(canonical(config).encode()).hexdigest(),
                models=models, pricing_source=pricing["source"], pricing_as_of=str(dated), currency="USD",
                maximum_estimated_usd=str(estimate), requested_budget_usd=str(money(getattr(args,"max_budget", None))),
                creative_revisions=revisions, sdk_retries=0, image_generation_calls=0, video_generation_calls=0,
                tts_estimate_seconds=(target or 45) if render else 0,
                tts_estimate_characters=((sum(Duration(target).bounds)//2 if target else 115)*6) if render else 0,
                expected_local_render_seconds=[3*(target or 45), 20*(target or 45)] if render else [0,0],
                render_time_basis="Planning range at 3–20 wall seconds per output second; host and profile dependent",
                cache_candidates=list(config.get("cache_sha256", {})),
                cache_policy="Research TTL and editorial fingerprint verified at execution")


def cost(rate, inputs, outputs):
    return (money(rate["input_usd"]) * inputs + money(rate["output_usd"]) * outputs) / 1_000_000


def issue(args, path):
    report = dict(preflight(args), run_id=str(uuid4()))
    with Path(path).expanduser().open("x") as handle:
        handle.write(json.dumps(report, indent=2) + "\n")
    return report


class Budget:
    def __init__(self, args):
        path = getattr(args, "approval", None)
        if not path:
            raise BudgetError("Use --preflight FILE, then explicitly approve that run with --approval FILE")
        self.path = Path(path).expanduser().resolve()
        self.report = json.loads(self.path.read_text())
        expected = preflight(args)
        if {k:v for k,v in self.report.items() if k != "run_id"} != expected or not self.report.get("run_id"):
            raise BudgetError("Approval does not match this JACK run configuration and pricing")
        try:
            UUID(self.report["run_id"])
        except (ValueError, TypeError, AttributeError) as exc:
            raise BudgetError("Malformed run approval ID") from exc
        self.limit = money(expected["requested_budget_usd"])
        if self.limit <= 0 or self.limit < money(expected["maximum_estimated_usd"]):
            raise BudgetError("Approved budget is below the maximum estimated exposure")
        self.spent = Decimal(0)
        self.counts = {}
        # Exclusive create makes the approved run single use, including after a crash.
        try:
            with self.path.with_name(self.path.name + "." + self.report["run_id"] + ".used").open("x"):
                pass
        except FileExistsError as exc:
            raise BudgetError("This run approval has already been used") from exc
        self.ledger = self.path.with_name(self.path.name + "." + self.report["run_id"] + ".usage.jsonl")

    def call(self, operation, method, kwargs):
        model = kwargs.get("model")
        rate = self.report["models"].get(model)
        if not rate or rate["category"] != operation:
            raise BudgetError("Unbounded paid operation or model")
        inputs, outputs = rate["max_input"], rate["max_output"]
        if operation == "tts":
            if len(kwargs["input"]) > SPEECH_MAX_INPUT_CHARACTERS:
                raise BudgetError("TTS input exceeds the billable bound")
        if operation == "embedding" or (operation == "llm" and "messages" in kwargs):
            # UTF-8 bytes plus framing give a conservative bound for text-only requests.
            # Vision uses the operator-pinned full context bound instead.
            payload=kwargs.get("input") if operation=="embedding" else kwargs["messages"]
            text_bound=len(json.dumps(kwargs,ensure_ascii=False).encode())
            text_bound+=64*len(payload) if isinstance(payload,list) else 64
            if text_bound>inputs:
                raise BudgetError("Request exceeds the approved input bound")
        if operation == "llm":
            field = "max_output_tokens" if "instructions" in kwargs else "max_completion_tokens"
            kwargs[field] = min(kwargs.get(field, outputs), outputs)
            outputs = kwargs[field]
        reserve = cost(rate, inputs, outputs)
        count = self.counts.get(model, 0)
        if count >= rate["calls"] or self.spent + reserve > self.limit:
            raise BudgetError("Approved JACK budget or call limit exhausted")
        self.counts[model] = count + 1
        self.spent += reserve
        self.write(model, operation, "reserved", reserve)
        response = method(**kwargs)
        usage = getattr(response, "usage", None)
        if usage is not None:
            actual_in = getattr(usage, "input_tokens", getattr(usage, "prompt_tokens", None))
            actual_out = getattr(usage, "output_tokens", getattr(usage, "completion_tokens", 0))
            if type(actual_in) is int and type(actual_out) is int and min(actual_in, actual_out) >= 0:
                actual = cost(rate, actual_in, actual_out)
                self.spent += actual - reserve
                self.write(model, operation, "actual", actual, input_tokens=actual_in, output_tokens=actual_out)
                if actual > reserve:
                    self.spent = self.limit
                    raise BudgetError("Provider usage exceeded its configured bound")
        return response

    def write(self, model, operation, status, amount, **usage):
        with self.ledger.open("a") as handle:
            handle.write(json.dumps(dict(run_id=self.report["run_id"], model=model, operation=operation,
                                         status=status, usd=str(amount), total_usd=str(self.spent), **usage)) + "\n")

    def wrap(self, client):
        def guarded(operation, method):
            return SimpleNamespace(create=lambda **kwargs: self.call(operation, method, kwargs))
        return SimpleNamespace(
            chat=SimpleNamespace(completions=guarded("llm", client.chat.completions.create)),
            responses=guarded("llm", client.responses.create),
            embeddings=guarded("embedding", client.embeddings.create),
            audio=SimpleNamespace(speech=SimpleNamespace(with_streaming_response=guarded(
                "tts", client.audio.speech.with_streaming_response.create))),
        )
