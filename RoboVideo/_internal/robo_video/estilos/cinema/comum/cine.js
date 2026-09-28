/* Estilo Cinema -- utilitarios comuns (funcoes puras; nada de timers). */
window.CINE = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fase = (t, a, d) => clamp((t - a) / Math.max(1, d), 0, 1);
  const suave = (x) => x * x * (3 - 2 * x);                       // smoothstep
  const sai = (x) => 1 - Math.pow(1 - x, 3);                      // ease-out cubic
  const io = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerp = (a, b, k) => a + (b - a) * k;

  /* envelope de entrada/saida lento (fades cinematograficos), escalado p/ pecas curtas */
  function envelope(t, dur, ent = 700, saida = 600) {
    const e = Math.min(ent, dur * 0.3), s = Math.min(saida, dur * 0.25);
    return suave(Math.min(fase(t, 0, e), fase(dur - t, 0, s)));
  }

  function tema(d) {
    const r = document.documentElement.style, e = (d && d.estilo) || {};
    const p = e.paleta || {}, f = e.fontes || {};
    r.setProperty('--texto', p.texto || '#f3eee2');
    r.setProperty('--acento', p.acento || '#c9a45c');
    r.setProperty('--acento-claro', p.acento_claro || '#e2c894');
    r.setProperty('--fundo', p.fundo || '#08080a');
    r.setProperty('--suave', p.suave || 'rgba(243,238,226,.74)');
    r.setProperty('--fonte-titulo', f.titulo || "'Cine Digitos', Georgia, 'Palatino Linotype', serif");
    r.setProperty('--fonte-texto', f.texto || "Cambria, Georgia, serif");
    r.setProperty('--fonte-numero', f.numero || "Cambria, 'Palatino Linotype', serif");
    r.setProperty('--fonte-rotulo', f.rotulo || "'Palatino Linotype', 'Book Antiqua', Georgia, serif");
  }

  /* reduz a fonte ate o bloco caber em maxW x maxH (quebra linha entre palavras,
     nunca corta palavra). Devolve o tamanho usado. */
  function caber(el, maxW, maxH, grande, pequeno, passo = 2) {
    el.style.width = 'auto';
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

  /* divide o texto em <span class="w"> por palavra (para revelar/destacar) */
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

  /* ms em que cada palavra e falada, alinhado por texto quando possivel;
     senao escalonado. limite = teto do ms (para tudo entrar a tempo). */
  function temposFala(palavrasTexto, falas, passo, limite) {
    const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '');
    const fs = Array.isArray(falas) ? falas : [];
    let j = 0, ultimo = 0;
    return palavrasTexto.map((w, i) => {
      const alvo = norm(w);
      let v = null;
      for (let k = j; k < Math.min(fs.length, j + 4); k++) {
        if (norm(fs[k].texto) === alvo && fs[k].ms != null) { j = k + 1; v = Number(fs[k].ms); break; }
      }
      if (v == null) v = i === 0 ? 0 : ultimo + passo;
      ultimo = Math.min(Math.max(ultimo, v), limite);
      return ultimo;
    });
  }

  return { clamp, fase, suave, sai, io, lerp, envelope, tema, caber, romano, rot, txt, palavrasEm, temposFala };
})();
