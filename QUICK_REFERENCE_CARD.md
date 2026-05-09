# Quick Reference Card

## When Coding a New API Endpoint

### Step 1: Is this Claude call required?

```
Do you need to process user text/data?
  YES → Go to Step 2
  NO → Skip Claude, just use business logic
```

### Step 2: What's the task complexity?

```python
# SIMPLE TASKS (math, formatting, validation)
# → Use HAIKU ✅ (CHEAPEST)
model = "claude-haiku-4-5-20251001"

# MEDIUM TASKS (enhancement, generation, suggestions)
# → Use SONNET ✅ (DEFAULT, BEST BALANCE)
model = "claude-sonnet-4-6"

# COMPLEX TASKS (reasoning, strategy, critical decisions)
# → Use OPUS ✅ (BEST BUT SLOWEST)
model = "claude-opus-4-6"
```

### Step 3: Code template

```python
from anthropic import Anthropic

client = Anthropic()

# Pick your model from Step 2 above
MODEL = "claude-sonnet-4-6"  # ← Change this

def my_endpoint(user_input: str) -> str:
    """Your endpoint logic"""
    
    message = client.messages.create(
        model=MODEL,
        max_tokens=500,  # Limit output length
        messages=[
            {
                "role": "user",
                "content": f"""Your task here.
                
                Input: {user_input}
                
                Be brief in response."""
            }
        ]
    )
    
    return message.content[0].text
```

---

## When Generating Video

### Step 1: Do you have a reference image?

```
Avatar image available?
  YES → Use SEEDANCE (Image-to-Video)
  NO → Use LTX 2.3 (Text-to-Video)
```

### Step 2: Cost calculation

```python
def calculate_video_cost(duration_sec: int, model: str) -> float:
    """Quick cost calculator"""
    
    if model == "seedance":
        # $0.18 per 5 seconds
        return round((duration_sec / 5) * 0.18, 3)
    
    elif model == "ltx-2.3":
        # $0.001605 per megapixel
        pixels_per_sec = 1280 * 720 * 25
        total_pixels = pixels_per_sec * duration_sec
        megapixels = total_pixels / 1_000_000
        return round(megapixels * 0.001605, 3)
    
    return 0.0

# Example:
cost_10s = calculate_video_cost(10, "seedance")  # $0.36
cost_15s = calculate_video_cost(15, "seedance")  # $0.54
cost_20s = calculate_video_cost(20, "seedance")  # $0.72
```

### Step 3: Call the right FAL model

```python
# SEEDANCE (Image-to-Video)
# Use when: You have avatar image
# Cost: ~$0.54 per 15s video
response = fal.run(
    "fal-ai/bytedance/seedance/v1/lite/image-to-video",
    input={
        "image_url": avatar_image_url,  # Your avatar
        "prompt": "Avatar speaking naturally",
        "duration": 15,
    }
)
video_url = response["video"]["url"]
cost = 0.54

# LTX 2.3 (Text-to-Video)
# Use when: No avatar image, text-driven
# Cost: ~$0.554 per 15s video
response = fal.run(
    "fal-ai/ltx-2.3-22b/text-to-video",
    input={
        "prompt": "A professional presentation about products",
        "duration": 15,
        "num_inference_steps": 25,
    }
)
video_url = response["video"]["url"]
cost = 0.554
```

---

## Decision Trees (Use These!)

### Claude Model Selection Tree

```
Is this task latency-sensitive (< 100ms)?
├─ YES → HAIKU ✅
│   └─ Script duration estimate
│   └─ Cost calculation
│   └─ Simple validation
│
├─ Needs high quality output?
│   ├─ YES, medium complexity → SONNET ✅
│   │   └─ Script enhancement
│   │   └─ Template generation
│   │   └─ Metadata enrichment
│   │
│   └─ YES, critical decision → OPUS ✅
│       └─ Creator strategy
│       └─ Revenue analysis
│       └─ Complex reasoning
│
└─ If unsure → DEFAULT TO SONNET ✅
```

### FAL Model Selection Tree

```
What are you generating?
├─ Avatar talking about product
│  └─ Have avatar image? → YES → SEEDANCE ✅ ($0.54)
│                         NO → LTX 2.3 ✅ ($0.554)
│
├─ Generic creative video
│  └─ Have reference image? → YES → SEEDANCE ✅
│                            NO → LTX 2.3 ✅
│
├─ Influencer/creator video
│  └─ Have creator image? → YES → SEEDANCE ✅
│                          NO → LTX 2.3 ✅
│
└─ Background/conceptual video
   └─ Use LTX 2.3 ✅ (text-driven)
```

---

## Pricing Quick Reference

### Cost Breakdown (15 seconds @ 720p)

