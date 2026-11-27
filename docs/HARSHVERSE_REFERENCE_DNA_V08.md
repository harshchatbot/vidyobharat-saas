# Reference DNA V0.8 — Creative Evidence

## Purpose
This additive module extends the existing Reference DNA V0.7 signal analyzer. It collects bounded spatiotemporal evidence that a later vision-model classifier / Creative Director can use to analyze reference editing **without copying source media or assuming effect identities**.

## Integration
- Entrypoint: `app.services.harshverse.reference_dna_creative.analyze_reference_v08(path, threshold=0.32)`.
- CLI: `apps/api/scripts/analyze_reference_dna_v08.py --reference VIDEO --output /tmp/ref_v08.json`.
- Existing V0.6/V0.7 methods and interfaces remain unchanged.
- Output: `reference-dna/v0.3`, with all existing editing-rhythm, visual-signals, and audio-signals plus `creative_evidence`.
- `creative_evidence.shot_appearance`: timestamps, sampled color, graphical edge-band candidates, and potential horizontal separators per detected shot.
- `visual_activity_candidates`: timestamps of high frame differences, tagged near known cuts vs elsewhere.
- Text/graphic bands, layout dividers are **low-confidence proxies**, not real typography/person/chart detection. Never use these to automatically select a semantic animation.

## Sampling and limitations
- Uses FFmpeg at up to 4 fps, 160×284 RGB frames, capped at 240 frames total. Cut-aligned summaries use FFmpeg's cut time grid; the frames themselves are regularly sampled. Sampling is approximate at ~0.25 s for short clips and much coarser for long clips.
- Audio still uses V0.7 transient energy, which cannot identify sound effects or music.
- An embedded reference's **media/audio is not stored in the JSON**. This does not mean the local process never decodes it: frames are held transiently in RAM for analysis.
- Output is evidence, not editing instructions. The Creative Director must combine it with grounded narration and module permissions, never copy a reference's protected imagery/music.
- No API route or UI changes; no user-accessible endpoint added. Before an API deployment, enforce existing per-user media ownership, upload quotas, size/duration limits, and background job budget.

## Validation

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest \
  apps/api/tests/test_harshverse_reference_dna.py \
  apps/api/tests/test_harshverse_reference_dna_visual.py \
  apps/api/tests/test_harshverse_reference_dna_creative.py -q
```

### Roadmap
1. Collect real edited reference clips with manually annotated cuts, text boxes, camera/presenter areas, SFX, and transitions (use own or authorized media).
2. Add a separate opt-in vision model that can identify elements with confidence/evidence, benchmark against annotations, and use a no-decision fallback.
3. Connect validated style blueprint to the AI Creative Director only after quality evaluation.
