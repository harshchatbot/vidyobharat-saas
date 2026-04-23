export type Project = {
  id: string;
  user_id: string;
  title: string;
  script: string;
  language: string;
  voice: string;
  template: string;
  created_at: string;
  updated_at?: string | null;
  last_activity_at?: string | null;
  image_count?: number;
  video_count?: number;
  last_output_thumbnail_url?: string | null;
  last_prompt_snippet?: string | null;
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
  images?: GeneratedImage[];
  videos?: Video[];
  summary?: {
    imageCount: number;
    videoCount: number;
    renderCount: number;
  };
};

export type AssetProjectAssignmentResponse = {
  asset_id: string;
  content_type: 'image' | 'video' | string;
  project_id: string;
  previous_project_id?: string | null;
};

export type Avatar = {
  id: string;
  name: string;
  scope: 'own' | 'public';
  style: string;
  gender?: string | null;
  language_tags: string[];
  thumbnail_url: string;
  tags?: string[];
  category?: string | null;
  reference_images?: string[];
  primary_image?: string | null;
  preview_video_url?: string | null;
  prompt_template?: string | null;
  negative_prompt?: string | null;
  recommended_voice?: string | null;
  status?: string | null;
  description?: string | null;
};

export type Template = {
  id: string;
  name: string;
  title?: string;
  category: string;
  aspect_ratio: '9:16' | '16:9' | string;
  thumbnail_url: string;
  type?: 'video' | 'image';
  medium?: 'video' | 'image';
  subcategory?: string | null;
  slug?: string | null;
  description?: string | null;
  short_description?: string | null;
  preview_image_url?: string | null;
  preview_video_url?: string | null;
  visual_prompt?: string | null;
  inputs?: TemplateInputField[];
  script_hint?: string | null;
  topic_hint?: string | null;
  prompt_template?: string | null;
  active?: boolean;
  trending?: boolean;
  featured?: boolean;
  badge?: string | null;
  is_featured?: boolean;
  is_quick_start?: boolean;
  default_model_mode?: string | null;
  prompt_assembler_key?: string | null;
  input_schema?: TemplateInputField[];
  legacy_mappings?: string[];
  suggested_platforms?: string[];
  suggested_durations?: number[];
  suggested_styles?: string[];
  safety_profile?: string | null;
  recommended_model?: TemplateRecommendedModel | null;
  order?: number;
  created_by?: string | null;
  source?: string | null;
  generation_defaults?: TemplateGenerationDefaults;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TemplateInputOption = {
  label?: string | null;
  value: string;
};

export type TemplateInputField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number';
  required: boolean;
  placeholder?: string | null;
  options?: Array<TemplateInputOption | string>;
};

export type TemplateGenerationDefaults = {
  model_key?: string | null;
  aspect_ratio?: string | null;
  resolution?: string | null;
  voice?: string | null;
  language?: string | null;
  duration_seconds?: number | null;
  quality?: string | null;
  captions_enabled?: boolean | null;
  narration_enabled?: boolean | null;
  caption_style?: string | null;
};

export type TemplateRecommendedModel = {
  mode?: string | null;
  label?: string | null;
  description?: string | null;
  group?: string | null;
  internal_model_key?: string | null;
};

export type RecipeComposerFragment = {
  type: 'text' | 'slot';
  value?: string | null;
  slot_id?: string | null;
};

export type RecipeComposerSlot = {
  id: string;
  kind: 'text' | 'upload' | 'avatar' | 'select' | 'reference-image' | string;
  label: string;
  placeholder: string;
  required?: boolean;
  options?: string[];
  sample_label?: string | null;
  sample_preview_url?: string | null;
  submit_target?: 'image' | 'text' | string | null;
};

export type RecipeComposer = {
  recipe_label: string;
  mode: 'video' | 'image' | string;
  fragments: RecipeComposerFragment[];
  slots: RecipeComposerSlot[];
  starter_copy?: string | null;
};

