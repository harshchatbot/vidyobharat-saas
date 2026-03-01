export type Project = {
  id: string;
  user_id: string;
  title: string;
  script: string;
  language: string;
  voice: string;
  template: string;
  created_at: string;
};

export type Render = {
  id: string;
  project_id: string;
  user_id: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  progress: number;
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectDetail = {
  project: Project;
  renders: Render[];
};

export type Avatar = {
  id: string;
  name: string;
  scope: 'own' | 'public';
  style: string;
  language_tags: string[];
  thumbnail_url: string;
};

export type Template = {
  id: string;
  name: string;
  category: string;
  aspect_ratio: '9:16' | '16:9' | string;
  thumbnail_url: string;
};

export type ProjectAsset = {
  asset_id: string;
  project_id: string;
  kind: string;
  upload_url: string;
  public_url: string;
};

export type Video = {
  id: string;
  user_id: string;
  title: string | null;
  template?: string | null;
  language?: string | null;
  script: string;
  voice: string;
  aspect_ratio: '9:16' | '16:9' | '1:1' | string;
  resolution: '720p' | '1080p' | string;
  duration_mode: 'auto' | 'custom' | string;
  duration_seconds: number | null;
  captions_enabled: boolean;
  caption_style?: string | null;
  status: 'draft' | 'processing' | 'completed' | 'failed';
  progress: number;
  image_urls: string[];
  selected_model: string | null;
  provider_name: string | null;
  source_image_url: string | null;
  reference_images: string[];
  music_mode: 'none' | 'library' | 'upload' | string;
  music_track_id: string | null;
  music_file_url: string | null;
  music_volume: number;
  duck_music: boolean;
  thumbnail_url: string | null;
  output_url: string | null;
  error_message: string | null;
  auto_tags: string[];
  user_tags: string[];
  created_at: string;
  updated_at: string;
};

export type MusicTrack = {
  id: string;
  name: string;
  duration_sec: number | null;
  preview_url: string;
};

export type TTSLanguageOption = {
  code: string;
  label: string;
  native_label: string;
};

export type TTSVoiceOption = {
  key: string;
  label: string;
  tone: string;
  gender: string;
  provider_voice: string;
  supported_language_codes: string[];
  description: string;
};

export type TTSCatalogResponse = {
  provider: string;
  model: string;
  languages: TTSLanguageOption[];
  voices: TTSVoiceOption[];
};

export type TTSPreviewRequest = {
  text: string;
  language: string;
  voice: string;
};

export type TTSPreviewResponse = {
  preview_url: string;
  provider: string;
  resolved_voice: string;
  cached: boolean;
  preview_limit: string;
};

export type ReelScriptRequest = {
  templateId: string;
  topic: string;
  tone: string;
  language: string;
};

export type ReelScriptOutput = {
  hook: string;
  body_lines: string[];
  cta: string;
  caption: string;
  hashtags: string[];
};

export type AIVideoGenerateRequest = {
  templateId: string;
  topic: string;
  tone: string;
  language: string;
  selectedModel: string;
  voice?: string;
  referenceImages?: string[];
};

export type AIVideoGenerateResponse = {
  videoUrl: string;
  provider: string;
  duration: number;
  quality: string;
};

export type AIVideoModel = {
  key: string;
  label: string;
  description: string;
  frontendHint: string;
  apiAdapter: string;
};

export type ScriptGenerateRequest = {
  template: string;
  topic: string;
  language: string;
};

export type ScriptEnhanceRequest = {
  script: string;
  template?: string;
  language: string;
};

export type ScriptTagsRequest = {
  script: string;
};

export type ScriptResponse = {
  script: string;
  tags: string[];
};

export type UserProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  company: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  timezone: string | null;
  created_at: string;
};

export type UserProfileUpdateRequest = {
  display_name: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  company: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  timezone: string | null;
};

export type UserSettings = {
  id: string;
  default_language: string | null;
  default_voice: string | null;
  default_aspect_ratio: string | null;
  email_notifications: boolean;
  marketing_emails: boolean;
  auto_caption_default: boolean;
  music_ducking_default: boolean;
};

export type UserSettingsUpdateRequest = {
  default_language: string | null;
  default_voice: string | null;
  default_aspect_ratio: string | null;
  email_notifications: boolean;
  marketing_emails: boolean;
  auto_caption_default: boolean;
  music_ducking_default: boolean;
};

export type VideoCreateRequest = {
  template: string;
  script: string;
  tags: string[];
  modelKey: 'sora2' | 'veo3' | 'kling3';
  language: string;
  voice: string;
  imageUrls: string[];
  music: {
    type: 'library' | 'upload' | 'none';
    url: string | null;
  };
  audioSettings: {
    volume: number;
    ducking: boolean;
  };
  aspectRatio: string;
  resolution: string;
  durationMode: 'auto' | 'custom';
  durationSeconds?: number;
  captionsEnabled: boolean;
  captionStyle: string;
};

export type VideoCreateResponse = {
  id: string;
  status: string;
  videoUrl: string | null;
  provider: string | null;
  modelKey: string;
};

export type AIVideoStatusResponse = {
  id: string;
  status: 'queued' | 'processing' | 'success' | 'failed' | string;
  videoUrl: string | null;
  modelKey: 'sora2' | 'veo3' | 'kling3' | string | null;
  modelLabel: string | null;
  provider: string | null;
  resolution: string;
  aspectRatio: string;
  durationSeconds: number | null;
  tags: string[];
  errorMessage: string | null;
  thumbnailUrl: string | null;
};

export type ImageModel = {
  key: string;
  label: string;
  description: string;
  frontend_hint: string;
};

export type GeneratedImage = {
  id: string;
  parent_image_id: string | null;
  model_key: string;
  prompt: string;
  aspect_ratio: string;
  resolution: string;
  reference_urls: string[];
  image_url: string;
  thumbnail_url: string;
  action_type: string | null;
  status: string;
  auto_tags: string[];
  user_tags: string[];
  created_at: string;
};

export type InspirationImage = {
  id: string;
  creator_name: string;
  model_key: string;
  title: string;
  prompt: string;
  image_url: string;
  aspect_ratio: string;
  resolution: string;
  created_at: string;
  reference_urls: string[];
  tags: string[];
};

export type AssetTagFacet = {
  tag: string;
  count: number;
};

export type AssetSearchItem = {
  id: string;
  content_type: 'image' | 'video' | string;
  title: string;
  model_key: string;
  resolution: string;
  aspect_ratio: string;
  prompt: string;
  thumbnail_url: string | null;
  asset_url: string | null;
  status: string;
  created_at: string;
  reference_urls: string[];
  auto_tags: string[];
  user_tags: string[];
};

export type AssetSearchResponse = {
  items: AssetSearchItem[];
  total: number;
  page: number;
  page_size: number;
};

export type ImageActionResponse = {
  action_type: 'remove_background' | 'upscale' | 'variation';
  items: GeneratedImage[];
};

export type ImageQuickTemplate = {
  id: string;
  category: string;
  title: string;
  prompt: string;
  aspect_ratio: string;
  resolution: string;
  model_key: string;
};
