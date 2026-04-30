const palette = {
  accent: "#7bb7ff",
  accentStrong: "#4f9fff",
  teal: "#39d0ba",
  amber: "#f2b967",
  danger: "#ff7e64",
  violet: "#9f95ff",
  text: "#eef5ff",
  muted: "#8ca2bc",
  line: "rgba(255,255,255,0.08)",
  tooltipBg: "rgba(8, 15, 24, 0.96)",
  tooltipBorder: "rgba(123, 183, 255, 0.20)",
};

const VISUAL_MODE_KEY = "heat-guardian-visual-mode";
const NAV_SECTION_ORDER = [
  "section-overview",
  "section-ops",
  "section-spatial",
  "section-analysis",
  "section-warning",
  "section-evidence",
  "section-sites",
];
const SECTION_TRANSITION_DURATION_MS = 820;
const SECTION_DECK_TRANSITION_DURATION_MS = 780;
const SECTION_SWIPE_TOUCH_THRESHOLD = 72;
const SECTION_WHEEL_THRESHOLD = 54;
const SECTION_WHEEL_LOCK_MS = 940;
const SECTION_PAGE_EDGE_TOLERANCE = 18;
const VISUAL_MODES = {
  command: {
    themeColor: "#071018",
    palette: {
      accent: "#7bb7ff",
      accentStrong: "#4f9fff",
      teal: "#39d0ba",
      amber: "#f2b967",
      danger: "#ff7e64",
      violet: "#9f95ff",
      text: "#eef5ff",
      muted: "#8ca2bc",
      line: "rgba(255,255,255,0.08)",
      tooltipBg: "rgba(8, 15, 24, 0.96)",
      tooltipBorder: "rgba(123, 183, 255, 0.20)",
    },
  },
  signal: {
    themeColor: "#180f19",
    palette: {
      accent: "#ff9d6c",
      accentStrong: "#ff7e64",
      teal: "#66e5ff",
      amber: "#ffd166",
      danger: "#ff7390",
      violet: "#b39cff",
      text: "#fff2f4",
      muted: "#d3b4bf",
      line: "rgba(255, 189, 157, 0.14)",
      tooltipBg: "rgba(28, 14, 22, 0.96)",
      tooltipBorder: "rgba(255, 157, 108, 0.24)",
    },
  },
  atlas: {
    themeColor: "#08141d",
    palette: {
      accent: "#72c7ff",
      accentStrong: "#41b0ff",
      teal: "#48d8c4",
      amber: "#d3c079",
      danger: "#ff8a6e",
      violet: "#8ea8ff",
      text: "#edf8ff",
      muted: "#9ebdce",
      line: "rgba(132, 185, 215, 0.14)",
      tooltipBg: "rgba(8, 20, 30, 0.96)",
      tooltipBorder: "rgba(114, 199, 255, 0.24)",
    },
  },
};

const EXTERNAL_REFERENCE_LINKS = [
  {
    title: "WHO 高温与健康",
    meta: "政策依据 · 老年人与慢病人群是热健康高风险对象",
    value: "查看官方事实表",
    href: "https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health",
  },
  {
    title: "Nature Health · 可达公园研究",
    meta: "论文依据 · 小而可达的城市公园可降低热相关死亡风险",
    value: "查看 Nature Health 论文",
    href: "https://www.nature.com/articles/s44360-025-00036-3",
  },
  {
    title: "冷却中心选址研究",
    meta: "论文依据 · 冷却中心布点需考虑脆弱人群与可达性",
    value: "查看开放论文",
    href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10576472/",
  },
  {
    title: "WorldPop 年龄性别结构数据",
    meta: "数据依据 · 年龄结构栅格的官方发布说明",
    value: "查看 WorldPop 发布说明",
    href: "https://data.worldpop.org/repo/prj/Global_2015_2030/R2025A/doc/Global2_Release_Statement_R2025A_v1.pdf",
  },
  {
    title: "PySAL spopt",
    meta: "GitHub 参考 · 开源 location-allocation 基准库",
    value: "查看代码仓库",
    href: "https://github.com/pysal/spopt",
  },
];

const appState = {
  dashboard: null,
  grid: { features: [] },
  gridGeojson: { type: "FeatureCollection", features: [] },
  selectedRole: "street",
  selectedScenarioCount: null,
  mapFocus: null,
  visualMode: "command",
};

const spatialRuntime = {
  map: null,
  baseLayer: null,
  baseLayers: null,
  layerControl: null,
  overlayLayers: [],
  autoFitKey: null,
  focusFlyKey: null,
  tileLoadCount: 0,
  tileErrorCount: 0,
  visibleFitDone: false,
};

const chartRegistry = new Map();
const counterAnimations = new Map();
let resizeListenerBound = false;
let retryButtonBound = false;
let commandNavBound = false;
let sectionObserverBound = false;
let interactiveChromeBound = false;
let visualModeBound = false;
let scrollProgressBound = false;
let heroAtmosphereBound = false;
let kineticPresentationBound = false;
let kineticSurfaceBound = false;
let kineticControlBound = false;
let kineticCursorBound = false;
let thermalFieldBound = false;
let pressureTitleBound = false;
let sectionInputBound = false;
let sectionTouchStart = null;
let sectionTouchEdgeReady = false;
let sectionTransitionTimer = null;
let sectionWheelAccumulator = 0;
let sectionWheelLockedUntil = 0;

function byId(id) {
  return document.getElementById(id);
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function closestElementTarget(event, selector) {
  const target = event?.target;
  return target instanceof Element ? target.closest(selector) : null;
}

function containsEventTarget(parent, target) {
  return Boolean(parent && target instanceof Node && parent.contains(target));
}

function pulseElementSignal(element, delay = 0) {
  if (!element || prefersReducedMotion()) return;
  element.classList.remove("is-signal-ping");
  element.style.setProperty("--signal-delay", `${delay}ms`);
  void element.offsetWidth;
  element.classList.add("is-signal-ping");
  window.setTimeout(() => {
    element.classList.remove("is-signal-ping");
    element.style.removeProperty("--signal-delay");
  }, 980 + delay);
}

function pulseDecisionSignals(root = document) {
  if (prefersReducedMotion()) return;
  const scopedRoot = root || document;
  const activeSections = Array.from(scopedRoot.querySelectorAll?.(".is-page-active") || []);
  const containers = activeSections.length ? activeSections : [scopedRoot];
  const elements = [];

  containers.forEach((container) => {
    elements.push(
      ...Array.from(
        container.querySelectorAll?.(
          ".track-metric, .aside-kpi, .focus-kpi, .summary-pill, .briefing-metric, .metric-row"
        ) || []
      )
    );
  });

  Array.from(new Set(elements))
    .slice(0, 8)
    .forEach((element, index) => pulseElementSignal(element, index * 54));

  pulseElementSignal(byId("command-nav"), 0);
}

function animateCounter(id, value, formatter, duration = 960) {
  const element = byId(id);
  if (!element) return;

  const numericValue = Number(value);
  if (value === null || value === undefined || Number.isNaN(numericValue)) {
    element.textContent = "--";
    element.classList.remove("is-counting");
    delete element.dataset.counterValue;
    const activeFrame = counterAnimations.get(id);
    if (activeFrame) {
      window.cancelAnimationFrame(activeFrame);
      counterAnimations.delete(id);
    }
    return;
  }

  const previousValue = Number(element.dataset.counterValue);
  if (Number.isFinite(previousValue) && Math.abs(previousValue - numericValue) < 0.0001) {
    element.textContent = formatter(numericValue);
    return;
  }

  element.dataset.counterValue = String(numericValue);

  const activeFrame = counterAnimations.get(id);
  if (activeFrame) {
    window.cancelAnimationFrame(activeFrame);
  }

  if (prefersReducedMotion()) {
    element.textContent = formatter(numericValue);
    element.classList.remove("is-counting");
    counterAnimations.delete(id);
    return;
  }

  const startValue = Number.isFinite(previousValue) ? previousValue : 0;
  if (
    window.HeatGuardianMotion?.animateCounter?.({
      id,
      element,
      from: startValue,
      to: numericValue,
      formatter,
      duration,
    })
  ) {
    counterAnimations.delete(id);
    return;
  }

  const startTime = performance.now();
  element.classList.add("is-counting");

  const tick = (now) => {
    const progress = clampValue((now - startTime) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    const currentValue = startValue + (numericValue - startValue) * eased;
    element.textContent = formatter(currentValue);

    if (progress < 1) {
      counterAnimations.set(id, window.requestAnimationFrame(tick));
      return;
    }

    element.textContent = formatter(numericValue);
    element.classList.remove("is-counting");
    counterAnimations.delete(id);
  };

  counterAnimations.set(id, window.requestAnimationFrame(tick));
}

function updatePageProgress() {
  const bar = byId("page-progress-bar");
  if (!bar) return;

  const doc = document.documentElement;
  const maxScroll = doc.scrollHeight - doc.clientHeight;
  const progress = maxScroll > 0 ? clampValue(window.scrollY / maxScroll, 0, 1) : 0;
  bar.style.transform = `scaleX(${progress.toFixed(4)})`;
}

function bindScrollProgress() {
  if (scrollProgressBound) {
    updatePageProgress();
    return;
  }

  let ticking = false;
  const sync = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      updatePageProgress();
      ticking = false;
    });
  };

  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync);
  scrollProgressBound = true;
  updatePageProgress();
}

function updateSectionHud(activeId) {
  const title = byId("section-hud-title");
  const detail = byId("section-hud-detail");
  if (!title && !detail) return;

  const section = activeId ? byId(activeId) : null;
  const chapter = section?.dataset.chapter || "01 / OVERVIEW";
  const sectionTitle = section?.querySelector(".panel-title")?.textContent?.trim() || "真实数据决策链";
  const updatedAt = byId("footer-updated")?.textContent;

  if (title) {
    title.textContent = chapter;
  }

  if (detail) {
    detail.textContent =
      updatedAt && updatedAt !== "--" ? `${sectionTitle} · 最近生成 ${updatedAt}` : sectionTitle;
  }
}

function setupHeroAtmosphere() {
  if (heroAtmosphereBound) return;
  const hero = document.querySelector(".hero");
  if (!hero || prefersReducedMotion()) {
    heroAtmosphereBound = true;
    return;
  }

  const reset = () => {
    hero.style.setProperty("--hero-shift-x", "0px");
    hero.style.setProperty("--hero-shift-y", "0px");
    hero.style.setProperty("--hero-tilt", "0deg");
  };

  hero.addEventListener("pointermove", (event) => {
    const rect = hero.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    hero.style.setProperty("--hero-shift-x", `${(x * 34).toFixed(2)}px`);
    hero.style.setProperty("--hero-shift-y", `${(y * 24).toFixed(2)}px`);
    hero.style.setProperty("--hero-tilt", `${(x * 10).toFixed(2)}deg`);
  });

  hero.addEventListener("pointerleave", reset);
  hero.addEventListener("pointercancel", reset);

  reset();
  heroAtmosphereBound = true;
}

const KINETIC_CONTROL_SELECTOR =
  ".command-link, .tool-button, .ghost-button, .visual-mode-button, .mini-button, .track-chip, .panel-chip, .status-chip";

const KINETIC_SURFACE_SELECTOR =
  ".hero-copy, .hero-aside, .track-card, .bridge-card, .hero-stage, .hero-callout, .hero-evidence-card, .summary-pill, .status-banner, .signal-ticker-shell, .workflow-shell, .workflow-step, .metrics-shell, .panel, .card, .briefing-card, .scenario-focus, .focus-card, .mini-panel, .site-card, .source-card, .metric-row, .action-card, .spotlight-card, .ops-item, .spotlight-metric, .site-stat, .spatial-stage";

const KINETIC_TARGET_SELECTOR = `${KINETIC_CONTROL_SELECTOR}, ${KINETIC_SURFACE_SELECTOR}`;

const THERMAL_FIELD_COLORS = {
  default: {
    primary: [12, 140, 125],
    secondary: [31, 120, 209],
    ember: [242, 185, 103],
  },
  "section-overview": {
    primary: [12, 140, 125],
    secondary: [31, 120, 209],
    ember: [242, 185, 103],
  },
  "section-ops": {
    primary: [15, 118, 110],
    secondary: [69, 151, 194],
    ember: [234, 159, 72],
  },
  "section-spatial": {
    primary: [43, 132, 204],
    secondary: [11, 148, 122],
    ember: [255, 126, 100],
  },
  "section-analysis": {
    primary: [31, 120, 209],
    secondary: [12, 140, 125],
    ember: [242, 185, 103],
  },
  "section-warning": {
    primary: [213, 112, 69],
    secondary: [31, 120, 209],
    ember: [255, 126, 100],
  },
  "section-evidence": {
    primary: [12, 140, 125],
    secondary: [91, 141, 188],
    ember: [224, 178, 83],
  },
  "section-sites": {
    primary: [13, 132, 113],
    secondary: [56, 132, 198],
    ember: [255, 126, 100],
  },
};

function getThermalFieldColors() {
  const active = document.body?.dataset.activeSection || "section-overview";
  return THERMAL_FIELD_COLORS[active] || THERMAL_FIELD_COLORS.default;
}

function formatRgb(color, alpha) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function createThermalPoint(width, height, index, total) {
  const row = Math.floor(index / 12);
  const column = index % 12;
  const jitterX = Math.sin(index * 9.71) * 58;
  const jitterY = Math.cos(index * 6.33) * 44;
  return {
    x: ((column + 0.5) / 12) * width + jitterX,
    y: ((row + 0.5) / Math.max(1, Math.ceil(total / 12))) * height + jitterY,
    vx: 0.06 + (index % 5) * 0.012,
    vy: -0.025 + (index % 7) * 0.01,
    radius: 1.2 + (index % 4) * 0.38,
    phase: index * 0.73,
    pulse: 0.55 + (index % 6) * 0.08,
  };
}

function setupThermalField() {
  if (thermalFieldBound || prefersReducedMotion()) return;
  const body = document.body;
  if (!body) return;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  canvas.className = "thermal-motion-canvas";
  canvas.setAttribute("aria-hidden", "true");
  body.prepend(canvas);

  const pointer = { x: -1000, y: -1000, active: false };
  let width = 0;
  let height = 0;
  let dpr = 1;
  let points = [];

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pointCount = width < 720 ? 42 : width > 1440 ? 78 : 62;
    points = Array.from({ length: pointCount }, (_, index) =>
      createThermalPoint(width, height, index, pointCount)
    );
  };

  const render = (now) => {
    const time = now * 0.001;
    const colors = getThermalFieldColors();

    context.clearRect(0, 0, width, height);
    const wash = context.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, formatRgb(colors.primary, 0.045));
    wash.addColorStop(0.52, "rgba(255, 255, 255, 0)");
    wash.addColorStop(1, formatRgb(colors.secondary, 0.04));
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);

    context.save();
    context.globalCompositeOperation = "multiply";
    points.forEach((point, index) => {
      const waveX = Math.sin(time * point.pulse + point.phase) * 0.26;
      const waveY = Math.cos(time * (point.pulse + 0.22) + point.phase) * 0.18;
      point.x += point.vx + waveX;
      point.y += point.vy + waveY;

      if (pointer.active) {
        const dx = point.x - pointer.x;
        const dy = point.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < 180) {
          const force = (1 - distance / 180) * 2.1;
          point.x += (dx / distance) * force;
          point.y += (dy / distance) * force;
        }
      }

      if (point.x > width + 80) point.x = -80;
      if (point.x < -90) point.x = width + 70;
      if (point.y > height + 70) point.y = -70;
      if (point.y < -80) point.y = height + 60;

      const alpha = 0.12 + Math.sin(time * 1.4 + point.phase) * 0.025;
      const color = index % 5 === 0 ? colors.ember : index % 2 === 0 ? colors.secondary : colors.primary;
      const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, point.radius * 16);
      glow.addColorStop(0, formatRgb(color, alpha));
      glow.addColorStop(0.42, formatRgb(color, alpha * 0.34));
      glow.addColorStop(1, formatRgb(color, 0));
      context.fillStyle = glow;
      context.beginPath();
      context.arc(point.x, point.y, point.radius * 16, 0, Math.PI * 2);
      context.fill();

      if (index % 3 === 0) {
        context.strokeStyle = formatRgb(color, 0.08);
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(point.x - 24, point.y);
        context.lineTo(point.x + 24, point.y + Math.sin(time + point.phase) * 8);
        context.stroke();
      }
    });
    context.restore();

    window.requestAnimationFrame(render);
  };

  window.addEventListener("resize", resize);
  window.addEventListener(
    "pointermove",
    (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    },
    { passive: true }
  );
  window.addEventListener("pointerleave", () => {
    pointer.active = false;
  });

  resize();
  window.requestAnimationFrame(render);
  thermalFieldBound = true;
}

function setupKineticCursor() {
  if (kineticCursorBound || prefersReducedMotion()) return;
  if (window.matchMedia && window.matchMedia("(hover: none)").matches) {
    kineticCursorBound = true;
    return;
  }

  const cursor = document.createElement("span");
  cursor.className = "thermal-cursor";
  cursor.setAttribute("aria-hidden", "true");
  document.body.appendChild(cursor);
  let activeTarget = null;
  const pointerMoveEvent = "onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove";

  document.addEventListener(
    pointerMoveEvent,
    (event) => {
      const samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : null;
      const point = samples?.length ? samples[samples.length - 1] : event;
      cursor.style.transform = `translate3d(${point.clientX - 17}px, ${point.clientY - 17}px, 0) scale(var(--cursor-scale))`;
      document.body.classList.add("has-kinetic-cursor");
    },
    { passive: true }
  );

  document.addEventListener(
    "pointerover",
    (event) => {
      activeTarget = closestElementTarget(event, KINETIC_TARGET_SELECTOR);
      cursor.classList.toggle("is-over-target", Boolean(activeTarget));
    },
    { passive: true }
  );

  document.addEventListener(
    "pointerout",
    (event) => {
      if (!activeTarget || containsEventTarget(activeTarget, event.relatedTarget)) return;
      activeTarget = null;
      cursor.classList.remove("is-over-target");
    },
    { passive: true }
  );

  document.addEventListener("pointerdown", () => {
    cursor.classList.add("is-pressed");
    window.setTimeout(() => cursor.classList.remove("is-pressed"), 72);
  });

  document.addEventListener("pointerleave", () => {
    document.body.classList.remove("has-kinetic-cursor");
    cursor.classList.remove("is-over-target");
    activeTarget = null;
  });

  kineticCursorBound = true;
}

function setupPressureTitle() {
  if (pressureTitleBound || prefersReducedMotion()) return;
  if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) {
    pressureTitleBound = true;
    return;
  }
  const title = document.querySelector(".hero h1");
  if (!title || title.dataset.pressureBound === "true") {
    pressureTitleBound = true;
    return;
  }

  const text = title.textContent.trim();
  if (!text) return;
  title.dataset.pressureBound = "true";
  title.classList.add("pressure-title");
  title.setAttribute("aria-label", text);
  title.textContent = "";

  Array.from(text).forEach((character, index) => {
    const glyph = document.createElement("span");
    glyph.className = "pressure-glyph";
    glyph.textContent = character;
    glyph.style.setProperty("--glyph-index", String(index));
    glyph.style.setProperty("--glyph-pressure", "0");
    glyph.style.setProperty("--glyph-drift", "0px");
    title.appendChild(glyph);
  });
  const glyphs = Array.from(title.querySelectorAll(".pressure-glyph"));

  const reset = () => {
    glyphs.forEach((glyph) => {
      glyph.style.setProperty("--glyph-pressure", "0");
      glyph.style.setProperty("--glyph-drift", "0px");
    });
  };

  title.addEventListener("pointermove", (event) => {
    glyphs.forEach((glyph) => {
      const rect = glyph.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const distance = Math.abs(event.clientX - center);
      const pressure = clampValue(1 - distance / 150, 0, 1);
      glyph.style.setProperty("--glyph-pressure", pressure.toFixed(3));
      glyph.style.setProperty("--glyph-drift", `${((event.clientX - center) * 0.018).toFixed(2)}px`);
    });
  });

  title.addEventListener("pointerleave", reset);
  title.addEventListener("pointercancel", reset);
  pressureTitleBound = true;
}

function clearKineticControl(element) {
  if (!element) return;
  element.classList.remove("is-kinetic-control");
  element.style.removeProperty("--magnet-x");
  element.style.removeProperty("--magnet-y");
}

function setupKineticControls() {
  if (kineticControlBound || prefersReducedMotion()) return;
  let activeControl = null;

  document.addEventListener(
    "pointerover",
    (event) => {
      const control = closestElementTarget(event, KINETIC_CONTROL_SELECTOR);
      if (activeControl && activeControl !== control) {
        clearKineticControl(activeControl);
      }
      activeControl = control;
    },
    { passive: true }
  );

  document.addEventListener(
    "pointermove",
    (event) => {
      const control = activeControl;
      if (!control) return;

      const rect = control.getBoundingClientRect();
      const dx = event.clientX - rect.left - rect.width / 2;
      const dy = event.clientY - rect.top - rect.height / 2;
      control.classList.add("is-kinetic-control");
      control.style.setProperty("--magnet-x", `${clampValue(dx * 0.13, -8, 8).toFixed(2)}px`);
      control.style.setProperty("--magnet-y", `${clampValue(dy * 0.16, -7, 7).toFixed(2)}px`);
      control.style.setProperty("--press-x", `${event.clientX - rect.left}px`);
      control.style.setProperty("--press-y", `${event.clientY - rect.top}px`);
    },
    { passive: true }
  );

  document.addEventListener(
    "pointerout",
    (event) => {
      if (!activeControl || containsEventTarget(activeControl, event.relatedTarget)) return;
      clearKineticControl(activeControl);
      activeControl = null;
    },
    { passive: true }
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      const control = activeControl || closestElementTarget(event, KINETIC_CONTROL_SELECTOR);
      if (!control) return;
      const rect = control.getBoundingClientRect();
      control.style.setProperty("--press-x", `${event.clientX - rect.left}px`);
      control.style.setProperty("--press-y", `${event.clientY - rect.top}px`);
      control.classList.remove("is-kinetic-press");
      void control.offsetWidth;
      control.classList.add("is-kinetic-press");
      window.setTimeout(() => control.classList.remove("is-kinetic-press"), 360);
    },
    { passive: true }
  );

  document.addEventListener("pointerleave", () => {
    clearKineticControl(activeControl);
    activeControl = null;
  });

  kineticControlBound = true;
}

function clearKineticSurface(surface) {
  if (!surface) return;
  surface.classList.remove("is-kinetic-lit");
  surface.style.removeProperty("--spot-x");
  surface.style.removeProperty("--spot-y");
}

