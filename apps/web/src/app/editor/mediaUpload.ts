export type VisualUploadState = 'queued' | 'uploading' | 'processing' | 'ready' | 'failed';

export type PendingVisualUpload = {
  id: string;
  file: File;
  uploadFile: File;
  previewUrl: string;
  state: VisualUploadState;
  progress: number | null;
  error?: string;
};

const IMAGE_LONG_SIDE = 1920;

function outputName(name: string): string {
  return name.replace(/\.[^.]+$/, '') + '.webp';
}

/** Downscale orientation-aware images without changing video or audio uploads. */
export async function prepareVisualUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap === 'undefined') return file;
  try {
    const source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, IMAGE_LONG_SIDE / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext('2d');
    if (!context) { source.close(); return file; }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    source.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    return blob ? new File([blob], outputName(file.name), { type: 'image/webp', lastModified: file.lastModified }) : file;
  } catch {
    return file;
  }
}

export function uploadVisualWithProgress(input: {
  file: File;
  url: string;
  onProgress: (progress: number) => void;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', input.url);
    request.withCredentials = true;
    request.setRequestHeader('X-RangManch-Editor-CSRF', '1');
    request.setRequestHeader('Idempotency-Key', crypto.randomUUID());
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) input.onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error('Upload failed. Check your connection and retry.'));
    request.onload = () => {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(request.responseText) as Record<string, unknown>; } catch { /* response may be empty */ }
      if (request.status >= 200 && request.status < 300) { resolve(body); return; }
      reject(new Error(body.error === 'guest_quota_exceeded' ? 'You have reached the guest upload limit.' : typeof body.message === 'string' ? body.message : `Upload failed (${request.status}).`));
    };
    const form = new FormData();
    form.append('file', input.file);
    request.send(form);
  });
}
