// Builds the static site into dist/: validates content, renders it into
// index.html (same renderers as the browser, js/render.js), copies assets,
// and checks that every local reference exists.
//
//   node tools/build.js            production build
//   node tools/build.js --env=dev  dev build (noindex, robots disallow all)
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { validate } = require("./validate");
const R = require("../js/render.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist");
const COPY = ["css", "js", "assets", "content", "admin"];

const envArg = process.argv.find((a) => a.startsWith("--env="));
const ENV = envArg ? envArg.slice(6) : process.env.SITE_ENV || "prod";
if (!["prod", "dev"].includes(ENV)) fail(`unknown env "${ENV}" (use prod or dev)`);

function fail(message) {
  console.error(`build failed: ${message}`);
  process.exit(1);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Replaces the inner HTML of every element whose opening tag matches `attr`
// (e.g. 'id="filters"'). Targets are leaf elements in the template, so the
// first closing tag of the same name ends them. Throws if nothing matches, so
// a template change cannot silently drop content.
function fillInner(html, attr, inner) {
  const re = new RegExp(`(<(\\w+)\\b[^>]*\\b${escapeRe(attr)}[^>]*>)[\\s\\S]*?(</\\2>)`, "g");
  let count = 0;
  const out = html.replace(re, (_, open, _tag, close) => {
    count += 1;
    return open + inner + close;
  });
  if (!count) throw new Error(`template has no element with ${attr}`);
  return out;
}

// Rewrites the opening tag of every element matching `attr`.
function editOpenTag(html, attr, edit) {
  const re = new RegExp(`<\\w+\\b[^>]*\\b${escapeRe(attr)}[^>]*>`, "g");
  let count = 0;
  const out = html.replace(re, (tag) => {
    count += 1;
    return edit(tag);
  });
  if (!count) throw new Error(`template has no element with ${attr}`);
  return out;
}

function setAttr(tag, name, value) {
  const re = new RegExp(`\\s${name}="[^"]*"`);
  const attr = ` ${name}="${R.escapeHTML(value)}"`;
  return re.test(tag) ? tag.replace(re, attr) : tag.replace(/\s*\/?>$/, (end) => attr + end);
}

function render(template, { site, tags, projects }) {
  const e = R.escapeHTML;
  const tagsById = R.tagMap(tags);
  let html = template;

  html = fillInner(html, 'id="filters"', R.renderFilters(tags));
  html = fillInner(html, 'id="project-grid"', R.renderProjectCards(projects, tagsById));
  html = fillInner(html, 'id="skills-list"', R.renderSkills(site.skills || []));
  html = fillInner(html, 'id="ai-list"', R.renderAiItems(site.ai?.items || []));

  html = fillInner(html, 'data-bind="brand"', e(site.brand || ""));
  html = fillInner(html, 'data-bind="about"', R.renderAbout(site.about, site.social?.photography));
  html = fillInner(html, 'data-bind="ai-title"', R.renderAiTitle(site.ai?.title, site.ai?.titleEmphasis));
  html = fillInner(html, 'data-bind="ai-lede"', e(site.ai?.lede || ""));
  html = fillInner(html, 'data-bind="year"', String(new Date().getFullYear()));

  const email = site.contact?.email || "";
  html = fillInner(html, 'data-bind="email"', e(email));
  html = editOpenTag(html, 'data-bind="email"', (tag) =>
    tag.startsWith("<a") ? setAttr(tag, "href", `mailto:${email}`) : tag
  );

  for (const key of R.SOCIAL_KEYS) {
    const url = R.safeURL(site.social?.[key]);
    html = editOpenTag(html, `data-social="${key}"`, (tag) =>
      url ? setAttr(tag, "href", url) : tag.replace(/>$/, " hidden>")
    );
  }

  html = html.replace(/<body\b([^>]*)>/, "<body$1 data-prerendered>");
  if (ENV === "dev") {
    html = html.replace("</head>", '  <meta name="robots" content="noindex, nofollow">\n</head>');
  }
  return html;
}

// Cloudflare Pages response headers. Dev is never indexed; in production the
// duplicate *.pages.dev address is kept out of search results.
function headers() {
  const common = [
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  X-Frame-Options: DENY",
  ];
  if (ENV === "dev") {
    return ["/*", ...common, "  X-Robots-Tag: noindex, nofollow", ""].join("\n");
  }
  return [
    "/*",
    ...common,
    "",
    "https://:project.pages.dev/*",
    "  X-Robots-Tag: noindex, nofollow",
    "",
    "https://:version.:project.pages.dev/*",
    "  X-Robots-Tag: noindex, nofollow",
    "",
  ].join("\n");
}

// Which requests run Pages Functions (the password gate and /auth/*). Dev
// gates every path; production only the admin and sign-in, so the public site
// is served as plain static files.
function routes() {
  return ENV === "dev"
    ? { version: 1, include: ["/*"], exclude: [] }
    : { version: 1, include: ["/admin", "/admin/*", "/auth/*"], exclude: [] };
}

// Config for the Pages Functions, from GitHub Secrets in CI, written to a
// gitignored folder that is bundled into the functions and never into dist/.
//   gate-config.js  SHA-256 hashes of PREVIEW_PASSWORD and ADMIN_PASSWORD
//   auth-config.js  GitHub App AUTH_CLIENT_ID and AUTH_CLIENT_SECRET (the
//                   secret must be usable server-side, so it cannot be hashed)
// Anything unset becomes null, which locks that area or disables sign-in.
function writeFunctionConfig() {
  const env = (name) => process.env[name] || null;
  const hash = (name) =>
    env(name) ? crypto.createHash("sha256").update(env(name), "utf8").digest("hex") : null;
  const header = "// Generated by tools/build.js — do not edit or commit.\n";
  const dir = path.join(ROOT, ".generated");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "gate-config.js"),
    header +
      `export const PREVIEW_PASSWORD_SHA256 = ${JSON.stringify(hash("PREVIEW_PASSWORD"))};\n` +
      `export const ADMIN_PASSWORD_SHA256 = ${JSON.stringify(hash("ADMIN_PASSWORD"))};\n`
  );
  fs.writeFileSync(
    path.join(dir, "auth-config.js"),
    header +
      `export const AUTH_CLIENT_ID = ${JSON.stringify(env("AUTH_CLIENT_ID"))};\n` +
      `export const AUTH_CLIENT_SECRET = ${JSON.stringify(env("AUTH_CLIENT_SECRET"))};\n`
  );
  for (const name of ["PREVIEW_PASSWORD", "ADMIN_PASSWORD"]) {
    if (!env(name)) console.warn(`warning: ${name} not set — that area will be locked`);
  }
  if (!env("AUTH_CLIENT_ID") || !env("AUTH_CLIENT_SECRET")) {
    console.warn("warning: AUTH_CLIENT_ID / AUTH_CLIENT_SECRET not set — admin sign-in disabled");
  }
}

