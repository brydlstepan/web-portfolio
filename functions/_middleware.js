// Password gate (HTTP Basic Auth) for Cloudflare Pages.
//
//   dev.brydlstepan.cz, *.pages.dev  → PREVIEW_PASSWORD
//   /admin/* on any host             → ADMIN_PASSWORD
//   brydlstepan.cz, www              → public
//
// Passwords are encrypted variables in the Pages project (Settings → Variables
// and Secrets). A missing password locks the gated area instead of opening it.
// Which paths run this at all is set by _routes.json, written by tools/build.js.

const PRODUCTION_HOSTS = new Set(["brydlstepan.cz", "www.brydlstepan.cz"]);

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

// Compares fixed-length hashes so the time taken does not reveal the password.
async function matches(given, expected) {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function passwordFrom(request) {
  const header = request.headers.get("Authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return null;
  try {
    const decoded = atob(encoded);
    return decoded.slice(decoded.indexOf(":") + 1);
  } catch {
    return null;
  }
}

function challenge(realm) {
  return new Response("Password required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const isAdmin = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  const isPreview = !PRODUCTION_HOSTS.has(url.hostname);

  const gate = isAdmin
    ? { password: env.ADMIN_PASSWORD, realm: "brydlstepan admin" }
    : isPreview
      ? { password: env.PREVIEW_PASSWORD, realm: "brydlstepan dev" }
      : null;
  if (!gate) return next();

  if (!gate.password) {
    return new Response("Locked: password not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  const given = passwordFrom(request);
  if (given === null || !(await matches(given, gate.password))) return challenge(gate.realm);

  const response = await next();
  const gated = new Response(response.body, response);
  gated.headers.set("Cache-Control", "private, no-store");
  return gated;
}
