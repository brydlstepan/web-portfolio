// Password gate (HTTP Basic Auth) for Cloudflare Pages.
//
//   dev.brydlstepan.cz, *.pages.dev  → PREVIEW_PASSWORD (the admin included)
//   brydlstepan.cz, www              → public; /admin and /auth do not exist
//
// The admin and GitHub sign-in are dev-only: production builds leave out
// admin/, and /auth/* answers 404 on production hosts.
//
// The password lives in GitHub Secrets. tools/build.js writes only its
// SHA-256 hash into .generated/gate-config.js, which is bundled into this
// function at deploy time and never committed or served. A missing password
// locks dev instead of opening it. Which paths run this at all is set by
// _routes.json, also written by tools/build.js.

import { PREVIEW_PASSWORD_SHA256 } from "../.generated/gate-config.js";

const PRODUCTION_HOSTS = new Set(["brydlstepan.cz", "www.brydlstepan.cz"]);

// The admin runs only its own scripts and talks only to GitHub's API. Images
// come from the site, from GitHub (files on the Dev branch that are not
// deployed yet) and from local blobs (uploads before they are saved).
const ADMIN_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data: https://raw.githubusercontent.com",
  "connect-src 'self' https://api.github.com",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join("; ");

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

const isUnder = (pathname, dir) => pathname === dir || pathname.startsWith(`${dir}/`);

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const isAdmin = isUnder(url.pathname, "/admin");

  if (PRODUCTION_HOSTS.has(url.hostname)) {
    // The admin and its sign-in are dev-only.
    if (isAdmin || isUnder(url.pathname, "/auth")) {
      return new Response("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return next();
  }

  if (!PREVIEW_PASSWORD_SHA256) {
    return new Response("Locked: password not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  const given = passwordFrom(request);
  if (given === null || !(await matches(given, PREVIEW_PASSWORD_SHA256))) return challenge("brydlstepan dev");

  const response = await next();
  const gated = new Response(response.body, response);
  gated.headers.set("Cache-Control", "private, no-store");
  gated.headers.set("X-Robots-Tag", "noindex, nofollow");
  gated.headers.set("X-Content-Type-Options", "nosniff");
  gated.headers.set("X-Frame-Options", "DENY");
  if (isAdmin) {
    gated.headers.set("Content-Security-Policy", ADMIN_CSP);
    gated.headers.set("Referrer-Policy", "no-referrer");
  } else {
    gated.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  return gated;
}
