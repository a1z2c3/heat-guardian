(function () {
  const NS = "HeatGuardianExtras";
  const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  const chartAnimated = new Set();
  const lottieCache = new Map();
  const lottieKinds = {
    loading: {
      tone: "#1f78d1",
      accent: "#0c8c7d",
      duration: 92,
      loop: true,
      path: "M 18 42 C 34 18 58 18 74 42",
    },
    ok: {
      tone: "#0c8c7d",
      accent: "#1f78d1",
      duration: 64,
      loop: false,
      path: "M 22 44 L 38 58 L 68 24",
    },
    warning: {
      tone: "#d8862e",
      accent: "#e57b53",
      duration: 78,
      loop: true,
      path: "M 45 16 L 74 66 L 16 66 Z",
    },
    error: {
      tone: "#d95c48",
      accent: "#8b2c20",
      duration: 62,
      loop: false,
      path: "M 26 26 L 64 64 M 64 26 L 26 64",
    },
    site: {
      tone: "#0c8c7d",
      accent: "#d8862e",
      duration: 72,
      loop: false,
      path: "M 45 18 C 31 18 22 28 22 40 C 22 56 45 72 45 72 C 45 72 68 56 68 40 C 68 28 59 18 45 18 Z",
    },
  };

  let threeRuntime = null;
  let activeSection = "section-overview";

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia(REDUCED_MOTION_QUERY).matches);
  }

  function canMove() {
    return !prefersReducedMotion();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getGsap() {
    return window.gsap || null;
  }

  function ensureMotionBadge(target, kind = "ok") {
    if (!target) return null;
    const existing = target.querySelector(".motion-badge");
    if (existing) return existing;
    const badge = document.createElement("span");
    badge.className = "motion-badge";
    badge.setAttribute("aria-hidden", "true");
    target.prepend(badge);
    target.classList.add("has-motion-badge");
    target.dataset.motionBadgeBound = "true";
    mountLottie(badge, kind);
    return badge;
  }

  function makeLottieData(kindName) {
    const kind = lottieKinds[kindName] || lottieKinds.ok;
    const keyframes = [
      { t: 0, s: [0], e: [100], i: { x: [0.22], y: [1] }, o: { x: [0.16], y: [1] } },
      { t: kind.duration, s: [100] },
    ];
    return {
      v: "5.7.4",
      fr: 60,
      ip: 0,
      op: kind.duration,
      w: 90,
      h: 90,
      nm: `heat-guardian-${kindName}`,
      ddd: 0,
      assets: [],
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,
          nm: "signal",
          sr: 1,
          ks: {
            o: { a: 0, k: 100 },
            r: { a: 0, k: 0 },
            p: { a: 0, k: [45, 45, 0] },
            a: { a: 0, k: [45, 45, 0] },
            s: {
              a: 1,
              k: [
                { t: 0, s: [86, 86, 100], e: [104, 104, 100], i: { x: [0.22], y: [1] }, o: { x: [0.16], y: [1] } },
                { t: Math.round(kind.duration * 0.42), s: [104, 104, 100], e: [94, 94, 100] },
                { t: kind.duration, s: [94, 94, 100] },
              ],
            },
          },
          shapes: [
            {
              ty: "gr",
              nm: "ring",
              it: [
                { ty: "el", p: { a: 0, k: [45, 45] }, s: { a: 0, k: [60, 60] }, nm: "ellipse" },
                { ty: "st", c: { a: 0, k: hexToRgba(kind.tone, 0.24) }, o: { a: 0, k: 100 }, w: { a: 0, k: 4 }, lc: 2, lj: 2 },
                { ty: "fl", c: { a: 0, k: hexToRgba(kind.tone, 0.06) }, o: { a: 0, k: 100 } },
                { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
              ],
            },
            {
              ty: "gr",
              nm: "mark",
              it: [
                { ty: "sh", ks: { a: 0, k: pathToLottieShape(kind.path) }, nm: "path" },
                {
                  ty: "tm",
                  s: { a: 0, k: 0 },
                  e: { a: 1, k: keyframes },
                  o: { a: 0, k: 0 },
                  m: 1,
                  nm: "trim",
                },
                { ty: "st", c: { a: 0, k: hexToRgba(kind.accent, 1) }, o: { a: 0, k: 100 }, w: { a: 0, k: 7 }, lc: 2, lj: 2 },
                { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
              ],
            },
          ],
          ip: 0,
          op: kind.duration,
          st: 0,
          bm: 0,
        },
      ],
    };
  }

  function hexToRgba(hex, alpha) {
    const normalized = String(hex || "#000000").replace("#", "");
    const value = normalized.length === 3
      ? normalized.split("").map((part) => part + part).join("")
      : normalized.padEnd(6, "0").slice(0, 6);
    const r = parseInt(value.slice(0, 2), 16) / 255;
    const g = parseInt(value.slice(2, 4), 16) / 255;
    const b = parseInt(value.slice(4, 6), 16) / 255;
    return [r, g, b, alpha];
  }

  function pathToLottieShape(path) {
    const commands = path
      .replace(/([A-Za-z])/g, " $1 ")
      .trim()
      .split(/\s+/);
    const vertices = [];
    const inTangents = [];
    const outTangents = [];
    let cursor = [0, 0];
    let index = 0;
    let closed = false;

    while (index < commands.length) {
      const command = commands[index++];
      if (command === "M" || command === "L") {
        const point = [Number(commands[index++]), Number(commands[index++])];
        vertices.push(point);
        inTangents.push([0, 0]);
        outTangents.push([0, 0]);
        cursor = point;
      } else if (command === "C") {
        const c1 = [Number(commands[index++]), Number(commands[index++])];
        const c2 = [Number(commands[index++]), Number(commands[index++])];
        const point = [Number(commands[index++]), Number(commands[index++])];
        if (vertices.length) {
          outTangents[outTangents.length - 1] = [c1[0] - cursor[0], c1[1] - cursor[1]];
        }
        vertices.push(point);
        inTangents.push([c2[0] - point[0], c2[1] - point[1]]);
        outTangents.push([0, 0]);
        cursor = point;
      } else if (command === "Z") {
        closed = true;
      }
    }

    return { i: inTangents, o: outTangents, v: vertices, c: closed };
  }

  function mountLottie(container, kindName) {
    if (!container || !window.lottie || !canMove()) return false;
    const previous = lottieCache.get(container);
    if (previous) previous.destroy();

    const animation = window.lottie.loadAnimation({
      container,
      renderer: "svg",
      loop: Boolean((lottieKinds[kindName] || lottieKinds.ok).loop),
      autoplay: true,
      animationData: makeLottieData(kindName),
      rendererSettings: {
        progressiveLoad: true,
        preserveAspectRatio: "xMidYMid meet",
      },
    });
    lottieCache.set(container, animation);
    return true;
  }

  function syncStatus({ tone = "ok" } = {}) {
    const status = document.getElementById("data-status");
    const banner = document.getElementById("app-status");
    const official = document.getElementById("official-chip");
    const recommendation = document.getElementById("recommendation-scenario-chip");
    const kind = tone === "error" ? "error" : tone === "warning" ? "warning" : tone === "loading" ? "loading" : "ok";

    [
      [status, kind],
      [banner, kind],
      [official, "ok"],
      [recommendation, "site"],
    ].forEach(([target, itemKind]) => {
      const badge = ensureMotionBadge(target, itemKind);
      if (badge && target === banner && window.lottie) {
        mountLottie(badge, itemKind);
      }
    });
  }

  function enhanceHeroStage(dashboard) {
    if (!window.THREE || !canMove()) return false;
    if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) return false;
    const stage = document.querySelector(".hero-stage");
    if (!stage) return false;

    let canvas = stage.querySelector(".three-heat-field");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "three-heat-field";
      canvas.setAttribute("aria-hidden", "true");
      stage.prepend(canvas);
    }

    if (threeRuntime?.canvas !== canvas) {
      disposeThree();
      threeRuntime = createThreeRuntime(canvas);
    }

    if (!threeRuntime) return false;
    const districts = dashboard?.risk_summary?.districts || [];
    updateThreeField(threeRuntime, districts);
    return true;
  }

  function createThreeRuntime(canvas) {
    try {
      const renderer = new window.THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      const scene = new window.THREE.Scene();
      const camera = new window.THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(0, 4.4, 8.6);
      camera.lookAt(0, 0, 0);

      const group = new window.THREE.Group();
      group.rotation.x = -0.72;
      scene.add(group);

      const ambient = new window.THREE.AmbientLight(0xffffff, 1.5);
      const key = new window.THREE.DirectionalLight(0x89d8ff, 1.4);
      key.position.set(3, 5, 6);
      scene.add(ambient, key);

      const runtime = {
        canvas,
        renderer,
        scene,
        camera,
        group,
        planes: [],
        particles: null,
        raf: 0,
        visible: true,
        needsResize: true,
        startedAt: performance.now(),
      };

      const observer = new IntersectionObserver((entries) => {
        runtime.visible = entries.some((entry) => entry.isIntersecting);
        if (runtime.visible) startThree(runtime);
      }, { threshold: 0.05 });
      observer.observe(canvas);
      runtime.observer = observer;
      window.addEventListener("resize", () => {
        runtime.needsResize = true;
      }, { passive: true });

      startThree(runtime);
      return runtime;
    } catch (error) {
      console.warn("Three heat field unavailable", error);
      return null;
    }
  }

  function updateThreeField(runtime, districts) {
    const THREE = window.THREE;
    if (!runtime || !THREE) return;
    runtime.group.children.forEach((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material?.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    });
    runtime.group.clear();
    runtime.planes = [];

    const values = (districts.length ? districts : [{ district: "A", average_risk: 58 }, { district: "B", average_risk: 72 }])
      .slice(0, 9)
      .map((item, index) => ({
        risk: Number(item.average_risk || item.risk_score || 48 + index * 4),
        cells: Number(item.high_risk_cells || 0),
        index,
      }));

    const grid = new THREE.GridHelper(8.8, 18, 0x7fd0c2, 0xc8e9e0);
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    grid.position.y = -0.04;
    runtime.group.add(grid);

    const geometry = new THREE.PlaneGeometry(0.86, 0.42, 1, 1);
    values.forEach((item, index) => {
      const alpha = clamp((item.risk - 42) / 120, 0.08, 0.24);
      const material = new THREE.MeshStandardMaterial({
        color: item.risk >= 72 ? 0xe57b53 : item.risk >= 58 ? 0xd8862e : 0x0c8c7d,
        transparent: true,
        opacity: alpha,
        roughness: 0.82,
        metalness: 0.08,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const column = index % 3;
      const row = Math.floor(index / 3);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((column - 1) * 1.5, 0.035 + alpha * 0.12, (row - 1) * 1.18);
      mesh.userData.baseY = mesh.position.y;
      mesh.userData.phase = index * 0.74;
      runtime.group.add(mesh);
      runtime.planes.push(mesh);
    });

    const ringGeometry = new THREE.RingGeometry(0.12, 0.18, 32);
    values
      .filter((item) => item.risk >= 58)
      .slice(0, 5)
      .forEach((item, ringIndex) => {
        const material = new THREE.MeshBasicMaterial({
          color: item.risk >= 72 ? 0xe57b53 : 0x0c8c7d,
          transparent: true,
          opacity: item.risk >= 72 ? 0.23 : 0.16,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeometry, material);
        const sourceIndex = item.index;
        const column = sourceIndex % 3;
        const row = Math.floor(sourceIndex / 3);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set((column - 1) * 1.5, 0.07, (row - 1) * 1.18);
        ring.userData.baseScale = 1 + ringIndex * 0.14;
        ring.userData.phase = ringIndex * 0.9;
        runtime.group.add(ring);
        runtime.planes.push(ring);
      });

    const particleCount = 64;
    const positions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 7.8;
      positions[index * 3 + 1] = 0.12 + Math.random() * 2.7;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 5.2;
    }
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pointMaterial = new THREE.PointsMaterial({
      color: 0x1f78d1,
      size: 0.025,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    runtime.particles = new THREE.Points(pointGeometry, pointMaterial);
    runtime.group.add(runtime.particles);
  }

  function resizeThree(runtime) {
    const rect = runtime.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    runtime.renderer.setSize(width, height, false);
    runtime.camera.aspect = width / height;
    runtime.camera.updateProjectionMatrix();
    runtime.needsResize = false;
  }

  function startThree(runtime) {
    if (!runtime || runtime.raf || !runtime.visible) return;
    const render = (now) => {
      runtime.raf = 0;
      if (!runtime.visible || prefersReducedMotion()) return;
      if (runtime.needsResize) resizeThree(runtime);

      const time = (now - runtime.startedAt) * 0.001;
      runtime.group.rotation.z = Math.sin(time * 0.28) * 0.025;
      runtime.planes.forEach((plane) => {
        if (typeof plane.userData.baseY === "number") {
          plane.position.y = plane.userData.baseY + Math.sin(time * 0.9 + plane.userData.phase) * 0.018;
          return;
        }
        const scale = (plane.userData.baseScale || 1) + Math.sin(time * 1.1 + plane.userData.phase) * 0.16;
        plane.scale.setScalar(scale);
      });
      if (runtime.particles) {
        runtime.particles.rotation.y = time * 0.035;
      }

      runtime.renderer.render(runtime.scene, runtime.camera);
      runtime.raf = window.requestAnimationFrame(render);
    };
    runtime.raf = window.requestAnimationFrame(render);
  }

  function disposeThree() {
    if (!threeRuntime) return;
    if (threeRuntime.raf) window.cancelAnimationFrame(threeRuntime.raf);
    threeRuntime.observer?.disconnect();
    threeRuntime.group?.children?.forEach((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material?.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    });
    threeRuntime.renderer?.dispose();
    threeRuntime = null;
  }

  function enhanceWorkflowLine() {
    const strip = document.getElementById("workflow-strip");
    const steps = Array.from(strip?.querySelectorAll(".workflow-step") || []);
    if (!strip || steps.length < 2) return false;

    let svg = strip.querySelector(".workflow-thread-svg");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("workflow-thread-svg");
      svg.setAttribute("aria-hidden", "true");
      svg.innerHTML = '<path class="workflow-thread-path"></path>';
      strip.prepend(svg);
    }

    const rect = strip.getBoundingClientRect();
    const points = steps.map((step) => {
      const itemRect = step.getBoundingClientRect();
      return {
        x: itemRect.left - rect.left + itemRect.width / 2,
        y: itemRect.top - rect.top + 12,
      };
    });
    const d = points
      .map((point, index) => index === 0 ? `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}` : `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(" ");
    const path = svg.querySelector(".workflow-thread-path");
    svg.setAttribute("viewBox", `0 0 ${Math.max(rect.width, 1)} ${Math.max(rect.height, 1)}`);
    path.setAttribute("d", d);

    if (window.anime && canMove()) {
      window.anime.remove(path);
      path.style.strokeDasharray = "";
      path.style.strokeDashoffset = "";
      const length = path.getTotalLength ? path.getTotalLength() : 600;
      window.anime({
        targets: path,
        strokeDashoffset: [length, 0],
        easing: "easeOutExpo",
        duration: 820,
        delay: 80,
      });
    }
    return true;
  }

  function activeChart(containerId, chart) {
    if (!chart || !canMove()) return false;
    const element = document.getElementById(containerId);
    if (!element) return false;
    element.classList.add("is-chart-armed");

    if (getGsap() && !element.dataset.chartSurfaceBound) {
      element.dataset.chartSurfaceBound = "true";
      getGsap().fromTo(
        element,
        { autoAlpha: 0.82, y: 10, scale: 0.985 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.36, ease: "expo.out", clearProps: "opacity,visibility,transform" }
      );
    }

    if (chartAnimated.has(containerId)) return true;
    chartAnimated.add(containerId);
    window.setTimeout(() => {
      try {
        chart.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex: 0 });
        window.setTimeout(() => chart.dispatchAction({ type: "downplay", seriesIndex: 0, dataIndex: 0 }), 420);
      } catch (error) {
        // ECharts action availability differs by series type; the chart itself is still valid.
      }
    }, 180);
    return true;
  }

  function sectionChanged(sectionId) {
    activeSection = sectionId || "section-overview";
    if (getGsap() && canMove()) {
      const sectionRoots = document.querySelectorAll(`[data-page-owner="${activeSection}"]`);
      const elements = document.querySelectorAll(
        `[data-page-owner="${activeSection}"] .chart, ` +
        `[data-page-owner="${activeSection}"] .workflow-step, ` +
        `[data-page-owner="${activeSection}"] .focus-kpi, ` +
        `[data-page-owner="${activeSection}"] .action-card, ` +
        `[data-page-owner="${activeSection}"] .site-card, ` +
        `[data-page-owner="${activeSection}"] .source-card, ` +
        `[data-page-owner="${activeSection}"] .metric-row`
      );
      getGsap().fromTo(
        sectionRoots,
        { "--deck-light": 0 },
        { "--deck-light": 1, duration: 0.58, ease: "expo.out" }
      );
      getGsap().fromTo(
        elements,
        { autoAlpha: 0.72, y: 12, rotateX: 3, transformPerspective: 800 },
        { autoAlpha: 1, y: 0, rotateX: 0, duration: 0.34, stagger: 0.024, ease: "expo.out", clearProps: "opacity,visibility,transform" }
      );
      window.setTimeout(() => {
        getGsap()?.set([...elements, ...sectionRoots], { clearProps: "opacity,visibility,transform,--deck-light" });
      }, 620);
    }
    enhanceWorkflowLine();
  }

  function dashboardReady({ dashboard } = {}) {
    syncStatus({ tone: "ok" });
    enhanceHeroStage(dashboard);
    window.setTimeout(enhanceWorkflowLine, 80);
  }

  function spatialReady() {
    const stage = document.querySelector(".spatial-stage");
    if (!stage || !canMove()) return false;
    stage.classList.remove("is-spatial-handoff");
    void stage.offsetWidth;
    stage.classList.add("is-spatial-handoff");
    window.setTimeout(() => stage.classList.remove("is-spatial-handoff"), 760);
    return true;
  }

  window[NS] = {
    dashboardReady,
    syncStatus,
    sectionChanged,
    spatialReady,
    activeChart,
    enhanceWorkflowLine,
    enhanceHeroStage,
  };
})();
