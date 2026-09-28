# Portfolio — Plan

Personal portfolio for **brydlstepan.cz**. Static public site on Cloudflare Pages, managed through an online admin with GitHub sign-in, published through git (`Dev` → dev.brydlstepan.cz, `main` → brydlstepan.cz).

---

## 1. Goals

- Present professional work on a single, well-designed page
- Keep the site fast, static, and free to host
- Manage content (projects, tags) without editing HTML by hand
- Edit content from any browser, signed in with GitHub, without a server of our own
- Preview every change on a dev environment before it goes live
- Preserve the existing visual language: black base, frosted glass, blue↔turquoise light

---

## 2. Site map

| Route | Type | Purpose |
| --- | --- | --- |
| `/` | One-pager | Hero, Work, About, AI, Contact |
| Instagram | External | Photography |
| GitHub | External | Code |
| LinkedIn | External | Professional profile |

Non-public routes:

| Route | Purpose | Protection |
| --- | --- | --- |
| `/admin/` | Content admin | Cloudflare Access + GitHub sign-in |
| `/auth/*` | GitHub sign-in callback (Pages Function) | — |
| dev.brydlstepan.cz | Preview of the `Dev` branch | Cloudflare Access, `noindex` |

---

## 3. One-pager sections

1. **Hero** — brand, role line, short intro, CTA into Work
2. **Work** — filterable project grid (the core of the page)
3. **About** — short professional bio
4. **Contact** — email, optional LinkedIn
5. **Footer** — copyright, email

Deliberately excluded: clients section, testimonials, blog, contact form.

---

## 4. Navigation

```
brydlstepan     Work · About · AI · Contact     [GitHub] [LinkedIn] [Photography]
```

- **Work / About / AI / Contact** — scroll anchors on the one-pager
- **GitHub / LinkedIn / Photography** — icon buttons, new tab

Mobile: text links collapse into a drawer; icon buttons stay visible or move into the drawer.

---

## 5. Work section

- Filter bar: `All` + every visible tag, grouped by `group` with a divider between runs
- One tag active at a time in v1; selecting a tag shows every project carrying it
- Filtering happens client-side on already-rendered cards (instant, no reload)
- Card: cover image, title, its tags, one-line summary, optional year
- Clicking a card opens the project detail modal
- Empty state per filter: short line, no layout jump

Single-select keeps the bar predictable and every filter guaranteed to return results. Multi-select can be added later if the project count grows enough to need it — the content model already supports it.

### Project detail modal

Layout, top to bottom:

1. **Selected media** — the currently active image or video, large
2. **Thumbnail row** — clickable images and videos; video appears first when present
3. **Heading** — project title
4. **Core info** — tags, year, role, tools, external links
5. **Description** — longer text about the project

Behavior:

- Opens on card click, closes on backdrop click, close button, and `Esc`
- Arrow keys move through the gallery
- Focus is trapped while open and returned to the originating card on close
- Background scroll locked while open
- URL hash reflects the open project (e.g. `#project-slug`) so a project can be linked directly

**Video embeds use a facade.** The poster image is shown first, and the YouTube or Vimeo iframe is only injected once the user clicks play. This keeps the page fast (the embedded players are heavy) and avoids loading third-party scripts and cookies for visitors who never watch. Use `youtube-nocookie.com` and Vimeo's `dnt=1` parameter for the same reason.

---

## 6. Content model

Content lives in the repo as JSON. The admin reads and writes these files through the GitHub API.

### `content/tags.json`

Tags are free-form and created in the admin. A project can carry several, and they do not all have to describe the same thing — discipline and scale can coexist.

