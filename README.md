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

## Deployment

| Branch | Environment | Access |
|--------|-------------|--------|
| `Dev` | [dev.brydlstepan.cz](https://dev.brydlstepan.cz) | Cloudflare Access, `noindex` |
| `main` | [brydlstepan.cz](https://brydlstepan.cz) | public |

- `.github/workflows/deploy.yml` builds and uploads to Cloudflare Pages (project `web-portfolio`, Direct Upload).
- Deploys run **only when a pushed commit contains `[build]`**, or via Actions → Deploy → Run workflow. To deploy without code changes: `git commit --allow-empty -m "[build] Deploy to dev"`.
- Releases: pull request `Dev` → `main` with **Create a merge commit** and a `[build] …` title.
- GitHub environment `web-portfolio` holds `CLOUDFLARE_API_TOKEN` (secret, *Cloudflare Pages: Edit* only) and `CLOUDFLARE_ACCOUNT_ID`.
