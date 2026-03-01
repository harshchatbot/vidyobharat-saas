import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RenderStatus(str, enum.Enum):
    pending = 'pending'
    rendering = 'rendering'
    completed = 'completed'
    failed = 'failed'


class VideoStatus(str, enum.Enum):
    draft = 'draft'
    processing = 'processing'
    completed = 'completed'
    failed = 'failed'


class ImageGenerationStatus(str, enum.Enum):
    completed = 'completed'
    failed = 'failed'


class User(Base):
    __tablename__ = 'users'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    company: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(24), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    default_language: Mapped[str | None] = mapped_column(String(40), nullable=True)
    default_voice: Mapped[str | None] = mapped_column(String(80), nullable=True)
    default_aspect_ratio: Mapped[str | None] = mapped_column(String(10), nullable=True)
    email_notifications: Mapped[bool] = mapped_column(default=True)
    marketing_emails: Mapped[bool] = mapped_column(default=False)
    auto_caption_default: Mapped[bool] = mapped_column(default=True)
    music_ducking_default: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    projects: Mapped[list['Project']] = relationship(back_populates='user')
    credit_wallet: Mapped['CreditWallet | None'] = relationship(back_populates='user', uselist=False)


class Project(Base):
    __tablename__ = 'projects'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    title: Mapped[str] = mapped_column(String(120))
    script: Mapped[str] = mapped_column(Text, default='')
    language: Mapped[str] = mapped_column(String(20), default='hi-IN')
    voice: Mapped[str] = mapped_column(String(80), default='Shubh')
    template: Mapped[str] = mapped_column(String(80), default='clean-corporate')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped['User'] = relationship(back_populates='projects')
    renders: Mapped[list['RenderJob']] = relationship(back_populates='project')


class RenderJob(Base):
    __tablename__ = 'renders'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id', ondelete='CASCADE'), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    status: Mapped[RenderStatus] = mapped_column(Enum(RenderStatus), default=RenderStatus.pending, index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    video_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project: Mapped['Project'] = relationship(back_populates='renders')


class Asset(Base):
    __tablename__ = 'assets'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey('projects.id', ondelete='SET NULL'), nullable=True)
    kind: Mapped[str] = mapped_column(String(40))
    path: Mapped[str] = mapped_column(String(255))
    public_url: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Video(Base):
    __tablename__ = 'videos'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    template: Mapped[str | None] = mapped_column(String(80), nullable=True)
    language: Mapped[str | None] = mapped_column(String(40), nullable=True)
    script: Mapped[str] = mapped_column(Text, default='')
    voice: Mapped[str] = mapped_column(String(80), default='Shubh')
    aspect_ratio: Mapped[str] = mapped_column(String(10), default='9:16')
    resolution: Mapped[str] = mapped_column(String(10), default='1080p')
    duration_mode: Mapped[str] = mapped_column(String(10), default='auto')
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    captions_enabled: Mapped[bool] = mapped_column(default=True)
    caption_style: Mapped[str | None] = mapped_column(String(40), nullable=True)
    audio_sample_rate_hz: Mapped[int] = mapped_column(Integer, default=22050)
    status: Mapped[VideoStatus] = mapped_column(Enum(VideoStatus), default=VideoStatus.draft, index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    image_urls: Mapped[str] = mapped_column(Text, default='[]')
    selected_model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    provider_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reference_images: Mapped[str] = mapped_column(Text, default='[]')
    music_mode: Mapped[str] = mapped_column(String(20), default='none')
    music_track_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    music_file_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    music_volume: Mapped[int] = mapped_column(Integer, default=20)
    duck_music: Mapped[bool] = mapped_column(default=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    output_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ImageGeneration(Base):
    __tablename__ = 'image_generations'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    parent_image_id: Mapped[str | None] = mapped_column(ForeignKey('image_generations.id', ondelete='SET NULL'), nullable=True, index=True)
    model_key: Mapped[str] = mapped_column(String(64), index=True)
    prompt: Mapped[str] = mapped_column(Text)
    aspect_ratio: Mapped[str] = mapped_column(String(16), default='9:16')
    resolution: Mapped[str] = mapped_column(String(16), default='1024')
    reference_urls: Mapped[str] = mapped_column(Text, default='[]')
    image_url: Mapped[str] = mapped_column(String(255))
    thumbnail_url: Mapped[str] = mapped_column(String(255))
    action_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[ImageGenerationStatus] = mapped_column(Enum(ImageGenerationStatus), default=ImageGenerationStatus.completed, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AssetTag(Base):
    __tablename__ = 'asset_tags'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[str] = mapped_column(String(36), index=True)
    asset_type: Mapped[str] = mapped_column(String(16), index=True)
    tag: Mapped[str] = mapped_column(String(120), index=True)
    source: Mapped[str] = mapped_column(String(16), default='auto')


class CreditWallet(Base):
    __tablename__ = 'credit_wallets'

    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    current_credits: Mapped[int] = mapped_column(Integer, default=25)
    plan_type: Mapped[str] = mapped_column(String(32), default='free')
    monthly_credits: Mapped[int] = mapped_column(Integer, default=25)
    last_reset: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    premium_usage_count: Mapped[int] = mapped_column(Integer, default=0)
    free_usage_count: Mapped[int] = mapped_column(Integer, default=0)

    user: Mapped['User'] = relationship(back_populates='credit_wallet')
    transaction_history: Mapped[list['CreditTransaction']] = relationship(back_populates='wallet')


class CreditTransaction(Base):
    __tablename__ = 'credit_transactions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('credit_wallets.user_id', ondelete='CASCADE'), index=True)
    feature_key: Mapped[str] = mapped_column(String(80), index=True)
    amount: Mapped[int] = mapped_column(Integer, default=0)
    balance_after: Mapped[int] = mapped_column(Integer, default=0)
    transaction_type: Mapped[str] = mapped_column(String(24), default='debit')
    source: Mapped[str] = mapped_column(String(16), default='premium')
    metadata_json: Mapped[str] = mapped_column(Text, default='{}')
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    wallet: Mapped['CreditWallet'] = relationship(back_populates='transaction_history')


class CreditTopUpOrder(Base):
    __tablename__ = 'credit_topup_orders'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('credit_wallets.user_id', ondelete='CASCADE'), index=True)
    provider: Mapped[str] = mapped_column(String(24), default='razorpay')
    credits: Mapped[int] = mapped_column(Integer)
    amount_paise: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default='INR')
    provider_order_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    provider_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default='created', index=True)
    metadata_json: Mapped[str] = mapped_column(Text, default='{}')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
