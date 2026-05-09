# 🚀 START HERE: Next 3 Hours Action Plan

## Your Current State
- Using `fal-ai/infinitalk` (cost unknown, likely deprecated)
- Margin is uncertain
- Bleeding money on every avatar generation

## Your Goal
- Understand exact infinitalk cost
- Test LTX 2.3 (2-3x cheaper)
- Make decision: Migrate or stay
- Implement cost tracking

---

## Timeline (3 hours total)

### 🔴 Hour 1: Discovery (0:00 - 1:00)

#### Task 1.1: Find infinitalk cost [30 min]

```bash
# 1. Go to https://fal.ai/dashboard/billing
# 2. Login with your FAL account
# 3. Look for "Billing" or "Usage" section
# 4. Find infinitalk API requests

# You need:
# - Total requests: ___
# - Total cost: $___
# - Cost per request: $___
# - Success rate: ___%
```

**Create a file with findings:**
```bash
cat > /tmp/infinitalk_baseline.txt << 'EOF'
Infinitalk Current Baseline
============================
Period: [Last 7 days / 30 days?]
Total requests: 
Total cost: $
Cost per request: $
Success rate: %
Failures: 
Average duration: seconds
Notes:
EOF
```

#### Task 1.2: Get FAL API Key [15 min]

```bash
# 1. Go to https://fal.ai/dashboard/credentials
# 2. Generate new API key if you don't have one
# 3. Copy it

# Add to your .env.local:
cat >> apps/api/.env << 'EOF'
FAL_API_KEY=<your-key-here>
EOF
```

#### Task 1.3: Understand your script lengths [15 min]

Look at 10 recent avatar generations:

```bash
# Check Firestore for sample scripts
# Or ask: What's typical avatar script length?

# Common lengths:
# - Short: 20-50 chars (3-5 sec audio)
# - Medium: 100-150 chars (8-12 sec audio)
# - Long: 300+ chars (20-30 sec audio)

# Your most common: [SHORT / MEDIUM / LONG]
```

---

### 🟡 Hour 2: Testing (1:00 - 2:00)

#### Task 2.1: Create test script [10 min]

