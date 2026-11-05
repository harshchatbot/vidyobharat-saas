/** Local, safe Firebase/Next.js diagnosis: never print keys or tokens. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const paths = ['.env.local', '.env.development.local', '.env.development', '.env'];
const env = {};
for (const file of paths.reverse()) {
  const filename = path.join(root, file);
  if (!fs.existsSync(filename)) continue;
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
}
const get = key => process.env[key] ?? env[key] ?? '';
console.log('RangManch local authentication configuration (no secrets printed)');
for (const key of [
  'NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'NEXT_PUBLIC_API_URL',
]) console.log(key + ': ' + (get(key) ? 'configured' : 'MISSING'));

const project = get('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
const domain = get('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
const emulator = get('NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL');
const enabled = get('NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR') === 'true';
if (project && domain && !domain.startsWith(project + '.firebaseapp.com') &&
    !domain.startsWith(project + '.web.app')) {
  console.log('CHECK: authDomain and projectId look different. Ensure all fields belong to one Firebase web app.');
}
console.log('Auth emulator enabled: ' + enabled);
console.log('Auth emulator URL set: ' + Boolean(emulator));
if (enabled && !emulator) console.log('ERROR: Auth emulator is enabled but its URL is missing.');
if (!enabled && emulator) console.log('INFO: Emulator URL is set but ignored unless NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR=true.');
if (get('NEXT_PUBLIC_API_URL').includes('onrender.com')) {
  console.log('INFO: Next.js proxies admin sessions to the configured Render API; check remote access.');
}
console.log('NEXT: verify Firebase Console > Authentication > Settings > Authorized domains includes localhost.');
console.log('NEXT: verify API key restrictions permit Firebase Authentication Identity Toolkit.');
console.log('NEXT: restart the Next.js dev server after changing NEXT_PUBLIC_* environment variables.');
