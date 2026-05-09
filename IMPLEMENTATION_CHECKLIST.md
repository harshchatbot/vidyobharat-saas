# Quick Start Checklist: Cost & Model Optimization

## 📋 Copy-Paste Ready Implementation

Everything you need is in **EXACT_IMPLEMENTATION_GUIDE.md** with exact file paths and line numbers.

---

## ⏱️ Timeline: 4 Hours Total

### Hour 1: Create Cost Service (60 min)
- [ ] Copy the `AvatarProductCostService` class
- [ ] Create file: `apps/api/app/services/avatar_product_cost_service.py`
- [ ] Paste entire class (300 lines)
- [ ] Save and test import: `python -c "from app.services.avatar_product_cost_service import AvatarProductCostService"`

### Hour 2: Add API Endpoint (60 min)
- [ ] Open `apps/api/app/api/routes.py`
- [ ] Add import at line ~120: `from app.services.avatar_product_cost_service import AvatarProductCostService`
- [ ] Find existing routes section (~line 900)
- [ ] Copy the `/api/avatar-product/estimate-cost` endpoint code
- [ ] Paste it as a new endpoint
- [ ] Test with curl command from guide

### Hour 3: Integrate with Workflow & Credit Check (60 min)
- [ ] Update `apps/api/app/services/avatar_product_workflow_service.py` (add 4 fields)
- [ ] Update `apps/api/app/api/routes.py` (add pre-flight credit check)
- [ ] Update `apps/api/app/cinematic/families/ugc/builder.py` (add model router)
- [ ] Update `apps/api/app/services/credit_service.py` (add cost logging)

### Hour 4: Frontend + Testing (60 min)
- [ ] Update React component to call `/api/avatar-product/estimate-cost`
- [ ] Show cost breakdown before generation
- [ ] Disable "Generate" if insufficient credits
- [ ] Test end-to-end: select model → see cost → generate video → credits deducted

---

## 🎯 What Gets Added

| File | Change | Lines |
|------|--------|-------|
| `avatar_product_cost_service.py` | **NEW** | 350 |
| `routes.py` | Add 1 endpoint | 50 |
| `avatar_product_workflow_service.py` | Add 4 fields | 10 |
| `routes.py` | Add credit check | 30 |
| `builder.py` | Add model router | 20 |
| `credit_service.py` | Add logging | 10 |
| React component | Add cost UI | 20 |
| **TOTAL** | | ~490 lines |

---

## 📊 What You Get (Immediate Wins)

### Cost Visibility
```
✅ Users see cost BEFORE clicking "Generate"
✅ Shows: video cost + TTS cost + lip-sync cost = TOTAL
✅ Shows: "You have 500 credits, need 57 credits"
✅ Prevents accidental spending
```

### Cost Control
```
✅ Can't generate if insufficient credits
✅ Credits deducted BEFORE calling FAL
✅ All costs logged for analytics
✅ Can track cost per user per month
```

### Model Flexibility
```
✅ User can choose: Seedance ($0.54) vs LTX ($0.55) vs Kling ($1.26)
✅ Recommended models by tier (free/pro/premium)
✅ Find cheapest option automatically
✅ Quality vs cost trade-offs visible
```

---

## 🔢 Expected Costs (15-second video)

```
Seedance    → 57 credits   ($0.57)  ← CHEAPEST for avatars ✅
LTX 2.3     → 58 credits   ($0.584)
Kling Std   → 129 credits  ($1.29)
Kling 4K    → 213 credits  ($2.13)
```

At 100 users × 2 videos/month:
- **Revenue:** $3-500/month (depending on pricing)
- **Cost:** $114-270/month (using cheapest models)
- **Margin:** 70-80% ✅ HEALTHY

---

## 🚀 Commands to Copy-Paste

### Test 1: Verify Cost Service Works
```bash
cd /Users/harshveersinghnirwan/Downloads/vidyobharat-saas/apps/api
source venv/bin/activate

python << 'EOF'
from app.services.avatar_product_cost_service import AvatarProductCostService

cost = AvatarProductCostService()
seedance = cost.estimate_seedance_cost(15, 150)
print(f"✅ Cost service works: Seedance 15s = ${seedance.total_cost_usd}")
EOF
```

**Expected output:** `✅ Cost service works: Seedance 15s = $0.555`

### Test 2: Start API and Call Endpoint
```bash
# Terminal 1
uvicorn app.main:app --reload --port 8000

# Terminal 2 (new terminal)
curl "http://localhost:8000/api/avatar-product/estimate-cost?duration_seconds=15&script_length=150&model_key=seedance" \
  -H "Authorization: Bearer test_token"
```

**Expected:** JSON with cost breakdown

