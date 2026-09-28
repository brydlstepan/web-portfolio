// Pure content → HTML renderers, shared by the browser (js/site.js) and the
// build (tools/build.js) so pre-rendered and client-rendered markup match.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PortfolioRender = api;
})(typeof self !== "undefined" ? self : this, () => {
  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
  const DEFAULT_BASE =
    typeof document !== "undefined" ? document.baseURI : "https://brydlstepan.cz/";

  // Keeps `javascript:` and `data:` out of hrefs even if content JSON is ever
  // generated rather than hand-written.
  function safeURL(value, base = DEFAULT_BASE) {
    if (!value) return "";
    try {
      const url = new URL(String(value), base);
      return SAFE_PROTOCOLS.has(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
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

  function renderFilters(tags) {
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
    return html;
  }

  function renderProjectCards(projects, tagsById) {
    return [...projects]
      .filter((p) => p.published)
      .sort((a, b) => a.order - b.order)
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

  function renderAbout(text, photographyUrl) {
    let html = escapeHTML(text || "");
    const emphasis = "make pretty things that run smooth";

    if (html.includes(emphasis)) {
      html = html.replace(emphasis, `<strong class="about-emphasis">${emphasis}</strong>`);
    }

    const url = safeURL(photographyUrl);
    if (url && html.includes("photos")) {
      html = html.replace(
        "photos",
        `<a class="about-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">photos</a>`
      );
    }

    return html;
  }

  function renderAiTitle(title, emphasis) {
    const text = title || "AI";
    if (emphasis && text.includes(emphasis)) {
      const idx = text.indexOf(emphasis);
      return `${escapeHTML(text.slice(0, idx))}<em>${escapeHTML(emphasis)}</em>${escapeHTML(text.slice(idx + emphasis.length))}`;
    }
    return escapeHTML(text);
  }

  function renderAiItems(items) {
    return items
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

  const SKILL_ICONS = {
    unreal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/></svg>',
    "ai-dev": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
    "ai-content": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="m18 14 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/></svg>',
    blender: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)"/></svg>',
    "substance-painter": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 17c4-8 6-11 8-11s2 5 8 11"/><path d="M8 17h8"/><circle cx="12" cy="7" r="2"/></svg>',
    "substance-designer": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16l3-8 3 5 2-3"/></svg>',
    git: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M6 8.2v7.6M8.2 18h7.6M7.6 7.6 16 16"/></svg>',
    photoshop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 16V8h2.4c1.6 0 2.6.9 2.6 2.3S12 12.6 10.4 12.6H8"/></svg>',
    premiere: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9z"/></svg>',
    lightroom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M12 5v2M12 17v2M5 12h2M17 12h2M7.05 7.05l1.4 1.4M15.55 15.55l1.4 1.4M16.95 7.05l-1.4 1.4M8.45 15.55l-1.4 1.4"/></svg>',
    "3dsmax": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3 3.5 7.75v8.5L12 21l8.5-4.75v-8.5L12 3z"/><path d="M12 12 3.5 7.75M12 12l8.5-4.25M12 12v9"/><circle cx="12" cy="12" r="1.6"/></svg>',
    maya: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 5v9a8 8 0 0 0 16 0V5"/><path d="M8 5v9a4 4 0 0 0 8 0V5"/></svg>',
    cinema4d: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="8.5"/><path d="M15.2 9.2a4 4 0 1 0 0 5.6"/></svg>',
    unity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6l8-4.4z"/><path d="M12 8.1 16.2 15H7.8L12 8.1z"/></svg>',
    figma: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M9 3h3v6H9a3 3 0 0 1 0-6zM12 3h3a3 3 0 0 1 0 6h-3V3zM9 9h3v6H9a3 3 0 0 1 0-6zM9 15h3v3a3 3 0 1 1-3-3z"/><circle cx="15" cy="12" r="3"/></svg>',
    docker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 12h13v3.2A4.8 4.8 0 0 1 12.2 20H9a5 5 0 0 1-5-5v-3z"/><path d="M7 12V9.5M10 12V9.5M13 12V9.5M10 9.5V7M17 12.4c1.6-.9 2.6-.6 3 .1"/></svg>',
    indesign: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8.6 8v8"/><path d="M15.4 8v8h-1.7a2.6 2.6 0 0 1 0-5.2h1.7"/></svg>',
    "html-css": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m8.5 8.5-4 3.5 4 3.5M15.5 8.5l4 3.5-4 3.5M13.4 5.5l-2.8 13"/></svg>',
  };

  function skillIcon(id) {
    return SKILL_ICONS[id] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="8"/></svg>';
  }

  function renderSkills(skills) {
    return skills
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
  }

  const SOCIAL_KEYS = ["github", "linkedin", "instagram", "photography", "artstation"];

  return {
    escapeHTML,
    safeURL,
    tagMap,
    renderTags,
    renderFilters,
    renderProjectCards,
    renderAbout,
    renderAiTitle,
    renderAiItems,
    renderSkills,
    SOCIAL_KEYS,
  };
});
