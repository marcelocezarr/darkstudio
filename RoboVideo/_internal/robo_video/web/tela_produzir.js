// Tela Produzir: cabecalho de status + assistente de 4 etapas.

// Custos de referencia (US$) para a estimativa da etapa 4.
const CUSTO_TTS_USD_POR_MIN = 0.015; // OpenAI gpt-4o-mini-tts

// Fonte do conteudo: audio e roteiro sao ambos opcionais, mas pelo menos um
// e obrigatorio. Com audio ele e a narracao (nada e gerado); com roteiro
// tambem, o roteiro guia cenas e textos na tela. So roteiro -> TTS.
// e.audio (quando presente) e o audio ja salvo no rascunho do servidor:
// {nome, tamanho, duracao_s, url}.
function _temAudio(e) { return !!e.audio; }
function _temRoteiro(e) { return !!(e.roteiro_texto || "").trim(); }
function _descricaoFonte(e) {
  if (_temAudio(e) && _temRoteiro(e)) return "Meu áudio + roteiro";
  if (_temAudio(e)) return "Meu áudio";
  if (_temRoteiro(e)) return "Roteiro (voz TTS)";
  return "-";
}

// Carregado uma vez de /api/estilos (Classico + estilos animados de
// robo_video/estilos/, cada um com paleta/pecas/previas e disponibilidade
// real -- estilos animados exigem o Microsoft Edge instalado).
let _estilosCache = null;
async function _carregarEstilos() {
  if (!_estilosCache) _estilosCache = await Api.get("/api/estilos");
  return _estilosCache;
}
function _estiloPorId(id) {
  return (_estilosCache || []).find((x) => x.id === id) || null;
}

// Geradores de imagem IA (com custo aproximado por imagem), de
// /api/imagens/geradores. Fallback local se a API falhar.
const _GERADORES_PADRAO = {
  geradores: [
    { id: "gpt_image_2", nome: "OpenAI GPT Image 2 (padrão)", custo_usd: 0.032, por_provedor: { openai: 0.032, openrouter: 0 } },
    { id: "intercalar", nome: "Intercalar Nano Banana + GPT Image 2", custo_usd: 0.0355, por_provedor: { openai: 0.016, openrouter: 0.0195 } },
    { id: "nano_banana", nome: "Só Nano Banana", custo_usd: 0.039, por_provedor: { openai: 0, openrouter: 0.039 } },
    { id: "nano_banana_pro", nome: "Só Nano Banana Pro (2K, mais nítido)", custo_usd: 0.14, por_provedor: { openai: 0, openrouter: 0.14 } },
    { id: "openai", nome: "Só GPT Image 1 (legado)", custo_usd: 0.063, por_provedor: { openai: 0.063, openrouter: 0 } },
  ],
  qualidades_openai: [
    { id: "low", nome: "Baixa", custo_usd: 0.004 },
    { id: "medium", nome: "Média", custo_usd: 0.032 },
    { id: "high", nome: "Alta", custo_usd: 0.127 },
  ],
};
let _geradoresCache = null;
async function _carregarGeradores() {
  if (_geradoresCache) return _geradoresCache;
  try {
    _geradoresCache = await Api.get("/api/imagens/geradores");
  } catch (_) {
    _geradoresCache = _GERADORES_PADRAO;
  }
  return _geradoresCache;
}
function _moedaImg(v) { return "US$ " + Number(v || 0).toFixed(3).replace(".", ","); }
function _geradorUsaOpenai(g) { return g === "intercalar" || g === "openai" || g === "gpt_image_2"; }
function _custoOpenai(qualidade) {
  const q = ((_geradoresCache || _GERADORES_PADRAO).qualidades_openai || []).find((x) => x.id === qualidade);
  return q ? q.custo_usd : 0.032;
}
// custo medio por imagem do gerador, com a parte OpenAI na qualidade escolhida
function _custoPorImagem(e, gerador) {
  const g = gerador || e.gerador_imagem || "gpt_image_2";
  const item = ((_geradoresCache || _GERADORES_PADRAO).geradores || []).find((x) => x.id === g);
  if (!item) return _custoOpenai(e.qualidade_openai);
  const pp = item.por_provedor || {};
  const fracOpenai = pp.openai ? pp.openai / _custoOpenai("medium") : 0;
  return (pp.openrouter || 0) + fracOpenai * _custoOpenai(e.qualidade_openai || "medium");
}
function _rotuloGeradorCurto(g) {
  return { gpt_image_2: "GPT Image 2", intercalar: "Intercalar", nano_banana: "Nano Banana", nano_banana_pro: "Nano Banana Pro", openai: "GPT Image 1" }[g || "gpt_image_2"] || g;
}
function _rotuloGerador(e) {
  const base = _rotuloGeradorCurto(e.gerador_imagem);
  if (!_geradorUsaOpenai(e.gerador_imagem || "gpt_image_2")) return base;
  const q = { low: "baixa", high: "alta" }[e.qualidade_openai] || "média";
  return `${base} · OpenAI ${q}`;
}
function _opcoesGeradorHtml(e) {
  const atual = e.gerador_imagem || "gpt_image_2";
  return ((_geradoresCache || _GERADORES_PADRAO).geradores || [])
    .map((g) => `<option value="${g.id}" ${atual === g.id ? "selected" : ""}>${escaparHtml(g.nome)} · ~${_moedaImg(_custoPorImagem(e, g.id))}/imagem</option>`)
    .join("");
}
function _opcoesQualidadeHtml(e) {
  const atual = e.qualidade_openai || "medium";
  return ((_geradoresCache || _GERADORES_PADRAO).qualidades_openai || [])
    .map((q) => `<option value="${q.id}" ${atual === q.id ? "selected" : ""}>${escaparHtml(q.nome)}${q.id === "medium" ? " (padrão)" : ""} · ~${_moedaImg(q.custo_usd)}/imagem</option>`)
    .join("");
}

// ------------------------------------------------- bancos de acervo (fontes) --
// Lista de /api/acervo/bancos: [{id, nome, tipos, precisa_chave, disponivel,
// chave_configurada, ligado_padrao, risco, descricao}]. e.bancos_acervo =
// null usa o padrao do app (hoje Pexels + Coverr); Pixabay/Unsplash/NASA vem
// desligados. O YouTube tem toggle proprio (nao aparece aqui).
let _bancosCache = null;
async function _carregarBancos() {
  if (_bancosCache) return _bancosCache;
  try {
    _bancosCache = await Api.get("/api/acervo/bancos");
  } catch (_) {
    _bancosCache = { bancos: [], padrao: ["pexels"] };
  }
  return _bancosCache;
}
function _bancosMarcados(e) {
  const dados = _bancosCache || { padrao: ["pexels"] };
  return Array.isArray(e.bancos_acervo) ? e.bancos_acervo : (dados.padrao || []);
}
function _listaBancosHtml(e) {
  const dados = _bancosCache || { bancos: [] };
  if (!(dados.bancos || []).length) return '<p class="ajuda">Não foi possível carregar os bancos.</p>';
  const marcados = _bancosMarcados(e);
  return dados.bancos.map((b) => {
    const semChave = b.precisa_chave && !b.chave_configurada;
    const tipos = (b.tipos || []).map((t) => (t === "video" ? "vídeo" : "foto")).join(" + ");
    const nota = semChave
      ? '<span class="msg-teste-neutra">configure em Integrações</span>'
      : (b.risco ? `<span class="msg-teste-neutra">${escaparHtml(b.risco)}</span>` : "");
    return `<label class="banco-acervo" style="display:flex; align-items:flex-start; gap:8px; margin:4px 0; font-weight:400;" title="${escaparHtml(b.descricao || "")}">
      <input type="checkbox" data-banco="${b.id}" ${marcados.includes(b.id) && !semChave ? "checked" : ""} ${semChave ? "disabled" : ""} style="width:auto; margin-top:3px;" />
      <span><strong>${escaparHtml(b.nome)}</strong> <span class="ajuda" style="display:inline;">(${tipos})</span>${nota ? `<br><span class="ajuda" style="display:inline;">${nota}</span>` : ""}</span>
    </label>`;
  }).join("");
}

// ------------------------------------------------------------------ takes --
// Composicoes de midia (robo_video/estilos/_takes) aplicadas em TODOS os
// estilos: abertura em 1,0 s + uma a cada N s, em rodizio na ordem abaixo
// (mesmos ids de modelos.TAKES_IDS).
const TAKES_UI = [
  ["take-encaixe-quadros", "Take – Encaixe de Quadros (abertura)"],
  ["take-arquivo-fotogramas", "Take – Arquivo de Fotogramas"],
  ["cena-ensaio-papel", "Cena – Ensaio de Papel"],
  ["take-sequencia-alternada", "Take – Sequência Alternada"],
  ["take-painel-direita", "Take – Painel Direita"],
  ["take-painel-esquerda", "Take – Painel Esquerda"],
  ["take-evidencias-foco", "Take – Evidências Foco"],
  ["take-par-vidro", "Take – Par de Vidro"],
  ["take-planos-vidro", "Take – Planos de Vidro"],
  ["take-frente-fundo-vertical", "Take – Frente e Fundo Vertical Fixa"],
  ["take-frente-fundo-cinematico", "Take – Frente e Fundo Cinemático"],
  ["cena-retrato-direita", "Cena – Retrato Direita"],
  ["take-ed-comparacao", "Take – ED Comparação"],
  ["take-triade-editorial", "Take – Tríade Editorial"],
  ["take-dossie-duplo", "Take – Dossiê Duplo"],
];
const TAKES_IDS_UI = TAKES_UI.map(([id]) => id);
function _takesMarcados(e) {
  return Array.isArray(e.takes_lista) ? e.takes_lista : TAKES_IDS_UI.slice();
}
function _rotuloTakes(e) {
  if (!e.takes_ativos) return "Desligados";
  return `A cada ${e.takes_intervalo_s || 25} s`;
}
function _listaTakesHtml(e) {
  const marcados = _takesMarcados(e);
  return TAKES_UI.map(([id, nome]) => `<label style="display:flex; align-items:center; gap:8px; margin:2px 0; font-weight:400;">
      <input type="checkbox" data-take="${id}" ${marcados.includes(id) ? "checked" : ""} ${e.takes_ativos ? "" : "disabled"} style="width:auto;" /> ${escaparHtml(nome)}
    </label>`).join("");
}

// ------------------------------------------------------------ legenda --
// Legenda queimada no video (pipeline/legenda.py). Cores com opacidade 0-100.
const LEGENDA_CORES_PADRAO = { faixa: "#000000", faixa_opacidade: 70, texto: "#FFFFFF", texto_opacidade: 55, preenchimento: "#FFFFFF" };
const LEGENDA_ESTILOS_UI = [
  ["preenchimento", "Preenchimento (karaokê)"],
  ["palavra", "Uma palavra por vez"],
  ["simples", "Frase inteira (sem karaokê)"],
];
const LEGENDA_FONTES_UI = ["Segoe UI Semibold", "Segoe UI Bold", "Segoe UI Black", "Bahnschrift", "Arial", "Arial Black",
  "Calibri", "Verdana", "Trebuchet MS", "Franklin Gothic Medium", "Candara", "Corbel", "Georgia", "Cambria", "Constantia",
  "Palatino Linotype", "Times New Roman", "Impact", "Consolas", "Courier New"];
const LEGENDA_MODOS_UI = [["auto", "Auto"], ["ocultar", "Ocultar"], ["manter", "Manter"]];

function _legendaCores(e) {
  return { ...LEGENDA_CORES_PADRAO, ...(e.legenda_cores || {}) };
}
function _rotuloLegenda(e) {
  if (!e.legenda_ativa) return "Desligada";
  const est = LEGENDA_ESTILOS_UI.find(([id]) => id === e.legenda_estilo);
  return est ? est[1] : "Preenchimento (karaokê)";
}
function _selectHtml(id, opcoes, valor) {
  return `<select id="${id}">${opcoes.map(([v, r]) => `<option value="${v}" ${valor === v ? "selected" : ""}>${escaparHtml(r)}</option>`).join("")}</select>`;
}

let _produzirEstado = null;
let _produzirEtapa = 1;

