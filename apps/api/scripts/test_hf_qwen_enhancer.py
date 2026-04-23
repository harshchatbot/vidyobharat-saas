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

    prompt = f"""
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

    try:
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
            max_tokens=500,
        )

        content = response.choices[0].message.content if response.choices else None

        print("\n=== RAW MODEL OUTPUT ===\n")
        print(content)

        if not content:
            print("\nERROR: Empty response.")
            return 1

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            print(f"\nERROR: Response was not valid JSON: {exc}")
            return 1

        print("\n=== PARSED JSON ===\n")
        print(json.dumps(parsed, indent=2, ensure_ascii=False))

        print("\nSUCCESS: Qwen enhancer test completed.")
        return 0

    except Exception as exc:
        print(f"\nERROR: {type(exc).__name__}: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())