function setupKineticSurfaces() {
  if (kineticSurfaceBound || prefersReducedMotion()) return;
  let activeSurface = null;

  document.addEventListener(
    "pointerover",
    (event) => {
      const surface = closestElementTarget(event, KINETIC_SURFACE_SELECTOR);
      if (activeSurface && activeSurface !== surface) {
        clearKineticSurface(activeSurface);
      }
      activeSurface = surface;
    },
    { passive: true }
  );

  document.addEventListener(
    "pointermove",
    (event) => {
      const surface = activeSurface;
      if (!surface) return;

      const rect = surface.getBoundingClientRect();
      surface.classList.add("is-kinetic-lit");
      surface.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
      surface.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
    },
    { passive: true }
  );

  document.addEventListener(
    "pointerout",
    (event) => {
      if (!activeSurface || containsEventTarget(activeSurface, event.relatedTarget)) return;
      clearKineticSurface(activeSurface);
      activeSurface = null;
    },
    { passive: true }
  );

  document.addEventListener("pointerleave", () => {
    clearKineticSurface(activeSurface);
    activeSurface = null;
  });

  kineticSurfaceBound = true;
}

function setupKineticPresentation() {
  if (kineticPresentationBound) return;
  setupThermalField();
  setupKineticCursor();
  setupPressureTitle();
  setupKineticControls();
  setupKineticSurfaces();
  kineticPresentationBound = true;
}

function normalizeVisualMode(value) {
  return VISUAL_MODES[value] ? value : "command";
}

function updateThemeColorMeta(mode) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", VISUAL_MODES[mode].themeColor);
  }
}

function applyModePalette(mode) {
  Object.assign(palette, VISUAL_MODES[mode].palette);
}

function updateVisualModeButtons(mode) {
  document.querySelectorAll("[data-visual-mode-button]").forEach((button) => {
    const isActive = button.dataset.visualMode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function setVisualMode(mode, { persist = true, updateUrl = true, rerender = true } = {}) {
  const resolved = normalizeVisualMode(mode);
  appState.visualMode = resolved;
  applyModePalette(resolved);

  if (document.body) {
    document.body.dataset.visualMode = resolved;
  }

  if (persist) {
    try {
      window.localStorage.setItem(VISUAL_MODE_KEY, resolved);
    } catch (error) {
      console.warn("无法写入视觉模式缓存", error);
    }
  }

  if (updateUrl) {
    const url = new URL(window.location.href);
    if (resolved === "command") {
      url.searchParams.delete("mode");
    } else {
      url.searchParams.set("mode", resolved);
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  updateThemeColorMeta(resolved);
  updateVisualModeButtons(resolved);

  if (rerender && appState.dashboard) {
    const renderErrors = renderDashboard();
  }
}

function bindVisualModeSwitcher() {
  if (visualModeBound) return;
  document.querySelectorAll("[data-visual-mode-button]").forEach((button) => {
    button.addEventListener("click", () => {
      setVisualMode(button.dataset.visualMode);
    });
  });
  visualModeBound = true;
}

function initializeVisualMode() {
  let initialMode = "command";
  try {
    const urlMode = new URL(window.location.href).searchParams.get("mode");
    const cachedMode = window.localStorage.getItem(VISUAL_MODE_KEY);
    initialMode = normalizeVisualMode(urlMode || cachedMode || "command");
  } catch (error) {
    initialMode = "command";
  }

  setVisualMode(initialMode, { persist: true, updateUrl: false, rerender: false });
  bindVisualModeSwitcher();
}

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`请求失败: ${url}`);
  }
  return response.json();
}

function setText(id, value, suffix = "") {
  const element = byId(id);
  if (!element) return;
  element.textContent =
    value === null || value === undefined || value === "--" ? "--" : `${value}${suffix}`;
  if (window.HeatGuardianExtras && id === "data-status") {
    window.HeatGuardianExtras.syncStatus({ tone: "ok" });
  }
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toLocaleString("zh-CN");
}

function formatPercent(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function formatDecimal(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  const fixed = Number(value).toFixed(digits);
  return fixed.replace(/\.0+$/, "");
}

function formatMinutes(value, digits = 1) {
  const formatted = formatDecimal(value, digits);
  return formatted === "--" ? "--" : `${formatted} 分钟`;
}

function formatSignedMinutes(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  const amount = Number(value);
  const sign = amount > 0 ? "+" : "";
  return `${sign}${formatDecimal(amount, digits)} 分钟`;
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).replace("T", " ").slice(0, 10);
  }
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatRemoteTimestamp(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatCoord(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return "--";
  }
  return `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`;
}

function truncateText(value, maxLength = 160) {
  if (!value || value.length <= maxLength) {
    return value || "";
  }
  return `${value.slice(0, maxLength).trim()}…`;
}

function humanizeSourceStatus(value) {
  const map = {
    up_to_date: "已与上游同步",
    downloaded: "已重新下载",
    re_extracted: "已重建本地缓存",
    recovered_local_cache: "已恢复本地缓存",
    using_cached_snapshot: "使用本地缓存",
    deferred_no_local_cache: "本地栅格未下载",
    remote_refresh_failed_using_cache: "远端刷新失败，使用缓存",
    remote_refresh_failed_no_cache: "远端刷新失败，无本地缓存",
    live: "实时抓取",
    cached_snapshot: "缓存快照",
    generated: "本地生成",
  };
  return map[value] || value || "--";
}

function hasWorldPopVersion(worldpop) {
  return Boolean(worldpop?.data_year || worldpop?.release);
}

function getWorldPopVersionLabel(worldpop) {
  if (hasWorldPopVersion(worldpop)) {
    return [worldpop.data_year, worldpop.release].filter(Boolean).join(" / ");
  }
  return humanizeSourceStatus(worldpop?.status);
}

function getWorldPopUsageMeta(worldpop, populationDataLevel) {
  const levelLabel = humanizeDataLevel(populationDataLevel || "demo_estimate");
  const checkedAt = formatDateTime(worldpop?.checked_at);
  if (hasWorldPopVersion(worldpop)) {
    return `${levelLabel} · 检查 ${checkedAt}`;
  }
  return `${levelLabel} · WorldPop 栅格未下载 · 检查 ${checkedAt}`;
}

function getWorldPopSourceDetail(worldpop, populationDataLevel) {
  if (hasWorldPopVersion(worldpop)) {
    return `当前使用 CHN ${worldpop.data_year || "--"} ${worldpop.release || "--"} 的 1km 年龄结构栅格。`;
  }
  const levelLabel = humanizeDataLevel(populationDataLevel || "demo_estimate");
  const reason =
    worldpop?.skip_reason === "missing_worldpop_cache_deferred_to_keep_startup_responsive"
      ? "可以接入 WorldPop；当前本机未下载本地栅格文件，启动流程为避免下载大文件先使用人口估算代理。"
      : "当前没有可展示的 WorldPop 版本号。";
  return `${reason}下载栅格并重新运行数据流水线后会显示正式版本；当前人口暴露结果使用${levelLabel}。`;
}

function getGeofabrikFreshnessMeta(geofabrik, prefix = "文件") {
  if (geofabrik?.remote?.last_modified) {
    return `${prefix} ${formatRemoteTimestamp(geofabrik.remote.last_modified)}`;
  }
  if (geofabrik?.download?.downloaded_at) {
    return `本地缓存检查 ${formatDateTime(geofabrik.download.downloaded_at)}`;
  }
  return `最近检查 ${formatDateTime(geofabrik?.checked_at)}`;
}

function humanizeAuditStatus(value) {
  const map = {
    ok: "上游真实",
    warning: "真实输入 + 模型说明",
    fallback: "已触发回退",
  };
  return map[value] || value || "--";
}

function humanizeAuthenticityLabel(value) {
  const map = {
    real: "真实上游",
    fallback: "回退数据",
    warning: "需说明",
    proxy: "代理变量",
  };
  return map[value] || value || "--";
}

function humanizeAuditStage(value) {
  const map = {
    upstream_input: "上游输入",
    upstream_processing: "处理层",
    derived_output: "模型输出",
  };
  return map[value] || value || "--";
}

function humanizeAuditLevel(value) {
  if (!value) return "--";
  const map = {
    raw_upstream: "原始上游数据",
    external_dataset: "外部公开数据集",
    processed_output: "模型处理结果",
    missing_external: "外部数据缺失",
  };
  if (map[value]) return map[value];
  const dataLevel = humanizeDataLevel(value);
  if (dataLevel !== value) return dataLevel;
  const profileType = humanizeProfileType(value);
  if (profileType !== value) return profileType;
  const strategy = humanizeStrategy(value);
  if (strategy !== value) return strategy;
  return value;
}

function getAuditTone(item) {
  if (item?.fallback_detected) return "danger";
  if (item?.uses_proxy || item?.output_is_modeled) return "warm";
  return "teal";
}

function createExternalLink(label, href, className = "text-link") {
  if (!href) return null;
  const link = document.createElement("a");
  link.className = className;
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  return link;
}

function humanizeDataLevel(value) {
  const map = {
    demo_estimate: "人口估算代理",
    worldpop_like: "WorldPop 格式人口估算",
    worldpop_raster: "WorldPop 栅格",
    walk_network: "真实步行路网",
    hybrid_model: "综合风险模型",
    real_weather_spatial_proxy_model: "真实天气 + 空间代理模型",
    distance_proxy: "距离代理",
  };
  return map[value] || value || "--";
}

function humanizeLocationAccuracy(value) {
  const map = {
    venue_level: "场馆级定位",
    street_level: "街道级定位",
  };
  return map[value] || value || "--";
}

function humanizeStrategy(value) {
  const map = {
    mclp_capacity_readiness_fairness_hybrid: "覆盖优先 + 容量/开放时段/适配度/公平性增强",
    mclp_coverage_time_hybrid: "覆盖优先 + 时间优化补位",
    mclp: "最大覆盖选址",
    mclp_distance_proxy: "距离代理选址",
  };
  return map[value] || value || "--";
}

function humanizeProfileType(value) {
  const map = {
    forecast: "实时预报场景",
    historical_heatwave_case: "真实历史热浪案例",
  };
  return map[value] || value || "--";
}

function fallbackWarningSignal(label) {
  return {
    level: 1,
    key: "routine",
    label: `${label} I级常态监测`,
    tone: "cool",
    summary: "当前未读取到预警信号。",
  };
}

function getWarningSignal(signal, label) {
  if (!signal || typeof signal !== "object") {
    return fallbackWarningSignal(label);
  }
  return {
    ...fallbackWarningSignal(label),
    ...signal,
    label: signal.label || `${label} I级常态监测`,
  };
}

function formatWindowLabel(startTime, endTime) {
  if (!startTime || !endTime) {
    return "--";
  }
  const formatPart = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value.replace("T", " ");
    }
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  return `${formatPart(startTime)} - ${formatPart(endTime)}`;
}

function getTrendWindowLabel(trend) {
  if (!Array.isArray(trend) || !trend.length) {
    return "--";
  }
  return formatWindowLabel(trend[0]?.time, trend[trend.length - 1]?.time);
}

function normalizePoiCategory(item) {
  const map = {
    park: "公园",
    hospital: "医院",
    pharmacy: "药店",
    library: "图书馆",
    shopping_mall: "购物中心",
    subway_station: "地铁站",
    community_centre: "社区中心",
    social_facility: "养老服务设施",
    official_cooling_site: "官方纳凉点",
  };
  return item.category_label || map[item.category] || "候选点";
}

function normalizePoiName(name, categoryLabel, index = 0) {
  return getPoiDisplayName({ name, category_label: categoryLabel }, index);
}

function isRawOsmName(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /OSM\s*未命名|未命名.*OSM|OSM.*\d{6,}|要素\s*#?\d{5,}|#\d{6,}/i.test(text);
}

function getPoiCategoryAlias(item) {
  const category = normalizePoiCategory(item);
  const aliases = {
    公园: "开放绿地",
    图书馆: "公共阅览空间",
    医院: "医疗支撑",
    药店: "药品补给",
    购物中心: "室内商业空间",
    地铁站: "交通避暑",
    社区中心: "社区服务",
    养老服务设施: "养老服务",
  };
  return aliases[category] || category;
}

function getPoiDisplayName(item, index = 0) {
  const explicitName = String(item?.displayName || item?.display_name || "").trim();
  if (explicitName && !isRawOsmName(explicitName)) {
    return explicitName;
  }

  const namedSource = [item?.name, item?.source_name]
    .map((value) => String(value || "").trim())
    .find((value) => value && !isRawOsmName(value));
  if (namedSource) {
    return namedSource;
  }

  const district = String(item?.district || "").trim();
  const alias = getPoiCategoryAlias(item || {});
  const base = `${district || "片区"}${alias}候选点`;
  return item?.name_quality === "generated_from_unnamed_osm"
    ? base
    : `${base} ${String(index + 1).padStart(2, "0")}`;
}

function getPoiProvenanceLabel(item) {
  if (!item || (item.name_quality !== "generated_from_unnamed_osm" && !isRawOsmName(item.source_name || item.name))) {
    return "";
  }
  return "OSM实有要素，未标注正式名称";
}

function getPoiSourceDetail(item) {
  const label = getPoiProvenanceLabel(item);
  if (!label) return "";
  const id = String(item?.poi_id || item?.id || "").trim();
  return id ? `${label} · ID ${id}` : label;
}

function sumBy(items, getter) {
  return items.reduce((sum, item, index) => sum + (Number(getter(item, index)) || 0), 0);
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function gradient(top, bottom) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: top },
    { offset: 1, color: bottom },
  ]);
}

function baseTooltip() {
  return {
    backgroundColor: palette.tooltipBg,
    borderColor: palette.tooltipBorder,
    borderWidth: 1,
    textStyle: { color: palette.text, fontSize: 12 },
    extraCssText: "box-shadow: 0 18px 40px rgba(0,0,0,0.35); border-radius: 12px;",
  };
}

function baseAxisLabel() {
  return { color: palette.muted, fontSize: 12 };
}

function baseSplitLine() {
  return { lineStyle: { color: palette.line, type: "dashed" } };
}

function setLoading(isLoading) {
  document.body.classList.toggle("is-loading", Boolean(isLoading));
  const main = byId("main-content");
  if (main) {
    main.setAttribute("aria-busy", isLoading ? "true" : "false");
  }
}

function setStatus(title, tone = "loading", detail = "", canRetry = false) {
  const banner = byId("app-status");
  const titleElement = byId("app-status-title");
  const detailElement = byId("app-status-detail");
  const retryButton = byId("retry-button");

  if (banner) {
    banner.dataset.tone = tone;
  }
  if (titleElement) {
    titleElement.textContent = title;
  }
  if (detailElement) {
    detailElement.textContent = detail || "";
    detailElement.classList.toggle("is-hidden", !detail);
  }
  if (retryButton) {
    retryButton.classList.toggle("is-hidden", !canRetry);
  }
  window.HeatGuardianExtras?.syncStatus?.({ tone });
  if (tone !== "loading") {
    pulseElementSignal(banner, 40);
    window.setTimeout(() => pulseDecisionSignals(), 72);
  }
}

function bindRetryButton() {
  if (retryButtonBound) return;
  const retryButton = byId("retry-button");
  if (!retryButton) return;
  retryButton.addEventListener("click", () => {
    bootstrap();
  });
  retryButtonBound = true;
}

function ensureResizeBinding() {
  if (resizeListenerBound) return;
  resizeListenerBound = true;
  let ticking = false;
  window.addEventListener("resize", () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      chartRegistry.forEach((chart) => {
        if (chart && !chart.isDisposed()) {
          chart.resize();
        }
      });
      syncCommandIndicator();
      ticking = false;
    });
  });
}

function disposeChart(id) {
  const element = byId(id);
  if (!element || !window.echarts) return;
  const chart = chartRegistry.get(id) || echarts.getInstanceByDom(element);
  if (chart) {
    chart.dispose();
    chartRegistry.delete(id);
  }
}

function renderEmptyBlock(containerId, message) {
  const container = byId(containerId);
  if (!container) return;
  container.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  container.appendChild(empty);
}

function renderChartFallback(containerId, message) {
  disposeChart(containerId);
  renderEmptyBlock(containerId, message);
}

function getChart(containerId) {
  if (!window.echarts) {
    renderChartFallback(containerId, "图表库未加载，当前仅展示文本结果。");
    return null;
  }
  const element = byId(containerId);
  if (!element) return null;

  const cached = chartRegistry.get(containerId);
  if (cached && !cached.isDisposed()) {
    return cached;
  }

  const existing = echarts.getInstanceByDom(element);
  if (existing) {
    chartRegistry.set(containerId, existing);
    return existing;
  }

  element.innerHTML = "";
  const chart = echarts.init(element);
  chartRegistry.set(containerId, chart);
  ensureResizeBinding();
  return chart;
}

function renderMetricRows(containerId, items, emptyMessage = "暂无数据") {
  const container = byId(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!items.length) {
    renderEmptyBlock(containerId, emptyMessage);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "metric-row";

    const copy = document.createElement("div");
    copy.className = "metric-copy";

    const name = document.createElement("span");
    name.textContent = item.name;
    copy.appendChild(name);

    if (item.meta) {
      const meta = document.createElement("small");
      meta.textContent = item.meta;
      copy.appendChild(meta);
    }

    if (item.href) {
      const link = createExternalLink(item.linkLabel || "查看原文", item.href, "metric-link");
      if (link) {
        copy.appendChild(link);
      }
    }

    const value = document.createElement("strong");
    value.textContent = item.value;

    row.append(copy, value);
    container.appendChild(row);
  });
}

function renderBriefingMetrics(containerId, items) {
  const container = byId(containerId);
  if (!container) return;
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "briefing-metric";

    const label = document.createElement("span");
    label.textContent = item.label;

    const value = document.createElement("strong");
    value.textContent = item.value;

    card.append(label, value);

    if (item.meta) {
      const meta = document.createElement("small");
      meta.textContent = item.meta;
      card.appendChild(meta);
    }

    container.appendChild(card);
  });
}

function renderFocusMetrics(containerId, items) {
  const container = byId(containerId);
  if (!container) return;
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "focus-kpi";

    const label = document.createElement("span");
    label.textContent = item.label;

    const value = document.createElement("strong");
    value.textContent = item.value;

    card.append(label, value);

    if (item.meta) {
      const meta = document.createElement("small");
      meta.textContent = item.meta;
      card.appendChild(meta);
    }

    container.appendChild(card);
  });
}

function renderWorkflowStrip() {
  const derived = buildDerivedState();
  const container = byId("workflow-strip");
  if (!container) return;
  container.innerHTML = "";

  const scenario = derived.selectedScenario;
  const baseline = derived.baseline || {};
  const timeSaved = (baseline.average_travel_minutes || 0) - (scenario?.metrics?.average_travel_minutes || 0);
  const topSite = derived.selectedSites[0] || null;

  [
    {
      index: "01",
      label: "风险扫描",
      title: derived.topDistrict.district || "最高风险城区",
      value: `${formatNumber(derived.optimization.high_risk_cell_count || 0)} 个`,
      meta: `${derived.riskContextLabel} 当前最高风险城区为 ${derived.topDistrict.district || "--"}`,
      tone: "warm",
    },
    {
      index: "02",
      label: "可达核查",
      title: `${derived.allSupportLabel} 15 分钟可达`,
      value: formatPercent(derived.allSupportScope?.coverage_15min_rate, 0),
      meta:
        `${derived.allSupportLabel} 平均最近步行时间 ${formatMinutes(derived.allSupportScope?.average_nearest_walk_minutes)}；` +
        `${derived.activeCoolingLabel} 覆盖 ${formatPercent(derived.activeCoolingScope?.coverage_15min_rate, 0)}`,
      tone: "teal",
    },
    {
      index: "03",
      label: "方案测试",
      title: `新增 ${derived.selectedScenarioCount || "--"} 点方案`,
      value: formatPercent(scenario?.metrics?.coverage_rate_population, 1),
      meta: `平均到达时间较基线缩短 ${formatSignedMinutes(timeSaved).replace("+", "")}`,
      tone: "violet",
    },
    {
      index: "04",
      label: "点位落地",
      title: topSite?.displayName || "首位推荐点",
      value: `${formatNumber(scenario?.metrics?.coverage_improvement_population || 0)} 人`,
      meta: topSite
        ? `首位点位直接新增覆盖 ${formatNumber(topSite.covered_elderly_population || 0)} 人`
        : "当前方案没有返回候选点",
      tone: "accent",
    },
  ].forEach((item) => {
    const step = document.createElement("article");
    step.className = "workflow-step";
    step.dataset.tone = item.tone;
    step.innerHTML = `
      <span class="workflow-index">${item.index}</span>
      <span class="workflow-label">${item.label}</span>
      <strong class="workflow-title">${item.title}</strong>
      <span class="workflow-value">${item.value}</span>
      <small class="workflow-meta">${item.meta}</small>
    `;
    container.appendChild(step);
  });
}

function renderHeroSpectrum() {
  const container = byId("hero-spectrum");
  if (!container) return;
  container.innerHTML = "";

  const derived = buildDerivedState();
  const districts = (derived.dashboard.risk_summary?.districts || []).slice(0, 5);
  if (!districts.length) {
    renderEmptyBlock("hero-spectrum", "暂无城区风险排序。");
    return;
  }

  const maxRisk = Math.max(...districts.map((item) => Number(item.average_risk) || 0), 1);
  districts.forEach((item, index) => {
    const column = document.createElement("article");
    column.className = "spectrum-column";
    column.style.setProperty("--spectrum-delay", `${0.08 + index * 0.06}s`);

    const height = Math.max(44, Math.round(((Number(item.average_risk) || 0) / maxRisk) * 132));
    const tone = index === 0 ? "hot" : index < 3 ? "mid" : "cool";

    column.innerHTML = `
      <div class="spectrum-track">
        <div class="spectrum-bar" data-tone="${tone}" style="height:${height}px">
          <span class="spectrum-value">${formatDecimal(item.average_risk, 1)}</span>
        </div>
      </div>
      <div class="spectrum-copy">
        <strong class="spectrum-label">${item.district || `城区 ${index + 1}`}</strong>
        <small class="spectrum-meta">${formatNumber(item.high_risk_cells || 0)} 个高风险网格</small>
      </div>
    `;
    container.appendChild(column);
  });
}

