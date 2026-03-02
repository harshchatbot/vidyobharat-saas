from pydantic import BaseModel, Field


class UserProfileResponse(BaseModel):
    id: str
    display_name: str | None = None
    email: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    company: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    postal_code: str | None = None
    timezone: str | None = None
    created_at: str


class UserProfileUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    bio: str | None = Field(default=None, max_length=500)
    company: str | None = Field(default=None, max_length=120)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    country: str | None = Field(default=None, max_length=80)
    postal_code: str | None = Field(default=None, max_length=24)
    timezone: str | None = Field(default=None, max_length=64)


class UserSettingsResponse(BaseModel):
    id: str
    default_language: str | None = None
    default_voice: str | None = None
    default_aspect_ratio: str | None = None
    email_notifications: bool
    marketing_emails: bool
    auto_caption_default: bool
    music_ducking_default: bool


class UserSettingsUpdateRequest(BaseModel):
    default_language: str | None = Field(default=None, max_length=40)
    default_voice: str | None = Field(default=None, max_length=80)
    default_aspect_ratio: str | None = Field(default=None, max_length=10)
    email_notifications: bool
    marketing_emails: bool
    auto_caption_default: bool
    music_ducking_default: bool


class UserAvatarUploadResponse(BaseModel):
    avatar_url: str
