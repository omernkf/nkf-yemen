import { timingSafeEqual } from 'node:crypto';

const ORIGIN = 'https://nkf-yemen.netlify.app';
const clearCookie = '__Host-nkf_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

function matches(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export default async function handler(request) {
  const url = new URL(request.url);
  const cookie = request.headers.get('cookie') || '';
  const stored = cookie.split(';').map(v => v.trim()).find(v => v.startsWith('__Host-nkf_oauth_state='))?.split('=')[1];
  const state = url.searchParams.get('state');
  // State must match the first-party, host-only cookie set before GitHub authorization.
  const code = url.searchParams.get('code');
  const headers = {
    'Set-Cookie': clearCookie,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'"
  };
  if (!matches(stored, state) || !code) {
    return new Response('Invalid OAuth state. Return to /admin/ and retry.', { status: 403, headers });
  }
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return new Response('OAuth is not configured.', { status: 503, headers });
  let accessToken;
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: ORIGIN + '/.netlify/functions/oauth-callback'
      })
    });
    const result = await response.json();
    if (!response.ok || !result.access_token) throw new Error('Authorization failed');
    accessToken = result.access_token;
  } catch {
    return new Response('GitHub authentication failed. Return to /admin/ and retry.', { status: 502, headers });
  }
  // Authenticate the GitHub identity before forwarding any access token to Decap.
  // The owner ID is immutable, unlike the account's display name.
  // A valid GitHub OAuth token for another user must never grant CMS access.
  const OWNER_GITHUB_USER_ID = 306806947;
  let authorized = false;
  try {
    const identityResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (identityResponse.ok) {
      const identity = await identityResponse.json();
      authorized = identity.id === OWNER_GITHUB_USER_ID &&
        typeof identity.login === 'string' &&
        identity.login.toLowerCase() === 'omernkf';
    }
  } catch {
    // Fail closed if GitHub's identity API is unreachable.
  }
  if (!authorized) {
    return new Response('Access denied: this GitHub account is not authorized to manage NKF Yemen.', {
      status: 403,
      headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  const message = 'authorization:github:success:' + JSON.stringify({ token: accessToken, provider: 'github' });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"></head><body><p>Completing sign in...</p><script>
    const origin = ${JSON.stringify(ORIGIN)};
    const message = ${JSON.stringify(message).replace(/</g, '\\u003c')};
    if (window.opener) {
      window.addEventListener('message', (event) => {
        if (event.origin === origin && event.source === window.opener && event.data === 'authorizing:github') {
          window.opener.postMessage(message, origin);
          window.close();
        }
      });
      window.opener.postMessage('authorizing:github', origin);
    } else if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('nkf-decap-oauth');
      let attempts = 0;
      let retry;
      const send = () => {
        channel.postMessage({ type: 'oauth-success', message });
        if (++attempts >= 12) clearInterval(retry);
      };
      channel.onmessage = (event) => {
        if (event.data && event.data.type === 'oauth-received') {
          clearInterval(retry);
          document.body.textContent = 'Authorization sent. Return to your original CMS tab.';
        }
      };
      retry = setInterval(send, 800);
      send();
      document.body.textContent = 'Authorization completed. Return to your original CMS tab without closing it.';
    } else document.body.textContent = 'Return to the original CMS tab. This browser does not support cross-tab sign-in.';
  </script></body></html>`;
  return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}
