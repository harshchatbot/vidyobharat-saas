'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Camera, LoaderCircle, Mail, MapPin, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { UserProfile, UserProfileUpdateRequest } from '@/types/api';

function toAbsoluteUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http://') || url.startsWith('https://') ? url : `${API_URL}${url}`;
}

type Props = {
  userId: string;
  initialName: string | null;
  initialEmail: string | null;
  initialAvatar: string | null;
};

export function ProfileClient({ userId, initialName, initialEmail, initialAvatar }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<UserProfileUpdateRequest>({
    display_name: initialName ?? 'User',
    email: initialEmail,
    phone: null,
    bio: null,
    company: null,
    address_line1: null,
    address_line2: null,
    city: null,
    state: null,
    country: null,
    postal_code: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatar);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [avatarDraftFileName, setAvatarDraftFileName] = useState('avatar.png');
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void api.getMyProfile(userId)
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setForm({
          display_name: data.display_name ?? initialName ?? 'User',
          email: data.email ?? initialEmail,
          phone: data.phone,
          bio: data.bio,
          company: data.company,
          address_line1: data.address_line1,
          address_line2: data.address_line2,
          city: data.city,
          state: data.state,
          country: data.country,
          postal_code: data.postal_code,
          timezone: data.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || null),
        });
        setAvatarUrl(data.avatar_url ?? initialAvatar);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load profile');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialAvatar, initialEmail, initialName, userId]);

  const avatarPreview = useMemo(() => toAbsoluteUrl(avatarUrl), [avatarUrl]);

  const updateField = (field: keyof UserProfileUpdateRequest, value: string) => {
    setForm((current) => ({ ...current, [field]: value || null }));
  };

  const syncSession = async (nextName: string | null, nextEmail: string | null, nextAvatar: string | null) => {
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nextName, email: nextEmail, avatarUrl: nextAvatar }),
    });
    router.refresh();
  };

  const onAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarDraftUrl(typeof reader.result === 'string' ? reader.result : null);
      setAvatarDraftFileName(file.name || 'avatar.png');
      setCropZoom(1);
      setCropX(0);
      setCropY(0);
      setCropModalOpen(true);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const cropAndUploadAvatar = async () => {
    if (!avatarDraftUrl) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const blob = await createCroppedAvatarBlob({
        imageUrl: avatarDraftUrl,
        zoom: cropZoom,
        offsetX: cropX,
        offsetY: cropY,
        size: 512,
      });
      const file = new File([blob], avatarDraftFileName.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
      const response = await api.uploadMyAvatar(file, userId);
      setAvatarUrl(response.avatar_url);
      setCropModalOpen(false);
      setAvatarDraftUrl(null);
      await syncSession(form.display_name, form.email, response.avatar_url);
      setSuccess('Profile photo updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!form.display_name?.trim()) {
      setError('Display name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.updateMyProfile(
        {
          ...form,
          display_name: form.display_name.trim(),
          email: form.email?.trim() || null,
          phone: form.phone?.trim() || null,
          bio: form.bio?.trim() || null,
          company: form.company?.trim() || null,
          address_line1: form.address_line1?.trim() || null,
          address_line2: form.address_line2?.trim() || null,
          city: form.city?.trim() || null,
          state: form.state?.trim() || null,
          country: form.country?.trim() || null,
          postal_code: form.postal_code?.trim() || null,
          timezone: form.timezone?.trim() || null,
        },
        userId,
      );
      setProfile(updated);
      await syncSession(updated.display_name, updated.email, avatarUrl);
      setSuccess('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="flex items-center gap-3">
        <LoaderCircle className="h-5 w-5 animate-spin text-[hsl(var(--color-accent))]" />
        <p className="text-sm text-muted">Loading profile...</p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-[var(--radius-lg)] border border-border bg-[hsl(var(--color-bg))] p-5">
            <div className="flex flex-col items-center text-center">
              {avatarPreview ? (
                <img src={avatarPreview} alt={form.display_name ?? 'Profile'} className="h-28 w-28 rounded-full border border-border object-cover shadow-soft" />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
                  <UserRound className="h-12 w-12" />
                </div>
              )}
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm font-semibold text-text">
                {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {uploading ? 'Uploading...' : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden" onChange={onAvatarUpload} />
              </label>
              <p className="mt-4 font-heading text-2xl font-extrabold tracking-tight text-text">{form.display_name ?? 'User'}</p>
              <p className="mt-1 text-sm text-muted">{form.email ?? 'No email set'}</p>
              <div className="mt-4 w-full rounded-[var(--radius-md)] border border-border bg-[hsl(var(--color-surface))] p-4 text-left">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                  <ShieldCheck className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                  Account summary
                </p>
                <div className="mt-3 space-y-2 text-sm text-text">
                  <p><span className="text-muted">User ID:</span> {profile?.id ?? userId}</p>
                  <p><span className="text-muted">Joined:</span> {profile ? new Date(profile.created_at).toLocaleDateString() : 'Recently'}</p>
                  <p><span className="text-muted">Timezone:</span> {form.timezone ?? 'Not set'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">Profile</h1>
              <p className="mt-2 text-sm text-muted">Keep your account details current so exports, billing, and workspace identity stay consistent.</p>
            </div>

            {error ? <p className="rounded-[var(--radius-md)] border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger)/0.08)] px-4 py-3 text-sm text-[hsl(var(--color-danger))]">{error}</p> : null}
            {success ? <p className="rounded-[var(--radius-md)] border border-[hsl(var(--color-success)/0.25)] bg-[hsl(var(--color-success)/0.08)] px-4 py-3 text-sm text-[hsl(var(--color-success))]">{success}</p> : null}

            <div className="grid gap-5">
              <Card className="space-y-4">
                <p className="text-sm font-semibold text-text">Personal information</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-text"><UserRound className="h-4 w-4 text-[hsl(var(--color-accent))]" /> Display name</span>
                    <Input value={form.display_name ?? ''} onChange={(event) => updateField('display_name', event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-text"><Mail className="h-4 w-4 text-[hsl(var(--color-accent))]" /> Email</span>
                    <Input type="email" value={form.email ?? ''} onChange={(event) => updateField('email', event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-text"><Phone className="h-4 w-4 text-[hsl(var(--color-accent))]" /> Phone</span>
                    <Input value={form.phone ?? ''} onChange={(event) => updateField('phone', event.target.value)} placeholder="+91 98..." />
                  </label>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-text"><Building2 className="h-4 w-4 text-[hsl(var(--color-accent))]" /> Company</span>
                    <Input value={form.company ?? ''} onChange={(event) => updateField('company', event.target.value)} />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-2 text-sm font-semibold text-text">Bio</span>
                  <Textarea rows={4} value={form.bio ?? ''} onChange={(event) => updateField('bio', event.target.value)} placeholder="Short creator or company bio" />
                </label>
              </Card>

              <Card className="space-y-4">
                <p className="text-sm font-semibold text-text">Address details</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-text"><MapPin className="h-4 w-4 text-[hsl(var(--color-accent))]" /> Address line 1</span>
                    <Input value={form.address_line1 ?? ''} onChange={(event) => updateField('address_line1', event.target.value)} />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-2 text-sm font-semibold text-text">Address line 2</span>
                    <Input value={form.address_line2 ?? ''} onChange={(event) => updateField('address_line2', event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-2 text-sm font-semibold text-text">City</span>
                    <Input value={form.city ?? ''} onChange={(event) => updateField('city', event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-2 text-sm font-semibold text-text">State</span>
                    <Input value={form.state ?? ''} onChange={(event) => updateField('state', event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-2 text-sm font-semibold text-text">Country</span>
                    <Input value={form.country ?? ''} onChange={(event) => updateField('country', event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-2 text-sm font-semibold text-text">Postal code</span>
                    <Input value={form.postal_code ?? ''} onChange={(event) => updateField('postal_code', event.target.value)} />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-2 text-sm font-semibold text-text">Timezone</span>
                    <Input value={form.timezone ?? ''} onChange={(event) => updateField('timezone', event.target.value)} />
                  </label>
                </div>
              </Card>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void saveProfile()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-5 py-3 text-sm font-semibold text-[hsl(var(--color-accent-contrast))] disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Modal open={cropModalOpen} onClose={() => !uploading && setCropModalOpen(false)}>
        <div className="space-y-5">
          <div>
            <h2 className="font-heading text-xl font-extrabold tracking-tight text-text">Adjust profile photo</h2>
            <p className="mt-1 text-sm text-muted">Position your image inside the circular frame before saving it.</p>
          </div>

          <div className="flex justify-center">
            <div className="relative h-56 w-56 overflow-hidden rounded-full border border-border bg-[hsl(var(--color-bg))] shadow-soft">
              {avatarDraftUrl ? (
                <img
                  src={avatarDraftUrl}
                  alt="Avatar crop preview"
                  className="absolute left-1/2 top-1/2 max-w-none"
                  style={getCropPreviewStyle(cropZoom, cropX, cropY)}
                />
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-text">Zoom</span>
              <input type="range" min="1" max="2.5" step="0.01" value={cropZoom} onChange={(event) => setCropZoom(Number(event.target.value))} className="w-full accent-accent" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-text">Horizontal position</span>
              <input type="range" min="-160" max="160" step="1" value={cropX} onChange={(event) => setCropX(Number(event.target.value))} className="w-full accent-accent" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-text">Vertical position</span>
              <input type="range" min="-160" max="160" step="1" value={cropY} onChange={(event) => setCropY(Number(event.target.value))} className="w-full accent-accent" />
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setCropModalOpen(false)}
              disabled={uploading}
              className="rounded-[var(--radius-md)] border border-border px-4 py-2 text-sm font-semibold text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void cropAndUploadAvatar()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-accent-contrast))] disabled:opacity-60"
            >
              {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {uploading ? 'Saving...' : 'Save photo'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function getCropPreviewStyle(zoom: number, offsetX: number, offsetY: number) {
  return {
    width: `${zoom * 100}%`,
    height: 'auto',
    transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
  };
}

async function createCroppedAvatarBlob({
  imageUrl,
  zoom,
  offsetX,
  offsetY,
  size,
}: {
  imageUrl: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
  size: number;
}) {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas is not available for avatar cropping');
  }

  const baseScale = Math.max(size / image.width, size / image.height);
  const drawWidth = image.width * baseScale * zoom;
  const drawHeight = image.height * baseScale * zoom;
  const drawX = (size - drawWidth) / 2 + offsetX;
  const drawY = (size - drawHeight) / 2 + offsetY;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create cropped avatar'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = src;
  });
}
