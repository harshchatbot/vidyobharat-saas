# Reference DNA V0.9: Conservative creative recognition baseline

## Deliverable

This is a *measurement and evaluation* milestone, not a trained object recognizer. It extends V0.8 without changing RangManch routes, Auto Edit/Celery tasks, asset policies, or existing JSON keys.

- `creative_recognition.shot_candidates`: sampled shot intervals, recurring face-like evidence when OpenCV's bundled Haar cascade is available, and low-confidence text-like stroke hints.
- `creative_recognition.reviewed_annotations`: optional human-reviewed labels; unreviewed or invented labels fail closed.
- `evaluate_intervals`: exact-class temporal IoU-based precision/recall; duplicates can't count as extra true positives.
- `creative_recognition.quality_gate.semantic_module_selection_allowed`: **false** until a semantic model is separately evaluated on annotated footage.
- Media is decoded in memory; no raw frame or audio export. Inputs must be authorized by the calling RangManch service. The local CLI is for trusted files.

## Run

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest apps/api/tests/test_harshverse_reference_dna_recognition.py -q
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/analyze_reference_dna_v09.py \
  --reference "$HOME/Downloads/AI-Video-Benchmark/ghost-editor/benchmark-auto-edit-v3/clean_timeline.mp4" \
  --output /tmp/harshverse_reference_dna_v09.json
```

Optional reviewed annotations file is a JSON array with `label`, `start_seconds`, `end_seconds`, `reviewed_by: human|verified_benchmark`. Allowed labels: presenter, full_screen_graphics, split_screen, kinetic_typography, lower_third, chart, calendar, money_stack, illustration, b_roll, transition, unknown. For real validation, annotate multiple professional reference clips and use the evaluation helper on independently generated predictions. Annotation records are *ground truth*, not model predictions.

## Next before claiming actual recognition

1. Build a consented, licensed evaluation set with human-labelled temporal intervals and hold out some videos from development.
2. Add an optional, sandboxed vision-model adapter that returns approved labels + evidence timestamps + confidence. Reject ungrounded output; do not send private videos to outside AI services without user consent.
3. Calibrate thresholds and report per-class precision/recall, false positives and abstention rate. Set specific quality gates before enabling any automatic effect selection.
4. Link verified reference style preferences to the narration-driven Creative Director without copying source music, illustrations, frames, footage or text.

Optional OpenCV (`cv2`) improves face-like region evidence but is not mandatory. Haar detections do not identify people or conclusively prove presenter footage. Pixel stroke patterns do not identify actual text or fonts. No API key is needed.
