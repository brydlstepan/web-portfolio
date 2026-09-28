# web-portfolio

Portfolio of brydlstepan — [brydlstepan.cz](https://brydlstepan.cz). See [plan.md](plan.md) for the full plan.

## Structure

```
index.html        page template (also works as-is: site.js renders content in the browser)
content/*.json    site copy, tags, projects
js/render.js      content → HTML renderers, shared by the browser and the build
js/site.js        interactions: filters, modal, animations
tools/validate.js checks content/*.json
tools/build.js    validates, pre-renders content into index.html, writes dist/
```

## Build

Requires Node 18+, no dependencies.

```bash
node tools/validate.js       # check content only
node tools/build.js          # production build → dist/
node tools/build.js --env=dev  # dev build: noindex, robots disallow all
```

`dist/` is build output and is never committed.