```json
[
  { "id": "3d", "label": "3D", "group": "discipline", "order": 1, "visible": true },
  { "id": "unreal", "label": "Unreal Engine", "group": "discipline", "order": 2, "visible": true },
  { "id": "graphics", "label": "Graphics", "group": "discipline", "order": 3, "visible": true },
  { "id": "ar-vr", "label": "AR/VR", "group": "discipline", "order": 4, "visible": true },
  { "id": "visualization", "label": "Visualization", "group": "discipline", "order": 5, "visible": true },
  { "id": "web", "label": "Web", "group": "discipline", "order": 6, "visible": true },
  { "id": "large", "label": "Large project", "group": "scale", "order": 7, "visible": true },
  { "id": "medium", "label": "Medium project", "group": "scale", "order": 8, "visible": true }
]
```

`group` is optional and only affects presentation: the filter bar keeps tags of the same group together, with a small divider between groups, so disciplines and scale read as distinct runs rather than one long undifferentiated list. Filtering treats every tag identically.

`visible` hides a tag from the filter bar without deleting it or touching the projects that use it.

### `content/projects.json`

```json
[
  {
    "id": "project-slug",
    "title": "Project title",
    "tags": ["unreal", "3d", "large"],
    "summary": "One-line description.",
    "description": "Longer text shown in the detail modal.",
    "year": 2026,
    "role": "Design, development",
    "tools": ["Unity", "Blender"],
    "cover": "assets/projects/project-slug/cover.webp",
    "gallery": [
      {
        "type": "video",
        "provider": "youtube",
        "id": "VIDEO_ID",
        "poster": "assets/projects/project-slug/poster.webp",
        "alt": "Walkthrough"
      },
      {
        "type": "image",
        "src": "assets/projects/project-slug/01.webp",
        "alt": "Main view"
      }
    ],
    "links": [{ "label": "Live", "url": "https://..." }],
    "featured": false,
    "order": 1,
    "published": true
  }
]
```

Gallery order is authored in the admin. When a project has a video, it is placed first so the modal opens on it.

Videos are hosted on YouTube or Vimeo (`provider` is `youtube` or `vimeo`). The repo stores only the video ID and a locally hosted poster frame — no video files, so the repo stays small.

### `content/site.json`

```json
{
  "brand": "brydlstepan",
  "role": "Unreal Engine Dev / 3D Generalist",
  "hero": { "title": "…", "text": "…" },
  "about": "…",
  "contact": { "email": "brydlstepan@gmail.com" },
  "social": {
    "github": "https://github.com/brydlstepan",
    "linkedin": "https://…",
    "instagram": "https://…"
  }
}
```

Tags are referenced by `id`, so renaming a label never breaks the projects using it.

---

## 7. Hosting and environments

The site moves from GitHub Pages to **Cloudflare Pages**. The domain is already on Cloudflare, and Pages adds what GitHub Pages cannot: a preview environment per branch, custom response headers, server functions for the sign-in callback, and built-in Cloudflare Access.

```
                     Cloudflare (DNS, proxy, Access)
                                  │
  brydlstepan.cz            ← main   (production)
  brydlstepan.cz/admin/     ← admin  (Access + GitHub sign-in)
  brydlstepan.cz/auth/*     ← Pages Function: GitHub sign-in callback
  dev.brydlstepan.cz        ← Dev    (preview, Access, noindex)
                                  ▲
               GitHub Actions: build → wrangler pages deploy
```

| Branch | Environment | Access |
| --- | --- | --- |
| `main` | brydlstepan.cz | Public |
| `Dev` | dev.brydlstepan.cz | Cloudflare Access (one-time code to my e-mail), `noindex` |
| `feat/*` | Not deployed | — |

**Direct Upload, not the Cloudflare Git integration.** The Git integration builds every push to every branch and can only be told to skip (`[skip ci]`). Deploying from GitHub Actions with `wrangler pages deploy` keeps the `[build]` gating used in lossless-web, and Cloudflare never gets access to the repo. A Direct Upload project cannot be switched to the Git integration later — acceptable.

**`*.pages.dev` addresses.** Every deploy also appears at `*.web-portfolio.pages.dev`, including a copy of production.

