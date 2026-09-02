# Portfolio — Plan

Personal portfolio for **brydlstepan.cz**. Static public site, managed by a private local configurator, published through git.

---

## 1. Goals

- Present professional work on a single, well-designed page
- Keep the site fast, static, and free to host
- Manage content (projects, tags) without editing HTML by hand
- Keep the admin tool private — it never goes online
- Preserve the existing visual language: black base, frosted glass, blue↔turquoise light

---

## 2. Site map

| Route | Type | Purpose |
| --- | --- | --- |
| `/` | One-pager | Hero, Work, About, AI, Contact |
| Instagram | External | Photography |
| GitHub | External | Code |
| LinkedIn | External | Professional profile |

No public `/admin` route. The configurator runs only on the local machine.

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

Content lives in the repo as JSON. The configurator reads and writes these files.

### `content/tags.json`

Tags are free-form and created in the configurator. A project can carry several, and they do not all have to describe the same thing — discipline and scale can coexist.

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

Gallery order is authored in the configurator. When a project has a video, it is placed first so the modal opens on it.

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

## 7. Local configurator

A small web UI that runs on `localhost` only.

**Capabilities**

- Tags: create, rename, reorder, group, show/hide
- Projects: create, edit, reorder, publish/unpublish, assign tags, order the gallery
- Site copy: hero, about, AI, contact, social links
- Images: pick a file, resize/convert to WebP, write into `assets/`
- Build: render the static pages from the published content

**Rules**

- Binds to `127.0.0.1` only — never `0.0.0.0`
- Never runs on a server, never reachable from the internet
- No credentials or tokens stored in the repo
- All file writes validated against an allowlist of target directories

**Draft handling**

Drafts stay out of the repo entirely. The configurator keeps two stores:

| Store | Location | Committed |
| --- | --- | --- |
| Working content, including drafts | `.drafts/` | No — gitignored |
| Published content | `content/*.json` | Yes |

Toggling *publish* moves an item from the draft store into the committed content. Nothing unpublished ever reaches GitHub, so there is no draft leak and no build-time filtering to get wrong.

**Source is committed, not published**

The configurator's own source lives in the repo so it has version history and a backup. It is a local Node tool — GitHub Pages only serves it as inert text, and it holds no secrets. Any local settings live in a gitignored file.

Gitignoring the tool itself was considered and rejected: it would leave the only copy on one machine with no history.

---

## 8. Publishing workflow

```
Run configurator locally
        ↓
Edit content → drafts stay in .drafts/ (gitignored)
        ↓
Publish an item → written into content/*.json + assets/
        ↓
Build → renders index.html from templates
        ↓
git commit + push
        ↓
GitHub Pages deploys → brydlstepan.cz
```

The build runs locally inside the configurator, so no GitHub Actions workflow is required. Generated pages are committed alongside the content that produced them.

Publishing is an explicit push, not an instant remote save. That is a deliberate trade-off: full version history, rollback, and zero backend.

---

## 9. Tech stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Public site | Static HTML + CSS + vanilla JS | Already the case; no framework needed at this size |
| Content | JSON files in the repo | Free, versioned, no database |
| Rendering | Configurator generates HTML at build time | SEO-friendly, no loading flash |
| Interactivity | Small JS for filters and menu | Filters act on rendered DOM |
| Configurator | Node.js + local HTTP server + plain UI | Minimal dependencies, local-only |
| Hosting | GitHub Pages (already configured, `CNAME` → brydlstepan.cz) | Free, already working |
| DNS / TLS | Cloudflare | Already in use |
| Analytics | Cloudflare Web Analytics | Free, cookieless, no consent banner needed |

### Analytics

**Cloudflare Web Analytics** is the recommended choice. It is free with no traffic cap, uses no cookies and no cross-site identifiers, and therefore needs no cookie banner under GDPR. The domain is already on Cloudflare, so it is one script tag in the page head and nothing else to maintain.

It gives page views, referrers, countries, device and browser breakdowns, and Core Web Vitals — everything a portfolio needs.

**Google Analytics 4** is possible on a static site (also just a script tag), but it sets cookies and sends data to Google, so a Czech/EU site using it needs a **consent banner with a working reject option** before the script loads. That means building consent UI and degraded data for everyone who declines — a lot of overhead for visitor counts on a portfolio.

Recommendation: Cloudflare Web Analytics now. Add GA4 later only if something specifically requires it, and accept the consent banner at that point.

**Google Search Console** is separate and worth adding regardless. It reports how the site appears in search and whether pages are indexed. It tracks no visitors, so it needs no consent.

---

## 10. Design system

Carried over from the current under-construction page:

- Pure black background, white text, gray muted copy
- Inter for all type
- Frosted glass panels with subtle borders, 20px radius
- Blue↔turquoise breathing light on key surfaces only
- Cursor-reactive glow reserved for hero/feature elements, not every card
- `prefers-reduced-motion` respected throughout

---

## 11. Validation

An honest review of the choices above.

### Sound

