# Complete Model Selection Guide for RangManch AI

## Part 1: Claude Model Selection (For Your Backend APIs)

You have 3 Claude models available for different tasks. Choose based on:
1. **Task Complexity**
2. **Cost vs. Quality Trade-off**
3. **Latency Requirements**

### The Three Claude Models

| Model | Speed | Quality | Cost | Best For |
|-------|-------|---------|------|----------|
| **Claude Haiku 4.5** | ⚡ Fastest | ✅ Good | 💰 Cheapest | Simple, fast, high-volume |
| **Claude Sonnet 4.6** | ⚙️ Balanced | ✅✅ Great | 💵 Mid-range | Most production tasks |
| **Claude Opus 4.6** | 🐢 Slowest | ✅✅✅ Best | 💳 Most Expensive | Complex reasoning, accuracy critical |

---

## When to Use Each Claude Model

### 🔵 Use Haiku for:

**Cost: Cheapest (~60% cheaper than Sonnet)**

1. **Simple text transformations**
   - Format conversions
   - Basic prompt templates
   - Script validation

2. **High-volume, low-complexity tasks**
   - Generate 100s of templates
   - Batch script cleanup
   - Tag generation from descriptions

3. **Real-time user-facing features**
   - Script length estimation
   - Cost calculation (simple math)
   - Metadata extraction

**Example in your code:**
```python
# apps/api/app/services/script_service.py

class ScriptService:
    def estimate_script_duration(self, script: str) -> float:
        """
        Task: Convert word count to duration estimate
        Complexity: LOW (simple math)
        Latency requirement: IMMEDIATE
        
        Use: Haiku ✅
        """
        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=100,
            messages=[{
                "role": "user",
                "content": f"Estimate duration in seconds for this script: {script}"
            }]
        )
        return float(message.content[0].text)

    def validate_script_quality(self, script: str) -> dict:
        """
        Task: Check if script is "good" (grammar, length)
        Complexity: LOW
        Use: Haiku ✅
        """
        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": f"""Rate this script on:
                1. Grammar (✓/✗)
                2. Length appropriate for {duration}s video (✓/✗)
                3. Clarity (✓/✗)
                
                Script: {script}"""
            }]
        )
        return parse_response(message.content[0].text)
```

**Cost impact:** For 1,000 scripts/day = ~$1-2/day

---

### 🟢 Use Sonnet for:

**Cost: Mid-range (~baseline)**

1. **Most production API endpoints**
   - Script enhancement
   - Prompt template generation
   - Metadata enrichment

2. **Content generation with quality**
   - Generate product descriptions
   - Create video outlines
   - Build prompt variations

3. **Decision-making logic**
   - Route user to right template
   - Score content quality
   - Suggest improvements

**Example in your code:**
```python
# apps/api/app/services/script_enhancement_service.py

class ScriptEnhancementService:
    def enhance_script(self, script: str, language: str) -> str:
        """
        Task: Improve script quality (add emotion, clarity)
        Complexity: MEDIUM
        Latency: 3-5 seconds acceptable
        
        Use: Sonnet ✅ (default for most endpoints)
        """
        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-sonnet-4-6",  # ← Sonnet
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": f"""Enhance this avatar script for {language}:
                - Make it more engaging
                - Keep it under 15 seconds of audio
                - Add natural emotion/pauses
                
                Original: {script}
                
                Return only the enhanced script, no explanation."""
            }]
        )
        return message.content[0].text
    
    def generate_avatar_prompt(self, script: str, avatar_name: str, emotion: str) -> str:
        """
        Task: Create detailed avatar behavior prompt
        Complexity: MEDIUM-HIGH
        Use: Sonnet ✅ (can handle nuance)
        """
        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": f"""Create a detailed prompt for avatar video generation:
                
                Avatar: {avatar_name}
                Emotion: {emotion}
                Script: {script}
                
                Include:
                1. Avatar positioning
                2. Hand gestures
                3. Facial expressions
                4. Eye contact patterns
                5. Movement pacing"""
            }]
        )
        return message.content[0].text
```