function renderSignalTicker() {
  const container = byId("signal-ticker");
  if (!container) return;
  container.innerHTML = "";

  const derived = buildDerivedState();
  const districts = (derived.dashboard.risk_summary?.districts || []).slice(0, 5);
  const scenario = derived.selectedScenario || derived.defaultScenario;
  const topSite = derived.selectedSites[0];
  const feedItems = [
    `${humanizeProfileType(derived.analysisProfileType)} · ${derived.analysisWindow}`,
    `${derived.forecastWarning.label} · ${derived.forecastWarning.summary}`,
    derived.riskContextLabel,
    derived.officialBulletins[0]?.metrics?.reported_cooling_point_count
      ? `武汉官方通报已开放 ${formatNumber(derived.officialBulletins[0].metrics.reported_cooling_point_count)} 个社区纳凉点`
      : null,
    ...districts.map(
      (item) =>
        `${item.district || "重点城区"} 风险 ${formatDecimal(item.average_risk, 1)} · 高风险网格 ${formatNumber(item.high_risk_cells || 0)}`
    ),
    `${derived.allSupportLabel} 15 分钟覆盖率 ${formatPercent(derived.allSupportScope?.coverage_15min_rate, 0)}`,
    `${derived.activeCoolingLabel} 15 分钟覆盖率 ${formatPercent(derived.activeCoolingScope?.coverage_15min_rate, 0)}`,
    scenario
      ? `新增 ${scenario.new_site_count} 点方案覆盖 ${formatNumber(scenario.metrics.coverage_improvement_population || 0)} 人`
      : "优化方案待返回",
    topSite
      ? `首位点位 ${topSite.displayName || topSite.name} · 新增覆盖 ${formatNumber(topSite.covered_elderly_population || 0)} 人`
      : "候选点位待返回",
  ].filter(Boolean);

  if (!feedItems.length) {
    renderEmptyBlock("signal-ticker", "暂无快讯。");
    return;
  }

  const track = document.createElement("div");
  track.className = "signal-ticker-track";

  const buildGroup = () => {
    const group = document.createElement("div");
    group.className = "signal-ticker-group";
    feedItems.forEach((text) => {
      const item = document.createElement("span");
      item.className = "ticker-item";
      item.textContent = text;
      group.appendChild(item);
    });
    return group;
  };

  track.append(buildGroup(), buildGroup());
  container.appendChild(track);
}

function renderHeroEvidenceStrip() {
  const container = byId("hero-evidence-strip");
  if (!container) return;
  container.innerHTML = "";

  const derived = buildDerivedState();
  const worldpop = derived.dataSources.worldpop || {};
  const geofabrik = derived.dataSources.geofabrik || {};
  const populationDataLevel = derived.firstFeature.population_data_level || "demo_estimate";
  const sourceBreakdown = derived.officialCooling?.source_status_breakdown || {};
  const latestGeneratedAt =
    derived.dashboard.optimization?.generated_at ||
    derived.officialCooling?.generated_at ||
    derived.dashboard.weather?.generated_at;

  const items = [
    {
      label: "WorldPop",
      value: getWorldPopVersionLabel(worldpop),
      meta: getWorldPopUsageMeta(worldpop, populationDataLevel),
    },
    {
      label: "Geofabrik",
      value: humanizeSourceStatus(geofabrik.status),
      meta:
        geofabrik.remote?.last_modified
          ? `真实步行路网 · 远端 ${formatRemoteTimestamp(geofabrik.remote.last_modified)}`
          : `真实步行路网 · 检查 ${formatDateTime(geofabrik.checked_at)}`,
    },
    {
      label: "Open-Meteo",
      value: derived.analysisProfileType === "historical_heatwave_case" ? "预报 + 历史归档" : "实时预报",
      meta: `最近生成 ${formatDateTime(derived.dashboard.weather?.generated_at)}`,
    },
    {
      label: "官方通报",
      value: `${formatNumber(derived.officialBulletins.length)} 页监测 / ${formatNumber(derived.officialVerifiedCount)} 点核验`,
      meta: `实时 ${formatNumber(sourceBreakdown.live || 0)} · 缓存 ${formatNumber(sourceBreakdown.cached_snapshot || 0)}`,
    },
    {
      label: "真实性审计",
      value: derived.authenticityOverall?.verdict_label || "真实输入 + 模型推导",
      meta:
        `回退 ${formatNumber(derived.authenticitySummary?.fallback_count || 0)} · ` +
        `代理 ${formatNumber(derived.authenticitySummary?.proxy_count || 0)}`,
    },
    {
      label: "数据流水线",
      value: formatDateTime(latestGeneratedAt),
      meta: "启动脚本先刷新整条流水线，再启动网站",
    },
  ];

  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "hero-evidence-card";
    card.style.setProperty("--card-delay", `${0.22 + index * 0.06}s`);
    card.innerHTML = `
      <span class="hero-evidence-label">${item.label}</span>
      <strong class="hero-evidence-value">${item.value}</strong>
      <small class="hero-evidence-meta">${item.meta}</small>
    `;
    container.appendChild(card);
  });
}

function renderOpsRibbon() {
  const container = byId("ops-ribbon");
  if (!container) return;
  container.innerHTML = "";

  const derived = buildDerivedState();
  const dashboard = derived.dashboard;
  const scenario = derived.selectedScenario || derived.defaultScenario;
  const timeSaved = Math.max(
    (derived.baseline.average_travel_minutes || 0) - (scenario?.metrics?.average_travel_minutes || 0),
    0
  );
  const updatedAt = formatDateTime(dashboard.optimization?.generated_at || dashboard.weather?.generated_at);
  const items = [
    {
      label: "预报峰值",
      title: "未来24小时最高温",
      value:
        derived.forecast?.next_24h_max_temperature !== null &&
        derived.forecast?.next_24h_max_temperature !== undefined
          ? `${formatDecimal(derived.forecast.next_24h_max_temperature, 1)}℃`
          : "--",
      meta:
        derived.analysisProfileType === "historical_heatwave_case"
          ? `当前温度 ${formatDecimal(derived.forecast?.current_temperature, 1)}℃；${formatDecimal(
              derived.forecast?.next_24h_max_temperature,
              1
            )}℃ 是未来24小时预报峰值。默认风险推演采用 ${derived.historicalWindow} 的真实热浪案例。`
          : `当前温度 ${formatDecimal(derived.forecast?.current_temperature, 1)}℃；该值是未来24小时预报峰值，风险推演直接使用未来72小时预报。`,
      tone: "warm",
    },
    {
      label: "重点城区",
      title: derived.topDistrict.district || "待识别",
      value:
        derived.topDistrict.average_risk !== null && derived.topDistrict.average_risk !== undefined
          ? `${formatDecimal(derived.topDistrict.average_risk, 2)} 分`
          : "--",
      meta: `${formatNumber(dashboard.risk_summary?.high_risk_cells || 0)} 个高风险网格待持续盯防。`,
      tone: "danger",
    },
    {
      label: "覆盖动作",
      title: scenario ? `新增 ${scenario.new_site_count} 点方案` : "待返回优化方案",
      value: scenario ? `${formatNumber(scenario.metrics.coverage_improvement_population || 0)} 人` : "--",
      meta: scenario
        ? `相对 ${derived.activeCoolingLabel} 基线，覆盖率 ${formatPercent(scenario.metrics.coverage_rate_population, 1)}。`
        : "暂无新增点位的覆盖收益数据。",
      tone: "teal",
    },
    {
      label: "时间收益",
      title: "平均到达压缩",
      value: timeSaved ? formatMinutes(timeSaved) : "--",
      meta: updatedAt === "--" ? "相对基线测算时间收益。" : `最新重算时间 ${updatedAt}`,
      tone: "violet",
    },
  ];

  items.forEach((item) => {
    const block = document.createElement("article");
    block.className = "ops-item";
    block.dataset.tone = item.tone;
    block.innerHTML = `
      <span class="ops-label">${item.label}</span>
      <strong class="ops-title">${item.title}</strong>
      <span class="ops-value">${item.value}</span>
      <small class="ops-meta">${item.meta}</small>
    `;
    container.appendChild(block);
  });
}

function renderActionCards(containerId, items) {
  const container = byId(containerId);
  if (!container) return;
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "action-card";

    const head = document.createElement("div");
    head.className = "action-card-head";

    const title = document.createElement("strong");
    title.textContent = item.title;
    head.appendChild(title);

    if (item.tag) {
      const tag = document.createElement("span");
      tag.className = "action-tag";
      tag.textContent = item.tag;
      head.appendChild(tag);
    }

    const detail = document.createElement("p");
    detail.textContent = item.detail;

    card.append(head, detail);
    container.appendChild(card);
  });
}

function renderSourceCards(containerId, items) {
  const container = byId(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!items.length) {
    renderEmptyBlock(containerId, "暂无来源追踪信息。");
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "source-card";
    if (item.tone) {
      card.dataset.tone = item.tone;
    }

    const head = document.createElement("div");
    head.className = "source-card-head";

    const title = document.createElement("strong");
    title.textContent = item.title;

    const badge = document.createElement("span");
    badge.className = "action-tag";
    badge.textContent = item.status;

    head.append(title, badge);

    const meta = document.createElement("small");
    meta.textContent = item.meta;

    const detail = document.createElement("p");
    detail.textContent = item.detail;

    card.append(head, meta, detail);

    if (item.href) {
      const link = createExternalLink(item.linkLabel || "查看来源", item.href);
      if (link) {
        card.appendChild(link);
      }
    }

    container.appendChild(card);
  });
}

function renderAuthenticityCards(containerId, items) {
  const container = byId(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!items.length) {
    renderEmptyBlock(containerId, "暂无数据真实性审计结果。");
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "source-card authenticity-card";
    card.dataset.tone = getAuditTone(item);

    const head = document.createElement("div");
    head.className = "source-card-head";

    const copy = document.createElement("div");
    copy.className = "authenticity-copy";

    const title = document.createElement("strong");
    title.textContent = item.label || "--";

    const meta = document.createElement("small");
    meta.textContent =
      `${humanizeAuditStage(item.stage)} · ${humanizeAuthenticityLabel(item.authenticity_label)} · ` +
      `${humanizeAuditLevel(item.current_data_level)}${item.checked_at ? ` · ${formatDateTime(item.checked_at)}` : ""}`;

    copy.append(title, meta);

    const badge = document.createElement("span");
    badge.className = "action-tag";
    badge.textContent = humanizeAuditStatus(item.status);

    head.append(copy, badge);

    const claim = document.createElement("p");
    claim.textContent = item.safe_claim || item.authenticity_label || "--";

    const points = document.createElement("div");
    points.className = "authenticity-points";

    const pointItems = [];
    if (item.evidence?.[0]) {
      pointItems.push({ tone: "default", text: item.evidence[0] });
    }
    if (item.warnings?.length) {
      pointItems.push({ tone: "warning", text: `注意：${item.warnings[0]}` });
    }
    if (item.avoid_claim) {
      pointItems.push({ tone: "avoid", text: `避免表述：${item.avoid_claim}` });
    }

    pointItems.slice(0, 3).forEach((entry) => {
      const point = document.createElement("div");
      point.className = "authenticity-point";
      if (entry.tone !== "default") {
        point.dataset.tone = entry.tone;
      }
      point.textContent = entry.text;
      points.appendChild(point);
    });

    card.append(head, claim);

    if (pointItems.length) {
      card.appendChild(points);
    }

    if (item.source_urls?.[0]) {
      const link = createExternalLink("查看上游来源", item.source_urls[0]);
      if (link) {
        card.appendChild(link);
      }
    }

    container.appendChild(card);
  });
}

function renderReferenceLinks(containerId, items) {
  renderMetricRows(containerId, items, "暂无外部参考链接");
}

function applyCommandNavState(activeId) {
  const resolvedActiveId = activeId || "section-overview";
  const previousActiveId = document.body.dataset.activeSection || "section-overview";
  document.body.dataset.activeSection = resolvedActiveId;
  document.querySelectorAll(".command-link[data-section-target]").forEach((link) => {
    const isActive = link.dataset.sectionTarget === resolvedActiveId;
    link.classList.toggle("is-active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });
  const main = byId("main-content");
  main?.querySelectorAll("[data-page-owner]").forEach((section) => {
    const isActive = section.dataset.pageOwner === resolvedActiveId;
    section.classList.toggle("is-page-active", isActive);
    section.setAttribute("aria-hidden", isActive ? "false" : "true");
  });
  if (main) {
    main.dataset.currentPage = resolvedActiveId;
  }
  if (previousActiveId !== resolvedActiveId || window.location.hash === `#${resolvedActiveId}`) {
    window.scrollTo(0, 0);
  }
  updateSectionHud(resolvedActiveId);
  syncCommandIndicator();
  window.HeatGuardianExtras?.sectionChanged?.(resolvedActiveId);

  const refreshVisibleViewport = () => {
    if (spatialRuntime.map) {
      spatialRuntime.map.invalidateSize({ pan: false });
      if (resolvedActiveId === "section-spatial" && !spatialRuntime.visibleFitDone && appState.dashboard) {
        spatialRuntime.visibleFitDone = true;
        spatialRuntime.autoFitKey = null;
        renderSpatialBoard();
      }
    }
    chartRegistry.forEach((chart) => chart.resize());
  };

  refreshVisibleViewport();
  window.requestAnimationFrame(refreshVisibleViewport);
  window.setTimeout(refreshVisibleViewport, 48);
  window.setTimeout(refreshVisibleViewport, 140);
}

function getNavSectionIndex(sectionId) {
  const order = getCommandSectionOrder();
  const index = order.indexOf(sectionId);
  return index === -1 ? 0 : index;
}

function getCommandSectionOrder() {
  const dynamicOrder = Array.from(document.querySelectorAll(".command-link[data-section-target]"))
    .map((link) => link.dataset.sectionTarget)
    .filter(Boolean);
  return dynamicOrder.length ? dynamicOrder : NAV_SECTION_ORDER;
}

function getCommandSectionLabel(sectionId) {
  const section = sectionId ? byId(sectionId) : null;
  const link = Array.from(document.querySelectorAll(".command-link[data-section-target]")).find(
    (item) => item.dataset.sectionTarget === sectionId
  );
  const chapter = section?.dataset.chapter || "";
  const linkText = link?.textContent?.trim() || sectionId || "页面";
  const sectionTitle = section
    ?.querySelector("h1, h2, .panel-title, .track-title, .spotlight-title")
    ?.textContent?.trim();

  if (chapter && sectionTitle && sectionTitle !== linkText) {
    return `${chapter} · ${sectionTitle}`;
  }

  return chapter || linkText;
}

function getSectionTransitionDirection(targetId) {
  const currentId = document.body.dataset.activeSection || "section-overview";
  const currentIndex = getNavSectionIndex(currentId);
  const targetIndex = getNavSectionIndex(targetId);
  return targetIndex >= currentIndex ? "forward" : "back";
}

function canAnimateSectionTransition(targetId) {
  return (
    targetId &&
    document.body.dataset.activeSection !== targetId &&
    !prefersReducedMotion()
  );
}

function ensureSectionTransitionLayer() {
  let layer = document.querySelector(".section-transition-layer");
  if (layer) return layer;

  layer = document.createElement("div");
  layer.className = "section-transition-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `
    <span class="section-transition-grid"></span>
    <svg class="section-transition-mask" viewBox="0 0 100 100" preserveAspectRatio="none">
      <path class="section-heat-wave section-heat-wave-a" d="M-18,0 C8,12 11,35 31,42 C52,50 44,76 72,86 C86,91 95,96 118,100 L118,0 Z"></path>
      <path class="section-heat-wave section-heat-wave-b" d="M-28,0 C-2,16 18,24 24,42 C33,68 58,59 70,80 C79,94 98,94 126,100 L126,0 Z"></path>
    </svg>
    <span class="section-transition-route section-transition-route-a"></span>
    <span class="section-transition-route section-transition-route-b"></span>
    <span class="section-transition-route section-transition-route-c"></span>
    <span class="section-transition-ping section-transition-ping-a"></span>
    <span class="section-transition-ping section-transition-ping-b"></span>
    <span class="section-transition-ping section-transition-ping-c"></span>
    <span class="section-transition-ping section-transition-ping-d"></span>
    <div class="section-transition-page-deck">
      <div class="section-transition-page-snapshot"></div>
    </div>
    <span class="section-transition-rail section-transition-rail-top"></span>
    <span class="section-transition-rail section-transition-rail-bottom"></span>
    <span class="section-transition-sweep"></span>
    <span class="section-transition-signal"></span>
    <span class="section-transition-word"></span>
    <span class="section-transition-code"></span>
    <div class="section-transition-card">
      <span>切换至</span>
      <strong></strong>
    </div>
  `;
  document.body.appendChild(layer);
  return layer;
}

function finishSectionTransition() {
  const layer = document.querySelector(".section-transition-layer");
  if (!layer) return;

  if (sectionTransitionTimer) {
    window.clearTimeout(sectionTransitionTimer);
    sectionTransitionTimer = null;
  }

  layer.classList.remove("is-active", "is-forward", "is-back", "is-deck");
  document.body.classList.remove("is-section-transitioning", "is-section-deck-transitioning");
  delete document.documentElement.dataset.sectionTransitionDirection;
  window.HeatGuardianMotion?.finishSectionTransition?.(layer);
  window.setTimeout(() => {
    window.HeatGuardianMotion?.finishSectionTransition?.(layer);
  }, 32);
}

function playSectionTransition(direction, targetId, style = "handoff") {
  const layer = ensureSectionTransitionLayer();
  const label = layer.querySelector(".section-transition-card strong");
  const labelTag = layer.querySelector(".section-transition-card span");
  const word = layer.querySelector(".section-transition-word");
  const code = layer.querySelector(".section-transition-code");
  const chapter = byId(targetId)?.dataset.chapter || "HEAT";
  if (label) {
    label.textContent = getCommandSectionLabel(targetId);
  }
  if (labelTag) {
    labelTag.textContent = style === "deck" ? "3D SCROLL DECK" : "MISSION HANDOFF";
  }
  if (word) {
    word.textContent = chapter.replace(" / ", " · ");
  }
  if (code) {
    code.textContent = `WUHAN GRID / ${targetId.replace("section-", "").toUpperCase()} / LIVE`;
  }

  if (sectionTransitionTimer) {
    window.clearTimeout(sectionTransitionTimer);
    sectionTransitionTimer = null;
  }

  document.documentElement.dataset.sectionTransitionDirection = direction;
  document.body.classList.add("is-section-transitioning");
  document.body.classList.toggle("is-section-deck-transitioning", style === "deck");
  layer.classList.remove("is-active", "is-forward", "is-back", "is-deck");
  layer.classList.toggle("is-deck", style === "deck");
  const gsapTransitionDuration = window.HeatGuardianMotion?.playSectionTransition?.({
    layer,
    direction,
    targetId,
    duration: style === "deck" ? SECTION_DECK_TRANSITION_DURATION_MS : SECTION_TRANSITION_DURATION_MS,
    style,
  });
  if (!gsapTransitionDuration) {
    void layer.offsetWidth;
    layer.classList.add("is-active", direction === "back" ? "is-back" : "is-forward");
    if (style === "deck") layer.classList.add("is-deck");
  }
  sectionTransitionTimer = window.setTimeout(() => {
    sectionTransitionTimer = null;
    finishSectionTransition();
  }, gsapTransitionDuration || (style === "deck" ? SECTION_DECK_TRANSITION_DURATION_MS : SECTION_TRANSITION_DURATION_MS));
}

function markSectionArriving(activeId) {
  if (prefersReducedMotion()) return;
  if (window.HeatGuardianMotion?.enterSection?.(activeId)) return;
  const main = byId("main-content");
  if (!main) return;

  const sections = Array.from(main.querySelectorAll(`[data-page-owner="${activeId}"]`));
  sections.forEach((section, index) => {
    section.classList.remove("is-section-arriving");
    section.style.setProperty("--section-arrive-index", String(Math.min(index, 3)));
    void section.offsetWidth;
    section.classList.add("is-section-arriving");
    window.setTimeout(() => {
      section.classList.remove("is-section-arriving");
      section.style.removeProperty("--section-arrive-index");
    }, 340);
  });
}

function getAdjacentCommandSection(delta) {
  const order = getCommandSectionOrder();
  const currentId = document.body.dataset.activeSection || "section-overview";
  const currentIndex = Math.max(order.indexOf(currentId), 0);
  const targetIndex = clampValue(currentIndex + delta, 0, order.length - 1);
  return order[targetIndex] === currentId ? null : order[targetIndex];
}

function getActivePageElements(sectionId = document.body.dataset.activeSection || "section-overview") {
  const main = byId("main-content");
  return Array.from(main?.querySelectorAll(`[data-page-owner="${sectionId}"].is-page-active`) || []);
}

function getActivePageBounds(sectionId = document.body.dataset.activeSection || "section-overview") {
  const elements = getActivePageElements(sectionId);
  if (!elements.length) return null;

  let top = Infinity;
  let bottom = -Infinity;
  elements.forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  });

  return Number.isFinite(top) && Number.isFinite(bottom) ? { top, bottom } : null;
}

function getNavOffset() {
  const navShell = document.querySelector(".command-nav-shell");
  const rect = navShell?.getBoundingClientRect();
  return rect ? rect.bottom : 0;
}

function getPageEdgeDirection(deltaY) {
  const bounds = getActivePageBounds();
  if (!bounds) return 0;
  if (deltaY > 0 && bounds.bottom <= window.innerHeight + SECTION_PAGE_EDGE_TOLERANCE) return 1;
  if (deltaY < 0 && bounds.top >= getNavOffset() - SECTION_PAGE_EDGE_TOLERANCE) return -1;
  return 0;
}

function navigateToCommandSection(targetId, options = {}) {
  if (!targetId || !byId(targetId)) return false;
  if (!updateCommandNav(targetId, options)) return false;
  history.replaceState(null, "", `#${targetId}`);
  return true;
}

function isSectionNavigationInputTarget(target) {
  return Boolean(
    target?.closest(
      "a, button, input, textarea, select, [contenteditable='true'], [role='button'], .leaflet-container, .chart, .table-wrap, .command-nav"
    )
  );
}

function bindSectionNavigationInput() {
  if (sectionInputBound) return;
  const nav = byId("command-nav");
  if (!nav) return;

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.repeat || isSectionNavigationInputTarget(event.target)) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

    const targetId = getAdjacentCommandSection(event.key === "ArrowRight" ? 1 : -1);
    if (!targetId) return;

    event.preventDefault();
    navigateToCommandSection(targetId);
  });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      if (isSectionNavigationInputTarget(event.target)) return;
      sectionTouchStart = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
      };
      sectionTouchEdgeReady = getPageEdgeDirection(1) === 1 || getPageEdgeDirection(-1) === -1;
    },
    { passive: true }
  );

  document.addEventListener(
    "pointerup",
    (event) => {
      if (!sectionTouchStart) return;
      const deltaX = event.clientX - sectionTouchStart.x;
      const deltaY = event.clientY - sectionTouchStart.y;
      const elapsed = performance.now() - sectionTouchStart.time;
      sectionTouchStart = null;

      if (elapsed > 820) return;
      if (Math.abs(deltaX) >= SECTION_SWIPE_TOUCH_THRESHOLD && Math.abs(deltaX) >= Math.abs(deltaY) * 1.35) {
        const targetId = getAdjacentCommandSection(deltaX < 0 ? 1 : -1);
        if (targetId) {
          navigateToCommandSection(targetId);
        }
        return;
      }

      if (!sectionTouchEdgeReady) return;
      if (Math.abs(deltaY) < SECTION_SWIPE_TOUCH_THRESHOLD || Math.abs(deltaY) < Math.abs(deltaX) * 1.25) return;

      const edgeDirection = getPageEdgeDirection(-deltaY);
      if (!edgeDirection) return;
      const targetId = getAdjacentCommandSection(edgeDirection);
      if (targetId) {
        navigateToCommandSection(targetId, { transitionStyle: "deck" });
      }
    },
    { passive: true }
  );

  document.addEventListener("pointercancel", () => {
    sectionTouchStart = null;
    sectionTouchEdgeReady = false;
  });

  document.addEventListener(
    "wheel",
    (event) => {
      if (event.defaultPrevented || prefersReducedMotion()) return;
      if (isSectionNavigationInputTarget(event.target)) return;
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX) * 1.18) return;

      const now = performance.now();
      if (now < sectionWheelLockedUntil || document.body.classList.contains("is-section-transitioning")) {
        event.preventDefault();
        return;
      }

      const edgeDirection = getPageEdgeDirection(event.deltaY);
      if (!edgeDirection) {
        sectionWheelAccumulator = 0;
        return;
      }

      sectionWheelAccumulator += event.deltaY;
      if (Math.abs(sectionWheelAccumulator) < SECTION_WHEEL_THRESHOLD) return;

      const targetId = getAdjacentCommandSection(edgeDirection);
      sectionWheelAccumulator = 0;
      if (!targetId) return;

      event.preventDefault();
      sectionWheelLockedUntil = now + SECTION_WHEEL_LOCK_MS;
      navigateToCommandSection(targetId, { transitionStyle: "deck" });
    },
    { passive: false }
  );

  sectionInputBound = true;
}