| Model | Component | Cost |
|-------|-----------|------|
| **SEEDANCE** | Video generation | $0.54 |
| | TTS (100 chars) | $0.015 |
| | **Total** | **$0.555** |
| | Your price | $1.99 |
| | Your margin | **71%** ✅ |
|---|---|---|
| **LTX 2.3** | Video generation | $0.554 |
| | TTS (100 chars) | $0.015 |
| | **Total** | **$0.569** |
| | Your price | $0.99 |
| | Your margin | **44%** ⚠️ |

### Recommended Pricing Tiers

```
FREE TIER:
  - Static image (no video)
  - Cost to you: $0
  - Revenue: $0
  - Purpose: Freemium trial

STARTER ($0.99, 99 credits):
  - 1 LTX 2.3 video (generic)
  - OR 1 Seedance video (avatar)
  - Cost: ~$0.57
  - Margin: 43% ⚠️

PRO ($1.99, 199 credits):
  - 3 Seedance avatar videos
  - Cost: $0.54 × 3 = $1.62
  - Margin: 19% ❌ TOO LOW

BETTER PRO ($2.99, 299 credits):
  - 5 Seedance avatar videos
  - Cost: $0.54 × 5 = $2.70
  - Margin: 10% ❌ STILL LOW

PREMIUM ($4.99, 499 credits):
  - 8 Seedance videos
  - OR 5 Seedance + 3 LTX 2.3
  - Cost: ~$3.50
  - Margin: 30% ✅ GOOD

ENTERPRISE (Custom):
  - Bulk pricing
  - Cost: ~$0.40 per video (negotiated)
  - Margin: 60%+ ✅ EXCELLENT
```

---

## Code Snippets (Copy-Paste Ready)

### Haiku: Quick Calculation

```python
from anthropic import Anthropic

def estimate_script_duration(script: str) -> float:
    """Use HAIKU for simple math/estimation"""
    
    client = Anthropic()
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",  # ← HAIKU
        max_tokens=50,
        messages=[{
            "role": "user",
            "content": f"Script duration in seconds: '{script}'"
        }]
    )
    return float(message.content[0].text.strip().split()[0])

# Usage:
duration = estimate_script_duration("Hello, buy this product now!")
print(f"Estimated: {duration} seconds")
```

### Sonnet: Script Enhancement

```python
from anthropic import Anthropic

def enhance_script(script: str, language: str) -> str:
    """Use SONNET for content enhancement"""
    
    client = Anthropic()
    message = client.messages.create(
        model="claude-sonnet-4-6",  # ← SONNET (DEFAULT)
        max_tokens=300,
        messages=[{
            "role": "user",
            "content": f"""Enhance this {language} script for a 15-second avatar video.
            Make it engaging, add natural pauses. Keep under 100 words.
            
            Original: {script}
            
            Enhanced:"""
        }]
    )
    return message.content[0].text.strip()

# Usage:
enhanced = enhance_script("Buy our product", "English")
print(enhanced)
```

### Opus: Complex Analysis

```python
from anthropic import Anthropic

def analyze_user_behavior(user_data: dict) -> dict:
    """Use OPUS for critical business decisions"""
    
    client = Anthropic()
    message = client.messages.create(
        model="claude-opus-4-6",  # ← OPUS (EXPENSIVE BUT BEST)
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": f"""Analyze this user and recommend conversion strategy:
            
            Generated videos: {user_data['videos_generated']}
            Last activity: {user_data['last_active']}
            Avg script length: {user_data['avg_script_length']}
            Failed attempts: {user_data['failed_attempts']}
            
            Provide:
            1. Why they haven't upgraded (be specific)
            2. Recommended offer
            3. Success probability
            
            User data: {user_data}"""
        }]
    )
    return {"analysis": message.content[0].text}

# Usage (use sparingly, expensive!):
analysis = analyze_user_behavior({
    'videos_generated': 3,
    'last_active': '2 days ago',
    'avg_script_length': 50,
    'failed_attempts': 2,
})
```

### Seedance: Avatar Video

```python
import requests

def generate_avatar_video(avatar_image_url: str, script: str) -> tuple[str, float]:
    """Generate avatar video with SEEDANCE"""
    
    # Estimate cost first
    duration = estimate_duration(script)
    cost = (duration / 5) * 0.18
    
    # Call Seedance
    response = requests.post(
        "https://api.fal.ai/queue/fal-ai/bytedance/seedance/v1/lite/image-to-video/submit",
        headers={"Authorization": f"Key {FAL_API_KEY}"},
        json={
            "image_url": avatar_image_url,
            "prompt": f"Avatar speaking naturally: {script}",
            "duration": int(duration),
        }
    )
    
    request_id = response.json()["request_id"]
    
    # Poll until complete
    result = poll_fal_job(request_id)
    
    return result["video"]["url"], cost

# Usage:
video_url, cost = generate_avatar_video(
    avatar_image_url="https://your-storage.com/priya.jpg",
    script="This product changes everything!"
)
print(f"Video: {video_url}")
print(f"Cost: ${cost}")
```

