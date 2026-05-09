"""
Cost calculation for avatar product pipeline.
Handles LTX 2.3, Seedance, and Kling pricing.
"""

from dataclasses import dataclass
from typing import Literal


@dataclass
class VideoModelCost:
    model_key: str  # 'ltx-2.3', 'seedance', 'kling'
    duration_seconds: int
    resolution: str  # '720p', '1080p'
    fps: int
    base_cost_usd: float  # Video generation cost
    tts_cost_usd: float   # Gemini Flash TTS cost
    lipsync_cost_usd: float  # Sync-lipsync cost
    total_cost_usd: float  # All combined
    credits_needed: int  # At $0.01 per credit


class AvatarProductCostService:
    """Calculate cost for avatar product ads using different models."""
    
    # Model pricing constants
    # LTX 2.3: $0.001605 per megapixel
    # Seedance: $0.18 per 5 seconds @ 720p
    # Kling: $0.084/sec (standard) or $0.42/sec (4K)
    # Lip-sync: $3 per minute
    # Gemini Flash TTS: $0.15 per 1000 characters
    
    def __init__(self):
        self.ltx_cost_per_mp = 0.001605
        self.seedance_cost_per_5s_720p = 0.18
        self.kling_standard_cost_per_sec = 0.084
        self.kling_4k_cost_per_sec = 0.42
        self.lipsync_cost_per_minute = 3.0
        self.gemini_tts_cost_per_1k_chars = 0.15
    
    def estimate_ltx_2_3_cost(
        self,
        duration_seconds: int,
        script_length: int = 0,
        include_lipsync: bool = True,
        resolution: str = '720p',
        fps: int = 25,
    ) -> VideoModelCost:
        """Calculate cost for LTX 2.3 text-to-video."""
        
        # LTX 2.3: $0.001605 per megapixel
        # 1280x720 @ 25fps
        width, height = self._get_resolution(resolution)
        pixels_per_second = width * height * fps
        total_pixels = pixels_per_second * duration_seconds
        megapixels = total_pixels / 1_000_000
        video_cost = megapixels * self.ltx_cost_per_mp
        
        # TTS cost (Gemini Flash)
        tts_cost = self._calc_gemini_tts_cost(script_length)
        
        # Lip-sync cost
        lipsync_cost = self._calc_lipsync_cost(duration_seconds) if include_lipsync else 0
        
        total = video_cost + tts_cost + lipsync_cost
        
        return VideoModelCost(
            model_key='ltx-2.3',
            duration_seconds=duration_seconds,
            resolution=resolution,
            fps=fps,
            base_cost_usd=round(video_cost, 3),
            tts_cost_usd=round(tts_cost, 3),
            lipsync_cost_usd=round(lipsync_cost, 3),
            total_cost_usd=round(total, 3),
            credits_needed=int(total * 100),
        )
    
    def estimate_seedance_cost(
        self,
        duration_seconds: int,
        script_length: int = 0,
        include_lipsync: bool = True,
        resolution: str = '720p',
    ) -> VideoModelCost:
        """Calculate cost for Seedance image-to-video."""
        
        # Seedance: $0.18 per 5 seconds @ 720p
        # For other resolutions, use token calculation
        if resolution == '720p':
            video_cost = (duration_seconds / 5) * self.seedance_cost_per_5s_720p
        else:
            # Token-based: tokens = (height × width × fps × duration) / 1024
            # 1 million tokens cost $1.8
            width, height = self._get_resolution(resolution)
            fps = 25
            tokens = (height * width * fps * duration_seconds) / 1024
            video_cost = (tokens / 1_000_000) * 1.8
        
        # TTS cost
        tts_cost = self._calc_gemini_tts_cost(script_length)
        
        # Lip-sync cost
        lipsync_cost = self._calc_lipsync_cost(duration_seconds) if include_lipsync else 0
        
        total = video_cost + tts_cost + lipsync_cost
        
        return VideoModelCost(
            model_key='seedance',
            duration_seconds=duration_seconds,
            resolution=resolution,
            fps=25,
            base_cost_usd=round(video_cost, 3),
            tts_cost_usd=round(tts_cost, 3),
            lipsync_cost_usd=round(lipsync_cost, 3),
            total_cost_usd=round(total, 3),
            credits_needed=int(total * 100),
        )
    
    def estimate_kling_cost(
        self,
        duration_seconds: int,
        script_length: int = 0,
        include_lipsync: bool = True,
        quality: Literal['standard', '4k'] = 'standard',
    ) -> VideoModelCost:
        """Calculate cost for Kling video generation."""
        
        # Kling: $0.084/sec (standard) or $0.42/sec (4K)
        if quality == '4k':
            video_cost = duration_seconds * self.kling_4k_cost_per_sec
            resolution = '4K'
        else:
            video_cost = duration_seconds * self.kling_standard_cost_per_sec
            resolution = '1080p'
        
        # TTS cost
        tts_cost = self._calc_gemini_tts_cost(script_length)
        
        # Lip-sync cost
        lipsync_cost = self._calc_lipsync_cost(duration_seconds) if include_lipsync else 0
        
        total = video_cost + tts_cost + lipsync_cost
        
        return VideoModelCost(
            model_key=f'kling-{quality}',
            duration_seconds=duration_seconds,
            resolution=resolution,
            fps=25,
            base_cost_usd=round(video_cost, 3),
            tts_cost_usd=round(tts_cost, 3),
            lipsync_cost_usd=round(lipsync_cost, 3),
            total_cost_usd=round(total, 3),
            credits_needed=int(total * 100),
        )
    
    def estimate_all_models(
        self,
        duration_seconds: int,
        script_length: int = 0,
        include_lipsync: bool = True,
    ) -> dict[str, VideoModelCost]:
        """Get cost estimates for all available models."""
        
        return {
            'ltx-2.3': self.estimate_ltx_2_3_cost(
                duration_seconds, script_length, include_lipsync
            ),
            'seedance': self.estimate_seedance_cost(
                duration_seconds, script_length, include_lipsync
            ),
            'kling-standard': self.estimate_kling_cost(
                duration_seconds, script_length, include_lipsync, quality='standard'
            ),
            'kling-4k': self.estimate_kling_cost(
                duration_seconds, script_length, include_lipsync, quality='4k'
            ),
        }
    
    def find_cheapest_model(
        self,
        duration_seconds: int,
        script_length: int = 0,
        include_lipsync: bool = True,
    ) -> tuple[str, VideoModelCost]:
        """Find the cheapest model for given parameters."""
        
        estimates = self.estimate_all_models(duration_seconds, script_length, include_lipsync)
        cheapest_key = min(estimates.keys(), key=lambda k: estimates[k].total_cost_usd)
        return cheapest_key, estimates[cheapest_key]
    
    def recommend_model(
        self,
        duration_seconds: int,
        script_length: int = 0,
        user_tier: str = 'starter',  # 'free', 'starter', 'pro', 'premium'
        include_lipsync: bool = True,
    ) -> str:
        """Recommend best model based on user tier and budget."""
        
        estimates = self.estimate_all_models(duration_seconds, script_length, include_lipsync)
        
        if user_tier in ['free', 'starter']:
            # Cheapest option
            return min(estimates.keys(), key=lambda k: estimates[k].total_cost_usd)
        elif user_tier == 'pro':
            # Good balance of quality and cost (prefer Seedance)
            return 'seedance'
        else:  # premium
            # Best quality (Kling 4K)
            return 'kling-4k'
    
    # PRIVATE HELPERS
    
    def _calc_gemini_tts_cost(self, script_length: int) -> float:
        """Calculate Gemini Flash TTS cost at $0.15 per 1000 characters."""
        if script_length == 0:
            return 0
        cost = (script_length / 1000) * self.gemini_tts_cost_per_1k_chars
        return round(cost, 4)
    
    def _calc_lipsync_cost(self, duration_seconds: int) -> float:
        """Calculate lip-sync cost at $3 per minute."""
        if duration_seconds == 0:
            return 0
        minutes = duration_seconds / 60
        cost = minutes * self.lipsync_cost_per_minute
        return round(cost, 3)
    
    def _get_resolution(self, resolution: str) -> tuple[int, int]:
        """Convert resolution string to (width, height)."""
        matrix = {
            '360p': (640, 360),
            '480p': (854, 480),
            '720p': (1280, 720),
            '1080p': (1920, 1080),
            '4K': (3840, 2160),
        }
        return matrix.get(resolution.upper(), (1280, 720))