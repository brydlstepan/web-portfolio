# web-portfolio

Portfolio of brydlstepan — [brydlstepan.cz](https://brydlstepan.cz). See [plan.md](plan.md) for the full plan.

## Structure

```
index.html        page template (also works as-is: site.js renders content in the browser)
content/*.json    site copy, tags, projects
js/render.js      content → HTML renderers, shared by the browser and the build
js/validate-content.js  content rules, shared by the build and the admin
admin/            the content admin (/admin/)
functions/        Cloudflare Pages Functions: password gate, GitHub sign-in (/auth/*)
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
| `Dev` | [dev.brydlstepan.cz](https://dev.brydlstepan.cz) | password (`PREVIEW_PASSWORD`), `noindex` |
| `main` | [brydlstepan.cz](https://brydlstepan.cz) | public |

- `.github/workflows/deploy.yml` builds and uploads to Cloudflare Pages (project `web-portfolio`, Direct Upload, address `web-portfolio-7ca.pages.dev`; the `Dev` branch is `dev.web-portfolio-7ca.pages.dev`).
- Deploys run **only when a pushed commit contains `[build]`**, or via Actions → Deploy → Run workflow. To deploy without code changes: `git commit --allow-empty -m "[build] Deploy to dev"`.
- Releases: pull request `Dev` → `main` with **Create a merge commit** and a `[build] …` title.
- `functions/_middleware.js` is the password gate: `PREVIEW_PASSWORD` on dev and `*.pages.dev`, `ADMIN_PASSWORD` on `/admin/*`. Both are GitHub Secrets in the `web-portfolio` environment; the build bundles only their SHA-256 hashes into the function (`.generated/`, gitignored). A missing password locks the area. To change one: update the secret and redeploy.
- GitHub environment `web-portfolio` holds `CLOUDFLARE_API_TOKEN` (*Cloudflare Pages: Edit* only), `CLOUDFLARE_ACCOUNT_ID`, `PREVIEW_PASSWORD`, `ADMIN_PASSWORD`, `AUTH_CLIENT_ID` and `AUTH_CLIENT_SECRET`.

## Admin

`/admin/` on brydlstepan.cz or dev.brydlstepan.cz: `ADMIN_PASSWORD` first, then *Sign in with GitHub* (only the `brydlstepan` account is accepted).

- **Save** commits the changes to `Dev` (no deploy).
- **Preview on dev** saves with `[build]`, so dev.brydlstepan.cz updates in about a minute.
- **Publish to live** merges `Dev` into `main` through a pull request — everything on `Dev`, code included.

Sign-in uses a GitHub App installed only on this repository (Contents and Pull requests: read and write), with callback URLs `https://brydlstepan.cz/auth/callback` and `https://dev.brydlstepan.cz/auth/callback`. Its client ID and secret are the `AUTH_CLIENT_*` secrets above.
