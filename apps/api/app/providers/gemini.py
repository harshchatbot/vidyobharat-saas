"""
Gemini API provider for script generation, storyboard planning, and quality scoring.
Uses direct Gemini REST calls so runtime does not depend on google.genai package.
"""

import logging
import json
import urllib.request
import urllib.error
from typing import Optional
from app.core.config import get_settings

logger = logging.getLogger(__name__)


class GeminiClient:
    """Wrapper for Google Gemini API interactions."""

    def __init__(self, api_key: Optional[str] = None):
        """Initialize Gemini client with API key."""
        self.api_key = api_key or get_settings().gemini_api_key
        self.base_url = get_settings().gemini_api_base
        self.flash_model = 'gemini-2.0-flash'
        self.vision_model = 'gemini-2.0-flash'

    def generate_text(self, prompt: str, **kwargs) -> dict:
        """
        Generate text using Gemini with the new google.genai library.

        Args:
            prompt: The prompt to send to Gemini
            **kwargs: Additional parameters (temperature, max_tokens, etc.)

        Returns:
            Dict with 'text' key containing the generated content
        """
        try:
            if not self.api_key:
                logger.error('gemini_api_key_not_configured', extra={})
                raise ValueError("Gemini API key not configured. Set GEMINI_API_KEY environment variable.")

            payload = {
                'contents': [{'parts': [{'text': prompt}]}],
                'generationConfig': {
                    'temperature': kwargs.get('temperature', 0.7),
                    'maxOutputTokens': kwargs.get('max_tokens', 2048),
                },
            }
            request = urllib.request.Request(
                url=f'{self.base_url.rstrip("/")}/models/{self.flash_model}:generateContent',
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'x-goog-api-key': str(self.api_key),
                },
                method='POST',
            )
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    raw = response.read().decode('utf-8')
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode('utf-8', errors='ignore')
                raise RuntimeError(f'Gemini API HTTP {exc.code}: {detail[:500]}') from exc
            except urllib.error.URLError as exc:
                raise RuntimeError(f'Gemini API connection failed: {exc.reason}') from exc

            data = json.loads(raw)
            candidates = data.get('candidates') or []
            generated_text = ''
            for candidate in candidates:
                content = candidate.get('content', {})
                parts = content.get('parts') or []
                for part in parts:
                    maybe_text = str(part.get('text') or '').strip()
                    if maybe_text:
                        generated_text = maybe_text
                        break
                if generated_text:
                    break
            if not generated_text:
                raise RuntimeError('Gemini API returned empty text response')

            logger.info(
                'gemini_text_generation_success',
                extra={
                    'prompt_length': len(prompt),
                    'output_length': len(generated_text),
                    'model': self.flash_model,
                },
            )
            return {'text': generated_text, 'status': 'success', 'is_mock': False}

        except ValueError as e:
            # API key not configured
            logger.error('gemini_api_key_error', extra={'error': str(e)})
            raise
        except Exception as e:
            logger.error(
                'gemini_text_generation_failed',
                extra={
                    'error': str(e),
                    'error_type': type(e).__name__,
                    'prompt_sample': prompt[:100] if prompt else '',
                },
            )
            # Re-raise to propagate error instead of silently falling back to mock
            raise

    def analyze_image(self, image_url: str, prompt: str, **kwargs) -> dict:
        """
        Analyze image using Gemini vision.

        Args:
            image_url: URL of image to analyze
            prompt: Analysis prompt
            **kwargs: Additional parameters

        Returns:
            Dict with 'analysis' key
        """
        try:
            if not self.api_key:
                raise ValueError("Gemini API key not configured")

            payload = {
                'contents': [
                    {
                        'parts': [
                            {'text': prompt},
                            {'fileData': {'fileUri': image_url}},
                        ]
                    }
                ],
                'generationConfig': {
                    'temperature': kwargs.get('temperature', 0.5),
                    'maxOutputTokens': kwargs.get('max_tokens', 1024),
                },
            }
            request = urllib.request.Request(
                url=f'{self.base_url.rstrip("/")}/models/{self.vision_model}:generateContent',
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'x-goog-api-key': str(self.api_key),
                },
                method='POST',
            )
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    raw = response.read().decode('utf-8')
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode('utf-8', errors='ignore')
                raise RuntimeError(f'Gemini API HTTP {exc.code}: {detail[:500]}') from exc
            except urllib.error.URLError as exc:
                raise RuntimeError(f'Gemini API connection failed: {exc.reason}') from exc

            data = json.loads(raw)
            candidates = data.get('candidates') or []
            analysis = ''
            for candidate in candidates:
                content = candidate.get('content', {})
                parts = content.get('parts') or []
                for part in parts:
                    maybe_text = str(part.get('text') or '').strip()
                    if maybe_text:
                        analysis = maybe_text
                        break
                if analysis:
                    break

            logger.info('gemini_vision_analysis_success', extra={'prompt_length': len(prompt)})
            return {'analysis': analysis, 'status': 'success', 'is_mock': False}
        except Exception as e:
            logger.error('gemini_vision_analysis_failed', extra={'error': str(e)})
            raise


def get_gemini_client(api_key: Optional[str] = None) -> GeminiClient:
    """Get or create Gemini client instance."""
    return GeminiClient(api_key=api_key)
