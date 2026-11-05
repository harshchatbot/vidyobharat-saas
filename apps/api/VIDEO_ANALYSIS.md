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

YuNet is **optional** and the app never fetches model weights during an
analysis request. OpenCV Zoo's `face_detection_yunet_2023mar.onnx` is 232,589
bytes. Its model-directory license is MIT. The setup utility downloads from the
OpenCV-owned model mirror and verifies its pinned SHA-256 before installing it
outside git:

```bash
cd apps/api
source .venv/bin/activate
python scripts/setup_yunet.py
export RANGMANCH_YUNET_MODEL_PATH="$HOME/.cache/rangmanch/models/face_detection_yunet_2023mar.onnx"
python -m pytest tests/test_video_analysis_service.py -q
uvicorn app.main:app --reload
```

Restart the API and re-analyze the same owner-authorized video. The analysis
cache key includes the model path and an updated pipeline version. Inspect:

```bash
jq '{status: .visual.face_status, sample_count: (.visual.face_samples|length), first_sample: .visual.face_samples[0]}' /tmp/whisper-analysis.json
```

YuNet runs **CPU-only**, sampling **1 frame per second** and resizing long
frame edges to **at most 640 pixels** (e.g. 1080×1920 → 360×640).
The detector returns at most one face per sampled frame. Box coordinates are
normalized against the *full source frame* and logged along with frames decoded
and elapsed time (`editor_yunet_face_detection_complete`). This is **not**
face tracking, face identification, emotion detection, or continuous evidence.

The installed `opencv-python-headless` dependency supplies YuNet.
Missing model or failed inference sets `face_status=unavailable`; decoded
frames containing no confident faces set `face_status=no_faces`. Face samples
should only be consumed as sparse observations, not assumed valid at every
video frame. Review model weight license and OpenCV dependencies before
commercial distribution.

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

## Local upload-to-analysis reuse (opt-in development optimization)

To avoid downloading the same new upload from Firebase when running FastAPI
on your MacBook, create a private local cache directory and start FastAPI
with the following environment variable:

```bash
mkdir -p ~/.cache/rangmanch/editor-media
chmod 700 ~/.cache/rangmanch/editor-media
export RANGMANCH_EDITOR_LOCAL_MEDIA_CACHE_DIR="$HOME/.cache/rangmanch/editor-media"
# Optional defaults: 512 MiB maximum, 3600 seconds TTL
export RANGMANCH_EDITOR_LOCAL_MEDIA_CACHE_MAX_BYTES=536870912
export RANGMANCH_EDITOR_LOCAL_MEDIA_CACHE_TTL_SECONDS=3600
uvicorn app.main:app --reload
```

**Upload a NEW video after enabling this setting.** Previously uploaded files
were not retained locally and will still require a Firebase download. On a
successful fresh upload, a verified local copy is kept after cloud upload; a
failed DB commit invalidates the copy, and a media deletion also invalidates it.
`/analyze` still checks the guest session, ownership, CSRF, and active record
before reading from this optional cache. Each cache read verifies source size
and SHA-256, copies to request-private temporary storage and falls back to
Firebase on miss/corruption/expiry. On cache hit, expect:
`editor_local_media_cache_hit` and `editor_analysis_local_source_ready`.
A miss still logs `editor_analysis_download_complete`.

Retention uses a lazy bounded LRU-like eviction and expiry on access/store.
Cache files are not persistently secure backups. Disable by unsetting the
environment variable. The cache does not share state across local and EC2
machines, nor between distinct API hosts. Avoid enabling on an untrusted
shared filesystem; the cache contains original uploaded video.

## 2026-11-05: playback deletion race, STT instrumentation, and alignment safety

**Deleted media while streaming:** The content route still returns 410 if the
cloud object is gone before the first chunk. If the object disappears *after*
response headers have been sent (e.g., a delete during playback), the streaming
iterator logs `editor_media_stream_source_removed` and terminates without
raising an ASGI server exception. HTTP status cannot change after headers are
sent, so the browser may see an incomplete stream; the editor should discard
deleted media and should not keep requesting it.