**Cost impact:** For API endpoints, typical cost is $0.001-0.01 per request

---

### 🔴 Use Opus for:

**Cost: Most expensive (~3x Haiku, ~2x Sonnet)**

1. **Complex reasoning that must be correct**
   - Script analysis for multiple languages
   - Multi-step content strategy
   - Pricing/monetization decisions

2. **One-time batch operations**
   - Analyze user behavior patterns
   - Generate marketing copy variations
   - Create admin dashboards

3. **When output quality directly impacts revenue**
   - High-value creator support
   - Enterprise features
   - Internal decision-making

**Example in your code:**
```python
# apps/api/admin/scripts/analyze_creator_behavior.py

class CreatorAnalyzer:
    def analyze_creator_behavior(self, user_id: str, interactions: list) -> dict:
        """
        Task: Analyze why creator isn't converting to premium
        Complexity: HIGH (requires reasoning across multiple data points)
        Use: Opus ✅ (critical business decision)
        
        This analysis affects:
        - Custom pricing offers
        - Feature recommendations
        - Support priority
        """
        client = anthropic.Anthropic()
        
        message = client.messages.create(
            model="claude-opus-4-6",  # ← Opus, heavy reasoning
            max_tokens=1000,
            messages=[{
                "role": "user",
                "content": f"""Analyze this creator's behavior and suggest strategy:
                
                Creator: {user_id}
                Free tier? Yes
                Generated videos: {interactions['videos']}
                Last activity: {interactions['last_active']}
                Script types: {interactions['script_types']}
                Failed generations: {interactions['failures']}
                
                Provide:
                1. Likely reason for not upgrading
                2. Recommended personalized offer
                3. Specific feature to highlight
                4. Estimated conversion probability
                
                Be strategic and data-driven."""
            }]
        )
        
        return parse_analysis(message.content[0].text)
```

**Cost impact:** Use sparingly - maybe $5-20/month on batch operations

---

## Decision Matrix for Claude Model

```
Task Type                  | Latency    | Quality  | Volume | Model
---------------------------|----------|----------|--------|--------
Script duration estimate    | <100ms   | Low      | High   | HAIKU ✅
Script validation          | <500ms   | Medium   | High   | HAIKU ✅
Cost calculation           | <100ms   | Low      | Very high | HAIKU ✅
---------------------------|----------|----------|--------|--------
Script enhancement         | <3s      | High     | Medium | SONNET ✅
Avatar prompt generation   | <3s      | High     | Medium | SONNET ✅
Metadata enrichment        | <3s      | High     | Medium | SONNET ✅
Template suggestions       | <5s      | High     | Low    | SONNET ✅
---------------------------|----------|----------|--------|--------
Creator behavior analysis  | <10s     | Critical | Very low | OPUS ✅
Revenue strategy planning  | <10s     | Critical | Very low | OPUS ✅
Complex multi-step tasks   | <10s     | Critical | Very low | OPUS ✅
```

---

## Part 2: FAL Video Model Selection

Now for your video generation models:

### Your Current Setup

You're using:
- **LTX 2.3** for text-to-video
- **Seedance** for image-to-video

**Key question:** Which should you use when?

---

## LTX 2.3 vs Seedance Comparison

### LTX 2.3 (Text-to-Video)

**Pricing:** $0.001605 per megapixel
```
1280×720 @ 25fps for 15 seconds:
Pixels = 1280 × 720 × 375 frames = 345.6M pixels
Cost = 345.6 × $0.001605 = $0.554
```

**Strengths:**
- ✅ Works directly from text prompt
- ✅ Good for abstract/conceptual videos
- ✅ No need for reference image
- ✅ Relatively cheap

**Weaknesses:**
- ❌ Less control over avatar appearance
- ❌ Can't ensure avatar matches brand
- ❌ Inconsistent across generations

