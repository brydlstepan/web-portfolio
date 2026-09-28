// GET /auth/callback — GitHub returns here with a one-time code. The code is
// exchanged for a user token with the client secret (which never reaches the
// browser), and the token is handed to the admin in the URL fragment, which
// browsers never send to a server. Nothing is stored here.
import { AUTH_CLIENT_ID, AUTH_CLIENT_SECRET } from "../../.generated/auth-config.js";

function cookie(request, name) {
  const match = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

// Back to the admin with the result in the fragment; always clears the state cookie.
function backToAdmin(origin, params) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/admin/#${new URLSearchParams(params)}`,
      "Set-Cookie": "oauth_state=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const origin = url.origin;

  if (!AUTH_CLIENT_ID || !AUTH_CLIENT_SECRET) {
    return backToAdmin(origin, { error: "Sign-in is not configured." });
  }
  if (url.searchParams.get("error")) {
    return backToAdmin(origin, { error: url.searchParams.get("error_description") || url.searchParams.get("error") });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = cookie(request, "oauth_state");
  if (!code || !state || !expected || state !== expected) {
    return backToAdmin(origin, { error: "Sign-in expired or was not started here. Try again." });
  }

  let data;
  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "brydlstepan-portfolio-admin",
      },
      body: JSON.stringify({
        client_id: AUTH_CLIENT_ID,
        client_secret: AUTH_CLIENT_SECRET,
        code,
        redirect_uri: `${origin}/auth/callback`,
      }),
    });
    data = await res.json();
  } catch {
    return backToAdmin(origin, { error: "GitHub could not be reached. Try again." });
  }

  if (!data.access_token) {
    return backToAdmin(origin, { error: data.error_description || "GitHub refused the sign-in." });
  }
  return backToAdmin(origin, { token: data.access_token, expires_in: String(data.expires_in || "") });
}
