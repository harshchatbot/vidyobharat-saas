from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class AvatarCulturalProfile:
    key: str
    nationality: str
    region_bias: list[str] = field(default_factory=list)
    fashion_style: str = ""
    environment_bias: list[str] = field(default_factory=list)
    cultural_profile: str = "generic"


_REGISTRY: dict[str, AvatarCulturalProfile] = {
    "chitrakala": AvatarCulturalProfile(
        key="chitrakala",
        nationality="indian",
        region_bias=["urban_india", "bangalore", "mumbai"],
        fashion_style="modern Indian urban professional",
        environment_bias=[
            "modern Indian cafe with warm interiors",
            "modern Indian apartment living room",
            "Indian office with contemporary interiors",
            "clean upscale Indian urban street",
            "Indian metro lifestyle ambience",
        ],
        cultural_profile="indian_urban",
    ),
    "charulata": AvatarCulturalProfile(
        key="charulata",
        nationality="indian",
        region_bias=["urban_india", "mumbai", "gurgaon"],
        fashion_style="modern Indian urban professional",
        environment_bias=[
            "modern Indian cafe with warm interiors",
            "urban Indian apartment workspace",
            "contemporary Indian office corridor",
            "premium Indian urban street texture",
            "Indian city lifestyle setting",
        ],
        cultural_profile="indian_urban",
    ),
    "shalini": AvatarCulturalProfile(
        key="shalini",
        nationality="indian",
        region_bias=["urban_india", "pune", "bangalore"],
        fashion_style="modern Indian urban professional",
        environment_bias=[
            "modern Indian cafe ambience",
            "stylish Indian apartment interior",
            "Indian co-working office scene",
            "clean Indian urban neighborhood street",
            "Indian metro lifestyle visual tone",
        ],
        cultural_profile="indian_urban",
    ),
}


def resolve_avatar_cultural_profile(
    *,
    avatar_id: str | None,
    avatar_name: str | None = None,
) -> AvatarCulturalProfile | None:
    key_id = str(avatar_id or "").strip().lower()
    key_name = str(avatar_name or "").strip().lower()
    if key_id and key_id in _REGISTRY:
        return _REGISTRY[key_id]
    if key_name and key_name in _REGISTRY:
        return _REGISTRY[key_name]
    return None


def build_indian_urban_grounding_guidance(profile: AvatarCulturalProfile) -> str:
    region_hint = ", ".join(profile.region_bias[:4]) if profile.region_bias else "urban India"
    env_hint = ", ".join(profile.environment_bias[:4]) if profile.environment_bias else "modern Indian urban interiors"
    return (
        "Environment and styling should feel authentically Indian urban lifestyle: "
        "modern Indian apartment interiors, Indian cafe aesthetics, Indian street textures, "
        "Indian urban fashion, natural Indian skin tones, and Indian working professional lifestyle. "
        f"Prefer premium Indian urban contexts such as {region_hint}. "
        f"Use environment cues like {env_hint}. "
        "Keep this subtle, contemporary, and non-stereotypical."
    )

