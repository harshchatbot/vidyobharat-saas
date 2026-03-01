import { API_URL } from '@/lib/env';
import type {
  Avatar,
  AIVideoModel,
  AIVideoGenerateRequest,
  AIVideoGenerateResponse,
  AssetSearchResponse,
  AssetTagFacet,
  AIVideoStatusResponse,
  MusicTrack,
  Project,
  ProjectAsset,
  ProjectDetail,
  GeneratedImage,
  ImageActionResponse,
  ImageModel,
  InspirationImage,
  CreditEstimateResponse,
  CreditHistoryItem,
  CreditTopUpOrderResponse,
  CreditWallet,
  PricingResponse,
  ReelScriptOutput,
  ReelScriptRequest,
  Render,
  ScriptEnhanceRequest,
  ScriptGenerateRequest,
  ScriptTagsRequest,
  ScriptTranslateRequest,
  ScriptResponse,
  TextResponse,
  Template,
  TTSCatalogResponse,
  TTSPreviewRequest,
  TTSPreviewResponse,
  UserProfile,
  UserProfileUpdateRequest,
  UserSettings,
  UserSettingsUpdateRequest,
  Video,
  VideoCreateRequest,
  VideoCreateResponse,
} from '@/types/api';

export type ApiOptions = {
  userId?: string;
  cache?: RequestCache;
  next?: { revalidate?: number };
};

async function request<T>(path: string, init: RequestInit = {}, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData = init.body instanceof FormData;
  if (!isFormData) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.userId) {
    headers.set('X-User-ID', options.userId);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: options.cache,
    next: options.next,
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await response.json();
      const message = body?.message || body?.detail?.message || body?.detail || body?.error || 'Request failed';
      throw new Error(message);
    }
    const body = await response.text();
    throw new Error(body || 'Request failed');
  }

  return response.json() as Promise<T>;
}