export type RecipeCatalog = {
  id: string;
  type: 'video' | 'image' | string;
  title: string;
  slug: string;
  description: string;
  short_label?: string | null;
  preview_video_url?: string | null;
  preview_image_url?: string | null;
  active: boolean;
  featured: boolean;
  trending: boolean;
  order: number;
  tags: string[];
  duration_seconds: number;
  input: {
    image?: boolean;
    text?: boolean;
  };
  generation_defaults: TemplateGenerationDefaults;
  composer: RecipeComposer;
};

export type TemplateGenerateRequest = {
  templateId: string;
  inputs: Record<string, string | number | boolean | null>;
  modelKey?: string;
  projectId?: string;
  modeId?: string;
  autoCreateProject?: boolean;
  aspectRatio?: string;
  resolution?: string;
  language?: string;
  voice?: string;
  durationSeconds?: number;
  quality?: string;
  promptOverride?: string;
};

export type TemplateGenerateResponse = {
  templateId: string;
  contentType: 'video' | 'image';
  assetId: string;
  status: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  appliedCredits: number;
  remainingCredits?: number | null;
  provider?: string | null;
  modelKey?: string | null;
};

export type TemplatePreviewResponse = {
  templateId: string;
  contentType: 'video' | 'image';
  title: string;
  prompt: string;
  imagePrompt?: string | null;
  videoPrompt?: string | null;
  scriptPreview?: string | null;
  recommendedModel?: TemplateRecommendedModel | null;
  recommendedModelMode?: string | null;
};

export type ProjectAsset = {
  asset_id: string;
  project_id: string;
  kind: string;
  upload_url: string;
  public_url: string;
  headers?: Record<string, string>;
};

export type Video = {
  id: string;
  user_id: string;
  project_id?: string | null;
  mode_id?: string | null;
  template_id?: string | null;
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
  narration_enabled?: boolean;
  caption_style?: string | null;
  audio_sample_rate_hz?: number | null;
  status: 'draft' | 'processing' | 'completed' | 'failed' | 'timed_out' | 'provider_failed';
  progress: number;
  image_urls: string[];
  selected_model: string | null;
  provider_name: string | null;
  tts_provider?: string | null;
  tts_resolved_voice?: string | null;
  tts_provider_message?: string | null;
  tts_fallback_used?: boolean;
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
  is_public_inspiration: boolean;
  moderation_status: string;
  inspiration_score: number;
  like_count: number;
  auto_tags: string[];
  user_tags: string[];
  recipe_id?: string | null;
  recipe_inputs?: Record<string, string | string[]>;
  pipeline_mode?: string | null;
  pipeline_metadata?: {
    events?: Array<{
      id: string;
      kind: string;
      title: string;
      detail: string;
      state?: string;
      created_at?: string;
    }>;
    deep_scene_plan?: Array<{
      scene_id?: string;
      stage_name?: string;
      stage_label?: string;
      explainer_family?: string;
      explainer_subtopic?: string;
      educational_mode?: string;
      shot_archetype?: string;
      subtopic_visual_anchor?: string;
      qa_flags?: string[];
      scene_type?: string;
      topic_focus?: string;
      visual_objective?: string;
      camera_framing?: string;
      motion_intent?: string;
      transition_intent?: string;
      ending_hold_instruction?: string;
      sora_negative_guidance?: string;
      anti_repetition_note?: string;
    }>;
    ugc_scene_plan?: Array<{
      scene_id?: string;
      stage_name?: string;
      stage_label?: string;
      ugc_ad_family?: string;
      ugc_ad_subtopic?: string;
      ugc_mode?: string;
      shot_archetype?: string;
      subtopic_visual_anchor?: string;
      qa_flags?: string[];
      scene_type?: string;
      topic_focus?: string;
      visual_objective?: string;
      camera_framing?: string;
      motion_intent?: string;
      transition_intent?: string;
      ending_hold_instruction?: string;
      requested_voice?: string | null;
      requested_language?: string | null;
      avatar_synced_voice?: string | null;
      avatar_synced_language?: string | null;
      resolved_talking_voice?: string | null;
      resolved_talking_language?: string | null;
    }>;
    resolved_avatar_source?: string | null;
    resolved_avatar_id?: string | null;
    resolved_avatar_name?: string | null;
    requested_voice?: string | null;
    requested_language?: string | null;
    avatar_synced_voice?: string | null;
    avatar_synced_language?: string | null;
    resolved_talking_voice?: string | null;
    resolved_talking_language?: string | null;
    ugc_talking_scene_debug?: Array<{
      scene_id?: string;
      stage_name?: string;
      talking_provider?: string | null;
      talking_provider_label?: string | null;
      talking_fallback_reason?: string | null;
      num_frames?: number | null;
      talking_audio_duration_seconds?: number | null;
    }>;
    intro_outro_watchouts?: Array<{
      scene_id?: string;
      stage_name?: string;
      flags?: string[];
    }>;
    [key: string]: unknown;
  };
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
  sample_rate_hz: number;
};