**Transcription observability:** The local Faster-Whisper worker logs
`editor_transcription_cache_hit`, `editor_transcription_cache_miss`,
`editor_transcription_fresh_complete`, and model loaded/cache-hit events.
Transcript cache keys now include model choice.

Measure local process-cold model startup vs fresh transcription vs warm
transcript reuse using the *original local video file*:

```bash
cd apps/api
source .venv/bin/activate
python scripts/benchmark_stt_cold.py /absolute/path/original.mp4
```

The script launches a new child process and reports individual stage timings.
Cloud download, upload and analysis time are excluded. Run against an
original file on disk, not the JSON report.

**Alignment guard:** Alongside -35 dB silence events, the report now includes
`audio.strict_silence_intervals` detected at -45 dB. Cut proposals require
word-time gaps, both measured silence thresholds, padding, and a 350 ms guard
around disputed word/silence boundaries. The original word timestamps remain
untouched. These rules may intentionally return zero candidates.

For true word-alignment comparison, the optional local
`scripts/compare_stable_ts.py` now uses stable-ts **forced alignment of the
same transcript** and refuses token-sequence changes. Run it in an isolated
benchmark environment and listen to the actual boundary clips before deciding
whether to enable a new alignment provider in production. This update **does
not** automatically switch production STT/alignment engines.

## Optional Whisper forced-alignment comparison (evidence-only)

The API continues using **Faster-Whisper** for speech recognition. To compare
its original timestamps against a Whisper-based forced-alignment pass locally:

```bash
cd apps/api
source .venv/bin/activate
pip install 'stable-ts[fw]'
export RANGMANCH_WHISPER_ALIGNMENT_MODE=compare
uvicorn app.main:app --reload
```

Analyze your recording again. The report remains schema V2 and gains:
- `speech.alignment_status`: `candidate_available`, `rejected`, or
  `unavailable` (`not_requested` if disabled)
- `speech.aligned_words_candidate`: valid candidate timings, if available
- `speech.alignment_notes`: elapsed time and -35 dB conflict comparison

Original `speech.words` remains **unchanged** and drives captions and safe cut
analysis. A candidate is rejected if token identities/count differ, word times
are impossible or unordered, or any word's start/end shifts over 750 ms.
No altered cut is automatically applied. This is a comparison step; an
original audio review is mandatory before switching word timing providers.

Unset the env var or set it to `off` for ordinary production-like behavior.
Because this adds an additional model pass it will increase latency when
enabled. Run it only on the local development backend for now. The forced
alignment script `scripts/compare_stable_ts.py` remains available for
standalone comparisons on the original file.

## Inspect large forced-alignment shifts

A >750 ms deviation from Faster-Whisper is **not** a proof that stable-ts
is wrong: the original word timings are only estimates. Compare mode now
retains candidates that match tokens, are ordered and have legal bounds even
if they shift a lot. The candidate gets `alignment_status=review_required`
and `speech.alignment_diagnostics` summarizes the biggest shifts and conflict
counts against -35 dB and -45 dB silence evidence. A lexical mismatch,
missing word or invalid timestamp is still rejected.

Keep the original source video in local media cache, pull current changes, and
restart the FastAPI process with `RANGMANCH_WHISPER_ALIGNMENT_MODE=compare`.
The report-cache version was incremented so reanalysis is not served from
the old JSON result. The editor does **not** apply the candidate for captions,
semantic segments, or cuts.

Inspect with:

```bash
jq '{
  status: .speech.alignment_status,
  diagnostics: .speech.alignment_diagnostics,
  notes: .speech.alignment_notes,
  original_safe_cut_count: (.audio.safe_cut_candidates | length)
}' /tmp/whisper-analysis.json
```

When evaluating real alignment quality, use the source video and listen to
clips around the five largest shifts. A lower conflict count with energy-based
silence is only corroborating evidence, not a reference annotation.