function updateCommandNav(activeId, options = {}) {
  const resolvedActiveId = activeId || "section-overview";

  if (options.animate === false || !canAnimateSectionTransition(resolvedActiveId)) {
    applyCommandNavState(resolvedActiveId);
    return true;
  }

  if (document.body.classList.contains("is-section-transitioning")) {
    finishSectionTransition();
  }

  const direction = getSectionTransitionDirection(resolvedActiveId);
  const applyState = () => {
    applyCommandNavState(resolvedActiveId);
    markSectionArriving(resolvedActiveId);
    window.setTimeout(() => pulseDecisionSignals(), 56);
  };

  if (options.transitionStyle === "deck") {
    playSectionTransition(direction, resolvedActiveId, "deck");
    window.setTimeout(applyState, Math.round(SECTION_DECK_TRANSITION_DURATION_MS * 0.46));
    return true;
  }

  playSectionTransition(direction, resolvedActiveId, "handoff");
  window.setTimeout(applyState, Math.round(SECTION_TRANSITION_DURATION_MS * 0.4));

  return true;
}

function assignPageOwners() {
  let currentOwner = "section-overview";
  document.querySelectorAll("main .observe-section").forEach((section) => {
    if (section.hasAttribute("data-nav-section") && section.id) {
      currentOwner = section.id;
    }
    section.dataset.pageOwner = currentOwner;
  });
}

function ensureCommandIndicator() {
  const nav = byId("command-nav");
  if (!nav) return null;

  let indicator = nav.querySelector(".command-indicator");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "command-indicator";
    nav.appendChild(indicator);
  }
  return indicator;
}

function moveCommandIndicator(targetLink) {
  const nav = byId("command-nav");
  const indicator = ensureCommandIndicator();
  if (!nav || !indicator || !targetLink) return;

  const navRect = nav.getBoundingClientRect();
  const linkRect = targetLink.getBoundingClientRect();
  indicator.style.width = `${linkRect.width}px`;
  indicator.style.height = `${linkRect.height}px`;
  indicator.style.transform = `translate(${linkRect.left - navRect.left}px, ${linkRect.top - navRect.top}px)`;
  indicator.style.opacity = "1";
}

function syncCommandIndicator() {
  const active = document.querySelector(".command-link.is-active");
  if (active) {
    moveCommandIndicator(active);
  }
}

function resetDockScales() {
  document.querySelectorAll(".command-link[data-section-target]").forEach((link) => {
    link.style.setProperty("--dock-scale", "1");
  });
}

function updateDockScales(clientX) {
  document.querySelectorAll(".command-link[data-section-target]").forEach((link) => {
    const rect = link.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const distance = Math.abs(clientX - center);
    const scale = Math.max(1, 1.16 - distance / 220);
    link.style.setProperty("--dock-scale", String(Math.min(scale, 1.16).toFixed(3)));
  });
}

function bindCommandNav() {
  if (commandNavBound) return;
  const links = document.querySelectorAll(".command-link[data-section-target]");
  const nav = byId("command-nav");
  if (!links.length || !nav) return;

  ensureCommandIndicator();

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.dataset.sectionTarget;
      if (!targetId) return;
      event.preventDefault();
      if (updateCommandNav(targetId)) {
        history.replaceState(null, "", `#${targetId}`);
      }
    });

    link.addEventListener("mouseenter", () => {
      moveCommandIndicator(link);
    });
  });

  nav.addEventListener("mousemove", (event) => {
    updateDockScales(event.clientX);
  });

  nav.addEventListener("mouseleave", () => {
    resetDockScales();
    syncCommandIndicator();
  });

  bindSectionNavigationInput();
  commandNavBound = true;
}

function setupSectionObservers() {
  if (sectionObserverBound) return;
  const sections = document.querySelectorAll(".observe-section");
  if (!sections.length) {
    return;
  }

  assignPageOwners();
  const initialHash = window.location.hash.replace("#", "");
  const initialTarget = byId(initialHash);
  const initialSection = initialTarget?.hasAttribute("data-nav-section") ? initialHash : "section-overview";
  updateCommandNav(initialSection, { animate: false });

  sections.forEach((section, index) => {
    window.setTimeout(() => {
      section.classList.add("is-visible");
    }, 40 + index * 55);
  });

  sectionObserverBound = true;
}

function setupInteractiveChrome() {
  if (!interactiveChromeBound) {
    ensureResizeBinding();
    interactiveChromeBound = true;
  }

  bindScrollProgress();
  setupHeroAtmosphere();
  setupKineticPresentation();

  document
    .querySelectorAll(
      ".hero-stage, .hero-aside, .workflow-step, .panel, .card, .spotlight-card, .site-card, .ops-item, .summary-pill, .aside-kpi, .briefing-card, .focus-card, .mini-panel, .action-card, .metric-row, .spotlight-metric, .site-stat, .spatial-stage, .source-card"
    )
    .forEach((surface) => {
      surface.classList.remove("has-surface-glow", "is-surface-active");
      surface.style.removeProperty("--spot-x");
      surface.style.removeProperty("--spot-y");
      surface.querySelectorAll(".surface-glow, .surface-frame").forEach((node) => node.remove());
      surface.dataset.surfaceBound = "disabled";
    });

  syncCommandIndicator();
}

function renderSiteCards(containerId, items) {
  const container = byId(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!items.length) {
    renderEmptyBlock(containerId, "当前方案没有返回候选点。");
    return;
  }

  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "site-card";

    const head = document.createElement("div");
    head.className = "site-card-head";

    const nameCell = document.createElement("div");
    nameCell.className = "name-cell";

    const rank = document.createElement("span");
    rank.className = "rank-pill";
    rank.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("div");
    copy.className = "site-copy";

    const name = document.createElement("strong");
    name.textContent = getPoiDisplayName(item, index);

    const meta = document.createElement("small");
    const sourceDetail = getPoiSourceDetail(item);
    meta.textContent =
      `${normalizePoiCategory(item)} · ${item.district || "未标注城区"} · ${formatCoord(item.lat, item.lon)}`;

    copy.append(name, meta);
    if (sourceDetail) {
      const source = document.createElement("small");
      source.className = "site-source-note";
      source.textContent = sourceDetail;
      copy.appendChild(source);
    }
    nameCell.append(rank, copy);

    const tag = document.createElement("span");
    tag.className = "action-tag";
    tag.textContent =
      item.selection_reason || (item.covered_elderly_population > 0 ? "覆盖优先" : "均时优化");

    head.append(nameCell, tag);

    const stats = document.createElement("div");
    stats.className = "site-stats";

    [
      {
        label: "新增覆盖人口",
        value: `${formatNumber(item.covered_elderly_population)} 人`,
      },
      {
        label: "改善网格",
        value: `${formatNumber(item.improved_cells)} 格`,
      },
      {
        label: "运行适配",
        value: formatDecimal(item.operational_suitability, 2),
      },
      {
        label: "容量代理",
        value: `${formatNumber(item.capacity_units || 0)} 单位`,
      },
    ].forEach((metric) => {
      const stat = document.createElement("div");
      stat.className = "site-stat";

      const label = document.createElement("span");
      label.textContent = metric.label;

      const value = document.createElement("strong");
      value.textContent = metric.value;

      stat.append(label, value);
      stats.appendChild(stat);
    });

    card.append(head, stats);
    container.appendChild(card);
  });
}

function getExperimentsCount(experiments) {
  return Object.keys(experiments || {}).filter((key) => experiments[key]).length;
}

function getTopRiskCells(features) {
  return [...(features || [])]
    .sort((left, right) => (right.risk_score || 0) - (left.risk_score || 0))
    .slice(0, 3);
}

function getDefaultScenarioCount(dashboard) {
  const recommended = dashboard?.recommendations?.default_scenario;
  if (recommended) return recommended;
  return dashboard?.optimization?.scenarios?.[0]?.new_site_count || null;
}

function getScenarioByCount(optimization, count) {
  return (optimization.scenarios || []).find((item) => item.new_site_count === count) || null;
}

function buildDerivedState() {
  const dashboard = appState.dashboard || {};
  const grid = appState.grid || { features: [] };
  const dataSources = dashboard.data_sources || {};
  const authenticity = dashboard.data_authenticity || {};
  const authenticityOverall = authenticity.overall || {};
  const authenticitySummary = authenticity.summary || {};
  const authenticityModules = authenticity.modules || [];
  const optimization = dashboard.optimization || {};
  const weather = dashboard.weather || {};
  const forecast = weather.forecast || {};
  const analysisProfile = weather.analysis_profile || {};
  const forecastTrend = forecast.trend?.length ? forecast.trend : weather.trend || [];
  const historicalCase =
    weather.historical_heatwave_case ||
    (analysisProfile.profile_type === "historical_heatwave_case" ? analysisProfile : null);
  const historicalTrend = historicalCase?.trend?.length ? historicalCase.trend : [];
  const warningSignals = weather.warning_signals || {};
  const accessibility = dashboard.accessibility || {};
  const accessibilityScopes = accessibility.resource_scopes || {};
  const allSupportScope = accessibilityScopes.all_support_resources || accessibility || {};
  const activeCoolingScope = accessibilityScopes.existing_active_cooling_resources || {};
  const officialCoolingScope = accessibilityScopes.official_operational_cooling_sites || {};
  const officialCooling = dashboard.official_cooling || {};
  const officialSites = (officialCooling.sites || []).map((item, index) => ({
    ...item,
    displayName: getPoiDisplayName(item, index),
    displayCategory: normalizePoiCategory(item),
  }));
  const officialBulletins = officialCooling.bulletins || [];
  const officialSummary = officialCooling.summary || {};
  const defaultScenarioCount = getDefaultScenarioCount(dashboard);
  const selectedScenarioCount = appState.selectedScenarioCount || defaultScenarioCount;
  const selectedScenario = getScenarioByCount(optimization, selectedScenarioCount);
  const defaultScenario = getScenarioByCount(optimization, defaultScenarioCount);
  const riskSummary = dashboard.risk_summary || {};
  const topDistrict = (riskSummary.districts || [])[0] || {};
  const experiments = dashboard.experiments || {};
  const accessComparison = experiments.accessibility_algorithm_comparison || {};
  const ablation = experiments.ablation_validation || {};
  const riskVariants = (experiments.risk_model_validation || {}).variants || [];
  const fullModel = riskVariants.find((item) => item.key === "full_model_score") || {};
  const heatOnly = riskVariants.find((item) => item.key === "temperature_humidity_score") || {};
  const firstFeature = (grid.features || [])[0] || {};
  const selectedSites = (selectedScenario?.selected_sites || []).map((item, index) => ({
    ...item,
    displayName: getPoiDisplayName(item, index),
    displayCategory: normalizePoiCategory(item),
  }));
  const topCells = getTopRiskCells(grid.features || []);
  const baseline = optimization.baseline_metrics || {};
  const modelGain = Math.max(
    0,
    (fullModel.elderly_population_sum || 0) - (heatOnly.elderly_population_sum || 0)
  );
  const uncoveredHighRisk = Math.max(
    (optimization.high_risk_cell_count || 0) - (optimization.coverage_reachable_high_risk_cell_count || 0),
    0
  );
  const analysisProfileType =
    analysisProfile.profile_type || weather.default_risk_profile || "forecast";
  const analysisTrend = analysisProfile.trend?.length ? analysisProfile.trend : weather.trend || [];
  const baselineScope = optimization.baseline_scope || activeCoolingScope || {};
  const allSupportLabel = allSupportScope.scope_label || "全部支撑资源";
  const activeCoolingLabel = activeCoolingScope.scope_label || "既有主动避暑资源";
  const officialCoolingLabel = officialCoolingScope.scope_label || "官方公开在运纳凉点";
  const forecastWarning = getWarningSignal(warningSignals.forecast, "实时预报");
  const analysisWarning = getWarningSignal(warningSignals.analysis_profile, "默认推演");

  return {
    dashboard,
    grid,
    dataSources,
    authenticity,
    authenticityOverall,
    authenticitySummary,
    authenticityModules,
    optimization,
    weather,
    forecast,
    analysisProfile,
    forecastTrend,
    historicalCase,
    historicalTrend,
    warningSignals,
    forecastWarning,
    analysisWarning,
    analysisProfileType,
    analysisTrend,
    accessibility,
    accessibilityScopes,
    allSupportScope,
    activeCoolingScope,
    officialCoolingScope,
    officialCooling,
    officialSites,
    officialBulletins,
    officialSummary,
    baselineScope,
    allSupportLabel,
    activeCoolingLabel,
    officialCoolingLabel,
    baseline,
    selectedScenario,
    selectedScenarioCount,
    defaultScenario,
    defaultScenarioCount,
    topDistrict,
    firstFeature,
    experiments,
    accessComparison,
    ablation,
    fullModel,
    heatOnly,
    modelGain,
    uncoveredHighRisk,
    selectedSites,
    topCells,
    riskContextLabel: weather.risk_context_label || analysisProfile.context_label || "--",
    analysisWindow: formatWindowLabel(analysisProfile.start_time, analysisProfile.end_time),
    liveDateLabel: formatDateLabel(forecast.generated_at || weather.generated_at || forecastTrend[0]?.time),
    forecastWindow: getTrendWindowLabel(forecastTrend),
    historicalWindow:
      formatWindowLabel(
        historicalCase?.start_time || historicalTrend[0]?.time,
        historicalCase?.end_time || historicalTrend[historicalTrend.length - 1]?.time
      ),
    officialVerifiedCount:
      officialSummary.verified_site_count ||
      officialSites.filter((item) => item.source_verified).length,
  };
}

function getStudyBounds(derived) {
  const bbox = derived.dashboard.study_area?.bbox;
  if (
    bbox &&
    [bbox.west, bbox.east, bbox.south, bbox.north].every(
      (value) => value !== null && value !== undefined && !Number.isNaN(Number(value))
    )
  ) {
    return {
      west: Number(bbox.west),
      east: Number(bbox.east),
      south: Number(bbox.south),
      north: Number(bbox.north),
    };
  }

  const lons = [];
  const lats = [];
  (derived.grid.features || []).forEach((feature) => {
    (feature.polygon || []).forEach(([lon, lat]) => {
      lons.push(Number(lon));
      lats.push(Number(lat));
    });
  });
  derived.selectedSites.forEach((site) => {
    lons.push(Number(site.lon));
    lats.push(Number(site.lat));
  });
  (derived.dashboard.study_area?.district_hotspots || []).forEach((item) => {
    lons.push(Number(item.lon));
    lats.push(Number(item.lat));
  });

  if (!lons.length || !lats.length) {
    return null;
  }

  return {
    west: Math.min(...lons),
    east: Math.max(...lons),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
}

function projectPoint(lon, lat, bounds, width = 1000, height = 680, padding = 44) {
  const lonSpan = Math.max(bounds.east - bounds.west, 0.000001);
  const latSpan = Math.max(bounds.north - bounds.south, 0.000001);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const x = padding + ((lon - bounds.west) / lonSpan) * usableWidth;
  const y = height - padding - ((lat - bounds.south) / latSpan) * usableHeight;

  return {
    x: clampValue(x, padding, width - padding),
    y: clampValue(y, padding, height - padding),
  };
}

function getRiskColor(score) {
  if (score >= 70) return "#ff7e64";
  if (score >= 60) return "#f2b967";
  if (score >= 45) return "#4f9fff";
  return "#2c628f";
}

function getRiskBand(score) {
  if (score >= 70) return "高风险";
  if (score >= 45) return "中风险";
  return "低风险";
}

function createSvgNode(tag, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    node.setAttribute(key, String(value));
  });
  return node;
}

function syncMapFocus(derived) {
  const currentFocus = appState.mapFocus;
  if (currentFocus?.type === "site") {
    const site = derived.selectedSites.find((item) => String(item.poi_id) === String(currentFocus.id));
    if (site) {
      return { type: "site", data: site };
    }
  }

  if (currentFocus?.type === "cell") {
    const cell = (derived.grid.features || []).find((item) => item.id === currentFocus.id);
    if (cell) {
      return { type: "cell", data: cell };
    }
  }

  if (derived.topCells.length) {
    appState.mapFocus = { type: "cell", id: derived.topCells[0].id };
    return { type: "cell", data: derived.topCells[0] };
  }

  if (derived.selectedSites.length) {
    appState.mapFocus = { type: "site", id: derived.selectedSites[0].poi_id };
    return { type: "site", data: derived.selectedSites[0] };
  }

  appState.mapFocus = null;
  return { type: "empty", data: null };
}

function pulseSpatialFocus() {
  if (prefersReducedMotion()) return;
  const stage = document.querySelector(".spatial-stage");
  if (!stage) return;
  const burst = document.createElement("span");
  burst.className = "spatial-focus-burst";
  burst.setAttribute("aria-hidden", "true");
  stage.appendChild(burst);
  window.setTimeout(() => burst.remove(), 680);
}

function setMapFocus(type, id) {
  appState.mapFocus = { type, id };
  renderSpatialBoard();
  pulseSpatialFocus();
  window.setTimeout(() => pulseDecisionSignals(byId("section-spatial") || document), 90);
}

