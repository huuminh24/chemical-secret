/* =========================================================
   Chemical Secret — Reader + Audio + Rectangle Highlight
   ========================================================= */
(function () {
  "use strict";

  const PDF_URL = "assets/Chemical-Secret.pdf";
  const TRACK_COUNT = 12;
  const HL_ALPHA = 0.35;

  /* ---------- pdf.js setup ---------- */
  const pdfjsLib = window["pdfjsLib"];
  if (pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc = "";

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
     PDF RENDERING
     ========================================================= */
  function computeScale(page) {
    if (fitWidth.checked) {
      const avail = pdfScroll.clientWidth - 36;
      return Math.max(0.3, avail / page.getViewport({ scale: 1 }).width);
    }
    return currentScale;
  }

  async function renderPage(wrap) {
    const num = parseInt(wrap.dataset.page, 10);
    if (rendered.has(num)) return;
    const page = await pdfDoc.getPage(num);
    const scale = computeScale(page);
    const vport = page.getViewport({ scale });
    const cssW = Math.floor(vport.width);
    const cssH = Math.floor(vport.height);
    const dpr = window.devicePixelRatio || 1;

    /* --- PDF canvas --- */
    const pdfCanvas = document.createElement("canvas");
    pdfCanvas.className = "pdf-canvas";
    pdfCanvas.width = Math.floor(vport.width * dpr);
    pdfCanvas.height = Math.floor(vport.height * dpr);
    pdfCanvas.style.width = cssW + "px";
    pdfCanvas.style.height = cssH + "px";
    await page.render({
      canvasContext: pdfCanvas.getContext("2d"),
      viewport: vport,
      transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0],
    }).promise;

    /* --- Highlight canvas (on top of PDF, semi-transparent rects) --- */
    const hlCanvas = document.createElement("canvas");
    hlCanvas.className = "hl-canvas";
    hlCanvas.width = cssW * dpr;
    hlCanvas.height = cssH * dpr;
    hlCanvas.style.width = cssW + "px";
    hlCanvas.style.height = cssH + "px";

    /* --- Interaction layer (transparent, captures mouse) --- */
    const hlDiv = document.createElement("div");
    hlDiv.className = "hl-interaction";

    wrap.innerHTML = "";
    wrap.style.width = cssW + "px";
    wrap.style.height = cssH + "px";
    wrap.appendChild(pdfCanvas);
    wrap.appendChild(hlCanvas);
    wrap.appendChild(hlDiv);
    rendered.add(num);

    drawHlPage(num, hlCanvas);
    attachHlDrag(num, hlCanvas, hlDiv, cssW, cssH, dpr);
  }

  /* ---------- render visibility (scroll-based, concurrency-limited) ---------- */
  let renderQueued = false;
  const renderQueue = [];
  let rendering = 0;
  const MAX_RENDER = 3;

  function enqueueRender(wrap) {
    const num = parseInt(wrap.dataset.page, 10);
    if (rendered.has(num) || renderQueue.includes(wrap)) return;
    renderQueue.push(wrap);
    pumpRender();
  }
  function pumpRender() {
    while (rendering < MAX_RENDER && renderQueue.length) {
      const w = renderQueue.shift();
      rendering++;
      Promise.resolve(renderPage(w)).finally(() => { rendering--; pumpRender(); });
    }
  }
  function renderVisible() {
    const rootRect = pdfScroll.getBoundingClientRect();
    [...viewport.querySelectorAll(".page-wrap")].forEach((w) => {
      const r = w.getBoundingClientRect();
      if (r.bottom >= rootRect.top - 400 && r.top <= rootRect.bottom + 400) enqueueRender(w);
    });
  }
  function clearRendered() {
    rendered.clear();
    [...viewport.children].forEach((w) => { if (w.classList.contains("page-wrap")) w.innerHTML = ""; });
    renderVisible();
  }

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
  let lastVisiblePage = 1;

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

  fitWidth.checked = true;
  window.addEventListener("resize", () => { if (fitWidth.checked) { clearTimeout(window.__rt); window.__rt = setTimeout(clearRendered, 200); } });
  window.addEventListener("load", () => { if (fitWidth.checked) clearRendered(); });
  zoomSel.addEventListener("change", () => { currentScale = parseFloat(zoomSel.value); clearRendered(); });
  fitWidth.addEventListener("change", clearRendered);
  $("nextPage").addEventListener("click", () => {
    const w = viewport.querySelector('.page-wrap[data-page="' + (lastVisiblePage + 1) + '"]');
    if (w) w.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("prevPage").addEventListener("click", () => {
    const w = viewport.querySelector('.page-wrap[data-page="' + Math.max(1, lastVisiblePage - 1) + '"]');
    if (w) w.scrollIntoView({ behavior: "smooth", block: "start" });
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
      item.innerHTML = '<span class="num">' + i + '</span><span>Track ' + String(i).padStart(2, "0") + "</span>";
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
     RECTANGLE HIGHLIGHT
     ========================================================= */
  let hlOn = false;
  let hlColor = "#FFE45C";

  function hlKey(num) { return "cs_hl_" + num; }
  function loadHl(num) {
    try { return JSON.parse(localStorage.getItem(hlKey(num))) || []; } catch { return []; }
  }
  function saveHl(num, arr) { localStorage.setItem(hlKey(num), JSON.stringify(arr)); }

  function drawHlPage(num, hlCanvas) {
    const ctx = hlCanvas.getContext("2d");
    const W = hlCanvas.width, H = hlCanvas.height;
    ctx.clearRect(0, 0, W, H);
    const rects = loadHl(num);
    rects.forEach((r) => {
      ctx.globalAlpha = HL_ALPHA;
      ctx.fillStyle = r.color;
      const x = Math.min(r.x1, r.x2) * W;
      const y = Math.min(r.y1, r.y2) * H;
      const w = Math.abs(r.x2 - r.x1) * W;
      const h = Math.abs(r.y2 - r.y1) * H;
      ctx.fillRect(x, y, w, h);
    });
    ctx.globalAlpha = 1;
  }

  function attachHlDrag(num, hlCanvas, hlDiv, cssW, cssH, dpr) {
    let dragging = false, startPx = null, startPy = null;
    const ctx = hlCanvas.getContext("2d");

    hlDiv.addEventListener("pointerdown", (e) => {
      if (!hlOn) return;
      e.preventDefault();
      dragging = true;
      const r = hlDiv.getBoundingClientRect();
      startPx = (e.clientX - r.left) / r.width;
      startPy = (e.clientY - r.top) / r.height;
      try { hlDiv.setPointerCapture(e.pointerId); } catch (_) {}
    });

    hlDiv.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      e.preventDefault();
      const r = hlDiv.getBoundingClientRect();
      const curX = (e.clientX - r.left) / r.width;
      const curY = (e.clientY - r.top) / r.height;

      /* redraw all saved rects + preview */
      const W = hlCanvas.width, H = hlCanvas.height;
      ctx.clearRect(0, 0, W, H);
      const saved = loadHl(num);
      saved.forEach((s) => {
        ctx.globalAlpha = HL_ALPHA;
        ctx.fillStyle = s.color;
        const x = Math.min(s.x1, s.x2) * W;
        const y = Math.min(s.y1, s.y2) * H;
        const w = Math.abs(s.x2 - s.x1) * W;
        const h = Math.abs(s.y2 - s.y1) * H;
        ctx.fillRect(x, y, w, h);
      });
      /* preview rectangle (dashed border) */
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = hlColor;
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      const px = Math.min(startPx, curX) * W;
      const py = Math.min(startPy, curY) * H;
      const pw = Math.abs(curX - startPx) * W;
      const ph = Math.abs(curY - startPy) * H;
      ctx.strokeRect(px, py, pw, ph);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      const r = hlDiv.getBoundingClientRect();
      const endX = (e.clientX - r.left) / r.width;
      const endY = (e.clientY - r.top) / r.height;
      /* ignore tiny accidental clicks */
      if (Math.abs(endX - startPx) < 0.005 && Math.abs(endY - startPy) < 0.005) {
        drawHlPage(num, hlCanvas);
        return;
      }
      const saved = loadHl(num);
      saved.push({ color: hlColor, x1: startPx, y1: startPy, x2: endX, y2: endY });
      saveHl(num, saved);
      drawHlPage(num, hlCanvas);
    };
    hlDiv.addEventListener("pointerup", endDrag);
    hlDiv.addEventListener("pointercancel", endDrag);
  }

  /* ---------- highlight toolbar ---------- */
  function setHlMode(on) {
    hlOn = on;
    document.body.classList.toggle("hl-on", on);
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

  $("clearPage").addEventListener("click", () => {
    saveHl(lastVisiblePage, []);
    const w = viewport.querySelector('.page-wrap[data-page="' + lastVisiblePage + '"]');
    const c = w?.querySelector(".hl-canvas");
    if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
    toast("Cleared page " + lastVisiblePage);
  });

  $("clearAll").addEventListener("click", () => {
    for (let i = 1; i <= 79; i++) localStorage.removeItem(hlKey(i));
    document.querySelectorAll(".hl-canvas").forEach((c) => c.getContext("2d").clearRect(0, 0, c.width, c.height));
    toast("Cleared all highlights");
  });

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  /* ---------- boot ---------- */
  buildTracklist();
  initPdf().catch((e) => {
    viewport.innerHTML = '<div style="color:#fff;padding:30px">Failed to load PDF: ' + e.message + "</div>";
  });
  loadTrack(1, false);
  const tryAuto = () => { audio.play().catch(() => {}); document.removeEventListener("click", tryAuto); document.removeEventListener("keydown", tryAuto); };
  document.addEventListener("click", tryAuto);
  document.addEventListener("keydown", tryAuto);
  audio.play().catch(() => {});
})();
