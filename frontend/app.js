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
    title: "WHO Heat And Health",
    meta: "政策依据 · 老年人与慢病人群是热健康高风险对象",
    value: "查看官方事实表",
    href: "https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health",
  },
  {
    title: "Nature Health · Accessible Parks",
    meta: "论文依据 · 小而可达的城市公园可降低热相关死亡风险",
    value: "查看 Nature Health 论文",
    href: "https://www.nature.com/articles/s44360-025-00036-3",
  },
  {
    title: "Cooling Center Siting Study",
    meta: "论文依据 · 冷却中心布点需考虑脆弱人群与可达性",
    value: "查看开放论文",
    href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10576472/",
  },
  {
    title: "WorldPop Age-Sex Structures",
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
  selectedRole: "street",
  selectedScenarioCount: null,
  mapFocus: null,
  visualMode: "command",
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

function byId(id) {
  return document.getElementById(id);
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
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
    renderDashboard();
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
    using_cached_snapshot: "使用本地缓存",
    live: "实时抓取",
    cached_snapshot: "缓存快照",
    generated: "本地生成",
  };
  return map[value] || value || "--";
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

function normalizePoiCategory(item) {
  const map = {
    park: "公园",
    hospital: "医院",
    pharmacy: "药店",
    library: "图书馆",
    community_centre: "社区中心",
    social_facility: "养老服务设施",
    official_cooling_site: "官方纳凉点",
  };
  return item.category_label || map[item.category] || "候选点";
}

function normalizePoiName(name, categoryLabel, index = 0) {
  if (!name) {
    return `${categoryLabel}候选点 ${String(index + 1).padStart(2, "0")}`;
  }
  if (/^\S+\d{6,}$/.test(name)) {
    return `${categoryLabel}候选点 ${String(index + 1).padStart(2, "0")}`;
  }
  return name;
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
      label: "Risk Scan",
      title: derived.topDistrict.district || "最高风险城区",
      value: `${formatNumber(derived.optimization.high_risk_cell_count || 0)} 个`,
      meta: `${derived.riskContextLabel} 当前最高风险城区为 ${derived.topDistrict.district || "--"}`,
      tone: "warm",
    },
    {
      index: "02",
      label: "Access Check",
      title: `${derived.allSupportLabel} 15 分钟可达`,
      value: formatPercent(derived.allSupportScope?.coverage_15min_rate, 0),
      meta:
        `${derived.allSupportLabel} 平均最近步行时间 ${formatMinutes(derived.allSupportScope?.average_nearest_walk_minutes)}；` +
        `${derived.activeCoolingLabel} 覆盖 ${formatPercent(derived.activeCoolingScope?.coverage_15min_rate, 0)}`,
      tone: "teal",
    },
    {
      index: "03",
      label: "Scenario Test",
      title: `新增 ${derived.selectedScenarioCount || "--"} 点方案`,
      value: formatPercent(scenario?.metrics?.coverage_rate_population, 1),
      meta: `平均到达时间较基线缩短 ${formatSignedMinutes(timeSaved).replace("+", "")}`,
      tone: "violet",
    },
    {
      index: "04",
      label: "Site Action",
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
  const sourceBreakdown = derived.officialCooling?.source_status_breakdown || {};
  const latestGeneratedAt =
    derived.dashboard.optimization?.generated_at ||
    derived.officialCooling?.generated_at ||
    derived.dashboard.weather?.generated_at;

  const items = [
    {
      label: "WorldPop",
      value: `${worldpop.data_year || "--"} / ${worldpop.release || "--"}`,
      meta: `老年人口栅格 · 检查 ${formatDateTime(worldpop.checked_at)}`,
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
      value: derived.analysisProfileType === "historical_heatwave_case" ? "Forecast + Archive" : "Forecast",
      meta: `最近生成 ${formatDateTime(derived.dashboard.weather?.generated_at)}`,
    },
    {
      label: "Official",
      value: `${formatNumber(derived.officialBulletins.length)} 页监测 / ${formatNumber(derived.officialVerifiedCount)} 点核验`,
      meta: `live ${formatNumber(sourceBreakdown.live || 0)} · cached ${formatNumber(sourceBreakdown.cached_snapshot || 0)}`,
    },
    {
      label: "Pipeline",
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
      label: "Heat Window",
      title: derived.analysisProfileType === "historical_heatwave_case" ? "当前监测 / 历史案例" : "未来 24h 峰值",
      value:
        derived.forecast?.next_24h_max_temperature !== null &&
        derived.forecast?.next_24h_max_temperature !== undefined
          ? `${formatDecimal(derived.forecast.next_24h_max_temperature, 1)}℃`
          : "--",
      meta:
        derived.analysisProfileType === "historical_heatwave_case"
          ? `当前监测 ${formatDecimal(derived.forecast?.current_temperature, 1)}℃；风险推演采用 ${derived.analysisWindow} 的真实热浪案例。`
          : `当前 ${formatDecimal(derived.forecast?.current_temperature, 1)}℃，风险推演直接使用未来72小时预报。`,
      tone: "warm",
    },
    {
      label: "Priority District",
      title: derived.topDistrict.district || "待识别",
      value:
        derived.topDistrict.average_risk !== null && derived.topDistrict.average_risk !== undefined
          ? `${formatDecimal(derived.topDistrict.average_risk, 2)} 分`
          : "--",
      meta: `${formatNumber(dashboard.risk_summary?.high_risk_cells || 0)} 个高风险网格待持续盯防。`,
      tone: "danger",
    },
    {
      label: "Coverage Action",
      title: scenario ? `新增 ${scenario.new_site_count} 点方案` : "待返回优化方案",
      value: scenario ? `${formatNumber(scenario.metrics.coverage_improvement_population || 0)} 人` : "--",
      meta: scenario
        ? `相对 ${derived.activeCoolingLabel} 基线，覆盖率 ${formatPercent(scenario.metrics.coverage_rate_population, 1)}。`
        : "暂无新增点位的覆盖收益数据。",
      tone: "teal",
    },
    {
      label: "Time Gain",
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

function renderReferenceLinks(containerId, items) {
  renderMetricRows(containerId, items, "暂无外部参考链接");
}

function updateCommandNav(activeId) {
  document.body.dataset.activeSection = activeId || "section-overview";
  document.querySelectorAll(".command-link[data-section-target]").forEach((link) => {
    const isActive = link.dataset.sectionTarget === activeId;
    link.classList.toggle("is-active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });
  updateSectionHud(activeId);
  syncCommandIndicator();
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
      const target = byId(targetId);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      updateCommandNav(targetId);
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

  commandNavBound = true;
}

function setupSectionObservers() {
  if (sectionObserverBound) return;
  const sections = document.querySelectorAll(".observe-section");
  if (!sections.length) {
    return;
  }

  updateCommandNav("section-overview");

  sections.forEach((section, index) => {
    window.setTimeout(() => {
      section.classList.add("is-visible");
    }, 40 + index * 55);
  });

  if (typeof IntersectionObserver === "undefined") {
    sections.forEach((section) => section.classList.add("is-visible"));
    return;
  }

  const navSections = document.querySelectorAll("[data-nav-section]");
  if (navSections.length) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visible?.target?.id) {
          updateCommandNav(visible.target.id);
        }
      },
      {
        threshold: [0.2, 0.45, 0.7],
        rootMargin: "-18% 0px -52% 0px",
      }
    );
    navSections.forEach((section) => navObserver.observe(section));
  }

  sectionObserverBound = true;
}

function setupInteractiveChrome() {
  if (!interactiveChromeBound) {
    ensureResizeBinding();
    interactiveChromeBound = true;
  }

  bindScrollProgress();
  setupHeroAtmosphere();

  document
    .querySelectorAll(
      ".hero-stage, .hero-aside, .workflow-step, .panel, .card, .spotlight-card, .site-card, .ops-item, .summary-pill, .aside-kpi, .briefing-card, .focus-card, .mini-panel, .action-card, .metric-row, .spotlight-metric, .site-stat, .spatial-stage, .source-card"
    )
    .forEach((surface) => {
      if (!surface.classList.contains("has-surface-glow")) {
        surface.classList.add("has-surface-glow");
      }

      let glow = surface.querySelector(".surface-glow");
      if (!glow) {
        glow = document.createElement("span");
        glow.className = "surface-glow";
        surface.appendChild(glow);
      }

      let frame = surface.querySelector(".surface-frame");
      if (!frame) {
        frame = document.createElement("span");
        frame.className = "surface-frame";
        surface.appendChild(frame);
      }

      if (surface.dataset.surfaceBound === "true") return;

      surface.addEventListener("pointerenter", () => {
        surface.classList.add("is-surface-active");
      });

      surface.addEventListener("pointermove", (event) => {
        const rect = surface.getBoundingClientRect();
        surface.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
        surface.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
      });

      surface.addEventListener("pointerleave", () => {
        surface.classList.remove("is-surface-active");
      });

      surface.dataset.surfaceBound = "true";
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
    name.textContent = normalizePoiName(item.name, normalizePoiCategory(item), index);

    const meta = document.createElement("small");
    meta.textContent =
      `${normalizePoiCategory(item)} · ${item.district || "未标注城区"} · ${formatCoord(item.lat, item.lon)}`;

    copy.append(name, meta);
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
  const optimization = dashboard.optimization || {};
  const weather = dashboard.weather || {};
  const forecast = weather.forecast || {};
  const analysisProfile = weather.analysis_profile || {};
  const warningSignals = weather.warning_signals || {};
  const accessibility = dashboard.accessibility || {};
  const accessibilityScopes = accessibility.resource_scopes || {};
  const allSupportScope = accessibilityScopes.all_support_resources || accessibility || {};
  const activeCoolingScope = accessibilityScopes.existing_active_cooling_resources || {};
  const officialCoolingScope = accessibilityScopes.official_operational_cooling_sites || {};
  const officialCooling = dashboard.official_cooling || {};
  const officialSites = (officialCooling.sites || []).map((item, index) => ({
    ...item,
    displayName: normalizePoiName(item.name, normalizePoiCategory(item), index),
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
    displayName: normalizePoiName(item.name, normalizePoiCategory(item), index),
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
    optimization,
    weather,
    forecast,
    analysisProfile,
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

function setMapFocus(type, id) {
  appState.mapFocus = { type, id };
  renderSpatialBoard();
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
    summary.textContent =
      `${site.displayCategory || normalizePoiCategory(site)}候选点位于 ${formatCoord(site.lat, site.lon)}，` +
      `当前方案下新增覆盖 ${formatNumber(site.covered_elderly_population)} 名高风险老年人口，` +
      `并改善 ${formatNumber(site.improved_cells)} 个网格的到达时间。`;
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

  renderSpatialSvg("spatial-map", derived, focus);
  renderMapFocusPanel(derived, focus);
  renderPriorityList("priority-cell-list", derived.topCells, "cell", focus.type === "cell" ? focus.data?.id : null);
  renderPriorityList(
    "priority-site-list",
    derived.selectedSites,
    "site",
    focus.type === "site" ? focus.data?.poi_id : null
  );
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
        displayName: normalizePoiName(item.name, normalizePoiCategory(item), index),
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
  card.innerHTML = `
    <div>
      <p class="spotlight-kicker">Priority Deployment</p>
      <h2 class="spotlight-title">${site.displayName || site.name || "候选点"}</h2>
      <p class="spotlight-summary">${summary}</p>
      <div class="spotlight-badges">
        <span class="spotlight-badge">${site.displayCategory || normalizePoiCategory(site)}</span>
        <span class="spotlight-badge">${site.selection_reason || (site.covered_elderly_population > 0 ? "覆盖优先" : "均时优化")}</span>
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

function renderEvidenceBoard() {
  const derived = buildDerivedState();
  const chip = byId("evidence-chip");
  const note = byId("evidence-note");
  const referenceChip = byId("reference-chip");
  const referenceNote = byId("reference-note");
  const worldpop = derived.dataSources.worldpop || {};
  const geofabrik = derived.dataSources.geofabrik || {};
  const worldpopAge65 = (worldpop.files || {}).age65 || {};
  const geofabrikRemote = geofabrik.remote || {};
  const latestGeneratedAt =
    derived.dashboard.optimization?.generated_at ||
    derived.officialCooling?.generated_at ||
    derived.dashboard.weather?.generated_at;

  if (chip) {
    chip.textContent =
      `WorldPop ${worldpop.data_year || "--"} / ` +
      `Geofabrik ${humanizeSourceStatus(geofabrik.status)}`;
  }
  if (note) {
    note.textContent =
      "网站启动前会先执行整条数据流水线，再启动 FastAPI 和前端页面。这里同步展示上游检查时间、本地生成时间与官方原文入口。";
  }

  renderFocusMetrics("evidence-kpis", [
    {
      label: "WorldPop 版本",
      value: `${worldpop.data_year || "--"} / ${worldpop.release || "--"}`,
      meta: `最近检查 ${formatDateTime(worldpop.checked_at)}`,
    },
    {
      label: "Geofabrik 路网",
      value: humanizeSourceStatus(geofabrik.status),
      meta: `远端文件时间 ${formatRemoteTimestamp(geofabrikRemote.last_modified)}`,
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
      detail:
        `当前使用 CHN ${worldpop.data_year || "--"} ${worldpop.release || "--"}，` +
        `1km constrained age-sex structures。`,
      href: (worldpopAge65.download || {}).url,
      linkLabel: "查看下载源",
      tone: "teal",
    },
    {
      title: "Geofabrik 湖北路网",
      status: humanizeSourceStatus(geofabrik.status),
      meta: `远端文件 ${formatRemoteTimestamp(geofabrikRemote.last_modified)}`,
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

function renderTrendChart(trend) {
  if (!trend.length) {
    renderChartFallback("trend-chart", "暂无天气趋势数据。");
    return;
  }

  const chart = getChart("trend-chart");
  if (!chart) return;

  chart.setOption({
    tooltip: { ...baseTooltip(), trigger: "axis" },
    legend: { textStyle: { color: palette.text } },
    grid: { left: 42, right: 20, top: 40, bottom: 34 },
    xAxis: {
      type: "category",
      data: trend.map((item) => item.time.slice(5, 16).replace("T", " ")),
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
        name: "温度",
        type: "line",
        smooth: true,
        symbol: "none",
        data: trend.map((item) => item.temperature),
        lineStyle: { color: palette.accent, width: 3 },
        areaStyle: {
          color: gradient("rgba(123, 183, 255, 0.24)", "rgba(123, 183, 255, 0.02)"),
        },
      },
      {
        name: "体感温度",
        type: "line",
        smooth: true,
        symbol: "none",
        data: trend.map((item) => item.apparent_temperature),
        lineStyle: { color: palette.danger, width: 2.5 },
        areaStyle: {
          color: gradient("rgba(255, 126, 100, 0.18)", "rgba(255, 126, 100, 0.02)"),
        },
      },
    ],
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

  const statusParts = [
    humanizeProfileType(derived.analysisProfileType),
    humanizeDataLevel(derived.firstFeature.population_data_level || "worldpop_raster"),
    humanizeDataLevel(derived.dashboard.accessibility?.data_level),
    derived.activeCoolingLabel,
    derived.officialSites.length ? "官方纳凉点" : "",
  ].filter(Boolean);
  setText("data-status", statusParts.join(" · "));

  setText("risk-context-title", humanizeProfileType(derived.analysisProfileType));
  setText("risk-context-detail", derived.riskContextLabel);
  setText(
    "forecast-context-title",
    `${formatDecimal(derived.forecast?.next_24h_max_temperature, 1)}℃ / ${formatDecimal(
      derived.forecast?.next_72h_max_apparent_temperature,
      1
    )}℃`
  );
  setText(
    "forecast-context-detail",
    `当前监测窗口 24h 最高温 / 72h 最高体感温度；当前温度 ${formatDecimal(derived.forecast?.current_temperature, 1)}℃。`
  );
  setText("resource-context-title", `${derived.allSupportLabel} vs ${derived.activeCoolingLabel}`);
  setText(
    "resource-context-detail",
    `${derived.allSupportLabel} 15 分钟覆盖 ${formatPercent(derived.allSupportScope?.coverage_15min_rate, 0)}；` +
      `${derived.activeCoolingLabel} 15 分钟覆盖 ${formatPercent(derived.activeCoolingScope?.coverage_15min_rate, 0)}；` +
      `${derived.officialCoolingLabel} 已校准 ${formatNumber(derived.officialSites.length)} 个点位。`
  );
  setText(
    "trend-panel-kicker",
    derived.analysisProfileType === "historical_heatwave_case" ? "Heatwave Case" : "Forecast"
  );
  setText(
    "trend-panel-title",
    derived.analysisProfileType === "historical_heatwave_case" ? "默认分析场景 72 小时趋势" : "未来72小时温度趋势"
  );
  setText(
    "trend-panel-chip",
    derived.analysisProfileType === "historical_heatwave_case" ? "Open-Meteo Archive" : "Open-Meteo Forecast"
  );

  const insightElement = byId("hero-insight");
  if (!insightElement) return;
  insightElement.textContent =
    `${derived.riskContextLabel}` +
    `${topDistrict.district || "当前重点城区"} 当前风险最高；` +
    `${derived.optimization.high_risk_cell_count || 0} 个高风险网格中，仅 ` +
    `${derived.optimization.coverage_reachable_high_risk_cell_count || 0} 个可在 15 分钟阈值内通过候选点新增覆盖。` +
    `${derived.officialSites.length ? `研究区内已接入 ${derived.officialSites.length} 个官方在运纳凉点；` : ""}` +
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
      appState.selectedRole = item.key;
      renderRoleSwitcher();
      renderRoleBriefing();
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
      appState.selectedScenarioCount = scenario.new_site_count;
      renderScenarioSwitcher();
      renderScenarioFocus();
      renderSpatialBoard();
      renderRecommendations();
      renderRecommendationNote();
      renderScenarioChart();
      renderRoleBriefing();
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

function renderDashboard() {
  const derived = buildDerivedState();
  bindCommandNav();
  setupSectionObservers();
  renderSummaryCards();
  renderHeroSummary();
  renderHeroEvidenceStrip();
  renderHeroSpectrum();
  renderSignalTicker();
  renderWorkflowStrip();
  renderOpsRibbon();
  renderPoiList(appState.dashboard?.poi?.categories || []);
  renderSpatialBoard();
  renderSiteSpotlight();
  renderRecommendations();
  renderModelInsights();
  renderWarningBoard();
  renderOfficialCoolingPanel();
  renderEvidenceBoard();
  renderRecommendationNote();
  renderRoleSwitcher();
  renderRoleBriefing();
  renderScenarioSwitcher();
  renderScenarioFocus();
  renderScenarioChart();
  renderTrendChart(derived.analysisTrend || []);
  renderHeatmap(appState.grid?.features || []);
  renderDistrictChart(appState.dashboard?.risk_summary?.districts || []);
  setupInteractiveChrome();
  updateSectionHud(document.body.dataset.activeSection || "section-overview");
}

async function bootstrap() {
  bindRetryButton();
  setLoading(true);
  setStatus(
    "正在联动真实数据与实验结果…",
    "loading",
    "优先加载仪表盘指标，其次渲染风险栅格和方案图表。",
    false
  );

  try {
    const [dashboardResult, gridResult] = await Promise.allSettled([
      getJson("/api/dashboard"),
      getJson("/api/risk/grid"),
    ]);

    if (dashboardResult.status !== "fulfilled") {
      throw dashboardResult.reason;
    }

    appState.dashboard = dashboardResult.value;
    appState.grid = gridResult.status === "fulfilled" ? gridResult.value : { features: [] };
    appState.selectedScenarioCount = appState.selectedScenarioCount || getDefaultScenarioCount(appState.dashboard);

    renderDashboard();

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

initializeVisualMode();
bootstrap();