export const api = {
  mockLogin(email?: string) {
    return request<{ user_id: string }>('/auth/mock-login', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  mockSignup(email: string) {
    return request<{ user_id: string }>('/auth/mock-signup', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  listAvatars(userId: string, params?: { search?: string; scope?: string; language?: string }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.scope) query.set('scope', params.scope);
    if (params?.language) query.set('language', params.language);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<Avatar[]>(`/avatars${suffix}`, {}, { userId, cache: 'no-store' });
  },
  listTemplates(userId: string, params?: { search?: string; category?: string; aspect_ratio?: string }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.aspect_ratio) query.set('aspect_ratio', params.aspect_ratio);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<Template[]>(`/templates${suffix}`, {}, { userId, cache: 'no-store' });
  },
  createProject(payload: {
    user_id: string;
    title: string;
    script: string;
    language: string;
    voice: string;
    template: string;
  }, userId: string) {
    return request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId });
  },
  listProjects(userId: string, revalidateSeconds = 10) {
    return request<Project[]>('/projects', {}, { userId, next: { revalidate: revalidateSeconds } });
  },
  getProject(projectId: string, userId: string, cache: RequestCache = 'default') {
    return request<ProjectDetail>(`/projects/${projectId}`, {}, { userId, cache });
  },
  updateProject(
    projectId: string,
    payload: Partial<{
      title: string;
      script: string;
      language: string;
      voice: string;
      template: string;
    }>,
    userId: string,
  ) {
    return request<Project>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  addProjectAsset(projectId: string, payload: { filename: string; kind: string }, userId: string) {
    return request<ProjectAsset>(`/projects/${projectId}/assets`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  createRender(payload: { project_id: string; user_id: string; include_broll: boolean }, userId: string) {
    return request<Render>('/renders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  getRender(renderId: string, userId: string) {
    return request<Render>(`/renders/${renderId}`, {}, { userId, cache: 'no-store' });
  },
  signUpload(payload: { user_id: string; project_id?: string; filename: string; kind: string }, userId: string) {
    return request<{ asset_id: string; upload_url: string; public_url: string; method: string }>('/uploads/sign', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  deleteUpload(assetId: string, userId: string) {
    return request<{ asset_id: string; deleted: boolean }>(`/uploads/${assetId}`, {
      method: 'DELETE',
    }, { userId, cache: 'no-store' });
  },
  listVideos(userId: string) {
    return request<Video[]>('/videos', {}, { userId, cache: 'no-store' });
  },
  listMusicTracks() {
    return request<MusicTrack[]>('/music-tracks', {}, { cache: 'no-store' });
  },
  getTtsCatalog(userId: string) {
    return request<TTSCatalogResponse>('/tts/catalog', {}, { userId, cache: 'no-store' });
  },
  previewTts(payload: TTSPreviewRequest, userId: string) {
    return request<TTSPreviewResponse>('/tts/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  createVideo(payload: FormData, userId: string) {
    return request<{ id: string; status: string }>('/videos', {
      method: 'POST',
      body: payload,
    }, { userId, cache: 'no-store' });
  },
  getVideo(videoId: string, userId: string) {
    return request<Video>(`/videos/${videoId}`, {}, { userId, cache: 'no-store' });
  },
  retryVideo(videoId: string, userId: string) {
    return request<{ id: string; status: string }>(`/videos/${videoId}/retry`, {
      method: 'POST',
      body: JSON.stringify({}),
    }, { userId, cache: 'no-store' });
  },
  generateReelScript(payload: ReelScriptRequest, userId: string) {
    return request<ReelScriptOutput>('/ai/reel-script', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  generateScriptV2(payload: ScriptGenerateRequest, userId: string) {
    return request<ScriptResponse>('/api/ai/script/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  enhanceScriptV2(payload: ScriptEnhanceRequest, userId: string) {
    return request<ScriptResponse>('/api/ai/script/enhance', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  extractScriptTags(payload: ScriptTagsRequest, userId: string) {
    return request<ScriptResponse>('/api/ai/script/tags', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  translateScriptText(payload: ScriptTranslateRequest, userId: string) {
    return request<TextResponse>('/api/ai/script/translate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  getMyProfile(userId: string) {
    return request<UserProfile>('/me/profile', {}, { userId, cache: 'no-store' });
  },
  updateMyProfile(payload: UserProfileUpdateRequest, userId: string) {
    return request<UserProfile>('/me/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  uploadMyAvatar(file: File, userId: string) {
    const body = new FormData();
    body.append('avatar', file);
    return request<{ avatar_url: string }>('/me/avatar', {
      method: 'POST',
      body,
    }, { userId, cache: 'no-store' });
  },
  getMySettings(userId: string) {
    return request<UserSettings>('/me/settings', {}, { userId, cache: 'no-store' });
  },
  updateMySettings(payload: UserSettingsUpdateRequest, userId: string) {
    return request<UserSettings>('/me/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  generateAIVideo(payload: AIVideoGenerateRequest, userId: string) {
    return request<AIVideoGenerateResponse>('/ai/video/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  listAIVideoModels(userId: string) {
    return request<AIVideoModel[]>('/api/video/models', {}, { userId, cache: 'no-store' });
  },
  createAIVideo(payload: VideoCreateRequest, userId: string) {
    return request<VideoCreateResponse>('/api/ai/video/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  getAIVideoStatus(videoId: string, userId: string) {
    return request<AIVideoStatusResponse>(`/api/ai/video/status/${videoId}`, {}, { userId, cache: 'no-store' });
  },
  listImageModels(userId: string) {
    return request<ImageModel[]>('/ai/image/models', {}, { userId, cache: 'no-store' });
  },
  listGeneratedImages(userId: string) {
    return request<GeneratedImage[]>('/ai/images', {}, { userId, cache: 'no-store' });
  },
  listImageInspiration(userId: string) {
    return request<InspirationImage[]>('/ai/images/inspiration', {}, { userId, cache: 'no-store' });
  },
  listAssetTags(
    userId: string,
    params?: { query?: string; content_type?: 'image' | 'video' },
  ) {
    const query = new URLSearchParams();
    if (params?.query) query.set('query', params.query);
    if (params?.content_type) query.set('content_type', params.content_type);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<AssetTagFacet[]>(`/assets/tags${suffix}`, {}, { userId, cache: 'no-store' });
  },
  searchAssets(
    userId: string,
    params: {
      query?: string;
      tags?: string[];
      models?: string[];
      resolutions?: string[];
      content_type?: 'image' | 'video';
      sort?: 'newest' | 'oldest';
      page?: number;
      page_size?: number;
    },
  ) {
    const query = new URLSearchParams();
    if (params.query) query.set('query', params.query);
    for (const tag of params.tags ?? []) query.append('tags', tag);
    for (const model of params.models ?? []) query.append('models', model);
    for (const resolution of params.resolutions ?? []) query.append('resolutions', resolution);
    if (params.content_type) query.set('content_type', params.content_type);
    if (params.sort) query.set('sort', params.sort);
    if (params.page) query.set('page', String(params.page));
    if (params.page_size) query.set('page_size', String(params.page_size));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<AssetSearchResponse>(`/assets/search${suffix}`, {}, { userId, cache: 'no-store' });
  },
  updateAssetTags(contentType: 'image' | 'video', assetId: string, userTags: string[], userId: string) {
    return request<{ asset_id: string; content_type: string; auto_tags: string[]; user_tags: string[] }>(
      `/assets/${contentType}/${assetId}/tags`,
      {
        method: 'PUT',
        body: JSON.stringify({ user_tags: userTags }),
      },
      { userId, cache: 'no-store' },
    );
  },
  generateImage(
    payload: {
      model_key: string;
      prompt: string;
      aspect_ratio: string;
      resolution: string;
      reference_urls: string[];
    },
    userId: string,
  ) {
    return request<GeneratedImage>('/ai/image/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  enhanceImagePrompt(payload: { prompt: string; model_key?: string }, userId: string) {
    return request<{ prompt: string }>('/ai/image/prompt-enhance', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  applyImageAction(imageId: string, action: 'remove_background' | 'upscale' | 'variation', userId: string) {
    return request<ImageActionResponse>('/ai/images/action', {
      method: 'POST',
      body: JSON.stringify({ image_id: imageId, action_type: action }),
    }, { userId, cache: 'no-store' });
  },
  getCreditWallet(userId: string) {
    return request<CreditWallet>('/api/credits/wallet', {}, { userId, cache: 'no-store' });
  },
  estimateCredits(action: string, payload: Record<string, unknown>, userId: string) {
    return request<CreditEstimateResponse>('/api/estimateCredits', {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
    }, { userId, cache: 'no-store' });
  },
  topupCredits(credits: number, userId: string) {
    return request<{ wallet: CreditWallet; addedCredits: number }>('/api/topupCredits', {
      method: 'POST',
      body: JSON.stringify({ credits }),
    }, { userId, cache: 'no-store' });
  },
  getPricing() {
    return request<PricingResponse>('/api/pricing', {}, { cache: 'no-store' });
  },
  createTopupOrder(planName: string, userId: string) {
    return request<CreditTopUpOrderResponse>('/api/topupCredits/order', {
      method: 'POST',
      body: JSON.stringify({ planName }),
    }, { userId, cache: 'no-store' });
  },
  verifyTopupOrder(
    payload: { provider: string; providerOrderId: string; providerPaymentId: string; providerSignature: string },
    userId: string,
  ) {
    return request<{ wallet: CreditWallet; addedCredits: number }>('/api/topupCredits/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  getCreditHistory(userId: string, limit = 100) {
    return request<{ items: CreditHistoryItem[] }>(`/api/creditHistory?limit=${limit}`, {}, { userId, cache: 'no-store' });
  },
};
