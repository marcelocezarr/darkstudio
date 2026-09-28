// Previa FIEL da legenda queimada (pipeline/legenda.py).
//
// O quadro e um palco de 1920x1080 escalado com transform: scale() para a
// largura disponivel, desenhado com os MESMOS parametros do gerar_ass: fonte
// resolvida pelo servidor (a do estilo ou a fixa, com a altura de celula "win"
// que o libass usa como tamanho), tamanho em px, padding/raio/opacidade da
// faixa, base inferior (margem) ou centro, e os blocos/linhas da segmentacao
// REAL (POST /api/legenda/previa). O preenchimento karaoke (\kf) roda em loop.
// Mudancas de tamanho/posicao/cores redesenham na hora; estilo, fonte, largura
// da linha e texto pedem novos blocos ao servidor (cache por chave).

const LEGENDA_TAMANHO_BASE = 62; // px em 1080p = 100%
const LEGENDA_TAMANHOS_PX = { P: 52, M: 62, G: 74 };
const LEGENDA_MARGEM_PADRAO = 8.5; // % da altura (base da faixa em 91,5%)
const LEGENDA_MAX_LINHA_PADRAO = 42;

function legendaEscalaEfetiva(e) {
  if (e.legenda_escala !== null && e.legenda_escala !== undefined && e.legenda_escala !== "") {
    return Math.max(60, Math.min(160, Number(e.legenda_escala) || 100));
  }
  const px = LEGENDA_TAMANHOS_PX[e.legenda_tamanho] || LEGENDA_TAMANHO_BASE;
  return Math.round((px / LEGENDA_TAMANHO_BASE) * 100);
}
// tamanho ASS em px para a altura H (igual a legenda.tamanho_px)
function legendaTamanhoPx(e, H = 1080) {
  const base = (e.legenda_escala !== null && e.legenda_escala !== undefined && e.legenda_escala !== "")
    ? LEGENDA_TAMANHO_BASE * Math.max(60, Math.min(160, Number(e.legenda_escala) || 100)) / 100
    : (LEGENDA_TAMANHOS_PX[e.legenda_tamanho] || LEGENDA_TAMANHO_BASE);
  return base * H / 1080;
}
function legendaMargemEfetiva(e) {
  const m = Number(e.legenda_margem);
  return e.legenda_margem === null || e.legenda_margem === undefined || e.legenda_margem === "" || Number.isNaN(m)
    ? LEGENDA_MARGEM_PADRAO : Math.max(2, Math.min(45, m));
}
function legendaMaxLinhaEfetiva(e) {
  return Math.max(20, Math.min(60, Math.round(Number(e.legenda_max_linha) || LEGENDA_MAX_LINHA_PADRAO)));
}
// rotulo P/M/G mais proximo (mantem legenda_tamanho coerente para resumos/compatibilidade)
function legendaRotuloEscala(escala) {
  return escala < 92 ? "P" : escala < 110 ? "M" : "G";
}