function _estadoProduzirPadrao() {
  return {
    canal_id: null,
    preset_id: null, // preset de produção do canal que serviu de base (null = "Ajustes deste vídeo")
    apresentador: false, // avatar padrão do canal em quadro (HeyGen)
    avatar_intervalo_s: 60, // reaparece a cada N s
    nome: "",
    roteiro_texto: "",
    pasta_saida: "Downloads",
    estilo: "classico",
    trilha: true,
    pct_real: 40,
    midia_ia: "so_imagens",
    midia_acervo: "fotos_videos",
    bancos_acervo: null, // null = padrao do app (Pexels + Coverr); senao lista de ids
    usar_youtube: false, // completar a % real com trechos do YouTube (<=4 s, sem rostos, max 2/video)
    juiz_visual: true, // validar se o tema aparece nos quadros dos videos candidatos
    segundos_por_cena: 4.0,
    usar_gpu: false,
    provedor_tts: "", // "" = automatico (OpenAI se houver chave, senao Dark Planner) | openai | darkplanner
    voz_tts: "", // "" = a do canal / padrao do provedor
    gerador_imagem: "gpt_image_2", // gpt_image_2 | intercalar | nano_banana | nano_banana_pro | openai
    qualidade_openai: "medium", // medium | high
    takes_ativos: false, // templates/takes (composicoes de midia) -- opcao extra, desligada por padrao
    takes_intervalo_s: 25, // 15..60
    takes_lista: TAKES_IDS_UI.slice(), // ordem do rodizio
    legenda_ativa: false, // legenda queimada -- opcao extra, desligada por padrao
    legenda_estilo: "preenchimento", // preenchimento | palavra | simples
    legenda_cores: { ...LEGENDA_CORES_PADRAO },
    legenda_tamanho: "M", // P | M | G
    legenda_posicao: "inferior", // inferior | centro
    legenda_fonte: "estilo", // "estilo" ou nome de uma fonte do Windows
    legenda_sob_templates: "auto", // auto | ocultar | manter
    legenda_sob_destaques: "auto",
    legenda_escala: null, // % do tamanho padrão (60-160); null = o rótulo P/M/G
    legenda_margem: null, // % da altura entre a faixa e a borda de baixo; null = 8,5%
    legenda_max_linha: 42, // caracteres por linha
    audio: null, // {nome, tamanho, duracao_s, url} -- audio ja salvo no rascunho do servidor
  };
}

// ------------------------------------------------------ rascunho (server) --
// Persiste os campos do assistente e a etapa atual em dados()/rascunho/ no
// servidor, para sobreviver a F5, fechar o navegador e reiniciar o app. O
// audio ja e enviado de imediato ao ser escolhido (ver _receberAudio), entao
// nao faz parte deste payload.
let _rascunhoCarregado = false;
let _rascunhoSalvarTimer = null;

function _payloadRascunho() {
  const { audio, ...pedido } = _produzirEstado;
  return { pedido, etapa_atual: _produzirEtapa };
}

function _indicadorRascunho(texto) {
  const el = document.getElementById("indicador-rascunho");
  if (el) el.textContent = texto;
}

async function _salvarRascunhoAgora() {
  clearTimeout(_rascunhoSalvarTimer);
  _indicadorRascunho("Salvando…");
  try {
    await Api.put("/api/rascunho", _payloadRascunho());
    _indicadorRascunho("Rascunho salvo");
  } catch (_) {
    _indicadorRascunho("");
  }
}

function _agendarSalvarRascunho() {
  // qualquer mudança pode virar "Ajustes deste vídeo": atualiza o ponto de partida
  const conteudo = document.getElementById("conteudo");
  if (conteudo && _produzirEstado) _atualizarPainelLateral(conteudo);
  clearTimeout(_rascunhoSalvarTimer);
  _indicadorRascunho("Salvando…");
  _rascunhoSalvarTimer = setTimeout(_salvarRascunhoAgora, 600);
}

async function _restaurarRascunho() {
  try {
    const r = await Api.get("/api/rascunho");
    Object.assign(_produzirEstado, r.pedido || {});
    _produzirEstado.audio = r.audio || null;
    let etapa = Number(r.etapa_atual) || 1;
    if (!(etapa >= 1 && etapa <= 4)) etapa = 1;
    _produzirEtapa = etapa;
    return Boolean(r.pedido && "estilo" in r.pedido);
  } catch (_) {
    // sem rascunho salvo (ou API indisponivel): segue com o padrao
    return false;
  }
}

// Estilo padrao de um pedido NOVO (sem rascunho salvo): o validado "classico_v"
// quando ja existir, senao o classico atual -- rascunhos com estilo ja salvo
// (inclusive de canais com estilo antigo) nunca sao sobrescritos.
function _estiloPadraoNovoPedido(estilos) {
  const lista = estilos || _estilosCache || [];
  const v = lista.find((x) => x.id === "classico_v");
  return v ? v.id : "classico";
}

async function _comecarDoZero(container) {
  if (!confirm("Isso apaga o rascunho atual (campos e áudio enviado) e começa do zero. Continuar?")) return;
  clearTimeout(_rascunhoSalvarTimer);
  try {
    await Api.del("/api/rascunho");
  } catch (_) { /* segue mesmo se falhar */ }
  _produzirEstado = _estadoProduzirPadrao();
  _produzirEstado.estilo = _estiloPadraoNovoPedido();
  _produzirEtapa = 1;
  _renderStepper(container);
  _renderEtapa(container);
  _indicadorRascunho("");
}

async function telaProduzir(container) {
  if (!_produzirEstado) {
    _produzirEstado = _estadoProduzirPadrao();
    await _carregarEstilos();
    const tinhaEstiloSalvo = await _restaurarRascunho();
    if (!tinhaEstiloSalvo) _produzirEstado.estilo = _estiloPadraoNovoPedido();
    _rascunhoCarregado = true;
  }

  container.innerHTML = `
    <div class="pagina-cabecalho">
      <div><h1>Produzir</h1><p class="pagina-sub">Monte um novo vídeo em 4 passos.</p></div>
      <div style="display:flex; align-items:center; gap:14px;">
        <span class="indicador-rascunho" id="indicador-rascunho"></span>
        <button type="button" class="botao link-simples" id="btn-comecar-do-zero">Começar do zero</button>
      </div>
    </div>
    <div class="grade-cartoes" id="cartoes-status-produzir"></div>
    <div id="banner-chaves-faltando"></div>
    <div class="stepper" id="stepper-produzir"></div>
    <div id="corpo-etapa"></div>
  `;
  container.querySelector("#btn-comecar-do-zero").addEventListener("click", () => _comecarDoZero(container));

  await _carregarEstilos();
  await _carregarCanaisProduzir();
  delete _produzirEstado.projeto_id; // rascunhos antigos (tela Projetos não existe mais)
  // #produzir?canal=<id>[&preset=<id>] (atalho vindo da tela Canais) -- troca explícita
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  if (params.get("canal")) {
    history.replaceState(null, "", "#produzir");
    const canal = _canalPorId(params.get("canal"));
    if (canal) {
      _aplicarCanal(_produzirEstado, canal, params.get("preset"));
      _produzirEtapa = 1;
      _salvarRascunhoAgora();
    }
  }
  if (!container._delegacaoPreset) {
    // o painel lateral é redesenhado (outerHTML): o botão usa delegação
    container._delegacaoPreset = true;
    container.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-acao='salvar-preset']") && (location.hash || "#produzir").startsWith("#produzir")) {
        _abrirModalSalvarPreset(container);
      }
    });
  }
  await _montarCartoesStatus(container);
  await _montarBannerChaves(container);
  _renderStepper(container);
  _renderEtapa(container);
}

// ------------------------------------------------- canal + preset -------
// Canal = identidade (voz, avatar...); preset = ajustes de produção salvos no
// canal. Herança: Vídeo → preset/canal → padrão global. Escolher canal ou
// preset é uma troca EXPLÍCITA (sobrescreve os ajustes); restaurar o rascunho
// nunca reaplica nada. Qualquer mudança depois vira "Ajustes deste vídeo".
// Mesma lista do backend (modelos.CAMPOS_PRESET).
const CAMPOS_PRESET_UI = ["estilo", "trilha", "apresentador", "avatar_intervalo_s",
  "pct_real", "midia_ia", "midia_acervo", "bancos_acervo", "usar_youtube",
  "juiz_visual", "gerador_imagem", "qualidade_openai", "segundos_por_cena", "usar_gpu", "provedor_tts",
  "takes_ativos", "takes_intervalo_s", "takes_lista",
  "legenda_ativa", "legenda_estilo", "legenda_cores", "legenda_tamanho", "legenda_posicao", "legenda_fonte",
  "legenda_sob_templates", "legenda_sob_destaques", "legenda_escala", "legenda_margem", "legenda_max_linha"];

let _canaisProduzir = [];
async function _carregarCanaisProduzir() {
  try {
    _canaisProduzir = await Api.get("/api/canais");
  } catch (_) {
    _canaisProduzir = [];
  }
  return _canaisProduzir;
}
function _canalPorId(id) {
  return id ? (_canaisProduzir || []).find((c) => c.id === id) || null : null;
}
function _presetPorId(canal, id) {
  return canal && id ? (canal.presets || []).find((p) => p.id === id) || null : null;
}
// valor global (padrão do app) de um campo do preset
function _padraoGlobal(k) {
  const d = _estadoProduzirPadrao();
  if (k === "estilo") return _estiloPadraoNovoPedido();
  return d[k];
}
// valor efetivo de um campo com o preset (preset → global)
function _valorPreset(canal, preset, k) {
  const aj = (preset && preset.ajustes) || {};
  if (k === "provedor_tts") return aj.provedor_tts || (canal && canal.provedor_tts) || "";
  if (aj[k] !== undefined && aj[k] !== null) {
    if (k === "estilo") {
      const est = _estiloPorId(aj[k]);
      if (!(est && est.disponivel)) return _padraoGlobal(k); // estilo animado sem Edge
    }
    return aj[k];
  }
  return _padraoGlobal(k);
}
function _aplicarPreset(e, canal, preset) {
  CAMPOS_PRESET_UI.forEach((k) => {
    const v = _valorPreset(canal, preset, k);
    e[k] = v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v;
  });
  e.preset_id = preset ? preset.id : null;
}
// Troca de canal pelo usuário: identidade do canal + o preset padrão dele
// (ou o preset pedido). Sem preset: mantém os ajustes atuais.
function _aplicarCanal(e, canal, presetId) {
  e.canal_id = canal ? canal.id : null;
  _idiomaCanalTts = canal ? canal.idioma || "" : "";
  e.voz_tts = canal ? canal.voz_tts || "" : "";
  e.provedor_tts = canal ? canal.provedor_tts || "" : "";
  if (!canal) { e.preset_id = null; return; }
  const preset = _presetPorId(canal, presetId) || (canal.presets || []).find((p) => p.padrao) || null;
  if (preset) _aplicarPreset(e, canal, preset);
  else e.preset_id = null;
}
function _normalizarComparacao(k, v) {
  if (k === "takes_lista") return JSON.stringify(Array.isArray(v) ? v : TAKES_IDS_UI);
  if (k === "legenda_cores") return JSON.stringify({ ...LEGENDA_CORES_PADRAO, ...(v || {}) });
  if (k === "bancos_acervo") return JSON.stringify(Array.isArray(v) ? [...v].sort() : null);
  return JSON.stringify(v === undefined ? null : v);
}
// true = o vídeo ainda está exatamente como o preset (nada foi mexido)
function _presetIntacto(e) {
  const canal = _canalPorId(e.canal_id);
  const preset = _presetPorId(canal, e.preset_id);
  if (!preset) return false;
  return CAMPOS_PRESET_UI.every((k) => _normalizarComparacao(k, e[k]) === _normalizarComparacao(k, _valorPreset(canal, preset, k)));
}
// Situação do ponto de partida: "padrao" | "preset" | "video"
function _situacaoPreset(e) {
  const canal = _canalPorId(e.canal_id);
  const preset = _presetPorId(canal, e.preset_id);
  if (!preset || !_presetIntacto(e)) return "video";
  return preset.padrao ? "padrao" : "preset";
}
// Ajustes do vídeo atual no formato do preset (sem título/roteiro/áudio)
function _ajustesDoEstado(e) {
  return {
    estilo: e.estilo,
    trilha: !!e.trilha,
    apresentador: !!e.apresentador,
    avatar_intervalo_s: Math.max(15, Math.min(600, Math.round(Number(e.avatar_intervalo_s) || 60))),
    pct_real: e.pct_real,
    midia_ia: e.midia_ia,
    midia_acervo: e.midia_acervo,
    bancos_acervo: Array.isArray(e.bancos_acervo) ? e.bancos_acervo : null,
    usar_youtube: !!e.usar_youtube,
    juiz_visual: e.juiz_visual === true,
    gerador_imagem: e.gerador_imagem || "gpt_image_2",
    qualidade_openai: e.qualidade_openai || "medium",
    segundos_por_cena: e.segundos_por_cena,
    usar_gpu: !!e.usar_gpu,
    provedor_tts: e.provedor_tts || "",
    takes_ativos: !!e.takes_ativos,
    takes_intervalo_s: Math.min(60, Math.max(15, Number(e.takes_intervalo_s) || 25)),
    takes_lista: _takesMarcados(e),
    ..._camposLegenda(e),
  };
}

