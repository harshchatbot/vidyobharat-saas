# Workflow Refactoring - Testing Checklist

## Quick Test Plan

### ✅ Pre-Testing Setup
- [ ] Clear browser localStorage: `localStorage.clear()` in console
- [ ] Open http://localhost:3000/story-ad
- [ ] Make sure backend API is running (port 8000)
- [ ] Open DevTools (F12) → Storage tab → localStorage

---

## 🧪 Test 1: localStorage Auto-Save & Resume

**Objective:** Verify that project ID is saved to localStorage and auto-resumed on refresh

**Steps:**
1. [ ] Start at `/story-ad` (category selection page)
2. [ ] Select a category (e.g., "UGC Testimonial")
3. [ ] Click "Next" to proceed through steps
4. [ ] Generate a script (wait for it to complete)
5. [ ] **Check localStorage:**
   - Open DevTools → Application → localStorage
   - Look for key: `storyboard_project_id`
   - Value should be a UUID (e.g., `ca6f6377-5ebb-45d8-abb3-ef87ef29ebcc`)
6. [ ] Refresh the page (Cmd+R or Ctrl+R)
7. [ ] **Verify auto-resume:**
   - Should see loading spinner: "📋 Resuming your project..."
   - Page should automatically navigate to the Script Checkpoint
   - Script should be visible (same one you just created)
8. [ ] **No manual URL needed** - Should work without `?project_id=xxx` in URL

**Expected Result:** ✅ Project resumes automatically, same state as before refresh

---

## 🧪 Test 2: Workflow Progress Indicator

**Objective:** Verify progress indicator shows correct current step

**Steps:**
1. [ ] At Script Checkpoint, look at top of page
2. [ ] Should see: `✓ Script | ○ Storyboard | ○ Production | ○ Complete`
3. [ ] Progress indicator should show current state on right
4. [ ] Approve script and navigate to next checkpoint
5. [ ] Progress should update to: `✓ Script | ✓ Storyboard | ○ Production | ○ Complete` (or similar)
6. [ ] Continue through workflow, verify progress updates at each step

**Expected Result:** ✅ Progress indicator accurately shows current workflow step

---

## 🧪 Test 3: Back Navigation

**Objective:** Verify users can navigate backward in workflow

**Steps:**
1. [ ] At Script Checkpoint, note: No "← Back" button (first step)
2. [ ] Approve script, navigate to Storyboard Checkpoint
3. [ ] Should see "← Back to Script" button in action buttons
4. [ ] Click "← Back to Script"
5. [ ] Should return to Script Checkpoint
6. [ ] Script should still be visible and editable
7. [ ] Continue to Storyboard again
8. [ ] Approve storyboard, navigate to Image Checkpoint
9. [ ] Should see "← Back to Storyboard" button
10. [ ] Click it and verify return to Storyboard Checkpoint

**Expected Result:** ✅ Back buttons work correctly at all checkpoints

---

## 🧪 Test 4: Start Over Button

**Objective:** Verify "Start Over" button clears project and resets to category selection

**Steps:**
1. [ ] At any checkpoint after project creation, look at header
2. [ ] Should see "↻ Start Over" button in top-right
3. [ ] Click "↻ Start Over"
4. [ ] Should immediately navigate to Category Selection page
5. [ ] **Verify localStorage cleared:**
   - DevTools → localStorage → `storyboard_project_id` should be gone
6. [ ] Progress indicator should disappear (no project active)
7. [ ] Should be able to start a new project from scratch

**Expected Result:** ✅ "Start Over" resets workflow and clears localStorage

---

## 🧪 Test 5: URL Parameter Still Works

**Objective:** Verify URL-based project resume still works alongside localStorage

**Steps:**
1. [ ] Create and complete a project (or note project ID)
2. [ ] Go to a different page (e.g., home)
3. [ ] Manually navigate to: `http://localhost:3000/story-ad?project_id=YOUR_PROJECT_ID`
4. [ ] Replace `YOUR_PROJECT_ID` with an actual project ID from previous project
5. [ ] Should see loading spinner
6. [ ] Should auto-resume at the correct checkpoint

**Expected Result:** ✅ URL parameter `?project_id=xxx` works as fallback

---

## 🧪 Test 6: Loading States

**Objective:** Verify loading indicators show during async operations