function renderPriorityList(containerId, items, type, activeId) {
  const container = byId(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!items.length) {
    renderEmptyBlock(containerId, "暂无对象。");
    return;
  }

  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mini-button${String(activeId) === String(type === "site" ? item.poi_id : item.id) ? " is-active" : ""}`;

    const copy = document.createElement("div");
    copy.className = "mini-copy";
    const title = document.createElement("strong");
    const meta = document.createElement("small");
    const value = document.createElement("span");
    value.className = "mini-value";

    if (type === "cell") {
      title.textContent = `${item.district} · 网格 ${index + 1}`;
      meta.textContent = `老年人口 ${formatNumber(item.estimated_elderly_population)}，步行 ${formatMinutes(item.nearest_walk_minutes)}`;
      value.textContent = `${formatDecimal(item.risk_score, 1)} 分`;
      button.addEventListener("click", () => setMapFocus("cell", item.id));
    } else {
      title.textContent = item.displayName || item.name;
      meta.textContent = `${item.displayCategory} · 改善 ${formatNumber(item.improved_cells)} 个网格`;
      value.textContent = `${formatNumber(item.covered_elderly_population)} 人`;
      button.addEventListener("click", () => setMapFocus("site", item.poi_id));
    }

    copy.append(title, meta);
    button.append(copy, value);
    container.appendChild(button);
  });
}

function renderMapFocusPanel(derived, focus) {
  const title = byId("map-focus-title");
  const summary = byId("map-focus-summary");
  const badge = byId("map-focus-badge");

  if (!focus.data) {
    if (title) title.textContent = "暂无空间对象";
    if (summary) summary.textContent = "当前没有风险网格或候选点可以投影到空间面板。";
    if (badge) badge.textContent = "空";
    renderFocusMetrics("map-focus-metrics", []);
    return;
  }

  if (focus.type === "cell") {
    const cell = focus.data;
    if (title) {
      title.textContent = `${cell.district}重点风险网格`;
    }
    if (badge) {
      badge.textContent = getRiskBand(cell.risk_score);
    }
    if (summary) {
      summary.textContent =
        `${cell.district}当前为重点盯防对象，风险分 ${formatDecimal(cell.risk_score, 2)}，` +
        `预计老年人口 ${formatNumber(cell.estimated_elderly_population)}。` +
        `${cell.nearest_walk_minutes ? `最近步行到现有资源约 ${formatMinutes(cell.nearest_walk_minutes)}。` : "现状下 15 分钟内步行覆盖不足。"}`
    }

    renderFocusMetrics("map-focus-metrics", [
      {
        label: "风险分",
        value: `${formatDecimal(cell.risk_score, 2)} 分`,
        meta: `等级 ${cell.risk_level || getRiskBand(cell.risk_score)}`,
      },
      {
        label: "老年人口",
        value: `${formatNumber(cell.estimated_elderly_population)} 人`,
        meta: `80+ 约 ${formatNumber(cell.age80_plus || 0)} 人`,
      },
      {
        label: "最近步行",
        value: formatMinutes(cell.nearest_walk_minutes),
        meta: `${formatNumber(cell.nearby_resource_count || 0)} 个周边资源`,
      },
      {
        label: "最近资源距离",
        value: cell.nearest_poi_distance_km ? `${formatDecimal(cell.nearest_poi_distance_km, 2)} km` : "--",
        meta: `网格中心 ${formatCoord(cell.center_lat, cell.center_lon)}`,
      },
    ]);
    return;
  }

  const site = focus.data;
  if (title) {
    title.textContent = site.displayName || site.name;
  }
  if (badge) {
    badge.textContent = site.covered_elderly_population > 0 ? "覆盖优先" : "均时优化";
  }
  if (summary) {
    const sourceDetail = getPoiSourceDetail(site);
    summary.textContent =
      `${site.displayCategory || normalizePoiCategory(site)}候选点位于 ${formatCoord(site.lat, site.lon)}，` +
      `当前方案下新增覆盖 ${formatNumber(site.covered_elderly_population)} 名高风险老年人口，` +
      `并改善 ${formatNumber(site.improved_cells)} 个网格的到达时间。` +
      (sourceDetail ? ` ${sourceDetail}。` : "");
  }

  renderFocusMetrics("map-focus-metrics", [
    {
      label: "点位类型",
      value: site.displayCategory || normalizePoiCategory(site),
      meta: "当前选址方案入选点",
    },
    {
      label: "新增覆盖",
      value: `${formatNumber(site.covered_elderly_population)} 人`,
      meta: `${formatNumber(site.covered_cells || 0)} 个网格直接补盲`,
    },
    {
      label: "改善网格",
      value: `${formatNumber(site.improved_cells || 0)} 个`,
      meta: `时间收益 ${formatNumber(Math.round(site.weighted_time_saving || 0))}`,
    },
    {
      label: "经纬度",
      value: formatCoord(site.lat, site.lon),
      meta: `综合评分 ${formatNumber(Math.round(site.score || 0))}`,
    },
  ]);
}

function buildGridGeoJsonFromFeatures(features) {
  return {
    type: "FeatureCollection",
    features: (features || [])
      .filter((item) => Array.isArray(item.polygon) && item.polygon.length >= 4)
      .map((item) => ({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[...item.polygon.map((point) => [Number(point[0]), Number(point[1])])]],
        },
        properties: { ...item },
      })),
  };
}

function getSpatialGeoJson(derived) {
  const geojson = appState.gridGeojson;
  if (geojson?.features?.length) return geojson;
  return buildGridGeoJsonFromFeatures(derived.grid?.features || []);
}

function buildRiskPopup(properties) {
  return (
    `<strong>${properties.district || "未知区"} · ${properties.id || "网格"}</strong><br />` +
    `风险分数：${formatDecimal(properties.risk_score, 2)}<br />` +
    `老年人口：${formatNumber(properties.estimated_elderly_population || 0)}<br />` +
    `最近步行：${formatMinutes(properties.nearest_walk_minutes)}`
  );
}

function buildSitePopup(site, metaLabel) {
  const sourceDetail = getPoiSourceDetail(site);
  return (
    `<strong>${site.displayName || site.name || "点位"}</strong><br />` +
    `${site.displayCategory || normalizePoiCategory(site)} · ${metaLabel}<br />` +
    `坐标：${formatCoord(site.lat, site.lon)}<br />` +
    `新增覆盖：${formatNumber(site.covered_elderly_population || 0)} 人` +
    (sourceDetail ? `<br />来源说明：${sourceDetail}` : "")
  );
}

function clearSpatialLayers(map) {
  spatialRuntime.overlayLayers.forEach((layer) => {
    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });
  spatialRuntime.overlayLayers = [];
  if (spatialRuntime.layerControl) {
    map.removeControl(spatialRuntime.layerControl);
    spatialRuntime.layerControl = null;
  }
}

function ensureSpatialMap(containerId, derived) {
  if (!window.L) return null;
  const container = byId(containerId);
  if (!container) return null;

  if (!spatialRuntime.map) {
    const center = derived.dashboard?.study_area?.center || { lat: 30.5928, lon: 114.3055 };
    spatialRuntime.map = window.L.map(container, {
      zoomControl: true,
      scrollWheelZoom: false,
      preferCanvas: true,
    }).setView([Number(center.lat), Number(center.lon)], 11);

    const markTileLoaded = () => {
      spatialRuntime.tileLoadCount += 1;
      if (spatialRuntime.tileLoadCount > 1) {
        container.classList.remove("is-tile-fallback");
      }
    };
    const markTileError = () => {
      spatialRuntime.tileErrorCount += 1;
      if (spatialRuntime.tileLoadCount < 2) {
        container.classList.add("is-tile-fallback");
      }
    };

    const cartoLayer = window.L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
        detectRetina: true,
        opacity: 0.9,
      }
    );
    const osmLayer = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      detectRetina: true,
      opacity: 0.86,
    });

    [cartoLayer, osmLayer].forEach((layer) => {
      layer.on("tileload", markTileLoaded);
      layer.on("tileerror", markTileError);
    });

    spatialRuntime.baseLayers = {
      "CARTO 城市底图": cartoLayer,
      "OSM 底图": osmLayer,
    };
    spatialRuntime.baseLayer = cartoLayer;
    spatialRuntime.baseLayer.addTo(spatialRuntime.map);
  }

  return spatialRuntime.map;
}

function riskLayerStyle(properties, focus) {
  const isFocused = focus.type === "cell" && focus.data?.id === properties.id;
  const isTop = properties.risk_score >= 75;
  return {
    color: isFocused ? "#0b2934" : isTop ? "#e57b53" : "rgba(12, 140, 125, 0.28)",
    weight: isFocused ? 2.4 : isTop ? 1.45 : 0.55,
    fillColor: getRiskColor(properties.risk_score || 0),
    fillOpacity: isFocused ? 0.68 : isTop ? 0.38 : 0.24,
    opacity: isFocused ? 0.98 : isTop ? 0.74 : 0.44,
    className: `risk-cell${isTop ? " risk-cell-hot" : ""}${isFocused ? " risk-cell-focused" : ""}`,
  };
}

function createSiteIcon(index, focused) {
  return window.L.divIcon({
    className: "site-marker-shell",
    html: `<div class="leaflet-site-marker${focused ? " is-focused" : ""}"><span>★</span><small>${index + 1}</small></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -12],
  });
}

function getCellLatLng(cell) {
  const centerLat = Number(cell?.center_lat);
  const centerLon = Number(cell?.center_lon);
  if (Number.isFinite(centerLat) && Number.isFinite(centerLon)) {
    return [centerLat, centerLon];
  }

  if (!Array.isArray(cell?.polygon) || !cell.polygon.length) return null;
  const points = cell.polygon
    .map(([lon, lat]) => [Number(lat), Number(lon)])
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  if (!points.length) return null;

  const sum = points.reduce(
    (acc, [lat, lon]) => {
      acc.lat += lat;
      acc.lon += lon;
      return acc;
    },
    { lat: 0, lon: 0 }
  );
  return [sum.lat / points.length, sum.lon / points.length];
}

function getFocusLatLng(focus) {
  if (!focus?.data) return null;
  if (focus.type === "site") {
    const lat = Number(focus.data.lat);
    const lon = Number(focus.data.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }
  if (focus.type === "cell") {
    return getCellLatLng(focus.data);
  }
  return null;
}

function getFocusKey(focus) {
  if (!focus?.data) return "";
  if (focus.type === "site") return `site:${focus.data.poi_id || focus.data.id || ""}`;
  if (focus.type === "cell") return `cell:${focus.data.id || ""}`;
  return "";
}

function renderCoverageFlowLayer(map, derived, focus) {
  const flowLayer = window.L.layerGroup();
  const topCells = (derived.topCells || []).slice(0, 4);
  const selectedSites = (derived.selectedSites || []).slice(0, 5);
  const maxPairs = Math.min(selectedSites.length, topCells.length, 4);

  for (let index = 0; index < maxPairs; index += 1) {
    const site = selectedSites[index];
    const cell = topCells[index];
    const siteLatLng = [Number(site.lat), Number(site.lon)];
    const cellLatLng = getCellLatLng(cell);
    if (
      !cellLatLng ||
      !Number.isFinite(siteLatLng[0]) ||
      !Number.isFinite(siteLatLng[1])
    ) {
      continue;
    }

    const isFocused =
      (focus.type === "site" && String(focus.data?.poi_id) === String(site.poi_id)) ||
      (focus.type === "cell" && String(focus.data?.id) === String(cell.id));
    const flowGap = 9 + ((index * 5) % 12);
    const flowDash = 2 + (index % 3);
    const flowDuration = (1.18 + index * 0.29 + Math.abs(Math.sin(index + 0.7)) * 0.26).toFixed(2);
    const flowDelay = (-index * 0.31).toFixed(2);
    const flow = window.L.polyline([siteLatLng, cellLatLng], {
      color: isFocused ? "#0b8f82" : "#1f78d1",
      weight: isFocused ? 3 : 2,
      opacity: isFocused ? 0.82 : 0.48,
      dashArray: `${flowDash} ${flowGap}`,
      lineCap: "round",
      interactive: false,
      className: `leaflet-coverage-flow${isFocused ? " is-focused" : ""}`,
    });
    flow.on("add", () => {
      const element = flow.getElement();
      if (!element) return;
      element.style.setProperty("--flow-duration", `${flowDuration}s`);
      element.style.setProperty("--flow-delay", `${flowDelay}s`);
      element.style.setProperty("--flow-offset", String(18 + index * 7));
    });
    flowLayer.addLayer(flow);

    const pulse = window.L.circleMarker(cellLatLng, {
      radius: isFocused ? 18 : 13,
      color: isFocused ? "#0b8f82" : "#e57b53",
      weight: 1,
      fillColor: isFocused ? "#0c8c7d" : "#ff7e64",
      fillOpacity: 0.04,
      opacity: isFocused ? 0.82 : 0.42,
      interactive: false,
      className: `leaflet-coverage-pulse${isFocused ? " is-focused" : ""}`,
    });
    pulse.on("add", () => {
      const element = pulse.getElement();
      if (!element) return;
      element.style.setProperty("--pulse-duration", `${(1.9 + index * 0.22).toFixed(2)}s`);
      element.style.setProperty("--pulse-delay", `${(-index * 0.24).toFixed(2)}s`);
    });
    flowLayer.addLayer(pulse);
  }

  flowLayer.addTo(map);
  spatialRuntime.overlayLayers.push(flowLayer);
  return flowLayer;
}

function flySpatialMapToFocus(map, focus) {
  const latLng = getFocusLatLng(focus);
  const focusKey = getFocusKey(focus);
  const spatialSection = byId("section-spatial");
  if (!latLng || !focusKey || spatialRuntime.focusFlyKey === focusKey) return;
  if (spatialSection && !spatialSection.classList.contains("is-page-active")) return;

  spatialRuntime.focusFlyKey = focusKey;
  const currentZoom = map.getZoom();
  map.flyTo(latLng, Math.max(currentZoom || 11, 12), {
    animate: !prefersReducedMotion(),
    duration: 0.58,
    easeLinearity: 0.28,
  });
}

function renderSpatialMap(containerId, derived, focus) {
  if (!window.L) {
    renderSpatialSvg(containerId, derived, focus);
    return;
  }

  const map = ensureSpatialMap(containerId, derived);
  if (!map) return;
  clearSpatialLayers(map);

  const overlays = {};
  const geojson = getSpatialGeoJson(derived);
  const selectedSiteIds = derived.selectedSites.map((site) => site.poi_id).join(",");
  const autoFitKey = `${derived.selectedScenarioCount || "none"}:${geojson.features?.length || 0}:${selectedSiteIds}`;

  const riskLayer = window.L.geoJSON(geojson, {
    style: (feature) => riskLayerStyle(feature.properties || {}, focus),
    onEachFeature: (feature, layer) => {
      const properties = feature.properties || {};
      layer.bindPopup(buildRiskPopup(properties));
      layer.on("click", () => setMapFocus("cell", properties.id));
    },
  });
  overlays["风险网格"] = riskLayer;
  riskLayer.addTo(map);
  spatialRuntime.overlayLayers.push(riskLayer);

  const flowLayer = renderCoverageFlowLayer(map, derived, focus);
  overlays["覆盖流线"] = flowLayer;

  const officialLayer = window.L.layerGroup();
  derived.officialSites.forEach((site) => {
    const marker = window.L.circleMarker([Number(site.lat), Number(site.lon)], {
      radius: focus.type === "site" && String(focus.data?.poi_id) === String(site.poi_id) ? 8 : 6,
      color: "#d9ecff",
      weight: 1.5,
      fillColor: "#4f9fff",
      fillOpacity: 0.92,
    });
    marker.bindPopup(buildSitePopup(site, site.site_type_label || "官方纳凉点"));
    officialLayer.addLayer(marker);
  });
  overlays["现有纳凉点"] = officialLayer;
  officialLayer.addTo(map);
  spatialRuntime.overlayLayers.push(officialLayer);

  const scenarioLayer = window.L.layerGroup();
  derived.selectedSites.forEach((site, index) => {
    const focused = focus.type === "site" && String(focus.data?.poi_id) === String(site.poi_id);
    const marker = window.L.marker([Number(site.lat), Number(site.lon)], {
      icon: createSiteIcon(index, focused),
      keyboard: true,
    });
    marker.bindPopup(buildSitePopup(site, "新增候选点"));
    marker.on("click", () => setMapFocus("site", site.poi_id));
    scenarioLayer.addLayer(marker);
  });
  overlays["推荐新增点"] = scenarioLayer;
  scenarioLayer.addTo(map);
  spatialRuntime.overlayLayers.push(scenarioLayer);

  const isochroneRadiusMeters = (derived.dashboard?.recommendations?.cutoff_min || 15) * 75;
  const isochroneLayer = window.L.layerGroup();
  derived.selectedSites.forEach((site) => {
    isochroneLayer.addLayer(
      window.L.circle([Number(site.lat), Number(site.lon)], {
        radius: isochroneRadiusMeters,
        color: "#66d28f",
        weight: 1.2,
        dashArray: "6 6",
        fillOpacity: 0.04,
      })
    );
  });
  overlays["15分钟等时圈"] = isochroneLayer;
  isochroneLayer.addTo(map);
  spatialRuntime.overlayLayers.push(isochroneLayer);

  spatialRuntime.layerControl = window.L.control
    .layers(spatialRuntime.baseLayers || { "OSM 底图": spatialRuntime.baseLayer }, overlays, { collapsed: false })
    .addTo(map);

  if (spatialRuntime.autoFitKey !== autoFitKey) {
    spatialRuntime.autoFitKey = autoFitKey;
    const bounds = riskLayer.getBounds && riskLayer.getBounds();
    if (bounds?.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });
    }
  }

  flySpatialMapToFocus(map, focus);
  window.setTimeout(() => map.invalidateSize(), 0);
}

function renderSpatialSvg(containerId, derived, focus) {
  const container = byId(containerId);
  if (!container) return;
  container.innerHTML = "";

  const features = derived.grid.features || [];
  const bounds = getStudyBounds(derived);
  if (!bounds) {
    renderEmptyBlock(containerId, "暂无可用于投影的空间数据。");
    return;
  }

  const width = 1000;
  const height = 680;
  const svg = createSvgNode("svg", {
    class: "spatial-svg",
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "xMidYMin meet",
  });

  const base = createSvgNode("rect", {
    x: 0,
    y: 0,
    width,
    height,
    rx: 28,
    fill: "#08131e",
  });
  svg.appendChild(base);

  for (let index = 1; index < 5; index += 1) {
    const x = 44 + ((width - 88) / 5) * index;
    const y = 44 + ((height - 88) / 5) * index;
    svg.appendChild(
      createSvgNode("line", {
        x1: x,
        y1: 28,
        x2: x,
        y2: height - 28,
        stroke: "rgba(255,255,255,0.05)",
        "stroke-width": 1,
      })
    );
    svg.appendChild(
      createSvgNode("line", {
        x1: 28,
        y1: y,
        x2: width - 28,
        y2: y,
        stroke: "rgba(255,255,255,0.05)",
        "stroke-width": 1,
      })
    );
  }

  [...features]
    .sort((left, right) => (left.risk_score || 0) - (right.risk_score || 0))
    .forEach((feature) => {
      const points = (feature.polygon || [])
        .map(([lon, lat]) => {
          const point = projectPoint(Number(lon), Number(lat), bounds, width, height);
          return `${point.x},${point.y}`;
        })
        .join(" ");

      const isFocused = focus.type === "cell" && focus.data?.id === feature.id;
      const isTop = derived.topCells.some((item) => item.id === feature.id);
      const polygon = createSvgNode("polygon", {
        points,
        fill: getRiskColor(feature.risk_score || 0),
        "fill-opacity": isFocused ? 0.9 : isTop ? 0.72 : 0.55,
        stroke: isFocused ? "#eef5ff" : isTop ? "#f2b967" : "rgba(255,255,255,0.08)",
        "stroke-width": isFocused ? 4 : isTop ? 2 : 1,
        "vector-effect": "non-scaling-stroke",
        cursor: "pointer",
      });
      const title = createSvgNode("title");
      title.textContent =
        `${feature.district} | 风险 ${formatDecimal(feature.risk_score, 2)} | 老年人口 ${formatNumber(feature.estimated_elderly_population)}`;
      polygon.appendChild(title);
      polygon.addEventListener("click", () => setMapFocus("cell", feature.id));
      svg.appendChild(polygon);
    });

  (derived.dashboard.study_area?.district_hotspots || []).forEach((item) => {
    const point = projectPoint(Number(item.lon), Number(item.lat), bounds, width, height);
    const hotspot = createSvgNode("rect", {
      x: point.x - 5,
      y: point.y - 5,
      width: 10,
      height: 10,
      transform: `rotate(45 ${point.x} ${point.y})`,
      fill: "rgba(57, 208, 186, 0.9)",
      stroke: "rgba(255,255,255,0.22)",
      "stroke-width": 1,
    });
    svg.appendChild(hotspot);
  });

  derived.officialSites.forEach((site) => {
    const point = projectPoint(Number(site.lon), Number(site.lat), bounds, width, height);
    const marker = createSvgNode("polygon", {
      points: `${point.x},${point.y - 7} ${point.x + 7},${point.y} ${point.x},${point.y + 7} ${point.x - 7},${point.y}`,
      fill: "rgba(57, 208, 186, 0.92)",
      stroke: "#071018",
      "stroke-width": 1.5,
      "vector-effect": "non-scaling-stroke",
    });
    const title = createSvgNode("title");
    title.textContent = `${site.displayName || site.name} | ${site.site_type_label || "官方纳凉点"}`;
    marker.appendChild(title);
    svg.appendChild(marker);
  });

  derived.selectedSites.forEach((site, index) => {
    const point = projectPoint(Number(site.lon), Number(site.lat), bounds, width, height);
    const isFocused = focus.type === "site" && String(focus.data?.poi_id) === String(site.poi_id);
    const group = createSvgNode("g", { cursor: "pointer" });
    group.addEventListener("click", () => setMapFocus("site", site.poi_id));

    const ring = createSvgNode("circle", {
      cx: point.x,
      cy: point.y,
      r: isFocused ? 15 : 12,
      fill: "rgba(159,149,255,0.14)",
      stroke: isFocused ? "#eef5ff" : "rgba(159,149,255,0.72)",
      "stroke-width": isFocused ? 2.5 : 1.5,
    });
    const dot = createSvgNode("circle", {
      cx: point.x,
      cy: point.y,
      r: 7.5,
      fill: "#9f95ff",
      stroke: "#081018",
      "stroke-width": 2,
    });
    const label = createSvgNode("text", {
      x: point.x,
      y: point.y + 4,
      "text-anchor": "middle",
      "font-size": 10,
      "font-family": "Cascadia Mono, Consolas, monospace",
      fill: "#eef5ff",
    });
    label.textContent = String(index + 1);

    const title = createSvgNode("title");
    title.textContent =
      `${site.displayName || site.name} | 新增覆盖 ${formatNumber(site.covered_elderly_population)} | 改善 ${formatNumber(site.improved_cells)} 个网格`;

    group.append(ring, dot, label, title);
    svg.appendChild(group);
  });

  const studyLabel = createSvgNode("text", {
    x: 44,
    y: 34,
    "font-size": 14,
    "font-family": "Cascadia Mono, Consolas, monospace",
    fill: "rgba(238,245,255,0.72)",
  });
  studyLabel.textContent = derived.dashboard.study_area?.display_name || "研究区";
  svg.appendChild(studyLabel);

  container.appendChild(svg);
}

function renderSpatialBoard() {
  const derived = buildDerivedState();
  const spatialChip = byId("spatial-chip");
  const focus = syncMapFocus(derived);

  if (spatialChip) {
    spatialChip.textContent = `新增 ${derived.selectedScenarioCount || "--"} 点 · 风险网格 + 候选点`;
  }

  renderSpatialMap("spatial-map", derived, focus);
  renderMapFocusPanel(derived, focus);
  renderPriorityList("priority-cell-list", derived.topCells, "cell", focus.type === "cell" ? focus.data?.id : null);
  renderPriorityList(
    "priority-site-list",
    derived.selectedSites,
    "site",
    focus.type === "site" ? focus.data?.poi_id : null
  );
  [80, 520].forEach((delay) => {
    window.setTimeout(() => {
      window.HeatGuardianMotion?.refreshSpatialMotion?.({
        map: spatialRuntime.map,
        selectedSites: derived.selectedSites,
        topCells: derived.topCells,
        focus,
      });
    }, delay);
  });
  window.setTimeout(() => window.HeatGuardianExtras?.spatialReady?.(), 120);
}

function renderPoiList(categories) {
  const derived = buildDerivedState();
  const sorted = [...categories].sort((left, right) => (right.count || 0) - (left.count || 0));
  const total = sumBy(sorted, (item) => item.count || 0);
  const items = [
    {
      name: derived.allSupportLabel,
      meta: `15 分钟覆盖 ${formatPercent(derived.allSupportScope?.coverage_15min_rate, 0)}`,
      value: formatNumber(derived.allSupportScope?.resource_count),
    },
    {
      name: derived.activeCoolingLabel,
      meta: `优化基线口径，15 分钟覆盖 ${formatPercent(derived.activeCoolingScope?.coverage_15min_rate, 0)}`,
      value: formatNumber(derived.activeCoolingScope?.resource_count),
    },
    {
      name: derived.officialCoolingLabel,
      meta: `官方公开在运点位，15 分钟覆盖 ${formatPercent(derived.officialCoolingScope?.coverage_15min_rate, 0)}`,
      value: formatNumber(derived.officialCoolingScope?.resource_count),
    },
    ...sorted.map((item) => ({
      name: item.name,
      meta: total > 0 ? `${Math.round(((item.count || 0) / total) * 100)}%` : "",
      value: formatNumber(item.count),
    })),
  ];
  renderMetricRows("poi-list", items, "暂无资源分类数据");
}

