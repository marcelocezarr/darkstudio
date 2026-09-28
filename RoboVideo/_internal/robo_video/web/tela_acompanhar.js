// Tela Acompanhar: fila do robo (esquerda) + detalhe da producao (direita)
// com cabecalho (ID curto copiavel, pedido, mini-painel de tempo/etapa/%),
// stepper das 6 etapas, estatisticas (tempo, nesta etapa, falta/ETA),
// servicos em execucao (progresso, ritmo, falta), dados do job, LOG
// detalhado com filtros e as abas Cenas / Arquivos / Tags.
// Atualiza a cada 1 s (polling em /api/acompanhar e /api/producoes/{id}).

const FASES_PIPELINE = [
  { id: "narracao", rotulo: "Narração", sub: "Preparando o áudio da narração." },
  { id: "preparacao", rotulo: "Preparação", sub: "Transcrevendo o áudio e marcando o tempo de cada palavra." },
  { id: "cenas", rotulo: "Cenas", sub: "Dividindo em cenas e planejando o que mostrar em cada uma." },
  { id: "selecao", rotulo: "Seleção", sub: "Buscando, julgando e escolhendo as mídias do acervo." },
  { id: "imagens", rotulo: "Imagens", sub: "Preparando as imagens e os clipes do vídeo." },
  { id: "montagem", rotulo: "Montagem", sub: "Montando, animando e finalizando o vídeo." },
];
const _ROTULO_FASE = Object.fromEntries(FASES_PIPELINE.map((f) => [f.id, f.rotulo]));

// servico -> etapa (filtro do log e cor da etiqueta)
const SERVICOS_LOG = {
  tts: ["narracao", "TTS"], audio: ["narracao", "Áudio"],
  transcricao: ["preparacao", "Transcrição"], alinhamento: ["preparacao", "Alinhamento"],
  beats: ["cenas", "Beats"], espinha: ["cenas", "Espinha"], planner: ["cenas", "Planner"],
  busca: ["selecao", "Busca"], busca_complemento: ["selecao", "Busca extra"], juiz: ["selecao", "Juiz"],
  download: ["selecao", "Download"], escolha: ["selecao", "Escolha"],
  imagens_ia: ["imagens", "Imagens IA"],
  clipes: ["montagem", "Clipes"], concat: ["montagem", "Concat"], cards: ["montagem", "Cards"],
  pecas: ["montagem", "Destaques"], overlay: ["montagem", "Overlay"], audio_mix: ["montagem", "Mix"],
  loudness: ["montagem", "Loudness"], entrega: ["montagem", "Entrega"],
  rede: [null, "Rede/429"], creditos: [null, "Créditos"], sistema: [null, "Sistema"],
};

const _acp = {
  intervalo: null,
  jobAtual: null,
  aba: "acompanhamento",
  chaveEsqueleto: null,
  chaveStepper: null,
  log: { chaveFiltro: null, ultimoN: -1, linhas: [], pausado: false, filtros: { fase: "", servico: "", nivel: "", q: "" } },
  cenas: { filtro: "todas", ultimo: 0, dados: null },
  ultimoDetalhe: null,
  ocupado: false,
};

function _acpPararPolling() {
  if (_acp.intervalo) { clearInterval(_acp.intervalo); _acp.intervalo = null; }
}

// ------------------------------------------------------------- formatacao --
function _acpDur(s, curto) {
  if (s == null || isNaN(s)) return "—";
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m) return curto ? `${m} min` : `${m}min ${String(r).padStart(2, "0")}s`;
  return `${r}s`;
}
function _acpFalta(s) {
  if (s == null || isNaN(s)) return "calculando…";
  if (s < 1) return "quase lá";
  if (s < 60) return `~${Math.max(1, Math.round(s))} s`;
  if (s < 3600) return `~${Math.round(s / 60)} min`;
  return `~${_acpDur(s, true)}`;
}
function _acpHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function _acpHoraSeg(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function _acpPedido(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const dia = d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  return `${dia}, ${_acpHora(iso)}`;
}
function _acpTc(s) {
  if (s == null) return "";
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}
function _acpCopiar(texto, botao) {
  const ok = () => { if (botao) { botao.classList.add("copiado"); setTimeout(() => botao.classList.remove("copiado"), 1200); } };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto).then(ok).catch(() => {});
  else {
    const ta = document.createElement("textarea");
    ta.value = texto; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); ok(); } catch (_) { /* ignora */ }
    ta.remove();
  }
}

const _SELO = {
  produzindo: ["● Produzindo", "produzindo"], fila: ["Na fila", "fila"], pronto: ["✓ Pronto", "pronto"],
  erro: ["Erro", "erro"], cancelado: ["Cancelado", "cancelado"], aguardando_creditos: ["Aguardando créditos", "creditos"],
};
function _acpSelo(status) {
  const [txt, cls] = _SELO[status] || [status || "—", "fila"];
  return `<span class="acp-selo ${cls}">${txt}</span>`;
}

// ------------------------------------------------------------------ tela --
async function telaAcompanhar(container) {
  _acpPararPolling();
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  _acp.jobAtual = params.get("job") || _acp.jobAtual || null;
  _acp.chaveEsqueleto = null;
  _acp.chaveStepper = null;

  container.innerHTML = `
    <div class="acp">
      <div class="acp-topo">
        <div>
          <h1>Acompanhar</h1>
          <p class="pagina-sub">Acompanhe a fila e a atividade de vários vídeos sem sair desta tela.</p>
        </div>
        <a class="botao acp-historico" href="#producoes">Ver histórico</a>
      </div>
      <div id="acp-aviso-suspensao"></div>
      <div class="acp-contadores-linha">
        <div class="acp-contadores" id="acp-contadores"></div>
        <label class="acp-suspender-chk" title="Quando a fila terminar (nada rodando nem esperando), o computador é suspenso automaticamente — com aviso e opção de cancelar.">
          <input type="checkbox" id="acp-chk-suspender" /> Suspender o computador quando a fila terminar
        </label>
      </div>
      <div class="acp-grade">
        <aside class="acp-fila" id="acp-fila"><p class="pagina-sub">Carregando…</p></aside>
        <section class="acp-detalhe" id="acp-detalhe"><p class="pagina-sub">Selecione uma produção na fila.</p></section>
      </div>
    </div>`;

  const chkSuspender = container.querySelector("#acp-chk-suspender");
  try {
    const pref = await Api.get("/api/preferencias");
    chkSuspender.checked = !!pref.suspender_ao_terminar;
  } catch (_) { /* ignora */ }
  chkSuspender.addEventListener("change", async () => {
    try { await Api.put("/api/preferencias", { suspender_ao_terminar: chkSuspender.checked }); }
    catch (_) { /* ignora */ }
  });

  await _acpTick(container);
  _acp.intervalo = setInterval(() => _acpTick(container).catch(() => {}), 1000);
  window.addEventListener("hashchange", _acpPararPolling, { once: true });
}

