# RangManch — Reference DNA V0.7 (experimental)

## Architecture and scope

This is an **additive, offline, read-only** extension to V0.6. It does not alter API routes, Celery workers, guest media ownership, Auto Edit, or exports. Entry point: `apps/api/scripts/analyze_reference_dna_v07.py`. Existing V0.6 CLI and module remain unchanged.

`reference_dna.py` (V0.6 cuts) → `reference_dna_visual.py` (bounded FFmpeg frame/audio sampling) → JSON `reference-dna/v0.2`.

### Signals measured

- Cut boundaries, average shot lengths and rough pace: existing thresholded FFmpeg scene-change detector.
- Mean RGB and luminance statistics, saturation, edge-activity proxy, frame-change proxy: samples at **1 fps**, downscaled to **160×284**; not precise color-grading or object identification.
- Mono audio energy (RMS, 90th percentile) and *candidate* brief energy rises at 100-ms intervals. These are **not** reliably identified sound effects, beats, or transitions.

### What is deliberately NOT claimed

No font recognition, typography timing, B-roll labeling, camera-motion classification, transition taxonomy, SFX/music identification, or semantic relevance. These require validated specialist detectors and benchmark evaluation. Hard cuts alone are not a reference style.

### Security and safety

Run only after the existing RangManch ownership and access checks for any guest-uploaded reference. Do **not** expose arbitrary local file paths through HTTP. The tool processes at most 600-second/2-GiB inputs; frame and audio data remain transient in process memory, with no decoded frames or audio samples serialized to JSON. Use a sandboxed worker with resource quotas and subprocess limits before multi-tenant deployment. Statistical palette is an **aggregate** and cannot substitute for creator asset licensing. Do not copy reference media to exports.

### Run on macOS

```bash
cd ~/Downloads/vidyobharat-saas
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest apps/api/tests/test_harshverse_reference_dna*.py -q
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/analyze_reference_dna_v07.py \
  --reference "$HOME/Downloads/AI-Video-Benchmark/ghost-editor/benchmark-auto-edit-v3/clean_timeline.mp4" \
  --output /tmp/harshverse_reference_dna_v07.json
```

Requires FFmpeg/ffprobe and NumPy installed in the API environment (or use a dedicated analysis worker environment). If missing, install compatible NumPy in the environment only after reviewing project dependencies.

### Acceptance criteria for V0.7

1. V0.6 cut times remain consistent.
2. Sample count is positive; RGB values 0–255; JSON includes explicit limitations.
3. Videos without audio result in `has_audio=false` without failure.
4. No raw frames or PCM are present in the output.
5. Compare reference-video results against at least two manually marked-up examples before using signals to direct edits.

Next work: evaluate dedicated, appropriately licensed typography and motion detectors, confidence calibration, and semantic relevance. No UI integration included.
