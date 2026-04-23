import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from huggingface_hub import InferenceClient


def load_local_env_file() -> None:
    current_file = Path(__file__).resolve()
    api_root = current_file.parents[1]
    env_path = api_root / ".env"

    print(f"Looking for .env at: {env_path}")

    if not env_path.exists():
        print("No .env file found.")
        return

    load_dotenv(env_path, override=True)
    print(".env file found. Loaded with python-dotenv.")


def call_model(client: InferenceClient, model: str, prompt: str, label: str) -> dict:
    print(f"\n=== RUNNING {label} ===\n")

    response = client.chat_completion(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "You generate clean structured JSON for short ad pipelines.",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        max_tokens=700,
    )

    content = response.choices[0].message.content if response.choices else None

    print(f"=== RAW MODEL OUTPUT: {label} ===\n")
    print(content)

    if not content:
        raise ValueError(f"{label}: Empty response from model.")

    parsed = json.loads(content)

    print(f"\n=== PARSED JSON: {label} ===\n")
    print(json.dumps(parsed, indent=2, ensure_ascii=False))

    return parsed


def build_v1_prompt(user_input: dict) -> str:
    return f"""
You are an ad-script enhancer for short AI-generated product ads.

Your task:
Convert the input into a strict JSON response for a 3-scene avatar product ad.

Rules:
- Scene 1 = Hook
- Scene 2 = Product showcase
- Scene 3 = CTA
- Keep spoken lines short and natural
- Do not use exaggerated hype
- Keep each spoken line under 18 words
- Scene 2 visual prompt must be suitable for image-to-video generation
- Return only valid JSON
- No markdown
- No explanation

Required JSON format:
{{
  "hook_line": "...",
  "showcase_line": "...",
  "cta_line": "...",
  "showcase_visual_prompt": "...",
  "notes": ["...", "..."]
}}

Input:
{json.dumps(user_input, ensure_ascii=False)}
""".strip()


def build_v2_prompt(user_input: dict) -> str:
    return f"""
You are an ad-script enhancer for short AI-generated avatar product ads.

Your task:
Convert the input into a strict JSON response for a 3-scene ad.

The goal is to sound like a real creator speaking naturally, not like generic ad copy.

Hard rules:
- Return only valid JSON
- No markdown
- No explanations
- Scene 1 = Hook
- Scene 2 = Product showcase
- Scene 3 = CTA

Speech rules:
- hook_line must be 12 words or fewer
- showcase_line must be 14 words or fewer
- cta_line must be 10 words or fewer
- Keep spoken lines conversational and believable
- Sound like a real creator talking casually to camera
- Do not sound like a corporate ad
- Avoid hype and avoid exaggerated claims
- Avoid these words unless absolutely necessary:
  ["perfect", "revolutionary", "must-have", "glow-up", "amazing", "best", "premium", "game-changing"]
- No hashtags
- No emojis

Visual prompt rules for showcase_visual_prompt:
- Must be optimized for realistic image-to-video generation
- Must clearly mention:
  1. subject
  2. camera framing
  3. product visibility
  4. simple action or motion
  5. lighting
  6. realistic look
- Keep it one sentence
- Do not write it like marketing copy

Notes rules:
- Include short implementation notes useful for downstream video generation
- Mention product visibility, texture, handling, or realism if relevant

Required JSON format:
{{
  "hook_line": "...",
  "showcase_line": "...",
  "cta_line": "...",
  "showcase_visual_prompt": "...",
  "voice_tone": "...",
  "notes": ["...", "..."]
}}

Input:
{json.dumps(user_input, ensure_ascii=False)}
""".strip()


def build_v3_prompt(user_input: dict) -> str:
    return f"""
You are an ad-script enhancer for short AI-generated avatar product ads.

Your job is to create a believable 3-scene creator-style product ad.
The output must sound like a real person casually recommending a product, not like ad copy.

Return only valid JSON.
No markdown.
No explanation.

Scene structure:
- Scene 1 = Hook
- Scene 2 = Product experience / showcase
- Scene 3 = Soft CTA

Hard speech rules:
- hook_line: 10 words or fewer
- showcase_line: 12 words or fewer
- cta_line: 10 words or fewer
- Simple spoken English
- Casual, natural, believable
- One idea per line
- No greetings
- No exclamation marks unless absolutely necessary
- No hype
- No corporate ad tone
- No direct hard-sell CTA

Do not use phrases like:
["hey there", "glow-up", "trust me", "perfect", "must-have", "amazing", "best", "premium", "shop now", "get your bottle now", "order now", "buy now"]

Style guidance:
- Hook should feel like a relatable personal observation
- Showcase should mention feel, texture, or use experience
- CTA should feel soft, like a suggestion

Bad examples:
- "Hey there, glowing skin lovers!"
- "This serum gives you that natural glow, trust me!"
- "Get your bottle now!"

Good examples:
- "My skin felt dull, so I tried this."
- "It feels light and absorbs really fast."
- "Worth trying if you want a simple glow."

Visual prompt rules for showcase_visual_prompt:
- One sentence only
- Must include:
  1. avatar/creator
  2. product clearly visible
  3. actual action with product
  4. camera framing
  5. lighting
  6. realistic look
- Write it for realistic image-to-video generation
- Do not write marketing copy

Required JSON format:
{{
  "hook_line": "...",
  "showcase_line": "...",
  "cta_line": "...",
  "showcase_visual_prompt": "...",
  "voice_tone": "...",
  "notes": ["...", "..."]
}}

Input:
{json.dumps(user_input, ensure_ascii=False)}
""".strip()


def main() -> int:
    load_local_env_file()

    hf_token = os.getenv("HF_TOKEN")
    model = os.getenv("HF_QWEN_MODEL", "Qwen/Qwen2.5-7B-Instruct")
    provider = os.getenv("HF_QWEN_PROVIDER", "auto")
    timeout_seconds = int(os.getenv("HF_QWEN_TIMEOUT", "90"))

    if not hf_token:
        print("ERROR: HF_TOKEN not found in environment or .env")
        return 1

    client = InferenceClient(
        provider=provider,
        api_key=hf_token,
        timeout=timeout_seconds,
    )

    user_input = {
        "product_name": "Vitamin C Face Serum",
        "product_type": "Skincare serum",
        "target_audience": "Women aged 22-35 interested in glowing skin",
        "avatar_style": "Friendly Indian female creator speaking naturally",
        "brand_tone": "Trustworthy, simple, modern",
        "brief": "Create a short product ad where the avatar introduces the serum, highlights glowing skin and lightweight feel, and ends with a clear call to action."
    }

    v2_prompt = build_v2_prompt(user_input)
    v3_prompt = build_v3_prompt(user_input)

    try:
        v2_result = call_model(client, model, v2_prompt, "V2")
        v3_result = call_model(client, model, v3_prompt, "V3")

        print("\n=== SIDE BY SIDE SUMMARY ===\n")

        fields = [
            "hook_line",
            "showcase_line",
            "cta_line",
            "showcase_visual_prompt",
            "voice_tone",
            "notes",
        ]

        for field in fields:
            print(f"{field}:")
            print(f"  V2 -> {v2_result.get(field)}")
            print(f"  V3 -> {v3_result.get(field)}")
            print()

        print("SUCCESS: V2 vs V3 comparison completed.")
        return 0

    except json.JSONDecodeError as exc:
        print(f"\nERROR: Response was not valid JSON: {exc}")
        return 1
    except Exception as exc:
        print(f"\nERROR: {type(exc).__name__}: {exc}")
        return 1

if __name__ == "__main__":
    sys.exit(main())