"""Opt-in hosted vision adapters for Reference DNA v0.11.

No requests until classify() is called. Never persist frame bytes or API keys.
The prior reference_dna_semantic.validate_prediction remains the final gate.
"""
from __future__ import annotations

import base64
import json
import re
import urllib.error
import urllib.request
from typing import Any

from .reference_dna_semantic import PROMPT, MAX_RESPONSE_BYTES

MODEL_RE = re.compile(r"[A-Za-z0-9._-]{1,100}\Z")
# Constrain classes in model output; backend validator still rejects unsupported values.
LABEL_NAMES = ["presenter", "full_screen_graphics", "split_screen", "kinetic_typography",
               "lower_third", "chart", "calendar", "money_stack", "illustration",
               "b_roll", "transition"]
LABELS_SCHEMA = {
    "type": "object", "properties": {"labels": {"type": "array", "items": {
        "type": "object", "properties": {
            "label": {"type": "string", "enum": LABEL_NAMES},
            "confidence": {"type": "number"},
            "evidence": {"type": "string"}},
        "required": ["label", "confidence", "evidence"], "additionalProperties": False}}},
    "required": ["labels"], "additionalProperties": False,
}
MAX_FRAME_BYTES = 1_500_000


def _check(model: str, api_key: str, frame: bytes | None = None) -> None:
    if not MODEL_RE.fullmatch(model):
        raise ValueError("Invalid model name")
    if not api_key or len(api_key) > 512:
        raise ValueError("Missing/invalid API key")
    if frame is not None and (not frame.startswith(b'\xff\xd8') or len(frame) > MAX_FRAME_BYTES):
        raise ValueError("Invalid/oversize JPEG")


def _post(url: str, headers: dict, payload: dict, timeout: int) -> dict:
    body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    request = urllib.request.Request(url, data=body,
                                     headers={**headers, "Content-Type": "application/json"},
                                     method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        # Avoid echoing provider response/headers, which can contain sensitive data.
        raise RuntimeError(f"Hosted vision request failed: HTTP {exc.code}") from None
    if len(data) > MAX_RESPONSE_BYTES:
        raise ValueError("Provider response too large")
    result = json.loads(data)
    if not isinstance(result, dict):
        raise ValueError("Provider response is not an object")
    return result


def _parse_object(text: str) -> dict:
    if not isinstance(text, str) or len(text.encode('utf-8')) > MAX_RESPONSE_BYTES:
        raise ValueError("Provider JSON text missing/oversize")
    result = json.loads(text)  # No markdown fence stripping or JSON repair.
    if not isinstance(result, dict):
        raise ValueError("Provider JSON must be object")
    return result


class GeminiHostedVisionProvider:
    """Google Gemini generateContent REST API; frame-level structured JSON.

    Uses the generateContent endpoint with responseMimeType + responseJsonSchema.
    The newer Interactions API is distinct; do not mix request formats.
    """
    def __init__(self, model: str, api_key: str, timeout: int = 90):
        _check(model, api_key)
        self.model, self.api_key, self.timeout = model, api_key, timeout

    def classify(self, frame_jpeg: bytes, *, time_seconds: float) -> Any:
        _check(self.model, self.api_key, frame_jpeg)
        payload = {
            "contents": [{"role": "user", "parts": [
                {"text": f"Frame at {time_seconds:.3f}s. {PROMPT}"},
                {"inline_data": {"mime_type": "image/jpeg",
                                 "data": base64.b64encode(frame_jpeg).decode('ascii')}}]}],
            "generationConfig": {"responseMimeType": "application/json",
                                 "responseJsonSchema": LABELS_SCHEMA,
                                 "temperature": 0},
        }
        outer = _post(f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent",
                      {"x-goog-api-key": self.api_key}, payload, self.timeout)
        candidates = outer.get('candidates') or []
        if not candidates or candidates[0].get('finishReason') not in (None, 'STOP'):
            raise ValueError('Gemini did not finish normally')
        parts = candidates[0].get('content', {}).get('parts', [])
        return _parse_object(''.join(part.get('text', '') for part in parts))


class OpenAIHostedVisionProvider:
    """OpenAI Responses API with image input and strict JSON Schema output."""
    def __init__(self, model: str, api_key: str, timeout: int = 90):
        _check(model, api_key)
        self.model, self.api_key, self.timeout = model, api_key, timeout

    def classify(self, frame_jpeg: bytes, *, time_seconds: float) -> Any:
        _check(self.model, self.api_key, frame_jpeg)
        uri = 'data:image/jpeg;base64,' + base64.b64encode(frame_jpeg).decode('ascii')
        payload = {
            'model': self.model,
            'store': False,
            'input': [{'role': 'user', 'content': [
                {'type': 'input_text', 'text': f'Frame at {time_seconds:.3f}s. {PROMPT}'},
                {'type': 'input_image', 'image_url': uri}]}],
            'text': {'format': {'type': 'json_schema', 'name': 'reference_dna_frame',
                                'schema': LABELS_SCHEMA, 'strict': True}},
        }
        outer = _post('https://api.openai.com/v1/responses',
                      {'Authorization': 'Bearer ' + self.api_key}, payload, self.timeout)
        if outer.get('status') not in (None, 'completed'):
            raise ValueError('OpenAI response not complete')
        chunks = []
        for item in outer.get('output', []):
            if item.get('type') == 'message':
                for part in item.get('content', []):
                    if part.get('type') == 'output_text':
                        chunks.append(part.get('text', ''))
        if not chunks:
            raise ValueError('OpenAI response contains no output text')
        return _parse_object(''.join(chunks))
