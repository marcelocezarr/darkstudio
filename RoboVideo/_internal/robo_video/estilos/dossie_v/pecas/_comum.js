/* Dossie (validado) -- utilitarios comuns. Tudo funcao pura de t (sem timers). */
window.DV = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const seg = (t, ini, dur) => clamp((t - ini) / Math.max(1, dur), 0, 1);
  const eo = (x) => 1 - Math.pow(1 - x, 3);
  const eo5 = (x) => 1 - Math.pow(1 - x, 5);
  const eio = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerp = (a, b, k) => a + (b - a) * k;

  function hash(s) {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rnd(semente, i) { const x = Math.sin(hash(semente) * 0.0001 + (i + 1) * 12.9898) * 43758.5453; return x - Math.floor(x); }

  function aplicarEstilo(d) {
    const pal = (d.estilo && d.estilo.paleta) || {}, fon = (d.estilo && d.estilo.fontes) || {};
    const r = document.documentElement.style;
    const mapa = { papel: '--papel', grade: '--grade', cartao: '--cartao', tinta: '--tinta', acento: '--vermelho',
                   creme: '--creme', etiqueta: '--etiqueta' };
    for (const k in mapa) if (pal[k]) r.setProperty(mapa[k], pal[k]);
    if (fon.titulo) r.setProperty('--f-titulo', fon.titulo);
    if (fon.texto) r.setProperty('--f-maquina', fon.texto);
    if (d.idioma) document.documentElement.lang = d.idioma;
  }
  const rot = (d, k) => String((d.rotulos && d.rotulos[k]) || '');
  const txt = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const semPonto = (s) => txt(s).replace(/[.,;:!?…]+$/, '');

  // reduz a fonte ate caber (largura do elemento x alturaMax); nunca corta texto
  function caber(el, maxPx, minPx, alturaMax) {
    el.style.overflowWrap = 'normal';
    for (let fs = maxPx; fs >= minPx; fs -= 2) {
      el.style.fontSize = fs + 'px';
      if (el.scrollHeight <= alturaMax + 1 && el.scrollWidth <= el.clientWidth + 1) return fs;
    }
    el.style.fontSize = minPx + 'px';
    el.style.overflowWrap = 'break-word';
    return minPx;
  }
  // largura do CONTEUDO (texto) -- scrollWidth nao serve para bloco largo nem para inline
  function larguraTexto(el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().width;
  }
  function caberLinha(el, maxPx, minPx, largura) {
    el.style.whiteSpace = 'nowrap';
    for (let fs = maxPx; fs >= minPx; fs -= 2) {
      el.style.fontSize = fs + 'px';
      if (larguraTexto(el) <= largura + 1) return fs;
    }
    el.style.whiteSpace = 'normal';
    el.style.fontSize = minPx + 'px';
    return minPx;
  }

  // maquina de escrever: [visivel][cursor][oculto] -- o layout final ja existe desde o montar
  function prepararDatilo(el, texto) {
    el.textContent = '';
    const v = document.createElement('span'), c = document.createElement('span'), o = document.createElement('span');
    c.className = 'cursor'; o.className = 'oculto';
    el.append(v, c, o);
    o.textContent = texto;
    el._dv = { texto: Array.from(texto), v, c, o, n: -1 };
  }
  function datilo(el, k, comCursor = false) {
    const z = el._dv; if (!z) return 0;
    const n = Math.round(clamp(k, 0, 1) * z.texto.length);
    if (n !== z.n) { z.v.textContent = z.texto.slice(0, n).join(''); z.o.textContent = z.texto.slice(n).join(''); z.n = n; }
    z.c.style.display = comCursor && k > 0 && k < 1 ? 'inline-block' : 'none';
    return n;
  }
  // ms de digitacao de um texto (ritmo da referencia: ~40 ms por caractere, com teto)
  const tempoDatilo = (s, teto = 900) => Math.min(teto, 120 + Array.from(String(s)).length * 38);

  // divide um texto em n rotulos curtos (ate maxPal palavras cada, sem cortar palavra)
  function rotulosCurtos(texto, n, maxPal = 4) {
    const pal = txt(texto).replace(/[“”"«»]/g, '').split(' ').filter(Boolean);
    if (!pal.length || n <= 0) return [];
    // preferencia: oracoes (virgula/ponto) -- "Nearly no impact here, in Britain for years, ..."
    const oracoes = txt(texto).replace(/[“”"«»]/g, '').split(/[,.;:!?—–]+\s*/).map(semPonto).filter(Boolean);
    if (oracoes.length >= n) return oracoes.slice(0, n).map((o) => o.split(' ').slice(0, maxPal + 1).join(' '));
    const out = [], por = Math.max(1, Math.ceil(pal.length / n));
    for (let i = 0; i < n; i++) {
      const parte = pal.slice(i * por, i * por + por);
      if (!parte.length) break;
      out.push(semPonto(parte.slice(0, maxPal).join(' ')));
    }
    return out;
  }

  function tracar(p, k) {
    if (!p._L) { p._L = p.getTotalLength() + 2; p.style.strokeDasharray = p._L + ' ' + p._L; }
    p.style.strokeDashoffset = String(p._L * (1 - clamp(k, 0, 1)));
    p.style.visibility = k <= 0 ? 'hidden' : 'visible';
  }

  // saida padrao das pecas principais (alfa), ultimos `ms`
  const saida = (t, dur, ms = 340) => 1 - eio(seg(t, dur - ms, ms));

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // midias recebidas (file://) -- fotos, lista ou unica
  function midias(d) {
    const l = Array.isArray(d.midias) ? d.midias.filter(Boolean) : [];
    if (!l.length && d.midia_url) l.push(d.midia_url);
    return l;
  }

  return { clamp, seg, eo, eo5, eio, lerp, hash, rnd, aplicarEstilo, rot, txt, semPonto, caber, caberLinha,
           prepararDatilo, datilo, tempoDatilo, rotulosCurtos, tracar, saida, esc, midias };
})();