export type TTSPreviewResponse = {
  preview_url: string;
  provider: string;
  resolved_voice: string;
  cached: boolean;
  preview_limit: string;
  provider_message: string | null;
  applied_credits: number;
  remaining_credits: number | null;
};

export type VideoRetryRequest = {
  voice?: string;
  language?: string;
  script?: string;
  audio_sample_rate_hz?: number;
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
  shortLabel?: string;
  tier?: string;
  enabled?: boolean;
  featured?: boolean;
  featureGate?: string | null;
  qualityBadge?: string;
  speedBadge?: string;
  creditBadge?: string;
  resolutionLabels?: string[];
  providerId?: string | null;
  canonicalModelKey?: string | null;
  modeIds?: string[];
  billingUnit?: string | null;
};

export type ScriptGenerateRequest = {
  template: string;
  topic: string;
  language: string;
  tone?: string;
  lane?: string;
  modelKey?: string;
  modelLabel?: string;
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  durationSeconds?: number;
  scriptHint?: string;
  topicHint?: string;
  narrationEnabled?: boolean;
  captionsEnabled?: boolean;
};

export type ScriptEnhanceRequest = {
  script: string;
  template?: string;
  language: string;
  tone?: string;
  lane?: string;
  modelKey?: string;
  modelLabel?: string;
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  durationSeconds?: number;
  scriptHint?: string;
  topicHint?: string;
  narrationEnabled?: boolean;
  captionsEnabled?: boolean;
};

export type ScriptTagsRequest = {
  script: string;
};

export type ScriptResponse = {
  script: string;
  tags: string[];
};

export type ScriptTranslateRequest = {
  text: string;
  target_language: string;
};

export type TextResponse = {
  text: string;
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

export type StandardVideoCreateRequest = {
  template: string;
  templateId?: string;
  script: string;
  tags: string[];
  modelKey: string;
  modeId?: string;
  projectId?: string;
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
    sampleRateHz: number;
  };
  aspectRatio: string;
  resolution: string;
  quality: 'standard' | 'high';
  durationMode: 'auto' | 'custom';
  durationSeconds?: number;
  captionsEnabled: boolean;
  captionStyle: string;
  narrationEnabled?: boolean;
};

export type RecipeVideoCreateRequest = {
  recipeId: string;
  inputs: Record<string, string | string[]>;
  aspectRatio?: '9:16' | '16:9' | '1:1' | string;
  language?: string;
  voice?: string;
  captionsEnabled?: boolean;
  narrationEnabled?: boolean;
  personaId?: string;
  talkingModePreference?: string;
  useAvatarForTalkingScenes?: boolean;
};

export type VideoCreateRequest = StandardVideoCreateRequest | RecipeVideoCreateRequest;

