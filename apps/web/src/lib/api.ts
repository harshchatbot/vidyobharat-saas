import { getApiFallbackUrl, getApiUrl } from '@/lib/env';
import { getCurrentUserId } from '@/lib/authUser';
import type {
  Avatar,
  AvatarLibraryResponse,
  AIVideoModel,
  AssetSearchResponse,
  AssetProjectAssignmentResponse,
  AssetTagFacet,
  AIVideoStatusResponse,
  AppNotification,
  AvatarProductAssistRequest,
  AvatarProductAssistResponse,
  MusicTrack,
  MotionReferenceVideoAnalysisResponse,
  Project,
  ProjectAsset,
  ProjectDetail,
  RecipeCatalog,
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
  TemplateGenerateRequest,
  TemplateGenerateResponse,
  TemplatePreviewResponse,
  TTSCatalogResponse,
  TTSPreviewRequest,
  TTSPreviewResponse,
  VideoRetryRequest,
  UserProfile,
  UserProfileUpdateRequest,
  UserSettings,
  UserSettingsUpdateRequest,
  Video,
  VideoStudioChatRequest,
  VideoStudioChatResponse,
  VideoCreateRequest,
  VideoCreateResponse,
} from '@/types/api';

export type ApiOptions = {
  userId?: string;
  accessToken?: string;
  cache?: RequestCache;
  next?: { revalidate?: number };
  timeoutMs?: number;
};

export type InspirationListOptions = {
  limit?: number;
  offset?: number;
  sort?: 'curated' | 'newest' | 'liked';
};

export type ActorCreateResponse = {
  actor_id: string;
  status: string;
};

export type ActorDetailResponse = {
  id: string;
  name: string;
  thumbnail_url: string;
  reference_images: string[];
  reference_image_variants?: Array<{
    id: string;
    url: string;
    tags: string[];
  }>;
  primary_image?: string | null;
  preview_video_url?: string | null;
  tags: string[];
  category?: string | null;
  language_support: string[];
  prompt_template?: string | null;
  negative_prompt?: string | null;
  recommended_voice?: string | null;
  created_at?: string | null;
  status: string;
  scope: string;
};

export type TestAvatarRequest = {
  actor_id: string;
  script_text: string;
};

export type TestAvatarResponse = {
  status: string;
  video_url: string;
  actor_id: string;
  duration?: number | null;
  audio_url?: string | null;
  selected_reference_image?: string | null;
  retry_attempts?: number;
  timing_map?: Array<Record<string, unknown>> | null;
  behavior_timeline?: Array<Record<string, unknown>> | null;
  audio_reactive_timeline?: Array<Record<string, unknown>> | null;
  voice_profile?: Record<string, unknown> | null;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 40_000;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const responseCache = new Map<string, CacheEntry<unknown>>();
const inFlightCache = new Map<string, Promise<unknown>>();
const SESSION_CACHE_PREFIX = 'rangmanch:api-cache:';

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
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(`${SESSION_CACHE_PREFIX}${key}`);
      } catch {
        // Ignore storage cleanup failures.
      }
    }
  }
  for (const key of inFlightCache.keys()) {
    if (!key.startsWith(prefix)) continue;
    if (pathIncludes.length > 0 && !pathIncludes.some((part) => key.includes(part))) continue;
    inFlightCache.delete(key);
  }
}

