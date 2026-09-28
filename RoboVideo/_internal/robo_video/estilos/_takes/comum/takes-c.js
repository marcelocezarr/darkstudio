/* Takes (lote C) -- utilitarios comuns: tema a partir da paleta do estilo do video,
   Ken Burns deterministico, recortes para repetir midias, ajuste de texto e revelacao
   por palavra. Tudo funcao pura de t (sem timers). */
window.TC = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const seg = (t, ini, dur) => clamp((t - ini) / Math.max(1, dur), 0, 1);
  const eo = (x) => 1 - Math.pow(1 - x, 3);
  const eo5 = (x) => 1 - Math.pow(1 - x, 5);
  const ei = (x) => x * x * x;
  const eio = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const sine = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
  const back = (x) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const f = (n, d = 3) => Number(n).toFixed(d);

  function hash(s) {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rnd(semente, i) { const x = Math.sin(hash(semente) * 0.0001 + (i + 1) * 12.9898) * 43758.5453; return x - Math.floor(x); }

  /* ---------------- cores ---------------- */
  function cor(s) {
    if (!s) return null;
    s = String(s).trim();
    let m = s.match(/^#([0-9a-f]{3,8})$/i);
    if (m) {
      let h = m[1];
      if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2]]; }
    return null;
  }
  const lum = (c) => {
    const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  };
  const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const css = (c, a = 1) => (a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);

  /* Deriva o tema neutro do take a partir de dados.estilo (fundo/texto/acento/fontes).
     Garante contraste: se o "texto" do estilo for escuro sobre fundo escuro (ex.: tinta
     sobre mesa), usa o papel/texto2 do estilo ou um marfim neutro. */
  function tema(d) {
    const pal = (d && d.estilo && d.estilo.paleta) || {}, fon = (d && d.estilo && d.estilo.fontes) || {};
    let bg = cor(pal.fundo) || [12, 12, 14];
    if (lum(bg) > 0.35) bg = mix(bg, [0, 0, 0], 0.82);          // take e sempre "noturno": fundo claro escurece
    const cands = [pal.texto, pal.papel, pal.texto2, pal.acento_claro].map(cor).filter(Boolean);
    let tx = cands.find((c) => contraste(c, bg) >= 7) || cands.find((c) => contraste(c, bg) >= 4.5);
    if (!tx) tx = [242, 239, 232];
    let ac = cor(pal.acento) || tx;
    for (let i = 0; i < 6 && contraste(ac, bg) < 3.2; i++) ac = mix(ac, [255, 255, 255], 0.18);
    const acTx = lum(ac) > 0.4 ? mix(bg, [0, 0, 0], 0.5) : [255, 255, 255];
    const r = document.documentElement.style;
    r.setProperty('--tc-bg', css(bg));
    r.setProperty('--tc-bg-claro', css(mix(bg, tx, 0.07)));
    r.setProperty('--tc-bg-escuro', css(mix(bg, [0, 0, 0], 0.55)));
    r.setProperty('--tc-sup', css(mix(bg, tx, 0.1)));
    r.setProperty('--tc-tx', css(tx));
    r.setProperty('--tc-tx2', css(tx, 0.72));
    r.setProperty('--tc-tx3', css(tx, 0.45));
    r.setProperty('--tc-linha', css(tx, 0.2));
    r.setProperty('--tc-ac', css(ac));
    r.setProperty('--tc-ac-suave', css(ac, 0.35));
    r.setProperty('--tc-ac-tx', css(acTx));
    r.setProperty('--tc-papel', css(cor(pal.papel) && lum(cor(pal.papel)) > 0.55 ? mix(cor(pal.papel), [250, 249, 246], 0.45) : [243, 241, 236]));
    const ft = fon.titulo || "Georgia, 'Times New Roman', serif";
    r.setProperty('--tc-ft', ft);
    r.setProperty('--tc-fx', fon.texto || ft);
    r.setProperty('--tc-fr', fon.rotulo || fon.texto || ft);
    if (d && d.idioma) document.documentElement.lang = d.idioma;
    return { bg, tx, ac };
  }

  /* ---------------- dados ---------------- */
  const rot = (d, k) => String((d && d.rotulos && d.rotulos[k]) || '');
  const txt = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  function midias(d) {
    const l = [];
    if (d && Array.isArray(d.midias)) for (const m of d.midias) if (m && !l.includes(m)) l.push(m);
    if (d && d.midia_url && !l.includes(d.midia_url)) l.unshift(d.midia_url);
    return l;
  }
  /* n slots a partir de 1..N midias: repete com RECORTES diferentes (origem + zoom base) */
  const RECORTES = [
    { ox: 50, oy: 50, z: 1.0 }, { ox: 70, oy: 45, z: 1.6 }, { ox: 30, oy: 60, z: 1.55 },
    { ox: 55, oy: 30, z: 1.75 }, { ox: 20, oy: 70, z: 1.7 }, { ox: 82, oy: 35, z: 1.8 },
  ];
  function slots(d, n) {
    const l = midias(d), out = [];
    for (let i = 0; i < n; i++) {
      if (!l.length) { out.push({ url: '', rec: RECORTES[0], rep: 0 }); continue; }
      const rep = Math.floor(i / l.length);
      const rec = rep === 0 ? RECORTES[0] : RECORTES[1 + ((rep - 1) * l.length + (i % l.length)) % (RECORTES.length - 1)];
      out.push({ url: l[i % l.length], rec, rep });
    }
    return out;
  }

  /* ---------------- midia com Ken Burns ---------------- */
  // cria <div class="tc-mid"><img></div>; sem url -> gradiente neutro (nunca quebra)
  function criarMidia(pai, slot, cls) {
    const box = document.createElement('div');
    box.className = 'tc-mid' + (cls ? ' ' + cls : '');
    const img = document.createElement('img');
    img.alt = '';
    if (slot && slot.url) img.src = slot.url; else { img.style.display = 'none'; box.classList.add('tc-vazio'); }
    box.appendChild(img);
    pai.appendChild(box);
    box._img = img;
    box._rec = (slot && slot.rec) || RECORTES[0];
    img.style.transformOrigin = `${box._rec.ox}% ${box._rec.oy}%`;
    return box;
  }
  const MOVS = ['zin', 'pand', 'zout', 'pane'];
  /* k = 0..1 do take inteiro; mov = zin|zout|pane|pand; amp = intensidade */
  function kb(box, k, mov, amp = 1) {
    const z0 = box._rec.z;
    const u = lerp(0.0, 1.0, clamp(k, 0, 1));
    let s = 1, x = 0, y = 0;
    if (mov === 'zin') s = 1.03 + 0.09 * amp * u;
    else if (mov === 'zout') s = 1.12 * (1 + 0.0) - 0.09 * amp * u;
    else { s = 1.1; x = (mov === 'pane' ? 1 : -1) * (u - 0.5) * 5.2 * amp; y = (u - 0.5) * -1.2 * amp; }
    box._img.style.transform = `scale(${f(s * z0, 4)}) translate(${f(x, 3)}%, ${f(y, 3)}%)`;
  }

  /* ---------------- texto ---------------- */
  function caber(el, maxPx, minPx, alturaMax, larguraMax) {
    const L = larguraMax || el.clientWidth;
    el.style.overflowWrap = 'normal';
    for (let fs = maxPx; fs >= minPx; fs -= 2) {
      el.style.fontSize = fs + 'px';
      if (el.scrollHeight <= alturaMax + 1 && el.scrollWidth <= L + 1) return fs;
    }
    el.style.fontSize = minPx + 'px';
    el.style.overflowWrap = 'break-word';
    return minPx;
  }
  /* caber + ultimo recurso: corta em FIM de palavra com reticencias (nunca no meio) */
  function caberTexto(el, texto, maxPx, minPx, alturaMax) {
    el.textContent = texto;
    const fs = caber(el, maxPx, minPx, alturaMax);
    if (el.scrollHeight > alturaMax + 1) {
      const ps = texto.split(' ');
      let n = ps.length;
      while (n > 2 && el.scrollHeight > alturaMax + 1) { n--; el.textContent = ps.slice(0, n).join(' ').replace(/[,;:.\-–—]+$/, '') + '…'; }
    }
    return { fs, texto: el.textContent };
  }
  /* separa em <span> por palavra (para revelar) */
  function palavras(el) {
    const ws = el.textContent.split(' ').filter(Boolean);
    el.textContent = '';
    const spans = ws.map((w, i) => {
      const s = document.createElement('span'); s.className = 'tc-w'; s.textContent = w;
      el.appendChild(s); if (i < ws.length - 1) el.appendChild(document.createTextNode(' '));
      return s;
    });
    el._ws = spans;
    return spans;
  }
  function revelar(el, t, ini, durTotal, durPal = 260) {
    const ws = el._ws || [];
    const passo = ws.length > 1 ? Math.max(0, (durTotal - durPal) / (ws.length - 1)) : 0;
    for (let i = 0; i < ws.length; i++) {
      const k = eo(seg(t, ini + i * passo, durPal));
      const s = ws[i];
      const o = f(k, 3);
      if (s._o !== o) { s._o = o; s.style.opacity = o; s.style.transform = `translateY(${f((1 - k) * 0.35, 3)}em)`; }
    }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* traco SVG: revela por stroke-dashoffset */
  function tracar(p, k) {
    if (!p._L) { p._L = (p.getTotalLength ? p.getTotalLength() : 1000) + 2; p.style.strokeDasharray = p._L + ' ' + p._L; }
    p.style.strokeDashoffset = String(p._L * (1 - clamp(k, 0, 1)));
    p.style.visibility = k <= 0 ? 'hidden' : 'visible';
  }

  /* grao fino neutro (tile 192px, gerado 1x) -> var(--tc-grao) */
  function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  function grao(alfa = 0.05, escuro = false) {
    const N = 192, c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), r = lcg(31);
    for (let i = 0; i < N * N; i++) {
      const v = r();
      const a = Math.round(Math.abs(v - 0.5) * 2 * alfa * 255);
      const g = escuro ? 0 : (v > 0.5 ? 255 : 0);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g; img.data[i * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    return 'url(' + c.toDataURL('image/png') + ')';
  }

  return { clamp, seg, eo, eo5, ei, eio, sine, back, lerp, f, hash, rnd, cor, lum, contraste, mix, css, tema, rot, txt,
           midias, slots, RECORTES, criarMidia, MOVS, kb, caber, caberTexto, palavras, revelar, esc, tracar, grao, lcg };
})();