### LTX 2.3: Generic Video

```python
import requests

def generate_generic_video(prompt: str, duration: int = 15) -> tuple[str, float]:
    """Generate generic video with LTX 2.3"""
    
    # Calculate cost
    pixels_per_sec = 1280 * 720 * 25
    total_pixels = pixels_per_sec * duration
    megapixels = total_pixels / 1_000_000
    cost = megapixels * 0.001605
    
    # Call LTX 2.3
    response = requests.post(
        "https://api.fal.ai/queue/fal-ai/ltx-2.3-22b/text-to-video/submit",
        headers={"Authorization": f"Key {FAL_API_KEY}"},
        json={
            "prompt": prompt,
            "duration": duration,
            "num_inference_steps": 25,
        }
    )
    
    request_id = response.json()["request_id"]
    result = poll_fal_job(request_id)
    
    return result["video"]["url"], cost

# Usage:
video_url, cost = generate_generic_video(
    prompt="Professional product presentation video",
    duration=15
)
print(f"Video: {video_url}")
print(f"Cost: ${cost}")
```

---

## Common Mistakes to Avoid

### ❌ WRONG: Using Opus for everything
```python
# This is expensive and slow
message = client.messages.create(
    model="claude-opus-4-6",  # WRONG - too expensive
    messages=[{
        "role": "user",
        "content": "What's the duration of this script: Hello"
    }]
)
```

### ✅ RIGHT: Use right model for task
```python
# This is cheap and fast
message = client.messages.create(
    model="claude-haiku-4-5-20251001",  # RIGHT - fits task
    messages=[{
        "role": "user",
        "content": "What's the duration of this script: Hello"
    }]
)
```

### ❌ WRONG: Calling LTX 2.3 without reference image, then Seedance
```python
# This is wasteful - figure out which model first
video1 = generate_ltx_2_3_video(prompt)  # Wrong model
video2 = generate_seedance_video(image)  # Right model later
```

### ✅ RIGHT: Decide model first, then call once
```python
# This is efficient
if has_avatar_image:
    video = generate_seedance_video(image, prompt)  # ONE call
else:
    video = generate_ltx_2_3_video(prompt)  # ONE call
```

---

## Your First Task (Start Now!)

### Option 1: Implement Claude Model Routing
```python
# Create: apps/api/app/services/claude_router.py
# Add: select_model(task_type) -> returns best model
# Test: 5 different endpoint types
# Estimate: 45 minutes
```

### Option 2: Implement FAL Model Routing
```python
# Create: apps/api/app/services/fal_router.py
# Add: select_model(has_image, use_case) -> returns best model
# Test: Avatar vs. generic videos
# Estimate: 1 hour
```

### Option 3: Cost Estimation Endpoint
```python
# Add: POST /api/estimate-cost
# Takes: {use_case, script, duration}
# Returns: {cost_usd, credits_needed, model_used}
# Test: 10 different scenarios
# Estimate: 1.5 hours
```

**Do Option 1 first** - It saves money immediately.

---

## Cost Savings from Right Model Selection

### Before (Wrong Models)
```
100 users, 2 videos/month = 200 videos/month
If all use expensive models: 200 × $0.70 = $140/month cost

Free tier margin: negative (paying for free users)
Paid tier margin: 30% (barely profitable)
```

### After (Right Models)
```
100 users, 2 videos/month = 200 videos/month
Using smart routing:
- 120 Seedance ($0.54) = $64.80
- 80 LTX 2.3 ($0.554) = $44.32
Total cost: $109.12/month

Free tier margin: less negative
Paid tier margin: 55% (much better!)
Savings: $30/month × 12 = $360/year
```

**Scale to 1,000 users:** $3,600/year saved just by routing correctly.

---

## Bookmarks (Save These Links)

- [Anthropic Claude Models Docs](https://docs.anthropic.com/en/docs/models/overview)
- [LTX 2.3 API](https://fal.ai/models/fal-ai/ltx-2.3-22b/image-to-video/api)
- [Seedance API](https://fal.ai/models/fal-ai/bytedance/seedance/v1/lite/image-to-video/api)
- [Your FAL Dashboard](https://fal.ai/dashboard)

---

## Questions? Use This Flowchart

```
Do I need to process text?
├─ NO → Don't use Claude
├─ YES, SIMPLE (estimate, validate, math) → HAIKU
├─ YES, MEDIUM (enhance, generate) → SONNET
├─ YES, COMPLEX (reasoning, strategy) → OPUS
└─ UNSURE → DEFAULT TO SONNET
```