function _lpRgba(hex, pct) {
  let h = String(hex || "#ffffff").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  const a = Math.max(0, Math.min(100, Number(pct))) / 100;
  if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function _lpEsc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _lpTextoRoteiro(e) {
  return (e.roteiro_texto || "").trim().split(/\s+/).slice(0, 40).join(" ");
}

const LegendaPrevia = {
  _cache: new Map(),

  // chave dos dados que dependem do servidor (blocos/fonte/fundo)
  _chave(e) {
    return JSON.stringify([e.estilo || "", e.legenda_estilo || "preenchimento", e.legenda_fonte || "estilo",
      legendaMaxLinhaEfetiva(e), _lpTextoRoteiro(e)]);
  },

  _corpoPedido(e) {
    return {
      estilo: e.estilo || "",
      texto: _lpTextoRoteiro(e),
      legenda_estilo: e.legenda_estilo || "preenchimento",
      legenda_fonte: e.legenda_fonte || "estilo",
      legenda_max_linha: legendaMaxLinhaEfetiva(e),
    };
  },

  async dados(e) {
    const k = this._chave(e);
    if (!this._cache.has(k)) {
      const p = Api.post("/api/legenda/previa", this._corpoPedido(e));
      this._cache.set(k, p);
      p.catch(() => this._cache.delete(k));
    }
    return this._cache.get(k);
  },

  // Monta a previa em `el`. obterEstado() devolve o pedido atual (campos legenda_*).
  // Devolve {atualizar(), congelar(t|null), dados()}.
  montar(el, obterEstado, opcoes = {}) {
    el.innerHTML = `
      <div class="lp-quadro${opcoes.compacta ? " lp-compacta" : ""}" aria-label="Prévia da legenda (1920x1080)">
        <div class="lp-palco">
          <div class="lp-fundo"></div>
          <div class="lp-faixa" style="display:none;"></div>
        </div>
        <div class="lp-carregando">Carregando prévia…</div>
      </div>
      <div class="lp-info"></div>`;
    const quadro = el.querySelector(".lp-quadro");
    const palco = el.querySelector(".lp-palco");
    const fundo = el.querySelector(".lp-fundo");
    const faixa = el.querySelector(".lp-faixa");
    const info = el.querySelector(".lp-info");
    const carregando = el.querySelector(".lp-carregando");
    const inst = {
      dadosAtuais: null, chaveAtual: null, blocoAtual: -2, congelado: null, t0: performance.now(),
      palavrasEl: [], params: null,
    };

    const escalar = () => {
      const w = quadro.clientWidth || 1;
      palco.style.transform = `scale(${w / 1920})`;
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(escalar) : null;
    if (ro) ro.observe(quadro);
    escalar();

    // parametros visuais (instantaneos) a partir do estado
    const calcularParams = () => {
      const e = obterEstado();
      const d = inst.dadosAtuais;
      const g = (d && d.geometria) || { pad_x: 0.55, pad_y: 0.2, raio: 0.3, fade_ms: 90 };
      const c = { faixa: "#000000", faixa_opacidade: 70, texto: "#FFFFFF", texto_opacidade: 55, preenchimento: "#FFFFFF", ...(e.legenda_cores || {}) };
      const fs = legendaTamanhoPx(e, 1080);
      const karaoke = (e.legenda_estilo || "preenchimento") === "preenchimento";
      const opFaixa = Math.max(0, Math.min(100, Number(c.faixa_opacidade)));
      const semFaixa = opFaixa < 20;
      return {
        e, g, fs, karaoke, semFaixa,
        cheio: _lpRgba(c.preenchimento, 100),
        vazio: karaoke ? _lpRgba(c.texto, c.texto_opacidade) : _lpRgba(c.preenchimento, 100),
        faixaCor: _lpRgba(c.faixa, opFaixa),
        centro: e.legenda_posicao === "centro",
        base: 1 - legendaMargemEfetiva(e) / 100,
        fonte: (d && d.fonte) || { css_familia: "Segoe UI", css_peso: 600, celula_em: 1.33, nome: "Segoe UI Semibold" },
      };
    };

    const montarBloco = (k) => {
      const d = inst.dadosAtuais;
      const p = inst.params;
      inst.blocoAtual = k;
      inst.palavrasEl = [];
      if (!d || k < 0) { faixa.style.display = "none"; return; }
      const b = d.blocos[k];
      const fs = p.fs;
      const padY = p.g.pad_y * fs;
      const padX = p.g.pad_x * fs;
      const caixaH = b.linhas.length * fs + 2 * padY;
      const top = p.centro ? 540 - caixaH / 2 : p.base * 1080 - caixaH;
      const f = p.fonte;
      const contorno = p.semFaixa ? Math.max(2, fs * 0.05) : 0;
      const sombra = p.semFaixa ? Math.max(1, fs * 0.03) : 0;
      Object.assign(faixa.style, {
        display: "block",
        top: `${top}px`,
        padding: `${padY}px ${padX}px`,
        borderRadius: `${p.g.raio * fs}px`,
        background: p.semFaixa ? "transparent" : p.faixaCor,
        fontFamily: `"${f.css_familia}"`,
        fontWeight: String(f.css_peso),
        fontSize: `${fs / (f.celula_em || 1.33)}px`,
        lineHeight: `${fs}px`,
        color: p.vazio,
        webkitTextStroke: contorno ? `${2 * contorno}px rgba(0,0,0,0.61)` : "0",
        textShadow: sombra ? `${sombra}px ${sombra}px 0 rgba(0,0,0,0.41)` : "none",
      });
      // no ASS o espaco depois da palavra pertence a silaba \kf dela (o
      // preenchimento varre "palavra "); a ultima da linha nao tem espaco (\N)
      const linhasHtml = b.linhas.map((ln) => ln.map((w, i) => {
        const t = _lpEsc(w.texto) + (i < ln.length - 1 ? " " : "");
        return p.karaoke
          ? `<span class="lp-w">${t}<span class="lp-f" style="color:${p.cheio}; clip-path: inset(0 100% 0 0);">${t}</span></span>`
          : `<span class="lp-w">${t}</span>`;
      }).join("")).join("<br>");
      faixa.innerHTML = linhasHtml;
      if (p.karaoke) {
        const spans = faixa.querySelectorAll(".lp-f");
        let i = 0;
        b.linhas.forEach((ln) => ln.forEach((w) => { inst.palavrasEl.push([spans[i++], w.inicio, w.fim]); }));
      }
    };

    const quadroEm = (t) => {
      const d = inst.dadosAtuais;
      if (!d) return;
      const k = d.blocos.findIndex((b) => t >= b.inicio && t < b.fim);
      if (k !== inst.blocoAtual) montarBloco(k);
      if (k < 0) return;
      const b = d.blocos[k];
      // \fad(90,90) quando o bloco nao emenda com o vizinho (como no gerar_ass)
      const fade = (inst.params.g.fade_ms || 90) / 1000;
      const emAnt = k > 0 && d.blocos[k - 1].fim >= b.inicio - 1e-3;
      const emProx = k + 1 < d.blocos.length && d.blocos[k + 1].inicio <= b.fim + 1e-3;
      let op = 1;
      if (!emAnt && t - b.inicio < fade) op = Math.max(0, (t - b.inicio) / fade);
      if (!emProx && b.fim - t < fade) op = Math.min(op, Math.max(0, (b.fim - t) / fade));
      faixa.style.opacity = String(op);
      for (const [span, ini, fim] of inst.palavrasEl) {
        const frac = t <= ini ? 0 : t >= fim ? 1 : (t - ini) / Math.max(0.01, fim - ini);
        span.style.clipPath = `inset(0 ${(100 - frac * 100).toFixed(2)}% 0 0)`;
      }
    };

    const laco = (agora) => {
      if (!el.isConnected) { if (ro) ro.disconnect(); return; }
      const d = inst.dadosAtuais;
      if (d) {
        const ciclo = d.duracao_s + 0.8;
        const t = inst.congelado !== null ? inst.congelado : ((agora - inst.t0) / 1000) % ciclo;
        quadroEm(t);
      }
      requestAnimationFrame(laco);
    };

    const aplicarInfo = () => {
      const p = inst.params;
      const d = inst.dadosAtuais;
      if (!p || !d) return;
      const e = p.e;
      const fonteRot = (e.legenda_fonte && e.legenda_fonte !== "estilo") ? d.fonte.nome : `${d.fonte.nome} (do estilo)`;
      info.textContent = `${fonteRot} · ${legendaEscalaEfetiva(e)}% · ${Math.round(p.fs)} px em 1080p · ${p.centro ? "central" : `margem ${String(legendaMargemEfetiva(e)).replace(".", ",")}%`} · até ${legendaMaxLinhaEfetiva(e)} caracteres/linha`;
    };

    const redesenhar = () => {
      inst.params = calcularParams();
      inst.blocoAtual = -2; // forca remontar o bloco com os novos parametros
      aplicarInfo();
    };

    inst.atualizar = async () => {
      const e = obterEstado();
      redesenhar();
      const chave = LegendaPrevia._chave(e);
      if (chave === inst.chaveAtual) return;
      inst.chaveAtual = chave;
      try {
        const d = await LegendaPrevia.dados(e);
        if (inst.chaveAtual !== chave) return; // chegou uma resposta velha
        inst.dadosAtuais = d;
        carregando.style.display = "none";
        if (d.fundo_url) {
          fundo.style.backgroundImage = `url("${d.fundo_url}")`;
          fundo.classList.remove("lp-fundo-gradiente");
        } else {
          fundo.style.backgroundImage = "";
          fundo.classList.add("lp-fundo-gradiente");
        }
        inst.t0 = performance.now();
        redesenhar();
      } catch (exc) {
        carregando.textContent = "Prévia indisponível: " + exc.message;
        carregando.style.display = "";
        inst.chaveAtual = null;
      }
    };
    // congela num instante (s) -- usado para comparar com o quadro do render real
    inst.congelar = (t) => { inst.congelado = t === null || t === undefined ? null : Number(t); inst.blocoAtual = -2; };
    inst.dados = () => inst.dadosAtuais;

    el._legendaPrevia = inst;
    inst.atualizar();
    requestAnimationFrame(laco);
    return inst;
  },
};
