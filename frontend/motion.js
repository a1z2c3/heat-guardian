(function () {
  const MOTION_NS = "HeatGuardianMotion";
  const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  const bootSelectors = [
    ".command-nav-shell",
    ".hero-copy",
    ".hero-aside",
    ".track-card",
    ".bridge-card",
    ".hero-stage",
    ".hero-callout",
    ".summary-pill",
    ".hero-evidence-card",
    ".status-banner",
    ".signal-ticker-shell",
    "#section-overview",
    ".metrics-shell",
  ];
  const sectionSelectors = [
    ".panel-head",
    ".toolbar",
    ".briefing-card",
    ".scenario-focus",
    ".focus-kpi",
    ".action-card",
    ".site-card",
    ".source-card",
    ".metric-row",
    ".workflow-step",
    ".card",
    ".chart",
    ".spatial-stage",
    ".spatial-side",
    ".site-spotlight > *",
    ".table-wrap",
  ];

  let initialized = false;
  let booted = false;
  let observerBound = false;
  let progressTrigger = null;
  let spatialTimeline = null;
  const counterTweens = new Map();

  function getGsap() {
    return window.gsap || null;
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia(REDUCED_MOTION_QUERY).matches);
  }

  function canAnimate() {
    return Boolean(getGsap()) && !prefersReducedMotion();
  }

  function registerPlugins() {
    const gsap = getGsap();
    if (!gsap) return;
    const plugins = [
      window.ScrollTrigger,
      window.Flip,
      window.MotionPathPlugin,
      window.Observer,
      window.SplitText,
    ].filter(Boolean);
    if (plugins.length) {
      gsap.registerPlugin(...plugins);
    }
  }

  function getSectionLabel(targetId) {
    const section = targetId ? document.getElementById(targetId) : null;
    const chapter = section?.dataset.chapter || "";
    const title = section
      ?.querySelector("h1, h2, .panel-title, .track-title, .spotlight-title")
      ?.textContent?.trim();
    return [chapter, title].filter(Boolean).join(" / ") || targetId || "MISSION";
  }

  function limitedElements(root, selectors, max = 14) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(selectors.join(","))).slice(0, max);
  }

  function setupProgressTrigger() {
    const gsap = getGsap();
    if (!gsap || !window.ScrollTrigger || progressTrigger) return;
    const bar = document.getElementById("page-progress-bar");
    const page = document.querySelector(".page");
    if (!bar || !page) return;
    const setProgress = gsap.quickSetter(bar, "scaleX");
    progressTrigger = window.ScrollTrigger.create({
      trigger: page,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => setProgress(self.progress),
    });
  }

  function setupObserverNavigation() {
    const gsap = getGsap();
    if (!gsap || !window.Observer || observerBound) return;
    const nav = document.getElementById("command-nav");
    if (!nav) return;

    const move = (delta) => {
      const links = Array.from(nav.querySelectorAll(".command-link[data-section-target]"));
      if (!links.length) return;
      const activeIndex = Math.max(0, links.findIndex((link) => link.classList.contains("is-active")));
      const nextIndex = Math.min(Math.max(activeIndex + delta, 0), links.length - 1);
      if (nextIndex !== activeIndex) {
        links[nextIndex].click();
      }
    };

    window.Observer.create({
      target: nav,
      type: "wheel,touch,pointer",
      tolerance: 48,
      preventDefault: false,
      onLeft: () => move(1),
      onRight: () => move(-1),
      onUp: () => move(1),
      onDown: () => move(-1),
    });

    observerBound = true;
  }

  function init() {
    if (!canAnimate()) return false;
    registerPlugins();
    if (!initialized) {
      document.body.classList.add("has-gsap-motion");
      setupObserverNavigation();
      setupProgressTrigger();
      initialized = true;
    }
    return true;
  }

  function animateExistingTitle(gsap, timeline) {
    const glyphs = document.querySelectorAll(".pressure-title .pressure-glyph");
    if (glyphs.length) {
      timeline.fromTo(
        glyphs,
        { autoAlpha: 0, y: 18, rotateX: 24 },
        {
          autoAlpha: 1,
          y: 0,
          rotateX: 0,
          duration: 0.58,
          stagger: 0.045,
          ease: "expo.out",
          clearProps: "opacity,visibility,transform",
        },
        0.18
      );
      return;
    }

    const title = document.querySelector(".hero h1");
    if (!title) return;
    timeline.fromTo(
      title,
      { autoAlpha: 0, y: 18, skewY: 1.4 },
      { autoAlpha: 1, y: 0, skewY: 0, duration: 0.58, ease: "expo.out", clearProps: "opacity,visibility,transform" },
      0.18
    );
  }

  function bootSequence() {
    if (booted || !init()) return false;
    const gsap = getGsap();
    const elements = bootSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    if (!elements.length) return false;

    booted = true;
    gsap.killTweensOf(elements);
    gsap.set(elements, { autoAlpha: 0, y: 18, scale: 0.992 });

    const releaseBootStyles = () => {
      gsap.set(elements, { clearProps: "opacity,visibility,transform" });
      gsap.set(".hero h1, .pressure-title .pressure-glyph", { clearProps: "opacity,visibility,transform" });
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    };
    window.setTimeout(releaseBootStyles, 1400);

    const tl = gsap.timeline({
      defaults: { ease: "expo.out" },
      onComplete: releaseBootStyles,
    });

    tl.to(".command-nav-shell", { autoAlpha: 1, y: 0, scale: 1, duration: 0.42 }, 0);
    tl.to(".hero-copy, .hero-aside", { autoAlpha: 1, y: 0, scale: 1, duration: 0.54, stagger: 0.08 }, 0.08);
    animateExistingTitle(gsap, tl);
    tl.to(
      ".track-card, .bridge-card, .hero-stage, .hero-callout",
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.48, stagger: 0.045 },
      0.28
    );
    tl.to(
      ".summary-pill, .hero-evidence-card",
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.42, stagger: 0.035 },
      0.42
    );
    tl.to(
      ".status-banner, .signal-ticker-shell, #section-overview, .metrics-shell",
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.44, stagger: 0.035 },
      0.56
    );

    return true;
  }

  function enterSection(activeId) {
    if (!init()) return false;
    const gsap = getGsap();
    const main = document.getElementById("main-content");
    const sections = Array.from(main?.querySelectorAll(`[data-page-owner="${activeId}"]`) || []);
    const elements = sections.flatMap((section) => limitedElements(section, sectionSelectors, 16));
    if (!elements.length) return false;

    gsap.killTweensOf(elements);
    window.setTimeout(() => {
      gsap.set(elements, { clearProps: "opacity,visibility,transform" });
    }, 900);
    gsap.fromTo(
      elements,
      { autoAlpha: 0, y: 16, scale: 0.992 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.44,
        stagger: 0.035,
        ease: "expo.out",
        clearProps: "opacity,visibility,transform",
      }
    );

    if (window.ScrollTrigger) {
      window.setTimeout(() => window.ScrollTrigger.refresh(), 70);
    }

    return true;
  }

  function playSectionTransition({ layer, direction, targetId, duration, style }) {
    if (!init() || !layer) return 0;
    const gsap = getGsap();
    const isBack = direction === "back";
    const isDeck = style === "deck";
    const transitionDuration = isDeck
      ? Math.max(duration || 780, 720)
      : Math.max(duration || 820, 760);
    const sign = isBack ? -1 : 1;
    const label = layer.querySelector(".section-transition-card strong");
    const labelTag = layer.querySelector(".section-transition-card span");
    const word = layer.querySelector(".section-transition-word");
    const code = layer.querySelector(".section-transition-code");
    const waves = layer.querySelectorAll(".section-heat-wave");
    const routes = layer.querySelectorAll(".section-transition-route");
    const pings = layer.querySelectorAll(".section-transition-ping");
    const grid = layer.querySelector(".section-transition-grid");
    const card = layer.querySelector(".section-transition-card");
    const main = document.getElementById("main-content");
    const pageDeck = layer.querySelector(".section-transition-page-deck");
    const pageSnapshot = layer.querySelector(".section-transition-page-snapshot");
    const activePageTargets = Array.from(document.querySelectorAll("#main-content [data-page-owner].is-page-active"));

    if (label) label.textContent = getSectionLabel(targetId);
    if (labelTag) labelTag.textContent = isDeck ? (isBack ? "SCROLL PAGE UP" : "SCROLL PAGE DOWN") : "MISSION HANDOFF";
    if (word) word.textContent = (document.getElementById(targetId)?.dataset.chapter || "HEAT").replace(" / ", " / ");
    if (code) code.textContent = `WUHAN GRID / ${String(targetId || "overview").replace("section-", "").toUpperCase()} / LIVE`;

    layer.classList.remove("is-active", "is-forward", "is-back", "is-deck");
    layer.classList.add("is-active", isBack ? "is-back" : "is-forward");
    if (isDeck) layer.classList.add("is-deck");
    gsap.killTweensOf([layer, main, pageDeck, pageSnapshot, grid, card, word, code, ...waves, ...routes, ...pings, ...activePageTargets]);
    gsap.set(layer, { autoAlpha: 1 });

    if (isDeck) {
      gsap.set(pageDeck, { autoAlpha: 1, transformPerspective: 1200, transformStyle: "preserve-3d" });
      gsap.set(pageSnapshot, {
        autoAlpha: 0,
        y: 0,
        z: 0,
        rotateX: -7 * sign,
        rotateY: 0,
        scale: 0.985,
        transformPerspective: 1200,
        transformOrigin: sign > 0 ? "50% 0%" : "50% 100%",
      });
      gsap.set(grid, { autoAlpha: 0, scale: 0.98, rotateX: 18 * sign, transformPerspective: 900 });
      gsap.set(card, {
        autoAlpha: 0,
        y: 32 * sign,
        z: -36,
        rotateX: -12 * sign,
        rotateY: 5 * sign,
        scale: 0.92,
        transformPerspective: 900,
        transformOrigin: "50% 50%",
        xPercent: -50,
      });
      gsap.set(word, { autoAlpha: 0, y: 42 * sign, z: -120, rotateX: -18 * sign, transformPerspective: 900 });
      gsap.set(code, { autoAlpha: 0, y: 28 * sign });
      gsap.set(waves, { autoAlpha: 0, yPercent: 82 * sign, scaleY: 0.74 });
      gsap.set(routes, { autoAlpha: 0, scaleX: 0.08, transformOrigin: "left center" });
      gsap.set(pings, { autoAlpha: 0, scale: 0.52 });

      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.to(pageSnapshot, {
        autoAlpha: 0.86,
        y: -30 * sign,
        z: -70,
        rotateX: 5 * sign,
        scale: 0.965,
        duration: 0.16,
        ease: "power2.out",
      }, 0);
      tl.to(activePageTargets, {
        y: -28 * sign,
        z: -90,
        rotateX: 7 * sign,
        scale: 0.968,
        autoAlpha: 0.64,
        duration: 0.18,
        stagger: 0.01,
        transformPerspective: 1000,
        transformOrigin: sign > 0 ? "50% 0%" : "50% 100%",
        ease: "power2.out",
      }, 0);
      tl.to(main, {
        y: -18 * sign,
        z: -48,
        rotateX: 3.5 * sign,
        scale: 0.984,
        duration: 0.16,
        ease: "power2.out",
        transformPerspective: 1100,
      }, 0);
      tl.fromTo(
        main,
        { autoAlpha: 0.9 },
        { autoAlpha: 1, duration: 0.16, clearProps: "opacity,visibility" },
        0.14
      );
      tl.to(grid, { autoAlpha: 0.36, scale: 1, rotateX: 0, duration: 0.14 }, 0.015);
      tl.to(waves, { autoAlpha: 0.38, yPercent: -12 * sign, scaleY: 1.02, duration: 0.24, stagger: 0.018 }, 0.015);
      tl.to(card, { autoAlpha: 1, y: 0, z: 0, rotateX: 0, rotateY: 0, scale: 1, duration: 0.15 }, 0.055);
      tl.to([word, code], { autoAlpha: 1, y: 0, z: 0, rotateX: 0, duration: 0.16, stagger: 0.018 }, 0.065);
      tl.to(routes, { autoAlpha: 0.54, scaleX: 1, duration: 0.16, stagger: 0.018 }, 0.08);
      tl.to(pings, { autoAlpha: 0.78, scale: 1, duration: 0.1, stagger: 0.012 }, 0.11);
      tl.to(card, {
        autoAlpha: 0,
        y: -16 * sign,
        z: 32,
        rotateX: 10 * sign,
        xPercent: -50,
        duration: 0.12,
        ease: "power2.in",
      }, 0.21);
      tl.to([word, code], {
        autoAlpha: 0,
        y: -14 * sign,
        z: 30,
        rotateX: 8 * sign,
        duration: 0.11,
        stagger: 0.006,
        ease: "power2.in",
      }, 0.22);
      tl.to([pings, routes, grid], {
        autoAlpha: 0,
        duration: 0.1,
        stagger: 0.006,
        ease: "power2.in",
      }, 0.22);
      tl.to(waves, { autoAlpha: 0, yPercent: -66 * sign, duration: 0.12, ease: "power2.in" }, 0.21);
      tl.to(main, {
        y: 0,
        z: 0,
        rotateX: 0,
        scale: 1,
        duration: 0.18,
        ease: "expo.out",
        clearProps: "transform,opacity,visibility",
      }, 0.13);
      tl.to(pageSnapshot, {
        autoAlpha: 0,
        y: -54 * sign,
        z: -110,
        rotateX: 9 * sign,
        scale: 0.94,
        duration: 0.12,
        ease: "power2.in",
      }, 0.2);
      tl.to(pageDeck, { autoAlpha: 0, duration: 0.08, ease: "power2.out" }, 0.24);
      tl.to(activePageTargets, {
        y: 0,
        z: 0,
        rotateX: 0,
        scale: 1,
        autoAlpha: 1,
        duration: 0.18,
        stagger: 0.006,
        ease: "expo.out",
        clearProps: "transform,opacity,visibility",
      }, 0.15);
      tl.duration(transitionDuration / 1000);
      return transitionDuration;
    }

    gsap.set(grid, { autoAlpha: 0, scale: 0.995 });
    gsap.set(card, { autoAlpha: 0, y: 18, scale: 0.98 });
    gsap.set(word, { autoAlpha: 0, x: -18 * sign, y: 12 });
    gsap.set(code, { autoAlpha: 0, y: -8 });
    gsap.set(waves, { autoAlpha: 0, xPercent: isBack ? 82 : -92, scaleX: 0.96 });
    gsap.set(routes, { autoAlpha: 0, scaleX: 0.06, transformOrigin: "left center" });
    gsap.set(pings, { autoAlpha: 0, scale: 0.62 });

    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.to(grid, { autoAlpha: 0.54, scale: 1, duration: 0.14 }, 0);
    tl.to(waves, { autoAlpha: 0.84, xPercent: isBack ? -92 : 86, scaleX: 1.05, duration: 0.38, stagger: 0.028 }, 0);
    tl.to(routes, { autoAlpha: 0.82, scaleX: 1, duration: 0.24, stagger: 0.028 }, 0.045);
    tl.to(pings, { autoAlpha: 1, scale: 1, duration: 0.14, stagger: 0.026 }, 0.12);
    tl.to([word, code], { autoAlpha: 1, x: 0, y: 0, duration: 0.18, stagger: 0.03 }, 0.095);
    tl.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.2 }, 0.12);
    tl.to([card, word, code, pings, routes, grid], { autoAlpha: 0, duration: 0.13, stagger: 0.008 }, 0.31);
    tl.duration(transitionDuration / 1000);
    return transitionDuration;
  }

  function finishSectionTransition(layer) {
    if (!layer) return false;
    const gsap = getGsap();
    if (!gsap) {
      layer.removeAttribute("style");
      return false;
    }

    const targets = [
      layer,
      ...layer.querySelectorAll(
        [
          ".section-transition-grid",
          ".section-transition-mask",
          ".section-transition-rail",
          ".section-transition-sweep",
          ".section-transition-signal",
          ".section-transition-card",
          ".section-transition-card span",
          ".section-transition-card strong",
          ".section-transition-word",
          ".section-transition-code",
          ".section-heat-wave",
          ".section-transition-route",
          ".section-transition-ping",
          ".section-transition-page-deck",
          ".section-transition-page-snapshot",
        ].join(",")
      ),
      document.getElementById("main-content"),
      ...document.querySelectorAll("#main-content [data-page-owner]"),
    ].filter(Boolean);

    gsap.killTweensOf(targets);
    gsap.set(targets, { clearProps: "all" });
    return true;
  }

  function captureState(selector) {
    if (!init() || !window.Flip) return null;
    const elements = document.querySelectorAll(selector);
    if (!elements.length) return null;
    return window.Flip.getState(elements);
  }

  function flipFrom(state, selector) {
    if (!state || !init() || !window.Flip) return false;
    window.Flip.from(state, {
      targets: selector,
      duration: 0.42,
      ease: "expo.out",
      absolute: false,
      prune: true,
      nested: true,
      onEnter: (elements) => {
        getGsap().fromTo(elements, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.025 });
      },
      onLeave: (elements) => {
        getGsap().to(elements, { autoAlpha: 0, y: -8, duration: 0.16 });
      },
    });
    return true;
  }

  function animateCounter({ id, element, from, to, formatter, duration }) {
    if (!init() || !element || typeof formatter !== "function") return false;
    const gsap = getGsap();
    const active = counterTweens.get(id);
    if (active) active.kill();

    const state = { value: Number.isFinite(from) ? from : 0 };
    element.classList.add("is-counting");
    const tween = gsap.to(state, {
      value: to,
      duration: Math.max(0.28, Math.min((duration || 900) / 1000, 1.2)),
      ease: "power4.out",
      onUpdate: () => {
        element.textContent = formatter(state.value);
      },
      onComplete: () => {
        element.textContent = formatter(to);
        element.classList.remove("is-counting");
        counterTweens.delete(id);
      },
    });

    counterTweens.set(id, tween);
    return true;
  }

  function createSpatialLayer(stage) {
    let layer = stage.querySelector(".gsap-map-flow-layer");
    if (layer) layer.remove();

    layer = document.createElement("div");
    layer.className = "gsap-map-flow-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = '<svg class="gsap-map-flow-svg"></svg>';
    stage.appendChild(layer);
    return layer.querySelector("svg");
  }

  function latLngToStagePoint(map, stage, lat, lon) {
    if (!map || !stage || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const point = map.latLngToContainerPoint([lat, lon]);
    const mapRect = map.getContainer().getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    return {
      x: mapRect.left - stageRect.left + point.x,
      y: mapRect.top - stageRect.top + point.y,
    };
  }

  function getCellLatLng(cell) {
    const lat = Number(cell?.center_lat);
    const lon = Number(cell?.center_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    if (!Array.isArray(cell?.polygon) || !cell.polygon.length) return null;
    const points = cell.polygon
      .map(([pointLon, pointLat]) => ({ lat: Number(pointLat), lon: Number(pointLon) }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
    if (!points.length) return null;
    const sum = points.reduce((acc, point) => ({ lat: acc.lat + point.lat, lon: acc.lon + point.lon }), { lat: 0, lon: 0 });
    return { lat: sum.lat / points.length, lon: sum.lon / points.length };
  }

  function refreshSpatialMotion({ map, selectedSites, topCells, focus } = {}) {
    if (!init() || !window.MotionPathPlugin || !map) return false;
    const stage = document.querySelector(".spatial-stage");
    const spatialSection = document.getElementById("section-spatial");
    if (!stage || (spatialSection && !spatialSection.classList.contains("is-page-active"))) return false;

    if (spatialTimeline) {
      spatialTimeline.kill();
      spatialTimeline = null;
    }

    const svg = createSpatialLayer(stage);
    const stageRect = stage.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${Math.max(stageRect.width, 1)} ${Math.max(stageRect.height, 1)}`);

    const pairs = [];
    const siteList = (selectedSites || []).slice(0, 4);
    const cellList = (topCells || []).slice(0, 4);
    siteList.forEach((site, index) => {
      const cell = cellList[index];
      const cellLatLng = getCellLatLng(cell);
      const start = latLngToStagePoint(map, stage, Number(site.lat), Number(site.lon));
      const end = cellLatLng ? latLngToStagePoint(map, stage, cellLatLng.lat, cellLatLng.lon) : null;
      if (start && end) pairs.push({ start, end, site, cell, index });
    });

    if (!pairs.length) return false;

    const namespace = "http://www.w3.org/2000/svg";
    spatialTimeline = getGsap().timeline({ repeat: -1 });
    pairs.forEach((pair) => {
      const curve = 42 + pair.index * 14;
      const midX = (pair.start.x + pair.end.x) / 2;
      const midY = (pair.start.y + pair.end.y) / 2 - curve;
      const d = `M ${pair.start.x.toFixed(1)} ${pair.start.y.toFixed(1)} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${pair.end.x.toFixed(1)} ${pair.end.y.toFixed(1)}`;
      const path = document.createElementNS(namespace, "path");
      const dot = document.createElementNS(namespace, "circle");
      const focused =
        (focus?.type === "site" && String(focus.data?.poi_id) === String(pair.site.poi_id)) ||
        (focus?.type === "cell" && String(focus.data?.id) === String(pair.cell?.id));
      path.setAttribute("d", d);
      path.setAttribute("class", `gsap-map-flow-path${focused ? " is-focused" : ""}`);
      dot.setAttribute("r", focused ? "5.5" : "4");
      dot.setAttribute("class", `gsap-map-flow-dot${focused ? " is-focused" : ""}`);
      svg.append(path, dot);
      spatialTimeline.to(
        dot,
        {
          duration: focused ? 1.15 : 1.65 + pair.index * 0.18,
          ease: "none",
          motionPath: { path, align: path, alignOrigin: [0.5, 0.5] },
        },
        pair.index * 0.18
      );
    });

    return true;
  }

  function afterDashboardRender() {
    if (!init()) return false;
    bootSequence();
    const activeId = document.body.dataset.activeSection || "section-overview";
    window.setTimeout(() => enterSection(activeId), booted ? 680 : 80);
    return true;
  }

  window[MOTION_NS] = {
    init,
    afterDashboardRender,
    bootSequence,
    enterSection,
    playSectionTransition,
    finishSectionTransition,
    captureState,
    flipFrom,
    animateCounter,
    refreshSpatialMotion,
  };
})();
