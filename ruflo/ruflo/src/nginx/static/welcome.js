(function () {
  "use strict";

  const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
  const BG_COLOR = 0x0a0a1a;
  const CYAN = 0x00d4ff;
  const VIOLET = 0x7c3aed;
  const AMBER = 0xf59e0b;
  const PARTICLE_COUNT = 200;

  let scene, camera, renderer, frameId;
  let icosahedron, octahedron, torus, particles;
  let textSprite;

  function createTextTexture(text, w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#00d4ff");
    grad.addColorStop(1, "#7c3aed");
    ctx.fillStyle = grad;
    ctx.font = "bold 72px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2);
    return canvas;
  }

  async function initScene(container) {
    const THREE = await import(THREE_CDN);

    const rect = container.getBoundingClientRect();
    const width = rect.width || 400;
    const height = rect.height || 300;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);

    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const canvas = renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.borderRadius = "12px";
    container.appendChild(canvas);

    // Wireframe icosahedron (cyan, slow rotation)
    const icoGeo = new THREE.IcosahedronGeometry(1.4, 1);
    const icoMat = new THREE.MeshBasicMaterial({ color: CYAN, wireframe: true, transparent: true, opacity: 0.6 });
    icosahedron = new THREE.Mesh(icoGeo, icoMat);
    scene.add(icosahedron);

    // Wireframe octahedron (violet, counter-rotation)
    const octGeo = new THREE.OctahedronGeometry(1.0, 0);
    const octMat = new THREE.MeshBasicMaterial({ color: VIOLET, wireframe: true, transparent: true, opacity: 0.7 });
    octahedron = new THREE.Mesh(octGeo, octMat);
    scene.add(octahedron);

    // Pulse torus ring (cyan, breathing)
    const torGeo = new THREE.TorusGeometry(2.0, 0.02, 8, 64);
    const torMat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.4 });
    torus = new THREE.Mesh(torGeo, torMat);
    torus.rotation.x = Math.PI / 2;
    scene.add(torus);

    // Particle field (~200 amber dots in a sphere)
    const pGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const r = 1.2 + Math.random() * 1.0;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({ color: AMBER, size: 0.04, sizeAttenuation: true });
    particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // "RuFlo" text sprite
    const textCanvas = createTextTexture("RuFlo", 512, 128);
    const tex = new THREE.CanvasTexture(textCanvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9 });
    textSprite = new THREE.Sprite(spriteMat);
    textSprite.scale.set(2.5, 0.625, 1);
    textSprite.position.y = -2.2;
    scene.add(textSprite);

    // Responsive resize
    const ro = new ResizeObserver(function () {
      const r2 = container.getBoundingClientRect();
      const w = r2.width || 400;
      const h = r2.height || 300;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    // Animate
    function animate() {
      frameId = requestAnimationFrame(animate);
      const t = performance.now() * 0.001;

      icosahedron.rotation.y = t * 0.3;
      icosahedron.rotation.x = t * 0.15;

      octahedron.rotation.y = -t * 0.4;
      octahedron.rotation.z = t * 0.2;

      // Breathing torus
      const s = 1 + 0.15 * Math.sin(t * 1.5);
      torus.scale.set(s, s, s);

      // Slow particle rotation
      particles.rotation.y = t * 0.05;
      particles.rotation.x = t * 0.02;

      renderer.render(scene, camera);
    }
    animate();

    return { ro: ro };
  }

  function cleanup(refs) {
    if (frameId) cancelAnimationFrame(frameId);
    if (refs && refs.ro) refs.ro.disconnect();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
    scene = camera = renderer = frameId = null;
  }

  // Watch for the welcome modal's image and replace it
  let refs = null;
  const observer = new MutationObserver(function (mutations) {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const img = node.querySelector
          ? node.querySelector('img[src*="omni-welcome"], img[src*="huggingchat"]')
          : null;
        if (img) {
          const container = document.createElement("div");
          container.style.width = "100%";
          container.style.height = "320px";
          container.style.position = "relative";
          container.style.overflow = "hidden";
          container.style.borderRadius = "12px";
          img.parentNode.replaceChild(container, img);
          initScene(container).then(function (r) { refs = r; });
        }
      }
      // Detect modal removal → cleanup
      for (const node of m.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.querySelector && node.querySelector("canvas")) {
          cleanup(refs);
          refs = null;
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
})();
