"""Read-only asset selection. No storage writes or automatic license approval."""
from dataclasses import dataclass
import math

@dataclass(frozen=True)
class Asset:
    id: str
    kind: str
    title: str
    tags: tuple[str, ...]
    license: str
    source: str
    approved: bool
    evidence: str
    duration: float | None = None

def existing_audio_assets(repository=None):
    if repository is None:
        from app.services.editor_audio_library import build_audio_library_repository
        repository = build_audio_library_repository()
    return [
        Asset(e.id,e.type,e.title,tuple([e.category,*e.tags]),e.license,
              e.source,e.status=="published",e.evidence_reference,e.duration_seconds)
        for e in repository.list()
    ]

def eligible(asset):
    return (asset.approved and bool(asset.source.strip()) and
            asset.license.strip().lower() not in ("","unknown","unverified","pending") and
            asset.evidence.strip().lower() not in ("","pending","pending-verification"))

def cosine(a,b):
    if len(a)!=len(b) or not a:
        raise ValueError("Embedding dimension mismatch")
    if not all(math.isfinite(v) for v in (*a,*b)):
        raise ValueError("Nonfinite embedding")
    norm=math.sqrt(sum(v*v for v in a)*sum(v*v for v in b))
    return sum(x*y for x,y in zip(a,b))/norm if norm else 0.0

def select_assets(query, assets, embed, *, kind, limit=5, min_score=.35):
    """Injected embedding provider; sends descriptive metadata only, never media or tokens.
    Visual catalog adapters must supply independently approved provenance.
    """
    candidates=[a for a in assets if a.kind==kind and eligible(a)]
    if not candidates:
        return []
    vectors=embed([query]+[" ".join([a.title,*a.tags]) for a in candidates])
    if len(vectors)!=len(candidates)+1:
        raise ValueError("Embedding count mismatch")
    scored=[(cosine(vectors[0],v),a) for v,a in zip(vectors[1:],candidates)]
    return sorted([(s,a) for s,a in scored if s>=min_score],
                  key=lambda p:(-p[0],p[1].id))[:limit]
