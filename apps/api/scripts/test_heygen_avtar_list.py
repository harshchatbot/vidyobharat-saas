from app.services.heygen_avatar_service import HeygenAvatarService

service = HeygenAvatarService()
avatars = service.list_avatars(refresh=True)

# Check what you get
print(f"Total avatars: {len(avatars)}")
for avatar in avatars[:5]:  # First 5
    print(f"- {avatar.get('name')}: {avatar.get('provider_avatar_id')}")
    print(f"  Supports Avatar IV: {avatar.get('supports_avatar_video_generation')}")
    print(f"  Type: {avatar.get('avatar_type')}")