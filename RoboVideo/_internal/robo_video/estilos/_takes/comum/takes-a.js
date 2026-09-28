/* Takes (conjunto A) -- utilitarios puros (sem timers). Usado por take-encaixe-quadros,
   take-arquivo-fotogramas, take-sequencia-alternada, take-painel-direita/esquerda. */
window.TKA = (() => {
  const A = {};
  A.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  A.fase = (t, ini, dur) => (dur <= 0 ? (t >= ini ? 1 : 0) : A.clamp((t - ini) / dur));
  A.lin = (t, a, b) => A.fase(t, a, b - a);
  A.sai = (x) => 1 - Math.pow(1 - x, 3);
  A.expo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
  A.io = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  A.suave = (x) => x * x * (3 - 2 * x);
  A.mix = (a, b, k) => a + (b - a) * k;
  A.f = (x, n = 3) => Number(x).toFixed(n);
  A.hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  A.txt = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  /* ---------- cores ---------- */
  const cv = document.createElement('canvas').getContext('2d');
  A.rgb = (c) => {
    cv.fillStyle = '#000'; cv.fillStyle = String(c || '#000');
    const v = cv.fillStyle;
    if (v[0] === '#') return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    const m = (v.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
    const al = m.length > 3 ? m[3] : 1;           // cor com alfa: compoe sobre preto
    return [m[0] * al, m[1] * al, m[2] * al];
  };
  A.lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  A.contraste = (a, b) => { const l1 = A.lum(a), l2 = A.lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  A.misturar = (a, b, k) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);
  A.css = (c, al = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${al})`;

  /* aplica a paleta/fontes do estilo do video (com correcao de contraste) */
  A.tema = function (d) {
    const e = (d && d.estilo) || {}, p = e.paleta || {};
    let f = e.fontes || {};
    if (Array.isArray(f)) f = { titulo: f[0], texto: f[1] || f[0] };
    const fundo = A.rgb(p.fundo || '#0b0b0f');
    const escuro = A.lum(fundo) < 0.2;
    let texto = null;
    for (const c of [p.texto, p.papel, p.texto2, escuro ? '#f4f1ea' : '#15130f']) {
      if (!c) continue;
      const k = A.rgb(c);
      if (A.contraste(k, fundo) >= 4.5) { texto = k; break; }
    }
    texto = texto || (escuro ? [244, 241, 234] : [21, 19, 15]);
    let acento = A.rgb(p.acento || '#d9b36c');
    if (A.contraste(acento, fundo) < 2.2) acento = A.misturar(acento, escuro ? [255, 255, 255] : [0, 0, 0], 0.45);
    const tintaAc = A.contraste([12, 12, 12], acento) >= A.contraste([255, 255, 255], acento) ? [12, 12, 12] : [255, 255, 255];
    const r = document.documentElement.style;
    r.setProperty('--fundo', A.css(fundo));
    r.setProperty('--fundo2', A.css(A.misturar(fundo, escuro ? [255, 255, 255] : [0, 0, 0], 0.07)));
    r.setProperty('--fundo3', A.css(A.misturar(fundo, escuro ? [255, 255, 255] : [0, 0, 0], 0.14)));
    r.setProperty('--fundo-escuro', A.css(A.misturar(fundo, [0, 0, 0], 0.45)));
    r.setProperty('--fundo-a0', A.css(fundo, 0));
    r.setProperty('--fundo-a6', A.css(fundo, 0.6));
    r.setProperty('--fundo-a9', A.css(fundo, 0.92));
    r.setProperty('--texto', A.css(texto));
    r.setProperty('--suave', A.css(texto, 0.78));
    r.setProperty('--fraco', A.css(texto, 0.14));
    r.setProperty('--acento', A.css(acento));
    r.setProperty('--acento-a3', A.css(acento, 0.3));
    r.setProperty('--acento-a1', A.css(acento, 0.12));
    r.setProperty('--tinta-acento', A.css(tintaAc));
    r.setProperty('--fonte-titulo', f.titulo || "Georgia, 'Palatino Linotype', serif");
    r.setProperty('--fonte-texto', f.texto || "'Segoe UI', Arial, sans-serif");
    A.escuro = escuro;
    A.cores = { fundo, texto, acento };
  };

  /* ---------- midias ---------- */
  A.urls = (d) => {
    let u = (Array.isArray(d.midias) ? d.midias : []).filter(Boolean);
    if (!u.length && d.midia_url) u = [d.midia_url];
    return [...new Set(u)];
  };
  /* n espacos: repete as midias, cada repeticao com recorte diferente */
  A.slots = (urls, n, ini = 0) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const j = i + ini;
      out.push({ url: urls.length ? urls[j % urls.length] : '', rep: urls.length ? Math.floor(j / urls.length) : 0, i: j });
    }
    return out;
  };
  const POS = ['50% 50%', '24% 40%', '76% 60%', '38% 72%', '64% 28%', '50% 30%'];
  const MODOS = ['in', 'pr', 'out', 'pl'];
  /* cria a caixa de midia; modo de Ken Burns em rodizio (nunca igual ao vizinho) */
  A.midia = function (slot, idx, sem = 0, classe = '') {
    const box = document.createElement('div');
    box.className = 'tka-m' + (classe ? ' ' + classe : '');
    if (slot.url) {
      const im = document.createElement('img');
      im.src = slot.url; im.alt = '';
      if (slot.rep) { const po = POS[(slot.rep * 2 + slot.i) % POS.length + 0] === '50% 50%' ? POS[1] : POS[(slot.rep * 2 + slot.i) % POS.length]; im.style.objectPosition = po; im.style.transformOrigin = po; }
      box.appendChild(im);
      box._img = im;
    }
    box._kb = { modo: MODOS[(idx + sem) % 4], base: 1 + 0.32 * Math.min(slot.rep, 2) };
    return box;
  };
  /* Ken Burns suave: k 0..1 (linear no tempo total da peca) */
  A.kb = function (box, k, forca = 1) {
    const im = box._img;
    if (!im) return;
    const { modo, base } = box._kb;
    let s = base, x = 0, y = 0;
    if (modo === 'in') s *= 1.04 + 0.1 * forca * k;
    else if (modo === 'out') s *= 1.14 - 0.1 * forca * k;
    else { s *= 1.12; x = (modo === 'pl' ? 1 : -1) * (k - 0.5) * 5 * forca; y = (k - 0.5) * 1.2 * forca; }
    im.style.transform = `translate(${A.f(x)}%,${A.f(y)}%) scale(${A.f(s, 4)})`;
  };

  /* ---------- texto ---------- */
  /* cabe o texto em w x h reduzindo a fonte (max..min); se ainda nao couber, corta PALAVRAS
     inteiras (de preferencia numa pausa) e poe reticencias. Devolve o tamanho usado. */
  A.caber = function (el, texto, w, h, max, min) {
    texto = A.txt(texto);
    el.style.width = w + 'px';
    el.style.height = 'auto';
    const cabe = (fs) => { el.style.fontSize = fs + 'px'; const r = el.getBoundingClientRect(); return r.height <= h + 0.5 && el.scrollWidth <= w + 1; };
    el.textContent = texto;
    // titulo curto: prefere UMA linha (sem quebrar "A / rivalidade") se couber grande o bastante
    const umaLinha = (fs) => { el.style.fontSize = fs + 'px'; el.style.whiteSpace = 'nowrap'; const ok = el.scrollWidth <= w + 1 && el.getBoundingClientRect().height <= h + 0.5; el.style.whiteSpace = ''; return ok; };
    if (!umaLinha(max)) {
      for (let fs = max - 2; fs >= Math.max(min, Math.round(max * 0.74)); fs -= 2) {
        if (umaLinha(fs)) { el.style.fontSize = fs + 'px'; el.style.whiteSpace = 'nowrap'; return fs; }
      }
    }
    if (cabe(max)) return max;
    if (cabe(min)) {
      let lo = min, hi = max;
      while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (cabe(m)) lo = m; else hi = m; }
      cabe(lo);
      return lo;
    }
    const ws = texto.split(' ');
    while (ws.length > 2) {
      ws.pop();
      let s = ws.join(' ');
      const m = s.match(/^(.{12,}[,;:.!?])\s[^,;:.!?]*$/);
      if (m && m[1].split(' ').length >= Math.max(3, ws.length * 0.6)) s = m[1];
      el.textContent = s.replace(/[\s,;:\-–—]+$/, '') + (/[.!?]$/.test(s) ? '' : '…');
      if (cabe(min)) return min;
    }
    return min;
  };

  /* revela um bloco de texto de baixo para cima (mascara) */
  A.revela = function (el, k, dist = 26) {
    el.style.opacity = A.f(A.clamp(k * 1.6));
    el.style.transform = `translateY(${A.f((1 - k) * dist, 2)}px)`;
    el.style.clipPath = `inset(0 -40px ${A.f((1 - k) * 100, 2)}% -40px)`;
  };

  /* ---------- painel lateral (painel-direita / painel-esquerda) ---------- */
  A.painel = function (lado) {
    const dir = lado === 'esquerda' ? -1 : 1;   // 1 = midia na direita
    const $ = (id) => document.getElementById(id);
    let DUR = 4500, temTexto = false, mp, sec = null, eco = null, R = null;
    const esp = (x, w) => (dir > 0 ? x : 1920 - x - w);   // espelha coordenada x

    window.montar = function (d) {
      d = d || {};
      A.tema(d);
      DUR = Math.max(1500, d.dur_ms || 4500);
      const urls = A.urls(d);
      const tit = A.txt(d.titulo), frase = A.txt(d.texto);
      temTexto = !!(tit || frase);
      const sem = A.hash(urls[0] || 'x') % 4;
      const [s0, s1, s2] = A.slots(urls, 3);
      const W = temTexto ? 1060 : 1300, H = 888, X = esp(1920 - 96 - W, W), Y = 96;
      R = { X, Y, W, H };
      // eco: outro recorte em tela cheia, bem apagado (textura/cor do tema)
      eco = A.midia(s2, 2, sem, 'eco');
      Object.assign(eco.style, { left: '0px', top: '0px', width: '1920px', height: '1080px' });
      $('palco').appendChild(eco);
      const ecoV = document.createElement('div'); ecoV.id = 'ecov'; $('palco').appendChild(ecoV);
      // moldura deslocada (acento) atras do painel
      const mol = $('mol');
      Object.assign(mol.style, { left: (X - dir * 26) + 'px', top: (Y + 26) + 'px', width: W + 'px', height: H + 'px' });
      $('palco').appendChild(mol);
      mp = A.midia(s0, 0, sem, 'principal');
      Object.assign(mp.style, { left: X + 'px', top: Y + 'px', width: W + 'px', height: H + 'px' });
      $('palco').appendChild(mp);
      if (!temTexto) {
        const sw = 1920 - 96 - W - 96 - 56;
        sec = A.midia(s1, 1, sem, 'secundaria');
        Object.assign(sec.style, { left: esp(96, sw) + 'px', top: (Y + 150) + 'px', width: sw + 'px', height: (H - 150) + 'px' });
        $('palco').appendChild(sec);
      }
      const cw = 1920 - W - 96 - 150 - 110;
      const col = $('col');
      Object.assign(col.style, { left: esp(150, cw) + 'px', width: cw + 'px', display: temTexto ? '' : 'none' });
      if (dir < 0) col.style.alignItems = 'flex-start';
      if (temTexto) {
        const et = $('tit'), ef = $('frase');
        if (tit) A.caber(et, tit, cw, frase ? 430 : 600, frase ? 96 : 110, 46); else et.style.display = 'none';
        if (frase) {
          const usado = tit ? et.getBoundingClientRect().height : 0;
          if (!tit) ef.classList.add('so-frase');
          A.caber(ef, frase, cw, Math.max(170, 700 - usado - 90), tit ? 38 : 64, tit ? 25 : 34);
        } else ef.style.display = 'none';
        $('sep').style.display = tit && frase ? '' : 'none';
      }
      window.eventos = [{ evento: 'take.entra', ms: 0 }, { evento: 'painel.abre', ms: 140 }];
    };

    window.quadro = function (t) {
      const S = DUR - t;
      const kb = A.fase(t, 0, DUR);
      // painel abre de dentro para fora (janela) + midia com contra-movimento
      const kIn = A.io(A.fase(t, 120, 1100));
      const ab = (1 - kIn) * 100;
      mp.style.clipPath = dir > 0 ? `inset(0 0 0 ${A.f(ab, 2)}%)` : `inset(0 ${A.f(ab, 2)}% 0 0)`;
      A.kb(mp, kb);
      if (mp._img) mp._img.style.transform = `translateX(${A.f(dir * (1 - kIn) * 8, 3)}%) ` + mp._img.style.transform;
      // moldura de acento desliza para o lugar
      const km = A.expo(A.fase(t, 320, 900));
      const mol = $('mol');
      mol.style.opacity = A.f(A.clamp(km * 2));
      mol.style.transform = `translate(${A.f(dir * (1 - km) * 26, 2)}px, ${A.f(-(1 - km) * 26, 2)}px)`;
      eco.style.opacity = A.f(0.2 * A.sai(A.fase(t, 0, 900)));
      A.kb(eco, 1 - kb, 0.6);
      if (sec) {
        const ks = A.expo(A.fase(t, 380, 900));
        sec.style.clipPath = `inset(${A.f((1 - ks) * 100, 2)}% 0 0 0)`;
        A.kb(sec, kb);
      }
      if (temTexto) {
        A.revela($('tit'), A.sai(A.fase(t, 420, 700)), 34);
        $('sep').style.transform = `scaleX(${A.f(A.io(A.fase(t, 640, 600)))})`;
        A.revela($('frase'), A.sai(A.fase(t, 760, 700)), 22);
        $('col').style.opacity = A.f(A.suave(A.fase(S, 0, 380)));
      }
    };
  };

  return A;
})();
