// Password gate (HTTP Basic Auth) for Cloudflare Pages.
//
//   dev.brydlstepan.cz, *.pages.dev  → PREVIEW_PASSWORD
//   /admin/* on any host             → ADMIN_PASSWORD
//   brydlstepan.cz, www              → public
//
// The passwords live in GitHub Secrets. tools/build.js writes only their
// SHA-256 hashes into .generated/gate-config.js, which is bundled into this
// function at deploy time and never committed or served. A missing password
// locks the gated area instead of opening it. Which paths run this at all is
// set by _routes.json, also written by tools/build.js.

import { PREVIEW_PASSWORD_SHA256, ADMIN_PASSWORD_SHA256 } from "../.generated/gate-config.js";

const PRODUCTION_HOSTS = new Set(["brydlstepan.cz", "www.brydlstepan.cz"]);

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compares fixed-length hashes so the time taken does not reveal the password.
async function matches(given, expectedHash) {
  const actual = await sha256Hex(given);
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
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

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const isAdmin = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  const isPreview = !PRODUCTION_HOSTS.has(url.hostname);

  const gate = isAdmin
    ? { hash: ADMIN_PASSWORD_SHA256, realm: "brydlstepan admin" }
    : isPreview
      ? { hash: PREVIEW_PASSWORD_SHA256, realm: "brydlstepan dev" }
      : null;
  if (!gate) return next();

  if (!gate.hash) {
    return new Response("Locked: password not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  const given = passwordFrom(request);
  if (given === null || !(await matches(given, gate.hash))) return challenge(gate.realm);

  const response = await next();
  const gated = new Response(response.body, response);
  gated.headers.set("Cache-Control", "private, no-store");
  return gated;
}