export type VideoCreateResponse = {
  id: string;
  status: string;
  videoUrl: string | null;
  provider: string | null;
  modelKey: string;
  appliedCredits: number;
  remainingCredits: number | null;
};

export type AIVideoStatusResponse = {
  id: string;
  status: 'queued' | 'processing' | 'success' | 'failed' | string;
  progress: number;
  videoUrl: string | null;
  modelKey: 'sora2' | 'fal_ltx23_i2v' | 'ltx' | string | null;
  modelLabel: string | null;
  provider: string | null;
  resolution: string;
  aspectRatio: string;
  durationSeconds: number | null;
  tags: string[];
  errorMessage: string | null;
  thumbnailUrl: string | null;
  ttsProvider: string | null;
  ttsResolvedVoice: string | null;
  ttsProviderMessage: string | null;
  ttsFallbackUsed: boolean;
  pipelineMetadata?: Record<string, unknown> | null;
};

export type VideoStudioChatMessage = {
  role: 'user' | 'assistant' | string;
  text: string;
};

export type VideoStudioChatRequest = {
  videoId: string;
  message: string;
  chatHistory?: VideoStudioChatMessage[];
};

export type VideoStudioChatResponse = {
  reply: string;
  provider: string;
  model: string;
};

export type ImageModel = {
  key: string;
  label: string;
  description: string;
  frontend_hint: string;
  provider?: string;
  badge?: string;
  logo_label?: string;
  alias_hint?: string | null;
  provider_id?: string | null;
  canonical_model_key?: string | null;
  mode_ids?: string[];
  billing_unit?: string | null;
};

export type GeneratedImage = {
  id: string;
  parent_image_id: string | null;
  project_id?: string | null;
  mode_id?: string | null;
  template_id?: string | null;
  model_key: string;
  prompt: string;
  aspect_ratio: string;
  resolution: string;
  reference_urls: string[];
  image_url: string;
  thumbnail_url: string;
  action_type: string | null;
  status: string;
  is_public_inspiration: boolean;
  moderation_status: string;
  inspiration_score: number;
  like_count: number;
  auto_tags: string[];
  user_tags: string[];
  applied_credits: number;
  remaining_credits: number | null;
  created_at: string;
};

export type CreditBreakdownItem = {
  feature: string;
  cost: number;
};

export type EstimateBreakdownItem = {
  component: string;
  value: number;
  label?: string | null;
};

export type CreditWallet = {
  currentCredits: number;
  monthlyCredits: number;
  usedCredits: number;
  planName: string;
  lastReset: string;
};