function _acpSincronizarSuspender(container, ligado) {
  const chk = container.querySelector("#acp-chk-suspender");
  if (!chk || document.activeElement === chk || ligado == null) return;
  if (chk.checked !== ligado) chk.checked = ligado;
}

function _acpRenderAvisoSuspensao(container, s) {
  const el = container.querySelector("#acp-aviso-suspensao");
  if (!el) return;
  if (!s || !s.pendente) {
    if (el.innerHTML) el.innerHTML = "";
    return;
  }
  const seg = Math.max(0, Math.round(s.faltam_s || 0));
  el.innerHTML = `<div class="acp-susp-banner">
    <span>${Icones.alerta} A fila terminou — o computador vai suspender em <b>${seg}s</b>.</span>
    <button class="botao primario" id="acp-cancelar-suspensao">Cancelar suspensão</button>
  </div>`;
  el.querySelector("#acp-cancelar-suspensao").addEventListener("click", async () => {
    try { await Api.post("/api/preferencias/cancelar-suspensao", {}); } catch (_) { /* ignora */ }
    _acpTick(container);
  });
}

async function _acpTick(container) {
  if (_acp.ocupado) return;
  if (!container.querySelector("#acp-fila")) { _acpPararPolling(); return; }
  _acp.ocupado = true;
  try {
    const resumo = await Api.get("/api/acompanhar");
    _acpRenderContadores(container, resumo.contadores || {});
    _acpSincronizarSuspender(container, resumo.suspender_ao_terminar);
    _acpRenderAvisoSuspensao(container, resumo.suspensao);
    const prods = resumo.producoes || [];
    if (!_acp.jobAtual || !prods.some((p) => p.job_id === _acp.jobAtual)) {
      const vivo = prods.find((p) => p.status === "produzindo") || prods.find((p) => p.status === "fila") || prods[0];
      _acp.jobAtual = vivo ? vivo.job_id : null;
      _acp.chaveEsqueleto = null;
    }
    _acpRenderFila(container, prods, resumo.contadores || {});
    if (_acp.jobAtual) await _acpAtualizarDetalhe(container, _acp.jobAtual);
    else container.querySelector("#acp-detalhe").innerHTML = `<p class="pagina-sub acp-vazio">Nenhuma produção ainda. Vá em <a href="#produzir">Produzir</a> para começar.</p>`;
  } finally {
    _acp.ocupado = false;
  }
}

function _acpRenderContadores(container, c) {
  const at = c.atencao || 0;
  container.querySelector("#acp-contadores").innerHTML = `
    <div class="acp-cont"><span class="rot">Produzindo</span><span class="num">${c.produzindo || 0}</span></div>
    <div class="acp-cont"><span class="rot">Na fila</span><span class="num">${c.na_fila || 0}</span></div>
    <div class="acp-cont ${at ? "atencao" : "ok"}"><span class="rot">${at ? `${Icones.alerta} Precisam de atenção` : `<span class="acp-check">${Icones.check}</span> Nenhuma precisa de atenção`}</span><span class="num">${at}</span></div>`;
}

function _acpCartaoFila(p) {
  const sel = p.job_id === _acp.jobAtual ? "selecionado" : "";
  const pct = p.status === "pronto" ? 100 : Math.round(p.pct_total || 0);
  const etapa = _ROTULO_FASE[p.etapa] || (p.status === "pronto" ? "Concluído" : p.status === "fila" ? "Aguardando" : "—");
  const barra = ["produzindo", "fila", "aguardando_creditos", "erro", "cancelado"].includes(p.status)
    ? `<div class="acp-mini-barra ${p.status}"><div style="width:${pct}%"></div></div>` : "";
  const extra = p.status === "fila" && p.posicao_fila ? ` · ${p.posicao_fila}º na fila` : "";
  return `
    <div class="acp-card ${sel} st-${p.status}" data-id="${p.job_id}" tabindex="0">
      <div class="linha1">${_acpSelo(p.status)}<span class="quando">${_acpPedido(p.pedido_em)}</span></div>
      <div class="titulo" title="${escaparHtml(p.nome)}">${escaparHtml(p.nome)}</div>
      <div class="meta">${escaparHtml(p.canal || "Sem canal")}${p.projeto ? ` · ${escaparHtml(p.projeto)}` : ""} · Atividade ${_acpHoraSeg(p.ultima_atividade)}${extra}</div>
      <div class="etapa"><span>${etapa}</span><span>${pct}%</span></div>
      ${barra}
    </div>`;
}

function _acpRenderFila(container, prods, c) {
  const grupos = [
    ["PRODUZINDO", prods.filter((p) => p.status === "produzindo")],
    ["NA FILA", prods.filter((p) => p.status === "fila").sort((a, b) => (a.posicao_fila || 99) - (b.posicao_fila || 99))],
    ["PRECISAM DE ATENÇÃO", prods.filter((p) => p.status === "erro" || p.status === "aguardando_creditos")],
    ["RECENTES", prods.filter((p) => p.status === "pronto" || p.status === "cancelado").slice(0, 12)],
  ];
  const abertas = c.abertas || 0;
  const html = [`<div class="acp-fila-tit">Fila do Robô <span>· ${abertas} ${abertas === 1 ? "produção aberta" : "produções abertas"}</span></div>`];
  for (const [nome, lista] of grupos) {
    if (!lista.length) continue;
    html.push(`<div class="acp-fila-sec">${nome} (${lista.length})</div>`);
    html.push(lista.map(_acpCartaoFila).join(""));
  }
  if (!prods.length) html.push(`<p class="pagina-sub">Nenhuma produção ainda.</p>`);
  const el = container.querySelector("#acp-fila");
  const scroll = el.scrollTop;
  el.innerHTML = html.join("");
  el.scrollTop = scroll;
  el.querySelectorAll(".acp-card").forEach((card) => {
    const escolher = () => {
      if (_acp.jobAtual === card.dataset.id) return;
      _acp.jobAtual = card.dataset.id;
      _acp.chaveEsqueleto = null;
      _acp.cenas.dados = null;
      history.replaceState(null, "", `#acompanhar?job=${card.dataset.id}`);
      el.querySelectorAll(".acp-card").forEach((x) => x.classList.toggle("selecionado", x === card));
      _acpAtualizarDetalhe(container, card.dataset.id);
      // no celular a fila fica em cima: leva o usuario ao detalhe
      if (window.innerWidth < 900) container.querySelector("#acp-detalhe").scrollIntoView({ behavior: "smooth" });
    };
    card.addEventListener("click", escolher);
    card.addEventListener("keydown", (ev) => { if (ev.key === "Enter") escolher(); });
  });
}

