from __future__ import annotations

import argparse
from datetime import datetime, timezone
from uuid import uuid4

import firebase_admin
from firebase_admin import credentials, firestore, storage


def firebase_download_url(bucket_name: str, storage_path: str, token: str) -> str:
    encoded_path = storage_path.replace("/", "%2F")
    return f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/{encoded_path}?alt=media&token={token}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed one RangManch reference-image avatar into Firestore avatars collection.")
    parser.add_argument("--service-account", default="service-account.json")
    parser.add_argument("--bucket", required=True, help="Firebase storage bucket, e.g. rangmanch-ai-backend.firebasestorage.app")
    parser.add_argument("--avatar-id", required=True, help="Example: av-charulata")
    parser.add_argument("--name", required=True, help="Example: Charulata")
    parser.add_argument("--gender", default="female", choices=["female", "male"])
    parser.add_argument("--storage-path", required=True, help="Example: avatars/charulata/avtaar_charulata.jpeg")
    parser.add_argument("--voice", default="Priya")
    parser.add_argument("--style", default="premium lifestyle creator")
    parser.add_argument("--category", default="ugc_creator")
    parser.add_argument(
        "--description",
        default="Elegant Indian creator avatar suitable for premium UGC ads.",
    )
    args = parser.parse_args()

    if not firebase_admin._apps:
        cred = credentials.Certificate(args.service_account)
        firebase_admin.initialize_app(
            cred,
            {
                "storageBucket": args.bucket,
            },
        )

    db = firestore.client()
    bucket = storage.bucket()

    blob = bucket.blob(args.storage_path)
    if not blob.exists():
        raise FileNotFoundError(f"Storage file not found: gs://{args.bucket}/{args.storage_path}")

    token = str(uuid4())
    existing_metadata = blob.metadata or {}
    existing_metadata["firebaseStorageDownloadTokens"] = token
    blob.metadata = existing_metadata
    blob.cache_control = "public,max-age=31536000"
    blob.patch()

    image_url = firebase_download_url(args.bucket, args.storage_path, token)
    now = datetime.now(timezone.utc)

    doc = {
        "id": args.avatar_id,
        "avatar_id": args.avatar_id,
        "persona_id": args.avatar_id,
        "name": args.name,
        "display_name": args.name,
        "gender": args.gender,
        "provider": "reference_image",
        "avatar_type": "system",
        "type": "system",
        "scope": "public",
        "visibility": "public",
        "status": "active",
        "category": args.category,
        "style": args.style,
        "tags": [
            "indian_creator",
            "premium",
            "ugc",
            "fashion",
            "lifestyle",
            "jewellery",
            "clothing",
        ],
        "language_support": ["en-IN", "hi-IN"],
        "supported_languages": ["English", "Hindi"],
        "reference_images": [image_url],
        "reference_image_url": image_url,
        "primary_image": image_url,
        "avatar_image_url": image_url,
        "thumbnail_url": image_url,
        "preview_video_url": None,
        "recommended_voice": args.voice,
        "description": args.description,
        "created_by": "system",
        "updated_at": now,
    }

    db.collection("avatars").document(args.avatar_id).set(doc, merge=True)

    print("DONE")
    print("avatar_id:", args.avatar_id)
    print("name:", args.name)
    print("storage_path:", args.storage_path)
    print("image_url:", image_url)
    print("firestore_doc:", f"avatars/{args.avatar_id}")


if __name__ == "__main__":
    main()