export type CreditHistoryItem = {
  id: number;
  featureName: string;
  creditsUsed: number;
  remainingBalance: number;
  transactionType: string;
  source: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CreditEstimateResponse = {
  estimatedCredits: number;
  breakdown: EstimateBreakdownItem[];
  currentCredits: number;
  remainingCredits: number;
  sufficient: boolean;
  premium: boolean;
};

export type CreditTopUpOrderResponse = {
  provider: string;
  region: string;
  country: string;
  planName: string;
  orderId: string | null;
  keyId: string | null;
  checkoutSessionId: string | null;
  checkoutUrl: string | null;
  amountMinor: number;
  currency: string;
  credits: number;
  message: string | null;
};

export type PricingResponse = {
  region: string;
  country: string;
  currency: string;
  paymentProvider: string;
  plans: Record<string, number>;
  creditAllocation: Record<string, number>;
  actionCosts: CreditBreakdownItem[];
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
  like_count: number;
  liked_by_user: boolean;
  moderation_status: string;
};

export type InspirationVideo = {
  id: string;
  creator_name: string;
  model_key: string;
  provider_name: string;
  title: string;
  prompt: string;
  video_url: string;
  thumbnail_url: string;
  aspect_ratio: string;
  resolution: string;
  duration_seconds: number;
  created_at: string;
  tags: string[];
  like_count: number;
  liked_by_user: boolean;
  moderation_status: string;
};

export type AssetTagFacet = {
  tag: string;
  count: number;
};

export type AssetSearchItem = {
  id: string;
  content_type: 'image' | 'video' | string;
  project_id?: string | null;
  mode_id?: string | null;
  template_id?: string | null;
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
  is_public_inspiration: boolean;
  moderation_status: string;
  inspiration_score: number;
  like_count: number;
};

export type InspirationPublishResponse = {
  asset_id: string;
  content_type: 'image' | 'video' | string;
  is_public_inspiration: boolean;
  moderation_status: string;
  inspiration_score: number;
  like_count: number;
};

export type InspirationLikeResponse = {
  asset_id: string;
  content_type: 'image' | 'video' | string;
  liked: boolean;
  like_count: number;
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

export type InfluencerPersona = {
  id: string;
  user_id: string;
  name: string;
  gender_identity: string | null;
  niche: string | null;
  tone: string | null;
  catchphrase: string | null;
  personality_traits: string[];
  backstory: string | null;
  visual_description: string;
  reference_image_url: string | null;
  style_embedding_vector: number[];
  system_prompt_template: string | null;
  character_locked: boolean;
  created_at: string;
  updated_at: string;
};

export type InfluencerPersonaPayload = {
  name: string;
  gender_identity: string | null;
  niche: string | null;
  tone: string | null;
  catchphrase: string | null;
  personality_traits: string[];
  backstory: string | null;
  visual_description: string;
  character_locked: boolean;
};

export type InfluencerContentRequest = {
  persona_id: string;
  intent: string;
  platform: 'linkedin' | 'reels' | 'twitter' | 'youtube';
};

export type InfluencerContentResponse = {
  title: string;
  intro: string;
  content_blocks: string[];
  motivational_close: string;
  cta: string;
  tags: string[];
  applied_credits: number;
  remaining_credits: number | null;
};

export type InfluencerImageRequest = {
  persona_id: string;
  pose: string;
  scene: string;
  custom_pose?: string | null;
  model_key: string;
  aspect_ratio: string;
  resolution: string;
};

export type InfluencerScenePreset = {
  id?: string | null;
  key: string;
  label: string;
  description: string;
  environment?: string | null;
  props?: string | null;
  lighting?: string | null;
  mood?: string | null;
  negative_constraints?: string | null;
  is_system?: boolean;
};

export type InfluencerScenePresetCreateRequest = {
  persona_id?: string | null;
  label: string;
  description: string;
  environment: string;
  props?: string | null;
  lighting?: string | null;
  mood?: string | null;
  negative_constraints?: string | null;
};

export type InfluencerPoseOption = {
  key: string;
  label: string;
  description: string;
};

export type CreateCustomAvatarRequest = {
  name: string;
  reference_image_url: string;
  reference_images?: string[];
  gender: 'female' | 'male';
  preferred_voice?: string;
};

export type CreateCustomAvatarResponse = {
  avatar_id: string;
  user_id: string;
  name: string;
  reference_image_url: string;
  reference_images?: string[];
  primary_image?: string | null;
  gender?: 'female' | 'male';
  preferred_voice: string;
  status: string;
};

export type GenerateCustomAvatarPreviewRequest = {
  script: string;
  voice?: string;
  language?: string;
};

export type GenerateCustomAvatarPreviewResponse = {
  job_id: string;
  avatar_id: string;
  status: string;
};

export type CustomAvatarPreviewStatusResponse = {
  job_id: string;
  avatar_id: string;
  user_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | string;
  script?: string | null;
  voice?: string | null;
  language?: string | null;
  audio_url?: string | null;
  video_url?: string | null;
  provider?: string | null;
  error_message?: string | null;
  timing_map?: Array<Record<string, unknown>> | null;
  behavior_timeline?: Array<Record<string, unknown>> | null;
  audio_reactive_timeline?: Array<Record<string, unknown>> | null;
  voice_profile?: Record<string, unknown> | null;
};
