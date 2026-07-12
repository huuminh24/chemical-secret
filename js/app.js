/* =========================================================
   Chemical Secret — Reader + Audio + Migaku-style mining
   Pure static, no backend. Files served from same origin.
   ========================================================= */
(function () {
  "use strict";

  const PDF_URL = "assets/Chemical-Secret.pdf";
  const TRACK_COUNT = 12;
  const MINED_KEY = "cs_mined_v1";

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
     PDF RENDERING
     ========================================================= */
  function computeScale(page) {
    if (fitWidth.checked) {
      const avail = pdfScroll.clientWidth - 36; // padding
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

    const textDiv = document.createElement("div");
    textDiv.className = "textLayer";
    textDiv.style.setProperty("--scale-factor", vport.scale);
    const textContent = await page.getTextContent();
    const task = pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: textDiv,
      viewport: vport,
      textDivs: [],
    });
    await task.promise;

    wrap.innerHTML = "";
    wrap.style.width = Math.floor(vport.width) + "px";
    wrap.style.height = Math.floor(vport.height) + "px";
    wrap.appendChild(canvas);
    wrap.appendChild(textDiv);
    rendered.add(num);
  }

  function clearRendered() {
    rendered.clear();
    [...viewport.children].forEach((wrap) => {
      if (wrap.classList.contains("page-wrap")) {
        wrap.innerHTML = "";
      }
    });
    observePages();
  }

  let io = null;
  function observePages() {
    if (io) io.disconnect();
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            renderPage(e.target);
            io.unobserve(e.target);
          }
        });
      },
      { root: pdfScroll, rootMargin: "300px 0px" }
    );
    [...viewport.children].forEach((c) => {
      if (c.classList.contains("page-wrap")) io.observe(c);
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
    observePages();
  }

  zoomSel.addEventListener("change", () => {
    currentScale = parseFloat(zoomSel.value);
    clearRendered();
  });
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
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function loadTrack(n, autoplay) {
    currentTrack = n;
    audio.src = "assets/audio/track" + String(n).padStart(2, "0") + ".mp3";
    audio.load();
    $("trackTitle").textContent = "Track " + String(n).padStart(2, "0");
    [...tracklist.children].forEach((c) =>
      c.classList.toggle("active", parseInt(c.dataset.track, 10) === n)
    );
    if (autoplay) audio.play().catch(() => {});
  }

  $("playPause").addEventListener("click", () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  $("nextTrack").addEventListener("click", () => loadTrack(Math.min(TRACK_COUNT, currentTrack + 1), true));
  $("prevTrack").addEventListener("click", () => loadTrack(Math.max(1, currentTrack - 1), true));
  $("speed").addEventListener("change", (e) => (audio.playbackRate = parseFloat(e.target.value)));
  audio.addEventListener("play", () => ($("playPause").textContent = "⏸"));
  audio.addEventListener("pause", () => ($("playPause").textContent = "▶"));
  audio.addEventListener("ended", () => {
    if (currentTrack < TRACK_COUNT) loadTrack(currentTrack + 1, true);
  });
  audio.addEventListener("timeupdate", () => {
    $("curTime").textContent = fmt(audio.currentTime);
    if (audio.duration) $("seek").value = (audio.currentTime / audio.duration) * 100;
  });
  audio.addEventListener("loadedmetadata", () => ($("durTime").textContent = fmt(audio.duration)));
  $("seek").addEventListener("input", (e) => {
    if (audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration;
  });

  /* =========================================================
     MINING (Migaku-style)
     ========================================================= */
  const popup = $("minePopup");
  let activeWord = "";
  let activeSentence = "";

  function cleanWord(t) {
    return (t || "").replace(/[^\p{L}\p{M}'’-]/gu, "").toLowerCase();
  }

  function getPageText(wrap) {
    const spans = wrap.querySelectorAll(".textLayer > span");
    return [...spans].map((s) => s.textContent).join(" ").replace(/\s+/g, " ");
  }

  function sentenceAround(pageText, word) {
    const w = cleanWord(word);
    if (!w) return pageText.slice(0, 200);
    const re = new RegExp(w, "i");
    const idx = pageText.search(re);
    if (idx < 0) return pageText.slice(0, 200);
    const start = pageText.lastIndexOf(".", idx) + 1;
    let end = pageText.indexOf(".", idx + w.length);
    if (end < 0) end = pageText.length;
    let sent = pageText.slice(start, end + 1).trim();
    if (sent.length > 400) sent = sent.slice(0, 400) + "…";
    return sent;
  }

  function highlight(sentence, word) {
    const w = cleanWord(word);
    if (!w) return sentence;
    return sentence.replace(new RegExp("(" + w + ")", "i"), "<mark>$1</mark>");
  }

  async function fetchDef(word) {
    try {
      const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word));
      if (!r.ok) return "(no definition found)";
      const data = await r.json();
      const entry = data[0];
      let html = "";
      if (entry.phonetic) html += `<div class="pos">/${entry.phonetic}/</div>`;
      const meanings = entry.meanings || [];
      meanings.slice(0, 3).forEach((m) => {
        const def = (m.definitions && m.definitions[0] && m.definitions[0].definition) || "";
        html += `<div><span class="pos">${m.partOfSpeech}</span> ${def}</div>`;
      });
      return html || "(no definition found)";
    } catch (e) {
      return "(offline — definition unavailable)";
    }
  }

  async function openPopup(word, pageText, x, y) {
    activeWord = cleanWord(word) || word;
    activeSentence = sentenceAround(pageText, word);
    $("mpWord").textContent = word;
    $("mpSentence").innerHTML = highlight(activeSentence, word);
    $("mpDef").textContent = "Loading definition…";
    popup.classList.remove("hidden");
    positionPopup(x, y);
    const def = await fetchDef(activeWord);
    $("mpDef").innerHTML = def;
  }

  function positionPopup(x, y) {
    const w = 320, h = popup.offsetHeight || 200;
    let left = x + 12, top = y + 12;
    if (left + w > window.innerWidth - 10) left = window.innerWidth - w - 10;
    if (top + h > window.innerHeight - 10) top = y - h - 12;
    popup.style.left = Math.max(10, left) + "px";
    popup.style.top = Math.max(10, top) + "px";
  }

  viewport.addEventListener("click", (e) => {
    const span = e.target.closest(".textLayer > span");
    if (!span) return;
    const wrap = span.closest(".page-wrap");
    if (!wrap) return;
    const word = span.textContent.trim();
    if (!cleanWord(word)) return;
    openPopup(word, getPageText(wrap), e.clientX, e.clientY);
  });
  $("mpClose").addEventListener("click", () => popup.classList.add("hidden"));
  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && !e.target.closest(".textLayer > span")) popup.classList.add("hidden");
  });

  /* ---------- storage + export ---------- */
  function getMined() {
    try { return JSON.parse(localStorage.getItem(MINED_KEY)) || []; } catch { return []; }
  }
  function saveMined(arr) {
    localStorage.setItem(MINED_KEY, JSON.stringify(arr));
    $("minedCount").textContent = arr.length;
  }
  function renderMined() {
    const arr = getMined();
    const list = $("minedList");
    list.innerHTML = "";
    arr.slice().reverse().forEach((m) => {
      const c = document.createElement("div");
      c.className = "mined-card";
      c.innerHTML =
        `<div class="w">${esc(m.word)}</div>` +
        `<div class="s">${esc(m.sentence)}</div>` +
        `<div class="d">${m.def ? esc(m.def.replace(/<[^>]+>/g, "")) : ""}</div>` +
        `<div class="meta">Track ${m.track} · p.${m.page} · ${new Date(m.ts).toLocaleString()}</div>`;
      list.appendChild(c);
    });
  }
  function esc(s) {
    return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  $("mpMine").addEventListener("click", () => {
    const arr = getMined();
    arr.push({
      word: activeWord,
      sentence: activeSentence,
      def: $("mpDef").textContent,
      track: currentTrack,
      page: lastVisiblePage,
      ts: Date.now(),
    });
    saveMined(arr);
    toast("Mined: " + activeWord);
    popup.classList.add("hidden");
  });
  $("mpCopy").addEventListener("click", () => {
    const text = activeWord + " — " + activeSentence;
    navigator.clipboard?.writeText(text);
    toast("Copied");
  });

  $("exportAnki").addEventListener("click", () => {
    const arr = getMined();
    if (!arr.length) return toast("Nothing mined yet");
    const lines = arr.map((m) =>
      [m.word, m.sentence, m.def ? m.def.replace(/<[^>]+>/g, " ").replace(/\t/g, " ") : "", "ChemicalSecret"].join("\t")
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "chemical-secret-mined.txt";
    a.click();
    toast("Exported " + arr.length + " cards");
  });

  $("sendAnkiConnect").addEventListener("click", async () => {
    const arr = getMined();
    if (!arr.length) return toast("Nothing mined yet");
    let ok = 0;
    for (const m of arr) {
      const note = {
        deckName: "Chemical Secret",
        modelName: "Basic",
        fields: { Front: m.word, Back: m.def + "<br><br>" + m.sentence },
        tags: ["ChemicalSecret", "track" + m.track],
      };
      try {
        const r = await fetch("http://localhost:8765", {
          method: "POST",
          body: JSON.stringify({ action: "addNote", version: 6, params: { note } }),
        });
        const j = await r.json();
        if (j.error === null) ok++;
      } catch (e) { /* AnkiConnect not running */ }
    }
    toast(ok ? "Sent " + ok + " cards to Anki" : "AnkiConnect not running (open Anki first)");
  });

  $("clearMined").addEventListener("click", () => {
    if (confirm("Clear all mined cards?")) { saveMined([]); renderMined(); }
  });

  /* ---------- tabs ---------- */
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      t.classList.add("active");
      $("view-" + t.dataset.view).classList.add("active");
      if (t.dataset.view === "mined") renderMined();
    })
  );

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  /* ---------- robust fit-to-width (override form restoration) ---------- */
  fitWidth.checked = true;
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (!fitWidth.checked) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(clearRendered, 200);
  });
  // Re-fit once layout + pdf.js are fully ready (avoids early wrong measurement)
  window.addEventListener("load", () => { if (fitWidth.checked) clearRendered(); });

  /* =========================================================
     BOOT — auto open PDF + audio (per request)
     ========================================================= */
  buildTracklist();
  saveMined(getMined());
  initPdf().catch((e) => {
    viewport.innerHTML = '<div style="color:#fff;padding:30px">Failed to load PDF: ' + e.message + "</div>";
  });
  // Auto-load audio track 1. Autoplay may be blocked until first interaction.
  loadTrack(1, false);
  const tryAuto = () => {
    audio.play().catch(() => {});
    document.removeEventListener("click", tryAuto);
    document.removeEventListener("keydown", tryAuto);
  };
  document.addEventListener("click", tryAuto);
  document.addEventListener("keydown", tryAuto);
  // attempt immediately too (works if browser allows)
  audio.play().catch(() => {});
})();
