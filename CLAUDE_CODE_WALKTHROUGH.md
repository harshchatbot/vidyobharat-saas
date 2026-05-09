# Using Claude Code to Implement Cost Service Automatically

## The Simple Answer

**YES**, Claude Code can do all the changes automatically. Instead of you manually copying code into 7 files over 4 hours, Claude Code can do it in ~30 minutes for **~$2-5 in tokens**.

---

## Why Use Claude Code for This Task?

| Manual | Claude Code |
|--------|---|
| 4 hours of your time | 30 min agent + 10 min review |
| Copy-paste 7 files | Automated edits |
| Manual testing | Automatic test running |
| No verification | Built-in validation |
| 0 token cost | $2-5 token cost |
| **Real cost: $50-100** (your time) | **Real cost: $5** (tokens) |

**ROI:** Claude Code pays for itself in 5 minutes.

---

## Step-by-Step: Use Claude Code to Implement Everything

### Step 1: Start Claude Code Session (2 min)

```bash
cd /Users/harshveersinghnirwan/Downloads/vidyobharat-saas
claude
```

You'll see:
```
Claude Code v1.0.0
Session started
Ready for commands
```

### Step 2: Understand Your Codebase (5 min)

```
I'm implementing cost estimation and model selection for avatar_product pipeline.

First, analyze my codebase structure:
1. What files exist in apps/api/app/services/ related to avatar_product?
2. Show the existing AvatarProductWorkflowService structure
3. Show the credit_service.py to understand credit deduction
4. Show avatar_product_workflow_service.py dataclass fields

I'll use this to implement:
- AvatarProductCostService (new file)
- Cost estimation endpoint
- Model selection
- Pre-flight credit check
```

**Claude will read your codebase and show you the structure.**

Check token usage:
```bash
/usage
```

You'll see something like:
```
Tokens used: ~50K
Cost: ~$0.15
Remaining budget: Plenty
```

### Step 3: Create Cost Service (5 min)

```
Create a new file apps/api/app/services/avatar_product_cost_service.py with:

1. VideoModelCost dataclass for cost tracking
2. AvatarProductCostService class with methods:
   - estimate_ltx_2_3_cost() - $0.001605 per megapixel
   - estimate_seedance_cost() - $0.18 per 5 seconds @ 720p
   - estimate_kling_cost() - $0.084/sec standard, $0.42/sec 4K
   - estimate_all_models() - return all cost options
   - find_cheapest_model() - return cheapest option
   - recommend_model() - recommend based on user tier
   - Private helpers for TTS ($0.15/1000 chars) and lip-sync ($3/min)

Include docstrings and type hints. Make sure costs are rounded to 3 decimals.
```

**Claude will create the file with complete implementation.**

Check what was created:
```bash
git diff apps/api/app/services/avatar_product_cost_service.py
```

### Step 4: Add Cost Estimation Endpoint (5 min)

```
Update apps/api/app/api/routes.py:

1. Add import: from app.services.avatar_product_cost_service import AvatarProductCostService
2. Add new endpoint POST /api/avatar-product/estimate-cost that:
   - Accepts query params: duration_seconds, script_length, model_key, include_lipsync
   - Returns JSON with cost breakdown
   - Shows user's available credits
   - Shows can_generate boolean

Make sure the endpoint:
- Uses dependency injection for get_user_id
- Calls CreditService to get user balance
- Returns proper error codes (400 for invalid model, 402 for insufficient credits)
```

**Claude will add the endpoint correctly.**

### Step 5: Update Workflow Service (5 min)

```
Update apps/api/app/services/avatar_product_workflow_service.py:

1. In AvatarProductWorkflowFields dataclass, add fields:
   - video_model: str = "seedance"
   - video_quality: str = "standard"
   - estimated_cost_usd: float = 0.0
   - credits_needed: int = 0

2. In the assess() method (around line 175), before creating fields:
   - Determine video_model from request (default "seedance")
   - Calculate cost using AvatarProductCostService
   - Add these fields to the returned AvatarProductWorkflowFields

3. Make sure cost estimation includes lipsync by default
```

**Claude will add the fields and calculation logic.**

### Step 6: Add Pre-Flight Credit Check (5 min)

```
Update apps/api/app/api/routes.py:

Find the main video creation endpoint (search for where AIVideoCreateService is called).

Before calling video_service.create_video(), add:

1. Check if recipe_id == "avatar_product"
2. If yes:
   - Get the requested model and duration from payload
   - Estimate cost using AvatarProductCostService
   - Check user credits using CreditService
   - If insufficient: return HTTPException(402, "Insufficient credits...")
   - If sufficient: deduct credits with metadata {model, duration}
3. Then proceed with video generation

This ensures credits are deducted BEFORE calling FAL, not after.
```

