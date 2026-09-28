// Checks content/*.json before a build. Run directly: `node tools/validate.js`
// Errors fail the build; warnings are printed only. The rules themselves live
// in js/validate-content.js, shared with the admin.
const fs = require("node:fs");
const path = require("node:path");
const { validateContent } = require("../js/validate-content.js");

const ROOT = path.resolve(__dirname, "..");

function readJSON(rel, errors) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  } catch (err) {
    errors.push(`${rel}: ${err.message}`);
    return null;
  }
}

function validate() {
  const readErrors = [];
  const content = {
    site: readJSON("content/site.json", readErrors),
    tags: readJSON("content/tags.json", readErrors),
    projects: readJSON("content/projects.json", readErrors),
  };
  const { errors, warnings } = validateContent(content, {
    assetExists: (rel) => fs.existsSync(path.join(ROOT, rel)),
  });
  return { errors: [...readErrors, ...errors], warnings, content };
}

module.exports = { validate };

if (require.main === module) {
  const { errors, warnings } = validate();
  warnings.forEach((w) => console.warn(`warning: ${w}`));
  errors.forEach((e) => console.error(`error: ${e}`));
  if (errors.length) process.exit(1);
  console.log("Content OK.");
}
