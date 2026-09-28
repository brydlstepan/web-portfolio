// Checks content/*.json before a build. Run directly: `node tools/validate.js`
// Errors fail the build; warnings are printed only.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VIDEO_PROVIDERS = new Set(["youtube", "vimeo"]);

function readJSON(rel, errors) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  } catch (err) {
    errors.push(`${rel}: ${err.message}`);
    return null;
  }
}

function validate() {
  const errors = [];
  const warnings = [];

  const isStr = (v) => typeof v === "string" && v.trim() !== "";
  const isHttp = (v) => {
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  };
  // Local asset: relative, inside assets/, no traversal, and present on disk.
  const checkAsset = (where, value) => {
    if (!isStr(value)) return errors.push(`${where}: missing path`);
    const normalized = path.posix.normalize(value);
    if (!normalized.startsWith("assets/") || normalized.includes("..")) {
      return errors.push(`${where}: "${value}" must be a path inside assets/`);
    }
    if (!fs.existsSync(path.join(ROOT, normalized))) {
      errors.push(`${where}: file not found: ${value}`);
    }
  };

  // --- site.json
  const site = readJSON("content/site.json", errors);
  if (site) {
    const s = "site.json";
    if (!isStr(site.brand)) errors.push(`${s}: brand is required`);
    if (!isStr(site.contact?.email) || !site.contact.email.includes("@")) {
      errors.push(`${s}: contact.email must be an e-mail address`);
    }
    for (const [key, url] of Object.entries(site.social || {})) {
      if (url && !isHttp(url)) errors.push(`${s}: social.${key} must be an http(s) URL`);
    }
    for (const [i, skill] of (site.skills || []).entries()) {
      if (!isStr(skill.name)) errors.push(`${s}: skills[${i}].name is required`);
      if (!Number.isFinite(skill.level) || skill.level < 0 || skill.level > 10) {
        errors.push(`${s}: skills[${i}].level must be 0–10`);
      }
    }
    for (const [i, item] of (site.ai?.items || []).entries()) {
      if (!isStr(item.title) || !isStr(item.text)) {
        errors.push(`${s}: ai.items[${i}] needs title and text`);
      }
    }
  }

  // --- tags.json
  const tags = readJSON("content/tags.json", errors);
  const tagIds = new Set();
  if (tags) {
    if (!Array.isArray(tags)) errors.push("tags.json: must be an array");
    else
      tags.forEach((t, i) => {
        const w = `tags.json[${i}]`;
        if (!SLUG.test(t.id || "")) errors.push(`${w}: id must be a lowercase slug`);
        else if (tagIds.has(t.id)) errors.push(`${w}: duplicate id "${t.id}"`);
        else tagIds.add(t.id);
        if (!isStr(t.label)) errors.push(`${w}: label is required`);
        if (!Number.isFinite(t.order)) errors.push(`${w}: order must be a number`);
        if (typeof t.visible !== "boolean") errors.push(`${w}: visible must be true/false`);
      });
  }

  // --- projects.json
  const projects = readJSON("content/projects.json", errors);
  if (projects) {
    if (!Array.isArray(projects)) errors.push("projects.json: must be an array");
    else {
      const ids = new Set();
      projects.forEach((p, i) => {
        const w = `projects.json[${p.id || i}]`;
        if (!SLUG.test(p.id || "")) errors.push(`${w}: id must be a lowercase slug`);
        else if (ids.has(p.id)) errors.push(`${w}: duplicate id`);
        else ids.add(p.id);
        if (!isStr(p.title)) errors.push(`${w}: title is required`);
        if (!isStr(p.summary)) errors.push(`${w}: summary is required`);
        if (typeof p.published !== "boolean") errors.push(`${w}: published must be true/false`);
        if (!Number.isFinite(p.order)) errors.push(`${w}: order must be a number`);
        if (p.year != null && !Number.isInteger(p.year)) errors.push(`${w}: year must be a whole number`);
        for (const tag of p.tags || []) {
          if (!tagIds.has(tag)) errors.push(`${w}: unknown tag "${tag}"`);
        }
        checkAsset(`${w}.cover`, p.cover);
        (p.gallery || []).forEach((item, j) => {
          const g = `${w}.gallery[${j}]`;
          if (item.type === "image") checkAsset(g, item.src);
          else if (item.type === "video") {
            if (!VIDEO_PROVIDERS.has(item.provider)) errors.push(`${g}: provider must be youtube or vimeo`);
            if (!/^[\w-]+$/.test(item.id || "")) errors.push(`${g}: invalid video id`);
            if (item.poster) checkAsset(`${g}.poster`, item.poster);
          } else errors.push(`${g}: type must be image or video`);
        });
        (p.links || []).forEach((l, j) => {
          if (!isStr(l.label) || !isHttp(l.url)) errors.push(`${w}.links[${j}]: needs label and http(s) url`);
        });
      });
      if (!projects.some((p) => p.published)) warnings.push("projects.json: no published projects");
    }
  }

  return { errors, warnings, content: { site, tags, projects } };
}

module.exports = { validate };

if (require.main === module) {
  const { errors, warnings } = validate();
  warnings.forEach((w) => console.warn(`warning: ${w}`));
  errors.forEach((e) => console.error(`error: ${e}`));
  if (errors.length) process.exit(1);
  console.log("Content OK.");
}