- **Static + JSON + git** is a good fit. A portfolio changes rarely; a live database would add cost, failure modes, and an attack surface for no benefit.
- **Local-only admin** removes the largest security risk in the original plan. No login endpoint, no session handling, no public write path.
- **No contact form** means no backend, no spam pipeline, no data handling obligations.
- **Tags by `id`** avoids the classic bug where renaming a tag orphans the projects using it.
- **GitHub Pages already works** with the domain — no reason to migrate.

### Issues found, with fixes

**1. GitHub Pages publishes the entire branch.** — *Resolved*
With Jekyll disabled via `.nojekyll`, every file in the published branch is served, including the `configurator/` folder.

Publishing the tool's source is acceptable here. It is a local Node application; GitHub Pages serves it as inert text and cannot execute it. There is nothing sensitive in a single-user content editor, and its source being readable changes nothing about who can write to the site — that still requires push access to the repo.

Two conditions make this safe:

- No secrets, tokens, or local config are ever committed (local settings live in a gitignored file)
- Drafts are not stored in committed content — see below

A `robots.txt` disallow keeps the folder out of search results. Cosmetic, not security.

**2. Unpublished drafts can leak.** — *Resolved by design*
This was the real risk, not the configurator source. A committed `projects.json` containing `"published": false` entries is readable by anyone, no matter how the page renders.

**Fix:** drafts never enter the repo. The configurator keeps them in a gitignored `.drafts/` store and only writes an item into `content/*.json` when it is published. Deleting or unpublishing moves it back out.

This is stronger than filtering at build time, because there is no filter step that can silently break.

**3. Client-side JSON rendering weakens SEO.**
Fetching JSON and building the DOM in the browser means crawlers and link previews may see an empty page.

**Fix:** the configurator already is a build tool — have it **generate the final HTML**. Filters then operate on pre-rendered cards. Best of both.

**4. Cloudflare proxy + GitHub Pages TLS.**
If the domain is proxied (orange cloud), SSL/TLS mode must be **Full**. `Flexible` causes redirect loops with GitHub Pages.

**Fix:** verify the SSL/TLS mode in Cloudflare when the site goes live.

**5. Image weight in git.**
A portfolio is image-heavy. Git stores every version forever; the repo grows and never shrinks. GitHub Pages soft limits are roughly 1 GB repo size and 100 GB/month bandwidth.

**Fix:** the configurator should convert to WebP/AVIF, cap dimensions (e.g. 2000px), and generate thumbnails. Revisit external asset hosting only if the repo approaches a few hundred MB.

**6. Local server safety.**
A local tool that writes files and accepts uploads still deserves basic hygiene.

**Fix:** bind to `127.0.0.1`, reject path traversal, restrict writes to `content/` and `assets/`, and validate uploaded file types.

**7. Public email invites scraping.**
`mailto:` in plain HTML gets harvested.

**Fix (optional):** obfuscate lightly or accept it. Low stakes, and spam filters are decent.

**8. Duplicated markup across pages.** — *Resolved by scope*
The site is a single page again, so there is no second copy of the header and footer to drift.

### Trade-offs accepted

- **Publishing needs a push** — no instant remote edits, no editing from a phone
- **Admin is machine-bound** — content edits only happen where the configurator lives; git keeps the content itself portable
- **A build step exists** — slightly more than "edit HTML and commit", but it removes the duplication and draft-leak problems

### Rejected, and why

| Option | Why not |
| --- | --- |
| Sanity / Contentful | Free tiers work, but add an external dependency and account for content that changes a few times a year |
| Decap CMS | Would work, but the admin lives online and needs OAuth; local-only was the explicit preference |
| Cloudflare Workers + D1 custom admin | Effectively writing a CMS, plus a public write endpoint to secure |
| Public `/admin` on the domain | Requires auth, a backend, and ongoing maintenance for a single-user tool |

---

## 12. Decisions made

| Question | Decision |
| --- | --- |
| Configurator location | In this repo, committed for backup; drafts kept in a gitignored store |
| Project detail | Modal with media gallery, from v1 |
| Tone | Keep the dry humor; drop it later if it reads wrong against real work |
| Branch | Development happens on `Dev` |
| Role line | **Unreal Engine Dev / 3D Generalist** |
| Video hosting | YouTube or Vimeo embeds, loaded on click behind a poster |
| Tags | 3D, Unreal Engine, Graphics, AR/VR, Visualization, Web, Large project, Medium project |
| Tag model | Free-form, multiple per project, optional `group` for filter-bar ordering |
| Filtering | Single-select in v1; multi-select possible later |
| Analytics | Cloudflare Web Analytics |

### Still open

Nothing blocking. Remaining items are content: real project entries, the About text, and the LinkedIn and Instagram URLs.

---

## 13. Build order

1. **Content schema** — finalize the JSON shapes above
2. **One-pager shell** — header, sections, footer, responsive layout
3. **Work grid + filters** — against mock content
4. **Project modal** — gallery, keyboard navigation, hash linking
5. **Configurator** — local UI, content editing, image handling, draft store
6. **Build step** — templates → static pages
7. **Deploy** — verify domain, TLS mode, and Pages output
8. **Content pass** — real projects, real copy

The current under-construction page stays live until step 8.