**Claude will add the credit check safely.**

### Step 7: Add Model Router (3 min)

```
Update apps/api/app/cinematic/families/ugc/builder.py:

Add a function select_compiler_for_model(model_key: str) that:
- If model starts with 'ltx': return LTX compiler
- If model starts with 'seedance': return Seedance compiler
- If model starts with 'kling': return Kling compiler (with quality param)
- Default: return Seedance compiler

Make sure the function properly imports each compiler.
```

**Claude will add the routing logic.**

### Step 8: Add Cost Logging (3 min)

```
Update apps/api/app/services/credit_service.py:

In the deduct_credits() method, add logging at the end:

If the reason is "avatar_product_video", log:
- user_id
- credits_deducted
- model (from metadata)
- duration (from metadata)
- remaining_credits

This helps track costs for analytics.
```

**Claude will add the logging.**

### Step 9: Test Everything (5 min)

```
Run tests to verify implementation:

1. Import test: python -c "from app.services.avatar_product_cost_service import AvatarProductCostService"
2. Cost calculation test: 
   - Create service, estimate_seedance_cost(15, 150)
   - Should return ~$0.555 total cost
3. API test: Start API and call /api/avatar-product/estimate-cost?duration_seconds=15&script_length=150
4. Check all existing tests still pass

Show me any errors and I'll fix them.
```

**Claude will run tests and fix any issues.**

### Step 10: Review Changes (5 min)

```bash
git status              # See all changed files
git diff               # Review all changes
/usage                 # Check total token usage
```

**You should see something like:**
```
Modified files:
  - routes.py (+80 lines)
  - avatar_product_workflow_service.py (+4 fields)
  - avatar_product_cost_service.py (NEW, 350 lines)
  - builder.py (+20 lines)
  - credit_service.py (+10 lines)

Total tokens used: ~100K
Cost: ~$0.30 - $1.50 (depending on model)
Time taken: 30 minutes
```

---

## Example: Real Conversation with Claude Code

```
You: I'm implementing cost estimation for avatar_product. First, analyze my codebase.

Claude Code: [reads files]
Found:
- avatar_product_workflow_service.py: 250 lines, workflow handler
- credit_service.py: 950 lines, handles credit deduction
- routes.py: 2000 lines, API endpoints
- cinematic/families/ugc/builder.py: 250 lines, builds video specs

Identified dependencies:
- Firestore for data
- FAL.ai for video generation
- Gemini for TTS
- Sync-lipsync for audio sync

Ready to implement. Should I create avatar_product_cost_service.py first?

---

You: Yes, create avatar_product_cost_service.py with the AvatarProductCostService class.

Claude Code: Creating file...

Created apps/api/app/services/avatar_product_cost_service.py

Key methods:
- estimate_ltx_2_3_cost(): Calculates $0.001605 per megapixel
- estimate_seedance_cost(): Calculates $0.18 per 5 seconds
- estimate_kling_cost(): Calculates $0.084-0.42 per second
- Helper methods for TTS and lip-sync

File is ready. Next step?

---

You: Now add the /api/avatar-product/estimate-cost endpoint to routes.py

Claude Code: Adding endpoint to routes.py...

Added POST /api/avatar-product/estimate-cost that:
- Accepts: duration_seconds, script_length, model_key, include_lipsync
- Returns: cost breakdown + user credits + can_generate flag
- Proper error handling (400 for invalid model, 402 for insufficient credits)

Ready for next step?

---

[Continue until all 7 files are updated...]

You: Run tests to verify everything works

Claude Code: Running tests...

✅ Import test: PASSED
✅ Cost calculation (Seedance 15s): Expected $0.555, Got $0.555 ✓
✅ Cost calculation (LTX 15s): Expected $0.584, Got $0.584 ✓
✅ Cost calculation (Kling 15s): Expected $1.29, Got $1.29 ✓
✅ All existing tests: 24/24 PASSED

Implementation complete!
```

---

## Token Cost Breakdown for Your Task

```
Analysis phase:           ~30K tokens  (~$0.09)
Cost service creation:    ~25K tokens  (~$0.08)
Endpoint addition:        ~20K tokens  (~$0.06)
Workflow integration:     ~15K tokens  (~$0.05)
Credit check:             ~15K tokens  (~$0.05)
Model router:             ~10K tokens  (~$0.03)
Logging:                  ~10K tokens  (~$0.03)
Testing & fixes:          ~20K tokens  (~$0.06)
─────────────────────────────────────
TOTAL:                    ~145K tokens (~$0.45)
```

**If using Opus instead of Sonnet, multiply by ~2-3x, but still < $1.50**

---