```python
# apps/api/scripts/test_fal_models.py

import httpx
import os
import json
from pathlib import Path
from datetime import datetime

FAL_API_KEY = os.getenv('FAL_API_KEY')
BASE_URL = "https://api.fal.ai/queue"

# Sample avatar image (use your own)
AVATAR_IMAGE = "https://api.rangmanchai.com/sample_avatar.jpg"

async def test_ltx_2_3(duration_sec: int = 15):
    """Test LTX 2.3 Image-to-Video"""
    print(f"\n🧪 Testing LTX 2.3 ({duration_sec}s)...")
    
    client = httpx.AsyncClient()
    
    try:
        # Submit job
        response = await client.post(
            f"{BASE_URL}/fal-ai/ltx-2.3-22b/image-to-video/submit",
            headers={"Authorization": f"Key {FAL_API_KEY}"},
            json={
                "image_url": AVATAR_IMAGE,
                "prompt": "A professional avatar speaking clearly",
                "duration": duration_sec,
                "num_inference_steps": 25,
            },
            timeout=30,
        )
        
        if response.status_code != 200:
            print(f"❌ Submit failed: {response.status_code}")
            print(response.text)
            return None
        
        data = response.json()
        request_id = data.get('request_id')
        print(f"✓ Submitted, request_id: {request_id}")
        
        # Poll for result (max 5 min)
        import asyncio
        max_attempts = 60
        for attempt in range(max_attempts):
            await asyncio.sleep(5)  # Check every 5 sec
            
            status_response = await client.get(
                f"{BASE_URL}/fal-ai/ltx-2.3-22b/image-to-video/{request_id}",
                headers={"Authorization": f"Key {FAL_API_KEY}"},
            )
            
            status_data = status_response.json()
            status = status_data.get('status')
            
            print(f"  [{attempt+1}/60] Status: {status}")
            
            if status == 'completed':
                video_url = status_data.get('output', {}).get('video', {}).get('url')
                
                # Calculate cost
                pixels_per_sec = 1280 * 720 * 25
                total_pixels = pixels_per_sec * duration_sec
                megapixels = total_pixels / 1_000_000
                cost = megapixels * 0.001605
                
                print(f"✅ SUCCESS")
                print(f"   Video URL: {video_url}")
                print(f"   Calculated cost: ${cost:.3f}")
                
                return {
                    'status': 'success',
                    'model': 'ltx-2.3',
                    'duration': duration_sec,
                    'cost_usd': cost,
                    'video_url': video_url,
                }
            elif status == 'failed':
                print(f"❌ FAILED")
                print(f"   Error: {status_data.get('error')}")
                return {'status': 'failed', 'model': 'ltx-2.3'}
        
        print(f"⏱️  TIMEOUT (> 5 minutes)")
        return {'status': 'timeout', 'model': 'ltx-2.3'}
        
    except Exception as e:
        print(f"💥 Exception: {e}")
        return {'status': 'error', 'error': str(e)}

async def test_seedance_lite(duration_sec: int = 15):
    """Test Seedance Lite Image-to-Video"""
    print(f"\n🧪 Testing Seedance Lite ({duration_sec}s)...")
    
    client = httpx.AsyncClient()
    
    try:
        response = await client.post(
            f"{BASE_URL}/fal-ai/bytedance/seedance/v1/lite/image-to-video/submit",
            headers={"Authorization": f"Key {FAL_API_KEY}"},
            json={
                "image_url": AVATAR_IMAGE,
                "prompt": "A professional avatar speaking",
                "duration": duration_sec,
            },
            timeout=30,
        )
        
        if response.status_code != 200:
            print(f"❌ Submit failed: {response.status_code}")
            return None
        
        data = response.json()
        request_id = data.get('request_id')
        print(f"✓ Submitted, request_id: {request_id}")
        
        # Poll for result
        import asyncio
        for attempt in range(60):
            await asyncio.sleep(5)
            
            status_response = await client.get(
                f"{BASE_URL}/fal-ai/bytedance/seedance/v1/lite/image-to-video/{request_id}",
                headers={"Authorization": f"Key {FAL_API_KEY}"},
            )
            
            status_data = status_response.json()
            status = status_data.get('status')
            
            print(f"  [{attempt+1}/60] Status: {status}")
            
            if status == 'completed':
                video_url = status_data.get('output', {}).get('video', {}).get('url')
                
                # Calculate cost: $0.18 per 5 seconds
                cost = (duration_sec / 5) * 0.18
                
                print(f"✅ SUCCESS")
                print(f"   Video URL: {video_url}")
                print(f"   Calculated cost: ${cost:.3f}")
                
                return {
                    'status': 'success',
                    'model': 'seedance-lite',
                    'duration': duration_sec,
                    'cost_usd': cost,
                    'video_url': video_url,
                }
            elif status == 'failed':
                print(f"❌ FAILED")
                return {'status': 'failed', 'model': 'seedance-lite'}
        
        return {'status': 'timeout', 'model': 'seedance-lite'}
        
    except Exception as e:
        print(f"💥 Exception: {e}")
        return {'status': 'error'}

async def test_gemini_tts(script: str = "Hello, this is a test"):
    """Test Gemini-3.1-Flash-TTS"""
    print(f"\n🧪 Testing Gemini TTS...")
    
    client = httpx.AsyncClient()
    char_count = len(script)
    
    try:
        response = await client.post(
            f"{BASE_URL}/fal-ai/gemini-3.1-flash-tts/submit",
            headers={"Authorization": f"Key {FAL_API_KEY}"},
            json={
                "text": script,
                "language": "en",
            },
            timeout=30,
        )
        
        if response.status_code != 200:
            print(f"❌ Submit failed: {response.status_code}")
            return None
        
        data = response.json()
        request_id = data.get('request_id')
        print(f"✓ Submitted, request_id: {request_id}")
        
        # Poll
        import asyncio
        for attempt in range(30):
            await asyncio.sleep(2)
            
            status_response = await client.get(
                f"{BASE_URL}/fal-ai/gemini-3.1-flash-tts/{request_id}",
                headers={"Authorization": f"Key {FAL_API_KEY}"},
            )
            
            status_data = status_response.json()
            
            if status_data.get('status') == 'completed':
                audio_url = status_data.get('output', {}).get('audio', {}).get('url')
                
                # Cost: $0.15 per 1000 chars
                cost = (char_count / 1000) * 0.15
                
                print(f"✅ SUCCESS")
                print(f"   Audio URL: {audio_url}")
                print(f"   Chars: {char_count}, Cost: ${cost:.3f}")
                
                return {
                    'status': 'success',
                    'model': 'gemini-tts',
                    'char_count': char_count,
                    'cost_usd': cost,
                    'audio_url': audio_url,
                }
            elif status_data.get('status') == 'failed':
                print(f"❌ FAILED")
                return {'status': 'failed'}
        
        return {'status': 'timeout'}
        
    except Exception as e:
        print(f"💥 Exception: {e}")
        return {'status': 'error'}

async def main():
    print("=" * 60)
    print("FAL Model Testing")
    print("=" * 60)
    
    results = {
        'timestamp': datetime.now().isoformat(),
        'tests': [],
    }
    
    # Test different durations
    for duration in [10, 15, 20]:
        result = await test_ltx_2_3(duration)
        results['tests'].append(result)
    
    result = await test_seedance_lite(15)
    results['tests'].append(result)
    
    result = await test_gemini_tts("Hello, check out this amazing product.")
    results['tests'].append(result)
    
    # Save results
    with open('fal_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    print("\n" + "=" * 60)
    print("RESULTS SAVED: fal_test_results.json")
    print("=" * 60)

if __name__ == '__main__':
    import asyncio
    asyncio.run(main())
```

