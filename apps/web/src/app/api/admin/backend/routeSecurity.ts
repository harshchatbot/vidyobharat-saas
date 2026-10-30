export const SAFE_PATH = /^(me|dashboard|guests(?:\/[A-Za-z0-9_-]{1,128}\/exports)?|config(?:\/audit)?|templates(?:\/[A-Za-z0-9_-]{1,128}(?:\/status)?)?|templates\/upload-preview|audio-library(?:\/register|\/[A-Za-z0-9_-]{1,128}\/(?:publish|retire))?)$/;
export const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
