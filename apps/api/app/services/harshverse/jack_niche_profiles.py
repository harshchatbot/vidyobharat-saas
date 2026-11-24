"""Editorial configuration independent of the rendering engine."""
from dataclasses import dataclass

AI_TECHNOLOGY = {
    "id": "ai_technology",
    "language": "en",
    "audience": "Global AI enthusiasts, developers, creators and business users",
    "pillars": {
        "tool_discovery": 25, "free_vs_paid": 20, "open_source": 20,
        "news": 15, "automation": 15, "experiments": 5,
    },
    "scene_templates": (
        "product_showcase", "repository_reveal", "comparison",
        "news_explainer", "workflow_demo", "experiment_result",
    ),
    "source_policy": {
        "primary_sources_required": True,
        "verify_pricing_and_license": True,
        "distinguish_demo_from_claim": True,
        "disclose_affiliate_relationships": True,
        "human_publish_approval": True,
    },
    "asset_priority": ("existing_approved", "production_kit", "licensed_external", "generated"),
}

@dataclass(frozen=True)
class TopicCandidate:
    title: str
    pillar: str
    source_urls: tuple[str, ...]
    freshness: float
    usefulness: float
    commercial_intent: float
    visual_potential: float
    evidence_quality: float
    novelty: float

def rank_topics(candidates: list[TopicCandidate]) -> list[tuple[float, TopicCandidate]]:
    """Rank supplied candidates; scores are editorial inputs, not verified facts."""
    ranked = []
    for item in candidates:
        if item.pillar not in AI_TECHNOLOGY["pillars"]:
            raise ValueError("Unknown content pillar")
        values = (item.freshness, item.usefulness, item.commercial_intent,
                  item.visual_potential, item.evidence_quality, item.novelty)
        if not all(0 <= value <= 1 for value in values):
            raise ValueError("Scores must be between zero and one")
        if not item.source_urls or item.evidence_quality < .6:
            continue
        score = sum(v*w for v,w in zip(values,(.15,.25,.15,.15,.20,.10)))
        ranked.append((round(score,4),item))
    return sorted(ranked,key=lambda pair:(-pair[0],pair[1].title.casefold()))
