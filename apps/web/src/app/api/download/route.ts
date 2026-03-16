import { NextRequest } from 'next/server';

function sanitizeFilename(value: string | null) {
  const safe = (value ?? 'download')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || 'download';
}

function extensionFromContentType(contentType: string) {
  if (contentType.includes('mp4')) return '.mp4';
  if (contentType.includes('webm')) return '.webm';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('svg')) return '.svg';
  if (contentType.includes('avif')) return '.avif';
  return '';
}

function extensionFromPathname(pathname: string) {
  const normalized = pathname.toLowerCase().split('?')[0];
  if (normalized.endsWith('.mp4')) return '.mp4';
  if (normalized.endsWith('.webm')) return '.webm';
  if (normalized.endsWith('.png')) return '.png';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return '.jpg';
  if (normalized.endsWith('.webp')) return '.webp';
  if (normalized.endsWith('.gif')) return '.gif';
  if (normalized.endsWith('.svg')) return '.svg';
  if (normalized.endsWith('.avif')) return '.avif';
  return '';
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const filename = sanitizeFilename(request.nextUrl.searchParams.get('filename'));

  if (!url) {
    return new Response('Missing url', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response('Invalid url', { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return new Response('Unsupported protocol', { status: 400 });
  }

  const isFirebaseStorageHost = (hostname: string) =>
    hostname === 'firebasestorage.googleapis.com' ||
    hostname === 'storage.googleapis.com' ||
    hostname.endsWith('.firebasestorage.app') ||
    hostname.endsWith('.appspot.com');
  const isKnownMediaHost = (hostname: string) =>
    hostname.endsWith('.fal.media') ||
    hostname === 'fal.media' ||
    hostname.endsWith('.openaiusercontent.com') ||
    hostname.endsWith('.blob.core.windows.net') ||
    hostname === 'images.unsplash.com';

  const firebaseBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim().replace(/^gs:\/\//, '').replace(/\/+$/, '');
  const isBucketHostMatch = firebaseBucket ? parsed.hostname === firebaseBucket : false;

  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (configuredApiUrl) {
    try {
      const configuredOrigin = new URL(configuredApiUrl).origin;
      const allowed =
        parsed.origin === configuredOrigin ||
        isFirebaseStorageHost(parsed.hostname) ||
        isBucketHostMatch ||
        isKnownMediaHost(parsed.hostname);
      if (!allowed) {
        return new Response('Blocked origin', { status: 400 });
      }
    } catch {
      return new Response('Invalid API URL configuration', { status: 500 });
    }
  } else {
    const allowed = isFirebaseStorageHost(parsed.hostname) || isBucketHostMatch || isKnownMediaHost(parsed.hostname);
    if (!allowed) {
      return new Response('Blocked origin', { status: 400 });
    }
  }

  const upstream = await fetch(parsed.toString(), { cache: 'no-store' });
  if (!upstream.ok) {
    return new Response(`Upstream download failed (${upstream.status})`, { status: upstream.status });
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const extension = extensionFromContentType(contentType) || extensionFromPathname(parsed.pathname);

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename.endsWith(extension) || !extension ? filename : `${filename}${extension}`}"`,
      'Cache-Control': 'no-store',
    },
  });
}
