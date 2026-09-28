/* Dossie -- utilitarios comuns das pecas. Tudo funcao pura de t (sem timers). */
window.DZ = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const seg = (t, ini, dur) => clamp((t - ini) / Math.max(1, dur), 0, 1);
  const eo = (x) => 1 - Math.pow(1 - x, 3);
  const eio = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const back = (x) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const lerp = (a, b, k) => a + (b - a) * k;

  function hash(s) {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // numero pseudo-aleatorio deterministico em [0,1) a partir de (semente, i)
  function rnd(semente, i) { const x = Math.sin(hash(semente) * 0.0001 + (i + 1) * 12.9898) * 43758.5453; return x - Math.floor(x); }

  function aplicarEstilo(d) {
    const pal = (d.estilo && d.estilo.paleta) || {}, fon = (d.estilo && d.estilo.fontes) || {};
    const r = document.documentElement.style;
    const mapa = { papel: '--papel', papel_escuro: '--papel-escuro', kraft: '--kraft', tinta: '--tinta',
                   acento: '--vermelho', fita: '--fita', fundo: '--mesa' };
    for (const k in mapa) if (pal[k]) r.setProperty(mapa[k], pal[k]);
    if (fon.titulo) r.setProperty('--f-titulo', fon.titulo);
    if (fon.texto) r.setProperty('--f-maquina', fon.texto);
    if (fon.serif) r.setProperty('--f-serif', fon.serif);
    if (d.idioma) document.documentElement.lang = d.idioma;
  }
  // rotulo fixo (i18n). Nunca ha texto fixo no template: sem rotulo -> ''.
  const rot = (d, k) => String((d.rotulos && d.rotulos[k]) || '');
  const txt = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  // reduz a fonte ate caber em (largura do proprio elemento) x alturaMax
  function caber(el, maxPx, minPx, alturaMax) {
    el.style.overflowWrap = 'normal';
    let fs = maxPx;
    for (; fs >= minPx; fs -= 2) {
      el.style.fontSize = fs + 'px';
      if (el.scrollHeight <= alturaMax + 1 && el.scrollWidth <= el.clientWidth + 1) return fs;
    }
    el.style.fontSize = minPx + 'px';
    el.style.overflowWrap = 'break-word';  // ultimo recurso: palavra gigante quebra (nunca corta)
    return minPx;
  }
  // reduz a fonte de um texto de UMA linha ate caber na largura
  function caberLinha(el, maxPx, minPx, largura) {
    el.style.whiteSpace = 'nowrap';
    let fs = maxPx;
    for (; fs >= minPx; fs -= 2) {
      el.style.fontSize = fs + 'px';
      if (el.scrollWidth <= largura + 1) return fs;
    }
    el.style.whiteSpace = 'normal';
    el.style.fontSize = minPx + 'px';
    return minPx;
  }

  // maquina de escrever: el recebe [visivel][cursor][oculto] -- layout nao pula
  function prepararDatilo(el, texto) {
    el.textContent = '';
    const v = document.createElement('span'), c = document.createElement('span'), o = document.createElement('span');
    c.className = 'cursor'; o.className = 'oculto';
    el.append(v, c, o);
    o.textContent = texto;  // tudo oculto: o layout final ja existe (medicoes em montar ficam certas)
    el._dz = { texto: Array.from(texto), v, c, o, n: 0 };
  }
  function datilo(el, k, comCursor = true) {
    const z = el._dz; if (!z) return 0;
    const n = Math.round(clamp(k, 0, 1) * z.texto.length);
    if (n !== z.n) { z.v.textContent = z.texto.slice(0, n).join(''); z.o.textContent = z.texto.slice(n).join(''); z.n = n; }
    z.c.style.display = comCursor && k > 0 && k < 1 ? 'inline-block' : 'none';
    return n;
  }

  // traco de caneta: revela um <path> por stroke-dashoffset (k 0..1)
  function tracar(p, k) {
    if (!p._L) { p._L = p.getTotalLength() + 2; p.style.strokeDasharray = p._L + ' ' + p._L; }
    p.style.strokeDashoffset = String(p._L * (1 - clamp(k, 0, 1)));
    p.style.visibility = k <= 0 ? 'hidden' : 'visible';
  }
  // circulo feito a mao (1,12 volta, raio levemente irregular)
  function circuloMao(cx, cy, rx, ry, semente) {
    const a0 = -2.2 + rnd(semente, 1) * 0.6, voltas = 1.12, N = 72, pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = a0 + u * Math.PI * 2 * voltas;
      const w = 1 + 0.035 * Math.sin(3 * a + rnd(semente, 2) * 6) + 0.05 * u;
      pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
    }
    return 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  }
  // sublinhado a mao (leve curva)
  function sublinhadoMao(x0, x1, y, semente) {
    const dy = (rnd(semente, 3) - .5) * 10, N = 16, pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push([x0 + (x1 - x0) * u, y + dy * u + Math.sin(u * Math.PI) * -5 + Math.sin(u * 9 + rnd(semente, 4) * 6) * 1.4]);
    }
    return 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  }
  // visto (check) a mao
  function vistoMao(x, y, s) { return `M${x} ${y + s * .45} L${x + s * .35} ${y + s * .85} L${x + s} ${y - s * .1}`; }

  // entrada/saida padrao (k de 0..1 e 1..0)
  function envelope(t, dur, ent = 380, sai = 320) { return { ent: seg(t, 0, ent), sai: 1 - seg(t, dur - sai, sai) }; }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  return { clamp, seg, eo, eio, back, lerp, hash, rnd, aplicarEstilo, rot, txt, caber, caberLinha, prepararDatilo,
           datilo, tracar, circuloMao, sublinhadoMao, vistoMao, envelope, esc };
})();

