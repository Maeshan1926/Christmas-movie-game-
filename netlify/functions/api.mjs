import { apiFromEnv, configError } from '../lib/runtime.js';

let handler = null;

export default async (req) => {
  const problem = configError();
  if (problem) {
    return new Response(JSON.stringify({ error: `Server setup incomplete: ${problem}` }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
  handler = handler || apiFromEnv();
  return handler(req);
};

export const config = { path: '/api/*' };
