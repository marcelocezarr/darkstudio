/* Kinético (validado) — utilitarios comuns das pecas (JS puro, deterministico).
   Carregado por <script src="../comum/kv.js"> antes do script da peca. Nada de timers. */
(function () {
  const K = {};
  K.W = 1920; K.H = 1080;

  K.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  K.prog = (t, ini, dur) => K.clamp((t - ini) / Math.max(1, dur), 0, 1);
  K.lerp = (a, b, k) => a + (b - a) * k;
  K.outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
  K.inExpo = (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
  K.outQuint = (x) => 1 - Math.pow(1 - x, 5);
  K.outCubic = (x) => 1 - Math.pow(1 - x, 3);
  K.inCubic = (x) => x * x * x;
  K.inOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  K.outBack = (x, s) => { const c1 = s == null ? 1.7 : s, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  // paleta/fontes do estilo -> variaveis CSS
  K.iniciar = function (d) {
    d = d || {};
    const r = document.documentElement.style;
    const pal = (d.estilo && d.estilo.paleta) || {}, fon = (d.estilo && d.estilo.fontes) || {};
    r.setProperty('--fundo', pal.fundo || '#0a0a0a');
    r.setProperty('--grade', pal.grade || '#1f1f1f');
    r.setProperty('--texto', pal.texto || '#ffffff');
    r.setProperty('--acento', pal.acento || '#d8fc3c');
    r.setProperty('--tinta', pal.tinta || '#0a0a0a');
    r.setProperty('--f-titulo', fon.titulo || "Impact, 'Arial Black', sans-serif");
    r.setProperty('--f-texto', fon.texto || "'Segoe UI', Arial, sans-serif");
    r.setProperty('--f-rotulo', fon.rotulo || "Impact, 'Arial Narrow', sans-serif");
    document.documentElement.lang = d.idioma || 'en';
    return d;
  };
  K.rot = (d, chave, padrao) => ((d && d.rotulos && d.rotulos[chave]) || padrao || '');
  K.maiusc = (s, idioma) => { try { return String(s || '').toLocaleUpperCase(idioma || undefined); } catch (e) { return String(s || '').toUpperCase(); } };
  K.palavrasDe = (s) => String(s || '').split(/\s+/).filter(Boolean);

  // ajusta font-size (px) ate o elemento caber em maxW x maxH (busca binaria)
  K.ajustar = function (el, maxW, maxH, maxFs, minFs) {
    let lo = minFs, hi = maxFs, melhor = minFs;
    const cabe = (fs) => { el.style.fontSize = fs + 'px'; return el.scrollWidth <= maxW + 0.5 && el.scrollHeight <= maxH + 0.5; };
    if (cabe(maxFs)) return maxFs;
    for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (cabe(mid)) { melhor = mid; lo = mid; } else { hi = mid; } }
    el.style.fontSize = melhor + 'px';
    return melhor;
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

  // ---- odometro: cada digito rola dentro de uma mascara (como na referencia) ----
  // cont: elemento com font-size ja definido. Devolve {quadro(t)} ; t0 = inicio, dur = duracao da rolagem.
  K.odometro = function (cont, texto, t0, dur) {
    cont.innerHTML = '';
    const cols = [];
    const chars = Array.from(String(texto));
    const nd = chars.filter((c) => /\d/.test(c)).length;
    let di = 0;
    chars.forEach((c) => {
      const m = document.createElement('span'); m.className = 'odo-m';
      const s = document.createElement('span'); s.className = 'odo-s';
      m.appendChild(s); cont.appendChild(m);
      if (/\d/.test(c)) {
        const alvo = Number(c);
        const voltas = 1 + (nd - 1 - di);                 // digitos da esquerda rolam menos
        const seq = [];
        for (let k = 0; k <= voltas * 10 + alvo; k++) seq.push(k % 10);
        s.innerHTML = seq.map((n) => `<span>${n}</span>`).join('');
        cols.push({ s, n: seq.length - 1, atraso: di * 50, digito: true });
        di++;
      } else {
        s.innerHTML = `<span>${c === ' ' ? '&nbsp;' : c}</span>`;
        cols.push({ s, n: 0, atraso: 0, digito: false });
      }
    });
    return {
      quadro(t) {
        cols.forEach((c) => {
          if (c.digito) {
            const k = K.outCubic(K.prog(t, t0 + c.atraso, dur - c.atraso));
            c.s.style.transform = `translateY(${(-100 * c.n * k / (c.n + 1)).toFixed(4)}%)`;
          } else {
            const k = K.outCubic(K.prog(t, t0, dur * 0.6));
            c.s.style.transform = `translateY(${((1 - k) * 100).toFixed(2)}%)`;
          }
        });
      },
    };
  };

  // grade de linhas (fundo escuro quadriculado / grade sobre footage)
  K.grade = function (el, passo, cor, esp, offX, offY) {
    el.style.backgroundImage =
      `linear-gradient(to right, ${cor} 0, ${cor} ${esp}px, transparent ${esp}px),` +
      `linear-gradient(to bottom, ${cor} 0, ${cor} ${esp}px, transparent ${esp}px)`;
    el.style.backgroundSize = `${passo}px ${passo}px`;
    el.style.backgroundPosition = `${offX || 0}px ${offY || 0}px`;
  };

  K.saida = (t, dur, ms) => K.clamp((dur - t) / (ms || 250), 0, 1);

  // clip de "cortina": k=0 invisivel, k=1 inteiro
  K.cortina = (k, lado) => {
    const r = ((1 - K.clamp(k, 0, 1)) * 100).toFixed(2);
    if (lado === 'dir') return `inset(0 0 0 ${r}%)`;
    if (lado === 'baixo') return `inset(${r}% 0 0 0)`;
    if (lado === 'cima') return `inset(0 0 ${r}% 0)`;
    return `inset(0 ${r}% 0 0)`;
  };

  const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  // ms (relativo) de cada palavra do texto, alinhado com dados.palavras
  K.alinhar = function (textos, palavras, dur, passo) {
    const ps = Array.isArray(palavras) ? palavras.filter((p) => p && p.ms != null) : [];
    const n = textos.length, out = new Array(n).fill(null);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const alvo = norm(textos[i]);
      if (!alvo) continue;
      for (let k = j; k < Math.min(ps.length, j + 6); k++) {
        const pn = norm(ps[k].texto);
        if (pn && (pn === alvo || (alvo.length > 3 && (pn.startsWith(alvo) || alvo.startsWith(pn))))) { out[i] = Number(ps[k].ms); j = k + 1; break; }
      }
    }
    if (out.every((v) => v == null) && ps.length) for (let i = 0; i < n && i < ps.length; i++) out[i] = Number(ps[i].ms);
    passo = passo || 180;
    for (let i = 0; i < n; i++) {
      if (out[i] != null) continue;
      let a = i - 1; while (a >= 0 && out[a] == null) a--;
      let b = i + 1; while (b < n && out[b] == null) b++;
      if (a >= 0 && b < n) out[i] = out[a] + (out[b] - out[a]) * (i - a) / (b - a);
      else if (a >= 0) out[i] = out[a] + passo * (i - a);
      else if (b < n) out[i] = Math.max(0, out[b] - passo * (b - i));
      else out[i] = i * passo;
    }
    const teto = Math.max(0, (dur || 3000) * 0.7);
    for (let i = 0; i < n; i++) { out[i] = K.clamp(out[i], 0, teto); if (i && out[i] < out[i - 1]) out[i] = out[i - 1]; }
    return out;
  };

  window.K = K;
})();