function invalidateAnonCache(pathIncludes: string[] = []): void {
  const prefix = 'anon::';
  for (const key of responseCache.keys()) {
    if (!key.startsWith(prefix)) continue;
    if (pathIncludes.length > 0 && !pathIncludes.some((part) => key.includes(part))) continue;
    responseCache.delete(key);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(`${SESSION_CACHE_PREFIX}${key}`);
      } catch {
        // Ignore storage cleanup failures.
      }
    }
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
  options?: {
    persistToSession?: boolean;
  },
): Promise<T> {
  if (ttlMs <= 0) {
    return fetcher();
  }
  const now = Date.now();
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }
  if (options?.persistToSession && typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry<T>;
        if (parsed?.expiresAt > now) {
          responseCache.set(key, parsed as CacheEntry<unknown>);
          return parsed.value;
        }
        window.sessionStorage.removeItem(`${SESSION_CACHE_PREFIX}${key}`);
      }
    } catch {
      // Ignore unavailable or malformed session cache entries.
    }
  }

  const inFlight = inFlightCache.get(key);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const requestPromise = fetcher()
    .then((result) => {
      const entry: CacheEntry<T> = {
        expiresAt: Date.now() + ttlMs,
        value: result,
      };
      responseCache.set(key, entry as CacheEntry<unknown>);
      if (options?.persistToSession && typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${key}`, JSON.stringify(entry));
        } catch {
          // Ignore session storage failures in strict/private contexts.
        }
      }
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

function buildInspirationQuery(options?: InspirationListOptions): string {
  const params = new URLSearchParams();
  if (typeof options?.limit === 'number') params.set('limit', String(options.limit));
  if (typeof options?.offset === 'number' && options.offset > 0) params.set('offset', String(options.offset));
  if (options?.sort) params.set('sort', options.sort);
  const query = params.toString();
  return query ? `?${query}` : '';
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
  const resolvedUserId = options.userId ?? getCurrentUserId();
  if (resolvedUserId) {
    headers.set('X-User-ID', resolvedUserId);
  }

  const baseCandidates = [getApiUrl(), getApiFallbackUrl()].filter(Boolean);
  const tried: string[] = [];
  let response: Response | null = null;
  let lastNetworkError: unknown = null;
  let lastTimeoutError: Error | null = null;

  for (const base of baseCandidates) {
    tried.push(base);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const timeoutId =
      controller && timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;
    if (controller && init.signal) {
      if (init.signal.aborted) {
        controller.abort();
      } else {
        init.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers,
        signal: controller?.signal ?? init.signal,
        cache: options.cache,
        next: options.next,
      });
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === 'AbortError' && timeoutMs > 0) {
        lastTimeoutError = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
        continue;
      }
      lastNetworkError = error;
      continue;
    }
    if (timeoutId) clearTimeout(timeoutId);

    if (response.ok) break;
    if (![502, 503, 504].includes(response.status)) break;
  }

  if (!response) {
    if (lastTimeoutError) {
      throw lastTimeoutError;
    }
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
  async primeDashboardWarmCache(userId: string) {
    if (!userId) return;
    const [images, videos, imageInspiration, videoInspiration, projects, wallet] = await Promise.all([
      api.listGeneratedImages(userId, 8).catch(() => [] as GeneratedImage[]),
      api.listVideos(userId, 8).catch(() => [] as Video[]),
      api.listImageInspiration(userId, 6).catch(() => [] as InspirationImage[]),
      api.listVideoInspiration(userId, 6).catch(() => [] as InspirationVideo[]),
      api.listProjects(userId).catch(() => [] as Project[]),
      api.getCreditWallet(userId).catch(() => null as CreditWallet | null),
    ]);

    if (typeof window === 'undefined') return;
    try {
      const dashboardPayload = JSON.stringify({
        ts: Date.now(),
        allAssets: [
          ...videos.map((video) => ({
            id: video.id,
            content_type: 'video' as const,
            project_id: video.project_id,
            mode_id: video.mode_id,
            template_id: video.template_id,
            title: video.title || 'Generated video',
            model_key: video.selected_model || video.provider_name || 'video',
            resolution: video.resolution,
            aspect_ratio: video.aspect_ratio,
            prompt: video.script,
            thumbnail_url: video.thumbnail_url,
            asset_url: video.output_url,
            status: video.status,
            created_at: video.created_at,
            reference_urls: video.reference_images,
            auto_tags: video.auto_tags,
            user_tags: video.user_tags,
            is_public_inspiration: video.is_public_inspiration,
            moderation_status: video.moderation_status,
            inspiration_score: video.inspiration_score,
            like_count: video.like_count,
          })),
          ...images.map((image) => ({
            id: image.id,
            content_type: 'image' as const,
            project_id: image.project_id,
            mode_id: image.mode_id,
            template_id: image.template_id,
            title: image.prompt.split('.').find(Boolean)?.trim() || 'Generated image',
            model_key: image.model_key,
            resolution: image.resolution,
            aspect_ratio: image.aspect_ratio,
            prompt: image.prompt,
            thumbnail_url: image.thumbnail_url || image.image_url,
            asset_url: image.image_url,
            status: image.status,
            created_at: image.created_at,
            reference_urls: image.reference_urls,
            auto_tags: image.auto_tags,
            user_tags: image.user_tags,
            is_public_inspiration: image.is_public_inspiration,
            moderation_status: image.moderation_status,
            inspiration_score: image.inspiration_score,
            like_count: image.like_count,
          })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        imageInspiration,
        videoInspiration,
      });
      window.sessionStorage.setItem(`rangmanch:dashboard:v2:${userId}`, dashboardPayload);
      window.localStorage.setItem(`rangmanch:dashboard:v2:${userId}`, dashboardPayload);

      if (wallet) {
        const walletPayload = JSON.stringify({ ts: Date.now(), wallet });
        window.sessionStorage.setItem(`rangmanch:credit-wallet:${userId}`, walletPayload);
        window.localStorage.setItem(`rangmanch:credit-wallet:${userId}`, walletPayload);
      }
      if (projects.length > 0) {
        window.sessionStorage.setItem(
          `rangmanch:projects:v1:${userId}`,
          JSON.stringify({ ts: Date.now(), projects }),
        );
      }
    } catch {
      // ignore storage write failures
    }
  },
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
  listAvatarLibrary(userId: string, params?: { refreshPresets?: boolean }) {
    const query = new URLSearchParams();
    if (params?.refreshPresets) query.set('refresh_presets', 'true');
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<AvatarLibraryResponse>(`/api/avatars/library${suffix}`, {}, { userId, cache: 'no-store' });
  },
  listActors(userId: string, params?: { search?: string; scope?: string; language?: string }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.scope) query.set('scope', params.scope);
    if (params?.language) query.set('language', params.language);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<Avatar[]>(`/actors/list${suffix}`, {}, { userId, cache: 'no-store' });
  },
  getActorDetails(actorId: string, userId: string) {
    return request<ActorDetailResponse>(`/actors/${actorId}`, {}, { userId, cache: 'no-store' });
  },
  testAvatar(payload: TestAvatarRequest, userId: string) {
    return request<TestAvatarResponse>('/test-avatar', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store', timeoutMs: 120_000 });
  },
  listTemplates(userId: string, params?: { search?: string; category?: string; aspect_ratio?: string }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.aspect_ratio) query.set('aspect_ratio', params.aspect_ratio);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<Template[]>(`/templates${suffix}`, {}, { userId, cache: 'no-store' });
  },
  listUnifiedTemplates(
    userId: string,
    params?: {
      type?: 'image' | 'video';
      category?: string;
      trending?: boolean;
      featured?: boolean;
      active?: boolean;
      aspect_ratio?: string;
      search?: string;
    },
  ) {
    const query = new URLSearchParams();
    if (params?.type) query.set('type', params.type);
    if (params?.category) query.set('category', params.category);
    if (params?.trending !== undefined) query.set('trending', String(params.trending));
    if (params?.featured !== undefined) query.set('featured', String(params.featured));
    if (params?.active !== undefined) query.set('active', String(params.active));
    if (params?.aspect_ratio) query.set('aspect_ratio', params.aspect_ratio);
    if (params?.search) query.set('search', params.search);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const path = `/api/templates${suffix}`;
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 60_000, () =>
      request<Template[]>(path, {}, { userId, cache: 'no-store', timeoutMs: 30_000 }),
    );
  },
  listRecipes(
    userId: string,
    params?: {
      type?: 'image' | 'video';
      active?: boolean;
      featured?: boolean;
    },
  ) {
    const query = new URLSearchParams();
    if (params?.type) query.set('type', params.type);
    if (params?.active !== undefined) query.set('active', String(params.active));
    if (params?.featured !== undefined) query.set('featured', String(params.featured));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const path = `/api/recipes${suffix}`;
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 5 * 60_000, () =>
      request<RecipeCatalog[]>(path, {}, { userId, cache: 'no-store', timeoutMs: 45_000 }),
      { persistToSession: true },
    );
  },
  getTemplate(templateId: string, userId: string) {
    return request<Template>(`/api/templates/${templateId}`, {}, { userId, cache: 'no-store' });
  },
  previewTemplate(payload: TemplateGenerateRequest, userId: string) {
    return request<TemplatePreviewResponse>('/api/templates/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  generateFromTemplate(payload: TemplateGenerateRequest, userId: string) {
    return request<TemplateGenerateResponse>('/api/templates/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/api/credits/wallet', '/ai/images', '/videos', '/assets/search', '/assets/tags']);
      return result;
    });
  },
  createAdminTemplate(payload: Template, userId: string) {
    return request<Template>('/api/admin/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  updateAdminTemplate(templateId: string, payload: Template, userId: string) {
    return request<Template>(`/api/admin/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  updateAdminTemplateStatus(templateId: string, payload: { active: boolean; trending?: boolean; featured?: boolean }, userId: string) {
    return request<Template>(`/api/admin/templates/${templateId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  deleteAdminTemplate(templateId: string, userId: string) {
    return request<Template>(`/api/admin/templates/${templateId}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    }, { userId, cache: 'no-store' });
  },
  uploadTemplatePreview(file: File, userId: string) {
    const body = new FormData();
    body.append('file', file);
    return request<{ url: string }>('/api/admin/templates/upload-preview', {
      method: 'POST',
      body,
    }, { userId, cache: 'no-store' });
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
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/projects']);
      return result;
    });
  },
  listProjects(userId: string, revalidateSeconds = 10, timeoutMs = 45_000) {
    const path = '/projects';
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, revalidateSeconds * 1000, () =>
      request<Project[]>(path, {}, { userId, cache: 'no-store', timeoutMs }),
    );
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
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/projects', `/projects/${projectId}`]);
      return result;
    });
  },
  deleteProject(projectId: string, userId: string) {
    return request<{ asset_id: string; deleted: boolean }>(`/projects/${projectId}`, {
      method: 'DELETE',
    }, { userId, cache: 'no-store', timeoutMs: 25_000 }).then((result) => {
      invalidateUserCache(userId, ['/projects', `/projects/${projectId}`]);
      return result;
    });
  },
  addProjectAsset(projectId: string, payload: { filename: string; kind: string }, userId: string) {
    return request<ProjectAsset>(`/projects/${projectId}/assets`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store' });
  },
  assignImageToProject(imageId: string, projectId: string, userId: string) {
    return request<AssetProjectAssignmentResponse>(`/projects/assets/image/${imageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ projectId }),
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/projects', '/ai/images', '/assets/search', '/assets/tags']);
      return result;
    });
  },
  assignVideoToProject(videoId: string, projectId: string, userId: string) {
    return request<AssetProjectAssignmentResponse>(`/projects/assets/video/${videoId}`, {
      method: 'PATCH',
      body: JSON.stringify({ projectId }),
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/projects', '/videos', '/assets/search', '/assets/tags']);
      return result;
    });
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
  analyzeMakeAnythingDanceVideo(videoUrl: string, userId: string) {
    return request<MotionReferenceVideoAnalysisResponse>('/api/recipes/make-anything-dance/analyze', {
      method: 'POST',
      body: JSON.stringify({ video_url: videoUrl }),
    }, { userId, cache: 'no-store', timeoutMs: 45_000 });
  },
  deleteUpload(assetId: string, userId: string) {
    return request<{ asset_id: string; deleted: boolean }>(`/uploads/${assetId}`, {
      method: 'DELETE',
    }, { userId, cache: 'no-store' });
  },
  listVideos(userId: string, limit?: number, timeoutMs = 35_000) {
    const path = limit ? `/videos?limit=${limit}` : '/videos';
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 6_000, () =>
      request<Video[]>(path, {}, { userId, cache: 'no-store', timeoutMs }),
    );
  },
  listMusicTracks() {
    return request<MusicTrack[]>('/music-tracks', {}, { cache: 'no-store' });
  },
  getTtsCatalog(userId: string) {
    return request<TTSCatalogResponse>('/tts/catalog', {}, { userId, cache: 'no-store' });
  },
  listNotifications(userId: string, limit = 20) {
    return request<AppNotification[]>(`/notifications?limit=${limit}`, {}, { userId, cache: 'no-store', timeoutMs: 20_000 });
  },
  markNotificationsRead(userId: string, ids: string[] = []) {
    return request<{ updated: number }>('/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }, { userId, cache: 'no-store', timeoutMs: 20_000 });
  },
  clearNotifications(userId: string) {
    return request<{ deleted: number }>('/notifications/clear', {
      method: 'POST',
    }, { userId, cache: 'no-store', timeoutMs: 20_000 });
  },
  getAvatarProductTtsCatalog(userId: string) {
    return request<TTSCatalogResponse>('/api/recipes/avatar-product/tts-catalog', {}, { userId, cache: 'no-store' });
  },
  previewTts(payload: TTSPreviewRequest, userId: string) {
    return request<TTSPreviewResponse>('/tts/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store', timeoutMs: 30_000 });
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
  autofillAvatarProduct: async (payload: {
    text: string;
    image_url?: string;
    advanced_controls?: Record<string, unknown>;
  }) => {
    const res = await fetch(`${getApiUrl()}/api/recipes/avatar-product/autofill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Autofill API failed');
    }
  
    return res.json();
  },
  deleteVideo(videoId: string, userId: string) {
    return request<{ asset_id: string; deleted: boolean }>(`/videos/${videoId}`, {
      method: 'DELETE',
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/videos', '/assets/search', '/assets/tags', '/api/videos/inspiration']);
      return result;
    });
  },
  retryVideo(videoId: string, userId: string, payload: VideoRetryRequest = {}) {
    return request<{ id: string; status: string }>(`/videos/${videoId}/retry`, {
      method: 'POST',
      body: JSON.stringify(payload),
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
  listAIVideoModels(userId: string) {
    const path = '/api/video/models';
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 5 * 60_000, () =>
      request<AIVideoModel[]>(path, {}, { userId, cache: 'no-store', timeoutMs: 45_000 }),
      { persistToSession: true },
    );
  },
  createAIVideo(payload: VideoCreateRequest, userId: string) {
    return request<VideoCreateResponse>('/api/ai/video/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store', timeoutMs: 180_000 });
  },
  getVideo(videoId: string, userId: string) {
    return request<Video>(`/videos/${videoId}`, {}, { userId, cache: 'no-store' });
  },
  assistAvatarProductRecipe(payload: AvatarProductAssistRequest, userId: string) {
    return request<AvatarProductAssistResponse>('/api/recipes/avatar-product/assist', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store', timeoutMs: 45_000 });
  },
  getAIVideoStatus(videoId: string, userId: string) {
    return request<AIVideoStatusResponse>(`/api/ai/video/status/${videoId}`, {}, { userId, cache: 'no-store', timeoutMs: 60_000 });
  },
  videoStudioChat(payload: VideoStudioChatRequest, userId: string) {
    return request<VideoStudioChatResponse>('/api/ai/video/studio-chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store', timeoutMs: 35_000 });
  },
  listImageModels(userId: string) {
    const path = '/ai/image/models';
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 5 * 60_000, () =>
      request<ImageModel[]>(path, {}, { userId, cache: 'no-store', timeoutMs: 30_000 }),
      { persistToSession: true },
    );
  },
  listGeneratedImages(userId: string, limit?: number) {
    const path = limit ? `/ai/images?limit=${limit}` : '/ai/images';
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 6_000, () =>
      request<GeneratedImage[]>(path, {}, { userId, cache: 'no-store', timeoutMs: 35_000 }),
    );
  },
  listImageInspiration(userId: string, options?: number | InspirationListOptions) {
    const normalized = typeof options === 'number' ? { limit: options } : options;
    const path = `/ai/images/inspiration${buildInspirationQuery(normalized)}`;
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 10_000, () =>
      request<InspirationImage[]>(path, {}, { userId, cache: 'no-store', timeoutMs: 35_000 }),
    );
  },
  listPublicImageInspiration(options?: number | InspirationListOptions) {
    const normalized = typeof options === 'number' ? { limit: options } : options;
    const path = `/public/images/inspiration${buildInspirationQuery(normalized)}`;
    const cacheKey = makeCacheKey(path, undefined);
    return cachedRequest(cacheKey, 10_000, () =>
      request<InspirationImage[]>(path, {}, { cache: 'force-cache', timeoutMs: 15_000 }),
      { persistToSession: true },
    );
  },
  listVideoInspiration(userId: string, options?: number | InspirationListOptions) {
    const normalized = typeof options === 'number' ? { limit: options } : options;
    const path = `/api/videos/inspiration${buildInspirationQuery(normalized)}`;
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 10_000, () =>
      request<InspirationVideo[]>(path, {}, { userId, cache: 'no-store', timeoutMs: 35_000 }),
    );
  },
  listPublicVideoInspiration(options?: number | InspirationListOptions) {
    const normalized = typeof options === 'number' ? { limit: options } : options;
    const path = `/public/videos/inspiration${buildInspirationQuery(normalized)}`;
    const cacheKey = makeCacheKey(path, undefined);
    return cachedRequest(cacheKey, 10_000, () =>
      request<InspirationVideo[]>(path, {}, { cache: 'force-cache', timeoutMs: 35_000 }),
      { persistToSession: true },
    );
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
      invalidateAnonCache(['/public/images/inspiration', '/public/videos/inspiration']);
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
      request<AssetTagFacet[]>(path, {}, { userId, cache: 'no-store', timeoutMs: 30_000 }),
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
      image_count?: number;
      reference_urls: string[];
      reference_mode?: 'inspiration' | 'edit';
      project_id?: string;
      mode_id?: string;
      template_id?: string;
      request_id?: string;
    },
    userId: string,
  ) {
    return request<GeneratedImage>('/ai/image/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId, cache: 'no-store', timeoutMs: 120_000 }).then((result) => {
      invalidateUserCache(userId, ['/api/credits/wallet', '/ai/images', '/assets/search', '/assets/tags']);
      return result;
    });
  },
  deleteGeneratedImage(imageId: string, userId: string) {
    return request<{ asset_id: string; deleted: boolean }>(`/ai/images/${imageId}`, {
      method: 'DELETE',
    }, { userId, cache: 'no-store' }).then((result) => {
      invalidateUserCache(userId, ['/ai/images', '/assets/search', '/assets/tags', '/ai/images/inspiration']);
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
    const execute = () =>
      request<ImageActionResponse>('/ai/images/action', {
        method: 'POST',
        body: JSON.stringify({ image_id: imageId, action_type: action }),
      }, { userId, cache: 'no-store', timeoutMs: 120_000 });
    return execute().catch(async (error) => {
      // One lightweight retry for transient backend/network failures during long-running actions.
      await new Promise((resolve) => setTimeout(resolve, 350));
      return execute();
    }).then((result) => {
      invalidateUserCache(userId, ['/ai/images', '/assets/search', '/assets/tags', '/api/credits/wallet']);
      return result;
    });
  },
  getCreditWallet(userId: string) {
    const path = '/api/credits/wallet';
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 8_000, () =>
      request<CreditWallet>(path, {}, { userId, cache: 'no-store', timeoutMs: 25_000 }),
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
    const path = '/api/pricing';
    const cacheKey = makeCacheKey(path, undefined);
    return cachedRequest(cacheKey, 5 * 60_000, () =>
      request<PricingResponse>(path, {}, { cache: 'no-store' }),
    );
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
    const path = `/api/creditHistory?limit=${limit}`;
    const cacheKey = makeCacheKey(path, userId);
    return cachedRequest(cacheKey, 8_000, () =>
      request<{ items: CreditHistoryItem[] }>(path, {}, { userId, cache: 'no-store' }),
    );
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
