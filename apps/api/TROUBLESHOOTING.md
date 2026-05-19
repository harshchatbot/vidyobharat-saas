# Storyboard Pipeline Troubleshooting Guide

## Quick Diagnostics

### Run Backend Diagnostic
```bash
cd apps/api
python debug_storyboard.py
```

This will test:
1. ✅ Gemini client (mock responses)
2. ✅ Quality score service
3. ✅ Storyboard generation service
4. ✅ Firestore connection
5. ✅ Pipeline service
6. ✅ Celery tasks

---

## Error Messages & Solutions

### Error 1: "Failed to generate storyboard: Bad Request"

**Location**: StoryboardCheckpoint → generateStoryboard API call

**Possible Causes:**
1. **Workflow state mismatch**: Script not in SCRIPT_APPROVED state
   - Solution: Verify script was approved (check Firestore or logs)
   
2. **Celery task failed**: generate_storyboard_task crashed
   - Solution: Check Celery worker logs for exceptions
   - Look for: `script_score_parse_failed`, `storyboard_json_parse_failed`
   
3. **Gemini response empty**: Mock responses not configured
   - Solution: Verify gemini.py has quality_score mock with JSON
   - Check: `'quality_score': """{ "overall": ... }"""`

4. **Storyboard service error**: Scene card parsing failed
   - Solution: Check if mock storyboard response is valid JSON
   - Verify it's an array of scene objects with required fields

**Debug Steps:**
```bash
# 1. Check backend logs
tail -f app.log | grep -E "storyboard|script|score"

# 2. Check Celery logs
tail -f celery.log | grep -E "ERROR|FAILED|Exception"

# 3. Check Firestore state
firebase firestore:inspect storyboard_projects/{PROJECT_ID}
```

---

### Error 2: "Failed to generate voice preview: Bad Request"

**Location**: VoiceSelector → generateVoicePreview API call

**Possible Causes:**
1. **No TTS script**: project.tts_script is empty
   - Solution: Verify emotion tagging ran (should happen in generate_script_task)
   
2. **FAL API not configured**: FalVideoService can't call FAL
   - Solution: This is expected in Phase 1 - mock fallback should handle it
   - Check: voice_preview_service.py uses _get_mock_audio_url fallback
   
3. **Credits insufficient**: Not enough credits for 3-credit operation
   - Solution: Verify user has > 3 credits available
   - Check database: storyboard_projects[PROJECT_ID].credits_consumed

**Debug Steps:**
```bash
# 1. Check if TTS script was generated
firebase firestore:inspect storyboard_projects/{PROJECT_ID} | grep tts_script

# 2. Check voice preview service logs
tail -f app.log | grep "voice_preview"

# 3. Check if mock audio URL is being used
grep "_get_mock_audio_url" app.log
```

---

### Error 3: Audio element has empty src

**Location**: VoiceSelector component

**Cause**: `audio` element rendered with `src=""` (empty string)

**Solution**: Already fixed in VoiceSelector.tsx
```tsx
// BEFORE (broken)
<audio ref={audioRef} src={previewAudio || ''} />

// AFTER (fixed)
{previewAudio && <audio ref={audioRef} src={previewAudio} />}
```

---

## Testing Checklist

- [ ] Run `python debug_storyboard.py` - all tests pass
- [ ] Backend logs show no ERROR entries
- [ ] Celery logs show all tasks completing
- [ ] Firestore has storyboard_projects collection
- [ ] Project workflow_state progresses: initialized → script_awaiting → script_approved → ...
- [ ] Quality scores are valid JSON with numeric values

---

## Common Issues

### Issue: Script generation takes forever
**Symptom**: ScriptCheckpoint shows "Generating script..." for > 30 seconds  
**Cause**: Celery task not running or stuck  
**Solution**:
```bash
# Check if Celery worker is running
ps aux | grep celery

# If not running, start it
celery -A app.workers.render_service worker --loglevel=debug
```

### Issue: Firestore emulator not started
**Symptom**: All operations fail with "Firestore connection error"  
**Cause**: Firebase emulator not running  
**Solution**:
```bash
# In a separate terminal
firebase emulators:start --only firestore

# Or use the interactive CLI
firebase emulators:start
```

### Issue: Python import errors
**Symptom**: `ModuleNotFoundError: No module named 'app'`  
**Cause**: Running Python from wrong directory  
**Solution**:
```bash
# Make sure you're in apps/api directory
cd apps/api
python debug_storyboard.py
```

---

## Log Locations

- **API logs**: `apps/api/app.log` or stdout if using `--reload`
- **Celery logs**: Celery worker console output
- **Firestore logs**: `firebase.log`
- **Browser console**: DevTools → Console tab (Firefox/Chrome)
- **Network requests**: DevTools → Network tab

---

## Environment Check

```bash
# Verify all services running
echo "=== API Server ==="
curl -s http://localhost:8000/docs | grep -q "FastAPI" && echo "✅ Running" || echo "❌ Not running"

echo "=== Celery Worker ==="
ps aux | grep -q "celery.*worker" && echo "✅ Running" || echo "❌ Not running"

echo "=== Firestore Emulator ==="
curl -s http://localhost:4400 > /dev/null && echo "✅ Running" || echo "❌ Not running"

echo "=== Frontend Dev Server ==="
curl -s http://localhost:3000 > /dev/null && echo "✅ Running" || echo "❌ Not running"
```

---

## Next Steps

1. **Run diagnostic**: `python debug_storyboard.py`
2. **Check logs**: Look for ERROR entries
3. **Restart services**: Kill and restart API, Celery, Frontend
4. **Test workflow**: Go through Phase 1 workflow again
5. **Report issue**: Share diagnostic output + log snippets if still failing