// --------------------------------------------------------------- detalhe --
function _acpUrlDetalhe(jobId) {
  const f = _acp.log.filtros;
  const p = new URLSearchParams();
  const chave = JSON.stringify([jobId, f]);
  const usouDesde = _acp.log.chaveFiltro === chave && _acp.log.ultimoN >= 0;
  if (usouDesde) p.set("desde", String(_acp.log.ultimoN));
  if (f.fase) p.set("fase", f.fase);
  if (f.servico) p.set("servico", f.servico);
  if (f.nivel) p.set("nivel", f.nivel);
  if (f.q) p.set("q", f.q);
  p.set("limite", "1500");
  return [`/api/producoes/${jobId}?${p.toString()}`, chave, usouDesde];
}

async function _acpAtualizarDetalhe(container, jobId) {
  const det = container.querySelector("#acp-detalhe");
  if (!det) return;
  const [url, chaveFiltro, usouDesde] = _acpUrlDetalhe(jobId);
  let d;
  try {
    d = await Api.get(url);
  } catch (_) {
    det.innerHTML = `<p class="pagina-sub acp-vazio">Produção não encontrada.</p>`;
    _acp.chaveEsqueleto = null;
    return;
  }
  if (jobId !== _acp.jobAtual) return;
  _acp.ultimoDetalhe = d;
  const estado = d.estado || {};
  const chave = `${jobId}|${estado.status}`;
  if (_acp.chaveEsqueleto !== chave) {
    _acp.chaveEsqueleto = chave;
    _acp.chaveStepper = null;
    det.innerHTML = _acpEsqueleto(d);
    _acpLigarEsqueleto(container, det, d);
    _acp.log.chaveFiltro = null; // recarrega o log inteiro
  }
  _acpAtualizarCabecalho(det, d);
  if (_acp.aba === "acompanhamento") {
    _acpAtualizarResumo(det, d);
    _acpAtualizarServicos(det, d);
    _acpAtualizarJob(det, d);
    _acpAtualizarLog(det, d, chaveFiltro, usouDesde);
  } else if (_acp.aba === "cenas") {
    _acpAtualizarCenas(det, jobId);
  }
}

function _acpEsqueleto(d) {
  const estado = d.estado || {};
  const st = estado.status;
  const abas = [["acompanhamento", "Acompanhamento"], ["cenas", "Cenas"], ["arquivos", "Arquivos"], ["tags", "Tags e descrição"]];
  const podeRetomar = st === "cancelado" || st === "erro" || st === "aguardando_creditos";
  const rodando = st === "produzindo" || st === "fila";
  return `
    <div class="acp-cab">
      <div class="acp-cab-esq">
        <div id="acp-selo">${_acpSelo(st)}</div>
        <h2 class="acp-titulo" id="acp-titulo">${escaparHtml(d.nome || d.job_id)}</h2>
        <div class="acp-meta">
          <span>${escaparHtml((d.canal && d.canal.nome) || "Sem canal")}</span><span class="sep">·</span>
          ${d.projeto ? `<span>Projeto ${escaparHtml(d.projeto.nome)}</span><span class="sep">·</span>` : ""}
          <span>Pedido ${_acpPedido(d.pedido_em)}</span><span class="sep">·</span>
          <button class="acp-chip-id" id="acp-chip-id" title="Copiar o ID completo (${escaparHtml(d.job_id)})">ID ${escaparHtml(d.id_curto)} <span class="ic">${Icones.copiar}</span></button>
        </div>
      </div>
      <div class="acp-mini" id="acp-mini"></div>
    </div>
    <nav class="acp-abas">${abas.map(([id, r]) => `<button data-aba="${id}" class="${_acp.aba === id ? "ativo" : ""}">${r}</button>`).join("")}</nav>
    <div class="acp-corpo" id="acp-corpo">${_acpCorpoAba(d)}</div>
    <div class="acp-rodape">
      <span>O Robô continua mesmo com esta página fechada.</span>
      <div class="acp-rodape-acoes">
        ${podeRetomar ? `<button class="botao primario" id="acp-retomar">Retomar</button>` : ""}
        ${rodando ? `<button class="acp-link" id="acp-parar">Parar</button>` : ""}
        <button class="acp-link perigo" id="acp-apagar">${Icones.lixeira} Parar e apagar</button>
      </div>
    </div>`;
}

function _acpCorpoAba(d) {
  if (_acp.aba === "acompanhamento") {
    return `
      <div id="acp-banner"></div>
      <div id="acp-resumo"></div>
      <div class="acp-bloco">
        <div class="acp-bloco-tit"><b id="acp-serv-tit">Serviços em execução</b> <span id="acp-serv-sub"></span></div>
        <div id="acp-servicos" class="acp-servicos"></div>
      </div>
      <details class="acp-bloco acp-job" id="acp-job-det">
        <summary class="acp-bloco-tit">Job, fila e tempos por etapa</summary>
        <div id="acp-job"></div>
      </details>
      <details class="acp-bloco acp-log" id="acp-log-det" open>
        <summary class="acp-bloco-tit">Log ao vivo <span id="acp-log-cont"></span></summary>
        ${_acpLogToolbar()}
        <div class="acp-log-corpo" id="acp-log-corpo"></div>
        <button class="acp-log-voltar" id="acp-log-voltar" hidden>Auto-rolagem pausada · voltar ao fim ↓</button>
      </details>`;
  }
  if (_acp.aba === "cenas") {
    return `<div class="acp-cenas-top"><div id="acp-cenas-resumo" class="pagina-sub"></div>
      <div class="acp-seg" id="acp-cenas-filtro">${[["todas", "Todas"], ["acervo", "Acervo"], ["ia", "IA"], ["pendentes", "Pendentes"]]
        .map(([k, r]) => `<button data-f="${k}" class="${_acp.cenas.filtro === k ? "ativo" : ""}">${r}</button>`).join("")}</div></div>
      <div class="acp-cenas" id="acp-cenas"><p class="pagina-sub">Carregando cenas…</p></div>`;
  }
  if (_acp.aba === "arquivos") {
    const arq = d.arquivos || {};
    return `
      <div class="acp-arquivos">
        <button class="botao" data-acao="abrir-video" ${!arq.video ? "disabled" : ""}>${Icones.video} Abrir vídeo ${arq.video_tamanho_mb ? `(${arq.video_tamanho_mb} MB)` : ""}</button>
        <button class="botao" data-acao="abrir-pasta">${Icones.pasta} Abrir pasta</button>
        <button class="botao" data-acao="abrir-manifesto" ${!arq.manifesto ? "disabled" : ""} title="Prova de licença de cada trecho (para contestar Content ID)">Manifesto de licenças</button>
      </div>
      ${arq.video ? `<p class="pagina-sub">Vídeo: <code>${escaparHtml(arq.video)}</code></p>` : `<p class="pagina-sub">Pode deixar esta página aberta. Quando o vídeo for entregue, os arquivos aparecerão aqui.</p>`}
      ${d.entrega && d.entrega.copia ? `<p class="pagina-sub">Cópia entregue em <code>${escaparHtml(d.entrega.copia)}</code></p>` : ""}
      <p class="pagina-sub">Pasta do job: <code>${escaparHtml(d.pasta || "")}</code></p>`;
  }
  const capitulos = d.capitulos || [];
  return `
    <h4>Capítulos</h4>
    ${capitulos.length ? `<ul class="lista-capitulos">${capitulos.map((c) => `<li><span class="t">${formatarDuracao(c.t_s)}</span><span>${escaparHtml(c.titulo)}</span></li>`).join("")}</ul>` : '<p class="pagina-sub">Ainda sem capítulos.</p>'}
    <h4 style="margin-top:16px;">Créditos <button class="botao" style="margin-left:8px;" id="btn-copiar-creditos" ${!d.creditos_texto ? "disabled" : ""}>${Icones.copiar} Copiar</button></h4>
    <div class="bloco-creditos">${d.creditos_texto ? escaparHtml(d.creditos_texto) : "Ainda sem créditos."}</div>`;
}

