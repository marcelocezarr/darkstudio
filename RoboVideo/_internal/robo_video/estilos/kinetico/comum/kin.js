/* Kinético — utilitarios comuns das pecas (JS puro, deterministico).
   Carregado por <script src="../comum/kin.js"> antes do script da peca.
   Nada de timers: tudo e funcao de t. */
(function () {
  const K = {};
  K.W = 1920; K.H = 1080;
  // safe area de titulo (10%) e de acao (5%)
  K.SX = 192; K.SY = 108; K.AX = 96; K.AY = 54;

  K.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  K.prog = (t, ini, dur) => K.clamp((t - ini) / Math.max(1, dur), 0, 1);
  K.lerp = (a, b, k) => a + (b - a) * k;
  K.outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
  K.inExpo = (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
  K.outQuint = (x) => 1 - Math.pow(1 - x, 5);
  K.inOutQuint = (x) => (x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2);
  K.inQuart = (x) => x * x * x * x;
  K.outBack = (x, s) => { const c1 = s == null ? 1.9 : s, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  // tremor amortecido deterministico (px) a partir do instante do impacto
  K.tremor = (t, t0, amp, seed) => {
    const dt = t - t0;
    if (dt < 0 || dt > 420) return [0, 0];
    const a = amp * Math.exp(-dt / 90);
    const s = seed || 1;
    return [a * Math.sin(dt * 0.21 * s + 1.3), a * Math.cos(dt * 0.17 * s + 0.4)];
  };

  // paleta/fontes do estilo -> variaveis CSS
  K.iniciar = function (d) {
    d = d || {};
    const r = document.documentElement.style;
    const pal = (d.estilo && d.estilo.paleta) || {}, fon = (d.estilo && d.estilo.fontes) || {};
    r.setProperty('--fundo', pal.fundo || '#0a0a0a');
    r.setProperty('--texto', pal.texto || '#ffffff');
    r.setProperty('--acento', pal.acento || '#d4ff1a');
    r.setProperty('--tinta', pal.tinta || '#0a0a0a');
    r.setProperty('--sombra', pal.sombra || 'rgba(0,0,0,.6)');
    r.setProperty('--f-titulo', fon.titulo || "Impact, 'Arial Black', sans-serif");
    r.setProperty('--f-texto', fon.texto || "Bahnschrift, 'Arial Narrow', Arial, sans-serif");
    r.setProperty('--f-rotulo', fon.rotulo || "Bahnschrift, 'Segoe UI', Arial, sans-serif");
    document.documentElement.lang = d.idioma || 'pt';
    return d;
  };
  K.rot = (d, chave, padrao) => ((d && d.rotulos && d.rotulos[chave]) || padrao || '');
  K.maiusc = (s, idioma) => { try { return String(s || '').toLocaleUpperCase(idioma || undefined); } catch (e) { return String(s || '').toUpperCase(); } };

  // ajusta font-size (px) do elemento ate caber em maxW x maxH (busca binaria).
  // Mede o proprio elemento (display inline-block/ block com width fixo).
  K.ajustar = function (el, maxW, maxH, maxFs, minFs) {
    let lo = minFs, hi = maxFs, melhor = minFs;
    const cabe = (fs) => {
      el.style.fontSize = fs + 'px';
      const w = el.scrollWidth, h = el.scrollHeight;
      return w <= maxW + 0.5 && h <= maxH + 0.5;
    };
    if (cabe(maxFs)) return maxFs;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (cabe(mid)) { melhor = mid; lo = mid; } else { hi = mid; }
    }
    el.style.fontSize = melhor + 'px';
    return melhor;
  };
  // nenhuma palavra isolada pode ser mais larga que maxW (evita quebra no meio)
  K.maiorPalavraCabe = function (spans, maxW) {
    return spans.every((s) => s.getBoundingClientRect().width <= maxW + 0.5);
  };

  const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  K.norm = norm;
  // Alinha as palavras do texto com dados.palavras [{texto, ms}] (sincronia com a fala).
  // Devolve ms (relativo ao inicio da peca) de cada palavra do texto.
  K.alinhar = function (textos, palavras, dur, passo) {
    const ps = Array.isArray(palavras) ? palavras.filter((p) => p && p.ms != null) : [];
    const n = textos.length, out = new Array(n).fill(null);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const alvo = norm(textos[i]);
      if (!alvo) continue;
      for (let k = j; k < Math.min(ps.length, j + 6); k++) {
        const pn = norm(ps[k].texto);
        if (pn && (pn === alvo || (alvo.length > 3 && (pn.startsWith(alvo) || alvo.startsWith(pn))))) {
          out[i] = Number(ps[k].ms); j = k + 1; break;
        }
      }
    }
    // sem nenhuma correspondencia mas mesma contagem: usa por indice
    if (out.every((v) => v == null) && ps.length) {
      for (let i = 0; i < n && i < ps.length; i++) out[i] = Number(ps[i].ms);
    }
    // interpola buracos
    passo = passo || 160;
    for (let i = 0; i < n; i++) {
      if (out[i] != null) continue;
      let a = i - 1; while (a >= 0 && out[a] == null) a--;
      let b = i + 1; while (b < n && out[b] == null) b++;
      if (a >= 0 && b < n) out[i] = out[a] + (out[b] - out[a]) * (i - a) / (b - a);
      else if (a >= 0) out[i] = out[a] + passo * (i - a);
      else if (b < n) out[i] = Math.max(0, out[b] - passo * (b - i));
      else out[i] = i * passo;
    }
    // monotonico, dentro da peca (deixa tempo de leitura antes da saida)
    const teto = Math.max(0, (dur || 3000) * 0.72);
    for (let i = 0; i < n; i++) {
      out[i] = K.clamp(out[i], 0, teto);
      if (i && out[i] < out[i - 1]) out[i] = out[i - 1];
    }
    return out;
  };

  K.palavrasDe = (s) => String(s || '').split(/\s+/).filter(Boolean);

  // Quebra o texto em LINHAS mascaradas: <div class="ln"><div class="li">...</div></div>.
  // O container ja deve ter largura e font-size finais. Devolve os elementos .li (animar translateY).
  K.linhas = function (cont, texto) {
    const ps = K.palavrasDe(texto);
    cont.innerHTML = '';
    const spans = ps.map((p) => { const s = document.createElement('span'); s.textContent = p + ' '; cont.appendChild(s); return s; });
    const grupos = [];
    let topo = null;
    spans.forEach((s, i) => {
      if (topo === null || Math.abs(s.offsetTop - topo) > 4) { grupos.push([]); topo = s.offsetTop; }
      grupos[grupos.length - 1].push(ps[i]);
    });
    cont.innerHTML = '';
    return grupos.map((g) => {
      const ln = document.createElement('div'); ln.className = 'ln';
      const li = document.createElement('div'); li.className = 'li'; li.textContent = g.join(' ');
      ln.appendChild(li); cont.appendChild(ln);
      return li;
    });
  };
  // clip-path de "cortina": k=0 invisivel, k=1 inteiro. lado: 'esq' revela da esquerda p/ direita.
  K.cortina = (k, lado) => {
    const r = ((1 - K.clamp(k, 0, 1)) * 100).toFixed(2);
    if (lado === 'dir') return `inset(0 0 0 ${r}%)`;
    if (lado === 'baixo') return `inset(${r}% 0 0 0)`;
    if (lado === 'cima') return `inset(0 0 ${r}% 0)`;
    return `inset(0 ${r}% 0 0)`;
  };
  // numero formatado (prefixo + milhar/decimal + sufixo), como no contrato
  K.formatarNumero = function (d, v) {
    const dec = d.decimais || 0;
    let [int, fr] = Math.abs(v).toFixed(dec).split('.');
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, d.separador_milhar == null ? '.' : d.separador_milhar);
    let s = fr ? int + (d.separador_decimal || ',') + fr : int;
    if (d.ano) s = String(Math.round(v));
    return (v < 0 ? '-' : '') + (d.prefixo || '') + s + (d.sufixo || '');
  };

  // opacidade de saida (1 -> 0 nos ultimos ms)
  K.saida = (t, dur, ms) => K.clamp((dur - t) / (ms || 300), 0, 1);

  window.K = K;
})();