**Steps:**
1. [ ] At Script Checkpoint, if script generating, should see "Generating script..."
2. [ ] At Storyboard Checkpoint, if generating, should see "Generating storyboard scenes..."
3. [ ] Buttons should show "Processing..." while loading
4. [ ] During Production Status, should see:
   - Overall progress bar with percentage
   - Per-stage progress (Image Gen, Video Gen, Lipsync, Stitching, Scoring)
   - Per-scene status cards with checkmarks or spinners
5. [ ] All loading indicators should disappear once operation completes

**Expected Result:** ✅ Clear visual feedback during all async operations

---

## 🧪 Test 7: Complete Workflow Flow (End-to-End)

**Objective:** Complete the entire workflow from start to finish

**Steps:**
1. [ ] Start at `/story-ad`
2. [ ] Select Category → Select Creation Method → Fill Business Brief
3. [ ] Click "Generate" → Wait for script
4. [ ] Approve Script → Wait for storyboard scenes
5. [ ] Approve Storyboard → Generate base images
6. [ ] Approve Images → Select Voice
7. [ ] Video production starts → Wait for completion
8. [ ] Approve Final Video
9. [ ] See completion screen with "Create Another Ad" and "Download Video" buttons
10. [ ] Click "Create Another Ad"
11. [ ] Should reset to Category Selection
12. [ ] Start a new project

**Expected Result:** ✅ Full workflow completes without errors, can start new projects

---

## 🧪 Test 8: Multiple Projects (localStorage Overwrite)

**Objective:** Verify localStorage correctly handles multiple projects

**Steps:**
1. [ ] Complete first project to "Production in Progress" stage
2. [ ] Note project ID: `PROJECT_1`
3. [ ] Click "↻ Start Over"
4. [ ] Create and proceed with second project to Script Checkpoint
5. [ ] Note project ID: `PROJECT_2`
6. [ ] **Check localStorage:**
   - Should show `PROJECT_2` (latest project)
7. [ ] Refresh page
8. [ ] Should resume `PROJECT_2`, not `PROJECT_1`

**Expected Result:** ✅ Latest project ID is stored, older ones are overwritten

---

## 🧪 Test 9: Edge Case - Direct URL After Start Over

**Objective:** Verify URL parameter takes priority over stale localStorage

**Steps:**
1. [ ] Complete first project, note project ID: `PROJECT_1`
2. [ ] Click "↻ Start Over" (clears localStorage)
3. [ ] Manually navigate to: `?project_id=PROJECT_1`
4. [ ] Should load `PROJECT_1` despite localStorage being empty

**Expected Result:** ✅ URL parameter correctly takes priority

---

## 📱 Responsive Design Check

- [ ] Test on mobile (375px width)
- [ ] Test on tablet (768px width)
- [ ] Test on desktop (1280px width)
- [ ] Verify buttons are clickable on all sizes
- [ ] Verify progress indicator displays correctly

---

## 🐛 Known Issues to Watch For

- [ ] No "hydration mismatch" errors in browser console
- [ ] No localStorage errors in console
- [ ] No TypeScript errors (should see clean console)
- [ ] All buttons have proper disabled/enabled states
- [ ] Loading spinners animate smoothly
- [ ] No "jumping" or layout shifts during loading

---

## 📋 Sign-Off Checklist

After running all tests, verify:

- [ ] localStorage persistence works (Test 1)
- [ ] Progress indicator updates correctly (Test 2)
- [ ] Back navigation functions properly (Test 3)
- [ ] Start Over button resets everything (Test 4)
- [ ] URL parameters still work (Test 5)
- [ ] Loading states show appropriate feedback (Test 6)
- [ ] Complete workflow executes end-to-end (Test 7)
- [ ] Multiple projects handled correctly (Test 8)
- [ ] URL takes priority over localStorage (Test 9)
- [ ] Responsive design looks good (Mobile check)
- [ ] No console errors or warnings (Bug check)

---

## 🎯 Success Criteria

✅ **All Tests Pass?**
- User can create ad, refresh page, and auto-resume at exact checkpoint
- Navigation is flexible: can go back, start over, or continue forward
- Progress is always visible via indicator and loading states
- User never loses context on page refresh
- Multiple projects handled correctly
- No manual URL entry needed (unless desired)

---

## 💬 Questions?

If any test fails:
1. Check browser DevTools Console for errors
2. Check API logs (port 8000) for backend issues
3. Verify localStorage is enabled in browser
4. Clear cache and try again: Cmd+Shift+Delete (Windows/Linux: Ctrl+Shift+Delete)