## Commands to Know

```bash
/usage              # Check token budget
/context            # See how much context is used
/approve            # Accept all pending changes
/reject             # Revert all pending changes
/undo               # Undo last change
/help               # Show all commands
```

---

## What Claude Code Does vs Doesn't Do

### ✅ Claude Code CAN Do:
- Create new files
- Edit existing files (precise str_replace)
- Run tests automatically
- Execute shell commands
- Show diffs before applying
- Handle git operations
- Fix syntax errors
- Add imports correctly

### ⚠️ Claude Code SHOULD'T Do (requires human review):
- Delete files without asking
- Make database migrations
- Change production configs
- Modify security-critical code without review
- Deploy code automatically

---

## Safety: How to Avoid Mistakes

### Before Auto-Approve, Always:

1. **Check the diff:**
   ```bash
   git diff  # Review all changes
   ```

2. **Verify imports are correct:**
   ```bash
   grep -r "from app.services.avatar_product_cost_service" apps/api/app/
   ```

3. **Run tests:**
   ```bash
   python -m pytest tests/
   ```

4. **Check file exists:**
   ```bash
   ls -la apps/api/app/services/avatar_product_cost_service.py
   ```

5. **Verify cost calculations:**
   ```python
   python << 'EOF'
   from app.services.avatar_product_cost_service import AvatarProductCostService
   cost = AvatarProductCostService()
   seedance = cost.estimate_seedance_cost(15, 150)
   assert seedance.total_cost_usd == 0.555, f"Got {seedance.total_cost_usd}"
   print("✅ Cost calculations correct")
   EOF
   ```

---

## Start Right Now: The Command

Copy-paste this entire prompt into your Claude Code session:

```
I need to implement cost estimation and model selection for avatar_product pipeline.

Here's what needs to be implemented:

1. Create apps/api/app/services/avatar_product_cost_service.py with:
   - VideoModelCost dataclass
   - AvatarProductCostService with methods:
     - estimate_ltx_2_3_cost() for LTX: $0.001605 per megapixel
     - estimate_seedance_cost() for Seedance: $0.18 per 5s @ 720p
     - estimate_kling_cost() for Kling: $0.084/sec (standard) or $0.42/sec (4K)
     - estimate_all_models() returning dict of all options
     - find_cheapest_model() 
     - recommend_model(user_tier)
     - Helpers for TTS ($0.15/1000 chars) and lip-sync ($3/min)

2. Update apps/api/app/api/routes.py:
   - Add import for AvatarProductCostService
   - Add POST /api/avatar-product/estimate-cost endpoint
   - Add pre-flight credit check before video generation

3. Update apps/api/app/services/avatar_product_workflow_service.py:
   - Add fields: video_model, video_quality, estimated_cost_usd, credits_needed
   - Calculate costs in assess() method

4. Update apps/api/app/cinematic/families/ugc/builder.py:
   - Add select_compiler_for_model() function for routing

5. Update apps/api/app/services/credit_service.py:
   - Add logging for avatar_product cost tracking

6. Run all tests to verify

Please start by analyzing the codebase structure, then implement step by step.
```

Paste this into Claude Code and watch it work.

---

## Expected Timeline

- **5 min:** Paste prompt
- **5 min:** Claude analyzes codebase
- **15 min:** Claude implements all changes
- **5 min:** Tests run and pass
- **5 min:** You review diffs
- **Total: 35 minutes**

Compare to manual: 4-6 hours

---

## After Implementation

```bash
# Commit changes
git add .
git commit -m "feat: Add cost estimation and model selection for avatar_product"
git push origin your-branch

# Create PR
# Request review
# Merge when approved
```

---

## FAQ

**Q: Will Claude Code mess up my codebase?**
A: No. It shows diffs before applying. Review them. If wrong, `git checkout .` reverts everything.

**Q: Do I need to review the code?**
A: YES. Always review diffs. Claude is 95% accurate but not perfect.

**Q: Will it handle edge cases?**
A: It will handle the cases you describe. Be specific about requirements.

**Q: Can I undo if something breaks?**
A: Yes. `git reset --hard HEAD` or `/undo` in Claude Code.

**Q: How much will this actually cost?**
A: $0.50-2.00 in tokens. Negligible.

**Q: Should I use Auto-Approve?**
A: Only after reviewing the first 2-3 changes. Safe once you trust the agent.

---

## My Recommendation

✅ **Use Claude Code for this task.** It's:
- 10x faster than manual
- 100x cheaper than your time
- Built-in testing
- Zero risk with git rollback

Don't spend 4 hours copying code. Spend 30 minutes with Claude Code and review the results.

**Do it now:** Open Claude Code, paste the prompt above, and watch the magic happen.