- Enable Access for preview deployments (one setting)
- Redirect `web-portfolio.pages.dev` to brydlstepan.cz, or send `X-Robots-Tag: noindex` on it

**Headers (`_headers`)**

- `/admin/*` — strict CSP: `default-src 'self'; connect-src 'self' https://api.github.com; img-src 'self' data: blob:; frame-ancestors 'none'`, plus `Referrer-Policy: no-referrer`
- dev deploys — `X-Robots-Tag: noindex` (the dev build also adds `<meta name="robots" content="noindex">`)

**Coexistence with self-hosted services.** The zone also carries private hostnames (e.g. `immich.brydlstepan.cz`) that resolve to LAN/Tailscale addresses, DNS-only.

- During the switch, only replace the apex (GitHub Pages A/AAAA records) and add `dev`; leave every other record untouched. Explicit records override a wildcard, so a `*.brydlstepan.cz` record keeps working
- LAN and tailnet resolve `brydlstepan.cz` through AdGuard Home on `dxp4800plus` (Tailscale split DNS → `100.100.200.1`), which rewrites `*.brydlstepan.cz` to Nginx Proxy Manager. The wildcard does not match the apex, but it does catch `www` and `dev`, which would land on NPM instead of Cloudflare. **Fix:** in AdGuard → Filters → DNS rewrites add exceptions `dev.brydlstepan.cz` → `A` and → `AAAA` (same for `www`); the literal answer `A`/`AAAA` means "use the upstream answer", and a specific rewrite wins over the wildcard. Test with `nslookup dev.brydlstepan.cz 100.100.200.1`
- `auth.brydlstepan.cz` is already taken (tinyauth on NPM), so the sign-in callback stays on the apex path `/auth/*`, not a subdomain
- The CI token gets **Pages: Edit** only — never reuse the DNS-edit token used for certificates on the home server
- Access applications cover only `dev.brydlstepan.cz`, `brydlstepan.cz/admin/*` and preview deployments — no `*.brydlstepan.cz` wildcard
- Zone settings (SSL mode, Always Use HTTPS) only affect proxied records; do not enable HSTS with `includeSubDomains` / preload unless every subdomain serves valid HTTPS

**Pages or Workers.** Cloudflare has been steering new projects toward Workers with static assets. Check which is recommended when setting up; the plan works on either, only the deploy command and function location change.

---

## 8. Deployment

`.github/workflows/deploy.yml`, the same model as lossless-web:

| Trigger | Result |
| --- | --- |
| Push to `Dev` or `main` with `[build]` in a commit message | Build and deploy that branch |
| Admin *Preview* / *Publish* | Their commits carry `[build]` |
| Actions → Deploy → Run workflow | Build and deploy the chosen branch |
| Any other push | Nothing deployed |

Steps:

1. Checkout
2. Validate `content/*.json` against the schema (types, required fields, tag ids exist, referenced images exist)
3. Render `index.html` from the templates and published content
4. On `Dev`: inject `noindex`
5. Check internal links and image paths
6. `wrangler pages deploy` — `--branch=main` for production, `--branch=Dev` for the preview

The repo holds only sources (templates, CSS, JS, `content/*.json`, images). The built site exists only in the Actions run and on Cloudflare; it is never committed.

Secrets in GitHub (environment `web_portfolio`): `CLOUDFLARE_API_TOKEN` (Pages: Edit, this account only), `CLOUDFLARE_ACCOUNT_ID`.

**Releasing:** pull request `Dev` → `main`, **Create a merge commit** (not squash or rebase, so both branches keep a shared history), title `[build] …`.

---

## 9. Admin

### Content flow — `Dev` is the draft space

```
edit in admin → Save            → commit to Dev (no deploy)
              → Preview         → commit with [build] → dev.brydlstepan.cz
              → Publish to live → PR Dev → main, merged → brydlstepan.cz
```

