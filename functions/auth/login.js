// GET /auth/login — starts GitHub sign-in for the admin (GitHub App, user
// token). A random state goes into a short-lived cookie and is checked on the
// way back in /auth/callback.
import { AUTH_CLIENT_ID } from "../../.generated/auth-config.js";

export async function onRequestGet({ request }) {
  if (!AUTH_CLIENT_ID) {
    return new Response("Sign-in is not configured.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const origin = new URL(request.url).origin;
  const state = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", AUTH_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${origin}/auth/callback`);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "false");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": `oauth_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "Cache-Control": "no-store",
    },
  });
}
