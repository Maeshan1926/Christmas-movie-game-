import { apiFromEnv, configError } from '../lib/runtime.js';

let handler = null;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  const problem = configError();
  if (problem) {
    // Branding still works mid-setup so the sign-in screen shows the right family.
    if (new URL(req.url).pathname === '/api/family') {
      const name = String(process.env.FAMILY_NAME || '').trim() || 'Trunk';
      const hero = String(process.env.HERO_IMAGE || '').trim() || (name === 'Trunk' ? 'builtin' : null);
      return json(200, { name, hero });
    }
    return json(500, { error: `Server setup incomplete: ${problem}` });
  }
  handler = handler || apiFromEnv();
  return handler(req);
};

export const config = { path: '/api/*' };
