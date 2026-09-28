/* Estilo Classico (validado) -- utilitarios comuns (funcoes puras; nada de timers). */
window.CLS = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fase = (t, a, d) => clamp((t - a) / Math.max(1, d), 0, 1);
  const suave = (x) => x * x * (3 - 2 * x);
  const sai = (x) => 1 - Math.pow(1 - x, 3);

  /* fade simples de entrada/saida (a referencia so faz fade, sem deslizar) */
  function envelope(t, dur, ent = 350, saida = 350) {
    const e = Math.min(ent, dur * 0.25), s = Math.min(saida, dur * 0.25);
    return suave(Math.min(fase(t, 0, e), fase(dur - t, 0, s)));
  }

  /* fade LINEAR (medido na referencia: o selo e a palavra entram/saem com rampa linear de ~400 ms) */
  function linear(t, dur, ent = 400, saida = 400) {
    const e = Math.min(ent, dur * 0.25), s = Math.min(saida, dur * 0.25);
    return Math.min(fase(t, 0, e), fase(dur - t, 0, s));
  }

  function tema(d) {
    const r = document.documentElement.style, e = (d && d.estilo) || {};
    const p = e.paleta || {}, f = e.fontes || {};
    if (p.texto) r.setProperty('--texto', p.texto);
    if (p.acento) r.setProperty('--acento', p.acento);
    if (p.caixa) r.setProperty('--caixa', p.caixa);
    if (p.sombra) r.setProperty('--sombra', p.sombra);
    if (f.titulo) r.setProperty('--fonte-titulo', f.titulo);
    if (f.texto) r.setProperty('--fonte-texto', f.texto);
  }

  const txt = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* reduz a fonte ate caber em maxW x maxH (quebra entre palavras; nunca corta palavra) */
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

  function rot(d, chave, padrao) {
    const r = (d && d.rotulos) || {};
    return txt(r[chave] || padrao || '');
  }

  return { clamp, fase, suave, sai, envelope, linear, tema, txt, esc, caber, rot };
})();