/* Texturas geradas em canvas uma unica vez ao carregar (PNG em memoria): papel, mascara
   de carimbo gasto e veio de madeira da mesa. Bitmaps sao muito mais baratos por quadro
   que filtros SVG (feTurbulence). Deterministico (LCG com semente fixa). */
(() => {
  function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  // value noise periodico (tile sem emenda) com oitavas
  function ruido(w, h, cel, oit, seed) {
    const r = lcg(seed), out = new Float32Array(w * h);
    let amp = 1, tot = 0;
    for (let o = 0; o < oit; o++) {
      const gx = Math.max(1, Math.round(w / cel)), gy = Math.max(1, Math.round(h / cel));
      const g = new Float32Array(gx * gy).map(() => r());
      for (let y = 0; y < h; y++) {
        const fy = y / h * gy, y0 = Math.floor(fy), ty = fy - y0, y1 = (y0 + 1) % gy, sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < w; x++) {
          const fx = x / w * gx, x0 = Math.floor(fx), tx = fx - x0, x1 = (x0 + 1) % gx, sx = tx * tx * (3 - 2 * tx);
          const a = g[y0 * gx + x0], b = g[y0 * gx + x1], c = g[y1 * gx + x0], d = g[y1 * gx + x1];
          out[y * w + x] += amp * ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy);
        }
      }
      tot += amp; amp *= 0.5; cel = Math.max(1, cel / 2);
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }
  function png(w, h, pinta) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
    pinta(img.data);
    ctx.putImageData(img, 0, 0);
    return 'url(' + c.toDataURL('image/png') + ')';
  }
  const r = document.documentElement.style;
  // papel: fibras finas + manchas suaves (marrom com alfa baixo)
  const P = 256, nP = ruido(P, P, 64, 4, 7), gr = lcg(99);
  r.setProperty('--ruido', png(P, P, (px) => {
    for (let i = 0; i < P * P; i++) {
      const a = Math.round((Math.max(0, (nP[i] - 0.47)) * 0.24 + gr() * 0.05) * 64) / 64;
      px[i * 4] = 92; px[i * 4 + 1] = 66; px[i * 4 + 2] = 34; px[i * 4 + 3] = Math.round(Math.min(1, a) * 255);
    }
  }));
  // carimbo: tinta quase cheia com falhas (buracos) e pontilhado
  const C = 256, nC = ruido(C, C, 48, 4, 11), cr = lcg(5);
  r.setProperty('--gasto', png(C, C, (px) => {
    for (let i = 0; i < C * C; i++) {
      let a = (nC[i] - 0.21) / 0.08;               // < 0.21 vira falha
      a = Math.max(0, Math.min(1, a)) * (cr() < 0.05 ? 0.5 : 1);
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 0; px[i * 4 + 3] = Math.round(a * 255);
    }
  }));
  // mesa: veio de madeira (ruido esticado na horizontal)
  const MW = 512, MH = 256, NW = 64, nM = ruido(NW, MH, 16, 3, 4);
  r.setProperty('--madeira', png(MW, MH, (px) => {
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const fx = x / 8, c0 = Math.floor(fx) % NW, c1 = (c0 + 1) % NW, tx = fx - Math.floor(fx);
      const i = y * MW + x, v = nM[y * NW + c0] * (1 - tx) + nM[y * NW + c1] * tx;
      const veio = 0.5 + 0.5 * Math.sin((y / MH) * 6 * Math.PI * 2 / 3 + v * 7);
      px[i * 4] = 70 + veio * 34; px[i * 4 + 1] = 46 + veio * 22; px[i * 4 + 2] = 28 + veio * 12; px[i * 4 + 3] = 140;
    }
  }));
})();