**Best for:**
- Generic product demos
- Background videos
- When you don't have avatar image

---

### Seedance (Image-to-Video)

**Pricing:** $0.18 per 5 seconds @ 720p
```
For 15 seconds:
Cost = (15 / 5) × $0.18 = 3 × $0.18 = $0.54
```

**Strengths:**
- ✅ Starts from avatar image (consistent)
- ✅ Perfect for talking avatars
- ✅ User can control avatar appearance
- ✅ Slightly cheaper than LTX 2.3
- ✅ Better quality for avatars

**Weaknesses:**
- ❌ Requires good reference image
- ❌ Can't generate new avatar features

**Best for:**
- Avatar product demos (your main use case!)
- Influencer videos
- Consistent brand presence

---

## When to Use Which FAL Model

### 🟢 Use Seedance for avatar_product flow

```python
# apps/api/app/services/avatar_product_service.py

class AvatarProductService:
    def generate_product_demo(
        self,
        avatar_image_url: str,  # ← Reference image (required)
        script: str,
        duration_seconds: int = 15,
    ) -> str:
        """
        User flow: Avatar Product Demo
        - User selects avatar (Priya, Shubh, etc.)
        - System has reference image for each
        - Generate video showing product
        
        Use: SEEDANCE ✅ (image-based, consistent)
        """
        cost = self.calculate_seedance_cost(duration_seconds)
        
        # Call Seedance I2V
        video_url = call_fal(
            model="fal-ai/bytedance/seedance/v1/lite/image-to-video",
            inputs={
                "image_url": avatar_image_url,
                "prompt": f"Avatar speaking: {script}",
                "duration": duration_seconds,
            }
        )
        
        return {
            'video_url': video_url,
            'cost_usd': cost,
            'model': 'seedance',
        }
```

**Cost:** $0.54 per 15-second avatar
**Why:** You have the avatar image, Seedance is built for this

---

### 🔵 Use LTX 2.3 for generic content

```python
# apps/api/app/services/content_generation_service.py

class ContentGenerationService:
    def generate_background_video(
        self,
        prompt: str,
        duration_seconds: int = 15,
    ) -> str:
        """
        User flow: Generate generic background/b-roll
        - No avatar needed
        - User just provides text description
        - System generates video from scratch
        
        Use: LTX 2.3 ✅ (text-to-video)
        """
        cost = self.calculate_ltx_cost(duration_seconds)
        
        video_url = call_fal(
            model="fal-ai/ltx-2.3-22b/text-to-video",
            inputs={
                "prompt": prompt,
                "duration": duration_seconds,
                "num_inference_steps": 25,
            }
        )
        
        return {
            'video_url': video_url,
            'cost_usd': cost,
            'model': 'ltx-2.3',
        }
```

**Cost:** $0.554 per 15-second video
**Why:** No avatar image needed, flexible text input

---

## Decision Matrix for FAL Models

| Use Case | Avatar Image? | Control Needed? | Model | Cost/15s |
|----------|---|---|---|---|
| Avatar product demo | ✅ Yes | High | **SEEDANCE** | $0.54 |
| Avatar talking video | ✅ Yes | High | **SEEDANCE** | $0.54 |
| Influencer video | ✅ Yes | High | **SEEDANCE** | $0.54 |
| Generic background | ❌ No | Medium | **LTX 2.3** | $0.554 |
| Conceptual animation | ❌ No | Low | **LTX 2.3** | $0.554 |
| Music video style | ❌ No | Low | **LTX 2.3** | $0.554 |

---

## Your Architecture Decision

Based on your code and use case:

```
User selects:
├── Avatar Product Demo (your main revenue)
│   └── Use SEEDANCE I2V ($0.54)
│       └── Input: Avatar image + script
│       └── Output: Avatar speaking product benefits
│
├── Generic Video
│   └── Use LTX 2.3 T2V ($0.554)
│       └── Input: Text prompt
│       └── Output: Any creative video
│
└── Influencer Content
    └── Use SEEDANCE I2V ($0.54)
        └── Input: Influencer image + caption
        └── Output: Short influencer video
```