async function _montarCartoesStatus(container) {
  const producoes = await Api.get("/api/producoes");
  const produzindo = producoes.filter((p) => p.estado?.status === "produzindo").length;
  const naFila = producoes.filter((p) => p.estado?.status === "fila").length;
  const entregues = producoes.filter((p) => p.estado?.status === "pronto");
  const totalMb = entregues.reduce((s, p) => s + (p.arquivos?.video_tamanho_mb || 0), 0);

  container.querySelector("#cartoes-status-produzir").innerHTML = `
    <div class="cartao-status"><div class="rotulo">Produzindo agora</div><div class="valor">${produzindo}</div></div>
    <div class="cartao-status"><div class="rotulo">Na fila</div><div class="valor">${naFila}</div></div>
    <div class="cartao-status"><div class="rotulo">Vídeos entregues</div><div class="valor">${entregues.length} <small>· ${totalMb.toFixed(0)} MB</small></div></div>
    <div class="cartao-status" id="cartao-credito-openrouter"><div class="rotulo">Crédito OpenRouter</div><div class="valor"><small>...</small></div></div>
    <div class="cartao-status" id="cartao-credito-openai"><div class="rotulo">Crédito OpenAI</div><div class="valor"><small>...</small></div></div>
  `;
  // saldo em segundo plano (a consulta ao OpenRouter pode demorar)
  _montarCartoesCredito(container).catch(() => {});
}

async function _montarCartoesCredito(container) {
  const dados = await Api.get("/api/creditos");
  for (const pid of ["openrouter", "openai"]) {
    const el = container.querySelector(`#cartao-credito-${pid}`);
    const info = dados[pid];
    if (!el || !info) continue;
    const desconhecido = info.saldo == null || info.tipo === "desconhecido";
    el.classList.toggle("credito-desconhecido", desconhecido);
    el.classList.toggle("credito-baixo", !desconhecido && info.saldo < 1);
    let valor;
    if (!info.configurado && pid === "openrouter") valor = `<small>sem chave</small>`;
    else if (desconhecido) {
      valor = pid === "openai"
        ? `<small><a href="#custos">informar saldo</a></small>`
        : `<small>desconhecido</small>`;
    } else {
      valor = `${formatarSaldoCredito(info)} <small>(${rotuloTipoSaldo(info.tipo)})</small>`;
    }
    el.querySelector(".valor").innerHTML = valor;
    if (info.aviso) el.title = info.aviso;
  }
}

async function _montarBannerChaves(container) {
  const dados = await Api.get("/api/integracoes");
  const faltando = new Set(dados.obrigatorios_faltando || []);
  const nomesFaltando = [];
  dados.itens.forEach((i) => {
    if (!faltando.has(i.id)) return;
    // transcricao aceita Groq OU OpenAI (a API so marca groq se faltam as duas)
    nomesFaltando.push(i.id === "groq" ? "Groq ou OpenAI (transcrição)" : i.nome);
  });
  // TTS (hoje via OpenAI) so e necessario quando nao ha audio enviado
  const precisaTts = !_temAudio(_produzirEstado);
  if (precisaTts && !dados.tts_disponivel && !faltando.has("groq")) {
    nomesFaltando.push("OpenAI (voz TTS do roteiro)");
  }
  const contagem = nomesFaltando.length;

  const alvo = container.querySelector("#banner-chaves-faltando");
  if (!alvo) return;
  if (contagem === 0) {
    alvo.innerHTML = "";
    return;
  }
  const dica = precisaTts ? " Envie seu próprio áudio para não precisar de TTS." : "";
  alvo.innerHTML = htmlBanner(
    "aviso",
    Icones.alerta,
    `Faltam ${contagem} chave${contagem > 1 ? "s" : ""} para produzir: <strong>${escaparHtml(nomesFaltando.join(", "))}</strong>.${dica}`,
    `<a href="#integracoes" class="botao link-simples">Configurar</a>`
  );
}

function _renderStepper(container) {
  const nomes = ["Canal e conteúdo", "Estilo", "Ajustes", "Revisão"];
  container.querySelector("#stepper-produzir").innerHTML = nomes
    .map((n, i) => {
      const num = i + 1;
      let classe = "";
      if (num < _produzirEtapa) classe = "feito";
      else if (num === _produzirEtapa) classe = "ativo";
      return `<div class="passo ${classe}"><span class="bola">${num < _produzirEtapa ? Icones.check : num}</span>${n}</div>`;
    })
    .join("");
}

async function _renderEtapa(container) {
  const corpo = container.querySelector("#corpo-etapa");
  if (_produzirEtapa === 1) await _etapa1(container, corpo);
  else if (_produzirEtapa === 2) await _etapa2(container, corpo);
  else if (_produzirEtapa === 3) { await Promise.all([_carregarGeradores(), _carregarBancos()]); _etapa3(container, corpo); }
  else await _etapa4(container, corpo);
}

function _irParaEtapa(container, n) {
  _produzirEtapa = n;
  _salvarRascunhoAgora();
  _renderStepper(container);
  _renderEtapa(container);
}

function _nomeCanal(e) {
  const c = _canalPorId(e.canal_id);
  return c ? c.nome : e.canal_id ? `${e.canal_id} (removido)` : "Nenhum — configuração manual";
}
function _rotuloMaterialReal(e) {
  if (Number(e.pct_real) >= 100) return "Máximo disponível";
  return `${e.pct_real}% (alvo)`;
}
// "Seu ponto de partida": preset/canal de base + estado do vídeo
function _pontoPartidaHtml(e) {
  const canal = _canalPorId(e.canal_id);
  const preset = _presetPorId(canal, e.preset_id);
  const situacao = _situacaoPreset(e);
  const est = _estiloPorId(e.estilo);
  const titulo = situacao === "video" ? "Configuração deste vídeo" : preset.nome;
  const selo = situacao === "padrao"
    ? '<span class="pp-selo pp-selo-ok">● Padrão deste canal</span>'
    : situacao === "preset"
      ? '<span class="pp-selo pp-selo-ok">● Preset do canal</span>'
      : `<span class="pp-selo">Ajustes só neste vídeo${preset ? ` · base “${escaparHtml(preset.nome)}”` : ""}</span>`;
  return `
    <div class="ponto-partida">
      ${est ? `<div class="pp-miniatura">${_miniaturaEstiloHtml(est)}</div>` : ""}
      <div class="pp-rotulo">Seu ponto de partida</div>
      <div class="pp-nome">${escaparHtml(titulo)}</div>
      <div class="pp-canal">${escaparHtml(_nomeCanal(e))}</div>
      ${selo}
      <div class="resumo-linha"><span class="k">Estilo</span><span class="v">${est ? escaparHtml(est.nome) : escaparHtml(e.estilo || "-")}</span></div>
      <div class="resumo-linha"><span class="k">Narração</span><span class="v">${_temAudio(e) ? "Seu áudio" : escaparHtml(_rotuloVozCurto(e))}</span></div>
      <div class="resumo-linha"><span class="k">Material real</span><span class="v">${escaparHtml(_rotuloMaterialReal(e))}</span></div>
      <button type="button" class="botao pp-botao" data-acao="salvar-preset" ${canal ? "" : "disabled title=\"Escolha um canal para salvar um preset\""}>Salvar configuração</button>
      <p class="ajuda pp-nota">${canal ? "Título, roteiro e áudio ficam fora do preset." : "Escolha um canal para guardar esta configuração como preset."}</p>
    </div>`;
}

function _painelLateralResumo() {
  const e = _produzirEstado;
  return `
    <div class="painel-lateral">
      ${_pontoPartidaHtml(e)}
      <h3 style="margin-top:14px;">Este vídeo</h3>
      <div class="resumo-linha"><span class="k">Nome</span><span class="v">${escaparHtml(e.nome || "-")}</span></div>
      <div class="resumo-linha"><span class="k">Fonte</span><span class="v">${escaparHtml(_descricaoFonte(e))}</span></div>
      <div class="resumo-linha"><span class="k">Voz</span><span class="v">${_temAudio(e) ? "Áudio enviado" : escaparHtml(_rotuloVozCurto(e))}</span></div>
      <div class="resumo-linha"><span class="k">Pasta</span><span class="v">${escaparHtml(e.pasta_saida || "-")}</span></div>
      <div class="resumo-linha"><span class="k">Estilo</span><span class="v">${_estiloResumoTexto(e.estilo)}</span></div>
      <div class="resumo-linha"><span class="k">Trilha</span><span class="v">${e.trilha ? "Sim" : "Não"}</span></div>
      <div class="resumo-linha"><span class="k">Real x IA</span><span class="v">${e.pct_real}% / ${100 - e.pct_real}%</span></div>
      <div class="resumo-linha"><span class="k">Imagem IA</span><span class="v">${escaparHtml(_rotuloGeradorCurto(e.gerador_imagem))}</span></div>
      <div class="resumo-linha"><span class="k">Juiz visual</span><span class="v">${e.juiz_visual ? "Ligado" : "Desligado"}</span></div>
      <div class="resumo-linha"><span class="k">s/cena</span><span class="v">${e.segundos_por_cena}s</span></div>
      <div class="resumo-linha"><span class="k">Templates</span><span class="v">${escaparHtml(_rotuloTakes(e))}</span></div>
      <div class="resumo-linha"><span class="k">Legenda</span><span class="v">${escaparHtml(_rotuloLegenda(e))}</span></div>
    </div>`;
}