- Every save is a commit: full history, rollback via git
- A draft is content that is on `Dev` and not yet on `main`; no separate draft store, `published` stays as a show/hide switch
- `Dev` holds only work that is ready to go live — *Publish* merges all of it, code included. Unfinished code lives on `feat/*` branches and is merged into `Dev` when done
- The admin shows how far `Dev` is ahead of `main`, the last deploy, and a link to dev.brydlstepan.cz

### Sign-in

- **GitHub App** (not an OAuth App), installed only on `web-portfolio`
  - Permissions: Contents read/write, Pull requests read/write, Metadata read
  - User tokens expire after 8 hours; re-sign-in afterwards (no refresh-token handling in v1)
  - Callback URL: `https://brydlstepan.cz/auth/callback`
- **Pages Function** `functions/auth/`
  - `/auth/login` — redirects to GitHub with a random `state` stored in a short-lived httpOnly cookie
  - `/auth/callback` — checks `state`, exchanges the code for a token with the client secret, redirects to `/admin/#token=…` (fragment, never sent to a server)
  - Client ID and secret live in the Pages project's encrypted environment variables; nothing is stored
- **Admin**
  - Reads the token from the fragment, clears the URL, keeps it in `sessionStorage` only
  - Calls `GET /user` and rejects any account other than `brydlstepan`
  - *Sign out* clears the token

### Features

- **Projects** — list, create, edit, reorder, show/hide, assign tags, order the gallery (video first)
- **Tags** — create, rename, group, reorder, show/hide
- **Site** — hero, about, AI, contact, social links
- **Images** — resized in the browser (max 2000px), converted to WebP, thumbnail generated
- **Saving** — all files of one save go into a single commit via the Git Data API (blobs → tree → commit → update ref)

### Code

- `admin/` — plain HTML, CSS, JS written for this site; no npm packages, no CDN
- All user text inserted with `textContent`, never `innerHTML`
- Write allowlist enforced in the admin: `content/*.json` and `assets/projects/**` only; any other path is refused

### Security layers

1. **Cloudflare Access** on `/admin/*` and dev.brydlstepan.cz — nothing loads before it passes
2. **GitHub sign-in** plus the `brydlstepan` account check
3. **GitHub permissions** — the final authority on who can write
4. **Narrow token** — one repo, contents and PRs only, 8-hour lifetime
5. **Strict CSP** on the admin — only its own scripts, only `api.github.com`
6. **Path allowlist** in the admin
7. **Branch protection** on `main` — PR required, no force-push, no deletion, content check must pass

---

## 10. Tech stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Public site | Static HTML + CSS + vanilla JS | Already the case; no framework needed at this size |
| Content | JSON files in the repo | Free, versioned, no database |
| Rendering | Build script in GitHub Actions generates HTML | SEO-friendly, no loading flash |
| Interactivity | Small JS for filters and menu | Filters act on rendered DOM |
| Admin | Static page in `admin/`, vanilla JS, GitHub REST API | No backend, no third-party code |
| Sign-in | GitHub App + Cloudflare Pages Function | Narrow, expiring tokens; secret never in the browser |
| Hosting | Cloudflare Pages, Direct Upload from GitHub Actions | Branch previews, headers, functions, Access |
| DNS / TLS | Cloudflare | Already in use |
| Access control | Cloudflare Access (free plan) | Locks admin and dev before any code runs |
| Analytics | Cloudflare Web Analytics | Free, cookieless, no consent banner needed |

### Analytics

**Cloudflare Web Analytics** is the recommended choice. It is free with no traffic cap, uses no cookies and no cross-site identifiers, and therefore needs no cookie banner under GDPR. The domain is already on Cloudflare, so it is one script tag in the page head and nothing else to maintain. Add it to production only, not to dev.

It gives page views, referrers, countries, device and browser breakdowns, and Core Web Vitals — everything a portfolio needs.

