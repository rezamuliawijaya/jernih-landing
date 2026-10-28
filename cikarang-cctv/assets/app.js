(() => {
  "use strict";

  /* ---------- Data & constants ---------- */

  const CAMS = Array.isArray(window.CCTV_CAMERAS) ? window.CCTV_CAMERAS : [];
  const liveCams = CAMS.filter((cam) => cam.status === "live");
  const offlineCams = CAMS.filter((cam) => cam.status !== "live");
  const checkedAt = window.CCTV_CHECKED_AT ? new Date(window.CCTV_CHECKED_AT) : new Date();

  const MAX_ACTIVE = 9;
  const VISIBLE_MARGIN = 180;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const byId = (id) => CAMS.find((cam) => cam.id === id);

  const state = {
    cards: new Map(),
    controllers: new Map(),
    active: new Set(),
    visible: new Set(),
    failed: new Set(),
    manualPaused: new Set(),
    filterRegion: "all",
    query: "",
    observer: null,
    fitTimer: 0,
    markers: new Map(),
    map: null,
    modalController: null,
    modalCam: null,
    lastFocus: null
  };

  const icons = {
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.6"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>'
  };

  /* ---------- Helpers ---------- */

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));

  const mapsUrl = (cam) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cam.lat},${cam.lng}`)}`;

  const normalize = (value) =>
    String(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const shortRegion = (region) => String(region).replace("Kabupaten", "Kab.");

  function paintBadge(badge, textEl, kind, label) {
    if (!badge) return;
    badge.classList.remove("badge--live", "badge--wait", "badge--off");
    if (kind === "live") badge.classList.add("badge--live");
    else if (kind === "off") badge.classList.add("badge--off");
    else badge.classList.add("badge--wait");
    if (textEl) textEl.textContent = label;
  }

  function matchesQuery(cam) {
    if (!state.query) return true;
    const haystack = normalize([
      cam.name,
      cam.area,
      cam.road,
      cam.code,
      cam.regency,
      cam.source,
      cam.sourceShort
    ].join(" "));
    return haystack.includes(normalize(state.query));
  }

  function matchesFilter(cam) {
    if (state.filterRegion !== "all" && cam.regency !== state.filterRegion) return false;
    return matchesQuery(cam);
  }

  function isVisibleNow(card) {
    if (!card || card.hidden) return false;
    const rect = card.getBoundingClientRect();
    const height = window.innerHeight || document.documentElement.clientHeight;
    const width = window.innerWidth || document.documentElement.clientWidth;
    return (
      rect.bottom > -VISIBLE_MARGIN &&
      rect.top < height + VISIBLE_MARGIN &&
      rect.right > 0 &&
      rect.left < width
    );
  }

  /* ---------- Render ---------- */

  function renderMiniList() {
    const list = $("#mini-list");
    if (!list) return;
    const regions = ["Kota Bekasi", "Kabupaten Bekasi"];
    list.innerHTML = regions.map((region) => {
      const total = liveCams.filter((cam) => cam.regency === region).length;
      if (!total) return "";
      return `
        <li data-mini-region="${escapeHtml(region)}" data-state="live">
          <span class="mini-dot" aria-hidden="true"></span>
          <span class="mini-name">${escapeHtml(region)}<span class="mini-area"> · ${total} kamera</span></span>
          <span class="mini-status">${total} LIVE</span>
        </li>
      `;
    }).join("");
  }

  function renderLiveCards() {
    const grid = $("#live-grid");
    if (!grid) return;

    grid.innerHTML = liveCams.map((cam) => `
      <article class="cam-card" data-cam="${escapeHtml(cam.id)}" data-state="idle">
        <div class="cam-media" data-media>
          <video data-video muted autoplay playsinline preload="metadata" aria-label="Siaran langsung ${escapeHtml(cam.name)}"></video>
          <div class="cam-placeholder" data-placeholder>
            <div class="placeholder-inner">
              ${icons.camera}
              <span data-placeholder-text>Siaran belum dimuat</span>
            </div>
          </div>
          <div class="cam-veil" aria-hidden="true"></div>
          <div class="cam-top">
            <span class="badge badge--wait" data-badge>
              <span class="badge-dot" aria-hidden="true"></span>
              <span data-badge-text>Siap</span>
            </span>
            <span class="cam-code">${escapeHtml(cam.code)}</span>
          </div>
          <div class="cam-bottom">
            <div class="cam-title">
              <p class="cam-area">${escapeHtml(cam.area)} · ${escapeHtml(shortRegion(cam.regency))}</p>
              <h3>${escapeHtml(cam.name)}</h3>
            </div>
            <div class="cam-actions">
              <button class="icon-btn cam-toggle" type="button" data-action="toggle" data-paused="true" aria-label="Putar siaran: ${escapeHtml(cam.name)}" title="Putar siaran">
                <span class="icon-pause">${icons.pause}</span>
                <span class="icon-play">${icons.play}</span>
              </button>
              <button class="icon-btn" type="button" data-action="fullscreen" aria-label="Layar penuh: ${escapeHtml(cam.name)}" title="Layar penuh">
                ${icons.fullscreen}
              </button>
              <button class="icon-btn icon-btn--solid" type="button" data-action="expand" aria-label="Perbesar: ${escapeHtml(cam.name)}" title="Perbesar">
                ${icons.expand}
              </button>
            </div>
          </div>
          <div class="cam-fallback" data-fallback hidden>
            <p>Siaran tidak dapat dimuat.</p>
            <button class="btn btn-primary btn-small" type="button" data-action="retry">Coba lagi</button>
            <a class="text-link" href="${escapeHtml(cam.page)}" target="_blank" rel="noopener">Buka sumber resmi ${icons.external}</a>
          </div>
        </div>
        <div class="cam-meta">
          <span class="cam-source">${escapeHtml(cam.sourceShort)}</span>
          <span class="cam-road">${escapeHtml(cam.road)}</span>
          <a class="cam-link" href="${escapeHtml(cam.page)}" target="_blank" rel="noopener">Sumber ${icons.external}</a>
        </div>
      </article>
    `).join("");

    state.cards.clear();
    liveCams.forEach((cam) => {
      const card = $(`[data-cam="${cam.id}"]`, grid);
      if (card) state.cards.set(cam.id, card);
    });
  }

  function renderOfflineCards() {
    const wrap = $("#offline-wrap");
    const grid = $("#offline-grid");
    if (!wrap || !grid) return;

    if (!offlineCams.length) {
      wrap.hidden = true;
      return;
    }

    wrap.hidden = false;
    grid.innerHTML = offlineCams.map((cam) => `
      <a class="offline-card" href="${escapeHtml(cam.page)}" target="_blank" rel="noopener" aria-label="Buka sumber resmi ${escapeHtml(cam.name)}, ${escapeHtml(cam.area)}">
        <span class="offline-thumb" aria-hidden="true">${icons.camera}</span>
        <div class="offline-info">
          <h4 title="${escapeHtml(cam.road)}">${escapeHtml(cam.name)}</h4>
          <p>${escapeHtml(cam.area)} · ${escapeHtml(cam.regency)}</p>
        </div>
        <span class="offline-state">Belum bersiaran</span>
        ${icons.external}
      </a>
    `).join("");
  }

  function renderMapFallback() {
    const list = $("#map-fallback-list");
    if (!list) return;
    list.innerHTML = CAMS.map((cam) => `
      <li><a href="${escapeHtml(cam.page)}" target="_blank" rel="noopener">${escapeHtml(cam.name)} · ${escapeHtml(cam.area)}</a></li>
    `).join("");
  }

  function setCardState(cam, stateName) {
    const card = state.cards.get(cam.id);
    if (!card) return;

    card.dataset.state = stateName;

    const placeholderText = $("[data-placeholder-text]", card);
    const labels = {
      idle: "Siaran belum dimuat",
      connecting: "Menghubungkan siaran",
      wait: "Menunggu giliran siaran",
      paused: "Siaran dijeda",
      live: "LIVE",
      off: "Siaran tidak tersedia"
    };
    if (placeholderText) placeholderText.textContent = labels[stateName] || labels.idle;

    const toggle = $("[data-action='toggle']", card);
    if (toggle) {
      const paused = stateName !== "live" && stateName !== "connecting";
      toggle.dataset.paused = paused ? "true" : "false";
      toggle.disabled = stateName === "wait";
      toggle.title = paused ? "Putar siaran" : "Jeda siaran";
      toggle.setAttribute("aria-label", `${paused ? "Putar" : "Jeda"} siaran: ${cam.name}`);
    }

    const badge = $("[data-badge]", card);
    const badgeText = $("[data-badge-text]", card);
    if (stateName === "live") paintBadge(badge, badgeText, "live", "LIVE");
    else if (stateName === "off") paintBadge(badge, badgeText, "off", "Tidak tersedia");
    else if (stateName === "connecting") paintBadge(badge, badgeText, "wait", "Menghubungkan");
    else if (stateName === "paused") paintBadge(badge, badgeText, "wait", "Dijeda");
    else if (stateName === "wait") paintBadge(badge, badgeText, "wait", "Menunggu");
    else paintBadge(badge, badgeText, "wait", "Siap");

    const fallback = $("[data-fallback]", card);
    if (fallback && stateName !== "off") fallback.hidden = true;
  }

  function updateCounts() {
    const total = liveCams.length;
    const available = Math.max(0, total - state.failed.size);
    const countEl = $("#live-count");
    const totalEl = $("#live-total");
    const bar = $("#stat-bar-fill");

    if (countEl) countEl.textContent = String(available);
    if (totalEl) totalEl.textContent = `dari ${total} kamera publik`;
    if (bar) {
      bar.style.width = `${total ? (available / total) * 100 : 0}%`;
      bar.style.backgroundColor = available === total ? "var(--accent)" : "var(--amber)";
    }

    $$("[data-mini-region]").forEach((item) => {
      const region = item.dataset.miniRegion;
      const regionCams = liveCams.filter((cam) => cam.regency === region);
      const down = regionCams.filter((cam) => state.failed.has(cam.id)).length;
      const regionAvailable = regionCams.length - down;
      item.dataset.state = regionAvailable === 0 ? "off" : down > 0 ? "partial" : "live";
      const status = $(".mini-status", item);
      if (status) status.textContent = `${regionAvailable}/${regionCams.length} LIVE`;
    });
  }

  /* ---------- Player ---------- */

  function createPlayer({ video, url, badge, badgeText, fallback, onState }) {
    let hls = null;
    let attempts = 0;
    let destroyed = false;
    let isLive = false;

    const report = (kind, label) => {
      paintBadge(badge, badgeText, kind, label);
      if (typeof onState === "function") onState(kind);
    };

    const play = () => {
      const promise = video.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {
          if (!destroyed) report("wait", "Klik untuk putar");
        });
      }
    };

    const teardown = () => {
      if (hls) {
        hls.destroy();
        hls = null;
      }
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch (error) {
        /* Video sudah dilepas oleh browser. */
      }
    };

    const fail = () => {
      if (destroyed) return;
      isLive = false;
      if (hls) {
        hls.destroy();
        hls = null;
      }
      if (fallback) fallback.hidden = false;
      report("off", "Tidak tersedia");
    };

    const onPlaying = () => {
      if (destroyed) return;
      isLive = true;
      report("live", "LIVE");
    };

    const onWaiting = () => {
      if (!destroyed && !isLive) report("wait", "Buffering");
    };

    function attach() {
      if (destroyed) return;
      isLive = false;
      if (fallback) fallback.hidden = true;
      report("connecting", "Menghubungkan");

      video.muted = true;
      video.playsInline = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");

      if (window.Hls && window.Hls.isSupported()) {
        const instance = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          capLevelToPlayerSize: true,
          backBufferLength: 15,
          maxBufferLength: 10,
          maxMaxBufferLength: 24,
          liveSyncDurationCount: 3,
          manifestLoadingTimeOut: 12000,
          levelLoadingTimeOut: 12000,
          fragLoadingTimeOut: 20000
        });

        hls = instance;

        instance.on(window.Hls.Events.MANIFEST_PARSED, play);

        instance.on(window.Hls.Events.ERROR, (_event, data) => {
          if (!data || !data.fatal || destroyed) return;

          if (attempts < 2) {
            attempts += 1;

            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
              window.setTimeout(() => {
                if (!destroyed) instance.startLoad();
              }, 900 * attempts);
              return;
            }

            if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
              instance.recoverMediaError();
              return;
            }
          }

          fail();
        });

        instance.loadSource(url);
        instance.attachMedia(video);
        return;
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        video.addEventListener("loadedmetadata", play, { once: true });
        video.addEventListener("error", fail, { once: true });
        play();
        return;
      }

      fail();
    }

    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);

    return {
      start() {
        if (!destroyed && hls) return;
        destroyed = false;
        attempts = 0;
        teardown();
        attach();
      },
      refresh() {
        destroyed = false;
        attempts = 0;
        teardown();
        attach();
      },
      destroy() {
        destroyed = true;
        isLive = false;
        teardown();
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("waiting", onWaiting);
      }
    };
  }

  function activate(cam) {
    if (state.active.has(cam.id) || state.failed.has(cam.id) || state.manualPaused.has(cam.id)) return;
    const card = state.cards.get(cam.id);
    if (!card) return;

    const controller = createPlayer({
      video: $("[data-video]", card),
      url: cam.stream,
      badge: $("[data-badge]", card),
      badgeText: $("[data-badge-text]", card),
      fallback: $("[data-fallback]", card),
      onState(kind) {
        if (kind === "live") {
          state.failed.delete(cam.id);
          setCardState(cam, "live");
        } else if (kind === "off") {
          state.failed.add(cam.id);
          const current = state.controllers.get(cam.id);
          state.controllers.delete(cam.id);
          state.active.delete(cam.id);
          if (current) current.destroy();
          setCardState(cam, "off");
          updateCounts();
          window.setTimeout(syncPlayers, 0);
        } else if (card.dataset.state !== "live" && !state.manualPaused.has(cam.id)) {
          if (card.dataset.state !== "wait") setCardState(cam, "connecting");
        }
      }
    });

    state.active.add(cam.id);
    state.controllers.set(cam.id, controller);
    setCardState(cam, "connecting");
    controller.start();
  }

  function deactivate(cam) {
    const controller = state.controllers.get(cam.id);
    if (controller) controller.destroy();
    state.controllers.delete(cam.id);
    state.active.delete(cam.id);
    if (!state.manualPaused.has(cam.id)) setCardState(cam, "idle");
  }

  function pause(cam) {
    state.manualPaused.add(cam.id);
    deactivate(cam);
    setCardState(cam, "paused");
    syncPlayers();
  }

  function resume(cam) {
    state.manualPaused.delete(cam.id);
    state.failed.delete(cam.id);
    updateCounts();
    if (isVisibleNow(state.cards.get(cam.id))) {
      state.visible.add(cam.id);
      syncPlayers();
    } else {
      setCardState(cam, "idle");
    }
  }

  function syncPlayers() {
    for (const id of Array.from(state.active)) {
      if (!state.visible.has(id)) {
        const cam = byId(id);
        if (cam) deactivate(cam);
      }
    }

    let slots = MAX_ACTIVE - state.active.size;

    liveCams.forEach((cam) => {
      if (state.active.has(cam.id)) return;

      if (!state.visible.has(cam.id)) {
        if (!state.manualPaused.has(cam.id)) setCardState(cam, "idle");
        return;
      }

      if (state.manualPaused.has(cam.id)) {
        setCardState(cam, "paused");
        return;
      }

      if (state.failed.has(cam.id)) {
        setCardState(cam, "off");
        return;
      }

      if (slots > 0) {
        slots -= 1;
        activate(cam);
      } else {
        setCardState(cam, "wait");
      }
    });
  }

  function refreshVisibility() {
    liveCams.forEach((cam) => {
      const card = state.cards.get(cam.id);
      if (!card) return;
      if (isVisibleNow(card)) state.visible.add(cam.id);
      else state.visible.delete(cam.id);
    });
    syncPlayers();
  }

  function initObserver() {
    if (!("IntersectionObserver" in window)) {
      liveCams.forEach((cam) => state.visible.add(cam.id));
      syncPlayers();
      return;
    }

    state.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const id = entry.target.dataset.cam;
        if (!id) return;
        if (entry.isIntersecting && !entry.target.hidden) state.visible.add(id);
        else state.visible.delete(id);
      });
      syncPlayers();
    }, {
      rootMargin: `${VISIBLE_MARGIN}px 0px`,
      threshold: 0
    });

    state.cards.forEach((card) => state.observer.observe(card));
  }

  /* ---------- Fullscreen ---------- */

  function requestFullscreen(element) {
    if (!element) return;
    if (element.requestFullscreen) {
      element.requestFullscreen().catch(() => {});
      return;
    }
    const video = $("video", element);
    if (video && video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  }

  /* ---------- Modal ---------- */

  const modal = $("#modal");
  const modalVideo = $("#modal-video");
  const modalBadge = $("#modal-badge");
  const modalBadgeText = $("#modal-badge-text");
  const modalFallback = $("#modal-fallback");
  const modalMedia = $("#modal-media");
  const modalTitle = $("#modal-title");
  const modalArea = $("#modal-area");
  const modalCode = $("#modal-code");
  const modalSource = $("#modal-source");
  const modalSourceFallback = $("#modal-source-fallback");
  const modalMaps = $("#modal-maps");
  const modalRetry = $("#modal-retry");

  function clearModalVideo() {
    if (state.modalController) {
      state.modalController.destroy();
      state.modalController = null;
    }
    try {
      modalVideo.pause();
      modalVideo.removeAttribute("src");
      modalVideo.load();
    } catch (error) {
      /* Tidak ada sumber yang perlu dilepas. */
    }
  }

  function openModal(cam) {
    if (!cam || !modal) return;

    state.modalCam = cam;
    state.lastFocus = document.activeElement;

    modalTitle.textContent = cam.name;
    modalArea.textContent = `${cam.area} · ${cam.regency}`;
    modalCode.textContent = cam.code;
    modalSource.innerHTML = `${escapeHtml(cam.source)} ${icons.external}`;
    modalSource.href = cam.page;
    modalSourceFallback.href = cam.page;
    modalMaps.href = mapsUrl(cam);

    clearModalVideo();
    modalFallback.hidden = cam.status === "live";
    modalRetry.hidden = cam.status !== "live";
    paintBadge(modalBadge, modalBadgeText, cam.status === "live" ? "wait" : "off", cam.status === "live" ? "Menghubungkan" : "Belum bersiaran");

    modal.hidden = false;
    document.body.classList.add("modal-open");

    if (cam.status === "live") {
      state.modalController = createPlayer({
        video: modalVideo,
        url: cam.stream,
        badge: modalBadge,
        badgeText: modalBadgeText,
        fallback: modalFallback
      });
      state.modalController.start();
    }

    requestAnimationFrame(() => $("#modal-close")?.focus());
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    clearModalVideo();
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    state.modalCam = null;
    if (state.lastFocus && typeof state.lastFocus.focus === "function") {
      state.lastFocus.focus();
    }
  }

  function trapFocus(event) {
    if (modal.hidden || event.key !== "Tab") return;
    const focusable = $$('a[href], button:not([disabled]), video, [tabindex]:not([tabindex="-1"])', modal)
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ---------- Map ---------- */

  function initMap() {
    const mapEl = $("#map");
    const fallback = $("#map-fallback");
    if (!mapEl) return;

    if (!window.L) {
      mapEl.hidden = true;
      if (fallback) fallback.hidden = false;
      return;
    }

    try {
      const map = window.L.map(mapEl, {
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: true
      });

      window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      CAMS.forEach((cam) => {
        const live = cam.status === "live";
        const regionClass = cam.regency === "Kota Bekasi" ? "map-pin--kota" : "map-pin--kab";
        const icon = window.L.divIcon({
          className: `map-pin ${regionClass} ${live ? "map-pin--live" : "map-pin--off"}`,
          html: `${live ? '<span class="map-pin__pulse"></span>' : ""}<span class="map-pin__dot"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          popupAnchor: [0, -10]
        });

        const button = live
          ? `<button type="button" data-open-cam="${escapeHtml(cam.id)}">Buka siaran</button>`
          : '<button type="button" disabled>Belum bersiaran</button>';

        const marker = window.L.marker([cam.lat, cam.lng], { icon, title: cam.name })
          .addTo(map)
          .bindPopup(`
            <div class="map-popup">
              <span>${escapeHtml(cam.area)} · ${escapeHtml(cam.regency)}</span>
              <strong>${escapeHtml(cam.name)}</strong>
              <small>${escapeHtml(cam.road)}</small>
              ${button}
            </div>
          `);

        state.markers.set(cam.id, marker);
      });

      const bounds = window.L.latLngBounds(CAMS.map((cam) => [cam.lat, cam.lng]));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });

      window.L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

      mapEl.addEventListener("click", (event) => {
        const button = event.target.closest("[data-open-cam]");
        if (!button) return;
        const cam = byId(button.dataset.openCam);
        if (cam) openModal(cam);
      });

      state.map = map;
      window.setTimeout(() => map.invalidateSize(), 350);
      window.addEventListener("resize", () => map.invalidateSize(), { passive: true });

      state.markers.forEach((marker) => marker.on("popupopen", () => map.panInside(marker.getLatLng(), { padding: [80, 80] })));
    } catch (error) {
      mapEl.hidden = true;
      if (fallback) fallback.hidden = false;
    }
  }

  function applyMapFilter() {
    if (!state.map) return;
    let visibleCount = 0;
    CAMS.forEach((cam) => {
      const marker = state.markers.get(cam.id);
      if (!marker) return;
      const match = matchesFilter(cam);
      if (match) {
        visibleCount += 1;
        if (!state.map.hasLayer(marker)) marker.addTo(state.map);
      } else if (state.map.hasLayer(marker)) {
        state.map.removeLayer(marker);
      }
    });
    return visibleCount;
  }

  function fitMapToFilter() {
    if (!state.map) return;
    const points = CAMS.filter(matchesFilter).map((cam) => [cam.lat, cam.lng]);
    if (!points.length) return;
    if (points.length === 1) {
      state.map.setView(points[0], 14);
      return;
    }
    state.map.fitBounds(window.L.latLngBounds(points), { padding: [48, 48], maxZoom: 13 });
  }

  function scheduleFit() {
    window.clearTimeout(state.fitTimer);
    state.fitTimer = window.setTimeout(fitMapToFilter, 340);
  }

  /* ---------- Filters ---------- */

  function applyFilters() {
    const status = $("#filter-status");
    const noResults = $("#no-results");
    const tabs = $$(".filter-tab");
    let shown = 0;

    tabs.forEach((tab) => {
      const active = tab.dataset.filterRegion === state.filterRegion;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", active ? "true" : "false");
    });

    liveCams.forEach((cam) => {
      const card = state.cards.get(cam.id);
      if (!card) return;
      const match = matchesFilter(cam);
      card.hidden = !match;
      if (match) shown += 1;
      else state.visible.delete(cam.id);
    });

    if (noResults) noResults.hidden = shown !== 0;

    if (status) {
      let text = `Menampilkan ${shown} dari ${liveCams.length} kamera live`;
      if (state.filterRegion !== "all") text += ` · ${state.filterRegion}`;
      if (state.query) text += ` · “${state.query}”`;
      status.textContent = text;
    }

    applyMapFilter();
    refreshVisibility();
    scheduleFit();
  }

  /* ---------- Clock ---------- */

  function initClock() {
    const clock = $("#clock");
    const checked = $("#checked-at");
    const timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });

    const dateFormatter = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });

    const dayFormatter = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    const tick = () => {
      if (clock) clock.textContent = timeFormatter.format(new Date());
    };

    const paintChecked = (date) => {
      if (checked) {
        checked.textContent = `${dateFormatter.format(date).replace(/(\d{2})\.(\d{2})$/, "$1:$2")} WIB`;
        checked.setAttribute("datetime", date.toISOString());
      }
      const footerChecked = $("#footer-checked");
      if (footerChecked) footerChecked.textContent = dayFormatter.format(date);
    };

    tick();
    paintChecked(checkedAt);
    window.setInterval(tick, 1000);
  }

  /* ---------- Events ---------- */

  function initEvents() {
    const grid = $("#live-grid");
    if (grid) {
      grid.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        const card = button.closest("[data-cam]");
        if (!card) return;
        const cam = byId(card.dataset.cam);
        if (!cam) return;

        const action = button.dataset.action;
        if (action === "expand") openModal(cam);
        if (action === "fullscreen") requestFullscreen($("[data-media]", card));
        if (action === "toggle") {
          if (state.manualPaused.has(cam.id)) {
            resume(cam);
          } else if (state.active.has(cam.id)) {
            pause(cam);
            updateCounts();
          } else {
            state.failed.delete(cam.id);
            updateCounts();
            state.visible.add(cam.id);
            syncPlayers();
          }
        }
        if (action === "retry") {
          state.failed.delete(cam.id);
          state.manualPaused.delete(cam.id);
          updateCounts();
          state.visible.add(cam.id);
          syncPlayers();
        }
      });
    }

    const filterTabs = $(".filter-tabs");
    if (filterTabs) {
      filterTabs.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-filter-region]");
        if (!tab) return;
        state.filterRegion = tab.dataset.filterRegion;
        applyFilters();
      });
    }

    const search = $("#cam-search");
    if (search) {
      search.addEventListener("input", () => {
        state.query = search.value.trim();
        applyFilters();
      });
      search.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          search.value = "";
          state.query = "";
          applyFilters();
          search.blur();
        }
      });
    }

    const refresh = $("#refresh-all");
    if (refresh) {
      refresh.addEventListener("click", () => {
        refresh.classList.add("is-spinning");
        refresh.setAttribute("aria-busy", "true");
        window.setTimeout(() => {
          refresh.classList.remove("is-spinning");
          refresh.removeAttribute("aria-busy");
        }, 900);
        state.failed.clear();
        state.controllers.forEach((controller, id) => {
          const cam = byId(id);
          if (cam) setCardState(cam, "connecting");
          controller.refresh();
        });
        updateCounts();
        refreshVisibility();
      });
    }

    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target.closest("[data-close='modal']")) closeModal();
      });

      $("#modal-close")?.addEventListener("click", closeModal);

      $("#modal-fullscreen")?.addEventListener("click", () => requestFullscreen(modalMedia));

      modalRetry?.addEventListener("click", () => {
        const cam = state.modalCam;
        if (!cam || cam.status !== "live") return;
        clearModalVideo();
        state.modalController = createPlayer({
          video: modalVideo,
          url: cam.stream,
          badge: modalBadge,
          badgeText: modalBadgeText,
          fallback: modalFallback
        });
        state.modalController.start();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeModal();
        trapFocus(event);
      });

      modalVideo.addEventListener("dblclick", () => requestFullscreen(modalMedia));
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealItems = $$(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-in"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px" });

    revealItems.forEach((item) => observer.observe(item));
  }

  /* ---------- Boot ---------- */

  function boot() {
    const grid = $("#live-grid");
    if (!CAMS.length) {
      if (grid) grid.innerHTML = '<p class="noscript">Data kamera tidak ditemukan.</p>';
      return;
    }

    const tabs = $$(".filter-tab");
    tabs.forEach((tab) => {
      const region = tab.dataset.filterRegion;
      const count = region === "all" ? liveCams.length : liveCams.filter((cam) => cam.regency === region).length;
      const label = $("span", tab);
      if (label) label.textContent = String(count);
    });

    renderMiniList();
    renderLiveCards();
    renderOfflineCards();
    renderMapFallback();
    updateCounts();
    initMap();
    initClock();
    initEvents();
    initObserver();
    applyFilters();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
