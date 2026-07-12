/* =========================================================
   Chemical Secret — Reader + Audio + Freehand Highlight
   Pure static, no backend. Files served from same origin.
   ========================================================= */
(function () {
  "use strict";

  const PDF_URL = "assets/Chemical-Secret.pdf";
  const TRACK_COUNT = 12;

  /* ---------- pdf.js setup ---------- */
  const pdfjsLib = window["pdfjsLib"];
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const viewport = $("pdfViewport");
  const pdfScroll = $("pdfScroll");
  const pageInfo = $("pageInfo");
  const zoomSel = $("zoom");
  const fitWidth = $("fitWidth");

  let pdfDoc = null;
  let currentScale = parseFloat(zoomSel.value);
  const rendered = new Set();

  /* =========================================================
     PDF RENDERING (with highlight overlay per page)
     ========================================================= */
  function computeScale(page) {
    if (fitWidth.checked) {
      const avail = pdfScroll.clientWidth - 36;
      const base = page.getViewport({ scale: 1 }).width;
      return Math.max(0.3, avail / base);
    }
    return currentScale;
  }

  async function renderPage(wrap) {
    const num = parseInt(wrap.dataset.page, 10);
    if (rendered.has(num)) return;
    const page = await pdfDoc.getPage(num);
    const scale = computeScale(page);
    const vport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(vport.width * dpr);
    canvas.height = Math.floor(vport.height * dpr);
    canvas.style.width = Math.floor(vport.width) + "px";
    canvas.style.height = Math.floor(vport.height) + "px";
    await page.render({ canvasContext: ctx, viewport: vport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] }).promise;

    const overlay = document.createElement("canvas");
    overlay.className = "hl-overlay";
    overlay.style.pointerEvents = hlOn ? "auto" : "none";

    wrap.innerHTML = "";
    wrap.style.width = Math.floor(vport.width) + "px";
    wrap.style.height = Math.floor(vport.height) + "px";
    wrap.appendChild(canvas);
    wrap.appendChild(overlay);
    attachHl(overlay, num);
    rendered.add(num);

    const arr = await ensureHl(num);
    redrawHl(overlay, arr);
  }

  function clearRendered() {
    rendered.clear();
    [...viewport.children].forEach((wrap) => {
      if (wrap.classList.contains("page-wrap")) wrap.innerHTML = "";
    });
    renderVisible();
  }

  let renderQueued = false;
  function renderVisible() {
    const rootRect = pdfScroll.getBoundingClientRect();
    [...viewport.querySelectorAll(".page-wrap")].forEach((w) => {
      const r = w.getBoundingClientRect();
      if (r.bottom >= rootRect.top - 400 && r.top <= rootRect.bottom + 400) renderPage(w);
    });
  }

  let lastVisiblePage = 1;
  pdfScroll.addEventListener("scroll", () => {
    const wraps = [...viewport.querySelectorAll(".page-wrap")];
    const top = pdfScroll.scrollTop + 80;
    for (const w of wraps) {
      if (w.offsetTop <= top) lastVisiblePage = parseInt(w.dataset.page, 10);
      else break;
    }
    pageInfo.textContent = "Page " + lastVisiblePage + " / " + pdfDoc.numPages;
    if (!renderQueued) {
      renderQueued = true;
      requestAnimationFrame(() => { renderQueued = false; renderVisible(); });
    }
  });

  async function initPdf() {
    pdfDoc = await pdfjsLib.getDocument(PDF_URL).promise;
    $("pdfLoader")?.remove();
    pageInfo.textContent = "Page 1 / " + pdfDoc.numPages;
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const wrap = document.createElement("div");
      wrap.className = "page-wrap";
      wrap.dataset.page = i;
      wrap.style.minHeight = "400px";
      viewport.appendChild(wrap);
    }
    requestAnimationFrame(renderVisible);
  }

  zoomSel.addEventListener("change", () => { currentScale = parseFloat(zoomSel.value); clearRendered(); });
  fitWidth.addEventListener("change", clearRendered);
  $("nextPage").addEventListener("click", () => {
    const wrap = viewport.querySelector(`.page-wrap[data-page="${lastVisiblePage + 1}"]`);
    if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("prevPage").addEventListener("click", () => {
    const wrap = viewport.querySelector(`.page-wrap[data-page="${Math.max(1, lastVisiblePage - 1)}"]`);
    if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* =========================================================
     AUDIO PLAYER
     ========================================================= */
  const audio = new Audio();
  audio.preload = "auto";
  let currentTrack = 1;
  const tracklist = $("tracklist");

  function buildTracklist() {
    for (let i = 1; i <= TRACK_COUNT; i++) {
      const item = document.createElement("div");
      item.className = "track-item";
      item.dataset.track = i;
      item.innerHTML = `<span class="num">${i}</span><span>Track ${String(i).padStart(2, "0")}</span>`;
      item.addEventListener("click", () => loadTrack(i, true));
      tracklist.appendChild(item);
    }
  }
  function fmt(t) {
    if (!isFinite(t)) return "0:00";
    return Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
  }
  function loadTrack(n, autoplay) {
    currentTrack = n;
    audio.src = "assets/audio/track" + String(n).padStart(2, "0") + ".mp3";
    audio.load();
    $("trackTitle").textContent = "Track " + String(n).padStart(2, "0");
    [...tracklist.children].forEach((c) => c.classList.toggle("active", parseInt(c.dataset.track, 10) === n));
    if (autoplay) audio.play().catch(() => {});
  }
  $("playPause").addEventListener("click", () => { audio.paused ? audio.play().catch(() => {}) : audio.pause(); });
  $("nextTrack").addEventListener("click", () => loadTrack(Math.min(TRACK_COUNT, currentTrack + 1), true));
  $("prevTrack").addEventListener("click", () => loadTrack(Math.max(1, currentTrack - 1), true));
  $("speed").addEventListener("change", (e) => (audio.playbackRate = parseFloat(e.target.value)));
  audio.addEventListener("play", () => ($("playPause").textContent = "⏸"));
  audio.addEventListener("pause", () => ($("playPause").textContent = "▶"));
  audio.addEventListener("ended", () => { if (currentTrack < TRACK_COUNT) loadTrack(currentTrack + 1, true); });
  audio.addEventListener("timeupdate", () => {
    $("curTime").textContent = fmt(audio.currentTime);
    if (audio.duration) $("seek").value = (audio.currentTime / audio.duration) * 100;
  });
  audio.addEventListener("loadedmetadata", () => ($("durTime").textContent = fmt(audio.duration)));
  $("seek").addEventListener("input", (e) => { if (audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration; });

  /* =========================================================
     FREEHAND HIGHLIGHT
     ========================================================= */
  let hlOn = false;
  let hlColor = "#FFE45C";
  let hlSize = 18;
  const hlStrokes = new Map();   // pageNum -> [{color,width,points:[{x,y}...]}]  (normalized 0..1)
  const hlLoaded = new Set();

  const idb = (() => new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    try {
      if (typeof indexedDB === "undefined") return finish(null);
      const req = indexedDB.open("cs_hl", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("hl", { keyPath: "k" });
      req.onsuccess = () => finish(req.result);
      req.onerror = () => finish(null);
      req.onblocked = () => finish(null);
      setTimeout(() => finish(null), 3000);
    } catch (e) { finish(null); }
  }))();

  async function idbGet(k) {
    const db = await idb; if (!db) return null;
    return new Promise((res) => { const t = db.transaction("hl", "readonly").objectStore("hl").get(k); t.onsuccess = () => res(t.result); t.onerror = () => res(null); });
  }
  async function idbSet(k, v) {
    const db = await idb; if (!db) return;
    return new Promise((res) => { const t = db.transaction("hl", "readwrite").objectStore("hl").put({ k, ...v }); t.onsuccess = () => res(); t.onerror = () => res(); });
  }
  async function idbClearAll() {
    const db = await idb; if (!db) return;
    return new Promise((res) => { const t = db.transaction("hl", "readwrite").objectStore("hl").clear(); t.onsuccess = () => res(); t.onerror = () => res(); });
  }

  async function ensureHl(num) {
    if (hlLoaded.has(num)) return hlStrokes.get(num) || [];
    const data = await idbGet("hl_" + num);
    const arr = data ? data.strokes : [];
    hlStrokes.set(num, arr);
    hlLoaded.add(num);
    return arr;
  }
  function saveHl(num) { idbSet("hl_" + num, { strokes: hlStrokes.get(num) || [] }); }

  function drawSeg(ctx, W, H, a, b, color, width) {
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (window.devicePixelRatio || 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(a.x * W, a.y * H);
    ctx.lineTo(b.x * W, b.y * H);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function redrawHl(overlay, arr) {
    const ctx = overlay.getContext("2d");
    const W = overlay.width, H = overlay.height;
    ctx.clearRect(0, 0, W, H);
    (arr || []).forEach((s) => {
      for (let i = 1; i < s.points.length; i++) drawSeg(ctx, W, H, s.points[i - 1], s.points[i], s.color, s.width);
    });
  }

  function normPoint(e, overlay) {
    const r = overlay.getBoundingClientRect();
    let x = (e.clientX - r.left) / r.width;
    let y = (e.clientY - r.top) / r.height;
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    return { x, y };
  }

  function attachHl(overlay, num) {
    let drawing = false, last = null, current = null;
    overlay.addEventListener("pointerdown", (e) => {
      if (!hlOn) return;
      e.preventDefault();
      drawing = true;
      try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
      if (!hlStrokes.has(num)) hlStrokes.set(num, []);
      const p = normPoint(e, overlay);
      current = { color: hlColor, width: hlSize, points: [p] };
      hlStrokes.get(num).push(current);
      last = p;
    });
    overlay.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = normPoint(e, overlay);
      const ctx = overlay.getContext("2d");
      drawSeg(ctx, overlay.width, overlay.height, last, p, current.color, current.width);
      current.points.push(p);
      last = p;
    });
    const end = () => { if (drawing) { drawing = false; saveHl(num); } };
    overlay.addEventListener("pointerup", end);
    overlay.addEventListener("pointercancel", end);
  }

  /* ---------- highlight toolbar ---------- */
  function setHlMode(on) {
    hlOn = on;
    document.body.classList.toggle("hl-on", on);
    document.querySelectorAll(".hl-overlay").forEach((o) => (o.style.pointerEvents = on ? "auto" : "none"));
    const btn = $("hlToggle");
    btn.textContent = on ? "✏️ Highlight: ON" : "✏️ Highlight: OFF";
    btn.classList.toggle("active", on);
  }
  $("hlToggle").addEventListener("click", () => setHlMode(!hlOn));
  document.querySelectorAll("#swatches .swatch").forEach((s) => {
    s.addEventListener("click", () => {
      document.querySelectorAll("#swatches .swatch").forEach((x) => x.classList.remove("active"));
      s.classList.add("active");
      hlColor = s.dataset.color;
    });
  });
  $("hlSize").addEventListener("change", (e) => (hlSize = parseFloat(e.target.value)));
  $("clearPage").addEventListener("click", () => {
    const wrap = viewport.querySelector(`.page-wrap[data-page="${lastVisiblePage}"]`);
    if (!wrap) return;
    hlStrokes.set(lastVisiblePage, []);
    const ov = wrap.querySelector(".hl-overlay");
    if (ov) ov.getContext("2d").clearRect(0, 0, ov.width, ov.height);
    saveHl(lastVisiblePage);
    toast("Cleared page " + lastVisiblePage);
  });
  $("clearAll").addEventListener("click", () => {
    hlStrokes.clear(); hlLoaded.clear();
    document.querySelectorAll(".hl-overlay").forEach((o) => o.getContext("2d").clearRect(0, 0, o.width, o.height));
    idbClearAll();
    toast("Cleared all highlights");
  });

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg; el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  /* ---------- boot ---------- */
  fitWidth.checked = true;
  window.addEventListener("resize", () => { if (fitWidth.checked) { clearTimeout(window.__rt); window.__rt = setTimeout(clearRendered, 200); } });
  window.addEventListener("load", () => { if (fitWidth.checked) clearRendered(); });

  buildTracklist();
  initPdf().catch((e) => { viewport.innerHTML = '<div style="color:#fff;padding:30px">Failed to load PDF: ' + e.message + "</div>"; });
  loadTrack(1, false);
  const tryAuto = () => { audio.play().catch(() => {}); document.removeEventListener("click", tryAuto); document.removeEventListener("keydown", tryAuto); };
  document.addEventListener("click", tryAuto);
  document.addEventListener("keydown", tryAuto);
  audio.play().catch(() => {});
})();