**Google Analytics 4** is possible on a static site (also just a script tag), but it sets cookies and sends data to Google, so a Czech/EU site using it needs a **consent banner with a working reject option** before the script loads. That means building consent UI and degraded data for everyone who declines — a lot of overhead for visitor counts on a portfolio.

Recommendation: Cloudflare Web Analytics now. Add GA4 later only if something specifically requires it, and accept the consent banner at that point.

**Google Search Console** is separate and worth adding regardless. It reports how the site appears in search and whether pages are indexed. It tracks no visitors, so it needs no consent.

---

## 11. Design system

Carried over from the current under-construction page:

- Pure black background, white text, gray muted copy
- Inter for all type
- Frosted glass panels with subtle borders, 20px radius
- Blue↔turquoise breathing light on key surfaces only
- Cursor-reactive glow reserved for hero/feature elements, not every card
- `prefers-reduced-motion` respected throughout

The admin uses the same tokens in a plainer, denser layout.

---

## 12. Validation

An honest review of the choices above.

### Sound

- **Static + JSON + git** is a good fit. A portfolio changes rarely; a live database would add cost, failure modes, and an attack surface for no benefit.
- **No backend of our own.** The only server code is the sign-in callback, which stores nothing. All writes go through GitHub, which already handles authentication, permissions, and history.
- **Own admin instead of Decap/Sveltia** — fits the content model as it is, and has no third-party script that could be swapped for a malicious one.
- **No contact form** means no spam pipeline and no data handling obligations.
- **Tags by `id`** avoids the classic bug where renaming a tag orphans the projects using it.

### Issues found, with fixes

**1. A public admin is an attack surface.**
**Fix:** layered protection (§9) — Cloudflare Access first, then GitHub sign-in with an account check, a narrow expiring token, strict CSP, and a path allowlist.

**2. Token theft through XSS on the admin.**
A token in the page is only as safe as the page.
**Fix:** no third-party scripts, CSP limited to `'self'` and `api.github.com`, `textContent` only, token in `sessionStorage` (gone when the tab closes), 8-hour lifetime.

**3. Drafts on `Dev` are readable while the repo is public.**
Accepted — drafts do not need to be secret, and a public repo keeps branch protection free.

**4. *Publish* also ships unfinished code on `Dev`.**
**Fix:** `Dev` holds only release-ready work; code in progress lives on `feat/*` branches.

**5. Duplicate and open copies on `*.pages.dev`.**
**Fix:** Access on preview deployments, redirect or `noindex` on the production `pages.dev` address.

**6. Client-side JSON rendering weakens SEO.**
**Fix:** the CI build generates the final HTML; filters operate on pre-rendered cards.

**7. Image weight in git.**
Git stores every version forever; the repo grows and never shrinks.
**Fix:** the admin converts to WebP, caps dimensions at 2000px, and generates thumbnails. Cloudflare Pages limits (20,000 files, 25 MiB per file) are far away. Revisit external asset hosting only if the repo approaches a few hundred MB.

**8. Cloudflare proxy TLS.**
Currently **Full** (automatic mode). The GitHub Pages origin has no valid certificate for brydlstepan.cz (checked 2026-09-28: `SEC_E_WRONG_PRINCIPAL`), so **Full (strict)** would break the current site.
**Fix:** keep Full until the switch. Cloudflare Pages is served by Cloudflare itself, so the mode stops mattering for the site; afterwards switch to **Full (strict)** if no other proxied record relies on a self-signed origin.

**9. Public email invites scraping.**
**Fix (optional):** obfuscate lightly or accept it. Low stakes, and spam filters are decent.

### Trade-offs accepted

- **Two services** — GitHub for code and content, Cloudflare for hosting and access; one API token connects them
- **Edits reach production in two steps** (*Preview*, then *Publish*) — deliberate, it is the review step
- **Re-sign-in every 8 hours** — simpler than refresh-token handling
- **A build step exists** — more than "edit HTML and commit", but it removes duplication and the SEO problem

