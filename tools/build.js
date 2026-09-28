// Builds the static site into dist/: validates content, renders it into
// index.html (same renderers as the browser, js/render.js), copies assets,
// and checks that every local reference exists.
//
//   node tools/build.js            production build
//   node tools/build.js --env=dev  dev build (noindex, robots disallow all)
const fs = require("node:fs");
const path = require("node:path");
const { validate } = require("./validate");
const R = require("../js/render.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist");
const COPY = ["css", "js", "assets", "content"];

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
function fillInner(html, attr, inner, { required = true } = {}) {
  const re = new RegExp(`(<(\\w+)\\b[^>]*\\b${escapeRe(attr)}[^>]*>)[\\s\\S]*?(</\\2>)`, "g");
  let count = 0;
  const out = html.replace(re, (_, open, _tag, close) => {
    count += 1;
    return open + inner + close;
  });
  if (required && !count) throw new Error(`template has no element with ${attr}`);
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
  for (const key of ["role", "hero-title", "hero-text"]) {
    const value = key === "role" ? site.role : site.hero?.[key.slice(5)];
    html = fillInner(html, `data-bind="${key}"`, e(value || ""), { required: false });
  }

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
      filter: (src) => !/(^|[\\/])(README\.txt|\.DS_Store|Thumbs\.db)$/.test(src),
    });
  }
  fs.writeFileSync(path.join(OUT, "index.html"), html);
  fs.writeFileSync(
    path.join(OUT, "robots.txt"),
    ENV === "dev"
      ? "User-agent: *\nDisallow: /\n"
      : fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8")
  );

  const missing = checkReferences(html);
  if (missing.length) fail(`missing files referenced by index.html: ${missing.join(", ")}`);

  console.log(`Built ${ENV} site into dist/.`);
}

main();