function _acpLigarEsqueleto(container, det, d) {
  const jobId = d.job_id;
  det.querySelector("#acp-chip-id").addEventListener("click", (ev) => _acpCopiar(jobId, ev.currentTarget));
  det.querySelectorAll(".acp-abas button").forEach((b) => b.addEventListener("click", () => {
    _acp.aba = b.dataset.aba;
    _acp.chaveEsqueleto = null;
    _acp.cenas.ultimo = 0;
    _acpAtualizarDetalhe(container, jobId);
  }));
  const retomar = async () => {
    try {
      const r = await Api.post(`/api/producoes/${jobId}/retomar`, {});
      if (r && r.creditos && r.creditos.ok === false) alert("Ainda sem saldo suficiente: " + r.creditos.mensagem);
    } catch (exc) { alert("Não foi possível retomar: " + exc.message); }
    _acp.chaveEsqueleto = null;
    _acpTick(container);
  };
  det.querySelector("#acp-retomar")?.addEventListener("click", retomar);
  det.querySelector("#acp-parar")?.addEventListener("click", async () => {
    if (!confirm("Parar esta produção? O que já foi feito fica guardado e dá para retomar depois.")) return;
    await Api.post(`/api/producoes/${jobId}/cancelar`, {});
    _acpTick(container);
  });
  det.querySelector("#acp-apagar").addEventListener("click", async () => {
    if (!confirm("Isso vai parar a produção (se estiver rodando) e apagar todos os arquivos dela. Continuar?")) return;
    await Api.post(`/api/producoes/${jobId}/cancelar`, {});
    await Api.del(`/api/producoes/${jobId}`);
    _acp.jobAtual = null;
    _acp.chaveEsqueleto = null;
    _acpTick(container);
  });
  if (_acp.aba === "acompanhamento") _acpLigarLog(det, container);
  if (_acp.aba === "arquivos") {
    det.querySelector("[data-acao='abrir-video']")?.addEventListener("click", () => _abrirArquivoProducao(jobId, "video"));
    det.querySelector("[data-acao='abrir-pasta']")?.addEventListener("click", () => _abrirArquivoProducao(jobId, "pasta"));
    det.querySelector("[data-acao='abrir-manifesto']")?.addEventListener("click", () => _abrirArquivoProducao(jobId, "manifesto"));
  }
  if (_acp.aba === "tags") {
    det.querySelector("#btn-copiar-creditos")?.addEventListener("click", (ev) => _acpCopiar(d.creditos_texto || "", ev.currentTarget));
  }
  if (_acp.aba === "cenas") {
    det.querySelectorAll("#acp-cenas-filtro button").forEach((b) => b.addEventListener("click", () => {
      _acp.cenas.filtro = b.dataset.f;
      det.querySelectorAll("#acp-cenas-filtro button").forEach((x) => x.classList.toggle("ativo", x === b));
      _acpRenderCenas(det, jobId);
    }));
  }
}

// ------------------------------------------------------------ cabecalho --
function _acpAtualizarCabecalho(det, d) {
  const st = (d.estado || {}).status;
  const pn = d.painel || {};
  const mini = det.querySelector("#acp-mini");
  if (!mini) return;
  const ue = pn.unidades_etapa;
  const pct = st === "pronto" ? 100 : Math.round(pn.pct_total || 0);
  const etapaTxt = ue ? `${ue.feito} / ${ue.total}` : (st === "pronto" ? "6 / 6" : `${Math.max(1, FASES_PIPELINE.findIndex((f) => f.id === (d.estado || {}).fase) + 1)} / 6`);
  let frase = pn.acao || "";
  if (st === "fila") frase = d.fila && d.fila.posicao ? `aguardando a vez · ${d.fila.posicao}º na fila` : "aguardando a vez na fila";
  if (st === "pronto") frase = "vídeo entregue";
  if (st === "erro") frase = "parou com erro";
  if (st === "cancelado") frase = "parado pelo usuário";
  if (st === "aguardando_creditos") frase = "aguardando créditos";
  let eta = "";
  if (st === "produzindo" && pn.eta_total_s != null) eta = `Termina em ${_acpFalta(pn.eta_total_s)} · previsão ${_acpHora(pn.termina_em)}`;
  else if (st === "fila" && pn.eta_total_s != null) eta = `Leva ${_acpFalta(pn.eta_total_s)} depois de começar`;
  else if (st === "pronto") eta = `Concluído às ${_acpHora((d.estado || {}).atualizado_em)}`;
  mini.className = `acp-mini st-${st}`;
  mini.innerHTML = `
    <div class="acp-mini-l1"><span><b>TEMPO</b> ${_acpDur(pn.decorrido_s)}</span><span><b>ETAPA</b> ${etapaTxt}</span></div>
    <div class="acp-mini-l2"><span class="frase" title="${escaparHtml(frase)}">${escaparHtml(frase)}</span><span class="pct">${pct}%</span></div>
    <div class="acp-mini-barra"><div style="width:${pct}%"></div></div>
    ${eta ? `<div class="acp-mini-eta">${eta}</div>` : ""}`;
}

// --------------------------------------------------------------- resumo --
function _acpStepper(d) {
  const estado = d.estado || {};
  const st = estado.status;
  const concl = (estado.extra && estado.extra.fases_concluidas) || [];
  const atualIdx = FASES_PIPELINE.findIndex((f) => f.id === estado.fase);
  return `<ol class="acp-stepper">${FASES_PIPELINE.map((f, i) => {
    let cls = "futuro", status = "A seguir";
    if (concl.includes(f.id) || st === "pronto") { cls = "feito"; status = "Concluída"; }
    if (i === atualIdx && st !== "pronto") {
      if (st === "produzindo") { cls = "atual"; status = "Em andamento"; }
      else if (st === "erro") { cls = "erro"; status = "Com erro"; }
      else if (st === "aguardando_creditos") { cls = "espera"; status = "Aguardando créditos"; }
      else if (st === "cancelado") { cls = "parado"; status = "Parada"; }
    }
    if (cls === "feito" && st !== "pronto" && i === atualIdx - 1) status = "Etapa anterior";
    return `<li class="acp-passo ${cls}"><div class="bola"><span>${cls === "feito" ? Icones.check : i + 1}</span></div>
      <div class="nome">${f.rotulo}</div><div class="st">${status}</div></li>`;
  }).join("")}</ol>`;
}

