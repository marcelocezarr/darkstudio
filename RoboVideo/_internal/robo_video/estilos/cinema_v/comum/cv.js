/* Estilo Cinema (validado) -- utilitarios comuns (funcoes puras de t; nada de timers). */
window.CV = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fase = (t, a, d) => clamp((t - a) / Math.max(1, d), 0, 1);
  const suave = (x) => x * x * (3 - 2 * x);
  const sai = (x) => 1 - Math.pow(1 - x, 3);
  const io = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerp = (a, b, k) => a + (b - a) * k;

  /* envelope lento (entrada/saida em fade), escalado para pecas curtas */
  function envelope(t, dur, ent = 700, saida = 700) {
    const e = Math.min(ent, dur * 0.3), s = Math.min(saida, dur * 0.25);
    return suave(Math.min(fase(t, 0, e), fase(dur - t, 0, s)));
  }

  /* revelacao de texto como na referencia: sobe 14px e desfoca -> nitido */
  function revela(el, k, dy = 14, blur = 6) {
    el.style.opacity = String(k);
    el.style.transform = `translateY(${((1 - k) * dy).toFixed(2)}px)`;
    el.style.filter = k >= 0.999 ? 'none' : `blur(${((1 - k) * blur).toFixed(2)}px)`;
  }

  function tema(d) {
    const r = document.documentElement.style, e = (d && d.estilo) || {};
    const p = e.paleta || {}, f = e.fontes || {};
    r.setProperty('--texto', p.texto || '#f4efe4');
    r.setProperty('--acento', p.acento || '#c9a24e');
    r.setProperty('--acento-claro', p.acento_claro || '#e0b85c');
    r.setProperty('--fundo', p.fundo || '#131417');
    r.setProperty('--suave', p.suave || 'rgba(244,239,228,.78)');
    r.setProperty('--fonte-titulo', f.titulo || "'Sitka Banner', 'Sitka Display', Constantia, Georgia, serif");
    r.setProperty('--fonte-texto', f.texto || "'Sitka Heading', 'Sitka Text', Constantia, Georgia, serif");
    r.setProperty('--fonte-numero', f.numero || "'Sitka Banner', 'Sitka Display', Constantia, Georgia, serif");
    r.setProperty('--fonte-rotulo', f.rotulo || "'Segoe UI', 'Segoe UI Variable Text', Arial, sans-serif");
  }

  /* reduz a fonte ate caber em maxW x maxH (quebra entre palavras, nunca corta palavra) */
  function caber(el, maxW, maxH, grande, pequeno, passo = 2) {
    el.style.maxWidth = maxW + 'px';
    let s = grande;
    for (; s > pequeno; s -= passo) {
      el.style.fontSize = s + 'px';
      const r = el.getBoundingClientRect();
      if (r.height <= maxH + 0.5 && el.scrollWidth <= Math.ceil(r.width) + 1 && r.width <= maxW + 1) break;
    }
    el.style.fontSize = s + 'px';
    return s;
  }

  /* uma linha: reduz ate a largura caber */
  function caberLinha(el, maxW, grande, pequeno, passo = 2) {
    let s = grande;
    el.style.fontSize = s + 'px';
    while (s > pequeno && el.getBoundingClientRect().width > maxW) { s -= passo; el.style.fontSize = s + 'px'; }
    return s;
  }

  function romano(n) {
    n = Math.max(1, Math.min(3999, Math.round(Number(n) || 1)));
    const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
               [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
    return s;
  }

  const rot = (d, k) => String((d && d.rotulos && d.rotulos[k]) || '');
  const txt = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  function palavrasEm(el, texto, cls = 'w') {
    el.innerHTML = '';
    const ws = txt(texto).split(' ').filter(Boolean);
    return ws.map((w, i) => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = w;
      el.appendChild(s);
      if (i < ws.length - 1) el.appendChild(document.createTextNode(' '));
      return s;
    });
  }

  /* ms em que cada palavra e falada (alinha por texto; senao escalona) */
  function temposFala(palavrasTexto, falas, passo, limite) {
    const n = (s) => norm(s).replace(/ /g, '');
    const fs = Array.isArray(falas) ? falas : [];
    let j = 0, ultimo = 0;
    return palavrasTexto.map((w, i) => {
      const alvo = n(w);
      let v = null;
      for (let k = j; k < Math.min(fs.length, j + 4); k++) {
        if (n(fs[k].texto) === alvo && fs[k].ms != null) { j = k + 1; v = Number(fs[k].ms); break; }
      }
      if (v == null) v = i === 0 ? 0 : ultimo + passo;
      ultimo = Math.min(Math.max(ultimo, v), limite);
      return ultimo;
    });
  }

  return { clamp, fase, suave, sai, io, lerp, envelope, revela, tema, caber, caberLinha, romano, rot, txt, esc, norm,
           palavrasEm, temposFala };
})();
