import { NextRequest } from 'next/server';

function sanitizeFilename(value: string | null) {
  const safe = (value ?? 'download')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || 'download';
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

  const firebaseBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim().replace(/^gs:\/\//, '').replace(/\/+$/, '');
  const isBucketHostMatch = firebaseBucket ? parsed.hostname === firebaseBucket : false;

  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (configuredApiUrl) {
    try {
      const configuredOrigin = new URL(configuredApiUrl).origin;
      const allowed =
        parsed.origin === configuredOrigin ||
        isFirebaseStorageHost(parsed.hostname) ||
        isBucketHostMatch;
      if (!allowed) {
        return new Response('Blocked origin', { status: 400 });
      }
    } catch {
      return new Response('Invalid API URL configuration', { status: 500 });
    }
  } else {
    const allowed = isFirebaseStorageHost(parsed.hostname) || isBucketHostMatch;
    if (!allowed) {
      return new Response('Blocked origin', { status: 400 });
    }
  }

  const upstream = await fetch(parsed.toString(), { cache: 'no-store' });
  if (!upstream.ok) {
    return new Response(`Upstream download failed (${upstream.status})`, { status: upstream.status });
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const extension =
    contentType.includes('mp4') ? '.mp4' :
    contentType.includes('webm') ? '.webm' :
    contentType.includes('png') ? '.png' :
    contentType.includes('jpeg') ? '.jpg' :
    '';

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename.endsWith(extension) || !extension ? filename : `${filename}${extension}`}"`,
      'Cache-Control': 'no-store',
    },
  });
}