function _acpAtualizarResumo(det, d) {
  const el = det.querySelector("#acp-resumo");
  if (!el) return;
  const estado = d.estado || {};
  const st = estado.status;
  const pn = d.painel || {};
  const fase = FASES_PIPELINE.find((f) => f.id === estado.fase);
  const chaveStep = `${st}|${estado.fase}|${((estado.extra || {}).fases_concluidas || []).join(",")}`;

  // banner de estados especiais
  const banner = det.querySelector("#acp-banner");
  let bHtml = "";
  if (st === "aguardando_creditos") {
    const info = (estado.extra && estado.extra.aguardando_creditos) || {};
    bHtml = htmlBanner("aviso", Icones.alerta,
      `<strong>Aguardando créditos.</strong> ${escaparHtml(info.mensagem || "Saldo insuficiente para continuar.")}`
      + `<br><span class="acp-banner-links">Recarregar: <a href="${LINKS_RECARGA.openrouter}" target="_blank" rel="noopener">OpenRouter ${Icones.externo}</a> · `
      + `<a href="${LINKS_RECARGA.openai}" target="_blank" rel="noopener">OpenAI ${Icones.externo}</a> · <a href="#custos">informar saldo da OpenAI</a></span>`,
      `<button class="botao primario" data-retomar>Retomar</button>`);
  } else if (st === "erro") {
    bHtml = htmlBanner("erro", Icones.erro, `<strong>A produção parou com erro.</strong> ${escaparHtml(estado.erro || "")}<br><span class="acp-banner-links">O que já foi feito está guardado; corrija e clique em Retomar.</span>`,
      `<button class="botao primario" data-retomar>Retomar</button>`);
  } else if (st === "cancelado") {
    bHtml = htmlBanner("info", Icones.info, `<strong>Produção parada.</strong> O que já foi feito está guardado — dá para continuar de onde parou.`,
      `<button class="botao primario" data-retomar>Retomar</button>`);
  }
  if (banner.dataset.html !== bHtml) {
    banner.dataset.html = bHtml;
    banner.innerHTML = bHtml;
    banner.querySelector("[data-retomar]")?.addEventListener("click", () => det.querySelector("#acp-retomar")?.click());
  }

  if (_acp.chaveStepper !== chaveStep) {
    _acp.chaveStepper = chaveStep;
    let titulo, sub;
    if (st === "pronto") { titulo = "Vídeo pronto"; sub = "Produção concluída e entregue na pasta de saída."; }
    else if (st === "fila") { titulo = "Na fila"; sub = "Esta produção começa assim que o Robô terminar as que estão na frente."; }
    else if (st === "aguardando_creditos") { titulo = `${fase ? fase.rotulo : "Produção"} aguardando créditos`; sub = "Recarregue o provedor e clique em Retomar."; }
    else if (st === "erro") { titulo = `${fase ? fase.rotulo : "Produção"} com erro`; sub = "Veja o log abaixo para o detalhe."; }
    else if (st === "cancelado") { titulo = `${fase ? fase.rotulo : "Produção"} parada`; sub = "Parada pelo usuário."; }
    else { titulo = `${fase ? fase.rotulo : "Produção"} em andamento`; sub = fase ? fase.sub : ""; }
    el.innerHTML = `
      <h3 class="acp-etapa-tit">${titulo}</h3>
      <p class="acp-etapa-sub">${sub}</p>
      ${_acpStepper(d)}
      <div class="acp-sep"></div>
      <div id="acp-dinamico"></div>`;
  }
  const din = el.querySelector("#acp-dinamico");
  const ue = pn.unidades_etapa;
  let html = "";
  if (st === "fila") {
    const f = d.fila || {};
    const frente = (f.na_frente || []).map((x) => `<li><span class="acp-selo ${x.status === "produzindo" ? "produzindo" : "fila"}">${x.status === "produzindo" ? "● Produzindo" : "Na fila"}</span> ${escaparHtml(x.nome)} <span class="dim">· ${_ROTULO_FASE[x.etapa] || "aguardando"} · falta ${_acpFalta(x.eta_total_s)}</span></li>`).join("");
    html = `
      <div class="acp-stats">
        <div><div class="rot">Posição na fila</div><div class="val">${f.posicao ? `${f.posicao}º` : "—"}</div></div>
        <div><div class="rot">Começa em</div><div class="val">${_acpFalta(f.comeca_em_s)}</div></div>
        <div><div class="rot">Duração estimada</div><div class="val">${_acpFalta(pn.eta_total_s)}</div></div>
      </div>
      ${frente ? `<div class="acp-frente"><div class="rot">Na frente desta produção</div><ul>${frente}</ul></div>` : ""}`;
  } else if (st === "pronto") {
    const e = d.entrega || {};
    const arq = d.arquivos || {};
    html = `
      <div class="acp-stats">
        <div><div class="rot">Tempo de produção</div><div class="val">${_acpDur(pn.decorrido_s)}</div></div>
        <div><div class="rot">Duração do vídeo</div><div class="val">${e.duracao_s ? _acpTc(e.duracao_s) : "—"}</div></div>
        <div><div class="rot">Cenas</div><div class="val">${e.beats || pn.beats || "—"}</div></div>
      </div>
      <div class="acp-pronto-arqs">
        <button class="botao primario" data-acao="abrir-video" ${!arq.video ? "disabled" : ""}>${Icones.video} Abrir vídeo ${arq.video_tamanho_mb ? `(${arq.video_tamanho_mb} MB)` : ""}</button>
        <button class="botao" data-acao="abrir-pasta">${Icones.pasta} Abrir pasta</button>
        <button class="botao" data-acao="abrir-manifesto" ${!arq.manifesto ? "disabled" : ""}>Manifesto de licenças</button>
      </div>
      ${e.copia ? `<p class="acp-nota">Entregue em <code>${escaparHtml(e.copia)}</code></p>` : ""}`;
  } else {
    const falta = st === "produzindo" ? _acpFalta(pn.eta_total_s) : "—";
    const nesta = ue ? `${ue.feito} de ${ue.total}` : _acpDur(pn.etapa_decorrido_s);
    const pctEtapa = ue && ue.total ? Math.round((100 * ue.feito) / ue.total) : ((pn.pct_fase || {})[estado.fase] || {}).pct || 0;
    html = `
      <div class="acp-stats">
        <div><div class="rot">Tempo de produção</div><div class="val">${_acpDur(pn.decorrido_s)}</div></div>
        <div><div class="rot">Nesta etapa</div><div class="val">${nesta}</div></div>
        <div><div class="rot">Falta</div><div class="val">${falta}${st === "produzindo" && pn.termina_em ? `<small>previsão ${_acpHora(pn.termina_em)}</small>` : ""}</div></div>
      </div>
      <div class="acp-acao-linha"><span class="acao">${escaparHtml(pn.acao || "")}</span><span class="cont">${ue ? `${ue.feito} / ${ue.total}` : `${pctEtapa}%`}</span></div>
      <div class="acp-barra ${st}"><div style="width:${pctEtapa}%"></div></div>
      <p class="acp-nota">Pode deixar esta página aberta. Quando o vídeo for entregue, os arquivos aparecerão aqui.</p>`;
  }
  if (din.dataset.html !== html) {
    din.dataset.html = html;
    din.innerHTML = html;
    din.querySelector("[data-acao='abrir-video']")?.addEventListener("click", () => _abrirArquivoProducao(d.job_id, "video"));
    din.querySelector("[data-acao='abrir-pasta']")?.addEventListener("click", () => _abrirArquivoProducao(d.job_id, "pasta"));
    din.querySelector("[data-acao='abrir-manifesto']")?.addEventListener("click", () => _abrirArquivoProducao(d.job_id, "manifesto"));
  }
}

