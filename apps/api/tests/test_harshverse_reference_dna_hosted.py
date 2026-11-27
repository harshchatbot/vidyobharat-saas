import json
import pytest
from unittest.mock import patch
from app.services.harshverse.reference_dna_hosted import (
    GeminiHostedVisionProvider, OpenAIHostedVisionProvider, _parse_object, _post,
)

JPEG = b'\xff\xd8testjpeg'
SAMPLE = {'labels': [{'label': 'chart', 'confidence': 0.83,
                      'evidence': 'An illustrated bar chart appears on screen'}]}


def test_gemini_payload_uses_schema_and_image():
    def fake_post(url, headers, payload, timeout):
        assert ':generateContent' in url
        assert headers['x-goog-api-key'] == 'secret'
        assert payload['generationConfig']['responseMimeType'] == 'application/json'
        assert payload['generationConfig']['responseJsonSchema']['properties']['labels']
        assert payload['contents'][0]['parts'][1]['inline_data']['mime_type'] == 'image/jpeg'
        return {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [
            {'text': json.dumps(SAMPLE)}]}}]}
    with patch('app.services.harshverse.reference_dna_hosted._post', fake_post):
        assert GeminiHostedVisionProvider('gemini-2.5-flash', 'secret').classify(JPEG, time_seconds=1.5) == SAMPLE


def test_openai_payload_uses_responses_strict_schema():
    def fake_post(url, headers, payload, timeout):
        assert url.endswith('/v1/responses')
        assert payload['store'] is False
        assert payload['text']['format']['strict'] is True
        assert payload['input'][0]['content'][1]['type'] == 'input_image'
        assert headers['Authorization'] == 'Bearer secret'
        return {'status': 'completed', 'output': [{'type': 'message', 'content': [
            {'type': 'output_text', 'text': json.dumps(SAMPLE)}]}]}
    with patch('app.services.harshverse.reference_dna_hosted._post', fake_post):
        assert OpenAIHostedVisionProvider('gpt-4.1-mini', 'secret').classify(JPEG, time_seconds=1.5) == SAMPLE


@pytest.mark.parametrize('cls', [GeminiHostedVisionProvider, OpenAIHostedVisionProvider])
def test_reject_bad_model_or_jpeg(cls):
    with pytest.raises(ValueError): cls('model name', 'secret')
    with pytest.raises(ValueError): cls('some-model', '')
    with pytest.raises(ValueError): cls('some-model', 'secret').classify(b'garbage', time_seconds=0)


def test_reject_markdown_fenced_json():
    with pytest.raises(json.JSONDecodeError): _parse_object('```json\n{"labels": []}\n```')


def test_error_response_does_not_leak_provider_body():
    import io
    import urllib.error
    from unittest.mock import patch
    error = urllib.error.HTTPError('https://example.org', 401, 'Unauthorized', {}, io.BytesIO(b'secret provider text'))
    with patch('app.services.harshverse.reference_dna_hosted.urllib.request.urlopen', side_effect=error):
        with pytest.raises(RuntimeError, match='HTTP 401') as exc:
            _post('https://example.org', {}, {}, 30)
        assert 'secret provider text' not in str(exc.value)


def test_abstain_on_incomplete_responses():
    with patch('app.services.harshverse.reference_dna_hosted._post', return_value={'status': 'incomplete'}):
        with pytest.raises(ValueError): OpenAIHostedVisionProvider('gpt-4.1-mini', 'secret').classify(JPEG, time_seconds=0)


def test_gemini_safety_stop_fails_closed():
    with patch('app.services.harshverse.reference_dna_hosted._post',
               return_value={'candidates': [{'finishReason': 'SAFETY', 'content': {'parts': []}}]}):
        with pytest.raises(ValueError): GeminiHostedVisionProvider('gemini-2.5-flash', 'secret').classify(JPEG, time_seconds=0)