---

## Implementation: Smart Model Routing

```python
# apps/api/app/services/video_generation_router.py

class VideoGenerationRouter:
    """
    Automatically select best FAL model based on user input
    """
    
    def select_model(
        self,
        has_reference_image: bool,
        use_case: str,  # 'avatar_product', 'generic', 'influencer'
        user_tier: str,  # 'free', 'starter', 'pro'
    ) -> str:
        """
        Route to best model for cost optimization
        """
        
        # Rule 1: If we have reference image → Seedance (for consistency)
        if has_reference_image and use_case in ['avatar_product', 'influencer']:
            return "seedance"  # $0.54/15s
        
        # Rule 2: No reference image → LTX 2.3 (text-driven)
        if not has_reference_image:
            return "ltx-2.3"  # $0.554/15s
        
        # Rule 3: Free tier → Always use cheaper option
        if user_tier == 'free':
            return "seedance" if has_reference_image else "ltx-2.3"
        
        # Rule 4: Pro tier → Can experiment with premium models
        if user_tier == 'pro' and use_case == 'avatar_product':
            # Later: Could use Kling for premium avatar
            return "seedance"
        
        # Default
        return "seedance" if has_reference_image else "ltx-2.3"

    def estimate_cost(
        self,
        model: str,
        duration_seconds: int,
        resolution: str = '720p',
    ) -> float:
        """Calculate cost for selected model"""
        
        if model == "seedance":
            # $0.18 per 5 seconds @ 720p
            cost = (duration_seconds / 5) * 0.18
            return round(cost, 3)
        
        elif model == "ltx-2.3":
            # $0.001605 per megapixel
            pixels_per_sec = 1280 * 720 * 25  # 720p @ 25fps
            total_pixels = pixels_per_sec * duration_seconds
            megapixels = total_pixels / 1_000_000
            cost = megapixels * 0.001605
            return round(cost, 3)
        
        return 0.0
```

---

## Your Pricing Strategy

Based on these costs:

### Budget Tier (Seedance)
- Model: Seedance I2V
- User sees: Avatar product demo
- Your cost: $0.54 per video
- Your price: $1.99 (100+ credits)
- **Margin: 73%** ✅

### Standard Tier (LTX 2.3)
- Model: LTX 2.3 T2V
- User sees: Generic creative video
- Your cost: $0.554 per video
- Your price: $0.99 (99 credits)
- **Margin: 44%** ⚠️ (consider raising)

### Premium Tier (Multiple models)
- Model: Multiple (Seedance + LTX 2.3 + optional Kling)
- User sees: Choice of styles
- Your cost: $0.54-2.00
- Your price: $4.99 (499 credits)
- **Margin: 60%** ✅

---

## Summary: Which Model When?

### Claude Models
```
High volume, simple? → HAIKU (60% cheaper)
Most tasks? → SONNET (default, good balance)
Critical decision? → OPUS (best reasoning)
```

### FAL Video Models
```
Avatar product demo? → SEEDANCE ($0.54/15s)
Generic video? → LTX 2.3 ($0.554/15s)
Both about same price → Choose based on use case
```

---

## Next Steps

1. **Implement VideoGenerationRouter** (1 hour)
   - Route to Seedance for avatars
   - Route to LTX 2.3 for generic
   - Calculate costs automatically

2. **Update pricing** (30 min)
   - Avatar product: 100-199 credits
   - Generic video: 99 credits
   - Bundle: 499 credits

3. **Test both models** (2 hours)
   - Generate 5 avatar videos with Seedance
   - Generate 5 generic videos with LTX 2.3
   - Compare quality, speed, cost

4. **Monitor costs** (ongoing)
   - Log which model was used
   - Log actual vs. estimated cost
   - Optimize pricing based on data

