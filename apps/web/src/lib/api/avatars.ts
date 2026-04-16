import type {
    CreateCustomAvatarRequest,
    CreateCustomAvatarResponse,
    GenerateCustomAvatarPreviewRequest,
    GenerateCustomAvatarPreviewResponse,
    CustomAvatarPreviewStatusResponse,
  } from '@/lib/api';
  
  const API_BASE =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_FALLBACK_URL ||
    '';
  
  async function parseJson<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let message = 'Request failed';
  
      try {
        const data = await res.json();
        if (typeof data?.detail === 'string') {
          message = data.detail;
        } else if (typeof data?.detail?.message === 'string') {
          message = data.detail.message;
        } else if (typeof data?.message === 'string') {
          message = data.message;
        }
      } catch {
        // ignore json parse errors and keep default message
      }
  
      throw new Error(message);
    }
  
    return res.json() as Promise<T>;
  }
  
  export async function createCustomAvatar(
    payload: CreateCustomAvatarRequest,
  ): Promise<CreateCustomAvatarResponse> {
    const res = await fetch(`${API_BASE}/api/avatars/custom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
  
    return parseJson<CreateCustomAvatarResponse>(res);
  }
  
  export async function generateCustomAvatarPreview(
    avatarId: string,
    payload: GenerateCustomAvatarPreviewRequest,
  ): Promise<GenerateCustomAvatarPreviewResponse> {
    const res = await fetch(`${API_BASE}/api/avatars/custom/${avatarId}/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
  
    return parseJson<GenerateCustomAvatarPreviewResponse>(res);
  }
  
  export async function getCustomAvatarPreviewStatus(
    avatarId: string,
    jobId: string,
  ): Promise<CustomAvatarPreviewStatusResponse> {
    const res = await fetch(`${API_BASE}/api/avatars/custom/${avatarId}/preview/${jobId}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  
    return parseJson<CustomAvatarPreviewStatusResponse>(res);
  }