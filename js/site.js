(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.json();
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function tagMap(tags) {
    return Object.fromEntries(tags.map((t) => [t.id, t]));
  }

  function renderTags(ids, tagsById) {
    return ids
      .map((id) => tagsById[id])
      .filter(Boolean)
      .map((t) => `<span class="tag">${escapeHTML(t.label)}</span>`)
      .join("");
  }

  function setupTheme() {
    const KEY = "theme";
    const root = document.documentElement;

    const read = () => (root.getAttribute("data-theme") === "light" ? "light" : "dark");

    const apply = (theme) => {
      if (theme === "light") root.setAttribute("data-theme", "light");
      else root.removeAttribute("data-theme");
      try {
        localStorage.setItem(KEY, theme);
      } catch {
        /* ignore */
      }
      const btn = $(".theme-switch");
      if (btn) {
        btn.setAttribute(
          "aria-label",
          theme === "light" ? "Switch to dark theme" : "Switch to light theme"
        );
      }
    };

    const btn = $(".theme-switch");
    if (!btn) return;

    apply(read());
    btn.addEventListener("click", () => {
      apply(read() === "light" ? "dark" : "light");
    });
  }

  function setupNav() {
    const toggle = $(".nav-toggle");
    const nav = $("#site-nav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
    });

    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
      }
    });
  }

  function setupHeroFibonacciPulse() {
    const svg = $(".hero-fibonacci");
    if (!svg) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const layer = $(".hero-fibonacci__pulses", svg);
    const pairNodes = $$("[data-pulse-pair]", svg);
    if (!layer || !pairNodes.length) return;

    const pairs = pairNodes
      .map((node) => {
        const segs = $$(".hero-fibonacci__pulse-seg", node);
        if (segs.length < 2) return null;
        return {
          segs: segs.slice(0, 2),
          flip: node.getAttribute("data-pulse-pair") !== "together",
        };
      })
      .filter(Boolean);

    if (!pairs.length) return;

    const svgNS = "http://www.w3.org/2000/svg";
    const duration = 1350;
    const halfLen = 32.4;
    const halfWidth = 0.08;
    const samples = 22;
    const maxJobs = 2;
    const pool = [];
    const jobs = [];
    let timer = 0;
    let raf = 0;

    const acquire = () => {
      const got = [];
      for (let n = 0; n < 2; n += 1) {
        let slot = pool.find((item) => !item.inUse);
        if (!slot) {
          const el = document.createElementNS(svgNS, "path");
          el.setAttribute("class", "hero-fibonacci__pulse-ribbon");
          layer.appendChild(el);
          slot = { el, inUse: false };
          pool.push(slot);
        }
        slot.inUse = true;
        slot.el.style.opacity = "0";
        slot.el.setAttribute("d", "");
        got.push(slot);
      }
      return got;
    };

    const release = (slots) => {
      slots.forEach((slot) => {
        slot.inUse = false;
        slot.el.style.opacity = "0";
        slot.el.setAttribute("d", "");
        slot.el.removeAttribute("transform");
      });
    };

    const pathLen = (seg) => {
      if (typeof seg.getTotalLength === "function") return seg.getTotalLength();
      return Math.hypot(
        Number(seg.getAttribute("x2")) - Number(seg.getAttribute("x1")),
        Number(seg.getAttribute("y2")) - Number(seg.getAttribute("y1"))
      );
    };

    const tangent = (seg, len, dist) => {
      const pad = Math.min(1.4, len * 0.012);
      const a = seg.getPointAtLength(Math.max(0, dist - pad));
      const b = seg.getPointAtLength(Math.min(len, dist + pad));
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1;
      return { nx: -ty / tl, ny: tx / tl };
    };

    const place = (ribbon, seg, len, t) => {
      const center = t * len;
      const left = [];
      const right = [];

      for (let i = 0; i <= samples; i += 1) {
        const u = i / samples;
        const dist = center + (u - 0.5) * 2 * halfLen;
        if (dist < 0 || dist > len) continue;
        const p = seg.getPointAtLength(dist);
        const { nx, ny } = tangent(seg, len, dist);
        const pulseBell = Math.sin(Math.PI * u);
        const pathBell = Math.sin(Math.PI * (dist / len));
        const w = halfWidth * pulseBell * pathBell;
        left.push(`${p.x + nx * w},${p.y + ny * w}`);
        right.push(`${p.x - nx * w},${p.y - ny * w}`);
      }

      if (left.length < 3) {
        ribbon.style.opacity = "0";
        ribbon.setAttribute("d", "");
        return;
      }

      const parent = seg.parentNode;
      ribbon.setAttribute("transform", parent.getAttribute("transform") || "");
      ribbon.setAttribute(
        "d",
        `M ${left.join(" L ")} L ${right.reverse().join(" L ")} Z`
      );
      ribbon.style.opacity = String(Math.sin(Math.PI * t) * 0.375);
    };

    const clearAll = () => {
      window.cancelAnimationFrame(raf);
      raf = 0;
      jobs.splice(0).forEach((job) => release(job.slots));
    };

    const loop = (now) => {
      if (document.hidden) {
        clearAll();
        return;
      }
      for (let i = jobs.length - 1; i >= 0; i -= 1) {
        const job = jobs[i];
        const t = Math.min(1, (now - job.start) / duration);
        job.tracks.forEach((track, n) => {
          const local = track.reverse ? 1 - t : t;
          place(job.slots[n].el, track.seg, track.len, local);
        });
        if (t >= 1) {
          release(job.slots);
          jobs.splice(i, 1);
        }
      }
      if (jobs.length) raf = window.requestAnimationFrame(loop);
      else raf = 0;
    };

    const fire = () => {
      if (document.hidden) {
        schedule();
        return;
      }
      if (jobs.length >= maxJobs) {
        schedule();
        return;
      }

      const busy = new Set(jobs.map((job) => job.pairIndex));
      const open = pairs.map((_, i) => i).filter((i) => !busy.has(i));
      if (!open.length) {
        schedule();
        return;
      }

      const pairIndex = open[Math.floor(Math.random() * open.length)];
      const pair = pairs[pairIndex];
      const reverse = Math.random() < 0.5;
      const slots = acquire();
      jobs.push({
        pairIndex,
        slots,
        start: performance.now(),
        tracks: [
          { seg: pair.segs[0], len: pathLen(pair.segs[0]), reverse },
          {
            seg: pair.segs[1],
            len: pathLen(pair.segs[1]),
            reverse: pair.flip ? !reverse : reverse,
          },
        ],
      });

      if (!raf) raf = window.requestAnimationFrame(loop);
      schedule();
    };

    const schedule = () => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      timer = window.setTimeout(fire, 600 + Math.random() * 840);
    };

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        clearAll();
      } else {
        schedule();
      }
    });

    schedule();
  }

  function setupHeroWordmark() {
    const mark = $("#hero-wordmark");
    const hero = $(".hero");
    if (!mark || !hero) return;

    const blobs = $$(".hero-blob", mark);
    const holes = $$(".hero-hole", mark);
    const maskBg = $(".hero-mask-bg", mark);
    const baseText = $(".hero-wordmark__base", mark);
    const revealText = $(".hero-wordmark__reveal", mark);
    const grid = $(".hero-grid", hero);
    if (!blobs.length || !baseText || !revealText) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const blobRests = [
      { x: 0.12, y: 0.48, r: 0.2 },
      { x: 0.28, y: 0.44, r: 0.22 },
      { x: 0.42, y: 0.5, r: 0.24 },
      { x: 0.58, y: 0.46, r: 0.23 },
      { x: 0.72, y: 0.5, r: 0.22 },
      { x: 0.88, y: 0.48, r: 0.2 },
      { x: 0.5, y: 0.58, r: 0.17 },
    ];
    const holeRests = [
      { x: 0.33, y: 0.43, r: 0.069, rot: -14 },
      { x: 0.48, y: 0.5, r: 0.181, rot: 18 },
      { x: 0.64, y: 0.45, r: 0.1, rot: 36 },
      { x: 0.55, y: 0.58, r: 0.138, rot: -26 },
      { x: 0.39, y: 0.55, r: 0.052, rot: 48 },
      { x: 0.58, y: 0.52, r: 0.0375, rot: -8 },
      { x: 0.42, y: 0.4, r: 0.062, rot: 22 },
      { x: 0.7, y: 0.54, r: 0.078, rot: -40 },
    ];

    const layoutText = (w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      baseText.setAttribute("x", String(cx));
      baseText.setAttribute("y", String(cy));
      revealText.setAttribute("x", String(cx));
      revealText.setAttribute("y", String(cy));
    };

    const placeHole = (el, x, y, scale, rot) => {
      el.setAttribute(
        "transform",
        `translate(${x} ${y}) rotate(${rot}) scale(${Math.max(0.001, scale)})`
      );
    };

    const syncSvgSize = () => {
      const rect = hero.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      mark.setAttribute("viewBox", `0 0 ${w} ${h}`);
      mark.setAttribute("width", String(w));
      mark.setAttribute("height", String(h));
      if (maskBg) {
        maskBg.setAttribute("width", String(w));
        maskBg.setAttribute("height", String(h));
      }
      layoutText(w, h);
      return { w, h };
    };

    let size = syncSvgSize();
    new ResizeObserver(() => {
      size = syncSvgSize();
    }).observe(hero);

    const oilLayout = (spread = 0) => {
      const min = Math.min(size.w, size.h);
      // Idle: compact centered field. Active: only a modest widen for side letters.
      const idleSpan = Math.min(size.w * 0.92, min * 1.45);
      const activeSpan = Math.min(size.w * 0.92, idleSpan * 1.144);
      const span = idleSpan + (activeSpan - idleSpan) * spread;
      const left = (size.w - span) / 2;
      return {
        min,
        span,
        mapX: (nx) => left + span * nx,
        mapY: (ny) => size.h * ny,
      };
    };

    const placeStatic = () => {
      const { min, mapX, mapY } = oilLayout(0);
      blobs.forEach((el, i) => {
        const rest = blobRests[i] || blobRests[0];
        el.setAttribute("cx", String(mapX(rest.x)));
        el.setAttribute("cy", String(mapY(rest.y)));
        el.setAttribute("r", String(min * rest.r * 0.55));
      });
      holes.forEach((el, i) => {
        const rest = holeRests[i] || holeRests[0];
        placeHole(el, mapX(rest.x), mapY(rest.y), (min * rest.r * 0.55) / 30, rest.rot || 0);
      });
    };

    if (reduced) {
      placeStatic();
      mark.classList.add("is-active");
      const wind = $("#hero-wind");
      if (wind) {
        $$("animate", wind).forEach((a) => a.remove());
        const map = $("feDisplacementMap", wind);
        if (map) map.setAttribute("scale", "0");
      }
      return;
    }

    const initial = oilLayout(0);
    const blobState = blobs.map((_, i) => {
      const rest = blobRests[i] || blobRests[0];
      return {
        x: initial.mapX(rest.x),
        y: initial.mapY(rest.y),
        pack: 1,
      };
    });
    const holeState = holes.map((_, i) => {
      const rest = holeRests[i] || holeRests[0];
      return {
        x: initial.mapX(rest.x),
        y: initial.mapY(rest.y),
        close: 1,
      };
    });

    let pointerX = size.w * 0.5;
    let pointerY = size.h * 0.5;
    let smoothX = pointerX;
    let smoothY = pointerY;
    let pointerInside = false;
    let presence = 0.3;
    let idleAmount = 0.72;
    mark.classList.add("is-active");

    const followTarget = (state, restX, restY, t, phase, strength) => {
      let targetX = restX;
      let targetY = restY;

      if (pointerInside && strength > 0) {
        const dx = smoothX - restX;
        const dy = smoothY - restY;
        const dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(size.w, size.h) * 0.781;
        const influence = Math.max(0, 1 - dist / reach);
        const pull = influence * 1.08 * strength;
        targetX = restX + dx * pull;
        targetY = restY + dy * pull;
      } else if (!pointerInside) {
        targetX += Math.sin(t * 0.375 + phase) * 15;
        targetY += Math.cos(t * 0.292 + phase * 1.2) * 12;
      }

      state.x += (targetX - state.x) * 0.0675;
      state.y += (targetY - state.y) * 0.0675;
    };

    const tick = (time) => {
      const t = time * 0.001;
      const spread = 1 - idleAmount;
      const { min, mapX, mapY } = oilLayout(spread);

      // Active size: ramp linearly on enter
      const presenceTarget = pointerInside ? 0.5 : 0.3;
      presence += (presenceTarget - presence) * (pointerInside ? 0.08 : 0.06);
      idleAmount += ((pointerInside ? 0 : 0.72) - idleAmount) * (pointerInside ? 0.055 : 0.026);

      smoothX += (pointerX - smoothX) * 0.09;
      smoothY += (pointerY - smoothY) * 0.09;

      if (grid) {
        grid.style.setProperty("--gx", `${smoothX}px`);
        grid.style.setProperty("--gy", `${smoothY}px`);
        grid.style.setProperty("--grid-glow", String(pointerInside ? presence * 0.45 : 0));
      }

      const centerX = size.w * 0.5;
      const centerY = size.h * 0.48;

      blobs.forEach((el, i) => {
        const rest = blobRests[i] || blobRests[0];
        const baseX = mapX(rest.x);
        const baseY = mapY(rest.y);
        const restX = baseX + (centerX - baseX) * idleAmount;
        const restY = baseY + (centerY - baseY) * idleAmount;
        followTarget(blobState[i], restX, restY, t, i * 1.7, 1);

        let packTarget = 1;
        if (pointerInside) {
          const bd = Math.hypot(blobState[i].x - smoothX, blobState[i].y - smoothY);
          const packReach = min * 0.38;
          const near = Math.max(0, 1 - bd / packReach);
          packTarget = 1 + near * 1.458;
        }
        blobState[i].pack += (packTarget - blobState[i].pack) * 0.08;

        const pulse = 1 + Math.sin(t * 0.75 + i) * (pointerInside ? 0.03 : 0.09);
        const radius = min * rest.r * blobState[i].pack * presence * pulse;
        el.setAttribute("cx", String(blobState[i].x));
        el.setAttribute("cy", String(blobState[i].y));
        el.setAttribute("r", String(Math.max(0, radius)));
      });

      holes.forEach((el, i) => {
        const rest = holeRests[i] || holeRests[0];
        const baseX = mapX(rest.x);
        const baseY = mapY(rest.y);
        const restX = baseX + (centerX - baseX) * idleAmount;
        const restY = baseY + (centerY - baseY) * idleAmount;
        followTarget(holeState[i], restX, restY, t, i * 2.1 + 4, 0);

        let closeTarget = 1;
        if (pointerInside) {
          const hd = Math.hypot(holeState[i].x - smoothX, holeState[i].y - smoothY);
          const seal = min * 0.36;
          closeTarget = Math.min(1, Math.max(0, hd / seal));
        }
        holeState[i].close += (closeTarget - holeState[i].close) * 0.09;

        const scale = ((min * rest.r) / 30) * holeState[i].close * presence;
        placeHole(el, holeState[i].x, holeState[i].y, scale, rest.rot || 0);
      });

      requestAnimationFrame(tick);
    };

    const syncPointer = (e) => {
      const rect = hero.getBoundingClientRect();
      pointerX = e.clientX - rect.left;
      pointerY = e.clientY - rect.top;
      pointerInside = true;
    };

    hero.addEventListener("pointerenter", syncPointer);
    hero.addEventListener("pointermove", syncPointer);

    hero.addEventListener('pointerleave', () => {
      pointerInside = false;
    });

    requestAnimationFrame(tick);
  }

  function buildFilters(tags) {
    const root = $("#filters");
    if (!root) return;

    const visible = tags
      .filter((t) => t.visible)
      .sort((a, b) => a.order - b.order);

    const groups = [];
    for (const tag of visible) {
      const group = tag.group || "default";
      if (!groups.length || groups[groups.length - 1].name !== group) {
        groups.push({ name: group, tags: [tag] });
      } else {
        groups[groups.length - 1].tags.push(tag);
      }
    }

    let html = `<button type="button" class="filter-btn is-active" data-filter="all" aria-pressed="true">All</button>`;
    groups.forEach((group, index) => {
      if (index > 0) html += `<span class="filter-divider" aria-hidden="true"></span>`;
      html += group.tags
        .map(
          (t) =>
            `<button type="button" class="filter-btn" data-filter="${escapeHTML(t.id)}" aria-pressed="false">${escapeHTML(t.label)}</button>`
        )
        .join("");
    });
    root.innerHTML = html;
  }

  function buildProjects(projects, tagsById) {
    const grid = $("#project-grid");
    if (!grid) return;

    const sorted = [...projects]
      .filter((p) => p.published)
      .sort((a, b) => a.order - b.order);

    grid.innerHTML = sorted
      .map((p) => {
        const tags = renderTags(p.tags || [], tagsById);
        return `
          <button type="button" class="project-card" data-project-id="${escapeHTML(p.id)}" data-tags="${escapeHTML((p.tags || []).join(" "))}">
            <div class="project-card__media">
              <img src="${escapeHTML(p.cover)}" alt="" loading="lazy" />
            </div>
            <div class="project-card__body">
              <div class="project-card__meta">${tags}</div>
              <h3 class="project-card__title">${escapeHTML(p.title)}</h3>
              <p class="project-card__summary">${escapeHTML(p.summary)}</p>
              ${p.year ? `<span class="project-card__year">${escapeHTML(p.year)}</span>` : ""}
            </div>
          </button>
        `;
      })
      .join("");
  }

  function setupFilters() {
    const root = $("#filters");
    const grid = $("#project-grid");
    const empty = $("#work-empty");
    if (!root || !grid) return;

    root.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;

      $$(".filter-btn", root).forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-pressed", String(b === btn));
      });

      const filter = btn.dataset.filter;
      let visible = 0;
      $$(".project-card", grid).forEach((card) => {
        const tags = (card.dataset.tags || "").split(/\s+/).filter(Boolean);
        const show = filter === "all" || tags.includes(filter);
        card.classList.toggle("is-hidden", !show);
        if (show) visible += 1;
      });

      if (empty) empty.classList.toggle("is-visible", visible === 0);
    });
  }

  function videoEmbedURL(item) {
    if (item.provider === "vimeo") {
      return `https://player.vimeo.com/video/${encodeURIComponent(item.id)}?dnt=1&title=0&byline=0&portrait=0`;
    }
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.id)}?rel=0&modestbranding=1`;
  }

  function createModalController(projects, tagsById) {
    const modal = $("#project-modal");
    if (!modal) return { open() {}, close() {} };

    const dialog = $(".modal__dialog", modal);
    const stage = $("#modal-stage");
    const thumbs = $("#modal-thumbs");
    const title = $("#modal-title");
    const meta = $("#modal-meta");
    const tagsEl = $("#modal-tags");
    const desc = $("#modal-desc");
    const links = $("#modal-links");
    const closeBtn = $(".modal__close", modal);

    let activeProject = null;
    let activeIndex = 0;
    let lastFocus = null;

    const focusable = () =>
      $$("button, [href], iframe, [tabindex]:not([tabindex='-1'])", dialog).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
      );

    function renderStage(item) {
      if (item.type === "video") {
        stage.innerHTML = `
          <button type="button" class="video-facade" data-provider="${escapeHTML(item.provider)}" data-id="${escapeHTML(item.id)}" aria-label="Play video">
            <img src="${escapeHTML(item.poster || activeProject.cover)}" alt="${escapeHTML(item.alt || "")}" />
            <span class="video-facade__play" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </span>
          </button>
        `;
        $(".video-facade", stage).addEventListener("click", () => {
          stage.innerHTML = `<iframe src="${videoEmbedURL(item)}" title="${escapeHTML(item.alt || "Video")}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
        });
        return;
      }

      stage.innerHTML = `<img src="${escapeHTML(item.src)}" alt="${escapeHTML(item.alt || "")}" />`;
    }

    function renderThumbs(gallery) {
      thumbs.innerHTML = gallery
        .map(
          (item, i) => `
          <button type="button" class="modal__thumb${i === activeIndex ? " is-active" : ""}" data-index="${i}" data-type="${escapeHTML(item.type)}" aria-label="Show gallery item ${i + 1}">
            <img src="${escapeHTML(item.type === "video" ? item.poster || activeProject.cover : item.src)}" alt="" />
          </button>
        `
        )
        .join("");
    }

    function setIndex(index) {
      const gallery = activeProject.gallery || [];
      if (!gallery.length) return;
      activeIndex = (index + gallery.length) % gallery.length;
      renderStage(gallery[activeIndex]);
      $$(".modal__thumb", thumbs).forEach((btn, i) => {
        btn.classList.toggle("is-active", i === activeIndex);
      });
    }

    function open(projectId) {
      const project = projects.find((p) => p.id === projectId && p.published);
      if (!project) return;

      lastFocus = document.activeElement;
      activeProject = project;
      activeIndex = 0;

      title.textContent = project.title;
      tagsEl.innerHTML = renderTags(project.tags || [], tagsById);

      const bits = [];
      if (project.year) bits.push(`<span><strong>Year</strong> ${escapeHTML(project.year)}</span>`);
      if (project.role) bits.push(`<span><strong>Role</strong> ${escapeHTML(project.role)}</span>`);
      if (project.tools?.length) bits.push(`<span><strong>Tools</strong> ${escapeHTML(project.tools.join(", "))}</span>`);
      meta.innerHTML = bits.join("");

      desc.textContent = project.description || "";

      links.innerHTML = (project.links || [])
        .map(
          (l) =>
            `<a class="btn" href="${escapeHTML(l.url)}" target="_blank" rel="noopener noreferrer">↳ ${escapeHTML(l.label)}</a>`
        )
        .join("");

      const gallery = project.gallery?.length
        ? project.gallery
        : [{ type: "image", src: project.cover, alt: project.title }];

      activeProject = { ...project, gallery };
      renderThumbs(gallery);
      renderStage(gallery[0]);

      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("is-locked");
      history.replaceState(null, "", `#${project.id}`);
      closeBtn.focus();
    }

    function close() {
      if (!modal.classList.contains("is-open")) return;
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("is-locked");
      stage.innerHTML = "";
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
      activeProject = null;
    }

    thumbs.addEventListener("click", (e) => {
      const btn = e.target.closest(".modal__thumb");
      if (!btn) return;
      setIndex(Number(btn.dataset.index));
    });

    closeBtn.addEventListener("click", close);
    $(".modal__backdrop", modal).addEventListener("click", close);

    document.addEventListener("keydown", (e) => {
      if (!modal.classList.contains("is-open")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex(activeIndex + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex(activeIndex - 1);
      } else if (e.key === "Tab") {
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    return { open, close };
  }

  function fillSiteCopy(site) {
    const brandEls = $$("[data-bind='brand']");
    brandEls.forEach((el) => {
      el.innerHTML = `${escapeHTML(site.brand)} <span class="brand__label">— PORTFOLIO</span>`;
    });

    const setText = (key, value) => {
      $$(`[data-bind='${key}']`).forEach((el) => {
        el.textContent = value || "";
      });
    };

    setText("role", site.role);
    setText("hero-title", site.hero?.title);
    setText("hero-text", site.hero?.text);
    setText("about", site.about);

    $$("[data-bind='portrait']").forEach((el) => {
      if (site.portrait) {
        el.src = site.portrait;
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });

    $$("[data-bind='cv']").forEach((el) => {
      if (site.cv) {
        el.href = site.cv;
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });

    $$("[data-bind='email']").forEach((el) => {
      const email = site.contact?.email || "";
      if (el.tagName === "A") {
        el.href = `mailto:${email}`;
        el.textContent = email;
      } else {
        el.textContent = email;
      }
    });

    $$("[data-bind='year']").forEach((el) => {
      el.textContent = String(new Date().getFullYear());
    });

    const map = {
      github: site.social?.github,
      linkedin: site.social?.linkedin,
      instagram: site.social?.instagram,
      photography: site.social?.photography,
      artstation: site.social?.artstation,
      behance: site.social?.behance,
    };

    Object.entries(map).forEach(([key, url]) => {
      $$(`[data-social='${key}']`).forEach((el) => {
        if (url) {
          el.href = url;
          el.hidden = false;
        } else {
          el.hidden = true;
        }
      });
    });

    renderSkills(site.skills || []);
  }

  const SKILL_ICONS = {
    unreal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/></svg>',
    "ai-dev": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
    "ai-content": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="m18 14 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/></svg>',
    blender: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)"/></svg>',
    substance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 17c4-8 6-11 8-11s2 5 8 11"/><path d="M8 17h8"/><circle cx="12" cy="7" r="2"/></svg>',
    git: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M6 8.2v7.6M8.2 18h7.6M7.6 7.6 16 16"/></svg>',
    photoshop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 16V8h2.4c1.6 0 2.6.9 2.6 2.3S12 12.6 10.4 12.6H8"/></svg>',
    premiere: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9z"/></svg>',
    lightroom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M12 5v2M12 17v2M5 12h2M17 12h2M7.05 7.05l1.4 1.4M15.55 15.55l1.4 1.4M16.95 7.05l-1.4 1.4M8.45 15.55l-1.4 1.4"/></svg>',
  };

  function skillIcon(id) {
    return SKILL_ICONS[id] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="8"/></svg>';
  }

  function renderSkills(skills) {
    const root = $("#skills-list");
    if (!root) return;

    if (!skills.length) {
      root.innerHTML = "";
      return;
    }

    root.innerHTML = skills
      .map((skill) => {
        const level = Math.max(0, Math.min(100, Number(skill.level) || 0));
        const id = skill.id || skill.name.toLowerCase().replace(/\s+/g, "-");
        return `
          <div class="skill">
            <div class="skill__label">
              <span class="skill__icon" aria-hidden="true">${skillIcon(id)}</span>
              <span>${escapeHTML(skill.name)}</span>
            </div>
            <div class="skill__track" role="meter" aria-label="${escapeHTML(skill.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${level}">
              <div class="skill__fill" data-level="${level}"></div>
            </div>
          </div>
        `;
      })
      .join("");

    const fills = $$(".skill__fill", root);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      fills.forEach((fill) => {
        fill.style.width = `${fill.dataset.level}%`;
      });
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          fills.forEach((fill) => {
            fill.style.width = `${fill.dataset.level}%`;
          });
          io.disconnect();
        });
      },
      { threshold: 0.25 }
    );
    io.observe(root);
  }

  function buildFreebies(freebies) {
    const grid = $("#freebie-grid");
    if (!grid) return;

    const items = [...freebies]
      .filter((f) => f.published)
      .sort((a, b) => a.order - b.order);

    if (!items.length) {
      grid.innerHTML = `<p class="prose">Nothing here yet — check back when spare time restocks.</p>`;
      return;
    }

    grid.innerHTML = items
      .map(
        (f) => `
        <article class="freebie-card">
          <div class="freebie-card__media">
            <img src="${escapeHTML(f.image)}" alt="" loading="lazy" />
          </div>
          <div class="freebie-card__body">
            <h2 class="freebie-card__title">${escapeHTML(f.title)}</h2>
            <p class="freebie-card__desc">${escapeHTML(f.description)}</p>
            <a class="btn" href="${escapeHTML(f.url)}" target="_blank" rel="noopener noreferrer">↳ Get freebie</a>
          </div>
        </article>
      `
      )
      .join("");
  }

  function setupSiteSlime() {
    if (!window.matchMedia("(pointer: fine)").matches) return null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.classList.add("site-slime");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = `
      <defs>
        <linearGradient id="site-slime-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2a3a9a"/>
          <stop offset="55%" stop-color="#3d52c4"/>
          <stop offset="100%" stop-color="#5a78ff"/>
        </linearGradient>
        <filter id="site-slime-goo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>
          <feColorMatrix in="blur" mode="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 0 0 18 -8" result="goo"/>
        </filter>
        <mask id="site-slime-mask" maskUnits="userSpaceOnUse">
          <rect class="site-slime-mask-bg" fill="white"/>
          <g class="site-slime-cutouts"></g>
        </mask>
      </defs>
      <g class="site-slime__mass" filter="url(#site-slime-goo)" mask="url(#site-slime-mask)">
        <circle class="site-slime__cursor" cx="-100" cy="-100" r="0" fill="url(#site-slime-grad)"/>
      </g>
    `;
    document.body.appendChild(svg);

    const mass = $(".site-slime__mass", svg);
    const cursorEl = $(".site-slime__cursor", svg);
    const maskBg = $(".site-slime-mask-bg", svg);
    const cutoutRoot = $(".site-slime-cutouts", svg);
    const modal = $("#project-modal");

    let pointerX = window.innerWidth * 0.5;
    let pointerY = window.innerHeight * 0.5;
    let smoothX = pointerX;
    let smoothY = pointerY;
    let pointerInside = false;
    let presence = 0;
    /** @type {{ el: Element, body: SVGElement, amount: number }[]} */
    let binders = [];

    /** @type {{ el: Element, rect: SVGElement }[]} */
    let cutouts = [];

    const MERGE_DIST = 56;
    const CARD_RX = 12;
    const CARD_CUTOUT_INSET = 9;
    const CARD_SELECTOR = ".project-card, .freebie-card";
    const SLIME_TARGETS =
      `${CARD_SELECTOR}, .filter-btn, .btn, .icon-btn, .nav-toggle, .modal__close`;

    const syncMaskSize = () => {
      const w = Math.max(1, document.documentElement.clientWidth);
      const h = Math.max(1, document.documentElement.clientHeight);
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      if (maskBg) {
        maskBg.setAttribute("x", "0");
        maskBg.setAttribute("y", "0");
        maskBg.setAttribute("width", String(w));
        maskBg.setAttribute("height", String(h));
      }
    };

    const makeCutout = () => {
      const r = document.createElementNS(svgNS, "rect");
      r.setAttribute("fill", "black");
      cutoutRoot.appendChild(r);
      return r;
    };

    const readCornerRadius = (el, box) => {
      const px = parseFloat(getComputedStyle(el).borderRadius) || CARD_RX;
      return Math.min(px, box.width * 0.5, box.height * 0.5);
    };

    const refreshCutouts = () => {
      cutouts.forEach((c) => c.rect.remove());
      cutouts = $$(CARD_SELECTOR).map((el) => ({
        el,
        rect: makeCutout(),
      }));
    };

    const updateCutouts = () => {
      cutouts.forEach(({ el, rect }) => {
        if (el.classList.contains("is-hidden")) {
          rect.setAttribute("width", "0");
          rect.setAttribute("height", "0");
          return;
        }
        const box = el.getBoundingClientRect();
        if (box.width < 8 || box.height < 8) {
          rect.setAttribute("width", "0");
          rect.setAttribute("height", "0");
          return;
        }
        const fullRx = readCornerRadius(el, box);
        const inset = CARD_CUTOUT_INSET;
        const cutW = Math.round(box.width) - inset * 2;
        const cutH = Math.round(box.height) - inset * 2;
        if (cutW < 4 || cutH < 4) {
          rect.setAttribute("width", "0");
          rect.setAttribute("height", "0");
          return;
        }
        const cutRx = Math.max(0, fullRx - inset);
        // Inset cutout — concentric with card corners
        rect.setAttribute("x", String(Math.round(box.left) + inset));
        rect.setAttribute("y", String(Math.round(box.top) + inset));
        rect.setAttribute("width", String(cutW));
        rect.setAttribute("height", String(cutH));
        rect.setAttribute("rx", String(cutRx));
        rect.setAttribute("ry", String(cutRx));
      });
    };

    const makeRect = () => {
      const r = document.createElementNS(svgNS, "rect");
      r.setAttribute("fill", "url(#site-slime-grad)");
      r.setAttribute("rx", String(CARD_RX));
      r.setAttribute("ry", String(CARD_RX));
      r.setAttribute("width", "0");
      r.setAttribute("height", "0");
      mass.appendChild(r);
      return r;
    };

    const refresh = () => {
      binders.forEach((b) => b.body.remove());
      binders = $$(SLIME_TARGETS).map((el) => ({
        el,
        body: makeRect(),
        amount: 0,
      }));
      refreshCutouts();
    };

    const distToRect = (px, py, rect) => {
      const cx = Math.max(rect.left, Math.min(px, rect.right));
      const cy = Math.max(rect.top, Math.min(py, rect.bottom));
      return Math.hypot(px - cx, py - cy);
    };

    const tick = () => {
      syncMaskSize();
      const modalOpen = modal?.classList.contains("is-open");
      presence += ((pointerInside && !modalOpen ? 1 : 0) - presence) * 0.12;
      smoothX += (pointerX - smoothX) * 0.18;
      smoothY += (pointerY - smoothY) * 0.18;

      let nearBoost = 0;

      binders.forEach((b) => {
        const rect = b.el.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8 || b.el.classList.contains("is-hidden")) {
          b.amount += (0 - b.amount) * 0.18;
        } else {
          const d = distToRect(smoothX, smoothY, rect);
          // Smaller targets (pills) need a tighter reach than cards
          const isCard = b.el.matches(".project-card, .freebie-card");
          const reach = isCard ? MERGE_DIST : Math.min(MERGE_DIST, 36);
          const target = modalOpen ? 0 : Math.max(0, 1 - d / reach) ** 1.8;
          b.amount += (target - b.amount) * 0.14;
          nearBoost = Math.max(nearBoost, b.amount);
        }

        const a = b.amount;
        if (a < 0.01) {
          b.body.setAttribute("width", "0");
          b.body.setAttribute("height", "0");
          return;
        }

        const isCard = b.el.matches(CARD_SELECTOR);
        const pad = isCard ? 2.5 + a * 3.8 : 0.5 + a * 1.1;
        const cornerRx = readCornerRadius(b.el, rect);

        if (isCard) {
          // Concentric outer rect — outer radius = card radius + pad
          const outerRx = cornerRx + pad;
          b.body.setAttribute("fill", "url(#site-slime-grad)");
          b.body.setAttribute("stroke", "none");
          b.body.setAttribute("x", String(rect.left - pad));
          b.body.setAttribute("y", String(rect.top - pad));
          b.body.setAttribute("width", String(rect.width + pad * 2));
          b.body.setAttribute("height", String(rect.height + pad * 2));
          b.body.setAttribute("rx", String(outerRx));
          b.body.setAttribute("ry", String(outerRx));
          b.body.setAttribute("opacity", String(0.55 + a * 0.38));
          return;
        }

        b.body.setAttribute("fill", "url(#site-slime-grad)");
        b.body.setAttribute("stroke", "none");
        const rx = Math.min(
          cornerRx + pad,
          (rect.width + pad * 2) * 0.5,
          (rect.height + pad * 2) * 0.5
        );
        b.body.setAttribute("x", String(rect.left - pad));
        b.body.setAttribute("y", String(rect.top - pad));
        b.body.setAttribute("width", String(rect.width + pad * 2));
        b.body.setAttribute("height", String(rect.height + pad * 2));
        b.body.setAttribute("rx", String(rx));
        b.body.setAttribute("ry", String(rx));
        b.body.setAttribute("opacity", String(0.5 + a * 0.35));
      });

      updateCutouts();

      const cursorR = presence * (11 + nearBoost * 6);
      cursorEl.setAttribute("cx", String(smoothX));
      cursorEl.setAttribute("cy", String(smoothY));
      cursorEl.setAttribute("r", String(Math.max(0, cursorR)));
      cursorEl.setAttribute("opacity", String(0.65 + presence * 0.35));

      svg.classList.toggle("is-active", presence > 0.04);
      requestAnimationFrame(tick);
    };

    window.addEventListener(
      "pointermove",
      (e) => {
        pointerX = e.clientX;
        pointerY = e.clientY;
        pointerInside = true;
      },
      { passive: true }
    );

    window.addEventListener("pointerleave", () => {
      pointerInside = false;
    });

    document.documentElement.addEventListener("mouseleave", () => {
      pointerInside = false;
    });

    refresh();
    syncMaskSize();
    window.addEventListener("resize", syncMaskSize);
    requestAnimationFrame(tick);

    return { refresh };
  }

  async function initHome(slime) {
    const [site, tags, projects] = await Promise.all([
      loadJSON("content/site.json"),
      loadJSON("content/tags.json"),
      loadJSON("content/projects.json"),
    ]);

    const tagsById = tagMap(tags);
    fillSiteCopy(site);
    buildFilters(tags);
    buildProjects(projects, tagsById);
    setupFilters();
    setupHeroWordmark();
    setupHeroFibonacciPulse();
    slime?.refresh();

    const modal = createModalController(projects, tagsById);

    $("#project-grid")?.addEventListener("click", (e) => {
      const card = e.target.closest(".project-card");
      if (card) modal.open(card.dataset.projectId);
    });

    const hash = location.hash.replace(/^#/, "");
    if (hash) modal.open(hash);

    window.addEventListener("hashchange", () => {
      const id = location.hash.replace(/^#/, "");
      if (id) modal.open(id);
      else modal.close();
    });
  }

  async function initFreebies(slime) {
    const [site, freebies] = await Promise.all([
      loadJSON("content/site.json"),
      loadJSON("content/freebies.json"),
    ]);
    fillSiteCopy(site);
    buildFreebies(freebies);
    slime?.refresh();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupNav();
    setupTheme();
    const slime = setupSiteSlime();
    const page = document.body.dataset.page;
    if (page === "home") initHome(slime).catch(console.error);
    if (page === "freebies") initFreebies(slime).catch(console.error);
  });
})();
