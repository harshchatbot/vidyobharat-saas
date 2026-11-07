# HarshVerse — Local backend rendering

Run from the **vidyobharat-saas** repository root on macOS/Linux. This is a backend-only smoke test, not the finished AI Auto Edit workflow. It does not launch Next.js, Redis, Celery or Firebase.

## Requirements

- Python available at `apps/api/.venv/bin/python`
- FFmpeg and ffprobe on PATH (`brew install ffmpeg` on macOS)
- One talking-head presenter video **containing original audio**
- One animation video (already generated and licensed for your use)
- Both videos long enough for the scene timing; HarshVerse V1 accepts 9:16 output up to 60 seconds

## Verify

```bash
cd ~/Downloads/vidyobharat-saas
git switch feature/video-first-auto-edit-v1
git pull --rebase origin feature/video-first-auto-edit-v1
ffmpeg -version
ffprobe -version
PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest -q apps/api/tests/test_harshverse_recipes.py apps/api/tests/test_harshverse_local_runner.py apps/api/tests/test_harshverse_preview_worker.py
```

## Produce an MP4

First use the **demo-only** recipe sequence (presenter hook → split-screen → animated explainer → presenter outro):

```bash
PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/render_harshverse_local.py \
  --presenter "/absolute/path/to/presenter.mp4" \
  --animation "/absolute/path/to/animation.mp4" \
  --output "/absolute/path/to/harshverse-preview.mp4" \
  --demo
```

Input files are not modified. The runner refuses to overwrite an existing output by default. Add `--overwrite` if you deliberately want to replace the output.

For a manually reviewed edit plan, save JSON:

```json
{
  "duration": 12,
  "fps": 30,
  "width": 720,
  "height": 1280,
  "scenes": [
    {"recipe": "presenter_hook", "start": 0, "end": 3},
    {"recipe": "presenter_split", "start": 3, "end": 7, "asset_offset": 0},
    {"recipe": "presenter_outro", "start": 7, "end": 12}
  ]
}
```

Then use `--plan /absolute/path/to/scene_plan.json` instead of `--demo`.

### Current backend capabilities and gaps

- Preserves the original presenter frames and continuous original audio.
- Composites an existing animation clip and exports an MP4 through FFmpeg.
- Validates scene timing and basic media requirements.
- **Not automatic**: `--demo` uses hardcoded timing percentages, not speech semantics.
- No text/SFX/motion-graphic generation yet. V2.1 Creative Director remains review-only and its intents are **not** automatically turned into licensed media assets.
- No browser UI or deployment is necessary for this local test.
- Durable guest preview jobs, Firestore, quotas and Celery are **separate cloud backend paths**, not used by this CLI.

Next quality milestone: take an actual talking-head recording, build an original/licensed animation plate, render the MP4, inspect narration synchronization and visual quality, and improve the editing recipes from observed results.
