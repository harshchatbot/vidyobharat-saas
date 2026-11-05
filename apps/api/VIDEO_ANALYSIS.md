# RangManch Video Analysis Engine V2

This endpoint produces **evidence**, not editing decisions. It is separate from the
existing Auto Edit planner and does not alter the user's timeline or media.

## Call

`POST /api/editor/media/{media_id}/analyze?style=elegant`

- Same guest-session, owner-scoped media access as existing transcription
- Requires cookie and `X-RangManch-Editor-CSRF: 1` header
- Accepts video only, up to 100 MB and 65 seconds
- Returns a versioned `VideoAnalysisReport` schema 2.0 JSON object
- Also available via **Auto Edit → Analyze video → Inspect/Download JSON V2** in the local UI
- No LLM, no generation of creative edits and no production deployment yet

## Fields and meaning

| JSON field | Evidence | Source |
| --- | --- | --- |
| `media` | dimensions, ratio, fps, duration, audio presence | ffprobe |
| `speech.words` | original word-level transcript and timestamps (unaltered) | existing Faster-Whisper endpoint |
| `speech.segments` | punctuation- and pause-grouped utterances, stable IDs and source-word indices | deterministic grouping |
| `audio.timing_quality` | conflicts between word intervals and measured low-energy silence, with review flags | conservative cross-check |
| `audio.safe_cut_candidates` | conservative source-video cut intervals with 0.15s padding; **not auto-approved cuts** | silence + transcript guardrails |
| `audio.silence_intervals` | -35dB silences lasting >=0.4s | ffmpeg silencedetect |
| `audio.speech_pause_intervals` | gaps >=0.65s between recognized words (not proven silence) | timestamp gaps |
| `visual.face_samples` | largest detected face box, normalized 0–1, sampled every second | YuNet (optional) |
| `visual.scene_changes_seconds` | hard scene cuts at low sampling FPS | ffmpeg scene filter |
| `editing` | selected style, allowed styles/effects and editor guardrails | versioned V1 capabilities |
| `warnings` | unavailable or degraded analysis | per-stage exceptions |

Every analyzer has explicit `complete`, `unavailable`, `no_speech`, `no_audio`
or `no_faces` status as appropriate. An empty list never implies that the
analyzer ran successfully; inspect its status first. All event times refer to
**the original uploaded recording**, not the edited timeline.

## Optional YuNet setup

The code requires an approved local ONNX file (not downloaded automatically).
Review the OpenCV Zoo YuNet model license, origin, and weight use before using
it commercially. Obtain the `face_detection_yunet_2023mar.onnx` file from the
official [opencv_zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)
repository and configure:

```bash
export RANGMANCH_YUNET_MODEL_PATH=/absolute/path/to/face_detection_yunet_2023mar.onnx
```

The installed `opencv-python-headless` dependency supplies OpenCV's YuNet
inference API. With no configured model or on inference failure, the report
sets `visual.face_status = unavailable` and `face_samples = []`.
**Never claim face tracking is operational without verifying the model.**

## Local verification

In `apps/api` (with dependencies installed and your local guest backend set up):

```bash
python -m pytest tests/test_video_analysis_service.py -q
```

In `apps/web`:

```bash
npm run build
npm run dev
```

Open `http://localhost:3000/editor`, upload a short video, open **Auto Edit**,
select **Analyze video** and download the JSON. Test three cases:
1. Voice-only talking head; confirm words, silences and face status.
2. Multiple cuts; confirm scene timestamps line up with frames.
3. No-audio video; confirm `no_audio`, `no_speech`, no fabricated words.

The existing Auto Edit pipeline is **not automatically changed** by analysis
results. Feeding the report into a creative LLM is deliberately a separate
later milestone.

## Resource / production considerations

The current implementation runs analysis synchronously in the authenticated
request; it reuses the existing STT route, then downloads the source for
audio/visual analysis. This can cause two reads of the same media. It is
intended for short local V1 validation only. Before production enablement:
move it to a bounded background worker, cache reports by media digest and
schema version, enforce per-user quotas/concurrency, and benchmark CPU/RAM
alongside existing export and STT containers. Fail safely when analysis can't
run.

## V2 timestamp and cut safety

- Measured silence is an **audio-energy threshold**, not a ground truth speech label.
- Whisper timing is **estimated**, not millisecond-exact. Overlap >=0.12 seconds produces a conflict record; original timestamps remain unchanged.
- Segments are deterministic *utterance groups* based on punctuation, pauses (>=0.55 seconds) and optional native Faster-Whisper segment boundaries. There are no arbitrary 20-word breaks. Small fragments and dangling conjunctions are joined where safe. This is not an LLM rewrite or guaranteed semantic parsing.
- A safe-cut **candidate** requires >=0.60 seconds of detected silence, speech on both sides, no word touching the gap with a 0.15s buffer, and a remaining >=0.25 second removable region. It is not permission for automatic cutting. Candidate start/end are in original source seconds.
- When timings disagree or evidence is missing, do **not** invent times, auto-fix words, or create speculative cut candidates. Review against the original audio first.
- The current endpoint still uses the existing Faster-Whisper engine. **Stable-ts is not installed or benchmarked yet.** Accuracy improvements require real-video listening tests and independent time alignment validation.

## Improved grouping and opt-in alignment benchmark

The STT response now includes `utterances` with word-index boundaries in
addition to unchanged `words`. Existing clients can continue using `words`;
the analysis report uses source utterance boundaries as *hints*. A native
boundary alone is not sufficient to authorize a cut.

For a controlled comparison of stable-ts against the **same original video**,
make a separate test virtual environment (not the API production environment):

```bash
cd apps/api
python3 -m venv .venv-stable-test
source .venv-stable-test/bin/activate
pip install -r requirements.txt
pip install 'stable-ts[fw]'
python scripts/compare_stable_ts.py /absolute/path/test_video.mp4 /absolute/path/rangmanch-video-analysis-v2.json --model small --out stable-ts-comparison.json
```

The CLI extracts local mono WAV audio, transcribes using the optional
stable-ts Faster-Whisper integration, and compares **word counts and
word/silence-overlap diagnostics** to the previously generated JSON.
It does not upload content, switch the service model, or change the
guest-session pipeline.

**Important:** Differences in counts of conflicts are not evidence of
word-level accuracy. An audio-energy detector can flag low-volume speech as
silence. Review a set of word onset/offset boundaries against the actual
recording before choosing an alignment engine. At the time of evaluation,
stable-ts upstream states development is indefinitely paused; review dependency
and model licensing before adopting it as a production dependency.

## Single-download analysis and temporary cache

The analyze endpoint now checks guest ownership and CSRF, then downloads the video once per cache miss. The same temporary file is reused for transcription, silence analysis, face detection and scene detection. Reports are cached in the API process for 10 minutes (12 entries maximum). Every cache hit still performs authorization checks. This process-local cache does not persist across restarts or workers. Concurrent requests and separate /transcribe calls can still download independently.

New log events: editor_analysis_cache_hit, editor_analysis_download_complete, editor_analysis_transcription_complete, editor_analysis_detection_complete and editor_analysis_complete. The change removes duplicate downloads within one analysis request; it does not fix unusually slow initial storage downloads.
