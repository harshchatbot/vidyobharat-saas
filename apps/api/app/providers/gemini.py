"""
Gemini API provider for script generation, storyboard planning, and quality scoring.
Uses the new google.genai library (google.generativeai is deprecated).
"""

import logging
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
            import google.genai as genai

            if not self.api_key:
                logger.error('gemini_api_key_not_configured', extra={})
                raise ValueError("Gemini API key not configured. Set GEMINI_API_KEY environment variable.")

            # New google.genai API - create client with API key
            client = genai.Client(api_key=self.api_key)
            
            # Generate content using the new API
            response = client.models.generate_content(
                model=self.flash_model,
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=kwargs.get('temperature', 0.7),
                    max_output_tokens=kwargs.get('max_tokens', 2048),
                ),
            )

            generated_text = response.text if response and hasattr(response, 'text') else str(response)

            logger.info(
                'gemini_text_generation_success',
                extra={
                    'prompt_length': len(prompt),
                    'output_length': len(generated_text) if generated_text else 0,
                    'model': self.flash_model,
                },
            )

            return {
                'text': generated_text,
                'status': 'success',
                'is_mock': False,
            }

        except ImportError as e:
            logger.error('google_genai_not_installed', extra={'error': str(e)})
            raise Exception(
                "google.genai library not installed. Install with: pip install google-genai"
            )
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
            import google.genai as genai

            if not self.api_key:
                raise ValueError("Gemini API key not configured")

            client = genai.Client(api_key=self.api_key)
            
            response = client.models.generate_content(
                model=self.vision_model,
                contents=[prompt, image_url],
                config=genai.types.GenerateContentConfig(
                    temperature=kwargs.get('temperature', 0.5),
                    max_output_tokens=kwargs.get('max_tokens', 1024),
                ),
            )

            logger.info(
                'gemini_vision_analysis_success',
                extra={'prompt_length': len(prompt)},
            )

            return {
                'analysis': response.text if response else '',
                'status': 'success',
                'is_mock': False,
            }

        except Exception as e:
            logger.error('gemini_vision_analysis_failed', extra={'error': str(e)})
            raise


def get_gemini_client(api_key: Optional[str] = None) -> GeminiClient:
    """Get or create Gemini client instance."""
    return GeminiClient(api_key=api_key)