function renderRecommendations() {
  const derived = buildDerivedState();
  const tbody = byId("recommendation-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const items = derived.selectedSites.length
    ? derived.selectedSites
    : (derived.dashboard.recommendations?.recommendations || []).map((item, index) => ({
        ...item,
        displayName: getPoiDisplayName(item, index),
        displayCategory: normalizePoiCategory(item),
      }));

  items.forEach((item, index) => {
    const row = document.createElement("tr");

    const nameTd = document.createElement("td");
    const nameCell = document.createElement("div");
    nameCell.className = "name-cell";
    const rank = document.createElement("span");
    rank.className = "rank-pill";
    rank.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("span");
    name.textContent = item.displayName || item.name;
    nameCell.append(rank, name);
    nameTd.appendChild(nameCell);
    if (item.selection_reason || item.district) {
      const sub = document.createElement("small");
      sub.className = "table-sub";
      const parts = [];
      if (item.district) parts.push(item.district);
      if (item.selection_reason) parts.push(item.selection_reason);
      const sourceDetail = getPoiSourceDetail(item);
      if (sourceDetail) parts.push(sourceDetail);
      sub.textContent = parts.join(" · ");
      nameTd.appendChild(sub);
    }

    const typeTd = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "category-pill";
    pill.textContent = item.displayCategory || normalizePoiCategory(item);
    typeTd.appendChild(pill);

    const coveredTd = document.createElement("td");
    coveredTd.className = "table-num";
    coveredTd.textContent = formatNumber(item.covered_elderly_population);

    const cellTd = document.createElement("td");
    cellTd.className = "table-num";
    cellTd.textContent = formatNumber(item.covered_cells);

    const improvedTd = document.createElement("td");
    improvedTd.className = "table-num";
    improvedTd.textContent = formatNumber(item.improved_cells);

    const gainTd = document.createElement("td");
    gainTd.className = "table-num";
    gainTd.textContent = formatNumber(Math.round(item.weighted_time_saving || 0));

    row.append(nameTd, typeTd, coveredTd, cellTd, improvedTd, gainTd);
    tbody.appendChild(row);
  });
}

function renderSiteSpotlight() {
  const container = byId("site-spotlight");
  if (!container) return;

  const derived = buildDerivedState();
  const site = derived.selectedSites[0];
  const scenario = derived.selectedScenario || derived.defaultScenario;
  container.innerHTML = "";

  if (!site) {
    renderEmptyBlock("site-spotlight", "当前方案暂无可聚焦展示的候选点。");
    return;
  }

  const summary =
    site.covered_elderly_population > 0
      ? `作为当前${scenario ? `新增 ${scenario.new_site_count} 点` : "推荐"}方案的首位候选点，优先补齐${derived.topDistrict.district || "重点城区"}高风险老年人口盲区，适合先行纳入临时纳凉点部署。`
      : `该点位以压缩平均到达时间为主，更适合作为补足均时表现的结构性点位，与前序覆盖优先点配合落地。`;

  const card = document.createElement("article");
  card.className = "spotlight-card";
  const sourceDetail = getPoiSourceDetail(site);
  card.innerHTML = `
    <div>
      <p class="spotlight-kicker">Priority Deployment</p>
      <h2 class="spotlight-title">${site.displayName || site.name || "候选点"}</h2>
      <p class="spotlight-summary">${summary}</p>
      <div class="spotlight-badges">
        <span class="spotlight-badge">${site.displayCategory || normalizePoiCategory(site)}</span>
        <span class="spotlight-badge">${site.selection_reason || (site.covered_elderly_population > 0 ? "覆盖优先" : "均时优化")}</span>
        ${sourceDetail ? `<span class="spotlight-badge is-source">${sourceDetail}</span>` : ""}
        <span class="spotlight-badge">${scenario ? `新增 ${scenario.new_site_count} 点方案` : "推荐点位"}</span>
      </div>
    </div>
    <div class="spotlight-metrics">
      <div class="spotlight-metric">
        <span>新增覆盖</span>
        <strong>${formatNumber(site.covered_elderly_population)} 人</strong>
        <small>${formatNumber(site.covered_cells || 0)} 个网格直接补盲</small>
      </div>
      <div class="spotlight-metric">
        <span>避暑模式</span>
        <strong>${site.refuge_mode_label || "混合避暑"}</strong>
        <small>${site.district || derived.topDistrict.district || "--"} · 片区优先度 ${formatDecimal(
          site.district_priority_score,
          2
        )}</small>
      </div>
      <div class="spotlight-metric">
        <span>运行适配</span>
        <strong>${formatDecimal(site.operational_suitability, 2)}</strong>
        <small>开放代理 ${formatPercent(site.service_window_score, 0)} · 开放性代理 ${formatPercent(
          site.access_openness_score,
          0
        )}</small>
      </div>
      <div class="spotlight-metric">
        <span>容量代理</span>
        <strong>${formatNumber(site.capacity_units || 0)} 单位</strong>
        <small>${formatCoord(site.lat, site.lon)}</small>
      </div>
    </div>
  `;

  container.appendChild(card);
}

function renderModelInsights() {
  const derived = buildDerivedState();
  const items = [
    {
      name: "风险场景",
      meta: "当前风险推演依据",
      value: humanizeProfileType(derived.analysisProfileType),
    },
    {
      name: "分析窗口",
      meta: "天气场景时间范围",
      value: derived.analysisWindow,
    },
    {
      name: "人口数据",
      meta: "老年人口空间分布",
      value: humanizeDataLevel(derived.firstFeature.population_data_level || "worldpop_raster"),
    },
    {
      name: "路网数据",
      meta: "可达性计算底座",
      value: humanizeDataLevel(derived.dashboard.accessibility?.data_level),
    },
    {
      name: "资源总览",
      meta: "全部支撑资源 15 分钟覆盖",
      value: formatPercent(derived.allSupportScope?.coverage_15min_rate, 0),
    },
    {
      name: "优化基线",
      meta: "既有主动避暑资源 15 分钟覆盖",
      value: formatPercent(derived.activeCoolingScope?.coverage_15min_rate, 0),
    },
    {
      name: "官方在运点位",
      meta: "研究区内已校准官方纳凉点",
      value: `${formatNumber(derived.officialSites.length)} 个`,
    },
    {
      name: "选址策略",
      meta: "覆盖与时间双目标",
      value: humanizeStrategy(derived.optimization.strategy),
    },
    {
      name: "路网替代误差",
      meta: "真实步行路网 vs 距离代理",
      value: formatMinutes(derived.accessComparison.mean_abs_error_minutes),
    },
    {
      name: "完整模型增益",
      meta: "相对仅热暴露方案",
      value: `${formatNumber(derived.modelGain)} 人`,
    },
  ];
  renderMetricRows("model-insights", items, "暂无模型验证数据");
}

function renderOfficialSiteCards(containerId, items) {
  const container = byId(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!items.length) {
    renderEmptyBlock(containerId, "当前没有可展示的官方在运纳凉点。");
    return;
  }

  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "site-card official-site-card";

    const head = document.createElement("div");
    head.className = "site-card-head";

    const nameCell = document.createElement("div");
    nameCell.className = "name-cell";

    const rank = document.createElement("span");
    rank.className = "rank-pill";
    rank.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("div");
    copy.className = "site-copy";

    const name = document.createElement("strong");
    name.textContent = item.displayName || item.name;

    const meta = document.createElement("small");
    meta.textContent =
      `${item.site_type_label || item.displayCategory || normalizePoiCategory(item)} · ` +
      `${item.district || "--"} · ${formatCoord(item.lat, item.lon)}`;

    copy.append(name, meta);
    nameCell.append(rank, copy);

    const tag = document.createElement("span");
    tag.className = "action-tag";
    tag.textContent = item.verification_status_label || (item.source_verified ? "官方原文核验" : "待人工复核");

    head.append(nameCell, tag);

    const serviceRow = document.createElement("div");
    serviceRow.className = "service-badges";
    (item.service_labels || []).slice(0, 4).forEach((label) => {
      const badge = document.createElement("span");
      badge.className = "service-badge";
      badge.textContent = label;
      serviceRow.appendChild(badge);
    });

    const stats = document.createElement("div");
    stats.className = "site-stats";
    [
      {
        label: "开放说明",
        value: item.opening_hours || "--",
      },
      {
        label: "来源时间",
        value: item.source_published_at || "--",
      },
      {
        label: "定位精度",
        value: humanizeLocationAccuracy(item.location_accuracy),
      },
    ].forEach((metric) => {
      const stat = document.createElement("div");
      stat.className = "site-stat";

      const label = document.createElement("span");
      label.textContent = metric.label;

      const value = document.createElement("strong");
      value.textContent = metric.value;

      stat.append(label, value);
      stats.appendChild(stat);
    });

    card.append(head, serviceRow, stats);

    if (item.source_excerpt_preview || item.operational_source_url || item.location_source_url) {
      const sourceBlock = document.createElement("div");
      sourceBlock.className = "site-source";

      if (item.source_excerpt_preview) {
        const excerpt = document.createElement("p");
        excerpt.className = "site-source-excerpt";
        excerpt.textContent = `原文摘录：${truncateText(item.source_excerpt_preview)}`;
        sourceBlock.appendChild(excerpt);
      }

      const linkRow = document.createElement("div");
      linkRow.className = "site-link-row";
      const sourceLink = createExternalLink("官方原文", item.operational_source_url);
      const locationLink = createExternalLink("定位来源", item.location_source_url);
      if (sourceLink) {
        linkRow.appendChild(sourceLink);
      }
      if (locationLink) {
        linkRow.appendChild(locationLink);
      }
      if (linkRow.childNodes.length) {
        sourceBlock.appendChild(linkRow);
      }

      card.appendChild(sourceBlock);
    }

    container.appendChild(card);
  });
}

function renderWarningBoard() {
  const derived = buildDerivedState();
  const chip = byId("warning-chip");
  if (chip) {
    chip.textContent = `${derived.forecastWarning.label} / ${derived.analysisWarning.label}`;
  }

  renderFocusMetrics("warning-metrics", [
    {
      label: "实时预报等级",
      value: derived.forecastWarning.label,
      meta:
        `72h 最高温 ${formatDecimal(derived.forecast?.next_72h_max_temperature, 1)}℃ · ` +
        `72h 最高体感 ${formatDecimal(derived.forecast?.next_72h_max_apparent_temperature, 1)}℃`,
    },
    {
      label: "默认推演等级",
      value: derived.analysisWarning.label,
      meta:
        `${humanizeProfileType(derived.analysisProfileType)} · ` +
        `${formatDecimal(derived.analysisProfile?.max_apparent_temperature, 1)}℃ 峰值体感`,
    },
    {
      label: "官方在运点位",
      value: `${formatNumber(derived.officialSites.length)} 个`,
      meta: `${derived.officialCoolingLabel} 15 分钟覆盖 ${formatPercent(derived.officialCoolingScope?.coverage_15min_rate, 0)}`,
    },
    {
      label: "全市官方通报",
      value: derived.officialCooling.reported_citywide_cooling_point_count
        ? `${formatNumber(derived.officialCooling.reported_citywide_cooling_point_count)} 个`
        : "--",
      meta: "来自武汉官方公开通报的社区纳凉点数量",
    },
  ]);

  const actions = [
    {
      title: derived.forecastWarning.level >= 2 ? "核对今日开放状态与补给" : "保持常态开放清单",
      tag: derived.forecastWarning.label,
      detail:
        derived.forecastWarning.level >= 2
          ? `预报已进入关注及以上等级，需在当天复核官方纳凉点开放、饮水药品与社区巡访安排。`
          : `当前实时预报未达到热浪阈值，但应保持纳凉点、候选点与老人巡访名册的常态更新。`,
    },
    {
      title: "把官方在运点直接转成社区告知清单",
      tag: "官方点位",
      detail:
        derived.officialSites.length > 0
          ? `当前研究区已接入 ${derived.officialSites.length} 个可定位官方纳凉点，可直接用于街道广播、社区公告和答辩展示。`
          : "当前未读到可定位官方点位，需优先检查官方通报抓取结果。",
    },
    {
      title: derived.analysisProfileType === "historical_heatwave_case" ? "按历史热浪窗口做预部署演练" : "按实时预报进入响应准备",
      tag: derived.analysisProfileType === "historical_heatwave_case" ? "推演" : "实战",
      detail:
        derived.analysisProfileType === "historical_heatwave_case"
          ? `当前默认推演窗口为 ${derived.analysisWindow}，适合在非热浪当天演示“真热浪来时如何调度”。`
          : `当前实时预报窗口已作为默认风险场景，应将调度重点转入当期开放资源与候选点协同。`,
    },
  ];
  renderActionCards("warning-actions", actions);
}

function renderOfficialCoolingPanel() {
  const derived = buildDerivedState();
  const chip = byId("official-chip");
  const note = byId("official-cooling-note");

  if (chip) {
    chip.textContent =
      `监测 ${formatNumber(derived.officialBulletins.length)} 个官方页面 · ` +
      `核验 ${formatNumber(derived.officialVerifiedCount)} 个点位`;
  }
  if (note) {
    note.textContent =
      `${derived.officialCooling.coverage_statement || "当前未读取到官方纳凉通报说明。"} ` +
      `最近刷新 ${formatDateTime(derived.officialCooling.generated_at)}。`;
  }

  const bulletinItems = derived.officialBulletins.map((item) => ({
    name: item.title,
    meta: `${item.source_org || "--"} · ${item.published_at || "--"}`,
    value: item.metrics?.reported_cooling_point_count
      ? `${formatNumber(item.metrics.reported_cooling_point_count)} 个`
      : "已核验",
    href: item.url,
    linkLabel: "查看原文",
  }));
  renderMetricRows("official-bulletin-list", bulletinItems, "暂无官方通报数据");
  renderOfficialSiteCards("official-site-grid", derived.officialSites);
}

function renderEvidenceBoardLegacy() {
  const derived = buildDerivedState();
  const chip = byId("evidence-chip");
  const note = byId("evidence-note");
  const referenceChip = byId("reference-chip");
  const referenceNote = byId("reference-note");
  const worldpop = derived.dataSources.worldpop || {};
  const geofabrik = derived.dataSources.geofabrik || {};
  const authenticityOverall = derived.authenticityOverall || {};
  const authenticitySummary = derived.authenticitySummary || {};
  const authenticityModules = derived.authenticityModules || [];
  const populationDataLevel = derived.firstFeature.population_data_level || "demo_estimate";
  const worldpopAge65 = (worldpop.files || {}).age65 || {};
  const latestGeneratedAt =
    derived.dashboard.optimization?.generated_at ||
    derived.officialCooling?.generated_at ||
    derived.dashboard.weather?.generated_at;

  if (chip) {
    chip.textContent =
      `WorldPop ${getWorldPopVersionLabel(worldpop)} / ` +
      `Geofabrik ${humanizeSourceStatus(geofabrik.status)}`;
  }
  if (note) {
    note.textContent =
      "网站启动前会先执行整条数据流水线，再启动 FastAPI 和前端页面。这里同步展示上游检查时间、本地生成时间与官方原文入口。";
  }

  renderFocusMetrics("evidence-kpis", [
    {
      label: "WorldPop 版本",
      value: getWorldPopVersionLabel(worldpop),
      meta: getWorldPopUsageMeta(worldpop, populationDataLevel),
    },
    {
      label: "Geofabrik 路网",
      value: humanizeSourceStatus(geofabrik.status),
      meta: getGeofabrikFreshnessMeta(geofabrik, "远端文件时间"),
    },
    {
      label: "官方页面监测",
      value: `${formatNumber(derived.officialBulletins.length)} 页`,
      meta: `原文核验 ${formatNumber(derived.officialVerifiedCount)} 个点位`,
    },
    {
      label: "本轮生成时间",
      value: formatDateTime(latestGeneratedAt),
      meta: "启动脚本会先刷新数据，再打开网站",
    },
  ]);

  renderSourceCards("source-freshness-grid", [
    {
      title: "Open-Meteo 预报与历史热浪窗口",
      status: "自动更新",
      meta: `最近生成 ${formatDateTime(derived.dashboard.weather?.generated_at)}`,
      detail:
        `${humanizeProfileType(derived.analysisProfileType)} · ` +
        `${derived.analysisProfileType === "historical_heatwave_case" ? derived.analysisWindow : "未来72小时预报"}`,
      href: "https://open-meteo.com/",
      linkLabel: "查看数据源",
      tone: "warm",
    },
    {
      title: "WorldPop 老年人口栅格",
      status: humanizeSourceStatus(worldpop.status),
      meta: `最近检查 ${formatDateTime(worldpop.checked_at)}`,
      detail: getWorldPopSourceDetail(worldpop, populationDataLevel),
      href: (worldpopAge65.download || {}).url,
      linkLabel: "查看下载源",
      tone: "teal",
    },
    {
      title: "Geofabrik 湖北路网",
      status: humanizeSourceStatus(geofabrik.status),
      meta: getGeofabrikFreshnessMeta(geofabrik, "远端文件"),
      detail: "步行网络优先基于 Geofabrik 湖北 OSM 路网构建，不以直线距离替代正式结论。",
      href: geofabrik.source_url,
      linkLabel: "查看下载源",
      tone: "violet",
    },
    {
      title: "武汉官方纳凉通报",
      status: `监测 ${formatNumber(derived.officialBulletins.length)} 页`,
      meta: `研究区已校准 ${formatNumber(derived.officialSites.length)} 个点位`,
      detail:
        `全市官方通报 ${formatNumber(derived.officialCooling.reported_citywide_cooling_point_count)} 个社区纳凉点；` +
        `当前原文核验通过 ${formatNumber(derived.officialVerifiedCount)} 个可定位点位。`,
      href: derived.officialBulletins[0]?.url,
      linkLabel: "查看官方通报",
      tone: "danger",
    },
  ]);

  if (referenceChip) {
    referenceChip.textContent = "政策 / 数据 / 方法 / GitHub";
  }
  if (referenceNote) {
    referenceNote.textContent =
      "下列链接用于说明项目为什么可信、方法为何成立。网站实际展示仍以本地自动更新后的数据结果和本项目算法输出为准。";
  }

  renderActionCards("method-proof-list", [
    {
      title: "正式展示以真实步行路网为准",
      tag: "实验二",
      detail:
        `距离代理平均误差 ${formatDecimal(derived.accessComparison.mean_abs_error_minutes, 1)} 分钟，` +
        `RMSE ${formatDecimal(derived.accessComparison.rmse_minutes, 2)} 分钟，不能替代真实路网结论。`,
    },
    {
      title: "完整模型能识别更多高龄暴露人口",
      tag: "实验一",
      detail:
        `相对仅热暴露方案，完整模型额外识别 ${formatNumber(derived.modelGain)} 名高风险老年人口，` +
        `证明“热 + 老 + 难到达”的复合建模是必要的。`,
    },
    {
      title: "官方在运点位已纳入优化基线与候选去重",
      tag: "口径严谨",
      detail:
        `既有主动避暑资源基线已并入官方在运纳凉点，` +
        `${derived.dashboard.recommendations?.candidate_scope?.excluded_existing_official_sites
          ? `并自动剔除 ${formatNumber(derived.dashboard.recommendations.candidate_scope.excluded_existing_official_sites)} 个重叠候选场地。`
          : "避免把已开放点位重复推荐成“新增方案”。"}`,
    },
  ]);

  renderReferenceLinks(
    "reference-link-list",
    EXTERNAL_REFERENCE_LINKS.map((item) => ({
      name: item.title,
      meta: item.meta,
      value: item.value,
      href: item.href,
      linkLabel: "打开链接",
    }))
  );
}

function renderEvidenceBoard() {
  const derived = buildDerivedState();
  const chip = byId("evidence-chip");
  const note = byId("evidence-note");
  const referenceChip = byId("reference-chip");
  const referenceNote = byId("reference-note");
  const worldpop = derived.dataSources.worldpop || {};
  const geofabrik = derived.dataSources.geofabrik || {};
  const authenticityOverall = derived.authenticityOverall || {};
  const authenticitySummary = derived.authenticitySummary || {};
  const authenticityModules = derived.authenticityModules || [];
  const authenticityStatement =
    authenticityOverall.competition_safe_statement ||
    "当前版本应表述为“真实公开数据输入 + 模型推导输出”，不应宣称全部结果都是原始实测。";
  const shortVerdict =
    authenticityOverall.recommended_short_answer ||
    authenticityOverall.verdict_label ||
    "真实公开数据 + 模型推导";
  const populationDataLevel = derived.firstFeature.population_data_level || "demo_estimate";
  const worldpopAge65 = (worldpop.files || {}).age65 || {};
  const latestGeneratedAt =
    derived.dashboard.optimization?.generated_at ||
    derived.officialCooling?.generated_at ||
    derived.dashboard.weather?.generated_at;

  if (chip) {
    chip.textContent = `${shortVerdict} · ${formatNumber(authenticitySummary.module_count || 0)} 个模块`;
  }
  if (note) {
    note.textContent = authenticityStatement;
  }

  renderFocusMetrics("evidence-kpis", [
    {
      label: "真实性结论",
      value: shortVerdict,
      meta:
        `${formatNumber(authenticitySummary.upstream_real_count || 0)} / ${formatNumber(
          authenticitySummary.module_count || 0
        )} 个模块保留真实上游输入`,
    },
    {
      label: "回退模块",
      value: `${formatNumber(authenticitySummary.fallback_count || 0)} 个`,
      meta: "0 表示当前未触发演示级回退数据",
    },
    {
      label: "代理模块",
      value: `${formatNumber(authenticitySummary.proxy_count || 0)} 个`,
      meta: "局地热环境、容量、时段等变量含代理构造",
    },
    {
      label: "官方核验点位",
      value: `${formatNumber(derived.officialVerifiedCount)} 个`,
      meta:
        `实时源 ${formatNumber(authenticitySummary.official_live_source_count || 0)} · ` +
        `缓存源 ${formatNumber(authenticitySummary.official_cached_source_count || 0)}`,
    },
    {
      label: "WorldPop 版本",
      value: getWorldPopVersionLabel(worldpop),
      meta: getWorldPopUsageMeta(worldpop, populationDataLevel),
    },
    {
      label: "本轮生成时间",
      value: formatDateTime(latestGeneratedAt),
      meta: "启动脚本会先刷新数据，再更新 API 与前端面板",
    },
  ]);

  renderSourceCards("source-freshness-grid", [
    {
      title: "Open-Meteo 预报与历史热浪窗口",
      status: "自动更新",
      meta: `最近生成 ${formatDateTime(derived.dashboard.weather?.generated_at)}`,
      detail:
        derived.analysisProfileType === "historical_heatwave_case"
          ? `当前风险推演切换到真实历史热浪案例，窗口 ${derived.analysisWindow || "--"}。`
          : "当前风险推演直接使用未来 72 小时实时预报窗口。",
      href: "https://open-meteo.com/",
      linkLabel: "查看数据源",
      tone: "warm",
    },
    {
      title: "WorldPop 老年人口栅格",
      status: humanizeSourceStatus(worldpop.status),
      meta: `最近检查 ${formatDateTime(worldpop.checked_at)}`,
      detail: getWorldPopSourceDetail(worldpop, populationDataLevel),
      href: (worldpopAge65.download || {}).url,
      linkLabel: "查看下载源",
      tone: "teal",
    },
    {
      title: "Geofabrik 湖北步行路网",
      status: humanizeSourceStatus(geofabrik.status),
      meta: getGeofabrikFreshnessMeta(geofabrik, "远端文件"),
      detail: "可达性正式结果优先基于真实步行路网，不以直线距离代理替代主结果。",
      href: geofabrik.source_url,
      linkLabel: "查看下载源",
      tone: "violet",
    },
    {
      title: "武汉官方纳凉通报",
      status: `监测 ${formatNumber(derived.officialBulletins.length)} 页`,
      meta: `研究区已核验 ${formatNumber(derived.officialSites.length)} 个点位`,
      detail:
        `全市官方通报 ${formatNumber(derived.officialCooling.reported_citywide_cooling_point_count)} 个社区纳凉点；` +
        `当前接入坐标来自官方地址/场馆名与 OSM 空间锚定，不是政府原始经纬度。`,
      href: derived.officialBulletins[0]?.url,
      linkLabel: "查看官方通报",
      tone: "danger",
    },
  ]);

  let authenticityGrid = byId("authenticity-grid");
  if (!authenticityGrid) {
    const freshnessGrid = byId("source-freshness-grid");
    if (freshnessGrid?.parentElement) {
      const divider = document.createElement("div");
      divider.className = "evidence-divider";
      divider.textContent = "数据真实性审计";

      authenticityGrid = document.createElement("div");
      authenticityGrid.id = "authenticity-grid";
      authenticityGrid.className = "source-grid authenticity-grid";

      freshnessGrid.parentElement.append(divider, authenticityGrid);
    }
  }

  renderAuthenticityCards("authenticity-grid", authenticityModules);

  if (referenceChip) {
    referenceChip.textContent = "政策 / 数据 / 论文 / GitHub";
  }
  if (referenceNote) {
    referenceNote.textContent =
      "这些外部链接用于支撑方法合理性与数据来源可信度；站内展示仍以本地自动更新后的真实输入与模型输出为准。";
  }

  renderActionCards("method-proof-list", [
    {
      title: "正式展示以真实步行路网为准",
      tag: "实验二",
      detail:
        `距离代理平均误差 ${formatDecimal(derived.accessComparison.mean_abs_error_minutes, 1)} 分钟，` +
        `RMSE ${formatDecimal(derived.accessComparison.rmse_minutes, 2)} 分钟，不能替代真实路网结论。`,
    },
    {
      title: "完整模型能识别更多高龄暴露人口",
      tag: "实验一",
      detail:
        `相对仅热暴露方案，完整模型额外识别 ${formatNumber(derived.modelGain)} 名高风险老年人口，` +
        "说明“热 + 老 + 难到达”的复合建模是必要的。",
    },
    {
      title: "官方在运点位已并入基线并做去重",
      tag: "口径严谨",
      detail: derived.dashboard.recommendations?.candidate_scope?.excluded_existing_official_sites
        ? `优化前自动剔除 ${formatNumber(
            derived.dashboard.recommendations.candidate_scope.excluded_existing_official_sites
          )} 个与官方在运纳凉点重叠的候选场地，避免把已开放点位误写成“新增方案”。`
        : "当前候选集中未发现需要额外剔除的官方在运重复点位。",
    },
  ]);

  renderReferenceLinks(
    "reference-link-list",
    EXTERNAL_REFERENCE_LINKS.map((item) => ({
      name: item.title,
      meta: item.meta,
      value: item.value,
      href: item.href,
      linkLabel: "打开链接",
    }))
  );
}