// ------------------------------------------------------------- servicos --
function _acpAtualizarServicos(det, d) {
  const el = det.querySelector("#acp-servicos");
  if (!el) return;
  const pn = d.painel || {};
  const st = (d.estado || {}).status;
  const todos = (pn.servicos || []).slice();
  const ativos = todos.filter((s) => s.ativo && st === "produzindo");
  const etapaAtual = (d.estado || {}).fase;
  const daEtapa = todos.filter((s) => !s.ativo && s.etapa === etapaAtual);
  const lista = st === "produzindo" ? [...ativos, ...daEtapa] : todos;
  det.querySelector("#acp-serv-tit").textContent = st === "produzindo" ? "Serviços em execução" : "Serviços";
  det.querySelector("#acp-serv-sub").textContent = st === "produzindo"
    ? `· ${ativos.length} ativo${ativos.length === 1 ? "" : "s"}` : `· ${todos.length} no total`;
  if (!lista.length) {
    const html = `<p class="pagina-sub">${st === "fila" ? "Nada rodando ainda — a produção está na fila." : "Nenhum serviço registrado ainda."}</p>`;
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
    return;
  }
  const html = lista.map((s) => {
    const pct = s.total ? Math.min(100, Math.round((100 * s.feito) / s.total)) : null;
    const prog = s.total ? `${s.feito}/${s.total}` : `${s.feito}`;
    const ritmo = s.ritmo_por_min && (s.total > 2 || (!s.total && s.feito > 2)) ? (s.ritmo_por_min >= 1 ? `${s.ritmo_por_min.toFixed(s.ritmo_por_min < 10 ? 1 : 0).replace(".", ",")}/min` : `${Math.round(s.s_por_unidade)} s cada`) : "—";
    const falta = !s.ativo ? `feito em ${_acpDur(s.duracao_s)}` : (s.total ? `falta ${_acpFalta(s.eta_s)}` : "em andamento");
    return `<div class="acp-serv ${s.ativo ? "ativo" : "feito"}">
      <span class="ponto"></span>
      <span class="nome">${escaparHtml(s.rotulo)}<small>${_ROTULO_FASE[s.etapa] || ""}</small></span>
      <span class="barra">${pct != null ? `<span style="width:${pct}%"></span>` : s.ativo ? `<span class="indet"></span>` : `<span style="width:100%"></span>`}</span>
      <span class="num">${prog}</span>
      <span class="ritmo">${ritmo}</span>
      <span class="falta">${falta}</span>
    </div>`;
  }).join("");
  if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
}

// ------------------------------------------------------------------ job --
function _acpAtualizarJob(det, d) {
  const el = det.querySelector("#acp-job");
  if (!el) return;
  const pn = d.painel || {};
  const et = pn.etapas || {};
  const esp = pn.esperado_por_etapa || {};
  const f = d.fila || {};
  const ped = d.pedido || {};
  const linhasEtapa = FASES_PIPELINE.map((fa) => {
    const e = et[fa.id];
    const dur = e ? (e.pulada ? "já feita" : _acpDur(e.duracao_s)) : `~${_acpDur(esp[fa.id], true)} (estim.)`;
    return `<tr class="${e && e.em_andamento ? "atual" : ""}"><td>${fa.rotulo}</td><td>${e ? _acpHoraSeg(e.inicio) : "—"}</td><td>${e ? _acpHoraSeg(e.fim) : "—"}</td><td>${dur}</td></tr>`;
  }).join("");
  const posicao = f.rodando ? "rodando agora" : f.posicao ? `${f.posicao}º de ${f.total_na_fila}` : "fora da fila";
  const html = `
    <div class="acp-job-grade">
      <div><span class="k">ID</span><span class="v"><code>${escaparHtml(d.job_id)}</code> <button class="acp-mini-btn" data-copiar="${escaparHtml(d.job_id)}">${Icones.copiar}</button></span></div>
      <div><span class="k">Pasta</span><span class="v"><code class="quebra">${escaparHtml(d.pasta || "")}</code> <button class="acp-mini-btn" data-copiar="${escaparHtml(d.pasta || "")}">${Icones.copiar}</button> <button class="acp-mini-btn" data-abrir-pasta title="Abrir pasta">${Icones.pasta}</button></span></div>
      <div><span class="k">Pedido</span><span class="v">${formatarData(d.pedido_em)}</span></div>
      <div><span class="k">Canal</span><span class="v">${escaparHtml((d.canal && d.canal.nome) || "Sem canal")}</span></div>
      <div><span class="k">Projeto</span><span class="v">${escaparHtml((d.projeto && d.projeto.nome) || "Nenhum")}</span></div>
      <div><span class="k">Fila</span><span class="v">${posicao}${(f.na_frente || []).length ? ` · na frente: ${f.na_frente.map((x) => escaparHtml(x.nome)).join(", ")}` : ""}</span></div>
      <div><span class="k">Última atividade</span><span class="v">${_acpHoraSeg(pn.ultima_atividade)}</span></div>
      <div><span class="k">Narração</span><span class="v">${pn.minutos_narracao ? `${pn.minutos_narracao.toFixed(1).replace(".", ",")} min` : "—"} · ${pn.beats || "—"} cenas</span></div>
      <div><span class="k">Pedido feito</span><span class="v">estilo ${escaparHtml(ped.estilo || "—")} · ${ped.pct_real != null ? ped.pct_real + "% acervo" : ""} · IA ${escaparHtml(ped.gerador_imagem || "—")} · juiz ${ped.juiz_visual ? "ligado" : "desligado"}${ped.takes_ativos ? " · takes" : ""}</span></div>
    </div>
    <table class="acp-tab-etapas"><thead><tr><th>Etapa</th><th>Início</th><th>Fim</th><th>Duração</th></tr></thead><tbody>${linhasEtapa}</tbody></table>`;
  if (el.dataset.html !== html) {
    el.dataset.html = html;
    el.innerHTML = html;
    el.querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", () => _acpCopiar(b.dataset.copiar, b)));
    el.querySelector("[data-abrir-pasta]")?.addEventListener("click", () => _abrirArquivoProducao(d.job_id, "pasta"));
  }
}