// ---------------------------------------------------------------- etapa 1 --
async function _etapa1(container, corpo) {
  const canais = await _carregarCanaisProduzir();
  const e = _produzirEstado;
  const canalAtual = _canalPorId(e.canal_id);
  const situacao = _situacaoPreset(e);
  corpo.innerHTML = `
    <div class="layout-assistente">
      <div class="cartao">
        <div class="secao-produzir-titulo">Para qual canal?</div>
        <div class="linha-campos">
          <div class="campo">
            <label for="p-canal">Canal</label>
            <select id="p-canal">
              <option value="">Nenhum — configuração manual</option>
              ${canais.map((c) => `<option value="${escaparHtml(c.id)}" ${e.canal_id === c.id ? "selected" : ""}>${escaparHtml(c.nome)}</option>`).join("")}
              ${e.canal_id && !canalAtual ? `<option value="${escaparHtml(e.canal_id)}" selected>${escaparHtml(e.canal_id)} (removido)</option>` : ""}
            </select>
            <div class="ajuda">${canalAtual ? "A voz e o apresentador seguem a configuração deste canal." : "Configuração manual, sem a voz e o apresentador de um canal."} <a href="#canais${canalAtual ? "?id=" + encodeURIComponent(canalAtual.id) : ""}">${canalAtual ? "Editar canal" : "Criar canal"}</a></div>
          </div>
          ${canalAtual ? `
          <div class="campo">
            <label for="p-preset">Preset de produção</label>
            <select id="p-preset">
              ${(canalAtual.presets || []).map((p) => `<option value="${escaparHtml(p.id)}" ${situacao !== "video" && e.preset_id === p.id ? "selected" : ""}>${escaparHtml(p.nome)}${p.padrao ? " · padrão" : ""}</option>`).join("")}
              <option value="" ${situacao === "video" ? "selected" : ""}>Ajustes deste vídeo</option>
            </select>
            <div class="ajuda" id="p-preset-ajuda">${situacao === "padrao"
              ? '<span class="msg-teste-ok">Usando o padrão do canal</span>'
              : situacao === "preset" ? "Preset do canal aplicado." : "Ajustes deste vídeo · salve para reutilizar no canal"}</div>
          </div>` : ""}
        </div>
        <div class="secao-produzir-titulo">Conteúdo do vídeo <span>· o roteiro e o áudio pertencem só a esta produção</span></div>
        <div class="campo">
          <label>Nome do vídeo</label>
          <input type="text" id="p-nome" value="${escaparHtml(e.nome)}" placeholder="ex.: 10 fatos sobre o oceano" />
        </div>
        <div class="campo">
          <label>Roteiro <span class="rotulo-opcional">(opcional se enviar áudio)</span></label>
          <div id="bloco-roteiro">
            <textarea id="p-roteiro" placeholder="Cole ou escreva o roteiro completo aqui...">${escaparHtml(e.roteiro_texto)}</textarea>
          </div>
        </div>
        <div class="campo">
          <label>Áudio da narração <span class="rotulo-opcional">(opcional se enviar roteiro)</span></label>
          <div id="bloco-audio">
            <div class="dropzone" id="p-dropzone">
              <div>Arraste um arquivo de audio aqui, ou clique para escolher</div>
              <div class="arquivo-selecionado" id="p-audio-info"></div>
              <input type="file" id="p-audio-input" accept="audio/*" style="display:none;" />
            </div>
            <audio id="p-audio-preview" style="display:none;"></audio>
            <button type="button" class="botao link-simples" id="p-audio-remover" style="${e.audioFile ? "" : "display:none;"}">Remover áudio</button>
          </div>
          <div class="ajuda" id="p-fonte-ajuda">${_ajudaFonte(e)}</div>
        </div>
        <div class="campo">
          <label>Pasta de saída</label>
          <input type="text" id="p-pasta" value="${escaparHtml(e.pasta_saida)}" />
          <div class="ajuda">O vídeo final é copiado para esta pasta ao terminar. "Downloads" = sua pasta Downloads; caminho completo (ex.: D:/Videos) também vale.</div>
        </div>
      </div>
      ${_painelLateralResumo()}
    </div>
    <div class="barra-navegacao-assistente">
      <span></span>
      <button class="botao primario" id="btn-proximo-1">Próximo</button>
    </div>
  `;

  corpo.querySelector("#p-canal").addEventListener("change", async (ev) => {
    // troca de canal PELO USUÁRIO: identidade + preset padrão do canal
    _aplicarCanal(e, _canalPorId(ev.target.value || null));
    _salvarRascunhoAgora();
    await _etapa1(container, corpo);
  });
  corpo.querySelector("#p-preset")?.addEventListener("change", async (ev) => {
    const canal = _canalPorId(e.canal_id);
    const preset = _presetPorId(canal, ev.target.value);
    if (preset) _aplicarPreset(e, canal, preset); // troca explícita: sobrescreve
    else e.preset_id = null; // "Ajustes deste vídeo": mantém os valores atuais
    _salvarRascunhoAgora();
    await _etapa1(container, corpo);
  });
  corpo.querySelector("#p-nome").addEventListener("input", (ev) => {
    e.nome = ev.target.value;
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#p-pasta").addEventListener("input", (ev) => {
    e.pasta_saida = ev.target.value;
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  });
  const aoMudarFonte = () => {
    corpo.querySelector("#p-fonte-ajuda").innerHTML = _ajudaFonte(e);
    corpo.querySelector("#p-audio-remover").style.display = e.audio ? "" : "none";
    _atualizarPainelLateral(container);
  };
  corpo.querySelector("#p-roteiro").addEventListener("input", (ev) => {
    e.roteiro_texto = ev.target.value;
    aoMudarFonte();
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#p-audio-remover").addEventListener("click", async (ev) => {
    ev.stopPropagation();
    try {
      await Api.del("/api/rascunho/audio");
    } catch (_) { /* remove localmente mesmo se a chamada falhar */ }
    e.audio = null;
    corpo.querySelector("#p-audio-input").value = "";
    corpo.querySelector("#p-audio-info").textContent = "";
    corpo.querySelector("#p-audio-preview").style.display = "none";
    aoMudarFonte();
    _montarBannerChaves(container);
  });
  // chamado por _receberAudio quando um arquivo e escolhido/arrastado
  corpo._aoMudarFonte = () => { aoMudarFonte(); _montarBannerChaves(container); };

  const dropzone = corpo.querySelector("#p-dropzone");
  const inputArquivo = corpo.querySelector("#p-audio-input");
  dropzone.addEventListener("click", () => inputArquivo.click());
  inputArquivo.addEventListener("change", () => _receberAudio(corpo, inputArquivo.files[0]));
  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e2) => {
      e2.preventDefault();
      dropzone.classList.add("arrastando");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e2) => {
      e2.preventDefault();
      dropzone.classList.remove("arrastando");
    })
  );
  dropzone.addEventListener("drop", (e2) => {
    const arquivo = e2.dataTransfer.files[0];
    if (arquivo) _receberAudio(corpo, arquivo);
  });
  if (e.audio) _mostrarAudioSelecionado(corpo, e.audio);

  corpo.querySelector("#btn-proximo-1").addEventListener("click", () => {
    if (!e.nome.trim()) { alert("Escolha um nome para o vídeo."); return; }
    if (!_temAudio(e) && !_temRoteiro(e)) { alert("Envie o áudio da narração ou escreva o roteiro (pelo menos um dos dois)."); return; }
    _irParaEtapa(container, 2);
  });
}

// ------------------------------------------------ narracao (TTS) ---------
let _idiomaCanalTts = ""; // idioma do canal escolhido: ordena as vozes que falam o idioma primeiro
const PROVEDORES_TTS_UI = [
  ["", "Automático (OpenAI se houver chave, senão Dark Planner)"],
  ["openai", "OpenAI TTS (cobrado por minuto)"],
  ["darkplanner", "Dark Planner (sua assinatura — não precisa do app aberto)"],
];
function _rotuloVozCurto(e) {
  const prov = e.provedor_tts === "darkplanner" ? "Dark Planner" : e.provedor_tts === "openai" ? "OpenAI" : "Automático";
  return e.voz_tts ? `${prov} · ${e.voz_tts}` : prov;
}
function _rotuloNarracaoTts(e) {
  const prov = e.provedor_tts === "darkplanner" ? "Dark Planner" : e.provedor_tts === "openai" ? "OpenAI TTS" : "TTS automático";
  return `Voz sintética · ${prov}${e.voz_tts ? " · " + e.voz_tts : ""}`;
}
function _secaoNarracaoHtml(e) {
  return `
    <div class="linha-campos">
      <div class="campo">
        <label>Provedor da voz</label>
        ${_selectHtml("p-provedor-tts", PROVEDORES_TTS_UI, e.provedor_tts || "")}
      </div>
      <div class="campo">
        <label>Voz</label>
        <select id="p-voz-tts" ${e.provedor_tts ? "" : "disabled"}><option value="">${e.provedor_tts ? "Carregando vozes..." : "Padrão do provedor"}</option></select>
      </div>
    </div>
    <p class="ajuda" id="p-narracao-ajuda">O roteiro será narrado por voz sintética. Dark Planner usa a cota diária da sua assinatura (não precisa do app aberto); OpenAI é cobrada por minuto.</p>`;
}
async function _carregarVozesTts(corpo, e) {
  const sel = corpo.querySelector("#p-voz-tts");
  const ajuda = corpo.querySelector("#p-narracao-ajuda");
  if (!sel) return;
  const prov = e.provedor_tts || "";
  if (!prov) {
    sel.innerHTML = `<option value="">Padrão do provedor</option>`;
    sel.disabled = true;
    return;
  }
  sel.disabled = true;
  sel.innerHTML = `<option value="">Carregando vozes...</option>`;
  try {
    const idioma = _idiomaCanalTts || "";
    const r = await Api.get(`/api/vozes?provedor=${encodeURIComponent(prov)}${idioma ? "&idioma=" + encodeURIComponent(idioma) : ""}`);
    if ((e.provedor_tts || "") !== prov) return; // trocou no meio
    const vozes = r.vozes || [];
    const atual = e.voz_tts && vozes.some((v) => v.id === e.voz_tts) ? e.voz_tts : "";
    sel.innerHTML = `<option value="">Padrão${r.padrao ? " (" + escaparHtml(r.padrao) + ")" : ""}</option>` +
      vozes.map((v) => `<option value="${escaparHtml(v.id)}" ${v.id === atual ? "selected" : ""}>${escaparHtml(v.nome)}${v.idiomas && v.idiomas.length ? " · " + escaparHtml(v.idiomas.slice(0, 3).join(", ")) : ""}</option>`).join("");
    if (e.voz_tts && !atual) {
      // voz salva de outro provedor/catalogo: mantem visivel para nao perder a escolha
      sel.insertAdjacentHTML("beforeend", `<option value="${escaparHtml(e.voz_tts)}" selected>${escaparHtml(e.voz_tts)} (salva)</option>`);
    }
    sel.disabled = false;
    if (ajuda && prov === "darkplanner") ajuda.textContent = "Dark Planner: usa a cota diária da sua assinatura. Mantenha o app do Dark Planner aberto durante a produção.";
  } catch (exc) {
    sel.innerHTML = `<option value="">(vozes indisponíveis)</option>`;
    if (ajuda) {
      ajuda.innerHTML = `<span class="msg-teste-erro">${escaparHtml(exc.message || "Falha ao carregar as vozes.")}</span> <a href="#integracoes">Integrações</a>`;
    }
  }
}
function _ligarSecaoNarracao(container, corpo, e) {
  const selProv = corpo.querySelector("#p-provedor-tts");
  const selVoz = corpo.querySelector("#p-voz-tts");
  if (!selProv || !selVoz) return;
  selProv.addEventListener("change", (ev) => {
    e.provedor_tts = ev.target.value || "";
    e.voz_tts = "";
    _carregarVozesTts(corpo, e);
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  });
  selVoz.addEventListener("change", (ev) => {
    e.voz_tts = ev.target.value || "";
    _agendarSalvarRascunho();
  });
  _carregarVozesTts(corpo, e);
}

function _ajudaFonte(e) {
  const base = "Com áudio: ele é a narração (nada é gerado). Com roteiro também: o roteiro guia cenas e textos na tela.";
  let situacao;
  if (_temAudio(e) && _temRoteiro(e)) situacao = "Seu áudio será a narração; o roteiro define a grafia dos textos e guia as cenas.";
  else if (_temAudio(e)) situacao = "Seu áudio será a narração; os textos do vídeo vêm da transcrição.";
  else if (_temRoteiro(e)) situacao = "Sem áudio: o roteiro será narrado por voz sintética (TTS).";
  else situacao = "Envie o áudio, escreva o roteiro, ou os dois.";
  return `${base}<br><strong>${escaparHtml(situacao)}</strong>`;
}

// Envia o audio IMEDIATAMENTE ao rascunho do servidor (com progresso), para
// que ele sobreviva a F5/fechar o navegador mesmo antes de "Produzir".
async function _receberAudio(corpo, arquivo) {
  if (!arquivo) return;
  _mostrarAudioEnviando(corpo, arquivo, 0);
  try {
    const form = new FormData();
    form.append("audio", arquivo);
    const resp = await Api.postFormComProgresso("/api/rascunho/audio", form, (pct) => {
      _mostrarAudioEnviando(corpo, arquivo, pct);
    });
    _produzirEstado.audio = { nome: resp.nome, tamanho: resp.tamanho, duracao_s: resp.duracao_s, url: resp.url };
    _mostrarAudioSelecionado(corpo, _produzirEstado.audio);
    if (corpo._aoMudarFonte) corpo._aoMudarFonte();
  } catch (exc) {
    alert("Erro ao enviar áudio: " + exc.message);
    corpo.querySelector("#p-audio-info").textContent = "";
    corpo.querySelector("#p-audio-input").value = "";
  }
}

function _mostrarAudioEnviando(corpo, arquivo, pct) {
  const info = corpo.querySelector("#p-audio-info");
  const preview = corpo.querySelector("#p-audio-preview");
  preview.style.display = "none";
  info.innerHTML = `Enviando ${escaparHtml(arquivo.name)}... ${pct}%`;
  corpo.querySelector("#p-audio-remover").style.display = "none";
}

function _mostrarAudioSelecionado(corpo, audio) {
  const info = corpo.querySelector("#p-audio-info");
  const preview = corpo.querySelector("#p-audio-preview");
  preview.src = `${audio.url}?t=${Date.now()}`; // evita cache ao trocar de audio
  preview.style.display = "";
  const duracao = audio.duracao_s != null ? ` · ${formatarDuracao(audio.duracao_s)}` : "";
  info.innerHTML = `${Icones.check} Áudio enviado (${escaparHtml(audio.nome)}${duracao})`;
  corpo.querySelector("#p-audio-remover").style.display = "";
}

function _atualizarPainelLateral(container) {
  const painel = container.querySelector(".painel-lateral");
  if (painel) painel.outerHTML = _painelLateralResumo();
}

// ---------------------------------------------------------------- etapa 2 --
// Aba ativa da grade de estilos (validado | teste); persiste entre re-renders
// da etapa, comecando pelo grupo do estilo ja selecionado (rascunho/canal).
let _produzirAbaEstilo = null;

function _grupoRotulo(grupo) {
  return grupo === "validado" ? "validado" : "teste";
}

// "Nome · validado/teste", usado no resumo lateral e na revisao final.
function _estiloResumoTexto(id) {
  const est = _estiloPorId(id);
  if (!est) return escaparHtml(id || "-");
  return `${escaparHtml(est.nome)} · ${_grupoRotulo(est.grupo)}`;
}

function _miniaturaEstiloHtml(est) {
  if (est.previa_img_url) {
    return `<img class="miniatura-estilo" src="${est.previa_img_url}" alt="Prévia de ${escaparHtml(est.nome)}" />`;
  }
  const paleta = est.paleta || {};
  const fundo = paleta.fundo || "#111318";
  const acento = paleta.acento || "#e5252a";
  const texto = paleta.texto || "#ffffff";
  const fonteTitulo = (est.fontes || {}).titulo || "inherit";
  return `
    <div class="miniatura-estilo miniatura-estilo-css" style="background: linear-gradient(135deg, ${fundo} 55%, ${acento} 220%); color: ${texto};">
      <span class="miniatura-estilo-nome" style="font-family: ${fonteTitulo}; border-color: ${acento}; color: ${acento};">${escaparHtml(est.nome)}</span>
    </div>`;
}

