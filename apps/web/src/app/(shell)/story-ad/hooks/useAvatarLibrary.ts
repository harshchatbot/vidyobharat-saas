'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

export interface AvatarOption {
  id: string;
  personaId: string;
  name: string;
  imageUrl?: string;
  previewVideoUrl?: string;
  description?: string;
  source: 'preset' | 'saved';
  sourceLabel: string;
  styleLabel?: string;
  languageInfo?: string;
  voiceInfo?: string;
  genderPresentation?: string;
  languageTags?: string[];
  referenceImages?: string[];
}

export function useAvatarLibrary(userId: string | null) {
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAvatarLibrary = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    try {
      const library = await api.listAvatarLibrary(userId);

      // Transform the library response into our AvatarOption format
      const presetItems: AvatarOption[] = (library?.preset_avatars || []).map((avatar: any) => ({
        id: avatar.id || avatar.personaId,
        personaId: avatar.personaId || avatar.id,
        name: avatar.name,
        imageUrl: avatar.thumbnail_url || avatar.imageUrl || avatar.primary_image,
        previewVideoUrl: avatar.preview_video_url || avatar.previewVideoUrl,
        description: avatar.description,
        source: 'preset',
        sourceLabel: 'Public',
        styleLabel: avatar.styleLabel,
        languageInfo: avatar.languageInfo,
        voiceInfo: avatar.voiceInfo,
        genderPresentation: avatar.genderPresentation,
        languageTags: avatar.languageTags,
        referenceImages: Array.isArray(avatar.reference_image_variants)
          ? avatar.reference_image_variants.map((item: any) => String(item?.url || '')).filter(Boolean)
          : Array.isArray(avatar.reference_images)
            ? avatar.reference_images
            : [],
      }));

      const userItems: AvatarOption[] = (library?.user_avatars || []).map((avatar: any) => ({
        id: avatar.id || avatar.personaId,
        personaId: avatar.personaId || avatar.id,
        name: avatar.name,
        imageUrl: avatar.thumbnail_url || avatar.imageUrl || avatar.primary_image,
        previewVideoUrl: avatar.preview_video_url || avatar.previewVideoUrl,
        description: avatar.description,
        source: 'saved',
        sourceLabel: 'Saved',
        styleLabel: avatar.styleLabel,
        languageInfo: avatar.languageInfo,
        voiceInfo: avatar.voiceInfo,
        genderPresentation: avatar.genderPresentation,
        languageTags: avatar.languageTags,
        referenceImages: Array.isArray(avatar.reference_image_variants)
          ? avatar.reference_image_variants.map((item: any) => String(item?.url || '')).filter(Boolean)
          : Array.isArray(avatar.reference_images)
            ? avatar.reference_images
            : [],
      }));

      // Also include general avatars list if available
      const generalAvatars: AvatarOption[] = (library?.avatars || []).map((avatar: any) => ({
        id: avatar.id || avatar.personaId,
        personaId: avatar.personaId || avatar.id,
        name: avatar.name,
        imageUrl: avatar.thumbnail_url || avatar.imageUrl || avatar.primary_image,
        previewVideoUrl: avatar.preview_video_url || avatar.previewVideoUrl,
        description: avatar.description,
        source: avatar.scope === 'public' ? 'preset' : 'saved',
        sourceLabel: avatar.scope === 'public' ? 'Public' : 'Saved',
        styleLabel: avatar.styleLabel,
        languageInfo: avatar.languageInfo,
        voiceInfo: avatar.voiceInfo,
        genderPresentation: avatar.genderPresentation,
        languageTags: avatar.languageTags,
        referenceImages: Array.isArray(avatar.reference_image_variants)
          ? avatar.reference_image_variants.map((item: any) => String(item?.url || '')).filter(Boolean)
          : Array.isArray(avatar.reference_images)
            ? avatar.reference_images
            : [],
      }));

      setAvatars([...presetItems, ...userItems, ...generalAvatars]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load avatars';
      setError(message);
      console.error('Error loading avatar library:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return {
    avatars,
    loading,
    error,
    loadAvatarLibrary,
  };
}
