// Lightweight canvas snowfall. Pauses when the tab is hidden; off for reduced motion.
export function startSnow(canvas) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  let w = 0; let h = 0; let flakes = []; let raf = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(140, Math.round((w * h) / 9000));
    flakes = Array.from({ length: count }, () => spawn(true));
  }
  function spawn(anywhere) {
    return {
      x: Math.random() * w, y: anywhere ? Math.random() * h : -10,
      r: 0.8 + Math.random() * 2.6, s: 0.3 + Math.random() * 1.1, drift: Math.random() * Math.PI * 2, o: 0.35 + Math.random() * 0.6,
    };
  }
  function tick() {
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      f.y += f.s; f.drift += 0.01; f.x += Math.sin(f.drift) * 0.4;
      if (f.y > h + 10) Object.assign(f, spawn(false));
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${f.o})`; ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  }
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(tick);
  });
  raf = requestAnimationFrame(tick);
}

export function hangLights(el) {
  const colors = ['#ff3b4f', '#ffd44d', '#3fe07a', '#4db8ff', '#ff8a2b', '#d36bff'];
  const n = Math.max(12, Math.round(window.innerWidth / 38));
  el.innerHTML = Array.from({ length: n }, (_, i) => `<span class="bulb" style="--c:${colors[i % colors.length]};--d:${(i % 5) * 0.37}s"></span>`).join('');
}