function _cartaoEstiloHtml(est, selecionadoId) {
  const bloqueado = est.disponivel === false;
  return `
    <div class="cartao-estilo ${selecionadoId === est.id ? "selecionado" : ""} ${bloqueado ? "desabilitado" : ""}" data-id="${est.id}">
      <span class="selo-estilo-grupo selo-estilo-${_grupoRotulo(est.grupo)}">${_grupoRotulo(est.grupo)}</span>
      ${_miniaturaEstiloHtml(est)}
      <h4>${escaparHtml(est.nome)}</h4>
      <p>${escaparHtml(est.descricao)}</p>
      ${bloqueado ? '<div class="aviso-estilo-bloqueado">Precisa do Microsoft Edge instalado</div>' : ""}
    </div>`;
}

function _previaEstiloHtml(est) {
  if (!est) return "";
  if (est.previa_video_url) {
    return `<video class="video-previa-estilo" controls muted playsinline poster="${est.previa_img_url || ""}" src="${est.previa_video_url}"></video>`;
  }
  const pecas = est.pecas || [];
  return `
    <div class="previa-estilo-placeholder">
      <p><strong>Prévia ainda não gerada.</strong></p>
      <p>${escaparHtml(est.descricao)}</p>
      ${pecas.length ? `<div class="ajuda">Peças deste estilo: ${pecas.map(escaparHtml).join(", ")}</div>` : ""}
    </div>`;
}

function _abasEstiloHtml(abaAtiva) {
  return `
    <div class="abas-estilo" id="abas-estilo">
      <button type="button" class="aba-estilo ${abaAtiva === "validado" ? "ativa" : ""}" data-grupo="validado">Estilos validados</button>
      <button type="button" class="aba-estilo ${abaAtiva === "teste" ? "ativa" : ""}" data-grupo="teste">Estilos teste</button>
    </div>`;
}

