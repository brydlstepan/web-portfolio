// Content admin. Runs entirely in the browser: reads and writes content/*.json
// and project images on the Dev branch through the GitHub API, with the user
// token from /auth/callback. Save = commit to Dev, Preview = commit with
// [build] (deploys dev.brydlstepan.cz), Publish = merge Dev into main.
(() => {
  const CONFIG = {
    owner: "brydlstepan",
    repo: "web-portfolio",
    branch: "Dev",
    liveBranch: "main",
    login: "brydlstepan",
    devSite: "https://dev.brydlstepan.cz",
  };
  const FILES = {
    projects: "content/projects.json",
    tags: "content/tags.json",
    site: "content/site.json",
  };
  // The only asset paths the admin creates, and so the only ones it deletes.
  const ADMIN_ASSET = /^assets\/projects\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9-]+\.webp$/;
  const SOCIAL_KEYS = ["github", "linkedin", "instagram", "photography", "artstation"];
  const IMAGE_MAX = { cover: 1600, image: 2000, poster: 1600 };

  const { validateContent, SLUG } = window.PortfolioValidate;
  const LOCAL = ["127.0.0.1", "localhost"].includes(location.hostname);
  const REPO = `/repos/${CONFIG.owner}/${CONFIG.repo}`;

  const $ = (sel) => document.querySelector(sel);

  const state = {
    api: "https://api.github.com",
    token: null,
    head: null, // Dev commit the content was loaded from / last saved as
    blobShas: {}, // content file path → blob sha at `head`
    paths: new Set(), // every file path on Dev at `head`
    content: null, // { projects, tags, site } being edited
    saved: {}, // key → serialized content at `head`
    savedRefs: new Set(), // asset paths referenced at `head`
    uploads: new Map(), // path → { base64, url } not yet committed
    previews: new Map(), // path → object URL, kept after commit for display
    fresh: new WeakSet(), // projects/tags not saved yet (id still editable)
    tab: "projects",
    selected: 0,
    ahead: null,
    busy: false,
  };

  // ── Helpers ─────────────────────────────────────────────────────────

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === "class") el.className = value;
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else if (key === "value") el.value = value;
      else if (key === "checked") el.checked = value;
      else el.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      el.append(child instanceof Node ? child : String(child));
    }
    return el;
  }

  let toastTimer;
  function toast(message, kind = "", { html = null, sticky = false } = {}) {
    const el = $("#toast");
    el.replaceChildren(html || message);
    el.className = `toast${kind ? ` toast--${kind}` : ""}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(() => (el.hidden = true), kind === "error" ? 9000 : 4500);
  }

  function decodeBase64Utf8(b64) {
    const binary = atob(b64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  const move = (arr, from, to) => {
    if (to < 0 || to >= arr.length) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
  };

  // ── Session ─────────────────────────────────────────────────────────

  const store = {
    get: (k) => {
      try {
        return sessionStorage.getItem(`admin.${k}`);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        if (v == null) sessionStorage.removeItem(`admin.${k}`);
        else sessionStorage.setItem(`admin.${k}`, v);
      } catch {}
    },
  };

  // /auth/callback hands over the token (or an error) in the URL fragment.
  function takeFragment() {
    if (!location.hash) return null;
    const params = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname + location.search);
    if (params.get("token")) {
      const expiresIn = Number(params.get("expires_in")) || 8 * 3600;
      store.set("token", params.get("token"));
      store.set("expires", String(Date.now() + expiresIn * 1000));
    }
    // Local testing only: point the admin at a mock GitHub API.
    if (LOCAL && params.get("api")) store.set("api", params.get("api"));
    return params.get("error");
  }

  function signOut(message) {
    store.set("token", null);
    store.set("expires", null);
    state.token = null;
    showSignIn(message);
  }

  function showSignIn(message = "") {
    $("#editor").hidden = true;
    $("#actions").hidden = true;
    $("#loading").hidden = true;
    $("#status").textContent = "";
    $("#signin").hidden = false;
    $("#signin-error").textContent = message;
  }

  // ── GitHub API ──────────────────────────────────────────────────────

  class SessionEnded extends Error {}

  async function gh(path, { method = "GET", body } = {}) {
    const res = await fetch(state.api + path, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${state.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      signOut("Your GitHub session has expired. Sign in again.");
      throw new SessionEnded();
    }
    if (!res.ok) {
      let message = "";
      try {
        message = (await res.json()).message || "";
      } catch {}
      const err = new Error(message || `GitHub returned ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async function headOf(branch) {
    const ref = await gh(`${REPO}/git/ref/heads/${branch}`);
    return ref.object.sha;
  }

  async function treeOf(commitSha) {
    const commit = await gh(`${REPO}/git/commits/${commitSha}`);
    const tree = await gh(`${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new Error("The repository tree is too large to read in one go.");
    return {
      treeSha: commit.tree.sha,
      blobs: new Map(tree.tree.filter((t) => t.type === "blob").map((t) => [t.path, t.sha])),
    };
  }

  // ── Content state ───────────────────────────────────────────────────

  const withOrder = (items) => items.map((item, i) => ({ ...item, order: i + 1 }));

  function serialize(key) {
    const value = key === "site" ? state.content.site : withOrder(state.content[key]);
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  function assetRefs(content) {
    const refs = new Set();
    for (const p of content.projects) {
      if (p.cover) refs.add(p.cover);
      for (const g of p.gallery || []) {
        if (g.type === "image" && g.src) refs.add(g.src);
        if (g.type === "video" && g.poster) refs.add(g.poster);
      }
    }
    return refs;
  }

  function pendingChanges() {
    const files = Object.entries(FILES)
      .filter(([key]) => serialize(key) !== state.saved[key])
      .map(([key, path]) => ({ key, path, text: serialize(key) }));
    const refs = assetRefs(state.content);
    const uploads = [...state.uploads]
      .filter(([path]) => refs.has(path))
      .map(([path, upload]) => ({ path, base64: upload.base64 }));
    const deletions = [...state.savedRefs]
      .filter((path) => !refs.has(path) && ADMIN_ASSET.test(path) && state.paths.has(path))
      .map((path) => ({ path }));
    return { files, uploads, deletions, refs };
  }

  const hasChanges = (c) => c.files.length + c.uploads.length + c.deletions.length > 0;

  function validate() {
    return validateContent(withOrderedContent(), {
      assetExists: (path) => state.paths.has(path) || state.uploads.has(path),
    });
  }

  function withOrderedContent() {
    const c = state.content;
    return { site: c.site, tags: withOrder(c.tags), projects: withOrder(c.projects) };
  }

  async function load() {
    $("#loading").hidden = false;
    const head = await headOf(CONFIG.branch);
    const { blobs } = await treeOf(head);
    const content = {};
    const blobShas = {};
    for (const [key, path] of Object.entries(FILES)) {
      const sha = blobs.get(path);
      if (!sha) throw new Error(`${path} is missing on ${CONFIG.branch}.`);
      const blob = await gh(`${REPO}/git/blobs/${sha}`);
      content[key] = JSON.parse(decodeBase64Utf8(blob.content));
      blobShas[path] = sha;
    }
    content.projects.sort((a, b) => a.order - b.order);
    content.tags.sort((a, b) => a.order - b.order);

    Object.assign(state, {
      head,
      blobShas,
      paths: new Set(blobs.keys()),
      content,
      uploads: new Map(),
      fresh: new WeakSet(),
      selected: Math.min(state.selected, Math.max(0, content.projects.length - 1)),
    });
    state.saved = Object.fromEntries(Object.keys(FILES).map((key) => [key, serialize(key)]));
    state.savedRefs = assetRefs(content);
    $("#loading").hidden = true;
  }

  // One commit on Dev with every change: content files, new images, and
  // images no longer referenced. Refuses if someone else changed the content
  // files on GitHub since they were loaded.
  async function commit(message, { allowEmpty = false } = {}) {
    const changes = pendingChanges();
    if (!hasChanges(changes) && !allowEmpty) return null;

    for (const { path } of changes.files) {
      if (!Object.values(FILES).includes(path)) throw new Error(`Refusing to write ${path}.`);
    }
    for (const { path } of [...changes.uploads, ...changes.deletions]) {
      if (!ADMIN_ASSET.test(path)) throw new Error(`Refusing to write ${path}.`);
    }
    const { errors } = validate();
    if (errors.length) throw new Error("Fix the problems listed at the top first.");

    const head = await headOf(CONFIG.branch);
    const current = await treeOf(head);
    if (head !== state.head) {
      const changed = Object.values(FILES).filter((p) => current.blobs.get(p) !== state.blobShas[p]);
      if (changed.length) {
        throw new Error(
          `${changed.join(", ")} changed on GitHub since you opened the admin. ` +
            "Reload the page to get the latest version (your unsaved edits here will be lost)."
        );
      }
    }

    const entries = [];
    const newBlobShas = {};
    for (const file of changes.files) {
      const blob = await gh(`${REPO}/git/blobs`, { method: "POST", body: { content: file.text, encoding: "utf-8" } });
      entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
      newBlobShas[file.path] = blob.sha;
    }
    for (const upload of changes.uploads) {
      const blob = await gh(`${REPO}/git/blobs`, { method: "POST", body: { content: upload.base64, encoding: "base64" } });
      entries.push({ path: upload.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    for (const deletion of changes.deletions) {
      entries.push({ path: deletion.path, mode: "100644", type: "blob", sha: null });
    }

    const treeSha = entries.length
      ? (await gh(`${REPO}/git/trees`, { method: "POST", body: { base_tree: current.treeSha, tree: entries } })).sha
      : current.treeSha;
    const created = await gh(`${REPO}/git/commits`, {
      method: "POST",
      body: { message, tree: treeSha, parents: [head] },
    });
    await gh(`${REPO}/git/refs/heads/${CONFIG.branch}`, {
      method: "PATCH",
      body: { sha: created.sha, force: false },
    });

    // The new commit is now the base.
    state.head = created.sha;
    for (const p of Object.values(FILES)) {
      state.blobShas[p] = newBlobShas[p] || current.blobs.get(p);
    }
    state.paths = new Set(current.blobs.keys());
    for (const { path } of changes.uploads) {
      state.paths.add(path);
      state.previews.set(path, state.uploads.get(path).url);
    }
    for (const { path } of changes.deletions) state.paths.delete(path);
    state.uploads.clear();
    state.saved = Object.fromEntries(Object.keys(FILES).map((key) => [key, serialize(key)]));
    state.savedRefs = changes.refs;
    state.fresh = new WeakSet();
    return created.sha;
  }

  function summary(changes) {
    const parts = changes.files.map((f) => f.key);
    if (changes.uploads.length) parts.push(`${changes.uploads.length} image(s) added`);
    if (changes.deletions.length) parts.push(`${changes.deletions.length} image(s) removed`);
    return parts.join(", ");
  }

  async function refreshAhead() {
    try {
      const cmp = await gh(`${REPO}/compare/${CONFIG.liveBranch}...${CONFIG.branch}`);
      state.ahead = cmp.ahead_by;
    } catch (err) {
      if (err instanceof SessionEnded) throw err;
      state.ahead = null;
    }
    updateStatus();
  }

  // ── Actions ─────────────────────────────────────────────────────────

  async function run(label, task) {
    if (state.busy) return;
    state.busy = true;
    updateStatus(label);
    try {
      await task();
    } catch (err) {
      if (!(err instanceof SessionEnded)) toast(err.message, "error");
    } finally {
      state.busy = false;
      updateStatus();
    }
  }

  function onSave() {
    run("Saving…", async () => {
      const changes = pendingChanges();
      if (!hasChanges(changes)) return toast("Nothing to save.");
      await commit(`Update content: ${summary(changes)}`);
      renderPanel();
      await refreshAhead();
      toast("Saved to Dev.", "ok");
    });
  }

  function onPreview() {
    run("Deploying preview…", async () => {
      const changes = pendingChanges();
      const detail = hasChanges(changes) ? summary(changes) : "no content changes";
      await commit(`[build] Preview from admin: ${detail}`, { allowEmpty: true });
      renderPanel();
      await refreshAhead();
      toast("", "ok", {
        html: h(
          "span",
          {},
          "Saved and deploying to ",
          h("a", { href: CONFIG.devSite, target: "_blank", rel: "noopener" }, "dev.brydlstepan.cz"),
          " — ready in about a minute."
        ),
      });
    });
  }

  function onPublish() {
    run("Publishing…", async () => {
      if (hasChanges(pendingChanges())) throw new Error("Save or preview your changes first.");
      const cmp = await gh(`${REPO}/compare/${CONFIG.liveBranch}...${CONFIG.branch}`);
      if (!cmp.ahead_by) return toast("The live site is already up to date.");

      const list = cmp.commits
        .slice(-12)
        .map((c) => `• ${c.commit.message.split("\n")[0]}`)
        .join("\n");
      const more = cmp.ahead_by > 12 ? `\n…and ${cmp.ahead_by - 12} more` : "";
      const ok = confirm(
        `Publish ${cmp.ahead_by} commit(s) from Dev to the live site?\n\n` +
          `This includes everything on Dev, code as well as content:\n\n${list}${more}`
      );
      if (!ok) return;

      const open = await gh(
        `${REPO}/pulls?state=open&head=${CONFIG.owner}:${CONFIG.branch}&base=${CONFIG.liveBranch}`
      );
      const pr =
        open[0] ||
        (await gh(`${REPO}/pulls`, {
          method: "POST",
          body: {
            title: "[build] Publish from admin",
            head: CONFIG.branch,
            base: CONFIG.liveBranch,
            body: "Published from the admin.",
          },
        }));
      await gh(`${REPO}/pulls/${pr.number}/merge`, {
        method: "PUT",
        body: { merge_method: "merge", commit_title: `[build] Publish from admin (#${pr.number})` },
      });
      await refreshAhead();
      toast("Published — the live site updates in about a minute.", "ok");
    });
  }

  // ── Status bar ──────────────────────────────────────────────────────

  function updateStatus(busyLabel) {
    if (!state.content) return;
    const changes = pendingChanges();
    const dirty = hasChanges(changes);
    const { errors } = validate();

    const status = $("#status");
    status.replaceChildren();
    if (busyLabel) status.append(busyLabel);
    else {
      status.append(
        dirty ? h("span", { class: "dirty" }, `Unsaved: ${summary(changes)}`) : "All changes saved",
        state.ahead == null ? "" : ` · Dev is ${state.ahead} commit(s) ahead of live`
      );
    }

    $("#btn-save").disabled = state.busy || !dirty || errors.length > 0;
    $("#btn-preview").disabled = state.busy || errors.length > 0;
    $("#btn-publish").disabled = state.busy || dirty || state.ahead === 0;

    const problems = $("#problems");
    problems.hidden = errors.length === 0;
    problems.replaceChildren(
      h("strong", {}, "Fix before saving:"),
      h("ul", {}, errors.map((e) => h("li", {}, e)))
    );
  }

  function changed() {
    updateStatus();
    renderSideList();
  }

  // ── Form building blocks ────────────────────────────────────────────

  function field(label, input, hint) {
    return h("label", { class: "field" }, h("span", { class: "field__label" }, label), input, hint && h("span", { class: "field__hint" }, hint));
  }

  function text(obj, key, { multiline = false, type = "text", placeholder, disabled, onInput } = {}) {
    const props = {
      value: obj[key] ?? "",
      placeholder,
      disabled,
      oninput: (e) => {
        obj[key] = e.target.value;
        onInput?.(e.target.value);
        changed();
      },
    };
    return multiline ? h("textarea", props) : h("input", { type, ...props });
  }

  function checkbox(label, checked, onChange) {
    return h(
      "label",
      { class: "check" },
      h("input", { type: "checkbox", checked, onchange: (e) => onChange(e.target.checked) }),
      label
    );
  }

  function toolButtons(arr, index, rerender, { onRemove } = {}) {
    return h(
      "div",
      { class: "item__tools" },
      h("button", { type: "button", class: "btn btn--small", title: "Move up", "aria-label": "Move up", disabled: index === 0, onclick: () => { move(arr, index, index - 1); rerender(); changed(); } }, "↑"),
      h("button", { type: "button", class: "btn btn--small", title: "Move down", "aria-label": "Move down", disabled: index === arr.length - 1, onclick: () => { move(arr, index, index + 1); rerender(); changed(); } }, "↓"),
      h("button", { type: "button", class: "btn btn--small btn--danger", title: "Remove", "aria-label": "Remove", onclick: () => { if (onRemove && !onRemove()) return; arr.splice(index, 1); rerender(); changed(); } }, "✕")
    );
  }

  // Shows a repo image: uploads and freshly saved files from memory, deployed
  // files from the site, anything else straight from the Dev branch on GitHub.
  function image(path) {
    if (!path) return h("div", { class: "thumb thumb--empty" }, "No image");
    const local = state.uploads.get(path)?.url || state.previews.get(path);
    const img = h("img", { class: "thumb", alt: "", src: local || `/${path}` });
    if (!local && !LOCAL) {
      img.addEventListener(
        "error",
        () => (img.src = `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${path}`),
        { once: true }
      );
    }
    return img;
  }

  // ── Images ──────────────────────────────────────────────────────────

  async function toWebp(file, maxSize) {
    if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type)) {
      throw new Error("Use a JPG, PNG, WebP, AVIF or GIF image.");
    }
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
    if (!blob || blob.type !== "image/webp") throw new Error("This browser cannot create WebP images.");
    return { blob, base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
  }

  // Converts `file` and stages it for the next commit; returns its repo path.
  async function stageImage(project, file, kind) {
    if (!SLUG.test(project.id || "")) throw new Error("Give the project a valid id before adding images.");
    const { blob, base64 } = await toWebp(file, IMAGE_MAX[kind]);
    const name = `${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const path = `assets/projects/${project.id}/${name}.webp`;
    state.uploads.set(path, { base64, url: URL.createObjectURL(blob) });
    return path;
  }

  function pickImages({ multiple = false } = {}, onFiles) {
    const input = h("input", { type: "file", accept: "image/*", multiple });
    input.addEventListener("change", () => {
      const files = [...input.files];
      if (files.length) onFiles(files);
    });
    input.click();
  }

  function imageButton(label, project, kind, onPath) {
    return h(
      "button",
      {
        type: "button",
        class: "btn btn--small",
        onclick: () =>
          pickImages({}, async ([file]) => {
            try {
              onPath(await stageImage(project, file, kind));
              changed();
            } catch (err) {
              toast(err.message, "error");
            }
          }),
      },
      label
    );
  }

  // ── Projects tab ────────────────────────────────────────────────────

  function renderSideList() {
    const list = $("#project-list");
    if (!list) return;
    const { projects } = state.content;
    list.replaceChildren(
      ...projects.map((p, i) =>
        h(
          "button",
          {
            type: "button",
            class: `list__item${i === state.selected ? " is-active" : ""}`,
            onclick: () => {
              state.selected = i;
              renderPanel();
            },
          },
          h("span", { class: "list__title" }, p.title || p.id || "Untitled"),
          p.published ? null : h("span", { class: "badge badge--draft" }, "hidden")
        )
      )
    );
  }

  function newProject() {
    const project = {
      id: "",
      title: "",
      tags: [],
      summary: "",
      description: "",
      year: new Date().getFullYear(),
      role: "",
      tools: [],
      cover: "",
      gallery: [],
      links: [],
      order: 0,
      published: false,
    };
    state.fresh.add(project);
    state.content.projects.push(project);
    state.selected = state.content.projects.length - 1;
    renderPanel();
    changed();
  }

  function renderProjects(panel) {
    const { projects } = state.content;
    const side = h(
      "div",
      { class: "list" },
      h("div", { class: "list", id: "project-list" }),
      h("button", { type: "button", class: "btn", onclick: newProject }, "+ New project")
    );
    const project = projects[state.selected];
    panel.append(h("div", { class: "split" }, side, project ? projectForm(project) : h("p", { class: "empty" }, "No projects yet.")));
    renderSideList();
  }

  function projectForm(p) {
    const index = state.content.projects.indexOf(p);
    const isFresh = state.fresh.has(p);
    const rerender = () => renderPanel();

    const tagsBox = h(
      "div",
      { class: "checks" },
      state.content.tags.map((t) =>
        checkbox(t.label, (p.tags || []).includes(t.id), (on) => {
          const set = new Set(p.tags || []);
          if (on) set.add(t.id);
          else set.delete(t.id);
          // Keep the tag file's order so the JSON stays tidy.
          p.tags = state.content.tags.map((x) => x.id).filter((id) => set.has(id));
          changed();
        })
      )
    );

    const cover = h(
      "div",
      { class: "item" },
      image(p.cover),
      h("div", { class: "item__body" }, h("span", { class: "field__hint" }, p.cover || "No cover yet — used on the project card.")),
      h(
        "div",
        { class: "item__tools" },
        imageButton(p.cover ? "Replace" : "Upload", p, "cover", (path) => {
          p.cover = path;
          rerender();
        })
      )
    );

    const gallery = h(
      "div",
      { class: "group" },
      h(
        "div",
        { class: "group__head" },
        h("span", { class: "group__title" }, "Gallery"),
        h(
          "div",
          { class: "item__tools" },
          h(
            "button",
            {
              type: "button",
              class: "btn btn--small",
              onclick: () =>
                pickImages({ multiple: true }, async (files) => {
                  try {
                    for (const file of files) {
                      const src = await stageImage(p, file, "image");
                      (p.gallery ||= []).push({ type: "image", src, alt: "" });
                    }
                    rerender();
                    changed();
                  } catch (err) {
                    toast(err.message, "error");
                  }
                }),
            },
            "+ Images"
          ),
          h(
            "button",
            {
              type: "button",
              class: "btn btn--small",
              onclick: () => {
                // Video goes first so the modal opens on it.
                (p.gallery ||= []).unshift({ type: "video", provider: "youtube", id: "", alt: "" });
                rerender();
                changed();
              },
            },
            "+ Video"
          )
        )
      ),
      (p.gallery || []).length
        ? (p.gallery || []).map((g, i) => galleryItem(p, g, i, rerender))
        : h("span", { class: "field__hint" }, "Empty — the cover is shown instead.")
    );

    const links = h(
      "div",
      { class: "group" },
      h(
        "div",
        { class: "group__head" },
        h("span", { class: "group__title" }, "Links"),
        h(
          "button",
          {
            type: "button",
            class: "btn btn--small",
            onclick: () => {
              (p.links ||= []).push({ label: "", url: "" });
              rerender();
              changed();
            },
          },
          "+ Link"
        )
      ),
      (p.links || []).map((l, i) =>
        h(
          "div",
          { class: "item" },
          h("span"),
          h("div", { class: "row" }, field("Label", text(l, "label")), field("URL", text(l, "url", { type: "url", placeholder: "https://…" }))),
          toolButtons(p.links, i, rerender)
        )
      )
    );

    return h(
      "div",
      { class: "form" },
      h(
        "div",
        { class: "form__head" },
        h("h2", {}, p.title || "New project"),
        h(
          "div",
          { class: "item__tools" },
          h("button", { type: "button", class: "btn btn--small", disabled: index === 0, onclick: () => { move(state.content.projects, index, index - 1); state.selected = index - 1; rerender(); changed(); } }, "↑ Move up"),
          h("button", { type: "button", class: "btn btn--small", disabled: index === state.content.projects.length - 1, onclick: () => { move(state.content.projects, index, index + 1); state.selected = index + 1; rerender(); changed(); } }, "↓ Move down"),
          h(
            "button",
            {
              type: "button",
              class: "btn btn--small btn--danger",
              onclick: () => {
                if (!confirm(`Delete “${p.title || p.id || "this project"}”? Its uploaded images are removed on the next save.`)) return;
                state.content.projects.splice(index, 1);
                state.selected = Math.max(0, index - 1);
                rerender();
                changed();
              },
            },
            "Delete"
          )
        )
      ),
      checkbox("Shown on the site", p.published, (on) => {
        p.published = on;
        changed();
      }),
      h(
        "div",
        { class: "row" },
        field("Title", text(p, "title")),
        field(
          "Id",
          text(p, "id", { disabled: !isFresh, placeholder: "my-project" }),
          isFresh ? "Lowercase letters, numbers and dashes. Used in the link (#id) and cannot be changed after saving." : "Fixed — it is part of shared links."
        )
      ),
      field("Summary", text(p, "summary"), "One line on the project card."),
      field("Description", text(p, "description", { multiline: true }), "Shown in the project window."),
      h(
        "div",
        { class: "row" },
        field(
          "Year",
          h("input", {
            type: "number",
            value: p.year ?? "",
            min: 1990,
            max: 2100,
            oninput: (e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isInteger(n)) p.year = n;
              else delete p.year;
              changed();
            },
          })
        ),
        field("Role", text(p, "role"))
      ),
      field(
        "Tools",
        h("input", {
          type: "text",
          value: (p.tools || []).join(", "),
          placeholder: "Unreal Engine, Blender",
          oninput: (e) => {
            p.tools = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
            changed();
          },
        }),
        "Comma-separated."
      ),
      field("Tags", tagsBox),
      h("div", { class: "group" }, h("span", { class: "group__title" }, "Cover"), cover),
      gallery,
      links
    );
  }

  function galleryItem(p, g, i, rerender) {
    const body =
      g.type === "video"
        ? h(
            "div",
            { class: "item__body" },
            h(
              "div",
              { class: "row" },
              field(
                "Provider",
                h(
                  "select",
                  {
                    onchange: (e) => {
                      g.provider = e.target.value;
                      changed();
                    },
                  },
                  ["youtube", "vimeo"].map((v) => h("option", { value: v, selected: g.provider === v }, v === "youtube" ? "YouTube" : "Vimeo"))
                )
              ),
              field("Video id", text(g, "id", { placeholder: "dQw4w9WgXcQ" }), "The id from the video's URL.")
            ),
            field("Description (alt text)", text(g, "alt")),
            h(
              "div",
              { class: "item__tools" },
              imageButton(g.poster ? "Replace poster" : "Upload poster", p, "poster", (path) => {
                g.poster = path;
                rerender();
              }),
              g.poster && h("button", { type: "button", class: "btn btn--small", onclick: () => { delete g.poster; rerender(); changed(); } }, "Remove poster")
            )
          )
        : h(
            "div",
            { class: "item__body" },
            field("Description (alt text)", text(g, "alt")),
            h("div", { class: "item__tools" }, imageButton("Replace", p, "image", (path) => { g.src = path; rerender(); }))
          );
    return h("div", { class: "item" }, image(g.type === "video" ? g.poster : g.src), body, toolButtons(p.gallery, i, rerender));
  }

  // ── Tags tab ────────────────────────────────────────────────────────

  function renderTags(panel) {
    const { tags, projects } = state.content;
    const rerender = () => renderPanel();
    const usage = (id) => projects.filter((p) => (p.tags || []).includes(id)).length;

    const rows = tags.map((t, i) => {
      const isFresh = state.fresh.has(t);
      return h(
        "tr",
        {},
        h("td", {}, text(t, "label")),
        h("td", {}, text(t, "id", { disabled: !isFresh, placeholder: "tag-id" })),
        h("td", {}, text(t, "group", { placeholder: "discipline" })),
        h(
          "td",
          {},
          checkbox("", t.visible, (on) => {
            t.visible = on;
            changed();
          })
        ),
        h("td", {}, String(usage(t.id))),
        h(
          "td",
          {},
          toolButtons(tags, i, rerender, {
            onRemove: () => {
              const n = usage(t.id);
              if (n && !confirm(`“${t.label}” is used by ${n} project(s). Remove it from them and delete it?`)) return false;
              for (const p of projects) p.tags = (p.tags || []).filter((id) => id !== t.id);
              return true;
            },
          })
        )
      );
    });

    panel.append(
      h(
        "div",
        { class: "form" },
        h("p", { class: "field__hint" }, "Order here is the order of the filter bar. Tags with the same group sit together; hidden tags stay on projects but leave the filter bar."),
        h(
          "table",
          { class: "table" },
          h("thead", {}, h("tr", {}, ["Label", "Id", "Group", "Visible", "Projects", ""].map((c) => h("th", {}, c)))),
          h("tbody", {}, rows)
        ),
        h(
          "div",
          {},
          h(
            "button",
            {
              type: "button",
              class: "btn",
              onclick: () => {
                const tag = { id: "", label: "", group: "discipline", order: 0, visible: true };
                state.fresh.add(tag);
                tags.push(tag);
                rerender();
                changed();
              },
            },
            "+ New tag"
          )
        )
      )
    );
  }

  // ── Site tab ────────────────────────────────────────────────────────

  function renderSite(panel) {
    const site = state.content.site;
    site.ai ||= { title: "", lede: "", items: [] };
    site.ai.items ||= [];
    site.skills ||= [];
    site.contact ||= { email: "" };
    site.social ||= {};
    const rerender = () => renderPanel();

    const aiItems = site.ai.items.map((item, i) =>
      h(
        "div",
        { class: "item" },
        h("span"),
        h("div", { class: "item__body" }, field("Title", text(item, "title")), field("Text", text(item, "text", { multiline: true }))),
        toolButtons(site.ai.items, i, rerender)
      )
    );

    const skills = site.skills.map((skill, i) =>
      h(
        "tr",
        {},
        h("td", {}, text(skill, "name")),
        h("td", {}, text(skill, "id", { placeholder: "icon id" })),
        h(
          "td",
          {},
          h("input", {
            type: "number",
            min: 0,
            max: 10,
            value: skill.level ?? 0,
            oninput: (e) => {
              skill.level = Math.max(0, Math.min(10, Number(e.target.value) || 0));
              changed();
            },
          })
        ),
        h("td", {}, toolButtons(site.skills, i, rerender))
      )
    );

    panel.append(
      h(
        "div",
        { class: "form" },
        h("div", { class: "row" }, field("Brand", text(site, "brand")), field("E-mail", text(site.contact, "email", { type: "email" }))),
        field("About", text(site, "about", { multiline: true }), "“make pretty things that run smooth” is highlighted and “photos” links to the photography profile."),
        h(
          "div",
          { class: "group" },
          h("span", { class: "group__title" }, "AI section"),
          h("div", { class: "row" }, field("Title", text(site.ai, "title")), field("Italic part of the title", text(site.ai, "titleEmphasis"))),
          field("Lede", text(site.ai, "lede", { multiline: true })),
          aiItems,
          h("div", {}, h("button", { type: "button", class: "btn btn--small", onclick: () => { site.ai.items.push({ title: "", text: "" }); rerender(); changed(); } }, "+ Point"))
        ),
        h(
          "div",
          { class: "group" },
          h("span", { class: "group__title" }, "Skills"),
          h("p", { class: "field__hint" }, "Level 0–10. The icon id picks a built-in icon (e.g. unreal, blender, figma); unknown ids get a plain circle."),
          h("table", { class: "table" }, h("thead", {}, h("tr", {}, ["Name", "Icon id", "Level", ""].map((c) => h("th", {}, c)))), h("tbody", {}, skills)),
          h("div", {}, h("button", { type: "button", class: "btn btn--small", onclick: () => { site.skills.push({ id: "", name: "", level: 5 }); rerender(); changed(); } }, "+ Skill"))
        ),
        h(
          "div",
          { class: "group" },
          h("span", { class: "group__title" }, "Social links"),
          h("p", { class: "field__hint" }, "Leave empty to hide the icon."),
          h("div", { class: "row" }, SOCIAL_KEYS.map((key) => field(key[0].toUpperCase() + key.slice(1), text(site.social, key, { type: "url", placeholder: "https://…" }))))
        )
      )
    );
  }

  // ── Shell ───────────────────────────────────────────────────────────

  function renderPanel() {
    const panel = $("#panel");
    panel.replaceChildren();
    for (const tab of document.querySelectorAll(".tab")) {
      tab.setAttribute("aria-selected", String(tab.dataset.tab === state.tab));
    }
    if (state.tab === "projects") renderProjects(panel);
    else if (state.tab === "tags") renderTags(panel);
    else renderSite(panel);
    updateStatus();
  }

  async function start() {
    const error = takeFragment();
    state.api = (LOCAL && store.get("api")) || state.api;
    state.token = store.get("token");
    if (error) return showSignIn(error);
    if (!state.token || Number(store.get("expires") || 0) < Date.now()) {
      return signOut(state.token ? "Your GitHub session has expired. Sign in again." : "");
    }

    $("#signin").hidden = true;
    try {
      const user = await gh("/user");
      if (user.login !== CONFIG.login) {
        return signOut(`Signed in as ${user.login}. This admin only accepts ${CONFIG.login}.`);
      }
      $("#user").textContent = user.login;
      await load();
    } catch (err) {
      if (err instanceof SessionEnded) return;
      $("#loading").hidden = true;
      return showSignIn(`Could not load content: ${err.message}`);
    }

    $("#actions").hidden = false;
    $("#editor").hidden = false;
    renderPanel();
    refreshAhead().catch(() => {});
  }

  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      state.tab = tab.dataset.tab;
      renderPanel();
    })
  );
  $("#btn-save").addEventListener("click", onSave);
  $("#btn-preview").addEventListener("click", onPreview);
  $("#btn-publish").addEventListener("click", onPublish);
  $("#btn-signout").addEventListener("click", () => {
    if (state.content && hasChanges(pendingChanges()) && !confirm("You have unsaved changes. Sign out anyway?")) return;
    state.content = null;
    signOut("Signed out.");
  });
  window.addEventListener("beforeunload", (e) => {
    if (state.content && hasChanges(pendingChanges())) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  start();
})();
