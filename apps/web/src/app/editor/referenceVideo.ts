/** Client-side reference upload validation. A reference guides editing style only;
 * it must never be inserted into the exported footage automatically.
 */
export const MAX_REFERENCE_VIDEO_BYTES = 100 * 1024 * 1024;
export const REFERENCE_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export type ReferenceVideoSelection = {
  file: File;
  previewUrl: string;
};

export function validateReferenceVideo(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (!REFERENCE_VIDEO_TYPES.includes(file.type as typeof REFERENCE_VIDEO_TYPES[number])) {
    return 'Upload an MP4, WebM or MOV reference video.';
  }
  if (file.size <= 0 || file.size > MAX_REFERENCE_VIDEO_BYTES) {
    return 'Reference video must be between 1 byte and 100 MB.';
  }
  return null;
}