function renderScenarioChart() {
  const derived = buildDerivedState();
  const optimization = derived.optimization;
  const scenarios = optimization.scenarios || [];
  const baseline = optimization.baseline_metrics || {};

  if (!scenarios.length) {
    renderChartFallback("scenario-chart", "暂无情景优化结果。");
    return;
  }

  const rows = [
    {
      label: "基线",
      scenarioCount: 0,
      coverage: (baseline.coverage_rate_population || 0) * 100,
      avgTime: baseline.average_travel_minutes || 0,
      isBaseline: true,
    },
    ...scenarios.map((item) => ({
      label: `新增${item.new_site_count}点`,
      scenarioCount: item.new_site_count,
      coverage: (item.metrics.coverage_rate_population || 0) * 100,
      avgTime: item.metrics.average_travel_minutes || 0,
      isBaseline: false,
    })),
  ];

  const chart = getChart("scenario-chart");
  if (!chart) return;

  chart.setOption({
    tooltip: {
      ...baseTooltip(),
      trigger: "axis",
      axisPointer: { type: "shadow" },
    },
    legend: { textStyle: { color: palette.text } },
    grid: { left: 48, right: 56, top: 42, bottom: 38 },
    xAxis: {
      type: "category",
      data: rows.map((item) => item.label),
      axisLabel: baseAxisLabel(),
      axisLine: { lineStyle: { color: palette.line } },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: "value",
        name: "覆盖率(%)",
        nameTextStyle: { color: palette.muted },
        axisLabel: baseAxisLabel(),
        splitLine: baseSplitLine(),
      },
      {
        type: "value",
        name: "平均分钟",
        nameTextStyle: { color: palette.muted },
        axisLabel: baseAxisLabel(),
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "人口覆盖率",
        type: "bar",
        barWidth: 30,
        data: rows.map((item) => ({
          value: Number(item.coverage.toFixed(2)),
          itemStyle: {
            color: item.isBaseline
              ? gradient("rgba(143, 166, 191, 0.75)", "rgba(143, 166, 191, 0.24)")
              : item.scenarioCount === derived.selectedScenarioCount
                ? gradient("rgba(159, 149, 255, 0.95)", "rgba(159, 149, 255, 0.42)")
                : gradient("rgba(123, 183, 255, 1)", "rgba(79, 159, 255, 0.55)"),
            borderRadius: [10, 10, 0, 0],
          },
        })),
      },
      {
        name: "平均到达时间",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        data: rows.map((item) => ({
          value: Number((item.avgTime || 0).toFixed(2)),
          itemStyle: {
            color: item.scenarioCount === derived.selectedScenarioCount ? palette.danger : palette.amber,
            borderColor: "#081018",
            borderWidth: 2,
          },
          symbolSize: item.scenarioCount === derived.selectedScenarioCount ? 12 : 8,
        })),
        lineStyle: { color: palette.amber, width: 3 },
        areaStyle: {
          color: gradient("rgba(242, 185, 103, 0.18)", "rgba(242, 185, 103, 0.02)"),
        },
      },
    ],
  });
  window.HeatGuardianExtras?.activeChart?.("scenario-chart", chart);
}

function renderRecommendationNote() {
  const derived = buildDerivedState();
  const element = byId("recommendation-note");
  const recommendationChip = byId("recommendation-scenario-chip");
  if (!element) return;

  const scenario = derived.selectedScenario;
  if (!scenario) {
    element.textContent = "暂无可展示的推荐方案。";
    if (recommendationChip) {
      recommendationChip.textContent = "暂无方案";
    }
    return;
  }

  const timeSaved = (derived.baseline.average_travel_minutes || 0) - (scenario.metrics.average_travel_minutes || 0);
  const improvedCells = sumBy(derived.selectedSites, (item) => item.improved_cells || 0);
  const totalCovered = scenario.metrics.coverage_improvement_population || 0;

  if (recommendationChip) {
    recommendationChip.textContent = `新增 ${scenario.new_site_count} 点方案`;
  }

  element.textContent =
    `当前展示新增 ${scenario.new_site_count} 点方案：共选择 ${scenario.selected_site_count} 个候选点，` +
    `新增覆盖 ${formatNumber(totalCovered)} 名高风险老年人口，改善 ${formatNumber(improvedCells)} 个网格，` +
    `平均到达时间较${derived.activeCoolingLabel}基线缩短 ${formatSignedMinutes(timeSaved).replace("+", "")}。` +
    `排序时已同时考虑容量代理、开放时段、室内/绿地避暑适配度与高风险片区优先度。` +
    `${derived.dashboard.recommendations?.candidate_scope?.excluded_existing_official_sites
      ? `系统已排除 ${formatNumber(derived.dashboard.recommendations.candidate_scope.excluded_existing_official_sites)} 个与官方在运纳凉点重叠的候选场地。`
      : ""}`;
}

function renderTrendChart(containerId, trend, options = {}) {
  const {
    emptyText = "暂无天气趋势数据。",
    axisFormatter = (item) => (item?.time ? item.time.slice(5, 16).replace("T", " ") : "--"),
    tempName = "温度",
    apparentName = "体感温度",
    tempColor = palette.accent,
    tempAreaTop = "rgba(123, 183, 255, 0.24)",
    tempAreaBottom = "rgba(123, 183, 255, 0.02)",
    apparentColor = palette.danger,
    apparentAreaTop = "rgba(255, 126, 100, 0.18)",
    apparentAreaBottom = "rgba(255, 126, 100, 0.02)",
  } = options;

  if (!trend.length) {
    renderChartFallback(containerId, emptyText);
    return;
  }

  const chart = getChart(containerId);
  if (!chart) return;

  chart.setOption({
    tooltip: { ...baseTooltip(), trigger: "axis" },
    legend: { textStyle: { color: palette.text } },
    grid: { left: 42, right: 20, top: 40, bottom: 34 },
    xAxis: {
      type: "category",
      data: trend.map((item, index) => axisFormatter(item, index)),
      axisLabel: { ...baseAxisLabel(), showMaxLabel: true, showMinLabel: true },
      axisLine: { lineStyle: { color: palette.line } },
    },
    yAxis: {
      type: "value",
      axisLabel: baseAxisLabel(),
      splitLine: baseSplitLine(),
    },
    series: [
      {
        name: tempName,
        type: "line",
        smooth: true,
        symbol: "none",
        data: trend.map((item) => item.temperature),
        lineStyle: { color: tempColor, width: 3 },
        areaStyle: {
          color: gradient(tempAreaTop, tempAreaBottom),
        },
      },
      {
        name: apparentName,
        type: "line",
        smooth: true,
        symbol: "none",
        data: trend.map((item) => item.apparent_temperature),
        lineStyle: { color: apparentColor, width: 2.5 },
        areaStyle: {
          color: gradient(apparentAreaTop, apparentAreaBottom),
        },
      },
    ],
  });
  window.HeatGuardianExtras?.activeChart?.(containerId, chart);
}

function renderTrendComparison() {
  const derived = buildDerivedState();

  renderTrendChart("live-trend-chart", derived.forecastTrend || [], {
    emptyText: "暂无实时预报趋势。",
    tempName: "实时气温",
    apparentName: "实时体感",
    tempColor: palette.accent,
    tempAreaTop: "rgba(123, 183, 255, 0.24)",
    tempAreaBottom: "rgba(123, 183, 255, 0.02)",
    apparentColor: palette.teal,
    apparentAreaTop: "rgba(57, 208, 186, 0.18)",
    apparentAreaBottom: "rgba(57, 208, 186, 0.02)",
  });

  renderTrendChart("history-trend-chart", derived.historicalTrend || [], {
    emptyText: "暂无历史热浪趋势。",
    tempName: "历史气温",
    apparentName: "历史体感",
    tempColor: palette.amber,
    tempAreaTop: "rgba(242, 185, 103, 0.22)",
    tempAreaBottom: "rgba(242, 185, 103, 0.02)",
    apparentColor: palette.danger,
    apparentAreaTop: "rgba(255, 126, 100, 0.18)",
    apparentAreaBottom: "rgba(255, 126, 100, 0.02)",
  });
}

function renderHeatmap(features) {
  if (!features.length) {
    renderChartFallback("heatmap-chart", "风险栅格暂未返回，热力矩阵不可用。");
    return;
  }

  const maxRow = Math.max(...features.map((item) => item.row), 0);
  const maxCol = Math.max(...features.map((item) => item.col), 0);
  const chart = getChart("heatmap-chart");
  if (!chart) return;

  chart.setOption({
    tooltip: {
      ...baseTooltip(),
      formatter: (params) => {
        const feature = features.find(
          (item) => item.col === params.value[0] && item.row === params.value[1]
        );
        if (!feature) return "";
        return (
          `<div><strong>${feature.district}</strong><br />` +
          `风险分数：${formatDecimal(feature.risk_score, 2)}<br />` +
          `预计老年人口：${formatNumber(feature.estimated_elderly_population)}<br />` +
          `最近步行时间：${formatMinutes(feature.nearest_walk_minutes)}</div>`
        );
      },
    },
    grid: { left: 48, right: 26, top: 18, bottom: 46 },
    xAxis: {
      type: "category",
      data: Array.from({ length: maxCol + 1 }, (_, index) => `列${index + 1}`),
      axisLabel: baseAxisLabel(),
      axisLine: { lineStyle: { color: palette.line } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: Array.from({ length: maxRow + 1 }, (_, index) => `行${index + 1}`),
      axisLabel: baseAxisLabel(),
      axisLine: { lineStyle: { color: palette.line } },
      axisTick: { show: false },
    },
    visualMap: {
      min: 0,
      max: 100,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      text: ["高风险", "低风险"],
      textStyle: { color: palette.text },
      itemWidth: 18,
      itemHeight: 120,
      inRange: {
        color: ["#18324a", "#275c8f", "#4f9fff", "#f2b967", "#ff7e64"],
      },
    },
    series: [
      {
        type: "heatmap",
        data: features.map((item) => [item.col, item.row, item.risk_score]),
        itemStyle: {
          borderColor: "rgba(255,255,255,0.04)",
          borderWidth: 1,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 20,
            shadowColor: "rgba(123, 183, 255, 0.35)",
          },
        },
        progressive: 0,
      },
    ],
  });
  window.HeatGuardianExtras?.activeChart?.("heatmap-chart", chart);
}

function renderDistrictChart(districts) {
  if (!districts.length) {
    renderChartFallback("district-chart", "暂无城区风险数据。");
    return;
  }

  const chart = getChart("district-chart");
  if (!chart) return;

  chart.setOption({
    tooltip: { ...baseTooltip(), trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      top: 0,
      textStyle: { color: palette.text },
    },
    grid: { left: 42, right: 36, top: 52, bottom: 42 },
    xAxis: {
      type: "category",
      data: districts.map((item) => item.district),
      axisLabel: baseAxisLabel(),
      axisLine: { lineStyle: { color: palette.line } },
    },
    yAxis: [
      {
        type: "value",
        name: "平均风险",
        nameTextStyle: { color: palette.muted },
        axisLabel: baseAxisLabel(),
        splitLine: baseSplitLine(),
      },
      {
        type: "value",
        name: "高风险网格",
        nameTextStyle: { color: palette.muted },
        axisLabel: baseAxisLabel(),
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "平均风险",
        type: "bar",
        barWidth: 32,
        data: districts.map((item, index) => ({
          value: item.average_risk,
          itemStyle: {
            color:
              index === 0
                ? gradient("rgba(255, 126, 100, 0.95)", "rgba(255, 126, 100, 0.42)")
                : gradient("rgba(57, 208, 186, 0.95)", "rgba(57, 208, 186, 0.40)"),
            borderRadius: [12, 12, 0, 0],
          },
        })),
      },
      {
        name: "高风险网格",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        data: districts.map((item) => item.high_risk_cells || 0),
        lineStyle: { color: palette.violet, width: 2.5 },
        itemStyle: { color: palette.violet, borderColor: "#081018", borderWidth: 2 },
      },
    ],
  });
  window.HeatGuardianExtras?.activeChart?.("district-chart", chart);
}

function renderHeroSummary() {
  const derived = buildDerivedState();
  const districts = derived.dashboard.risk_summary?.districts || [];
  const topDistrict = districts[0] || {};
  const defaultScenario = derived.defaultScenario;

  setText("top-district-name", topDistrict.district);
  setText("top-district-card", topDistrict.district);
  animateCounter("top-district-risk", topDistrict.average_risk, (current) => `${formatDecimal(current, 2)} 风险分`);
  animateCounter(
    "scenario-5-time",
    defaultScenario?.metrics?.average_travel_minutes,
    (current) => `${formatDecimal(current, 2)} 分钟`
  );
  setText(
    "reachable-high-risk",
    `${derived.optimization.coverage_reachable_high_risk_cell_count || 0} / ${derived.optimization.high_risk_cell_count || 0}`
  );
  setText(
    "population-source",
    humanizeDataLevel(derived.firstFeature.population_data_level || "worldpop_raster")
  );
  setText("network-source", humanizeDataLevel(derived.dashboard.accessibility?.data_level));
  animateCounter(
    "network-mae-hero",
    derived.accessComparison.mean_abs_error_minutes,
    (current) => `${formatDecimal(current, 1)} 分钟`
  );
  animateCounter(
    "network-mae",
    derived.accessComparison.mean_abs_error_minutes,
    (current) => `${formatDecimal(current, 1)} 分钟`
  );
  animateCounter(
    "network-mae-card",
    derived.accessComparison.mean_abs_error_minutes,
    (current) => `${formatDecimal(current, 1)} 分钟`
  );
  animateCounter("model-pop-gain", derived.modelGain, (current) => formatNumber(Math.round(current)));
  animateCounter("model-gain-card", derived.modelGain, (current) => formatNumber(Math.round(current)));
  animateCounter(
    "official-site-count-hero",
    derived.officialSites.length,
    (current) => `${formatNumber(Math.round(current))} 个`
  );
  setText("forecast-warning-hero", derived.forecastWarning.label);
  setText("hero-strategy", humanizeStrategy(derived.optimization.strategy));
  animateCounter("experiment-count", getExperimentsCount(derived.experiments), (current) => `${formatNumber(Math.round(current))} 组`);

  const historicalCaseLabel = derived.historicalCase?.case_label || "历史热浪案例";
  const historicalSeasonYear = derived.historicalCase?.season_year || "--";
  const historicalWindowLabel =
    derived.historicalWindow && derived.historicalWindow !== "--"
      ? derived.historicalWindow
      : derived.analysisWindow;
  const livePeakTemperature = formatDecimal(derived.forecast?.next_72h_max_temperature, 1);
  const livePeakApparent = formatDecimal(derived.forecast?.next_72h_max_apparent_temperature, 1);
  const weatherModeLabel =
    derived.analysisProfileType === "historical_heatwave_case"
      ? "实时天气 + 历史热浪推演"
      : "实时天气直连";

  const statusParts = [
    weatherModeLabel,
    humanizeDataLevel(derived.firstFeature.population_data_level || "worldpop_raster"),
    humanizeDataLevel(derived.dashboard.accessibility?.data_level),
    derived.activeCoolingLabel,
    derived.officialSites.length ? "官方纳凉点" : "",
  ].filter(Boolean);
  setText("data-status", statusParts.join(" · "));

  setText(
    "live-track-chip",
    derived.liveDateLabel === "--" ? "实时监测" : `真实日期 ${derived.liveDateLabel}`
  );
  setText(
    "live-track-title",
    derived.forecastWarning.level >= 2 ? "当前真实监测已进入高温关注" : "当前真实监测未触发热浪阈值"
  );
  setText(
    "live-track-detail",
    `今天是 ${derived.liveDateLabel}。未来72小时最高温 ${livePeakTemperature}℃、最高体感 ${livePeakApparent}℃；${derived.forecastWarning.summary}`
  );
  setText("live-metric-current", formatDecimal(derived.forecast?.current_temperature, 1), "℃");
  setText("live-metric-max24", formatDecimal(derived.forecast?.next_24h_max_temperature, 1), "℃");
  setText("live-metric-app72", livePeakApparent, "℃");
  setText(
    "history-track-chip",
    derived.analysisProfileType === "historical_heatwave_case" ? "默认风险推演" : "历史对照案例"
  );
  setText("history-track-title", historicalCaseLabel);
  setText(
    "history-track-detail",
    derived.analysisProfileType === "historical_heatwave_case"
      ? `默认风险推演采用 ${historicalSeasonYear} 年真实历史热浪案例，窗口 ${historicalWindowLabel}，用于在非热浪当天展示“真热浪来时如何调度”。`
      : `当前默认风险直接使用实时预报；仍保留 ${historicalSeasonYear} 年历史热浪案例（${historicalWindowLabel}）作为对照演示。`
  );
  setText("history-metric-maxtemp", formatDecimal(derived.historicalCase?.max_temperature, 1), "℃");
  setText("history-metric-maxapp", formatDecimal(derived.historicalCase?.max_apparent_temperature, 1), "℃");
  setText(
    "history-metric-nightapp",
    formatDecimal(derived.historicalCase?.night_min_apparent_temperature, 1),
    "℃"
  );
  setText(
    "scenario-compare-note",
    derived.analysisProfileType === "historical_heatwave_case"
      ? `左侧是真实当前天气：${derived.liveDateLabel}，未来72小时最高仅 ${livePeakTemperature}℃ / 体感 ${livePeakApparent}℃。右侧才是默认风险推演：${historicalSeasonYear} 年历史热浪案例，窗口 ${historicalWindowLabel}。八月时间来自推演场景，不是当前系统时间。`
      : `当前默认风险场景就是实时预报；历史热浪案例仅保留为对照参考，不会替代今天的真实日期。`
  );
  setText("resource-context-title", `${derived.allSupportLabel} vs ${derived.activeCoolingLabel}`);
  setText(
    "resource-context-detail",
    `${derived.allSupportLabel} 15 分钟覆盖 ${formatPercent(derived.allSupportScope?.coverage_15min_rate, 0)}；` +
      `${derived.activeCoolingLabel} 15 分钟覆盖 ${formatPercent(derived.activeCoolingScope?.coverage_15min_rate, 0)}；` +
      `${derived.officialCoolingLabel} 已校准 ${formatNumber(derived.officialSites.length)} 个点位。`
  );
  setText(
    "dual-trend-kicker",
    derived.analysisProfileType === "historical_heatwave_case" ? "实时预报 / 历史案例" : "预报 / 参考案例"
  );
  setText(
    "dual-trend-title",
    derived.analysisProfileType === "historical_heatwave_case" ? "实时预报 / 默认推演热浪对照" : "实时预报 / 历史热浪对照"
  );
  setText(
    "dual-trend-chip",
    derived.analysisProfileType === "historical_heatwave_case" ? "预报 + 历史归档" : "预报优先"
  );
  setText(
    "dual-trend-note",
    derived.analysisProfileType === "historical_heatwave_case"
      ? `左图展示 ${derived.liveDateLabel} 起 72 小时真实预报，右图展示 ${historicalSeasonYear} 年 ${historicalWindowLabel} 的历史热浪案例；两条时间线分开展示，避免把历史八月窗口误读成今天实况。`
      : `左图是当前真实预报，右图保留历史热浪案例用于答辩对照。`
  );
  setText("live-trend-title", "实时预报 72 小时");
  setText(
    "live-trend-detail",
    `${derived.forecastWindow} · 当前温度 ${formatDecimal(derived.forecast?.current_temperature, 1)}℃`
  );
  setText("live-trend-chip", "Open-Meteo 预报");
  setText("history-trend-title", historicalCaseLabel);
  setText(
    "history-trend-detail",
    `${historicalSeasonYear} 年窗口 ${historicalWindowLabel} · 历史热浪案例，不是当前实况`
  );
  setText("history-trend-chip", "Open-Meteo 历史归档");

  const insightElement = byId("hero-insight");
  if (!insightElement) return;
  const scenarioNarrative =
    derived.analysisProfileType === "historical_heatwave_case"
      ? `未达到热浪阈值，因此默认风险调度切换到 ${historicalCaseLabel}${
          historicalWindowLabel !== "--" ? `（${historicalWindowLabel}）` : ""
        }。`
      : "当前默认风险场景直接使用实时预报。";
  const officialNarrative = derived.officialSites.length
    ? `研究区内已接入 ${derived.officialSites.length} 个官方在运纳凉点；`
    : "";

  insightElement.textContent =
    `当前真实日期 ${derived.liveDateLabel}，未来72小时最高温 ${livePeakTemperature}℃ / 最高体感 ${livePeakApparent}℃，` +
    scenarioNarrative +
    `${topDistrict.district || "当前重点城区"} 当前风险最高；` +
    `${derived.optimization.high_risk_cell_count || 0} 个高风险网格中，仅 ` +
    `${derived.optimization.coverage_reachable_high_risk_cell_count || 0} 个可在 15 分钟阈值内通过候选点新增覆盖。` +
    officialNarrative +
    `默认 ${derived.defaultScenarioCount || "--"} 点方案相对 ${derived.activeCoolingLabel} 基线可新增覆盖 ` +
    `${formatNumber(defaultScenario?.metrics?.coverage_improvement_population || 0)} 人，` +
    `并把平均到达时间压缩到 ${formatDecimal(defaultScenario?.metrics?.average_travel_minutes, 2) || "--"} 分钟。`;
}

