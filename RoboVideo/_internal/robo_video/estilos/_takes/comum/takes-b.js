/* Takes (grupo B) -- utilitários comuns. Funções puras de t, sem timers.
   Desfoque: a mídia é desenhada UMA vez (em montar) num canvas pequeno com
   ctx.filter blur e esticado por CSS -- nada de filter/backdrop-filter por quadro. */
window.TB = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fase = (t, a, d) => clamp((t - a) / Math.max(1, d), 0, 1);
  const suave = (x) => x * x * (3 - 2 * x);
  const sai = (x) => 1 - Math.pow(1 - x, 3);
  const saiExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
  const entra = (x) => x * x * x;
  const io = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerp = (a, b, k) => a + (b - a) * k;
  const f = (n, d = 3) => Number(n).toFixed(d);

  const txt = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const rot = (d, k) => String((d && d.rotulos && d.rotulos[k]) || '');
  function hash(s) {
    let h = 2166136261 >>> 0;
    for (const c of String(s || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h;
  }

  function rgb(cor, pad) {
    const s = String(cor || '').trim();
    let m = s.match(/^#([0-9a-f]{3})$/i);
    if (m) return m[1].split('').map((c) => parseInt(c + c, 16));
    m = s.match(/^#([0-9a-f]{6})/i);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (m) return [+m[1], +m[2], +m[3]];
    return pad || [11, 12, 16];
  }
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const luz = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

  /* aplica paleta/fontes do estilo do vídeo; devolve {fundo, acento, texto} em rgb */
  function tema(d) {
    const r = document.documentElement.style, e = (d && d.estilo) || {};
    const p = e.paleta || {}, fo = e.fontes || {};
    let fundo = rgb(p.fundo, [11, 12, 16]);
    // o take é sempre "noturno": fundo claro demais vira uma versão escura dele
    if (luz(fundo) > 0.35) fundo = fundo.map((v) => Math.round(v * 0.16));
    const acento = rgb(p.acento, [216, 178, 90]);
    const texto = rgb(p.texto, [244, 242, 238]);
    const textoOk = luz(texto) > 0.55 ? texto : [244, 242, 238];
    r.setProperty('--fundo', `rgb(${fundo.join(',')})`);
    r.setProperty('--acento', `rgb(${acento.join(',')})`);
    r.setProperty('--texto', `rgb(${textoOk.join(',')})`);
    r.setProperty('--suave', rgba(textoOk, 0.78));
    const ft = fo.titulo || "'Segoe UI Semibold', 'Segoe UI', sans-serif";
    r.setProperty('--fonte-titulo', ft);
    r.setProperty('--fonte-texto', fo.texto || "'Segoe UI', Arial, sans-serif");
    r.setProperty('--fonte-rotulo', fo.rotulo || fo.texto || "'Segoe UI Semibold', 'Segoe UI', sans-serif");
    const caixaAlta = /impact|arial black|bahnschrift|franklin/i.test(ft.split(',')[0]);
    r.setProperty('--titulo-caixa', caixaAlta ? 'uppercase' : 'none');
    return { fundo, acento, texto: textoOk, caixaAlta, serif: /georgia|cambria|palatino|times|serif'?\s*$/i.test(ft.split(',')[0]) };
  }

  function urls(d) {
    let u = (Array.isArray(d && d.midias) ? d.midias : []).filter((x) => typeof x === 'string' && x);
    if (!u.length && d && d.midia_url) u = [d.midia_url];
    return u;
  }

  function carregarUma(u) {
    return new Promise((ok) => {
      const im = new Image();
      im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => ok(im));
      im.onerror = () => ok(null);
      im.src = u;
    });
  }
  async function carregar(lista) {
    const ims = await Promise.all(lista.map(carregarUma));
    return ims.filter((im) => im && im.naturalWidth > 0);
  }

  /* recorte "cover" de (iw,ih) em (w,h), com foco fx/fy (0..1) */
  function cover(iw, ih, w, h, fx = 0.5, fy = 0.5) {
    const s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    return [(w - dw) * fx, (h - dh) * fy, dw, dh];
  }

  /* canvas w x h com a mídia desfocada (feito uma vez). raio em px do canvas. */
  function borrao(img, w, h, raio, o = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = o.cor || '#111';
    g.fillRect(0, 0, w, h);
    if (img) {
      const m = o.mf != null ? o.mf * w : raio * 3;
      // zoom > 1: recorte mais fechado (detalhe) em torno do foco fx/fy
      const z = Math.max(1, o.zoom || 1), W2 = w + 2 * m, H2 = h + 2 * m;
      const [, , dw, dh] = cover(img.naturalWidth, img.naturalHeight, W2 * z, H2 * z);
      const x = (W2 - dw) * (o.fx ?? 0.5), y = (H2 - dh) * (o.fy ?? 0.5);
      g.filter = `blur(${raio}px) saturate(${o.sat ?? 1.1}) brightness(${o.brilho ?? 1})`;
      g.drawImage(img, x - m, y - m, dw, dh);
      g.filter = 'none';
    }
    if (o.tinta) { g.fillStyle = o.tinta; g.fillRect(0, 0, w, h); }
    c.className = o.classe || 'borrao';
    return c;
  }
  function copia(src, classe) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    c.className = classe || src.className;
    return c;
  }

  /* Ken Burns: 0 zoom-in, 1 zoom-out, 2 pan p/ esquerda, 3 pan p/ direita.
     Devolve {s, x, y} (x,y em % do elemento, antes da escala). forca 0..1+ */
  function kb(t, dur, modo, forca = 1) {
    const k = lerp(fase(t, 0, dur), suave(fase(t, 0, dur)), 0.25);
    const z = 0.10 * forca;
    switch (((modo % 4) + 4) % 4) {
      case 0: return { s: 1.04 + z * k, x: (k - 0.5) * 1.2 * forca, y: (0.5 - k) * 0.8 * forca };
      case 1: return { s: 1.04 + z * (1 - k), x: (0.5 - k) * 1.2 * forca, y: (k - 0.5) * 0.6 * forca };
      case 2: return { s: 1.10 + 0.02 * forca, x: (0.5 - k) * 7 * forca, y: (k - 0.5) * 0.8 * forca };
      default: return { s: 1.10 + 0.02 * forca, x: (k - 0.5) * 7 * forca, y: (0.5 - k) * 0.8 * forca };
    }
  }
  const kbCss = (m) => `scale(${f(m.s, 4)}) translate(${f(m.x, 3)}%, ${f(m.y, 3)}%)`;

  /* alinha um canvas "fosco" (dentro de um painel em px,py da página) ao fundo
     que usa transform translate(tx,ty) scale(s) com origem no centro da tela */
  function alinhar(el, px, py, s, tx, ty) {
    el.style.transform = `translate(${f(960 + tx - px, 2)}px, ${f(540 + ty - py, 2)}px) scale(${f(s, 5)}) translate(-960px, -540px)`;
  }

  /* reduz a fonte até caber (quebra só entre palavras) */
  function caber(el, maxW, maxH, grande, pequeno, passo = 2) {
    el.style.maxWidth = maxW + 'px';
    let s = grande;
    for (; s > pequeno; s -= passo) {
      el.style.fontSize = s + 'px';
      const r = el.getBoundingClientRect();
      if (r.height <= maxH + 0.5 && el.scrollWidth <= maxW + 1) break;
    }
    el.style.fontSize = s + 'px';
    return s;
  }

  /* encurta frase longa numa pausa natural (nunca no meio da palavra) */
  function resumir(texto, maxPal) {
    const t = txt(texto);
    const ws = t.split(' ').filter(Boolean);
    if (ws.length <= maxPal) return t;
    const corte = ws.slice(0, maxPal).join(' ');
    const m = corte.match(/^(.*[,;:.!?—–])\s/);
    if (m && m[1].split(' ').length >= Math.max(5, maxPal * 0.45)) return m[1].replace(/[,;:—–]$/, '').trim() + (/[.!?]$/.test(m[1]) ? '' : '…');
    return corte.replace(/[,;:.—–]$/, '') + '…';
  }

  /* reorganiza o texto de el em linhas <span class="linha"><span>..</span></span>
     (medido no layout atual). Devolve os spans internos, 1 por linha. */
  function linhas(el) {
    const ws = txt(el.textContent).split(' ').filter(Boolean);
    el.innerHTML = '';
    const sp = ws.map((w, i) => {
      const s = document.createElement('span');
      s.textContent = w + (i < ws.length - 1 ? ' ' : '');
      el.appendChild(s);
      return s;
    });
    const grupos = [];
    let topo = null;
    sp.forEach((s) => {
      const y = Math.round(s.offsetTop);
      if (topo === null || Math.abs(y - topo) > 4) { grupos.push([]); topo = y; }
      grupos[grupos.length - 1].push(s.textContent);
    });
    el.innerHTML = '';
    return grupos.map((g) => {
      const l = document.createElement('span'); l.className = 'linha';
      const i = document.createElement('span'); i.textContent = g.join('').trim();
      l.appendChild(i); el.appendChild(l); return i;
    });
  }

  /* fim da peça: 0 durante, sobe até 1 nos últimos `ms` */
  const fim = (t, dur, ms = 420) => fase(t, dur - ms, ms);

  return { clamp, fase, suave, sai, saiExpo, entra, io, lerp, f, txt, rot, hash, rgb, rgba, luz, tema, urls,
           carregar, cover, borrao, copia, kb, kbCss, alinhar, caber, resumir, linhas, fim };
})();