// ------------------------------------------------------------------ log --
function _acpLogToolbar() {
  const f = _acp.log.filtros;
  const fases = FASES_PIPELINE.map((x) => `<option value="${x.id}" ${f.fase === x.id ? "selected" : ""}>${x.rotulo}</option>`).join("");
  const servs = Object.entries(SERVICOS_LOG).map(([id, [, r]]) => `<option value="${id}" ${f.servico === id ? "selected" : ""}>${r}</option>`).join("");
  return `<div class="acp-log-barra">
    <select id="acp-log-fase" title="Etapa"><option value="">Todas as etapas</option>${fases}</select>
    <select id="acp-log-servico" title="Serviço"><option value="">Todos os serviços</option>${servs}</select>
    <div class="acp-seg" id="acp-log-nivel">
      <button data-n="" class="${!f.nivel ? "ativo" : ""}">Tudo</button>
      <button data-n="aviso" class="${f.nivel === "aviso" ? "ativo" : ""}">Avisos</button>
      <button data-n="erro" class="${f.nivel === "erro" ? "ativo" : ""}">Erros</button>
    </div>
    <input id="acp-log-q" type="search" placeholder="Buscar no log…" value="${escaparHtml(f.q)}" />
    <button class="botao" id="acp-log-copiar" title="Copiar as linhas visíveis">${Icones.copiar} Copiar</button>
    <button class="botao" id="acp-log-baixar" title="Baixar o producao.log inteiro">Baixar</button>
  </div>`;
}

function _acpLigarLog(det, container) {
  const f = _acp.log.filtros;
  const recarregar = () => { _acp.log.chaveFiltro = null; _acp.log.pausado = false; _acpAtualizarDetalhe(container, _acp.jobAtual); };
  det.querySelector("#acp-log-fase").addEventListener("change", (ev) => { f.fase = ev.target.value; recarregar(); });
  det.querySelector("#acp-log-servico").addEventListener("change", (ev) => { f.servico = ev.target.value; recarregar(); });
  det.querySelectorAll("#acp-log-nivel button").forEach((b) => b.addEventListener("click", () => {
    f.nivel = b.dataset.n;
    det.querySelectorAll("#acp-log-nivel button").forEach((x) => x.classList.toggle("ativo", x === b));
    recarregar();
  }));
  let t = null;
  det.querySelector("#acp-log-q").addEventListener("input", (ev) => {
    clearTimeout(t);
    t = setTimeout(() => { f.q = ev.target.value.trim(); recarregar(); }, 300);
  });
  det.querySelector("#acp-log-copiar").addEventListener("click", (ev) => {
    _acpCopiar(_acp.log.linhas.map(_acpLinhaTexto).join("\n"), ev.currentTarget);
  });
  det.querySelector("#acp-log-baixar").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = `/api/producoes/${_acp.jobAtual}/log.txt`;
    a.download = "";
    document.body.appendChild(a); a.click(); a.remove();
  });
  const corpo = det.querySelector("#acp-log-corpo");
  const voltar = det.querySelector("#acp-log-voltar");
  corpo.addEventListener("scroll", () => {
    const noFim = corpo.scrollHeight - corpo.scrollTop - corpo.clientHeight < 24;
    _acp.log.pausado = !noFim;
    voltar.hidden = noFim;
  });
  voltar.addEventListener("click", () => { corpo.scrollTop = corpo.scrollHeight; _acp.log.pausado = false; voltar.hidden = true; });
}

function _acpLinhaTexto(r) {
  const s = (SERVICOS_LOG[r.servico] || [null, r.servico])[1] || r.servico || "";
  return `${r.h} ${(r.fase || "").padEnd(10)} [${s}] ${r.nivel !== "info" ? r.nivel.toUpperCase() + ": " : ""}${r.msg}`;
}

function _acpLinhaHtml(r) {
  const [etapa, rot] = SERVICOS_LOG[r.servico] || [r.fase, r.servico];
  return `<div class="l ${r.nivel}"><span class="h">${escaparHtml(r.h)}</span><span class="tag et-${etapa || "geral"}">${escaparHtml(rot || r.servico || "")}</span><span class="m">${escaparHtml(r.msg)}</span></div>`;
}

function _acpAtualizarLog(det, d, chaveFiltro, usouDesde) {
  const corpo = det.querySelector("#acp-log-corpo");
  if (!corpo) return;
  const lg = d.log_estruturado || { linhas: [], total: 0, casam: 0, ultimo_n: -1 };
  const incremental = _acp.log.chaveFiltro === chaveFiltro;
  if (!incremental && usouDesde) {
    // esqueleto recriado com dados incrementais: recarrega tudo no proximo tick
    _acp.log.chaveFiltro = null;
    _acp.log.ultimoN = -1;
    if (!corpo.children.length) corpo.innerHTML = `<div class="vazio">Carregando o log…</div>`;
    return;
  }
  if (!incremental) {
    _acp.log.linhas = lg.linhas.slice();
    corpo.innerHTML = _acp.log.linhas.length ? _acp.log.linhas.map(_acpLinhaHtml).join("")
      : `<div class="vazio">Nenhuma linha${_acp.log.filtros.q || _acp.log.filtros.servico || _acp.log.filtros.nivel || _acp.log.filtros.fase ? " com esses filtros" : " ainda"}.</div>`;
    _acp.log.chaveFiltro = chaveFiltro;
    corpo.scrollTop = corpo.scrollHeight;
  } else if (lg.linhas.length) {
    corpo.querySelector(".vazio")?.remove();
    _acp.log.linhas.push(...lg.linhas);
    corpo.insertAdjacentHTML("beforeend", lg.linhas.map(_acpLinhaHtml).join(""));
    const excesso = corpo.children.length - 3000;
    for (let i = 0; i < excesso; i++) corpo.firstElementChild.remove();
    if (_acp.log.linhas.length > 3000) _acp.log.linhas.splice(0, _acp.log.linhas.length - 3000);
    if (!_acp.log.pausado) corpo.scrollTop = corpo.scrollHeight;
  }
  _acp.log.ultimoN = lg.ultimo_n;
  const pn = lg.por_nivel || {};
  det.querySelector("#acp-log-cont").innerHTML = `· ${lg.total} linhas${pn.aviso ? ` · <span class="c-aviso">${pn.aviso} aviso${pn.aviso === 1 ? "" : "s"}</span>` : ""}${pn.erro ? ` · <span class="c-erro">${pn.erro} erro${pn.erro === 1 ? "" : "s"}</span>` : ""}`;
}

