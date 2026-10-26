import { randomBytes } from 'node:crypto';

const CALLBACK = 'https://nkf-yemen.netlify.app/.netlify/functions/oauth-callback';

export default async function handler() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId || !process.env.GITHUB_CLIENT_SECRET) {
    return new Response('GitHub OAuth environment variables are not configured.', { status: 503 });
  }
  const state = randomBytes(24).toString('hex');
  const authorizationUrl = new URL('https://github.com/login/oauth/authorize');
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', CALLBACK);
  authorizationUrl.searchParams.set('scope', 'public_repo');
  authorizationUrl.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl.toString(),
      'Set-Cookie': 'nkf_oauth_state=' + state + '; Path=/.netlify/functions; HttpOnly; Secure; SameSite=Lax; Max-Age=600',
      'Cache-Control': 'no-store'
    }
  });
}
