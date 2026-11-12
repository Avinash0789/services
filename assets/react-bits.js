/*
 * Vanilla JS ports of three React Bits effects (https://reactbits.dev):
 *   - BlurText      → hero h1 and section h2s blur in word by word
 *   - DecryptedText → .eyebrow labels unscramble when they scroll into view
 *   - ClickSpark    → brand-coloured sparks on every mouse click
 * Each effect is self-contained; delete its block to turn it off.
 * Everything is skipped when the visitor prefers reduced motion.
 */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const BRAND = ['#3b5bfd', '#8b3dff', '#ff3d7f'];

  const style = document.createElement('style');
  style.textContent = `
    .rb-word{display:inline-block;opacity:0;filter:blur(10px);transform:translateY(-14px);
      transition:opacity .7s cubic-bezier(.22,1,.36,1),filter .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1);
      will-change:transform,filter,opacity}
    .rb-in .rb-word{opacity:1;filter:blur(0);transform:none}
    .rb-in .rb-word.rb-done{will-change:auto}
    .rb-spark-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483000}
  `;
  document.head.appendChild(style);

  /* ---------------- BlurText ----------------
   * Splits plain-text words into spans; child elements (e.g. the gradient
   * .grad-text span) animate as a single piece so their gradient stays intact.
   */
  const blurTargets = document.querySelectorAll('.hero h1, h2.reveal');
  const STAGGER = 90; // ms between words

  const splitWords = el => {
    const pieces = [];
    [...el.childNodes].forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const w = document.createElement('span');
          w.className = 'rb-word';
          w.textContent = part;
          frag.appendChild(w);
          pieces.push(w);
        });
        node.replaceWith(frag);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // a block-level child (hero .line2) must stay on its own line
        const isBlock = getComputedStyle(node).display === 'block';
        node.classList.add('rb-word');
        if (isBlock) node.style.display = 'block';
        pieces.push(node);
      }
    });
    pieces.forEach((p, i) => {
      p.style.transitionDelay = `${i * STAGGER}ms`;
      p.addEventListener('transitionend', () => p.classList.add('rb-done'), { once: true });
    });
  };

  const blurIO = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('rb-in');
      blurIO.unobserve(e.target);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });

  blurTargets.forEach(el => {
    el.classList.remove('reveal'); // the word animation replaces the site's fade-up for this heading
    splitWords(el);
    blurIO.observe(el);
  });

  /* ---------------- DecryptedText ----------------
   * Scrambles the label's characters, then reveals them left to right.
   * Screen readers get the real text through aria-label.
   */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+<>/=';
  const SPEED = 40;      // ms per frame
  const SCRAMBLE = 8;    // frames of pure noise before revealing starts

  const decrypt = el => {
    const text = el.textContent;
    const total = text.length;
    let frame = 0;
    const tick = () => {
      const revealed = Math.max(0, frame - SCRAMBLE);
      let out = '';
      for (let i = 0; i < total; i++) {
        const c = text[i];
        out += i < revealed || c === ' ' ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      frame++;
      if (revealed < total) setTimeout(tick, SPEED);
      else el.textContent = text;
    };
    tick();
  };

  const decIO = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      decIO.unobserve(e.target);
      decrypt(e.target);
    });
  }, { threshold: 0.6 });

  document.querySelectorAll('.eyebrow').forEach(el => {
    if (el.children.length) return; // only plain-text labels
    el.setAttribute('aria-label', el.textContent);
    el.style.minWidth = el.getBoundingClientRect().width + 'px'; // stop layout jitter while scrambling
    decIO.observe(el);
  });

  /* ---------------- ClickSpark ----------------
   * Draws a burst of lines from the click point on a full-screen canvas.
   */
  const SPARK = { count: 9, size: 12, radius: 34, width: 2, duration: 520 };
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const canvas = document.createElement('canvas');
  canvas.className = 'rb-spark-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let ratio = 1;
  const resize = () => {
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
  };
  resize();
  addEventListener('resize', resize, { passive: true });

  const bursts = [];
  let raf = 0;
  const draw = now => {
    raf = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = 'round';
    for (let b = bursts.length - 1; b >= 0; b--) {
      const burst = bursts[b];
      let alive = false;
      for (const s of burst.sparks) {
        const p = (now - burst.start) / (SPARK.duration * s.life);
        if (p >= 1) continue;
        alive = true;
        const dist = SPARK.radius * s.reach * easeOut(p);
        const len = SPARK.size * s.scale * Math.pow(1 - p, 1.6);
        const cos = Math.cos(s.angle), sin = Math.sin(s.angle);
        ctx.globalAlpha = 1 - smooth(0.55, 1, p);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = SPARK.width * s.scale;
        ctx.beginPath();
        ctx.moveTo(burst.x + cos * dist, burst.y + sin * dist);
        ctx.lineTo(burst.x + cos * (dist + len), burst.y + sin * (dist + len));
        ctx.stroke();
      }
      if (!alive) bursts.splice(b, 1);
    }
    ctx.globalAlpha = 1;
    if (bursts.length) raf = requestAnimationFrame(draw);
  };

  addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const offset = (Math.random() * BRAND.length) | 0;
    const step = (Math.PI * 2) / SPARK.count;
    bursts.push({
      x: e.clientX, y: e.clientY, start: performance.now(),
      sparks: Array.from({ length: SPARK.count }, (_, i) => ({
        angle: step * i + (Math.random() - 0.5) * 0.2 * step,
        reach: 1 + (Math.random() - 0.5) * 0.14,
        scale: 1 + (Math.random() - 0.5) * 0.16,
        life: 1 + (Math.random() - 0.5) * 0.1,
        color: BRAND[(i + offset) % BRAND.length]
      }))
    });
    if (bursts.length > 32) bursts.shift();
    if (!raf) raf = requestAnimationFrame(draw);
  }, { passive: true });
})();