### Rejected, and why

| Option | Why not |
| --- | --- |
| Sanity / Contentful | External dependency and account for content that changes a few times a year |
| Decap / Sveltia CMS | Generic content model (top-level JSON arrays unsupported in Decap), third-party script with access to the repo token |
| Local-only configurator | No editing away from the one machine; replaced by the online admin |
| GitHub Pages | One site per repo (no dev subdomain), no custom headers, no server functions |
| Separate drafts repo | Unnecessary; `Dev` serves as the draft space |
| Cloudflare Git integration | Builds every push; Direct Upload from Actions keeps `[build]` gating |

---

## 13. Decisions made

| Question | Decision |
| --- | --- |
| Admin | Own online admin at `/admin/`, GitHub sign-in via a GitHub App |
| Drafts | `Dev` branch is the draft space; no separate store |
| Repo visibility | Public — drafts on `Dev` may be read; free branch protection on `main` |
| Hosting | Cloudflare Pages, Direct Upload from GitHub Actions |
| Environments | `Dev` → dev.brydlstepan.cz (Access), `main` → brydlstepan.cz |
| Deploy trigger | `[build]` in a commit message, or manual run |
| Release | PR `Dev` → `main`, merge commit, `[build]` title |
| Project detail | Modal with media gallery, from v1 |
| Tone | Keep the dry humor; drop it later if it reads wrong against real work |
| Role line | **Unreal Engine Dev / 3D Generalist** |
| Video hosting | YouTube or Vimeo embeds, loaded on click behind a poster |
| Tags | 3D, Unreal Engine, Graphics, AR/VR, Visualization, Web, Large project, Medium project |
| Tag model | Free-form, multiple per project, optional `group` for filter-bar ordering |
| Filtering | Single-select in v1; multi-select possible later |
| Analytics | Cloudflare Web Analytics |

---

## 14. Still open

- **Save behavior** — deploy to dev on every save, or only on *Preview*? Leaning: only on *Preview*
- **Content** — real project entries, the About text, LinkedIn and Instagram URLs

---

## 15. Build order

1. **Content schema** — finalize the JSON shapes above, add a validator
2. **One-pager shell** — header, sections, footer, responsive layout
3. **Work grid + filters** — against mock content
4. **Project modal** — gallery, keyboard navigation, hash linking
5. **Build script** — templates → static `index.html`
6. **Cloudflare Pages** — create the Direct Upload project, API token, deploy workflow with `[build]` gating
7. **Environments** — custom domains for production and dev, Access on dev and preview deployments, `_headers`, `noindex` on dev
8. **Switch over** — disable GitHub Pages, remove `CNAME` and `.nojekyll` if unneeded, verify TLS
9. **GitHub App + sign-in function** — `/auth/login`, `/auth/callback`
10. **Admin: shell** — sign-in, account check, Access on `/admin/*`, CSP
11. **Admin: editors** — Projects, then Tags and Site
12. **Admin: images** — resize, WebP, thumbnails, single-commit saves
13. **Admin: Preview / Publish** — `[build]` commits, PR and merge, `Dev` vs `main` status
14. **Hardening** — branch protection on `main`, README deployment section
15. **Content pass** — real projects, real copy

The current under-construction page stays live until step 15.

### Manual steps (done by me, not in code)

| Step | Where |
| --- | --- |
| Create the Pages project and API token | Cloudflare dashboard |
| Add custom domains, Access applications, preview access | Cloudflare dashboard |
| Add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` secrets | GitHub → Settings → Environments |
| Create and install the GitHub App, generate client secret | GitHub → Settings → Developer settings |
| Put the client ID and secret into the Pages project | Cloudflare dashboard |
| Disable GitHub Pages | GitHub → Settings → Pages |
| Branch protection on `main` | GitHub → Settings → Branches |
