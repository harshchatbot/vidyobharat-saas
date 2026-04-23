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

    print(f"HF_TOKEN present: {bool(hf_token)}")
    if hf_token:
        print(f"HF_TOKEN prefix: {hf_token[:10]}... len={len(hf_token)}")
    print(f"HF_QWEN_MODEL: {model}")
    print(f"HF_QWEN_PROVIDER: {provider}")
    print(f"HF_QWEN_TIMEOUT: {timeout_seconds}")

    if not hf_token:
        print("ERROR: HF_TOKEN not found in environment or .env")
        return 1

    try:
        client = InferenceClient(
            provider=provider,
            api_key=hf_token,
            timeout=timeout_seconds,
        )

        response = client.chat_completion(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Reply with exactly: HF connectivity working"},
            ],
            max_tokens=30,
        )

        message = response.choices[0].message.content if response.choices else None

        print("\nAssistant Reply:")
        print(message)

        if message and "HF connectivity working" in message:
            print("\nSUCCESS: Hugging Face connectivity is working.")
            return 0

        print("\nWARNING: Request succeeded but response content was unexpected.")
        return 1

    except Exception as exc:
        print(f"\nERROR: {type(exc).__name__}: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())