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

  function renderCardMetaTags(ids, tagsById) {
    const labels = (ids || [])
      .map((id) => tagsById[id])
      .filter((t) => t && t.group !== "scale")
      .map((t) => escapeHTML(t.label));
    if (!labels.length) return "";
    return labels.join('<span class="project-card__sep" aria-hidden="true"> · </span>');
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

  function createStringPluck(svg, host, options = {}) {
    if (!svg || !host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const {
      pulseSelector = ".hero-fibonacci__pulses",
      stringSelector = ".hero-fibonacci__string",
      pulseClass = "hero-fibonacci__pulse-ribbon",
      pulseFill = "",
      skipTransformParents = ["hero-fibonacci__strings"],
      halfWidth = 0.08,
      packetHalf = 28,
      maxTravel = 72,
      hitPx = 22,
      slidePx = 11,
      sampleStep = 3.5,
      fadePeak = 0.375,
      wobblePeak = 0.55,
    } = options;

    const layer = $(pulseSelector, svg);
    const segs = $$(stringSelector, svg);
    if (!layer || !segs.length) return;

    const svgNS = "http://www.w3.org/2000/svg";
    const duration = 920;
    const samples = 18;
    const maxJobs = 8;
    const pool = [];
    const jobs = [];
    const strings = [];
    let raf = 0;
    let lastHit = null;

    const acquire = () => {
      const got = [];
      for (let n = 0; n < 2; n += 1) {
        let slot = pool.find((item) => !item.inUse);
        if (!slot) {
          const el = document.createElementNS(svgNS, "path");
          el.setAttribute("class", pulseClass);
          if (pulseFill) el.setAttribute("fill", pulseFill);
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

    const toSvg = (seg, x, y) => {
      const pt = svg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      const pathCtm = seg.getScreenCTM();
      const svgCtm = svg.getScreenCTM();
      if (!pathCtm || !svgCtm) return { x, y };
      return pt.matrixTransform(svgCtm.inverse().multiply(pathCtm));
    };

    const clientToSvg = (clientX, clientY) => {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      return pt.matrixTransform(ctm.inverse());
    };

    const wrapDist = (d, len) => {
      let x = d % len;
      if (x < 0) x += len;
      return x;
    };

    const sampleString = (seg) => {
      const len = pathLen(seg);
      const closed = seg.getAttribute("data-closed") === "1";
      const n = Math.max(28, Math.ceil(len / sampleStep));
      const pts = [];
      for (let i = 0; i <= n; i += 1) {
        const d = (i / n) * len;
        const p = seg.getPointAtLength(Math.min(len, d));
        const q = toSvg(seg, p.x, p.y);
        pts.push({ d, x: q.x, y: q.y });
      }
      return { seg, len, closed, pts };
    };

    const rebuild = () => {
      strings.length = 0;
      segs.forEach((seg) => strings.push(sampleString(seg)));
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

    const placePacket = (ribbon, string, center, opacity, wobble) => {
      const { seg, len, closed } = string;
      const left = [];
      const right = [];

      for (let i = 0; i <= samples; i += 1) {
        const u = i / samples;
        let dist = center + (u - 0.5) * 2 * packetHalf;
        if (closed) dist = wrapDist(dist, len);
        else if (dist < 0 || dist > len) continue;
        const p = seg.getPointAtLength(dist);
        const { nx, ny } = tangent(seg, len, dist);
        const pulseBell = Math.sin(Math.PI * u);
        const w = halfWidth * pulseBell;
        const ox = nx * wobble * pulseBell;
        const oy = ny * wobble * pulseBell;
        left.push(`${p.x + nx * w + ox},${p.y + ny * w + oy}`);
        right.push(`${p.x - nx * w + ox},${p.y - ny * w + oy}`);
      }

      if (left.length < 3) {
        ribbon.style.opacity = "0";
        ribbon.setAttribute("d", "");
        return;
      }

      const parent = seg.parentNode;
      const skip = skipTransformParents.some((cls) => parent.classList.contains(cls));
      const xf = skip ? "" : parent.getAttribute("transform") || "";
      ribbon.setAttribute("transform", xf);
      ribbon.setAttribute(
        "d",
        `M ${left.join(" L ")} L ${right.slice().reverse().join(" L ")} Z`
      );
      ribbon.style.opacity = String(opacity);
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
        const ease = 1 - (1 - t) ** 3;
        const fade = (1 - t) ** 2 * fadePeak;
        const wobble = (1 - t) ** 2 * wobblePeak * Math.sin(t * Math.PI * 2.2);
        const travel = ease * job.travel;
        placePacket(job.slots[0].el, job.string, job.origin + travel, fade, wobble);
        placePacket(job.slots[1].el, job.string, job.origin - travel, fade, -wobble);
        if (t >= 1) {
          release(job.slots);
          jobs.splice(i, 1);
        }
      }
      if (jobs.length) raf = window.requestAnimationFrame(loop);
      else raf = 0;
    };

    const pluck = (string, origin) => {
      if (jobs.length >= maxJobs) {
        const old = jobs.shift();
        release(old.slots);
      }
      const slots = acquire();
      jobs.push({
        string,
        origin,
        travel: Math.min(string.len * 0.48, maxTravel),
        slots,
        start: performance.now(),
      });
      if (!raf) raf = window.requestAnimationFrame(loop);
    };

    const nearest = (x, y, threshSq) => {
      let best = null;
      let bestD = threshSq;
      strings.forEach((string) => {
        string.pts.forEach((pt) => {
          const dx = pt.x - x;
          const dy = pt.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD) {
            bestD = d2;
            best = { string, d: pt.d };
          }
        });
      });
      return best;
    };

    const onMove = (e) => {
      const p = clientToSvg(e.clientX, e.clientY);
      if (!p) return;
      const ctm = svg.getScreenCTM();
      const unit = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
      const thresh = hitPx / unit;
      const hit = nearest(p.x, p.y, thresh * thresh);
      const now = performance.now();
      if (!hit) {
        lastHit = null;
        return;
      }
      const isNew = !lastHit || lastHit.seg !== hit.string.seg;
      const slid = lastHit && Math.abs(hit.d - lastHit.d) > slidePx;
      const cooled = !lastHit || now - lastHit.time > 140;
      if (isNew || (slid && cooled)) {
        pluck(hit.string, hit.d);
        lastHit = { seg: hit.string.seg, d: hit.d, time: now };
      } else if (lastHit) {
        lastHit.d = hit.d;
      }
    };

    rebuild();
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", () => {
      lastHit = null;
    });
    window.addEventListener("resize", rebuild);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearAll();
    });
  }

  function setupHeroFibonacciStrings() {
    createStringPluck($(".hero-fibonacci"), $(".hero"));
  }

  function setupSectionHeadGrids() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    $$(".section__head").forEach((head) => {
      let grid = $(".section-head-grid", head);
      if (!grid) {
        grid = document.createElement("div");
        grid.className = "section-head-grid";
        grid.setAttribute("aria-hidden", "true");
        head.prepend(grid);
      }

      let smoothX = 0;
      let smoothY = 0;
      let pointerX = 0;
      let pointerY = 0;
      let pointerInside = false;
      let presence = 0;
      let raf = 0;

      const tick = () => {
        smoothX += (pointerX - smoothX) * 0.12;
        smoothY += (pointerY - smoothY) * 0.12;
        presence += ((pointerInside ? 0.5 : 0) - presence) * (pointerInside ? 0.08 : 0.06);

        grid.style.setProperty("--gx", `${smoothX}px`);
        grid.style.setProperty("--gy", `${smoothY}px`);
        grid.style.setProperty("--grid-glow", String(pointerInside ? presence * 0.45 : 0));

        if (pointerInside || presence > 0.01) raf = window.requestAnimationFrame(tick);
        else raf = 0;
      };

      const onMove = (e) => {
        const rect = head.getBoundingClientRect();
        pointerX = e.clientX - rect.left;
        pointerY = e.clientY - rect.top;
        pointerInside = true;
        if (!raf) raf = window.requestAnimationFrame(tick);
      };

      const onLeave = () => {
        pointerInside = false;
        if (!raf) raf = window.requestAnimationFrame(tick);
      };

      head.addEventListener("pointerenter", onMove);
      head.addEventListener("pointermove", onMove);
      head.addEventListener("pointerleave", onLeave);
    });
  }

  function setupHeroWordmark() {
    const mark = $("#hero-wordmark");
    const hero = $(".hero");
    if (!mark || !hero) return;

    const blobs = $$(".hero-blob", mark);
    const holes = $$(".hero-hole", mark);
    const maskBg = $(".hero-mask-bg", mark);
    const baseText = $(".hero-wordmark__base", mark);
    const revealTexts = $$(".hero-wordmark__reveal", mark);
    const grid = $(".hero-grid", hero);
    if (!blobs.length || !baseText || !revealTexts.length) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let parallaxBase = 0;
    let parallaxOil = 0;
    let parallaxScaleBase = 1;
    let parallaxScaleOil = 1;

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
      const place = (el, dy, scale) => {
        el.setAttribute("x", String(cx));
        el.setAttribute("y", String(cy));
        el.setAttribute(
          "transform",
          `translate(0 ${dy.toFixed(2)}) translate(${cx} ${cy}) scale(${scale.toFixed(4)}) translate(${-cx} ${-cy})`
        );
      };
      place(baseText, parallaxBase, parallaxScaleBase);
      revealTexts.forEach((el) => place(el, parallaxOil, parallaxScaleOil));
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

    const updateParallax = () => {
      const fib = $(".hero-fibonacci", hero);
      if (reduced) {
        parallaxBase = 0;
        parallaxOil = 0;
        parallaxScaleBase = 1;
        parallaxScaleOil = 1;
        if (fib) fib.style.transform = "";
        return;
      }
      // Both drift up with scroll; oil/accent leads, outline trails behind.
      const scrolled = Math.max(0, -hero.getBoundingClientRect().top);
      const progress = Math.min(1, scrolled / Math.max(1, size.h));
      const targetBase = scrolled * -0.12;
      const targetOil = scrolled * -0.28;
      const targetScaleBase = 1 - progress * 0.1;
      const targetScaleOil = 1 - progress * 0.16;
      // Ease parallax so outline/oil don't hitch on scroll sampling.
      parallaxBase += (targetBase - parallaxBase) * 0.18;
      parallaxOil += (targetOil - parallaxOil) * 0.18;
      parallaxScaleBase += (targetScaleBase - parallaxScaleBase) * 0.18;
      parallaxScaleOil += (targetScaleOil - parallaxScaleOil) * 0.18;
      if (fib) {
        const fibScale = 1 + progress * 0.14;
        const current = Number.parseFloat(fib.dataset.parallaxScale || "1");
        const next = current + (fibScale - current) * 0.18;
        fib.dataset.parallaxScale = String(next);
        fib.style.transform = `scale(${next.toFixed(4)})`;
      }
    };

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
      const cx = size.w * 0.5;
      const cy = size.h * 0.5;
      const s = parallaxScaleOil;
      return {
        min,
        span,
        mapX: (nx) => {
          const x = left + span * nx;
          return cx + (x - cx) * s;
        },
        mapY: (ny) => {
          const y = size.h * ny;
          return cy + (y - cy) * s + parallaxOil;
        },
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
      updateParallax();
      layoutText(size.w, size.h);
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
      const centerY = size.h * 0.48 * parallaxScaleOil + size.h * 0.5 * (1 - parallaxScaleOil) + parallaxOil;

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
        const radius = min * rest.r * blobState[i].pack * presence * pulse * parallaxScaleOil;
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

        const scale = ((min * rest.r) / 30) * holeState[i].close * presence * parallaxScaleOil;
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
        const tags = renderCardMetaTags(p.tags || [], tagsById);
        const year = p.year ? String(p.year) : "";
        return `
          <button type="button" class="project-card" data-project-id="${escapeHTML(p.id)}" data-tags="${escapeHTML((p.tags || []).join(" "))}">
            <div class="project-card__media">
              <img src="${escapeHTML(p.cover)}" alt="" loading="lazy" />
            </div>
            <div class="project-card__body">
              <div class="project-card__head">
                <div class="project-card__meta">${tags}</div>
                ${year ? `<span class="project-card__year">${escapeHTML(year)}</span>` : ""}
              </div>
              <h3 class="project-card__title">${escapeHTML(p.title)}</h3>
              <p class="project-card__summary">${escapeHTML(p.summary)}</p>
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
      el.textContent = site.brand || "";
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
    const aiTitle = site.ai?.title || "AI";
    const aiEmphasis = site.ai?.titleEmphasis;
    $$(`[data-bind='ai-title']`).forEach((el) => {
      if (aiEmphasis && aiTitle.includes(aiEmphasis)) {
        const idx = aiTitle.indexOf(aiEmphasis);
        el.innerHTML =
          `${escapeHTML(aiTitle.slice(0, idx))}<em>${escapeHTML(aiEmphasis)}</em>${escapeHTML(aiTitle.slice(idx + aiEmphasis.length))}`;
      } else {
        el.textContent = aiTitle;
      }
    });
    setText("ai-lede", site.ai?.lede);
    setText("ai-text", site.ai?.text);
    renderAiItems(site.ai?.items || []);

    $$("[data-bind='portrait']").forEach((el) => {
      if (site.portrait) {
        el.src = site.portrait;
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
    "substance-painter": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 17c4-8 6-11 8-11s2 5 8 11"/><path d="M8 17h8"/><circle cx="12" cy="7" r="2"/></svg>',
    "substance-designer": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16l3-8 3 5 2-3"/></svg>',
    git: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M6 8.2v7.6M8.2 18h7.6M7.6 7.6 16 16"/></svg>',
    photoshop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 16V8h2.4c1.6 0 2.6.9 2.6 2.3S12 12.6 10.4 12.6H8"/></svg>',
    premiere: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9z"/></svg>',
    lightroom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M12 5v2M12 17v2M5 12h2M17 12h2M7.05 7.05l1.4 1.4M15.55 15.55l1.4 1.4M16.95 7.05l-1.4 1.4M8.45 15.55l-1.4 1.4"/></svg>',
  };

  function skillIcon(id) {
    return SKILL_ICONS[id] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="8"/></svg>';
  }

  function renderAiItems(items) {
    const root = $("#ai-list");
    if (!root) return;

    if (!items.length) {
      root.innerHTML = "";
      return;
    }

    root.innerHTML = items
      .map(
        (item) => `
          <div class="ai-item">
            <h3 class="ai-item__title">${escapeHTML(item.title || "")}</h3>
            <p class="ai-item__text">${escapeHTML(item.text || "")}</p>
          </div>
        `
      )
      .join("");
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
        const score = Math.max(0, Math.min(10, Number(skill.level) || 0));
        const percent = score * 10;
        const id = skill.id || skill.name.toLowerCase().replace(/\s+/g, "-");
        return `
          <div class="skill">
            <div class="skill__label">
              <span class="skill__icon" aria-hidden="true">${skillIcon(id)}</span>
              <span>${escapeHTML(skill.name)}</span>
            </div>
            <div class="skill__track" role="meter" aria-label="${escapeHTML(skill.name)}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${score}">
              <div class="skill__fill" data-level="${percent}"></div>
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

  function setupSiteSlime() {
    if (!window.matchMedia("(pointer: fine)").matches) return null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.classList.add("site-slime");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = `
      <defs>
        <linearGradient id="site-slime-grad" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3558e6"/>
          <stop offset="35%" stop-color="#1a3cbe"/>
          <stop offset="70%" stop-color="#0e2a96"/>
          <stop offset="100%" stop-color="#091650"/>
        </linearGradient>
        <filter id="site-slime-goo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>
          <feColorMatrix in="blur" mode="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 0 0 18 -8" result="goo"/>
        </filter>
      </defs>
      <g class="site-slime__mass" filter="url(#site-slime-goo)">
        <circle class="site-slime__cursor" cx="-100" cy="-100" r="0" fill="url(#site-slime-grad)"/>
      </g>
    `;
    document.body.appendChild(svg);

    const mass = $(".site-slime__mass", svg);
    const cursorEl = $(".site-slime__cursor", svg);
    const defs = $("defs", svg);
    const modal = $("#project-modal");

    let pointerX = window.innerWidth * 0.5;
    let pointerY = window.innerHeight * 0.5;
    let smoothX = pointerX;
    let smoothY = pointerY;
    let pointerInside = false;
    let presence = 0;
    let binderSeq = 0;
    /** @type {{ el: Element, body: SVGElement, clip: SVGCircleElement, clipPath: SVGClipPathElement, group: SVGGElement, amount: number, hx: number, hy: number }[]} */
    let binders = [];

    const MERGE_DIST_CARD = 38;
    const MERGE_DIST_UI = 24;
    const CARD_RX = 12;
    const CARD_SELECTOR = ".project-card__media";
    const FOOTER_ICON_SELECTOR = ".footer-icon";
    const SKILL_FILL_SELECTOR = ".skill__fill";
    const SLIME_TARGETS =
      `${CARD_SELECTOR}, ${FOOTER_ICON_SELECTOR}, ${SKILL_FILL_SELECTOR}, .nav > a, .filter-btn, .btn, .icon-btn, .nav-toggle, .modal__close`;

    const syncSize = () => {
      const w = Math.max(1, document.documentElement.clientWidth);
      const h = Math.max(1, document.documentElement.clientHeight);
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
    };

    const readCornerRadius = (el, box) => {
      const px = parseFloat(getComputedStyle(el).borderRadius) || CARD_RX;
      return Math.min(px, box.width * 0.5, box.height * 0.5);
    };

    const makeBinder = () => {
      const id = `site-slime-clip-${binderSeq++}`;
      const clipPath = document.createElementNS(svgNS, "clipPath");
      clipPath.setAttribute("id", id);
      clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
      const clip = document.createElementNS(svgNS, "circle");
      clip.setAttribute("r", "0");
      clipPath.appendChild(clip);
      defs.appendChild(clipPath);

      const group = document.createElementNS(svgNS, "g");
      group.setAttribute("clip-path", `url(#${id})`);
      const body = document.createElementNS(svgNS, "rect");
      body.setAttribute("fill", "url(#site-slime-grad)");
      body.setAttribute("width", "0");
      body.setAttribute("height", "0");
      group.appendChild(body);
      mass.appendChild(group);
      return { body, clip, clipPath, group };
    };

    const refresh = () => {
      binders.forEach((b) => {
        b.group.remove();
        b.clipPath.remove();
      });
      binders = $$(SLIME_TARGETS).map((el) => {
        const parts = makeBinder();
        return {
          el,
          ...parts,
          amount: 0,
          hx: 0,
          hy: 0,
        };
      });
    };

    const nearestOnRect = (px, py, rect) => ({
      x: Math.max(rect.left, Math.min(px, rect.right)),
      y: Math.max(rect.top, Math.min(py, rect.bottom)),
    });

    const tick = () => {
      syncSize();
      const modalOpen = modal?.classList.contains("is-open");
      presence += ((pointerInside && !modalOpen ? 1 : 0) - presence) * 0.12;
      smoothX += (pointerX - smoothX) * 0.18;
      smoothY += (pointerY - smoothY) * 0.18;

      let nearBoost = 0;

      binders.forEach((b) => {
        const rect = b.el.getBoundingClientRect();
        if (
          rect.width < 4 ||
          rect.height < 2 ||
          b.el.classList.contains("is-hidden") ||
          b.el.closest(".project-card")?.classList.contains("is-hidden")
        ) {
          b.amount += (0 - b.amount) * 0.2;
        } else {
          const hit = nearestOnRect(smoothX, smoothY, rect);
          const d = Math.hypot(smoothX - hit.x, smoothY - hit.y);
          const isCard = b.el.matches(CARD_SELECTOR);
          const isFooterIcon = b.el.matches(FOOTER_ICON_SELECTOR);
          const reach = isFooterIcon
            ? MERGE_DIST_UI + 6
            : isCard
              ? MERGE_DIST_CARD
              : MERGE_DIST_UI;
          const target = modalOpen ? 0 : Math.max(0, 1 - d / reach) ** 2.1;
          b.amount += (target - b.amount) * 0.16;
          if (b.amount < 0.02) {
            b.hx = hit.x;
            b.hy = hit.y;
          } else {
            b.hx += (hit.x - b.hx) * 0.22;
            b.hy += (hit.y - b.hy) * 0.22;
          }
          nearBoost = Math.max(nearBoost, b.amount);
        }

        const a = b.amount;
        if (a < 0.01) {
          b.body.setAttribute("width", "0");
          b.body.setAttribute("height", "0");
          b.clip.setAttribute("r", "0");
          return;
        }

        const isCard = b.el.matches(CARD_SELECTOR);
        const isFooterIcon = b.el.matches(FOOTER_ICON_SELECTOR);

        if (isFooterIcon) {
          // Filled circle around the icon that merges with the cursor goo.
          const pad = 6 + a * 10;
          const size = (Math.max(rect.width, rect.height) + pad * 2) * 0.67;
          const cx = rect.left + rect.width * 0.5;
          const cy = rect.top + rect.height * 0.5;
          b.body.setAttribute("x", String(cx - size * 0.5));
          b.body.setAttribute("y", String(cy - size * 0.5));
          b.body.setAttribute("width", String(size));
          b.body.setAttribute("height", String(size));
          b.body.setAttribute("rx", String(size * 0.5));
          b.body.setAttribute("ry", String(size * 0.5));
          b.body.setAttribute("opacity", String(0.5 + a * 0.42));
          const clipR = 10 + a * size * 0.85;
          b.clip.setAttribute("cx", String(b.hx));
          b.clip.setAttribute("cy", String(b.hy));
          b.clip.setAttribute("r", String(clipR));
          return;
        }

        const isSkillFill = b.el.matches(SKILL_FILL_SELECTOR);
        const pad = isSkillFill
          ? 2.5 + a * 2.8
          : isCard
            ? 2 + a * 3.2
            : 1.2 + a * 1.4;
        const cornerRx = isSkillFill
          ? Math.min((rect.height + pad * 2) * 0.5, 8)
          : readCornerRadius(b.el, rect);
        // Cards keep element radius; UI gets concentric merge corners.
        const outerRx = Math.min(
          cornerRx + (isCard || isSkillFill ? 0 : pad),
          (rect.width + pad * 2) * 0.5,
          (rect.height + pad * 2) * 0.5
        );

        b.body.setAttribute("x", String(rect.left - pad));
        b.body.setAttribute("y", String(rect.top - pad));
        b.body.setAttribute("width", String(rect.width + pad * 2));
        b.body.setAttribute("height", String(rect.height + pad * 2));
        b.body.setAttribute("rx", String(outerRx));
        b.body.setAttribute("ry", String(outerRx));
        b.body.setAttribute(
          "opacity",
          String(isSkillFill ? 0.88 + a * 0.12 : 0.52 + a * 0.4)
        );

        const diag = Math.hypot(rect.width + pad * 2, rect.height + pad * 2);
        const clipR = 16 + a * diag * 0.92;
        b.clip.setAttribute("cx", String(b.hx));
        b.clip.setAttribute("cy", String(b.hy));
        b.clip.setAttribute("r", String(clipR));
      });

      const cursorR = presence * (11 + nearBoost * 3.75);
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
    syncSize();
    window.addEventListener("resize", syncSize);
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
    setupHeroFibonacciStrings();
    setupSectionHeadGrids();
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

  document.addEventListener("DOMContentLoaded", () => {
    setupNav();
    setupTheme();
    const slime = setupSiteSlime();
    const page = document.body.dataset.page;
    if (page === "home") initHome(slime).catch(console.error);
  });
})();