async function _etapa2(container, corpo) {
  const e = _produzirEstado;
  const estilos = await _carregarEstilos();
  if (_produzirAbaEstilo !== "validado" && _produzirAbaEstilo !== "teste") {
    const atual = _estiloPorId(e.estilo);
    _produzirAbaEstilo = _grupoRotulo(atual && atual.grupo);
  }
  const selecionado = _estiloPorId(e.estilo) || estilos[0];
  const estilosDaAba = (grupo) => estilos.filter((est) => _grupoRotulo(est.grupo) === grupo);

  corpo.innerHTML = `
    <div class="layout-assistente">
      <div>
        <div class="cartao">
          ${_abasEstiloHtml(_produzirAbaEstilo)}
          <div class="grade-estilos" id="grade-estilos">
            ${estilosDaAba(_produzirAbaEstilo).map((est) => _cartaoEstiloHtml(est, e.estilo)).join("")}
          </div>
          <div class="campo">
            <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
              <input type="checkbox" id="p-trilha" ${e.trilha ? "checked" : ""} style="width:auto;" /> Trilha sonora
            </label>
            <div class="ajuda">Desmarque para este vídeo sair sem música. A narração continua.${_canalPorId(e.canal_id) ? " A música e o volume vêm do canal." : ""}</div>
          </div>
          <div class="campo">
            <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
              <input type="checkbox" id="p-apresentador" ${e.apresentador ? "checked" : ""} style="width:auto;" /> Apresentador
            </label>
            <div class="ajuda">${(_canalPorId(e.canal_id) || {}).avatar_padrao_id
              ? "Desmarque para este vídeo sair sem apresentador. O rosto escolhido no canal continua guardado."
              : "Sem apresentador neste canal: escolha um avatar padrão na tela Canais para ele aparecer."}</div>
          </div>
          <div class="campo">
            <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
              <input type="checkbox" id="p-takes-ativos" ${e.takes_ativos ? "checked" : ""} style="width:auto;" /> <span id="p-takes-ativos-rotulo">Templates a cada ${e.takes_intervalo_s || 25} segundos</span>
            </label>
            <div class="ajuda" id="p-takes-ativos-ajuda">Composições com as imagens do vídeo — abertura em 1 s e depois a cada ${e.takes_intervalo_s || 25} s. Funciona em qualquer estilo.</div>
            <details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>Templates disponíveis no rodízio: ${TAKES_UI.map(([, nome]) => escaparHtml(nome)).join(", ")}.</p></details>
          </div>
          <div class="campo">
            <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
              <input type="checkbox" id="p-legenda-ativa" ${e.legenda_ativa ? "checked" : ""} style="width:auto;" /> Legenda (preenchimento karaokê)
            </label>
            <div class="ajuda">Blocos curtos sincronizados com a fala: a palavra dita se preenche de branco sobre uma faixa escura. Prévia em escala real (1920×1080); tamanho, posição, fonte e cores em Ajustes, onde dá para testar com o render real. Sai também a legenda.srt.</div>
            <div id="p-legenda-previa-2" style="${e.legenda_ativa ? "" : "display:none;"}"></div>
          </div>
        </div>
        <div class="cartao">
          <div class="previa-estilo-cabecalho">
            <span>Selecionado: <strong id="previa-estilo-nome">${escaparHtml(selecionado ? selecionado.nome : "-")}</strong></span>
            <a href="${selecionado && selecionado.previa_video_url ? selecionado.previa_video_url : "#"}" id="previa-estilo-link" class="botao link-simples" target="_blank" rel="noopener" style="${selecionado && selecionado.previa_video_url ? "" : "display:none;"}">Ver prévia em vídeo</a>
          </div>
          <div id="previa-estilo-corpo">${_previaEstiloHtml(selecionado)}</div>
        </div>
      </div>
      ${_painelLateralResumo()}
    </div>
    <div class="barra-navegacao-assistente">
      <button class="botao" id="btn-voltar-2">Voltar</button>
      <button class="botao primario" id="btn-proximo-2">Próximo</button>
    </div>
  `;

  corpo.querySelectorAll(".aba-estilo").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.grupo === _produzirAbaEstilo) return;
      _produzirAbaEstilo = btn.dataset.grupo;
      _etapa2(container, corpo);
    });
  });

  const pv2El = corpo.querySelector("#p-legenda-previa-2");
  let previa2 = e.legenda_ativa ? LegendaPrevia.montar(pv2El, () => e, { compacta: true }) : null;

  const _atualizarPreviaEstilo = () => {
    const est = _estiloPorId(e.estilo);
    corpo.querySelector("#previa-estilo-nome").textContent = est ? est.nome : "-";
    const link = corpo.querySelector("#previa-estilo-link");
    if (est && est.previa_video_url) {
      link.href = est.previa_video_url;
      link.style.display = "";
    } else {
      link.style.display = "none";
    }
    corpo.querySelector("#previa-estilo-corpo").innerHTML = _previaEstiloHtml(est);
  };

  corpo.querySelectorAll(".cartao-estilo").forEach((c) => {
    c.addEventListener("click", () => {
      const est = _estiloPorId(c.dataset.id);
      if (!est || est.disponivel === false) return;
      e.estilo = est.id;
      corpo.querySelectorAll(".cartao-estilo").forEach((x) => x.classList.toggle("selecionado", x === c));
      _atualizarPreviaEstilo();
      if (previa2) previa2.atualizar(); // fonte e quadro do estilo
      _atualizarPainelLateral(container);
      _agendarSalvarRascunho();
    });
  });
  corpo.querySelector("#p-trilha").addEventListener("change", (ev) => {
    e.trilha = ev.target.checked;
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#p-apresentador").addEventListener("change", (ev) => {
    e.apresentador = ev.target.checked;
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#p-takes-ativos").addEventListener("change", (ev) => {
    e.takes_ativos = ev.target.checked;
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#p-legenda-ativa").addEventListener("change", (ev) => {
    e.legenda_ativa = ev.target.checked;
    const pv = corpo.querySelector("#p-legenda-previa-2");
    pv.style.display = e.legenda_ativa ? "" : "none";
    if (e.legenda_ativa && !previa2) previa2 = LegendaPrevia.montar(pv, () => e, { compacta: true });
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#btn-voltar-2").addEventListener("click", () => _irParaEtapa(container, 1));
  corpo.querySelector("#btn-proximo-2").addEventListener("click", () => _irParaEtapa(container, 3));
}

// ---------------------------------------------------------------- etapa 3 --
function _etapa3(container, corpo) {
  const e = _produzirEstado;
  corpo.innerHTML = `
    <div class="layout-assistente">
      <div>
        <details class="secao" open>
          <summary>Imagens do vídeo</summary>
          <div class="corpo-secao">
            <div class="campo">
              <label>Footage real x IA</label>
              <div class="slider-linha">
                <input type="range" id="p-pct-real" min="0" max="100" step="5" value="${e.pct_real}" />
                <span class="slider-rotulo" id="p-pct-real-rotulo">${e.pct_real}% real / ${100 - e.pct_real}% IA</span>
              </div>
              <details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>Controla quanto do video tenta usar video/foto real do acervo (bancos marcados abaixo) antes de recorrer a imagens geradas por IA. Cenas que o acervo nao consegue preencher sempre caem para IA.</p></details>
            </div>
            <div class="linha-campos">
              <div class="campo">
                <label>Mídia da IA</label>
                <select id="p-midia-ia">
                  <option value="so_imagens" ${e.midia_ia === "so_imagens" ? "selected" : ""}>Só imagens</option>
                  <option value="imagens_videos" ${e.midia_ia === "imagens_videos" ? "selected" : ""} disabled>Imagens + videos (em breve)</option>
                </select>
              </div>
              <div class="campo">
                <label>Mídia do acervo</label>
                <select id="p-midia-acervo">
                  <option value="fotos_videos" ${e.midia_acervo === "fotos_videos" ? "selected" : ""}>Fotos + vídeos</option>
                  <option value="so_fotos" ${e.midia_acervo === "so_fotos" ? "selected" : ""}>Só fotos</option>
                  <option value="so_videos" ${e.midia_acervo === "so_videos" ? "selected" : ""}>Só vídeos</option>
                </select>
              </div>
            </div>
            <details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>"Mídia da IA" define se as cenas resolvidas por IA usam só imagens. "Mídia do acervo" filtra o tipo de mídia buscado nos bancos de vídeo/foto.</p></details>
            <div class="campo">
              <label>Bancos de acervo</label>
              <div id="p-bancos-acervo">${_listaBancosHtml(e)}</div>
              <div id="p-bloco-youtube" style="margin-top:8px;">
                <label style="display:flex; align-items:center; gap:8px; font-weight:400;"><input type="checkbox" id="p-usar-youtube" ${e.usar_youtube ? "checked" : ""} style="width:auto;" /> Completar com trechos do YouTube</label>
                <p class="ajuda" style="margin:4px 0 0;">${Icones.alerta || ""} Trechos de até 4 s, sem rostos, no máx. 2 por vídeo — só para completar a % de filmagem real. Baixar do YouTube vai contra os Termos do YouTube; a conta usada pode ser marcada. Precisa de uma conta do YouTube (secundária) conectada em Integrações; se o YouTube pedir verificação, a fonte é pausada naquela produção.</p>
              </div>
              <details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>Bancos de vídeo/foto real consultados, na ordem da lista (Pexels, Coverr e Pixabay juntos primeiro). Ligados por padrão só os sem casos documentados de problema de direitos autorais; a nota ao lado de cada banco resume o risco conhecido. Bancos que precisam de chave só podem ser marcados depois de configurados em Integrações. O crédito (autor, licença, link) de tudo o que for usado vai para o CREDITS.txt.</p></details>
            </div>
            <div class="campo">
              <label style="display:flex; align-items:center; gap:8px; font-weight:400;">
                <input type="checkbox" id="p-juiz-visual" ${e.juiz_visual ? "checked" : ""} style="width:auto;" /> Juiz visual (garante que o acervo mostre o tema do vídeo)
              </label>
              <details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>Uma IA olha 3 quadros de cada vídeo candidato e só aceita se o assunto do roteiro aparecer (ex.: carros). Custa poucos centavos por vídeo (OpenRouter). Desligado, o programa usa só os metadados do banco.</p></details>
            </div>
            <div class="linha-campos">
              <div class="campo">
                <label>Gerador de imagem IA</label>
                <select id="p-gerador-imagem">${_opcoesGeradorHtml(e)}</select>
              </div>
              <div class="campo">
                <label>Qualidade OpenAI</label>
                <select id="p-qualidade-openai">${_opcoesQualidadeHtml(e)}</select>
              </div>
            </div>
            <details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>"OpenAI GPT Image 2" (padrão) gera em 16:9 nativo e é o mais barato/nítido. "Intercalar" alterna Nano Banana (Google, via OpenRouter) e GPT Image 2 entre as cenas de IA; se um deles falhar, ficar sem saldo ou sem chave, o outro gera a cena (e por fim o GPT Image 1, legado). Nano Banana Pro gera em 2K (mais nítido, mais caro). A qualidade OpenAI vale para as cenas geradas pela OpenAI (GPT Image 2 ou 1): Baixa é a mais barata, Média (padrão) é bem mais nítida, Alta custa bem mais. Valores por imagem são aproximados.</p></details>
          </div>
        </details>

        <details class="secao" ${e.takes_ativos ? "open" : ""}>
          <summary>Takes (composições)</summary>
          <div class="corpo-secao">
            ${e.takes_ativos ? "" : '<p class="ajuda">Desligado. <a href="#" id="p-takes-ir-estilo">Ativar na etapa Estilo</a>.</p>'}
            <div class="campo">
              <label>Intervalo entre takes</label>
              <div class="slider-linha">
                <input type="range" id="p-takes-intervalo" min="15" max="60" step="5" value="${e.takes_intervalo_s || 25}" ${e.takes_ativos ? "" : "disabled"} />
                <span class="slider-rotulo" id="p-takes-intervalo-rotulo">${e.takes_intervalo_s || 25}s</span>
              </div>
            </div>
            <div class="campo">
              <label>Takes no rodízio</label>
              <div id="p-takes-lista">${_listaTakesHtml(e)}</div>
            </div>
            <details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>Takes são composições em tela cheia (mosaicos, painéis, vidro, papel...) montadas com as fotos e imagens do próprio vídeo, no visual do estilo escolhido (vale também para o Clássico). O "Encaixe de Quadros" abre o vídeo em 1 s; depois entra um take a cada intervalo, em rodízio pela lista marcada. Se cair em cima de um destaque ou de um trecho de filmagem, o take vai para 5 s depois dele; sem espaço até o próximo, aquele take é pulado.</p></details>
          </div>
        </details>

        ${e.legenda_ativa ? _secaoLegendaHtml(e) : ""}

        <details class="secao" ${_temAudio(e) ? "" : "open"}>
          <summary>Narração</summary>
          <div class="corpo-secao">
            ${_temAudio(e)
              ? `<p class="pagina-sub">${_temRoteiro(e)
                  ? "Você enviou seu próprio áudio: ele é a narração (sem TTS). O roteiro escrito guia cenas e textos na tela."
                  : "Você enviou seu próprio áudio: não será usado TTS."}</p>`
              : _secaoNarracaoHtml(e)}
          </div>
        </details>

        <details class="secao">
          <summary>Tempo e processamento</summary>
          <div class="corpo-secao">
            <div class="campo">
              <label>Segundos por cena</label>
              <div class="slider-linha">
                <input type="range" id="p-spc" min="3.0" max="7.0" step="0.5" value="${e.segundos_por_cena}" />
                <span class="slider-rotulo" id="p-spc-rotulo">${e.segundos_por_cena}s</span>
              </div>
              <details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>Duração alvo de cada cena/beat do vídeo. Cenas mais curtas dão um ritmo mais rápido, mas exigem mais mídia.</p></details>
            </div>
            <div class="campo">
              <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
                <input type="checkbox" id="p-gpu" ${e.usar_gpu ? "checked" : ""} style="width:auto;" /> Usar placa de video (GPU) na montagem
              </label>
              <details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>Acelera a codificacao final do video usando a GPU (NVENC), quando disponivel. Se sua placa nao suportar, o robo usa a CPU normalmente.</p></details>
            </div>
          </div>
        </details>

        <details class="secao" ${e.apresentador ? "open" : ""}>
          <summary>Apresentador (HeyGen)</summary>
          <div class="corpo-secao">
            ${e.apresentador ? "" : '<p class="ajuda">Desligado em “Apresentador”, no passo Estilo. Marque a caixa para o intervalo valer. <a href="#" id="p-apresentador-ir-estilo">Ir para Estilo</a>.</p>'}
            <div class="campo">
              <label>Avatar a cada (segundos)</label>
              <input type="number" id="p-avatar-intervalo" min="15" max="600" step="5" value="${e.avatar_intervalo_s || 60}" ${e.apresentador ? "" : "disabled"} style="max-width:160px;" />
              <details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>O avatar padrão do canal abre o vídeo (cerca de 5 s) e reaparece a cada intervalo. 60 ou 120 s funcionam bem; intervalos maiores saem mais baratos.</p></details>
            </div>
          </div>
        </details>

        <p class="ajuda">Nada altera o preset do canal até você escolher salvar (etapa Revisão ou “Salvar configuração”).</p>
      </div>
      ${_painelLateralResumo()}
    </div>
    <div class="barra-navegacao-assistente">
      <button class="botao" id="btn-voltar-3">Voltar</button>
      <button class="botao primario" id="btn-proximo-3">Próximo</button>
    </div>
  `;

  corpo.querySelector("#p-pct-real").addEventListener("input", (ev) => {
    e.pct_real = Number(ev.target.value);
    corpo.querySelector("#p-pct-real-rotulo").textContent = `${e.pct_real}% real / ${100 - e.pct_real}% IA`;
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#p-midia-ia").addEventListener("change", (ev) => { e.midia_ia = ev.target.value; _agendarSalvarRascunho(); });
  corpo.querySelector("#p-midia-acervo").addEventListener("change", (ev) => { e.midia_acervo = ev.target.value; _agendarSalvarRascunho(); });
  corpo.querySelectorAll("#p-bancos-acervo [data-banco]").forEach((cb) => {
    cb.addEventListener("change", () => {
      // guarda a lista explicita (inclui marcados que estao sem chave agora)
      const semChave = new Set(((_bancosCache || {}).bancos || []).filter((b) => b.precisa_chave && !b.chave_configurada).map((b) => b.id));
      const antes = _bancosMarcados(e).filter((id) => semChave.has(id));
      const marcados = [...corpo.querySelectorAll("#p-bancos-acervo [data-banco]:checked")].map((x) => x.dataset.banco);
      e.bancos_acervo = [...new Set([...marcados, ...antes])];
      _agendarSalvarRascunho();
    });
  });
  corpo.querySelector("#p-usar-youtube").addEventListener("change", (ev) => {
    e.usar_youtube = ev.target.checked;
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#p-juiz-visual").addEventListener("change", (ev) => { e.juiz_visual = ev.target.checked; _agendarSalvarRascunho(); });
  corpo.querySelector("#p-gerador-imagem").addEventListener("change", (ev) => {
    e.gerador_imagem = ev.target.value;
    corpo.querySelector("#p-qualidade-openai").disabled = !_geradorUsaOpenai(e.gerador_imagem);
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#p-qualidade-openai").addEventListener("change", (ev) => {
    e.qualidade_openai = ev.target.value;
    corpo.querySelector("#p-gerador-imagem").innerHTML = _opcoesGeradorHtml(e); // custos mudam com a qualidade
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#p-qualidade-openai").disabled = !_geradorUsaOpenai(e.gerador_imagem);
  corpo.querySelector("#p-spc").addEventListener("input", (ev) => {
    e.segundos_por_cena = Number(ev.target.value);
    corpo.querySelector("#p-spc-rotulo").textContent = `${e.segundos_por_cena}s`;
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#p-gpu").addEventListener("change", (ev) => { e.usar_gpu = ev.target.checked; _agendarSalvarRascunho(); });
  corpo.querySelector("#p-takes-ir-estilo")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    _irParaEtapa(container, 2);
  });
  corpo.querySelector("#p-takes-intervalo").addEventListener("input", (ev) => {
    e.takes_intervalo_s = Number(ev.target.value);
    corpo.querySelector("#p-takes-intervalo-rotulo").textContent = `${e.takes_intervalo_s}s`;
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  });
  corpo.querySelectorAll("#p-takes-lista [data-take]").forEach((cb) => {
    cb.addEventListener("change", () => {
      // guarda na ordem do rodizio (TAKES_UI), nao na ordem dos cliques
      const marcados = new Set([...corpo.querySelectorAll("#p-takes-lista [data-take]:checked")].map((x) => x.dataset.take));
      e.takes_lista = TAKES_IDS_UI.filter((id) => marcados.has(id));
      _atualizarPainelLateral(container);
      _agendarSalvarRascunho();
    });
  });

  if (e.legenda_ativa) _ligarSecaoLegenda(container, corpo, e);
  if (!_temAudio(e)) _ligarSecaoNarracao(container, corpo, e);

  corpo.querySelector("#p-avatar-intervalo").addEventListener("input", (ev) => {
    e.avatar_intervalo_s = Math.max(15, Math.min(600, Math.round(Number(ev.target.value) || 60)));
    _agendarSalvarRascunho();
  });
  corpo.querySelector("#p-apresentador-ir-estilo")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    _irParaEtapa(container, 2);
  });

  corpo.querySelector("#btn-voltar-3").addEventListener("click", () => _irParaEtapa(container, 2));
  corpo.querySelector("#btn-proximo-3").addEventListener("click", () => _irParaEtapa(container, 4));
}

function _camposLegenda(e) {
  return {
    legenda_ativa: !!e.legenda_ativa,
    legenda_estilo: e.legenda_estilo || "preenchimento",
    legenda_cores: _legendaCores(e),
    legenda_tamanho: e.legenda_tamanho || "M",
    legenda_posicao: e.legenda_posicao || "inferior",
    legenda_fonte: e.legenda_fonte || "estilo",
    legenda_sob_templates: e.legenda_sob_templates || "auto",
    legenda_sob_destaques: e.legenda_sob_destaques || "auto",
    legenda_escala: e.legenda_escala === null || e.legenda_escala === undefined ? null : legendaEscalaEfetiva(e),
    legenda_margem: e.legenda_margem === null || e.legenda_margem === undefined ? null : legendaMargemEfetiva(e),
    legenda_max_linha: legendaMaxLinhaEfetiva(e),
  };
}

function _opcoesFonteLegenda(e, dados) {
  const lista = (dados && dados.fontes_disponiveis) || LEGENDA_FONTES_UI;
  const doEstilo = dados && (!e.legenda_fonte || e.legenda_fonte === "estilo") ? ` (${dados.fonte.nome})` : "";
  const atual = e.legenda_fonte || "estilo";
  const opcoes = [["estilo", `Fonte do estilo${doEstilo}`], ...lista.map((f) => [f, f])];
  if (atual !== "estilo" && !lista.includes(atual)) opcoes.push([atual, atual]);
  return opcoes.map(([v, r]) => `<option value="${escaparHtml(v)}" ${atual === v ? "selected" : ""}>${escaparHtml(r)}</option>`).join("");
}

function _rotuloEscalaLegenda(e) {
  return `${legendaEscalaEfetiva(e)}% · ${Math.round(legendaTamanhoPx(e, 1080))} px`;
}

function _secaoLegendaHtml(e) {
  const c = _legendaCores(e);
  const esc = legendaEscalaEfetiva(e);
  const margem = legendaMargemEfetiva(e);
  const maxLinha = legendaMaxLinhaEfetiva(e);
  const centro = e.legenda_posicao === "centro";
  return `
        <details class="secao" open>
          <summary>Legenda</summary>
          <div class="corpo-secao">
            <div class="legenda-grade">
              <div class="legenda-previa-fixa">
                <div id="p-legenda-previa-3"></div>
                <div class="legenda-teste">
                  <button class="botao" id="p-legenda-testar" type="button">Testar legenda (render real)</button>
                  <span class="ajuda" id="p-legenda-teste-msg" style="display:inline; margin-left:8px;">Gera ~4 s com o mesmo motor do vídeo final (sem custo de API).</span>
                  <div id="p-legenda-teste-resultado"></div>
                </div>
              </div>
              <div>
                <div class="campo">
                  <label>Tamanho <span class="slider-rotulo" id="p-legenda-escala-rot" style="margin-left:6px;">${_rotuloEscalaLegenda(e)}</span></label>
                  <input type="range" id="p-legenda-escala" min="60" max="160" step="1" value="${esc}" list="p-legenda-escala-marcas" style="width:100%;" />
                  <datalist id="p-legenda-escala-marcas"><option value="84"></option><option value="100"></option><option value="119"></option></datalist>
                  <div class="legenda-marcas">
                    <span>60%</span>
                    <span><button class="botao link-simples" type="button" data-escala="84">P</button><button class="botao link-simples" type="button" data-escala="100">M</button><button class="botao link-simples" type="button" data-escala="119">G</button></span>
                    <span>160%</span>
                  </div>
                </div>
                <div class="linha-campos">
                  <div class="campo"><label>Posição</label>${_selectHtml("p-legenda-posicao", [["inferior", "Inferior"], ["centro", "Central"]], e.legenda_posicao || "inferior")}</div>
                  <div class="campo"><label>Estilo</label>${_selectHtml("p-legenda-estilo", LEGENDA_ESTILOS_UI, e.legenda_estilo || "preenchimento")}</div>
                </div>
                <div class="campo">
                  <label>Altura na tela (margem inferior) <span class="slider-rotulo" id="p-legenda-margem-rot" style="margin-left:6px;">${String(margem).replace(".", ",")}%</span></label>
                  <input type="range" id="p-legenda-margem" min="2" max="45" step="0.5" value="${margem}" ${centro ? "disabled" : ""} style="width:100%;" />
                  <div class="legenda-marcas"><span>rente à borda</span><button class="botao link-simples" type="button" id="p-legenda-margem-padrao">padrão (8,5%)</button><span>mais alto</span></div>
                </div>
                <div class="campo">
                  <label>Largura máxima da linha <span class="slider-rotulo" id="p-legenda-maxlinha-rot" style="margin-left:6px;">${maxLinha} caracteres</span></label>
                  <input type="range" id="p-legenda-maxlinha" min="20" max="60" step="1" value="${maxLinha}" style="width:100%;" />
                  <div class="legenda-marcas"><span>blocos curtos</span><span>padrão 42</span><span>linhas longas</span></div>
                </div>
                <div class="campo"><label>Fonte</label><select id="p-legenda-fonte">${_opcoesFonteLegenda(e, null)}</select></div>
                <div class="campo">
                  <label>Cores</label>
                  <div class="legenda-cores">
                    <label>Faixa <input type="color" id="p-legenda-cor-faixa" value="${c.faixa}" /></label>
                    <label class="legenda-opac">Opacidade <input type="range" id="p-legenda-opac-faixa" min="0" max="100" step="5" value="${c.faixa_opacidade}" /> <span id="p-legenda-opac-faixa-rot">${c.faixa_opacidade}%</span></label>
                    <label>Texto <input type="color" id="p-legenda-cor-texto" value="${c.texto}" /></label>
                    <label class="legenda-opac">Opacidade <input type="range" id="p-legenda-opac-texto" min="10" max="100" step="5" value="${c.texto_opacidade}" /> <span id="p-legenda-opac-texto-rot">${c.texto_opacidade}%</span></label>
                    <label>Preenchimento <input type="color" id="p-legenda-cor-preench" value="${c.preenchimento}" /></label>
                  </div>
                  <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
                    <button class="botao link-simples" id="p-legenda-tema-escuro" type="button">Faixa escura, texto branco</button>
                    <button class="botao link-simples" id="p-legenda-tema-claro" type="button">Faixa branca, texto escuro</button>
                  </div>
                  <div class="ajuda">Opacidade da faixa abaixo de 20%: sem faixa, o texto ganha contorno e sombra.</div>
                </div>
              </div>
            </div>
            <div class="linha-campos">
              <div class="campo"><label>Sob templates</label>${_selectHtml("p-legenda-sob-templates", LEGENDA_MODOS_UI, e.legenda_sob_templates || "auto")}</div>
              <div class="campo"><label>Sob destaques</label>${_selectHtml("p-legenda-sob-destaques", LEGENDA_MODOS_UI, e.legenda_sob_destaques || "auto")}</div>
            </div>
            <details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>A prévia desenha em 1920×1080 com a mesma fonte, tamanho, margens, quebra de linha e cores do vídeo final; o botão “Testar legenda” gera um trecho com o motor real para conferir. A legenda aparece em blocos de ~2,4 s (até 2 linhas, cada uma com no máximo a largura escolhida) sincronizados com a fala; nomes compostos nunca são partidos. "Preenchimento": as palavras ainda não ditas ficam translúcidas e a palavra falada se preenche da esquerda para a direita. "Sob templates" (takes e peças de tela cheia) e "Sob destaques" (textos animados do estilo e cards): Auto oculta a legenda sob templates e sob o karaokê do estilo e a faz subir acima de destaques na parte de baixo da tela (lower-third, contador...); Ocultar sempre esconde; Manter nunca muda. Com ticker ou letterbox, a legenda fica sempre acima deles. A legenda.srt vai junto na pasta de saída.</p></details>
          </div>
        </details>`;
}

function _ligarSecaoLegenda(container, corpo, e) {
  const q = (s) => corpo.querySelector(s);
  const previa = LegendaPrevia.montar(q("#p-legenda-previa-3"), () => e);
  const atualizar = () => {
    previa.atualizar();
    _atualizarPainelLateral(container);
    _agendarSalvarRascunho();
  };
  // lista de fontes instaladas e o nome da fonte do estilo vêm do servidor
  const atualizarFontes = () => LegendaPrevia.dados(e).then((d) => { q("#p-legenda-fonte").innerHTML = _opcoesFonteLegenda(e, d); }).catch(() => {});
  atualizarFontes();
  const cores = () => (e.legenda_cores = _legendaCores(e));
  const sel = (id, campo, depois) => q(id).addEventListener("change", (ev) => { e[campo] = ev.target.value; if (depois) depois(); atualizar(); });
  sel("#p-legenda-estilo", "legenda_estilo");
  sel("#p-legenda-fonte", "legenda_fonte", atualizarFontes);
  sel("#p-legenda-posicao", "legenda_posicao", () => { q("#p-legenda-margem").disabled = e.legenda_posicao === "centro"; });
  sel("#p-legenda-sob-templates", "legenda_sob_templates");
  sel("#p-legenda-sob-destaques", "legenda_sob_destaques");
  const definirEscala = (v) => {
    e.legenda_escala = Math.max(60, Math.min(160, Math.round(Number(v) || 100)));
    e.legenda_tamanho = legendaRotuloEscala(e.legenda_escala);
    q("#p-legenda-escala").value = e.legenda_escala;
    q("#p-legenda-escala-rot").textContent = _rotuloEscalaLegenda(e);
    atualizar();
  };
  q("#p-legenda-escala").addEventListener("input", (ev) => definirEscala(ev.target.value));
  corpo.querySelectorAll("[data-escala]").forEach((b) => b.addEventListener("click", () => definirEscala(b.dataset.escala)));
  const definirMargem = (v) => {
    e.legenda_margem = v === null ? null : Math.max(2, Math.min(45, Number(v)));
    const m = legendaMargemEfetiva(e);
    q("#p-legenda-margem").value = m;
    q("#p-legenda-margem-rot").textContent = `${String(m).replace(".", ",")}%`;
    atualizar();
  };
  q("#p-legenda-margem").addEventListener("input", (ev) => definirMargem(ev.target.value));
  q("#p-legenda-margem-padrao").addEventListener("click", () => definirMargem(null));
  q("#p-legenda-maxlinha").addEventListener("input", (ev) => {
    e.legenda_max_linha = Math.max(20, Math.min(60, Math.round(Number(ev.target.value) || 42)));
    q("#p-legenda-maxlinha-rot").textContent = `${e.legenda_max_linha} caracteres`;
    atualizar();
  });
  const cor = (id, chave) => q(id).addEventListener("input", (ev) => { cores()[chave] = ev.target.value.toUpperCase(); atualizar(); });
  cor("#p-legenda-cor-faixa", "faixa");
  cor("#p-legenda-cor-texto", "texto");
  cor("#p-legenda-cor-preench", "preenchimento");
  const opac = (id, chave) => q(id).addEventListener("input", (ev) => {
    cores()[chave] = Number(ev.target.value);
    q(id + "-rot").textContent = `${ev.target.value}%`;
    atualizar();
  });
  opac("#p-legenda-opac-faixa", "faixa_opacidade");
  opac("#p-legenda-opac-texto", "texto_opacidade");
  const tema = (valores) => {
    e.legenda_cores = { ...LEGENDA_CORES_PADRAO, ...valores };
    const c = e.legenda_cores;
    q("#p-legenda-cor-faixa").value = c.faixa;
    q("#p-legenda-cor-texto").value = c.texto;
    q("#p-legenda-cor-preench").value = c.preenchimento;
    q("#p-legenda-opac-faixa").value = c.faixa_opacidade;
    q("#p-legenda-opac-faixa-rot").textContent = `${c.faixa_opacidade}%`;
    q("#p-legenda-opac-texto").value = c.texto_opacidade;
    q("#p-legenda-opac-texto-rot").textContent = `${c.texto_opacidade}%`;
    atualizar();
  };
  q("#p-legenda-tema-escuro").addEventListener("click", () => tema({}));
  q("#p-legenda-tema-claro").addEventListener("click", () =>
    tema({ faixa: "#FFFFFF", faixa_opacidade: 90, texto: "#111111", texto_opacidade: 45, preenchimento: "#111111" }));

  // teste com o render REAL (ASS + libass do FFmpeg), ~4 s em 1280x720
  q("#p-legenda-testar").addEventListener("click", async () => {
    const btn = q("#p-legenda-testar");
    const msg = q("#p-legenda-teste-msg");
    btn.disabled = true;
    msg.textContent = "Renderizando…";
    try {
      const r = await Api.post("/api/legenda/teste", { estilo: e.estilo, texto: _lpTextoRoteiro(e), ..._camposLegenda(e) });
      msg.textContent = `Pronto em ${String(r.segundos).replace(".", ",")} s · ${r.fonte} · ${String(r.tamanho_px).replace(".", ",")} px em 720p · ${r.blocos} bloco(s)`;
      q("#p-legenda-teste-resultado").innerHTML = `
        <div class="legenda-teste-resultado">
          <figure><video src="${r.video_url}" controls autoplay loop muted playsinline></video><figcaption>Render real (1280×720, ${String(r.duracao_s).replace(".", ",")} s)</figcaption></figure>
          <figure><a href="${r.quadro_url}" target="_blank" rel="noopener"><img src="${r.quadro_url}" alt="Quadro do render real" /></a><figcaption>Quadro em ${String(r.t_quadro).replace(".", ",")} s</figcaption></figure>
        </div>`;
    } catch (exc) {
      msg.textContent = "Falhou: " + exc.message;
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- etapa 4 --
async function _etapa4(container, corpo) {
  const e = _produzirEstado;

  let minutosEstimados;
  const temAudio = _temAudio(e);
  if (temAudio) {
    minutosEstimados = e.audio.duracao_s ? e.audio.duracao_s / 60 : 3;
  } else {
    const palavras = (e.roteiro_texto || "").trim().split(/\s+/).filter(Boolean).length;
    minutosEstimados = palavras / 150;
  }
  const beats = Math.max(1, Math.round((minutosEstimados * 60) / e.segundos_por_cena));
  const custoLlm = (minutosEstimados / 10) * 0.04;
  // transcricao (tempos por palavra) roda sempre, inclusive depois do TTS
  const custoWhisper = (minutosEstimados / 10) * 0.019;
  // TTS so e cobrado quando nao ha audio enviado
  // (Dark Planner: sai da cota da assinatura, sem custo por minuto aqui)
  const ttsDarkPlanner = e.provedor_tts === "darkplanner";
  const custoTts = temAudio || ttsDarkPlanner ? 0 : minutosEstimados * CUSTO_TTS_USD_POR_MIN;
  await _carregarGeradores();
  const custoImagens = beats * (1 - e.pct_real / 100) * _custoPorImagem(e);
  const custoTotal = custoLlm + custoWhisper + custoTts + custoImagens;

  corpo.innerHTML = `
    <div class="layout-assistente">
      <div class="cartao">
        <h3>Resumo</h3>
        <div class="lista-resumo">
          <div class="resumo-linha"><span class="k">Nome</span><span class="v">${escaparHtml(e.nome)}</span></div>
          <div class="resumo-linha"><span class="k">Canal</span><span class="v">${escaparHtml(_nomeCanal(e))}</span></div>
          <div class="resumo-linha"><span class="k">Preset</span><span class="v">${escaparHtml(_situacaoPreset(e) === "video" ? "Ajustes deste vídeo" : (_presetPorId(_canalPorId(e.canal_id), e.preset_id) || {}).nome || "-")}</span></div>
          <div class="resumo-linha"><span class="k">Apresentador</span><span class="v">${!e.apresentador ? "Sem apresentador neste vídeo" : (_canalPorId(e.canal_id) || {}).avatar_padrao_id ? `A cada ${e.avatar_intervalo_s || 60} s` : "Sem apresentador neste canal"}</span></div>
          <div class="resumo-linha"><span class="k">Fonte</span><span class="v">${escaparHtml(_descricaoFonte(e))}</span></div>
          <div class="resumo-linha"><span class="k">Narração</span><span class="v">${temAudio ? "Áudio enviado (sem TTS)" : escaparHtml(_rotuloNarracaoTts(e))}</span></div>
          <div class="resumo-linha"><span class="k">Textos do vídeo</span><span class="v">${_temRoteiro(e) ? "Grafia do roteiro" : "Transcrição do áudio"}</span></div>
          <div class="resumo-linha"><span class="k">Estilo</span><span class="v">${_estiloResumoTexto(e.estilo)}</span></div>
          <div class="resumo-linha"><span class="k">Trilha</span><span class="v">${e.trilha ? "Sim" : "Não"}</span></div>
          <div class="resumo-linha"><span class="k">Real x IA</span><span class="v">${e.pct_real}% / ${100 - e.pct_real}%</span></div>
          <div class="resumo-linha"><span class="k">Imagens IA</span><span class="v">${escaparHtml(_rotuloGerador(e))} (~${_moedaImg(_custoPorImagem(e))}/imagem)</span></div>
          <div class="resumo-linha"><span class="k">Segundos por cena</span><span class="v">${e.segundos_por_cena}s</span></div>
          <div class="resumo-linha"><span class="k">Templates</span><span class="v">${escaparHtml(_rotuloTakes(e))}</span></div>
          <div class="resumo-linha"><span class="k">Legenda</span><span class="v">${escaparHtml(_rotuloLegenda(e))}${e.legenda_ativa ? ` · tamanho ${legendaEscalaEfetiva(e)}% · ${e.legenda_posicao === "centro" ? "central" : `inferior (margem ${String(legendaMargemEfetiva(e)).replace(".", ",")}%)`}` : ""}</span></div>
          <div class="resumo-linha"><span class="k">Pasta de saida</span><span class="v">${escaparHtml(e.pasta_saida)}</span></div>
          <div class="resumo-linha"><span class="k">Duração estimada</span><span class="v">~${minutosEstimados.toFixed(1)} min (${beats} cenas)</span></div>
        </div>
        <div class="custo-total">${formatarMoeda(custoTotal)}</div>
        <div class="custo-obs">Estimativa (LLM + transcrição${temAudio ? "" : " + voz TTS"} + imagens IA).${temAudio ? " Com áudio enviado não há custo de TTS." : ""} O gasto real fica registrado em Custos.</div>
        <div class="bloco-reutilizar">
          <div>
            <h4>Reutilize esta configuração</h4>
            <p class="ajuda">${_situacaoPreset(e) === "video"
              ? `Ajustes só neste vídeo.${e.preset_id ? " O preset salvo continua preservado." : ""}`
              : "Este vídeo usa o preset do canal sem mudanças."} Opcional. Título, roteiro e áudio ficam fora do preset.</p>
          </div>
          <button type="button" class="botao" data-acao="salvar-preset" ${e.canal_id && _canalPorId(e.canal_id) ? "" : "disabled title=\"Escolha um canal na etapa 1\""}>Salvar como preset do canal</button>
        </div>
        <div class="bloco-creditos-revisao" id="bloco-creditos-revisao">
          <h4>Créditos</h4>
          <p class="pagina-sub" style="margin:0;">Conferindo saldo...</p>
        </div>
        <div class="barra-navegacao-assistente">
          <button class="botao" id="btn-voltar-4">Voltar</button>
          <button class="botao primario" id="btn-produzir">Produzir</button>
        </div>
      </div>
      ${_painelLateralResumo()}
    </div>
  `;

  corpo.querySelector("#btn-voltar-4").addEventListener("click", () => _irParaEtapa(container, 3));
  corpo.querySelector("#btn-produzir").addEventListener("click", () => {
    const v = _verificacaoCreditos;
    if (v && v.ok === false) {
      const ok = confirm(
        (v.mensagem || "Saldo insuficiente.") +
        "\n\nA produção vai ser criada, mas vai ficar AGUARDANDO CRÉDITOS (não começa) até você recarregar e clicar em Retomar. Criar mesmo assim?"
      );
      if (!ok) return;
    }
    _enviarProducao(container);
  });

  _verificacaoCreditos = null;
  _montarBlocoCreditos(corpo, {
    pct_real: e.pct_real,
    segundos_por_cena: e.segundos_por_cena,
    midia_ia: e.midia_ia,
    gerador_imagem: e.gerador_imagem || "gpt_image_2",
    qualidade_openai: e.qualidade_openai || "medium",
    provedor_tts: e.provedor_tts || "",
    tem_audio: temAudio,
    duracao_s: Math.round(minutosEstimados * 60),
  });
}

// ultima verificacao de saldo da etapa Revisao (usada na confirmacao)
let _verificacaoCreditos = null;

async function _montarBlocoCreditos(corpo, params, forcar) {
  const bloco = corpo.querySelector("#bloco-creditos-revisao");
  if (!bloco) return;
  const qs = new URLSearchParams({ ...params, forcar: forcar ? "true" : "false" });
  let v;
  try {
    v = await Api.get(`/api/producoes/estimativa?${qs.toString()}`);
  } catch (exc) {
    bloco.innerHTML = `<h4>Créditos</h4><p class="msg-teste-neutra" style="margin:0;">Não foi possível conferir o saldo agora (${escaparHtml(exc.message)}). A produção confere de novo antes de começar.</p>`;
    return;
  }
  _verificacaoCreditos = v;
  const linhas = ["openrouter", "openai"]
    .filter((pid) => v.por_provedor && v.por_provedor[pid])
    .map((pid) => htmlLinhaCredito(pid, v.por_provedor[pid]))
    .join("");
  let rodape;
  if (v.ok === false) {
    rodape = `<p class="msg-teste-erro" style="margin:8px 0 0;">${Icones.alerta} ${escaparHtml(v.mensagem)}</p>`;
  } else if ((v.avisos || []).length) {
    rodape = `<p class="msg-teste-neutra" style="margin:8px 0 0;">${escaparHtml(v.avisos.join(" "))}</p>`;
  } else {
    rodape = `<p class="msg-teste-ok" style="margin:8px 0 0;">${Icones.check} Créditos suficientes (estimativa com margem de 30%).</p>`;
  }
  bloco.innerHTML = `<h4 style="display:flex; justify-content:space-between; align-items:center;">Créditos <button class="botao link-simples" id="btn-atualizar-creditos" style="font-size:0.78rem;">Atualizar</button></h4>${linhas}${rodape}`;
  bloco.querySelector("#btn-atualizar-creditos")?.addEventListener("click", () => {
    bloco.querySelector("#btn-atualizar-creditos").disabled = true;
    _montarBlocoCreditos(corpo, params, true);
  });
}

async function _enviarProducao(container) {
  const e = _produzirEstado;
  const btn = container.querySelector("#btn-produzir");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  const pedido = {
    canal_id: e.canal_id || null,
    // preset de base só quando o vídeo segue o preset sem mudanças (informativo:
    // os valores já vão no pedido)
    preset_id: _situacaoPreset(e) !== "video" ? e.preset_id : null,
    apresentador: !!e.apresentador,
    avatar_intervalo_s: Math.max(15, Math.min(600, Math.round(Number(e.avatar_intervalo_s) || 60))),
    nome: e.nome,
    // modo e derivado (a API recalcula): com audio -> "audio", senao "roteiro"
    modo: _temAudio(e) ? "audio" : "roteiro",
    roteiro_texto: _temRoteiro(e) ? e.roteiro_texto : null,
    pasta_saida: e.pasta_saida || "Downloads",
    estilo: e.estilo,
    trilha: e.trilha,
    pct_real: e.pct_real,
    midia_ia: e.midia_ia,
    midia_acervo: e.midia_acervo,
    bancos_acervo: Array.isArray(e.bancos_acervo) ? e.bancos_acervo : null,
    usar_youtube: !!e.usar_youtube,
    juiz_visual: e.juiz_visual === true,
    segundos_por_cena: e.segundos_por_cena,
    usar_gpu: e.usar_gpu,
    gerador_imagem: e.gerador_imagem || "gpt_image_2",
    qualidade_openai: e.qualidade_openai || "medium",
    provedor_tts: _temAudio(e) ? "" : (e.provedor_tts || ""),
    voz_tts: _temAudio(e) ? "" : (e.voz_tts || ""),
    takes_ativos: !!e.takes_ativos,
    takes_intervalo_s: Math.min(60, Math.max(15, Number(e.takes_intervalo_s) || 25)),
    takes_lista: _takesMarcados(e),
    ..._camposLegenda(e),
    // o audio ja foi enviado ao rascunho ao ser escolhido (etapa 1); aqui so
    // avisamos a API para usa-lo, sem reenviar o arquivo inteiro de novo
    usar_audio_rascunho: _temAudio(e),
  };

  const form = new FormData();
  form.append("pedido", JSON.stringify(pedido));

  try {
    const resp = await Api.postForm("/api/producoes", form);
    clearTimeout(_rascunhoSalvarTimer);
    _produzirEstado = _estadoProduzirPadrao();
    _produzirEtapa = 1;
    location.hash = `#acompanhar?job=${resp.job_id}`;
  } catch (exc) {
    alert("Erro ao criar produção: " + exc.message);
    btn.disabled = false;
    btn.textContent = "Produzir";
  }
}

// ------------------------------------------ modal "Salvar como preset" --
// Cria um preset novo ou atualiza um existente do canal com o estilo e os
// ajustes deste vídeo. Nome do vídeo, roteiro e áudio ficam de fora.
function _abrirModalSalvarPreset(container) {
  const e = _produzirEstado;
  const canal = _canalPorId(e.canal_id);
  if (!canal) { alert("Escolha um canal na etapa 1 para salvar um preset."); return; }
  const presets = canal.presets || [];
  const base = _presetPorId(canal, e.preset_id);
  const fundo = abrirModal(`
    <div class="modal-preset">
      <div class="can-rotulo">${escaparHtml(canal.nome)}</div>
      <h3>Guardar a configuração do canal</h3>
      <p class="pagina-sub" style="margin:0 0 16px;">Salva estilo e ajustes. Nome do vídeo, roteiro e áudio ficam de fora.</p>
      <div class="campo">
        <label for="mp-modo">Como salvar</label>
        <select id="mp-modo">
          <option value="">Criar um novo preset</option>
          ${presets.map((p) => `<option value="${escaparHtml(p.id)}">Atualizar “${escaparHtml(p.nome)}”${base && base.id === p.id ? " (base deste vídeo)" : ""}</option>`).join("")}
        </select>
      </div>
      <div class="campo">
        <label for="mp-nome">Nome do preset</label>
        <input type="text" id="mp-nome" maxlength="120" placeholder="ex.: 50% real · YouTube · placa de vídeo" />
      </div>
      <label class="can-check"><input type="checkbox" id="mp-padrao" /> Usar como padrão ao escolher este canal</label>
      <div class="can-nota" style="margin-top:12px;">${escaparHtml(resumoAjustesPresetProduzir(e))}</div>
      <p class="ajuda msg-teste-erro" id="mp-erro" style="margin:8px 0 0;"></p>
      <div class="rodape-modal">
        <button class="botao" id="mp-cancelar" type="button">Cancelar</button>
        <button class="botao primario" id="mp-salvar" type="button">Salvar preset do canal</button>
      </div>
    </div>`);
  const selModo = fundo.querySelector("#mp-modo");
  const inpNome = fundo.querySelector("#mp-nome");
  const chkPadrao = fundo.querySelector("#mp-padrao");
  const sincronizar = () => {
    const p = presets.find((x) => x.id === selModo.value);
    inpNome.value = p ? p.nome : "";
    chkPadrao.checked = p ? !!p.padrao : presets.length === 0;
  };
  selModo.addEventListener("change", sincronizar);
  sincronizar();
  inpNome.focus();
  fundo.querySelector("#mp-cancelar").addEventListener("click", fecharModal);
  fundo.querySelector("#mp-salvar").addEventListener("click", async () => {
    const nome = inpNome.value.trim();
    const erro = fundo.querySelector("#mp-erro");
    if (!nome) { erro.textContent = "Dê um nome ao preset."; inpNome.focus(); return; }
    const btn = fundo.querySelector("#mp-salvar");
    btn.disabled = true;
    const corpo = { nome, padrao: chkPadrao.checked, ajustes: _ajustesDoEstado(e) };
    try {
      const url = `/api/canais/${encodeURIComponent(canal.id)}/presets`;
      const salvo = selModo.value ? await Api.put(`${url}/${encodeURIComponent(selModo.value)}`, corpo) : await Api.post(url, corpo);
      await _carregarCanaisProduzir();
      e.preset_id = salvo.id;
      fecharModal();
      _salvarRascunhoAgora();
      _renderEtapa(container);
    } catch (exc) {
      erro.textContent = exc.message || "Erro ao salvar o preset.";
      btn.disabled = false;
    }
  });
}

function resumoAjustesPresetProduzir(e) {
  if (typeof resumoAjustesPreset === "function") return resumoAjustesPreset(_ajustesDoEstado(e));
  return "";
}
