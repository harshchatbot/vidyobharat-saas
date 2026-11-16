# Illustrated V3.3 - AI Auto-Director

Local topic -> OpenAI director -> strict V3.2 validation -> Chromium/FFmpeg preview.

- Review only, never publish automatically.
- No hardcoded storyboard fallback; one repair attempt then fail closed.
- Fixed 8 beats / 600 frames for V3.2 compatibility.
- No Celery, frontend integration, or production rights clearance yet.

## Pull and test

From repo root:

    git stash push -m backup-v33 -- .gitignore
    git pull --ff-only origin feature/video-first-auto-edit-v1
    git stash pop
    PYTHONPATH=apps/api apps/api/.venv/bin/python -m pytest apps/api/tests/test_illustrated_v30.py apps/api/tests/test_illustrated_v32.py apps/api/tests/test_illustrated_v33.py -q

## Generate storyboard only

    PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/illustrated_v30/auto_direct_v33.py --topic 'Create an original 20-second illustrated voiceless reel about why creators should improve their first three seconds.' --output-dir "$HOME/Downloads/RangManch-V33-Plan" --plan-only

## Generate and render

    PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/illustrated_v30/auto_direct_v33.py --topic 'Create an original 20-second illustrated voiceless reel about why creators should improve their first three seconds.' --output-dir "$HOME/Downloads/RangManch-V33-Render" --chromium '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

    open "$HOME/Downloads/RangManch-V33-Render/illustrated_v33_preview.mp4"

Use new empty output directories each run. Requires the OPENAI_API_KEY in apps/api/.env or environment, without printing it.

Review storyboard JSON and report JSON beside preview MP4. Publishing remains blocked. AI validation and preview quality must be evaluated manually.

## Remaining before faceless MVP

- More flexible story arcs and beat times; typed structured output contract
- Visual text clipping and semantic QA over varied subjects
- Celery queue, quotas, storage, retries and cloud operational guards
- Actual assets rights enforcement on export and content review gates
- UI job initiation, status, approval and export integration