#### Task 2.2: Run the test [50 min]

```bash
cd /Users/harshveersinghnirwan/Downloads/vidyobharat-saas/apps/api

# Activate venv
source venv/bin/activate

# Install httpx if needed
pip install httpx --break-system-packages

# Run test
python scripts/test_fal_models.py
```

**Watch the output:**
```
🧪 Testing LTX 2.3 (10s)...
✓ Submitted, request_id: xyz...
  [1/60] Status: processing
  [2/60] Status: processing
  ...
  [N/60] Status: completed
✅ SUCCESS
   Video URL: https://...
   Calculated cost: $0.37

🧪 Testing LTX 2.3 (15s)...
...
```

**When done, check results:**
```bash
cat fal_test_results.json
```

---

### 🟢 Hour 3: Decision & Planning (2:00 - 3:00)

#### Task 3.1: Compare costs [20 min]

Create a simple comparison:

```bash
# Create comparison spreadsheet
cat > cost_comparison.txt << 'EOF'
=== FAL MODEL COST COMPARISON ===

Your Current:
  Model: infinitalk
  Cost baseline: [from Task 1.1]
  Cost per 15s avatar: $___
  Success rate: ___%

New Options:

LTX 2.3 (tested):
  Cost per 10s: $___
  Cost per 15s: $___
  Cost per 20s: $___
  Quality: [good/great/excellent]
  Generation time: ___s
  Success rate: ___%

Seedance Lite (tested):
  Cost per 15s: $___
  Quality: [good/great/excellent]
  Generation time: ___s
  Success rate: ___%

Gemini TTS (tested):
  Cost per script: $___
  Quality: [good/great/excellent]
  Generation time: ___s

=== CONCLUSION ===
Best option: [LTX 2.3 / Seedance / Keep Infinitalk]
Reason: [cost / quality / speed]
Estimated monthly savings: $___
EOF

cat cost_comparison.txt
```

#### Task 3.2: Make decision [10 min]

**Question 1:** Is LTX 2.3 cost < 70% of infinitalk cost?
- [ ] YES → Migrate
- [ ] NO → Negotiate with FAL or keep infinitalk

**Question 2:** Is LTX 2.3 quality >= 80%?
- [ ] YES → Migrate
- [ ] NO → Test Seedance or Kling instead

**Decision:** 
```
IF ltx_cost < infinitalk_cost * 0.7 AND ltx_quality >= 80:
  ACTION: Migrate to LTX 2.3 immediately
ELSE:
  ACTION: Test more models or negotiate FAL pricing
```

#### Task 3.3: Plan migration [30 min]

If migrating to LTX 2.3:

```bash
# 1. Copy implementation code from FAL_COST_OPTIMIZATION.md
# 2. Update apps/api/app/services/fal_video_service.py
# 3. Update apps/api/app/services/avatar_preview_service.py

# Test locally:
cd apps/api
source venv/bin/activate
python -m pytest tests/test_avatar_service.py -v

# 4. Create A/B test:
#    - 50% users: LTX 2.3 (new)
#    - 50% users: infinitalk (old)
#    - Monitor for 3 days
#    - Compare: cost, quality, speed

# 5. If LTX 2.3 wins → Cutover 100%
# 6. Shut down infinitalk calls
# 7. Celebrate 💰
```

---

## Summary Output

After 3 hours, you should have:

```
✅ Infinitalk baseline cost: $___
✅ LTX 2.3 cost: $___
✅ Savings per avatar: $___
✅ Monthly savings projection: $___
✅ Decision: [Migrate / Stay / Test more]
✅ Migration plan: [3 days / skip / unknown]
```

---

## Success Criteria

You've succeeded if:

- [ ] You know infinitalk's actual cost
- [ ] You tested at least 2 FAL models
- [ ] LTX 2.3 cost is < infinitalk cost
- [ ] Quality is acceptable
- [ ] You have a migration timeline

If all checkmarks are true: **Start migration immediately. This is your highest-leverage optimization.**

---

## Failure Modes to Watch

**"Tests time out"**
→ Check FAL API key is correct
→ Check you have FAL credits
→ Try simpler requests first

**"Tests fail with auth error"**
→ Verify FAL_API_KEY is set correctly
→ Regenerate key from dashboard

**"LTX 2.3 is SLOWER than infinitalk"**
→ Still migrate if cost is lower
→ Speed improvement is nice-to-have, cost is critical

**"LTX 2.3 quality is lower"**
→ Test Kling O3 instead
→ Or add lip-sync layer
→ Or price it lower tier

---

## Go Time 🚀

Start with Task 1.1 right now. Time yourself. Report back in 3 hours with results.