### Test 3: End-to-End Flow
1. Open frontend (http://localhost:3000)
2. Go to avatar product creation
3. Select avatar
4. Write script
5. Should see: "This will cost 57 credits ($0.57)"
6. Click "Generate"
7. Check database: Credits should be deducted

---

## ✅ Verification Checklist

### After Implementation
- [ ] `AvatarProductCostService` imports without errors
- [ ] `/api/avatar-product/estimate-cost` endpoint returns JSON
- [ ] Cost calculation matches FAL pricing:
  - [ ] Seedance: 0.18 per 5 seconds ✓
  - [ ] LTX: 0.001605 per megapixel ✓
  - [ ] Kling: 0.084/sec standard ✓
  - [ ] Lip-sync: $3/minute ✓
  - [ ] Gemini TTS: $0.15/1000 chars ✓
- [ ] Pre-flight credit check works:
  - [ ] Enough credits → video generates ✓
  - [ ] Low credits → error "Need 57, have 30" ✓
- [ ] Frontend shows cost before generation ✓
- [ ] Credits deducted after video completes ✓
- [ ] Analytics log tracks model usage ✓

---

## 🔗 File Reference

When you need to find where to paste code:

| Task | File | Line Range | Section |
|------|------|---|---|
| Create service | `avatar_product_cost_service.py` | New file | (all) |
| Add import | `routes.py` | ~120 | Imports |
| Add endpoint | `routes.py` | ~900 | Existing routes section |
| Add fields | `avatar_product_workflow_service.py` | ~45 | @dataclass |
| Add fields | `avatar_product_workflow_service.py` | ~175 | assess() method |
| Add credit check | `routes.py` | ~500 | Video creation endpoint |
| Add router | `builder.py` | ~1 | Top of file |
| Add logging | `credit_service.py` | ~500 | deduct_credits() method |
| Frontend | React component | (UI file) | Before generate button |

---

## 🎓 Understanding the Costs

### Seedance is Cheapest for Avatars
```
Why: You have avatar image reference
Cost: Flat $0.18 per 5 seconds
For 15s: 3 × $0.18 = $0.54 ✅
Best for: Product demos, avatar ads
```

### LTX 2.3 is Flexible
```
Why: Text-based, no image needed
Cost: $0.001605 per megapixel
For 15s@720p@25fps: 345.6MP × $0.001605 = $0.554
Best for: Generic creative content
```

### Kling is Premium
```
Why: Highest quality, but expensive
Cost: $0.084/sec (standard) or $0.42/sec (4K)
For 15s standard: 15 × $0.084 = $1.26
Best for: Premium tier, when quality matters
```

### TTS is Negligible
```
Gemini Flash: $0.15 per 1000 characters
For 150 chars: (150/1000) × $0.15 = $0.0225
For 1000 chars: (1000/1000) × $0.15 = $0.15
Always included: +$0.015 - $0.15
```

### Lip-Sync is Optional
```
Cost: $3 per minute ($0.75 per 15 seconds)
Include by default: YES (quality feature)
Can disable for: Free tier (save cost)
```

---

## 💡 Pro Tips

### 1. Default to Seedance for Avatar Products
```python
recommended = cost_service.recommend_model(
    duration_seconds=15,
    user_tier='starter'
)
# Returns: 'seedance' ✅ (cheapest for avatars)
```

### 2. Show Cost Comparison in UI
```
You're selecting: Seedance
Other options:
  • LTX 2.3: $0.584 (+$0.01)
  • Kling Standard: $1.29 (+$0.72)
  
Seedance: RECOMMENDED ✅
```

### 3. Free Tier Gets Static Image Only
```python
if user_tier == 'free':
    return "static_image"  # No video generation cost
elif user_tier == 'starter':
    return "seedance"  # $0.54
elif user_tier == 'pro':
    return "kling_standard"  # $1.26
```

### 4. Monitor Cost Per User
```sql
-- Monthly cost per user
SELECT user_id, SUM(credits_deducted) * 0.01 as cost_usd
FROM credit_transactions
WHERE DATE >= DATE_TRUNC('month', NOW())
GROUP BY user_id
ORDER BY cost_usd DESC;
```

---

## 🐛 Common Mistakes to Avoid

### ❌ Wrong: Calling FAL without checking credits first
```python
# Don't do this:
video = fal_service.generate_video(...)  # No credit check!
```

### ✅ Right: Check credits BEFORE FAL call
```python
# Do this:
if user_credits < cost.credits_needed:
    return error("Insufficient credits")
deduct_credits(user_id, cost.credits_needed)
video = fal_service.generate_video(...)  # Safe now
```

### ❌ Wrong: Hardcoding model name
```python
# Don't do this:
model = "seedance"  # What if user wants LTX?
```

### ✅ Right: Let user choose
```python
# Do this:
model = request.query_params.get("model_key", "seedance")
cost = cost_service.estimate_all_models(...)[model]
```

### ❌ Wrong: Not logging costs
```python
# Don't do this:
deduct_credits(user_id, amount)  # Lost data!
```

### ✅ Right: Log everything
```python
# Do this:
deduct_credits(user_id, amount, metadata={
    'model': 'seedance',
    'duration': 15,
})
```

---

## 🎉 Success Criteria

You've succeeded when:

✅ Cost service calculates correctly
✅ API endpoint responds with cost breakdown
✅ Users see cost before generation
✅ Credits checked and deducted
✅ Can choose between 4 models
✅ Costs logged for analytics
✅ Margin is 70%+ (healthy business)
✅ Users understand what they're paying for

---

## 📞 Questions?

If anything is unclear:
1. Check **EXACT_IMPLEMENTATION_GUIDE.md** (specific file paths)
2. Check **MODEL_SELECTION_GUIDE.md** (when to use which model)
3. Check **QUICK_REFERENCE_CARD.md** (decision trees)

**You have everything you need. Time to code!** 🚀

