/* Broadcast (validado, broadcast_v) -- utilitarios compartilhados pelas pecas (sem timers, sem rede).
   Tudo aqui e funcao pura; as pecas chamam em montar() e quadro(t). */
(function () {
  const BC = {};
  BC.clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  BC.lin = (t, a, b) => BC.clamp((t - a) / (b - a));           // 0..1 entre a e b
  BC.eo = (x) => 1 - Math.pow(1 - x, 3);                         // ease-out cubica
  BC.ei = (x) => x * x * x;                                      // ease-in cubica
  BC.eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  BC.expo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));     // ease-out exponencial
  BC.back = (x) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  /* aplica paleta/fontes do estilo.json nas variaveis CSS */
  BC.tema = function (d) {
    const pal = (d && d.estilo && d.estilo.paleta) || {}, fon = (d && d.estilo && d.estilo.fontes) || {};
    const r = document.documentElement.style;
    const mapa = { fundo: '--navy', painel: '--navy2', texto: '--branco', texto2: '--texto2', acento: '--acento' };
    for (const k in mapa) if (pal[k]) r.setProperty(mapa[k], pal[k]);
    if (fon.titulo) r.setProperty('--ft', fon.titulo);
    if (fon.texto) r.setProperty('--fx', fon.texto);
  };

  BC.rot = (d, chave, reserva) => ((d && d.rotulos && d.rotulos[chave]) || reserva || '');
  BC.txt = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

  /* wipe diagonal: kIn revela da esquerda p/ direita, kOut esconde da esquerda p/ direita.
     A borda tem a mesma inclinacao dos paineis. */
  BC.wipe = function (el, kIn, kOut, S) {
    S = S == null ? 60 : S;
    kIn = BC.clamp(kIn); kOut = BC.clamp(kOut || 0);
    if (kIn >= 1 && kOut <= 0) { el.style.clipPath = 'none'; return; }
    const xt = (k) => `calc(${(k * 100).toFixed(3)}% + ${(k * S).toFixed(2)}px)`;
    const xb = (k) => `calc(${(k * 100).toFixed(3)}% + ${((k - 1) * S).toFixed(2)}px)`;
    el.style.clipPath = `polygon(${xt(kOut)} 0, ${xt(kIn)} 0, ${xb(kIn)} 100%, ${xb(kOut)} 100%)`;
  };
  /* wipe vertical (de baixo p/ cima) */
  BC.wipeV = function (el, kIn, kOut) {
    kIn = BC.clamp(kIn); kOut = BC.clamp(kOut || 0);
    if (kIn >= 1 && kOut <= 0) { el.style.clipPath = 'none'; return; }
    el.style.clipPath = `inset(${((1 - kIn) * 100).toFixed(3)}% 0 ${(kOut * 100).toFixed(3)}% 0)`;
  };

  /* tamanho do CONTEUDO (nao da caixa): uniao dos retangulos do texto/filhos */
  BC.medir = function (el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    const b = r.getBoundingClientRect();
    return { w: Math.max(b.width, el.scrollWidth > el.clientWidth + 1 ? el.scrollWidth : 0), h: b.height };
  };
  BC.cabe = function (el, larg, alt) {
    const m = BC.medir(el);
    return (!larg || m.w <= larg + 0.5) && (!alt || m.h <= alt + 0.5);
  };

  /* reduz a fonte ate o conteudo caber em (larg x alt). Devolve o tamanho usado. */
  BC.caber = function (el, maxPx, minPx, larg, alt) {
    let px = maxPx;
    for (; px > minPx; px -= 2) {
      el.style.fontSize = px + 'px';
      if (BC.cabe(el, larg, alt)) return px;
    }
    el.style.fontSize = minPx + 'px';
    return minPx;
  };

  /* corta um texto longo NUMA FRONTEIRA de palavra (nunca no meio) */
  BC.encurtar = function (s, maxChars) {
    s = BC.txt(s);
    if (s.length <= maxChars) return s;
    const corte = s.slice(0, maxChars + 1);
    const i = corte.lastIndexOf(' ');
    if (i <= 0) return s;  // uma palavra so: nunca corta no meio
    return corte.slice(0, i).replace(/[\s,;:.\-–—]+$/, '') + '…';
  };

  /* reduz a fonte e, se ainda nao couber no minimo, encurta por palavras */
  BC.caberTexto = function (el, texto, maxPx, minPx, larg, alt) {
    let s = BC.txt(texto);
    el.textContent = s;
    let px = BC.caber(el, maxPx, minPx, larg, alt);
    let n = s.length;
    while (n > 8 && !BC.cabe(el, larg, alt)) {
      n = Math.floor(n * 0.9);
      el.textContent = BC.encurtar(s, n);
    }
    return px;
  };

  /* formata numero como foi dito (prefixo/sufixo/separadores) */
  BC.fmt = function (d, v, dec) {
    dec = dec == null ? (d.decimais || 0) : dec;
    if (d.ano) return String(Math.round(v));
    let [int, fr] = Math.abs(v).toFixed(dec).split('.');
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, d.separador_milhar == null ? '.' : d.separador_milhar);
    const s = fr ? int + (d.separador_decimal || ',') + fr : int;
    return (v < 0 ? '-' : '') + s;
  };
  /* prefixo/sufixo separados (para estilizar o numero em outra cor) */
  BC.partes = function (d) {
    const pre = BC.txt(d.prefixo);
    let suf = d.sufixo == null ? '' : String(d.sufixo);
    return { pre, suf };
  };

  window.BC = BC;
})();
