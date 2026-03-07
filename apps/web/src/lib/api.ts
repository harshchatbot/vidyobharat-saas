import { API_FALLBACK_URL, API_URL } from '@/lib/env';
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
  InspirationLikeResponse,
  InspirationPublishResponse,
  InspirationVideo,
  CreditEstimateResponse,
  CreditHistoryItem,
  CreditTopUpOrderResponse,
  CreditWallet,
  PricingResponse,
  ReelScriptOutput,
  ReelScriptRequest,
  Render,
  InfluencerContentRequest,
  InfluencerContentResponse,
  InfluencerImageRequest,
  InfluencerPersona,
  InfluencerPersonaPayload,
  InfluencerPoseOption,
  InfluencerScenePreset,
  InfluencerScenePresetCreateRequest,
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
  accessToken?: string;
  cache?: RequestCache;
  next?: { revalidate?: number };
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const responseCache = new Map<string, CacheEntry<unknown>>();
const inFlightCache = new Map<string, Promise<unknown>>();

function makeCacheKey(path: string, userId: string | undefined, payload?: unknown): string {
  const payloadKey = payload ? JSON.stringify(payload) : '';
  return `${userId ?? 'anon'}::${path}::${payloadKey}`;
}

function invalidateUserCache(userId: string, pathIncludes: string[] = []): void {
  const prefix = `${userId}::`;
  for (const key of responseCache.keys()) {
    if (!key.startsWith(prefix)) continue;
    if (pathIncludes.length > 0 && !pathIncludes.some((part) => key.includes(part))) continue;
    responseCache.delete(key);
  }
  for (const key of inFlightCache.keys()) {
    if (!key.startsWith(prefix)) continue;
    if (pathIncludes.length > 0 && !pathIncludes.some((part) => key.includes(part))) continue;
    inFlightCache.delete(key);
  }
}

async function cachedRequest<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const inFlight = inFlightCache.get(key);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const requestPromise = fetcher()
    .then((result) => {
      responseCache.set(key, {
        expiresAt: Date.now() + ttlMs,
        value: result,
      });
      return result;
    })
    .finally(() => {
      inFlightCache.delete(key);
    });

  inFlightCache.set(key, requestPromise as Promise<unknown>);
  return requestPromise;
}

function getBrowserCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const value = window.localStorage.getItem('vidyo_access_token');
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData = init.body instanceof FormData;
  if (!isFormData) {
    headers.set('Content-Type', 'application/json');
  }
  const accessToken =
    options.accessToken ??
    getBrowserCookie('vidyo_access_token') ??
    getStoredAccessToken();
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (options.userId) {
    headers.set('X-User-ID', options.userId);
  }

  const baseCandidates = [API_URL, API_FALLBACK_URL].filter(Boolean);
  const tried: string[] = [];
  let response: Response | null = null;
  let lastNetworkError: unknown = null;

  for (const base of baseCandidates) {
    tried.push(base);
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers,
        cache: options.cache,
        next: options.next,
      });
    } catch (error) {
      lastNetworkError = error;
      continue;
    }

    if (response.ok) break;
    if (![502, 503, 504].includes(response.status)) break;
  }

  if (!response) {
    if (lastNetworkError instanceof Error) {
      throw new Error(
        `Network request failed for ${path}. Please check API availability/CORS and try again.`,
      );
    }
    throw new Error(`Network request failed for ${path}.`);
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await response.json();
      const detail = body?.detail;
      const messageCandidate =
        body?.message ||
        (detail && typeof detail === 'object' ? detail?.message : null) ||
        detail ||
        body?.error ||
        'Request failed';
      const message =
        typeof messageCandidate === 'string'
          ? messageCandidate
          : typeof messageCandidate?.message === 'string'
            ? messageCandidate.message
            : JSON.stringify(messageCandidate);
      throw new Error(message || 'Request failed');
    }
    const body = await response.text();
    const fallbackHint =
      response.status >= 500 && tried.length > 1
        ? ' API gateway had issues; fallback was also unavailable.'
        : '';
    throw new Error((body || 'Request failed') + fallbackHint);
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
    return request<{ asset_id: string; upload_url: string; public_url: string; method: string; headers: Record<string, string> }>('/uploads/sign', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  uploadFileDirect(payload: { file: File; kind: string; project_id?: string }, userId: string) {
    const body = new FormData();
    body.append('file', payload.file);
    body.append('kind', payload.kind);
    if (payload.project_id) {
      body.append('project_id', payload.project_id);
    }
    return request<{ asset_id: string; upload_url: string; public_url: string; method: string; headers: Record<string, string> }>('/uploads/direct', {
      method: 'POST',
      body,
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
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/api/credits/wallet', '/videos', '/assets/search', '/assets/tags']);
      return result;
    });
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
  listVideoInspiration(userId: string) {
    return request<InspirationVideo[]>('/api/videos/inspiration', {}, { userId, cache: 'no-store' });
  },
  publishInspiration(contentType: 'image' | 'video', assetId: string, publish: boolean, userId: string) {
    return request<InspirationPublishResponse>('/inspiration/publish', {
      method: 'POST',
      body: JSON.stringify({
        content_type: contentType,
        asset_id: assetId,
        publish,
      }),
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/assets/search', '/assets/tags', '/api/videos/inspiration', '/ai/images/inspiration']);
      return result;
    });
  },
  likeInspiration(contentType: 'image' | 'video', assetId: string, liked: boolean | null, userId: string) {
    return request<InspirationLikeResponse>('/inspiration/like', {
      method: 'POST',
      body: JSON.stringify({
        content_type: contentType,
        asset_id: assetId,
        liked,
      }),
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/assets/search', '/api/videos/inspiration', '/ai/images/inspiration']);
      return result;
    });
  },
  listAssetTags(
    userId: string,
    params?: { query?: string; content_type?: 'image' | 'video' },
  ) {
    const query = new URLSearchParams();
    if (params?.query) query.set('query', params.query);
    if (params?.content_type) query.set('content_type', params.content_type);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const path = `/assets/tags${suffix}`;
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 8_000, () =>
      request<AssetTagFacet[]>(path, {}, { userId, cache: 'no-store' }),
    );
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
    const path = `/assets/search${suffix}`;
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 6_000, () =>
      request<AssetSearchResponse>(path, {}, { userId, cache: 'no-store' }),
    );
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
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/api/credits/wallet', '/ai/images', '/assets/search', '/assets/tags']);
      return result;
    });
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
    const path = '/api/credits/wallet';
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 8_000, () =>
      request<CreditWallet>(path, {}, { userId, cache: 'no-store' }),
    );
  },
  estimateCredits(action: string, payload: Record<string, unknown>, userId: string) {
    const path = '/api/estimateCredits';
    const body = { action, payload };
    const cacheKey = makeCacheKey(path, userId, body);
    return cachedRequest(cacheKey, 2_500, () =>
      request<CreditEstimateResponse>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      }, { userId, cache: 'no-store' }),
    );
  },
  topupCredits(credits: number, userId: string) {
    return request<{ wallet: CreditWallet; addedCredits: number }>('/api/topupCredits', {
      method: 'POST',
      body: JSON.stringify({ credits }),
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/api/credits/wallet', '/api/creditHistory']);
      return result;
    });
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
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/api/credits/wallet', '/api/creditHistory']);
      return result;
    });
  },
  getCreditHistory(userId: string, limit = 100) {
    return request<{ items: CreditHistoryItem[] }>(`/api/creditHistory?limit=${limit}`, {}, { userId, cache: 'no-store' });
  },
  listInfluencerPersonas(userId: string) {
    return request<InfluencerPersona[]>('/api/influencer/personas', {}, { userId, cache: 'no-store' });
  },
  createInfluencerPersona(payload: InfluencerPersonaPayload, userId: string) {
    return request<InfluencerPersona>('/api/influencer/personas', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  updateInfluencerPersona(personaId: string, payload: InfluencerPersonaPayload, userId: string) {
    return request<InfluencerPersona>(`/api/influencer/personas/${personaId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  uploadInfluencerReference(personaId: string, file: File, userId: string) {
    const body = new FormData();
    body.append('file', file);
    return request<InfluencerPersona>(`/api/influencer/personas/${personaId}/reference`, {
      method: 'POST',
      body,
    }, { userId, cache: 'no-store' });
  },
  lockInfluencerReference(personaId: string, userId: string) {
    return request<{ persona: InfluencerPersona; message: string }>(`/api/influencer/personas/${personaId}/lock`, {
      method: 'POST',
      body: JSON.stringify({}),
    }, { userId, cache: 'no-store' });
  },
  listInfluencerPoses(userId: string) {
    return request<InfluencerPoseOption[]>('/api/influencer/poses', {}, { userId, cache: 'no-store' });
  },
  listInfluencerScenes(userId: string, personaId?: string) {
    const query = new URLSearchParams();
    if (personaId) query.set('persona_id', personaId);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<InfluencerScenePreset[]>(`/api/influencer/scenes${suffix}`, {}, { userId, cache: 'no-store' });
  },
  createInfluencerScene(payload: InfluencerScenePresetCreateRequest, userId: string) {
    return request<InfluencerScenePreset>('/api/influencer/scenes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  generateInfluencerContent(payload: InfluencerContentRequest, userId: string) {
    return request<InfluencerContentResponse>('/api/influencer/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  generateInfluencerImage(payload: InfluencerImageRequest, userId: string) {
    return request<GeneratedImage>('/api/influencer/generate-image', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
};