// ---------------------------------------------------------------- cenas --
async function _acpAtualizarCenas(det, jobId) {
  const agora = Date.now();
  if (_acp.cenas.dados && agora - _acp.cenas.ultimo < 3000) return;
  _acp.cenas.ultimo = agora;
  try {
    _acp.cenas.dados = await Api.get(`/api/producoes/${jobId}/cenas`);
  } catch (_) { return; }
  if (jobId !== _acp.jobAtual) return;
  _acpRenderCenas(det, jobId);
}

function _acpRenderCenas(det, jobId) {
  const el = det.querySelector("#acp-cenas");
  const dados = _acp.cenas.dados;
  if (!el || !dados) return;
  const r = dados.resumo || {};
  det.querySelector("#acp-cenas-resumo").textContent =
    `${r.total || 0} cenas · ${r.acervo || 0} do acervo · ${r.ia || 0} por IA · ${r.pendentes || 0} pendentes`;
  const filtro = _acp.cenas.filtro;
  const lista = (dados.cenas || []).filter((c) =>
    filtro === "todas" || (filtro === "acervo" && c.status === "escolhida" && c.fonte !== "ia")
    || (filtro === "ia" && c.fonte === "ia") || (filtro === "pendentes" && c.status !== "escolhida"));
  if (!lista.length) {
    el.innerHTML = `<p class="pagina-sub">${(dados.cenas || []).length ? "Nenhuma cena neste filtro." : "As cenas aparecem aqui depois da etapa Cenas."}</p>`;
    return;
  }
  const html = lista.map((c) => {
    const fonte = c.fonte === "ia" ? `IA · ${escaparHtml((c.ia && c.ia.gerador) || c.autor || "")}` : c.provedor ? `${escaparHtml(c.provedor)} · ${escaparHtml(c.midia_id || "")}` : (c.planejado === "ia" ? "vai para IA" : "aguardando");
    const nota = c.nota != null && c.fonte !== "ia" ? `<span class="nota ${c.nota >= 80 ? "alta" : c.nota >= 60 ? "media" : "baixa"}">${Math.round(c.nota)}</span>` : "";
    const juiz = c.juiz ? `<span class="dim">juiz: ${c.juiz.julgados} julgado${c.juiz.julgados === 1 ? "" : "s"}, ${c.juiz.vetados} vetado${c.juiz.vetados === 1 ? "" : "s"}</span>` : "";
    const custo = c.ia && c.ia.custo_usd != null ? `<span class="dim">${formatarMoeda(c.ia.custo_usd)}</span>` : "";
    return `<div class="acp-cena ${c.status}" data-beat="${c.beat}">
      <div class="thumb">${c.miniatura ? `<img loading="lazy" src="${c.miniatura}" alt="cena ${c.beat}">` : `<span>${c.planejado === "ia" || c.status === "ia_pendente" ? "IA" : "—"}</span>`}
        <span class="tc">#${c.beat} · ${_acpTc(c.inicio)}</span>${c.tipo === "video" ? `<span class="tipo">vídeo</span>` : ""}${nota}</div>
      <div class="info">
        <div class="texto" title="${escaparHtml(c.texto)}">${escaparHtml(c.texto)}</div>
        ${c.query ? `<div class="query" title="Busca pedida pelo planner">🔎 ${escaparHtml(c.query)}</div>` : ""}
        <div class="fonte">${fonte} ${custo}</div>
        ${juiz ? `<div>${juiz}</div>` : ""}
      </div>
    </div>`;
  }).join("");
  if (el.dataset.html === html) return;
  el.dataset.html = html;
  el.innerHTML = html;
  el.querySelectorAll(".acp-cena").forEach((card) => card.addEventListener("click", () => {
    const c = (dados.cenas || []).find((x) => String(x.beat) === card.dataset.beat);
    if (c) _acpModalCena(c);
  }));
}

function _acpModalCena(c) {
  const ehVideo = c.tipo === "video";
  const midia = c.midia ? (ehVideo ? `<video src="${c.midia}" controls autoplay muted loop playsinline></video>` : `<img src="${c.midia}" alt="">`) : `<div class="acp-sem-midia">Sem mídia escolhida ainda</div>`;
  const linhas = [
    ["Tempo", `${_acpTc(c.inicio)} – ${_acpTc(c.fim)} (${(c.duracao || 0).toFixed(1).replace(".", ",")} s)`],
    ["Texto", escaparHtml(c.texto)],
    ["Busca (planner)", escaparHtml(c.query || "—")],
    ["Assunto", escaparHtml(c.assunto || "—")],
    ["Fonte", c.fonte === "ia" ? `IA (${escaparHtml((c.ia && c.ia.gerador) || "")}${c.ia && c.ia.modelo ? " · " + escaparHtml(c.ia.modelo) : ""})` : escaparHtml([c.provedor, c.midia_id].filter(Boolean).join(" · ") || "—")],
    ["Nota do juiz", c.nota != null && c.fonte !== "ia" ? Math.round(c.nota) : "—"],
    ["Juiz", c.juiz ? `${c.juiz.julgados} julgados · ${c.juiz.aceitos} aceitos · ${c.juiz.vetados} vetados` : "—"],
    ["Autor / licença", escaparHtml([c.autor, c.licenca].filter(Boolean).join(" · ") || "—")],
    ["Arquivo", c.arquivo ? `<code>${escaparHtml(c.arquivo)}</code>` : "—"],
  ];
  if (c.ia && c.ia.custo_usd != null) linhas.push(["Custo", formatarMoeda(c.ia.custo_usd)]);
  if (c.motivo) linhas.push(["Motivo", escaparHtml(c.motivo)]);
  const fundo = abrirModal(`
    <div class="acp-modal-cena">
      <div class="midia">${midia}</div>
      <h3>Cena #${c.beat}</h3>
      <dl>${linhas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      ${c.url_pagina ? `<p><a href="${escaparHtml(c.url_pagina)}" target="_blank" rel="noopener">Abrir página original ${Icones.externo}</a></p>` : ""}
      <div class="rodape-modal"><button class="botao" id="acp-fechar-modal">Fechar</button></div>
    </div>`);
  fundo.querySelector(".modal").classList.add("acp-modal-larga");
  fundo.querySelector("#acp-fechar-modal").addEventListener("click", fecharModal);
}
