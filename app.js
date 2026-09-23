(function () {
  "use strict";

  const AVATAR_COLORS = ["#004286", "#091128", "#0b3a73", "#1d5fa3", "#15396e", "#2a6cb3", "#0e2c5c", "#23508a"];
  const FIELDS = ["id", "name", "big", "family", "cohort", "classYear", "phone", "email", "photo"];
  const PHOTO_SIZE = 480;
  const STORAGE_KEY = "munFamiliesEditor";

  // ── Tree state (rebuilt whenever the data changes) ──────────
  let data = { updated: "", people: [] };
  let people = new Map();
  let children = new Map();
  let heads = [];
  let families = [];            // [{ name, heads: [...] }]; heads sharing a family name co-own one tree
  let familyOfHead = new Map();
  let waiting = [];
  let descCache = new Map();

  function slug(name) {
    return String(name)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function setData(next) {
    data = next;
    people = new Map();
    children = new Map();
    descCache = new Map();

    data.people.forEach((raw) => {
      const name = String(raw.name || "").trim();
      const id = raw.id || slug(name);
      if (!name || !id) return;
      if (people.has(id)) { console.warn(`[data.json] "${name}" is listed twice — keeping the first one.`); return; }
      people.set(id, {
        id, name,
        bigId: raw.big || null,
        family: raw.family || "",
        cohort: raw.cohort || "",
        classYear: raw.classYear || "",
        phone: raw.phone || "",
        email: raw.email || "",
        photo: raw.photo || "",
      });
    });

    people.forEach((p) => {
      if (p.bigId && !people.has(p.bigId)) {
        console.warn(`[data.json] ${p.name}'s big "${p.bigId}" isn't in the list — showing them without a big.`);
        p.bigId = null;
      }
    });

    // Break any accidental loops (A is B's big and B is A's big).
    people.forEach((p) => {
      const seen = new Set([p.id]);
      let cur = p;
      while (cur.bigId) {
        if (seen.has(cur.bigId)) {
          console.warn(`[data.json] Loop found at ${cur.name} — cutting their big link.`);
          cur.bigId = null;
          break;
        }
        seen.add(cur.bigId);
        cur = people.get(cur.bigId);
      }
    });

    people.forEach((p) => {
      if (!p.bigId) return;
      if (!children.has(p.bigId)) children.set(p.bigId, []);
      children.get(p.bigId).push(p.id);
    });

    heads = [...people.values()].filter(isHead);
    waiting = [...people.values()].filter((p) => !p.bigId && !isHead(p));

    // Heads with the same family name are co-heads of one family.
    const byName = new Map();
    families = [];
    familyOfHead = new Map();
    heads.forEach((h) => {
      const key = h.family ? h.family.trim().toLowerCase() : `id:${h.id}`;
      if (!byName.has(key)) {
        const fam = { name: h.family || `${h.name.split(" ")[0]}'s Family`, heads: [] };
        byName.set(key, fam);
        families.push(fam);
      }
      byName.get(key).heads.push(h);
      familyOfHead.set(h.id, byName.get(key));
    });
    document.getElementById("updated").textContent = data.updated ? `Updated ${data.updated}` : "";
  }

  const littlesOf = (id) => (children.get(id) || []).map((c) => people.get(c));
  function isHead(p) { return !p.bigId && (Boolean(p.family) || littlesOf(p.id).length > 0); }

  function descendants(id) {
    if (descCache.has(id)) return descCache.get(id);
    const n = littlesOf(id).reduce((sum, c) => sum + 1 + descendants(c.id), 0);
    descCache.set(id, n);
    return n;
  }
  function descendantIds(id, out = new Set()) {
    littlesOf(id).forEach((c) => { out.add(c.id); descendantIds(c.id, out); });
    return out;
  }
  function generations(id) {
    const kids = littlesOf(id);
    return 1 + (kids.length ? Math.max(...kids.map((k) => generations(k.id))) : 0);
  }
  function ancestors(p) {
    const line = [];
    let cur = p;
    while (cur.bigId) { cur = people.get(cur.bigId); line.unshift(cur); }
    return line;
  }
  const headOf = (p) => ancestors(p)[0] || p;
  const familyOf = (p) => familyOfHead.get(headOf(p).id) || null;
  const familyName = (p) => (familyOf(p) ? familyOf(p).name : "");
  const familySize = (f) => f.heads.reduce((n, h) => n + 1 + descendants(h.id), 0);
  const familyDepth = (f) => Math.max(...f.heads.map((h) => generations(h.id)));
  const familyLittles = (f) => f.heads.flatMap((h) => littlesOf(h.id));

  // ── Render helpers ──────────────────────────────────────────
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const link = (p) => `#/p/${p.id}`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  function initials(name) {
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0] || "")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function colorFor(id) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  // Photos the editor just uploaded, shown right away while GitHub Pages republishes.
  const freshPhotos = new Map();

  function initialsAvatar(p, size) {
    return `<span class="avatar initials ${size}" style="background:${colorFor(p.id)}" aria-hidden="true">${esc(initials(p.name))}</span>`;
  }
  function avatar(p, size = "") {
    const src = freshPhotos.get(p.id) || p.photo;
    if (!src) return initialsAvatar(p, size);
    return `<img class="avatar ${size}" src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" data-pid="${esc(p.id)}">`;
  }
  // img errors don't bubble, but they do reach a capturing listener.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.pid) return;
    const p = people.get(img.dataset.pid);
    if (!p) return;
    const size = [...img.classList].find((c) => ["xs", "sm", "lg"].includes(c)) || "";
    img.outerHTML = initialsAvatar(p, size);
  }, true);

  // "'28" or "2028" -> "Class of '28"; words like "Sophomore" show as written.
  const classLabel = (y) => (/\d/.test(y) && !/class/i.test(y) ? `Class of ${y}` : y);
  const cohortLabel = (c) => (c.startsWith("Before") ? `Joined b${c.slice(1)}` : `MUN cohort ${c}`);

  function yearLine(p) {
    const bits = [];
    if (p.classYear) bits.push(classLabel(p.classYear));
    if (p.cohort) bits.push(p.cohort.startsWith("Before") ? "Returner" : `MUN ${p.cohort}`);
    return bits.join(" · ");
  }

  const bySize = (a, b) => descendants(b.id) - descendants(a.id) || a.name.localeCompare(b.name);

  // Nested lists; styles.css draws the connector lines between bigs and littles.
  function treeNode(p, currentId) {
    const kids = littlesOf(p.id).sort(bySize);
    const here = p.id === currentId;
    const sub = p.classYear ? classLabel(p.classYear) : "";
    return `<li>
      <a class="node${here ? " current" : ""}" href="${link(p)}"${here ? ' aria-current="page"' : ""}>
        ${avatar(p, "sm")}
        <span class="node-name">${esc(p.name)}</span>
        <span class="node-sub">${esc(sub)}</span>
      </a>
      ${kids.length ? `<ul>${kids.map((k) => treeNode(k, currentId)).join("")}</ul>` : ""}
    </li>`;
  }

  // Co-headed families get a family-name pill on top so the heads hang off it as siblings.
  function familyTree(fam, currentId) {
    const shared = fam.heads.length > 1;
    const rows = familyDepth(fam);
    const labels = Array.from({ length: rows }, (_, i) => `<div class="gen-label"><span>Generation</span> ${i + 1}</div>`).join("");
    const root = shared
      ? `<li><span class="fam-pill">${esc(fam.name)}</span><ul>${fam.heads.map((h) => treeNode(h, currentId)).join("")}</ul></li>`
      : treeNode(fam.heads[0], currentId);
    return `<div class="tree-wrap">
      <div class="gen-rail" aria-hidden="true">${shared ? '<div class="gen-spacer"></div>' : ""}${labels}</div>
      <div class="tree-scroll"><ul class="tree">${root}</ul></div>
    </div>`;
  }

  // Wide trees scroll sideways; start with the highlighted person in view.
  function centerCurrentNode() {
    const box = view.querySelector(".tree-scroll");
    const node = box && box.querySelector(".node.current");
    if (!box || !node || box.scrollWidth <= box.clientWidth) return;
    const boxRect = box.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    box.scrollLeft += nodeRect.left - boxRect.left - (box.clientWidth - nodeRect.width) / 2;
  }

  function avatarStack(list, max = 5) {
    if (!list.length) return "";
    const shown = list.slice(0, max).map((p) => avatar(p, "xs")).join("");
    const more = list.length > max ? `<span class="more">+${list.length - max}</span>` : "";
    return `<div class="stack">${shown}${more}</div>`;
  }

  const ICONS = {
    phone: `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" fill="currentColor"/></svg>`,
    mail: `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 6.5 12 13l8.5-6.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
    external: `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  };

  const editBtn = (label, action, extra = "") =>
    editor ? `<button type="button" class="btn ${extra}" data-action="${action}">${label}</button>` : "";

  // ── Views ───────────────────────────────────────────────────
  const view = document.getElementById("view");

  function renderHome() {
    const sorted = [...families].sort((a, b) => familySize(b) - familySize(a) || a.name.localeCompare(b.name));
    const inTree = people.size - waiting.length;
    const maxGen = Math.max(1, ...families.map(familyDepth));
    document.title = "CarolinaMUN Families";

    view.innerHTML = `
      <section class="hero">
        <div class="hero-main">
          <div class="wordmark wordmark-lg" role="img" aria-label="CarolinaMUN: Chapel Hill's Elite Model UN Delegation">
            <span class="wm-name">CarolinaMUN</span>
            <span class="wm-tag">Chapel Hill's Elite Model UN Delegation</span>
          </div>
          <h1 class="hero-title"><span class="hero-kicker">MUNtorship</span><span class="hero-script">Family Tree</span></h1>
          <p>Every big and little in CarolinaMUN. Pick a family, then click through a big's littles, and their littles after that.</p>
          <div class="stats">
            <div class="stat"><b>${families.length}</b><span>families</span></div>
            <div class="stat"><b>${inTree}</b><span>members in a family</span></div>
            <div class="stat"><b>${maxGen}</b><span>generations deep</span></div>
          </div>
          <a class="hero-cta" href="#/join">In CarolinaMUN? Add your photo and info <span aria-hidden="true">›</span></a>
        </div>
        <div class="badge" aria-hidden="true">
          <span class="badge-name">Carolina<br>MUN</span>
          <span class="badge-rule"></span>
          <span class="badge-tag">Chapel Hill's Elite<br>Model UN Delegation</span>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Families</h2><span class="count">sorted by size</span></div>
        <div class="grid">
          ${sorted.map((f) => `<a class="card" href="${link(f.heads[0])}">
              <div class="heads">${f.heads.map((h) => avatar(h)).join("")}</div>
              <div class="family-name">${esc(f.name)}</div>
              <div class="sub">Started by ${esc(f.heads.map((h) => h.name).join(" & "))}</div>
              ${avatarStack(familyLittles(f))}
              <div class="foot has">${plural(familySize(f), "member")} · ${plural(familyDepth(f), "generation")} <span aria-hidden="true">›</span></div>
            </a>`).join("")}
          ${waiting.length ? `<a class="card waiting" href="#/waiting">
              <div class="big-num">${waiting.length}</div>
              <div class="name">New members waiting on a big</div>
              <div class="foot has">See who <span aria-hidden="true">›</span></div>
            </a>` : ""}
          ${editor ? `<button type="button" class="card add-card" data-action="new-family">
              <span class="plus" aria-hidden="true">+</span>
              <div class="name">New family</div>
              <div class="sub">Add someone at the top of a new line</div>
            </button>` : ""}
        </div>
      </section>`;
  }

  function renderPerson(p) {
    const line = ancestors(p);
    const big = line[line.length - 1];
    const gen = line.length + 1;
    const family = familyOf(p);
    const first = p.name.split(" ")[0];
    const coHeads = !big && family ? family.heads.filter((h) => h.id !== p.id) : [];
    const sibs = big ? littlesOf(big.id).filter((s) => s.id !== p.id) : coHeads;
    const fam = familyName(p);
    const total = descendants(p.id);
    document.title = `${p.name} · CarolinaMUN Families`;

    const crumbs = [`<a href="#/">All families</a>`];
    if (!fam) crumbs.push(`<a href="#/waiting">Waiting on a big</a>`);
    line.forEach((a, i) => crumbs.push(`<a href="${link(a)}">${esc(i === 0 ? fam : a.name)}</a>`));
    if (coHeads.length) crumbs.push(`<span>${esc(fam)}</span>`);
    crumbs.push(`<span class="here">${esc(line.length || coHeads.length ? p.name : fam || p.name)}</span>`);

    const chips = [];
    if (fam) chips.push(`<span class="chip">${esc(fam)}</span>`, `<span class="chip">Generation ${gen}</span>`);
    if (p.classYear) chips.push(`<span class="chip">${esc(classLabel(p.classYear))}</span>`);
    if (p.cohort) chips.push(`<span class="chip">${esc(cohortLabel(p.cohort))}</span>`);
    if (editor && !p.classYear) chips.push(`<span class="chip muted">No class year yet</span>`);

    let lineage = "";
    if (big) lineage += `Big: <a href="${link(big)}">${esc(big.name)}</a>`;
    if (line.length > 1) lineage += ` · Grand-big: <a href="${link(line[line.length - 2])}">${esc(line[line.length - 2].name)}</a>`;
    if (!big && !fam) lineage = "Waiting to be matched with a big.";
    if (!big && fam) lineage = `Head of ${esc(fam)} · ${plural(total, "descendant")}`;
    if (coHeads.length) lineage = `Co-head of ${esc(fam)} with ${coHeads.map((h) => `<a href="${link(h)}">${esc(h.name)}</a>`).join(" & ")} · ${plural(total, "descendant")}`;

    const contact = [];
    if (p.phone) contact.push(`<a class="contact" href="tel:${esc(p.phone.replace(/[^\d+]/g, ""))}">${ICONS.phone}${esc(p.phone)}</a>`);
    if (p.email) contact.push(`<a class="contact" href="mailto:${esc(p.email)}">${ICONS.mail}${esc(p.email)}</a>`);

    view.innerHTML = `
      <nav class="crumbs" aria-label="Lineage">${crumbs.join('<span class="sep" aria-hidden="true">›</span>')}</nav>

      <section class="profile">
        ${avatar(p, "lg")}
        <div class="profile-body">
          <h1>${esc(p.name)}</h1>
          <div class="chips">${chips.join("")}</div>
          <div class="lineage">${lineage}</div>
          ${contact.length ? `<div class="contacts">${contact.join("")}</div>` : ""}
        </div>
        ${editBtn("Edit", `edit:${p.id}`, "btn-primary profile-edit")}
      </section>
      ${editor ? "" : `<p class="is-you">Is this you? <a href="#/join">Add or update your photo and info</a></p>`}

      ${fam
        ? `<section class="section">
            <div class="section-head">
              <h2>${esc(/family$/i.test(fam) ? fam : `${fam} family`)} tree</h2>
              <span class="count">${plural(familySize(family), "member")} · ${plural(familyDepth(family), "generation")}</span>
              ${editBtn("+ Add a little", `add-little:${p.id}`)}
            </div>
            ${familyTree(family, p.id)}
          </section>`
        : `<section class="section">
            <div class="section-head"><h2>${esc(first)}'s littles</h2>${editBtn("+ Add a little", `add-little:${p.id}`)}</div>
            <div class="empty">No littles yet.</div>
          </section>`}

      ${sibs.length ? `<section class="section">
        <div class="section-head"><h2>Siblings</h2><span class="count">${big ? `also littles of ${esc(big.name)}` : `co-heads of ${esc(fam)}`}</span></div>
        <div class="siblings">${sibs.map((s) => `<a class="sib" href="${link(s)}">${avatar(s, "xs")}${esc(s.name)}</a>`).join("")}</div>
      </section>` : ""}`;
    centerCurrentNode();
  }

  function renderWaiting() {
    document.title = "Waiting on a big · CarolinaMUN Families";
    const list = [...waiting].sort((a, b) => a.name.localeCompare(b.name));
    view.innerHTML = `
      <nav class="crumbs"><a href="#/">All families</a><span class="sep" aria-hidden="true">›</span><span class="here">Waiting on a big</span></nav>
      <div class="section-head"><h2>New members waiting on a big</h2><span class="count">${list.length}</span>${editBtn("+ Add member", "add-waiting")}</div>
      <p class="note">These members joined but haven't been matched yet. Once they are, they'll show up inside their big's family.${editor ? " Open someone and hit Edit to give them a big." : ""}</p>
      <div class="grid small">
        ${list.map((p) => `<a class="card row" href="${link(p)}">${avatar(p, "sm")}<div><div class="name">${esc(p.name)}</div><div class="sub">${esc(yearLine(p))}</div></div></a>`).join("")}
      </div>`;
  }

  // Google Forms embed only from their full docs.google.com link.
  function formEmbedUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname !== "docs.google.com" || !u.pathname.includes("/forms/")) return "";
      u.pathname = u.pathname.replace(/\/(edit|viewform)?$/, "/viewform");
      u.searchParams.set("embedded", "true");
      return u.toString();
    } catch { return ""; }
  }

  function renderJoin() {
    document.title = "Add yourself · CarolinaMUN Families";
    const url = data.joinFormUrl || "";
    const embed = url && formEmbedUrl(url);
    let body;
    if (!url) {
      body = `<div class="empty">The sign-up form isn't open yet. Check back soon.${editor ? `<br><br>${editBtn("Add the form link", "set-form", "btn-primary")}` : ""}</div>`;
    } else {
      body = `
        <div class="join-actions">
          <a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener">Open the form ${ICONS.external}</a>
          ${editBtn("Change form link", "set-form")}
        </div>
        ${embed ? `<iframe class="join-frame" src="${esc(embed)}" title="CarolinaMUN family tree sign-up form" loading="lazy">Loading…</iframe>` : ""}`;
    }
    view.innerHTML = `
      <nav class="crumbs"><a href="#/">All families</a><span class="sep" aria-hidden="true">›</span><span class="here">Add yourself</span></nav>
      <section class="join-intro">
        <h1>Add yourself to the family tree</h1>
        <p>Send in your photo, name, class year, phone number and email. An exec member reviews every submission, and once it's approved you'll show up on the site.</p>
        <ul class="join-notes">
          <li><b>Heads up:</b> your phone number and email will be visible to anyone who has this site's link.</li>
          <li>Uploading a photo asks you to sign in to Google. If it doesn't work below, use <b>Open the form</b>.</li>
          <li>Already on the site and want to change something? Just submit again.</li>
        </ul>
      </section>
      ${body}`;
  }

  function renderMessage(html) {
    view.innerHTML = `<div class="empty">${html}</div>`;
  }

  let lastRoute = "";
  function route() {
    const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [page, arg] = hash.split("/");
    if (!page) renderHome();
    else if (page === "p" && people.has(arg)) renderPerson(people.get(arg));
    else if (page === "waiting") renderWaiting();
    else if (page === "join") renderJoin();
    else { document.title = "Not found · CarolinaMUN Families"; renderMessage(`We couldn't find that person. <a href="#/">Back to all families</a>`); }
    if (hash !== lastRoute) {
      window.scrollTo(0, 0);
      view.focus({ preventScroll: true });
      lastRoute = hash;
    }
  }

  // ── Search ──────────────────────────────────────────────────
  const input = document.getElementById("search");
  const results = document.getElementById("search-results");
  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let matches = [];
  let active = 0;

  function showResults() {
    const q = norm(input.value.trim());
    if (!q) { closeResults(); return; }
    matches = [...people.values()]
      .map((p) => ({ p, key: norm(p.name) }))
      .filter((e) => e.key.includes(q))
      .sort((a, b) => a.key.indexOf(q) - b.key.indexOf(q) || a.key.localeCompare(b.key))
      .slice(0, 8)
      .map((e) => e.p);
    active = 0;
    results.innerHTML = matches.length
      ? matches.map((p, i) => `<li role="option" data-id="${p.id}" aria-selected="${i === active}">
          ${avatar(p, "xs")}
          <div><div class="sr-name">${esc(p.name)}</div><div class="sr-sub">${esc(familyName(p) || "Waiting on a big")}</div></div>
        </li>`).join("")
      : `<li class="sr-empty">No one by that name</li>`;
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function closeResults() {
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }
  function go(id) {
    input.value = "";
    closeResults();
    input.blur();
    location.hash = `#/p/${id}`;
  }
  function highlight() {
    [...results.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
  }

  input.addEventListener("input", showResults);
  input.addEventListener("focus", () => input.value && showResults());
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && matches.length) { active = (active + 1) % matches.length; highlight(); e.preventDefault(); }
    else if (e.key === "ArrowUp" && matches.length) { active = (active - 1 + matches.length) % matches.length; highlight(); e.preventDefault(); }
    else if (e.key === "Enter" && matches[active]) go(matches[active].id);
    else if (e.key === "Escape") { input.value = ""; closeResults(); }
  });
  results.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-id]");
    if (li) { e.preventDefault(); go(li.dataset.id); }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) closeResults(); });

  // ════════════════════════════════════════════════════════════
  //  Editing: saves straight to the site's GitHub repo, which
  //  GitHub Pages republishes for everyone in about a minute.
  // ════════════════════════════════════════════════════════════
  let editor = null; // { owner, repo, token, login }

  function loadEditor() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
  }
  function saveEditor(e) {
    try { e ? localStorage.setItem(STORAGE_KEY, JSON.stringify(e)) : localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
  }

  function guessRepo() {
    const host = location.hostname;
    if (host.endsWith(".github.io")) {
      const owner = host.split(".")[0];
      const first = location.pathname.split("/").filter(Boolean)[0];
      return { owner, repo: first || host };
    }
    return { owner: "", repo: "" };
  }

  async function gh(path, opts = {}, auth = editor) {
    const res = await fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${auth.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch { /* no body */ }
      const err = new Error(`GitHub said: ${msg} (${res.status})`);
      err.status = res.status;
      // Fine-grained tokens that can read but not write fail saves with a 403.
      if (res.status === 403 && opts.method === "PUT") {
        err.message = "Your token can read the repo but not save to it. On GitHub, edit the token → Repository permissions → Contents → Read and write, then try again.";
      }
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  const repoPath = (file) => `/repos/${encodeURIComponent(editor.owner)}/${encodeURIComponent(editor.repo)}/contents/${file}`;

  function toBase64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromBase64(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  async function readRemoteData() {
    const file = await gh(repoPath("data.json"));
    return { data: JSON.parse(new TextDecoder().decode(fromBase64(file.content))), sha: file.sha };
  }

  function serialize(d) {
    const lines = d.people.map((p) => {
      const o = {};
      FIELDS.forEach((k) => { if (p[k]) o[k] = p[k]; });
      return "    " + JSON.stringify(o);
    });
    return `{\n  "updated": ${JSON.stringify(d.updated || "")},\n  "joinFormUrl": ${JSON.stringify(d.joinFormUrl || "")},\n  "people": [\n${lines.join(",\n")}\n  ]\n}\n`;
  }

  // Re-reads the latest data.json right before saving, so two editors don't overwrite each other.
  async function commitChange(change, message) {
    const { data: latest, sha } = await readRemoteData();
    change(latest);
    latest.updated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    await gh(repoPath("data.json"), {
      method: "PUT",
      body: JSON.stringify({ message, sha, content: toBase64(new TextEncoder().encode(serialize(latest))) }),
    });
    setData(latest);
  }

  async function uploadPhoto(id, blob) {
    const file = `photos/${id}.jpg`;
    let sha;
    try { sha = (await gh(repoPath(file))).sha; } catch (e) { if (e.status !== 404) throw e; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await gh(repoPath(file), {
      method: "PUT",
      body: JSON.stringify({ message: `Photo for ${people.get(id)?.name || id}`, content: toBase64(bytes), ...(sha ? { sha } : {}) }),
    });
    return `${file}?v=${Date.now()}`;
  }

  // Center-crop to a square and shrink, so uploads stay small.
  function squarePhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const out = Math.min(PHOTO_SIZE, s);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = out;
        canvas.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, out, out);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image. Try a JPG or PNG.")); };
      img.src = url;
    });
  }

  // ── Toasts + banner ─────────────────────────────────────────
  const toastEl = document.getElementById("toast");
  let toastTimer;
  function toast(msg, kind = "") {
    toastEl.textContent = msg;
    toastEl.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.className = "toast"), kind === "error" ? 7000 : 4000);
  }

  function renderChrome() {
    const banner = document.getElementById("edit-banner");
    const footLink = document.getElementById("editor-link");
    if (editor) {
      banner.hidden = false;
      banner.innerHTML = `<div class="edit-banner-inner">
        <span><b>Editing</b> as ${esc(editor.login)} · changes go live for everyone in about a minute</span>
        <button type="button" class="linkish" data-action="sign-out">Sign out</button>
      </div>`;
      footLink.textContent = "Signed in as editor";
    } else {
      banner.hidden = true;
      footLink.textContent = "Editor sign in";
    }
  }

  // ── Dialogs ─────────────────────────────────────────────────
  const dialog = document.getElementById("dialog");

  function openDialog(html, onReady) {
    dialog.innerHTML = html;
    dialog.showModal();
    dialog.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dialog.close()));
    onReady && onReady(dialog);
  }
  // Clicking the dim backdrop closes the dialog.
  dialog.addEventListener("click", (e) => { if (e.target === dialog && !dialog.dataset.busy) dialog.close(); });
  dialog.addEventListener("cancel", (e) => { if (dialog.dataset.busy) e.preventDefault(); });

  function setBusy(form, busy, label) {
    dialog.dataset.busy = busy ? "1" : "";
    form.querySelectorAll("button, input, select").forEach((el) => (el.disabled = busy));
    const status = form.querySelector(".form-status");
    if (status) { status.textContent = label || ""; status.classList.remove("error"); }
  }
  function showFormError(form, err) {
    setBusy(form, false);
    const status = form.querySelector(".form-status");
    status.textContent = err.message || String(err);
    status.classList.add("error");
  }

  function openSignIn() {
    const saved = loadEditor() || {};
    const guess = guessRepo();
    const owner = saved.owner || guess.owner;
    const repo = saved.repo || guess.repo;
    const tokenUrl = "https://github.com/settings/personal-access-tokens/new";
    openDialog(`
      <form class="form" method="dialog" novalidate>
        <h2>Editor sign in</h2>
        <p class="hint">Edits save straight to the site's GitHub repo. You need a GitHub token that can change this one repo. It's kept only in this browser.</p>
        <details class="how">
          <summary>How do I get a token?</summary>
          <ol>
            <li>Open <a href="${tokenUrl}" target="_blank" rel="noopener">GitHub → Fine-grained tokens → Generate new token</a>.</li>
            <li>Name it anything (e.g. "MUN families"), set an expiration (up to a year).</li>
            <li><b>Repository access:</b> Only select repositories → pick <b>${esc(repo || "this site's repo")}</b>.</li>
            <li><b>Permissions → Repository permissions → Contents:</b> Read and write.</li>
            <li>Generate, copy the token, and paste it below.</li>
          </ol>
        </details>
        <div class="row2">
          <label>GitHub username or org<input name="owner" value="${esc(owner)}" required autocomplete="off"></label>
          <label>Repo name<input name="repo" value="${esc(repo)}" required autocomplete="off"></label>
        </div>
        <label>Token<input name="token" type="password" required autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
        <p class="hint small">Don't sign in on a shared computer. Sign out removes the token from this browser.</p>
        <div class="form-status" role="status"></div>
        <div class="actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Sign in</button>
        </div>
      </form>`, (d) => {
      const form = d.querySelector("form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const cand = { owner: f.get("owner").trim(), repo: f.get("repo").trim(), token: f.get("token").trim() };
        if (!cand.owner || !cand.repo || !cand.token) return showFormError(form, new Error("Fill in all three boxes."));
        setBusy(form, true, "Checking…");
        try {
          const repoInfo = await gh(`/repos/${encodeURIComponent(cand.owner)}/${encodeURIComponent(cand.repo)}`, {}, cand);
          if (repoInfo.permissions && !repoInfo.permissions.push) throw new Error("That token can see the repo but can't edit it. Give it Contents: Read and write.");
          const user = await gh("/user", {}, cand).catch(() => ({ login: cand.owner }));
          editor = { ...cand, login: user.login };
          const { data: fresh } = await readRemoteData();
          saveEditor(editor);
          setData(fresh);
          dialog.dataset.busy = "";
          dialog.close();
          renderChrome();
          route();
          toast("Signed in. Edit buttons are on.");
        } catch (err) {
          editor = null;
          if (err.status === 401) err.message = "GitHub didn't accept that token. Double-check it was copied fully.";
          if (err.status === 404) err.message = "Couldn't find that repo with this token. Check the names, and that the token has access to this repo.";
          showFormError(form, err);
        }
      });
    });
  }

  function signOut() {
    editor = null;
    saveEditor(null);
    renderChrome();
    route();
    toast("Signed out.");
  }

  function uniqueId(name) {
    const base = slug(name) || "member";
    let id = base;
    for (let i = 2; people.has(id); i++) id = `${base}-${i}`;
    return id;
  }

  // mode: "edit" (existing person) or "new"; preset fills a new person's fields.
  function openPersonEditor(existing, preset = {}) {
    const p = existing || { id: "", name: "", bigId: preset.bigId || null, family: "", cohort: preset.cohort || "", classYear: "", phone: "", email: "", photo: "" };
    const blocked = existing ? descendantIds(p.id).add(p.id) : new Set();
    const bigOptions = [...people.values()]
      .filter((o) => !blocked.has(o.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((o) => `<option value="${o.id}" ${o.id === p.bigId ? "selected" : ""}>${esc(o.name)}</option>`)
      .join("");
    const cohorts = [...new Set([...people.values()].map((o) => o.cohort).filter(Boolean))];
    const kids = existing ? littlesOf(p.id).length : 0;
    const title = existing ? `Edit ${p.name}` : preset.title || "Add a member";

    openDialog(`
      <form class="form" novalidate>
        <h2>${esc(title)}</h2>
        <div class="photo-row">
          <div class="photo-preview">${existing ? avatar(p, "lg") : `<span class="avatar initials lg" style="background:#2f6ea6">+</span>`}</div>
          <div class="photo-buttons">
            <label class="btn">Upload photo<input type="file" name="photo" accept="image/*" hidden></label>
            <button type="button" class="btn btn-quiet" data-remove-photo ${p.photo ? "" : "hidden"}>Remove photo</button>
            <p class="hint small">Cropped to a square automatically.</p>
          </div>
        </div>
        <label>Name<input name="name" value="${esc(p.name)}" required autocomplete="off"></label>
        <div class="row2">
          <label>Class year<input name="classYear" value="${esc(p.classYear)}" placeholder="'28 or Sophomore" autocomplete="off"></label>
          <label>MUN cohort<input name="cohort" value="${esc(p.cohort)}" list="cohort-list" placeholder="2026–27" autocomplete="off"></label>
        </div>
        <div class="row2">
          <label>Phone<input name="phone" type="tel" value="${esc(p.phone)}" placeholder="(919) 555-0123" autocomplete="off"></label>
          <label>Email<input name="email" type="email" value="${esc(p.email)}" placeholder="name@unc.edu" autocomplete="off"></label>
        </div>
        <datalist id="cohort-list">${cohorts.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <label>Big
          <select name="big">
            <option value="">— No big —</option>
            ${bigOptions}
          </select>
        </label>
        <label class="family-field" ${p.bigId ? "hidden" : ""}>Family name
          <input name="family" value="${esc(p.family)}" placeholder="Leave blank if they're waiting on a big" autocomplete="off">
          <span class="hint small">Fill this in to put them at the top of a family. Use an existing family's name to make them co-heads.</span>
        </label>
        <div class="form-status" role="status"></div>
        <div class="actions">
          ${existing ? `<button type="button" class="btn btn-danger" data-delete>Delete</button>` : ""}
          <span class="spacer"></span>
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>`, (d) => {
      const form = d.querySelector("form");
      const bigSel = form.elements.big;
      const famField = form.querySelector(".family-field");
      const preview = form.querySelector(".photo-preview");
      const removeBtn = form.querySelector("[data-remove-photo]");
      let newPhoto = null;     // Blob to upload
      let removePhoto = false;

      bigSel.addEventListener("change", () => (famField.hidden = Boolean(bigSel.value)));

      form.elements.photo.addEventListener("change", async () => {
        const file = form.elements.photo.files[0];
        if (!file) return;
        try {
          newPhoto = await squarePhoto(file);
          removePhoto = false;
          preview.innerHTML = `<img class="avatar lg" src="${URL.createObjectURL(newPhoto)}" alt="">`;
          removeBtn.hidden = false;
        } catch (err) { showFormError(form, err); }
      });
      removeBtn.addEventListener("click", () => {
        newPhoto = null;
        removePhoto = true;
        const name = form.elements.name.value || p.name || "?";
        preview.innerHTML = initialsAvatar({ id: p.id || slug(name), name }, "lg");
        removeBtn.hidden = true;
      });

      const del = form.querySelector("[data-delete]");
      if (del) del.addEventListener("click", async () => {
        if (kids) return showFormError(form, new Error(`${p.name} still has ${plural(kids, "little")}. Give them a different big first.`));
        if (!confirm(`Delete ${p.name} from the family tree? This can be undone from the repo's history on GitHub.`)) return;
        setBusy(form, true, "Deleting…");
        try {
          await commitChange((d2) => { d2.people = d2.people.filter((x) => x.id !== p.id); }, `Remove ${p.name}`);
          dialog.dataset.busy = "";
          dialog.close();
          location.hash = p.bigId ? `#/p/${p.bigId}` : "#/";
          route();
          toast(`${p.name} removed. Live for everyone in about a minute.`);
        } catch (err) { showFormError(form, err); }
      });

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const name = f.get("name").trim();
        if (!name) return showFormError(form, new Error("Name can't be blank."));
        const clash = [...people.values()].find((o) => o.id !== p.id && o.name.toLowerCase() === name.toLowerCase());
        if (clash) return showFormError(form, new Error(`There's already a ${clash.name} in the tree.`));

        const id = existing ? p.id : uniqueId(name);
        const big = f.get("big") || "";
        const fields = {
          name,
          big,
          family: big ? "" : f.get("family").trim(),
          cohort: f.get("cohort").trim(),
          classYear: f.get("classYear").trim(),
          phone: f.get("phone").trim(),
          email: f.get("email").trim(),
        };

        try {
          let photo = removePhoto ? "" : p.photo;
          if (newPhoto) {
            setBusy(form, true, "Uploading photo…");
            photo = await uploadPhoto(id, newPhoto);
            freshPhotos.set(id, URL.createObjectURL(newPhoto));
          }
          if (removePhoto) freshPhotos.delete(id);
          setBusy(form, true, "Saving…");
          const record = { id, ...fields, photo };
          await commitChange((d2) => {
            const i = d2.people.findIndex((x) => x.id === id);
            if (i >= 0) d2.people[i] = record;
            else d2.people.push(record);
            if (existing && !existing.bigId && existing.family && record.family && record.family !== existing.family) {
              d2.people.forEach((x) => { if (x.id !== id && !x.big && x.family === existing.family) x.family = record.family; });
            }
          }, existing ? `Update ${name}` : `Add ${name}`);
          dialog.dataset.busy = "";
          dialog.close();
          if (!existing) location.hash = `#/p/${id}`;
          route();
          toast(`${name} saved. Live for everyone in about a minute.`);
        } catch (err) { showFormError(form, err); }
      });

      form.elements.name.focus();
    });
  }

  function openFormLinkEditor() {
    openDialog(`
      <form class="form" novalidate>
        <h2>Sign-up form link</h2>
        <p class="hint">Paste your Google Form's link (from <b>Send → link icon</b>, or the address bar while previewing the form). Leave it blank to close sign-ups.</p>
        <label>Form link<input name="url" type="url" value="${esc(data.joinFormUrl || "")}" placeholder="https://docs.google.com/forms/d/e/…/viewform" autocomplete="off"></label>
        <div class="form-status" role="status"></div>
        <div class="actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>`, (d) => {
      const form = d.querySelector("form");
      form.elements.url.focus();
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const url = form.elements.url.value.trim();
        if (url && !/^https:\/\//.test(url)) return showFormError(form, new Error("That doesn't look like a link. It should start with https://"));
        setBusy(form, true, "Saving…");
        try {
          await commitChange((d2) => { d2.joinFormUrl = url; }, url ? "Set sign-up form link" : "Close sign-ups");
          dialog.dataset.busy = "";
          dialog.close();
          route();
          toast(url ? "Form link saved. Live for everyone in about a minute." : "Sign-ups closed.");
        } catch (err) { showFormError(form, err); }
      });
    });
  }

  // One click handler for every edit button on the page.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const [action, arg] = btn.dataset.action.split(":");
    if (action === "sign-out") return signOut();
    if (!editor) return;
    if (action === "edit") openPersonEditor(people.get(arg));
    else if (action === "add-little") openPersonEditor(null, { bigId: arg, title: `Add a little for ${people.get(arg).name}`, cohort: currentCohort() });
    else if (action === "add-waiting") openPersonEditor(null, { title: "Add a new member", cohort: currentCohort() });
    else if (action === "new-family") openPersonEditor(null, { title: "Start a new family" });
    else if (action === "set-form") openFormLinkEditor();
  });

  // The academic year we're in: Aug–Dec counts as the start of a new one.
  function currentCohort() {
    const d = new Date();
    const start = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    return `${start}–${String(start + 1).slice(2)}`;
  }

  document.getElementById("editor-link").addEventListener("click", (e) => {
    e.preventDefault();
    editor ? signOut() : openSignIn();
  });

  // ── Start up ────────────────────────────────────────────────
  async function start() {
    renderMessage("Loading families…");
    editor = loadEditor();
    renderChrome();
    let loaded = null;
    if (editor) {
      // Editors read straight from GitHub so they always see the latest save.
      try { loaded = (await readRemoteData()).data; }
      catch (err) {
        if (err.status === 401) { editor = null; saveEditor(null); renderChrome(); toast("Your editor token expired. Sign in again to keep editing.", "error"); }
      }
    }
    if (!loaded) {
      try {
        const res = await fetch("data.json", { cache: "no-cache" });
        if (!res.ok) throw new Error(res.statusText);
        loaded = await res.json();
      } catch (err) {
        renderMessage(`Couldn't load the family data (data.json). If you opened this file straight from your computer, view it through the live site instead.`);
        console.error(err);
        return;
      }
    }
    setData(loaded);
    window.addEventListener("hashchange", route);
    route();
  }
  start();
})();