// Every local src/href in the page must point at a file in dist/.
function checkReferences(html) {
  const missing = [];
  for (const [, ref] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (/^(?:[a-z]+:|#|\/\/)/i.test(ref)) continue;
    const file = decodeURIComponent(ref.split(/[?#]/)[0]);
    if (!file || file === "index.html") continue;
    if (!fs.existsSync(path.join(OUT, file))) missing.push(ref);
  }
  return [...new Set(missing)];
}

function main() {
  const { errors, warnings, content } = validate();
  warnings.forEach((w) => console.warn(`warning: ${w}`));
  if (errors.length) {
    errors.forEach((err) => console.error(`error: ${err}`));
    fail(`${errors.length} content error(s)`);
  }

  const template = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  let html;
  try {
    html = render(template, content);
  } catch (err) {
    fail(err.message);
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const dir of COPY) {
    fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), {
      recursive: true,
      filter: (src) => !/(^|[\\/])(\.DS_Store|Thumbs\.db)$/.test(src),
    });
  }
  fs.writeFileSync(path.join(OUT, "index.html"), html);
  fs.writeFileSync(
    path.join(OUT, "robots.txt"),
    ENV === "dev"
      ? "User-agent: *\nDisallow: /\n"
      : fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8")
  );

  fs.writeFileSync(path.join(OUT, "_headers"), headers());
  fs.writeFileSync(path.join(OUT, "_routes.json"), JSON.stringify(routes(), null, 2) + "\n");
  writeFunctionConfig();

  const missing = checkReferences(html);
  if (missing.length) fail(`missing files referenced by index.html: ${missing.join(", ")}`);

  console.log(`Built ${ENV} site into dist/.`);
}

main();