function getRoleContent() {
  const derived = buildDerivedState();
  const scenario = derived.selectedScenario;
  const topSite = derived.selectedSites[0] || null;
  const topCell = derived.topCells[0] || null;
  const timeSaved = (derived.baseline.average_travel_minutes || 0) - (scenario?.metrics?.average_travel_minutes || 0);
  const roleMap = {
    street: {
      chip: "街道视角",
      title: "街道应急调度",
      priority: `${derived.topDistrict.district || "重点城区"}优先`,
      summary:
        `${derived.topDistrict.district || "当前重点城区"}平均风险最高，仍有 ${derived.uncoveredHighRisk} 个高风险网格` +
        `无法在 15 分钟阈值内通过候选点补齐，应按新增 ${derived.selectedScenarioCount || "--"} 点方案优先落地。`,
      metrics: [
        {
          label: "优先城区",
          value: derived.topDistrict.district || "--",
          meta: `平均风险 ${formatDecimal(derived.topDistrict.average_risk, 2)}`,
        },
        {
          label: "待补盲网格",
          value: `${formatNumber(derived.uncoveredHighRisk)} 个`,
          meta: `共 ${formatNumber(derived.optimization.high_risk_cell_count || 0)} 个高风险网格`,
        },
        {
          label: "当前情景均时",
          value: formatMinutes(scenario?.metrics?.average_travel_minutes),
          meta: `较基线缩短 ${formatSignedMinutes(timeSaved).replace("+", "")}`,
        },
        {
          label: "首位点位增益",
          value: `${formatNumber(topSite?.covered_elderly_population || 0)} 人`,
          meta: topSite ? `${topSite.displayName}` : "暂无首位点位",
        },
      ],
      actions: [
        {
          title: "先锁定最高收益点位",
          tag: "立即部署",
          detail: topSite
            ? `${topSite.displayName} 可新增覆盖 ${formatNumber(topSite.covered_elderly_population)} 人，适合优先纳入临时纳凉点。`
            : "当前没有可用候选点位，需先检查优化结果输出。",
        },
        {
          title: "对未补齐网格建立兜底清单",
          tag: "补盲清单",
          detail: `${formatNumber(derived.uncoveredHighRisk)} 个高风险网格仍需安排巡访、转运或临时服务车补位。`,
        },
        {
          title: "按街道节奏做短周期复盘",
          tag: "24 小时",
          detail: `建议以 ${formatDateTime(derived.dashboard.optimization?.generated_at)} 为基准，每日复核到达时间与点位启用状态。`,
        },
      ],
    },
    community: {
      chip: "社区视角",
      title: "社区落地执行",
      priority: topCell ? `${topCell.district}网格盯防` : "高龄网格盯防",
      summary:
        `社区侧应围绕高龄人口密集且步行可达性不足的网格开展上门通知、纳凉点告知和重点人群关照。` +
        `${topCell ? `当前最高风险网格位于 ${topCell.district}，风险分 ${formatDecimal(topCell.risk_score, 2)}。` : ""}`,
      metrics: [
        {
          label: "高龄暴露网格",
          value: `${formatNumber(derived.topCells.length)} 个`,
          meta: "建议作为巡查优先名单",
        },
        {
          label: "可直接启用点位",
          value: `${formatNumber(scenario?.selected_site_count || 0)} 个`,
          meta: "与社区广播、公告同步发布",
        },
        {
          label: "新增覆盖老人",
          value: `${formatNumber(scenario?.metrics?.coverage_improvement_population || 0)} 人`,
          meta: `当前方案新增 ${derived.selectedScenarioCount || "--"} 点`,
        },
        {
          label: "现有避险资源",
          value: `${formatNumber(derived.dashboard.accessibility?.resource_count || 0)} 个`,
          meta: "可联动社区中心、图书馆、公园",
        },
      ],
      actions: [
        {
          title: "发布点位到社区触达渠道",
          tag: "居民通知",
          detail: derived.selectedSites.length
            ? `优先公布 ${derived.selectedSites.slice(0, 3).map((item) => item.displayName).join("、")} 等点位。`
            : "候选点位暂未生成，先检查情景优化结果。",
        },
        {
          title: "对 80+ 高龄聚集网格单列照护",
          tag: "重点人群",
          detail: topCell
            ? `${topCell.district}最高风险网格预计老年人口 ${formatNumber(topCell.estimated_elderly_population)}，需优先摸排独居和失能老人。`
            : "风险栅格未返回，无法生成重点人群网格名单。",
        },
        {
          title: "把通知与引导做成可执行动作",
          tag: "执行闭环",
          detail: "社区公告、志愿者巡访、居委热线和临时点位指引需要同步上线，避免“有点位、没人知道”。",
        },
      ],
    },
    health: {
      chip: "卫健视角",
      title: "卫健统筹指挥",
      priority: "实验结论可答辩",
      summary:
        `卫健部门需要把完整模型、真实路网和选址优化的实验差异讲清楚，` +
        `把“为什么这个方案可信”直接转化成调度依据。`,
      metrics: [
        {
          label: "完整模型增益",
          value: `${formatNumber(derived.modelGain)} 人`,
          meta: "相对仅热暴露方案额外识别",
        },
        {
          label: "路网替代误差",
          value: formatMinutes(derived.accessComparison.mean_abs_error_minutes),
          meta: `RMSE ${formatDecimal(derived.accessComparison.rmse_minutes, 2)} 分钟`,
        },
        {
          label: "乐观误判网格",
          value: `${formatNumber(derived.accessComparison.optimistic_misclassified_cells || 0)} 个`,
          meta: "距离代理会系统性高估可达性",
        },
        {
          label: "当前方案时间收益",
          value: formatSignedMinutes(timeSaved).replace("+", ""),
          meta: `新增 ${derived.selectedScenarioCount || "--"} 点后的均时改善`,
        },
      ],
      actions: [
        {
          title: "正式展示采用真实路网结果",
          tag: "答辩重点",
          detail: `距离代理平均误差 ${formatDecimal(derived.accessComparison.mean_abs_error_minutes, 1)} 分钟，不能作为正式结论替代真实路网。`,
        },
        {
          title: "把消融实验直接做成论证链",
          tag: "模型可信",
          detail: derived.ablation.modules?.length
            ? `${derived.ablation.modules[0].interpretation} ${derived.ablation.modules[1].interpretation}`
            : "当前没有读取到消融实验结果。",
        },
        {
          title: "用方案切换说明资源边际收益",
          tag: "统筹调度",
          detail: `新增 ${derived.selectedScenarioCount || "--"} 点方案比基线可缩短 ${formatSignedMinutes(timeSaved).replace("+", "")}，适合用于预算与分阶段部署说明。`,
        },
      ],
    },
  };

  return roleMap[appState.selectedRole] || roleMap.street;
}

function renderRoleSwitcher() {
  const container = byId("role-switcher");
  if (!container) return;
  container.innerHTML = "";

  [
    { key: "street", label: "街道调度" },
    { key: "community", label: "社区执行" },
    { key: "health", label: "卫健统筹" },
  ].forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tool-button${appState.selectedRole === item.key ? " is-active" : ""}`;
    button.textContent = item.label;
    button.setAttribute("aria-pressed", appState.selectedRole === item.key ? "true" : "false");
    button.addEventListener("click", () => {
      const flipState = window.HeatGuardianMotion?.captureState?.(
        ".briefing-card, #role-metrics > *, #role-actions > *"
      );
      appState.selectedRole = item.key;
      renderRoleSwitcher();
      renderRoleBriefing();
      window.HeatGuardianMotion?.flipFrom?.(
        flipState,
        ".briefing-card, #role-metrics > *, #role-actions > *"
      );
    });
    container.appendChild(button);
  });
}

function renderRoleBriefing() {
  const content = getRoleContent();
  const chip = byId("role-chip");
  const title = byId("role-title");
  const summary = byId("role-summary");
  const priority = byId("role-priority");

  if (chip) chip.textContent = content.chip;
  if (title) title.textContent = content.title;
  if (summary) summary.textContent = content.summary;
  if (priority) priority.textContent = content.priority;

  renderBriefingMetrics("role-metrics", content.metrics);
  renderActionCards("role-actions", content.actions);
}

function renderScenarioSwitcher() {
  const derived = buildDerivedState();
  const container = byId("scenario-switcher");
  if (!container) return;
  container.innerHTML = "";

  (derived.optimization.scenarios || []).forEach((scenario) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      `tool-button${scenario.new_site_count === derived.selectedScenarioCount ? " is-active" : ""}`;
    button.textContent = `新增 ${scenario.new_site_count} 点`;
    button.title =
      `覆盖率 ${formatPercent(scenario.metrics.coverage_rate_population, 1)}，` +
      `平均到达 ${formatMinutes(scenario.metrics.average_travel_minutes)}`;
    button.setAttribute(
      "aria-pressed",
      scenario.new_site_count === derived.selectedScenarioCount ? "true" : "false"
    );
    button.addEventListener("click", () => {
      const flipState = window.HeatGuardianMotion?.captureState?.(
        ".scenario-focus, #scenario-focus-metrics > *, #scenario-site-list > *, #site-spotlight > *"
      );
      appState.selectedScenarioCount = scenario.new_site_count;
      renderScenarioSwitcher();
      renderScenarioFocus();
      renderSpatialBoard();
      renderRecommendations();
      renderRecommendationNote();
      renderScenarioChart();
      renderRoleBriefing();
      window.HeatGuardianMotion?.flipFrom?.(
        flipState,
        ".scenario-focus, #scenario-focus-metrics > *, #scenario-site-list > *, #site-spotlight > *"
      );
      window.setTimeout(() => pulseDecisionSignals(), 80);
    });
    container.appendChild(button);
  });
}

function renderScenarioFocus() {
  const derived = buildDerivedState();
  const chip = byId("scenario-chip");
  const note = byId("scenario-focus-note");
  const scenario = derived.selectedScenario;

  if (!scenario) {
    renderFocusMetrics("scenario-focus-metrics", []);
    renderEmptyBlock("scenario-site-list", "暂无可展示的候选点。");
    if (note) note.textContent = "当前没有情景优化结果。";
    if (chip) chip.textContent = "暂无方案";
    return;
  }

  const timeSaved = (derived.baseline.average_travel_minutes || 0) - (scenario.metrics.average_travel_minutes || 0);
  const totalWeightedTimeSaving = sumBy(derived.selectedSites, (item) => item.weighted_time_saving || 0);
  const improvedCells = sumBy(derived.selectedSites, (item) => item.improved_cells || 0);

  if (chip) {
    chip.textContent = `新增 ${scenario.new_site_count} 点`;
  }

  renderFocusMetrics("scenario-focus-metrics", [
    {
      label: "覆盖率",
      value: formatPercent(scenario.metrics.coverage_rate_population, 1),
      meta: "高风险老年人口覆盖率",
    },
    {
      label: "新增覆盖",
      value: `${formatNumber(scenario.metrics.coverage_improvement_population || 0)} 人`,
      meta: "相对基线新增覆盖量",
    },
    {
      label: "平均到达",
      value: formatMinutes(scenario.metrics.average_travel_minutes),
      meta: `较基线缩短 ${formatSignedMinutes(timeSaved).replace("+", "")}`,
    },
    {
      label: "时间收益",
      value: formatNumber(Math.round(totalWeightedTimeSaving)),
      meta: `累计改善 ${formatNumber(improvedCells)} 个网格`,
    },
  ]);

  if (note) {
    note.textContent =
      `当前选中新增 ${scenario.new_site_count} 点方案：` +
      `${scenario.selected_site_count} 个候选点中，前两类收益分别来自直接补盲和继续压缩平均到达时间。` +
      `在覆盖收益之外，模型还会对容量代理、开放时段与避暑适配度进行再排序。` +
      `若只增加到 ${derived.defaultScenarioCount || "--"} 点，系统会优先锁定覆盖收益最高的点位。` +
      `${derived.dashboard.recommendations?.candidate_scope?.excluded_existing_official_sites
        ? `模型已自动剔除 ${formatNumber(derived.dashboard.recommendations.candidate_scope.excluded_existing_official_sites)} 个与官方在运点重叠的候选场地。`
        : ""}`;
  }

  renderSiteCards("scenario-site-list", derived.selectedSites);
}

function renderSummaryCards() {
  const derived = buildDerivedState();
  const dashboard = derived.dashboard;
  const defaultScenario = derived.defaultScenario;

  if (byId("study-area-name")) {
    byId("study-area-name").textContent = dashboard.study_area?.display_name || "研究区";
  }

  animateCounter("current-temp", derived.forecast?.current_temperature, (current) => `${formatDecimal(current, 1)}℃`);
  animateCounter(
    "max-temp-24",
    derived.forecast?.next_24h_max_temperature,
    (current) => `${formatDecimal(current, 1)}℃`
  );
  animateCounter(
    "high-risk-cells",
    dashboard.risk_summary?.high_risk_cells,
    (current) => `${formatNumber(Math.round(current))}个`
  );
  animateCounter(
    "coverage-15",
    Math.round((derived.allSupportScope?.coverage_15min_rate || 0) * 100),
    (current) => `${Math.round(current)}%`
  );
  animateCounter(
    "resource-count",
    derived.allSupportScope?.resource_count,
    (current) => `${formatNumber(Math.round(current))}个`
  );
  animateCounter(
    "official-site-count",
    derived.officialSites.length,
    (current) => `${formatNumber(Math.round(current))}个`
  );
  setText(
    "footer-updated",
    formatDateTime(
      dashboard.optimization?.generated_at || dashboard.official_cooling?.generated_at || dashboard.weather?.generated_at
    )
  );

  if (defaultScenario) {
    animateCounter(
      "scenario-5-coverage",
      Math.round((defaultScenario.metrics.coverage_rate_population || 0) * 100),
      (current) => `${Math.round(current)}%`
    );
    animateCounter(
      "scenario-5-improvement",
      defaultScenario.metrics.coverage_improvement_population,
      (current) => `${formatNumber(Math.round(current))}人`
    );
  } else {
    setText("scenario-5-coverage", "--");
    setText("scenario-5-improvement", "--");
  }
}

function runRenderStep(label, renderFn, errors) {
  try {
    renderFn();
  } catch (error) {
    console.error(`render step failed: ${label}`, error);
    errors.push(label);
  }
}

function summarizeRenderErrors(errors) {
  if (!errors.length) return "";
  if (errors.length <= 3) {
    return `部分模块渲染失败：${errors.join("、")}。`;
  }
  return `部分模块渲染失败：${errors.slice(0, 3).join("、")} 等 ${errors.length} 项。`;
}

function renderDashboard() {
  const errors = [];

  runRenderStep("command-nav", bindCommandNav, errors);
  runRenderStep("section-observer", setupSectionObservers, errors);
  runRenderStep("summary-cards", renderSummaryCards, errors);
  runRenderStep("hero-summary", renderHeroSummary, errors);
  runRenderStep("hero-evidence", renderHeroEvidenceStrip, errors);
  runRenderStep("hero-spectrum", renderHeroSpectrum, errors);
  runRenderStep("signal-ticker", renderSignalTicker, errors);
  runRenderStep("workflow-strip", renderWorkflowStrip, errors);
  runRenderStep("ops-ribbon", renderOpsRibbon, errors);
  runRenderStep("poi-list", () => renderPoiList(appState.dashboard?.poi?.categories || []), errors);
  runRenderStep("spatial-board", renderSpatialBoard, errors);
  runRenderStep("site-spotlight", renderSiteSpotlight, errors);
  runRenderStep("recommendations", renderRecommendations, errors);
  runRenderStep("model-insights", renderModelInsights, errors);
  runRenderStep("warning-board", renderWarningBoard, errors);
  runRenderStep("official-cooling", renderOfficialCoolingPanel, errors);
  runRenderStep("evidence-board", renderEvidenceBoard, errors);
  runRenderStep("recommendation-note", renderRecommendationNote, errors);
  runRenderStep("role-switcher", renderRoleSwitcher, errors);
  runRenderStep("role-briefing", renderRoleBriefing, errors);
  runRenderStep("scenario-switcher", renderScenarioSwitcher, errors);
  runRenderStep("scenario-focus", renderScenarioFocus, errors);
  runRenderStep("scenario-chart", renderScenarioChart, errors);
  runRenderStep("trend-comparison", renderTrendComparison, errors);
  runRenderStep("heatmap", () => renderHeatmap(appState.grid?.features || []), errors);
  runRenderStep(
    "district-chart",
    () => renderDistrictChart(appState.dashboard?.risk_summary?.districts || []),
    errors
  );
  runRenderStep("interactive-chrome", setupInteractiveChrome, errors);
  runRenderStep(
    "section-hud",
    () => updateSectionHud(document.body.dataset.activeSection || "section-overview"),
    errors
  );
  runRenderStep("gsap-motion", () => window.HeatGuardianMotion?.afterDashboardRender?.(), errors);
  runRenderStep(
    "motion-extras",
    () => window.HeatGuardianExtras?.dashboardReady?.({ dashboard: appState.dashboard }),
    errors
  );

  return errors;
}

async function bootstrapLegacy() {
  bindRetryButton();
  setLoading(true);
  setStatus(
    "正在联动真实数据与实验结果…",
    "loading",
    "优先加载仪表盘指标，其次渲染风险栅格和方案图表。",
    false
  );

  try {
    const [dashboardResult, gridResult, geojsonResult] = await Promise.allSettled([
      getJson("/api/dashboard"),
      getJson("/api/risk/grid"),
      getJson("/api/risk/grid/geojson"),
    ]);

    if (dashboardResult.status !== "fulfilled") {
      throw dashboardResult.reason;
    }

    appState.dashboard = dashboardResult.value;
    appState.grid = gridResult.status === "fulfilled" ? gridResult.value : { features: [] };
    appState.gridGeojson =
      geojsonResult.status === "fulfilled" ? geojsonResult.value : { type: "FeatureCollection", features: [] };
    appState.selectedScenarioCount = appState.selectedScenarioCount || getDefaultScenarioCount(appState.dashboard);

    const renderErrors = renderDashboard();

    const generatedAt =
      appState.dashboard.optimization?.generated_at ||
      appState.dashboard.official_cooling?.generated_at ||
      appState.dashboard.weather?.generated_at ||
      null;

    if (gridResult.status !== "fulfilled") {
      setStatus(
        "仪表盘已载入，但风险栅格未返回。",
        "warning",
        `文本指标仍可使用；最近更新 ${formatDateTime(generatedAt)}。可点击“重新加载”继续尝试拉取栅格。`,
        true
      );
    } else if (!window.echarts) {
      setStatus(
        "数据已载入，但图表库未加载。",
        "warning",
        `文本结果正常，图表已降级为空状态；最近更新 ${formatDateTime(generatedAt)}。`,
        true
      );
    } else if (renderErrors.length) {
      setStatus(
        "主要数据已载入，但部分模块渲染失败。",
        "warning",
        `${summarizeRenderErrors(renderErrors)} 最近更新 ${formatDateTime(generatedAt)}。`,
        true
      );
    } else {
      setStatus(
        `真实数据已联动，当前展示新增 ${appState.selectedScenarioCount} 点方案。`,
        "ok",
        `最近更新 ${formatDateTime(generatedAt)}，角色看板、官方通报、方案切换和推荐表已同步。`,
        false
      );
    }
  } catch (error) {
    console.error(error);
    setStatus(
      "仪表盘数据加载失败。",
      "error",
      "请确认 FastAPI 服务已启动，并检查 `data/processed` 目录下的结果文件是否存在。",
      true
    );
  } finally {
    setLoading(false);
  }
}

async function bootstrap() {
  bindRetryButton();
  setLoading(true);
  setStatus(
    "正在联动真实上游数据与模型结果…",
    "loading",
    "优先加载仪表盘指标，其次渲染风险栅格、证据审计与方案图表。",
    false
  );

  try {
    const [dashboardResult, gridResult, geojsonResult] = await Promise.allSettled([
      getJson("/api/dashboard"),
      getJson("/api/risk/grid"),
      getJson("/api/risk/grid/geojson"),
    ]);

    if (dashboardResult.status !== "fulfilled") {
      throw dashboardResult.reason;
    }

    appState.dashboard = dashboardResult.value;
    appState.grid = gridResult.status === "fulfilled" ? gridResult.value : { features: [] };
    appState.gridGeojson =
      geojsonResult.status === "fulfilled" ? geojsonResult.value : { type: "FeatureCollection", features: [] };
    appState.selectedScenarioCount = appState.selectedScenarioCount || getDefaultScenarioCount(appState.dashboard);

    const renderErrors = renderDashboard();

    const generatedAt =
      appState.dashboard.optimization?.generated_at ||
      appState.dashboard.official_cooling?.generated_at ||
      appState.dashboard.weather?.generated_at ||
      null;

    if (gridResult.status !== "fulfilled") {
      setStatus(
        "仪表盘已载入，但风险栅格未返回。",
        "warning",
        `文本指标与真实性审计仍可使用；最近更新 ${formatDateTime(generatedAt)}。可点击“重新加载”继续尝试拉取栅格。`,
        true
      );
    } else if (!window.echarts) {
      setStatus(
        "数据已载入，但图表库未加载。",
        "warning",
        `文本结果正常，图表已降级为空状态；最近更新 ${formatDateTime(generatedAt)}。`,
        true
      );
    } else if (renderErrors.length) {
      setStatus(
        "主要数据已载入，但部分模块渲染失败。",
        "warning",
        `${summarizeRenderErrors(renderErrors)} 最近更新 ${formatDateTime(generatedAt)}。`,
        true
      );
    } else {
      setStatus(
        `真实上游数据与模型结果已同步，当前展示新增 ${appState.selectedScenarioCount} 点方案。`,
        "ok",
        `最近更新 ${formatDateTime(generatedAt)}；真实性审计、官方通报、方案切换与推荐表已同步。`,
        false
      );
    }
  } catch (error) {
    console.error(error);
    setStatus(
      "仪表盘数据加载失败。",
      "error",
      "请确认 FastAPI 服务已启动，并检查 `data/processed` 目录下的结果文件是否存在。",
      true
    );
  } finally {
    setLoading(false);
  }
}

initializeVisualMode();
bootstrap();
