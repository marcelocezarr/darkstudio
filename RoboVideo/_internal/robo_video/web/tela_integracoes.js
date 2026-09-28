// Tela Integracoes: 4 blocos -- "Seus creditos" (saldo das IAs que cobram),
// "Chaves de API" (grade de cartoes por provedor), "Bancos de acervo e
// conexoes" (bibliotecas de midia, referenciando a chave do bloco acima) e
// "Conta do YouTube" (login no navegador; substitui a antiga YouTube Data API).

const CORES_LOGO = ["#e5383b", "#4a90e2", "#3ecf8e", "#f0b429", "#9b59b6", "#e67e22", "#1abc9c", "#e84393", "#34495e"];

function _corLogo(id) {
  let soma = 0;
  for (const c of id) soma += c.charCodeAt(0);
  return CORES_LOGO[soma % CORES_LOGO.length];
}

const ROTULO_ESTADO = {
  testada: "Testada",
  nao_testada: "Não testada",
  erro: "Erro",
  nao_configurado: "Não configurado",
};

// estado em memoria (evita refetch so para alternar o modo de edicao do
// saldo informado da OpenAI)
let _cacheIntegracoes = null;
let _editandoCreditoOpenAI = false;
// mensagem da ultima tentativa de salvar/testar, mostrada uma vez apos o
// recarregamento do cartao (que normalmente ja mostra "Ultimo teste: ...",
// mas cobre tambem erros que nao chegam a gravar status, ex.: HTTP nao-2xx)
let _mensagemIntegracaoPendente = null;

async function telaIntegracoes(container) {
  container.innerHTML = `<div class="pagina-cabecalho"><div><h1>Integrações</h1><p class="pagina-sub">Chaves de API usadas pelo robô. Ficam cifradas no seu computador.</p></div></div><p class="pagina-sub">Carregando...</p>`;
  await _buscarERenderizar(container);
}

async function _buscarERenderizar(container, forcarCreditos) {
  const [dados, creditos, bancosResp, resumo, heygen, youtube] = await Promise.all([
    Api.get(`/api/integracoes${forcarCreditos ? "?forcar=true" : ""}`),
    Api.get(`/api/creditos${forcarCreditos ? "?forcar=true" : ""}`).catch(() => ({})),
    Api.get("/api/acervo/bancos").catch(() => ({ bancos: [] })),
    Api.get("/api/custos").catch(() => ({})),
    Api.get(`/api/avatares/heygen${forcarCreditos ? "?forcar=true" : ""}`).catch(() => ({ configurado: false })),
    Api.get("/api/youtube/contas").catch(() => ({ contas: [] })),
  ]);
  _cacheIntegracoes = {
    dados,
    creditos,
    bancos: bancosResp.bancos || [],
    gastoGroq: (resumo.por_provedor || {}).groq || 0,
    heygen,
    youtube,
  };
  _renderizarIntegracoes(container);
}

function _getClasseMensagemTeste(ok) {
  if (ok === true) return "msg-teste-ok";
  if (ok === false) return "msg-teste-erro";
  return "msg-teste-neutra";
}

function _seloCredito(tipo, texto) {
  return `<span class="selo-credito ${tipo}">${escaparHtml(texto)}</span>`;
}

// ------------------------------------------------------- bloco creditos --
function _cartaoCreditoOpenRouter(cor) {
  const configurado = cor.configurado !== false;
  let selo, valorHtml, descHtml;
  if (!configurado) {
    selo = _seloCredito("neutro", "Não configurado");
    valorHtml = `<div class="valor-grande valor-indisponivel">--</div>`;
    descHtml = `<p class="pagina-sub" style="margin:0;">Chave do OpenRouter não configurada. Adicione a chave no bloco "Chaves de API" abaixo.</p>`;
  } else if (cor.tipo === "desconhecido" || cor.saldo == null) {
    selo = _seloCredito("erro", "Erro");
    valorHtml = `<div class="valor-grande msg-teste-neutra">desconhecido</div>`;
    descHtml = `<p class="pagina-sub" style="margin:0;">${escaparHtml(cor.aviso || "Não foi possível consultar o saldo agora.")}</p>`;
  } else {
    const baixo = cor.saldo < 2;
    selo = baixo ? _seloCredito("atencao", "Atenção") : _seloCredito("real", "Saldo real");
    valorHtml = `<div class="valor-grande${baixo ? " msg-teste-erro" : ""}">${formatarMoeda(cor.saldo)}</div>`;
    const limite = cor.detalhe && cor.detalhe.limite_chave != null ? ` &middot; limite da chave ${formatarMoeda(cor.detalhe.limite_chave)}` : "";
    descHtml = `<p class="pagina-sub" style="margin:0;">Saldo da conta informado pelo OpenRouter${limite}.${cor.aviso ? "<br>" + escaparHtml(cor.aviso) : ""}</p>`;
  }
  return `
  <div class="cartao-credito">
    <div class="cabecalho-credito">
      <div class="logo-provedor logo-provedor-grande" style="background:${_corLogo("openrouter")}">O</div>
      <div class="titulo-provedor">
        <div class="nome">OpenRouter</div>
        <p class="pagina-sub" style="margin:0;">Planejamento, juiz visual e Nano Banana</p>
      </div>
      ${selo}
    </div>
    ${valorHtml}
    ${descHtml}
    <div class="rodape-credito">
      <span>${configurado && cor.atualizado_em ? "Consultado em " + formatarData(cor.atualizado_em) : ""}</span>
      <a href="${LINKS_RECARGA.openrouter}" target="_blank" rel="noopener" class="link-simples">Abrir OpenRouter ${Icones.externo}</a>
    </div>
  </div>`;
}

function _cartaoCreditoOpenAI(coa, editando) {
  const det = coa.detalhe || {};
  const estimadoOk = coa.tipo === "estimado";
  const selo = estimadoOk ? _seloCredito("estimado", "Estimado") : _seloCredito("neutro", "Não informado");
  const valorHtml = estimadoOk
    ? `<div class="valor-grande${coa.saldo < 2 ? " msg-teste-erro" : ""}">${formatarMoeda(coa.saldo)}</div>`
    : `<div class="valor-grande msg-teste-neutra">desconhecido</div>`;
  const descHtml = `<p class="pagina-sub" style="margin:0;">Calculado automaticamente: último valor informado &minus; gasto do programa desde então.</p>`;
  const blocoEditar = editando
    ? `<div class="campo-saldo" style="margin-top:2px;">
         <input type="text" inputmode="decimal" id="campo-credito-openai" placeholder="Saldo atual na OpenAI (US$)" />
         <button class="botao primario" data-acao="salvar-credito-openai">Salvar</button>
         <button class="botao" data-acao="cancelar-credito-openai">Cancelar</button>
       </div>`
    : `<div style="display:flex; gap:8px; flex-wrap:wrap;">
         <a class="botao link-simples" href="${LINKS_RECARGA.openai}" target="_blank" rel="noopener">Consultar saldo na OpenAI ${Icones.externo}</a>
         <button class="botao" data-acao="editar-credito-openai">Atualizar valor informado</button>
       </div>`;
  const rodapeTexto = estimadoOk
    ? `Informado em ${formatarData(det.informado_em)} &middot; gasto desde então ${formatarMoeda(det.gasto_desde)}`
    : escaparHtml(coa.aviso || "");
  return `
  <div class="cartao-credito">
    <div class="cabecalho-credito">
      <div class="logo-provedor logo-provedor-grande" style="background:${_corLogo("openai")}">A</div>
      <div class="titulo-provedor">
        <div class="nome">OpenAI</div>
        <p class="pagina-sub" style="margin:0;">Imagens (GPT Image 2), narração e transcrição</p>
      </div>
      ${selo}
    </div>
    ${valorHtml}
    ${descHtml}
    ${blocoEditar}
    <div class="rodape-credito"><span>${rodapeTexto}</span></div>
  </div>`;
}

function _cartaoCreditoGroq(itemGroq, gastoGroq) {
  if (!itemGroq || !itemGroq.chaves_mascaradas || itemGroq.chaves_mascaradas.length === 0) return "";
  return `
  <div class="cartao-credito pequeno">
    <div class="cabecalho-credito">
      <div class="logo-provedor logo-provedor-grande" style="background:${_corLogo("groq")}">G</div>
      <div class="titulo-provedor">
        <div class="nome">Groq</div>
        <p class="pagina-sub" style="margin:0;">Transcrição (custo baixo)</p>
      </div>
    </div>
    <div class="valor-grande">${formatarMoeda(gastoGroq)}</div>
    <p class="pagina-sub" style="margin:0;">Gasto total registrado nesta instalação (transcrição via Whisper).</p>
    <div class="rodape-credito"><span></span><a href="#custos" class="link-simples">Ver detalhes em Custos</a></div>
  </div>`;
}

// HeyGen: saldo/creditos reais da API (GET /v3/users/me), so se configurado.
function _cartaoCreditoHeyGen(h) {
  if (!h || !h.configurado) return "";
  let selo, valorHtml;
  if (h.saldo != null) {
    selo = h.saldo < 2 ? _seloCredito("atencao", "Atenção") : _seloCredito("real", "Saldo real");
    valorHtml = `<div class="valor-grande${h.saldo < 2 ? " msg-teste-erro" : ""}">${formatarMoeda(h.saldo)}</div>`;
  } else if (h.creditos != null) {
    selo = h.creditos <= 0 ? _seloCredito("atencao", "Sem créditos") : _seloCredito("real", "Créditos");
    valorHtml = `<div class="valor-grande${h.creditos <= 0 ? " msg-teste-erro" : ""}">${Number(h.creditos).toLocaleString("pt-BR")} créditos</div>`;
  } else {
    selo = _seloCredito("erro", "Erro");
    valorHtml = `<div class="valor-grande msg-teste-neutra">desconhecido</div>`;
  }
  const plano = h.detalhe && h.detalhe.plano ? ` · plano ${escaparHtml(h.detalhe.plano)}` : "";
  return `
  <div class="cartao-credito pequeno">
    <div class="cabecalho-credito">
      <div class="logo-provedor logo-provedor-grande" style="background:${_corLogo("heygen")}">H</div>
      <div class="titulo-provedor">
        <div class="nome">HeyGen</div>
        <p class="pagina-sub" style="margin:0;">Avatares (apresentador)${plano}</p>
      </div>
      ${selo}
    </div>
    ${valorHtml}
    ${h.aviso ? `<p class="pagina-sub" style="margin:0;">${escaparHtml(h.aviso)}</p>` : ""}
    <div class="rodape-credito">
      <span>${h.atualizado_em ? "Consultado em " + formatarData(h.atualizado_em) : ""}</span>
      <a href="#avatares" class="link-simples">Ver Avatares</a>
    </div>
  </div>`;
}

// -------------------------------------------------------- bloco chaves --
// Dark Planner: selo da assinatura (verde/vermelho/cinza) + cota de narracao.
function _statusDarkPlanner(item) {
  return item.darkplanner || (item.ultimo_teste && item.ultimo_teste.extra) || null;
}
function _seloAssinaturaDarkPlanner(item) {
  if (item.id !== "darkplanner" || !item.configurado) return "";
  const st = _statusDarkPlanner(item);
  if (!st) return "";
  if (st.chave === "invalida" || st.codigo === "chave_invalida") {
    return `<span class="selo-assinatura inativa" title="${escaparHtml(st.mensagem || "")}"><span class="ponto-estado"></span>Chave inválida</span>`;
  }
  if (st.assinatura === "ativa") {
    return `<span class="selo-assinatura ativa" title="${escaparHtml(st.mensagem || "")}"><span class="ponto-estado"></span>Assinatura ativa</span>`;
  }
  if (st.assinatura === "inativa") {
    return `<span class="selo-assinatura inativa" title="${escaparHtml(st.mensagem || "")}"><span class="ponto-estado"></span>Sem assinatura</span>`;
  }
  if (st.codigo === "falha") {
    return `<span class="selo-assinatura fechado" title="${escaparHtml(st.mensagem || "")}"><span class="ponto-estado"></span>Serviço indisponível</span>`;
  }
  return "";
}
function _detalheDarkPlanner(item) {
  if (item.id !== "darkplanner" || !item.configurado) return "";
  const st = _statusDarkPlanner(item);
  if (!st) return "";
  const partes = [];
  const ct = st.cota;
  if (ct && (ct.restantes != null || ct.limite != null)) {
    let txt = "Cota de narração: ";
    txt += ct.restantes != null ? `${ct.restantes}${ct.limite != null ? " de " + ct.limite : ""} restantes hoje` : `limite ${ct.limite}/dia`;
    if (ct.plano) txt += ` · plano ${ct.plano}`;
    if (ct.max_caracteres) txt += ` · até ${Number(ct.max_caracteres).toLocaleString("pt-BR")} caracteres por áudio`;
    partes.push(`<p class="pagina-sub ${ct.restantes === 0 ? "msg-teste-erro" : ""}" style="margin:0;">${escaparHtml(txt)}</p>`);
  }
  if (st.codigo && st.codigo !== "ok" && st.mensagem) {
    partes.push(`<p class="pagina-sub msg-teste-erro" style="margin:0;">${escaparHtml(st.mensagem)}</p>`);
  }
  return partes.join("");
}

function _cartaoIntegracao(item) {
  const inicial = item.nome.slice(0, 1).toUpperCase();
  const temChave = item.chaves_mascaradas.length > 0;
  let mensagemErroSalvar = "";
  if (_mensagemIntegracaoPendente && _mensagemIntegracaoPendente.id === item.id) {
    const classe = _getClasseMensagemTeste(_mensagemIntegracaoPendente.ok);
    mensagemErroSalvar = `<p class="pagina-sub ${classe}" style="margin:0;">${escaparHtml(_mensagemIntegracaoPendente.mensagem)}</p>`;
    _mensagemIntegracaoPendente = null;
  }
  const listaChaves = item.chaves_mascaradas
    .map(
      (masc, idx) => `<div class="chave-mascarada"><span>${escaparHtml(masc)}</span><button title="Remover" data-acao="remover" data-id="${item.id}" data-indice="${idx}">${Icones.lixeira}</button></div>`
    )
    .join("");

  const blocoNovaChave = `
    <div class="bloco-nova-chave${temChave ? " oculto-chave" : ""}">
      <div class="campo" style="margin-bottom:8px;">
        <input type="text" placeholder="Cole a chave aqui" id="campo-chave-${item.id}" />
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="botao primario" data-acao="salvar" data-id="${item.id}">Salvar e testar</button>
        ${item.aceita_pool && temChave ? `<button class="botao" data-acao="adicionar" data-id="${item.id}">+ Adicionar</button>` : ""}
      </div>
    </div>`;

  const blocoChaveAtual = temChave
    ? `<div class="bloco-chave-atual">${listaChaves}<button class="botao" style="margin-top:6px;" data-acao="trocar">Trocar chave</button></div>`
    : "";

  const seloPool = item.aceita_pool && item.chaves_mascaradas.length > 0
    ? `<span class="selo selo-pool">${item.chaves_mascaradas.length} no pool</span>`
    : "";

  return `
  <div class="cartao-integracao" data-id="${item.id}">
    <div class="cabecalho-integracao">
      <div class="logo-provedor" style="background:${_corLogo(item.id)}">${inicial}</div>
      <div class="titulo-provedor">
        <div class="nome">${escaparHtml(item.nome)}</div>
        <div class="selos">
          <span class="selo ${item.obrigatorio ? "selo-obrigatorio" : "selo-opcional"}">${item.obrigatorio ? "Obrigatório" : "Opcional"}</span>
          <span class="estado-badge ${item.estado}"><span class="ponto-estado"></span>${item.estado === "testada" ? Icones.check : ""}${ROTULO_ESTADO[item.estado] || item.estado}</span>
          ${seloPool}
          ${_seloAssinaturaDarkPlanner(item)}
        </div>
      </div>
    </div>
    <p class="pagina-sub descricao-integracao" style="margin:0;">${escaparHtml(item.descricao)}</p>
    <div class="corpo-integracao">
      ${blocoChaveAtual}
      ${blocoNovaChave}
      ${mensagemErroSalvar}
      ${item.ultimo_teste && item.ultimo_teste.mensagem ? `<p class="pagina-sub ${_getClasseMensagemTeste(item.ultimo_teste.ok)}" style="margin:0;">Último teste: ${escaparHtml(item.ultimo_teste.mensagem)}</p>` : ""}
      ${_detalheDarkPlanner(item)}
      ${item.como_pegar_chave && !temChave ? `<p class="pagina-sub" style="margin:0;">${escaparHtml(item.como_pegar_chave)}</p>` : ""}
    </div>
    <div class="rodape-integracao">
      <details class="entenda-ajuste"><summary>Como funciona o limite</summary><p>${escaparHtml(item.como_funciona_limite)}</p></details>
      <div><a href="${escaparHtml(item.url_chave)}" target="_blank" rel="noopener" class="link-simples">Pegar a chave ${Icones.externo}</a></div>
    </div>
  </div>`;
}

// ------------------------------------------------ bloco bancos de acervo --
function _cartaoBancoAcervo(banco) {
  const badgeChave = banco.precisa_chave
    ? (banco.chave_configurada
        ? `<span class="estado-badge testada">${Icones.check}Chave configurada</span>`
        : `<span class="estado-badge nao_configurado">Sem chave</span>`)
    : `<span class="estado-badge testada">${Icones.check}Sem chave necessária</span>`;
  return `
  <div class="cartao-banco-acervo">
    <div class="cabecalho-integracao">
      <div class="logo-provedor" style="background:${_corLogo(banco.id)}">${escaparHtml(banco.nome.slice(0, 1).toUpperCase())}</div>
      <div class="titulo-provedor">
        <div class="nome">${escaparHtml(banco.nome)}</div>
        <span class="selo ${banco.ligado_padrao ? "selo-ligado" : "selo-opcional"}">${banco.ligado_padrao ? "Ligado por padrão" : "Desligado por padrão"}</span>
      </div>
    </div>
    <p class="pagina-sub" style="margin:0;">${escaparHtml(banco.descricao || "")}</p>
    <div>${badgeChave}</div>
    ${banco.risco ? `<p class="pagina-sub nota-risco" style="margin:0;">${Icones.alerta} ${escaparHtml(banco.risco)}</p>` : ""}
  </div>`;
}

// ------------------------------------------------ bloco conta do YouTube --
// Conta(s) do YouTube vinculada(s) por login no navegador (perfil exclusivo do
// robo; cookies so neste PC). Sem YouTube Data API. A conta EM USO e escolhida
// pelo usuario; nao ha troca automatica de conta.
let _timerYoutube = null;

const CLASSE_ESTADO_YT = { em_uso: "testada", reserva: "nao_testada", expirada: "erro" };

function _linhaContaYoutube(c) {
  const botoes = [];
  if (c.estado === "reserva") botoes.push(`<button class="botao" data-yt-acao="usar" data-id="${escaparHtml(c.id)}">Usar</button>`);
  botoes.push(`<button class="botao${c.estado === "expirada" ? " primario" : ""}" data-yt-acao="reconectar" data-id="${escaparHtml(c.id)}">Reconectar</button>`);
  botoes.push(`<button class="botao" data-yt-acao="remover" data-id="${escaparHtml(c.id)}" title="Remover a conta e apagar o perfil do navegador">Remover</button>`);
  return `
    <div class="yt-conta" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; background:var(--bg-elevado); border-radius:8px; padding:10px 12px;">
      <span style="font-family:Consolas, monospace; font-size:0.86rem;">${escaparHtml(c.email_mascarado)}</span>
      <span class="estado-badge ${CLASSE_ESTADO_YT[c.estado] || "nao_configurado"}"><span class="ponto-estado"></span>${c.estado === "em_uso" ? Icones.check : ""}${escaparHtml(c.rotulo_estado)}</span>
      ${c.conectada_em ? `<span class="pagina-sub" style="margin:0; font-size:0.78rem;">conectada em ${formatarData(c.conectada_em)}</span>` : ""}
      <div style="margin-left:auto; display:flex; gap:6px; flex-wrap:wrap;">${botoes.join("")}</div>
    </div>`;
}

function _htmlBlocoYoutube(yt) {
  yt = yt || { contas: [] };
  const contas = yt.contas || [];
  const emUso = contas.find((c) => c.estado === "em_uso");
  const con = yt.conectando;
  const aguardando = con && con.fase === "aguardando_login";
  let seloGeral;
  if (emUso) seloGeral = `<span class="estado-badge testada">${Icones.check}Conta em uso: ${escaparHtml(emUso.email_mascarado)}</span>`;
  else if (contas.some((c) => c.estado === "expirada")) seloGeral = `<span class="estado-badge erro"><span class="ponto-estado"></span>Sessão expirada — reconectar</span>`;
  else if (contas.length) seloGeral = `<span class="estado-badge nao_testada"><span class="ponto-estado"></span>Nenhuma conta em uso</span>`;
  else seloGeral = `<span class="estado-badge nao_configurado"><span class="ponto-estado"></span>Nenhuma conta conectada</span>`;
  let msgConexao = "";
  if (con && con.mensagem) {
    const classe = con.fase === "concluido" ? "msg-teste-ok" : con.fase === "aguardando_login" ? "msg-teste-neutra" : "msg-teste-erro";
    msgConexao = `<p class="pagina-sub ${classe}" style="margin:0;">${escaparHtml(con.mensagem)}</p>`;
  }
  const aviso = yt.aviso || "Use uma conta Google SECUNDÁRIA, nunca a principal. Baixar trechos contraria os Termos do YouTube e a conta pode ser marcada. O login fica só neste computador.";
  return `
      <div class="cabecalho-secao">
        <div><h2>Conta do YouTube</h2><p class="pagina-sub">Usada só para completar a % de filmagem real com trechos curtos do YouTube (busca e download pelo yt-dlp, sem API).</p></div>
        <div class="acoes-cabecalho-secao">${seloGeral}</div>
      </div>
      <div class="caixa-aviso-incompleto" id="yt-aviso" style="margin-bottom:12px;">${Icones.alerta || ""}<div>${escaparHtml(aviso)}</div></div>
      <div class="cartao-integracao" style="height:auto;">
        <div id="yt-lista-contas" style="display:flex; flex-direction:column; gap:8px;">
          ${contas.length ? contas.map(_linhaContaYoutube).join("") : `<p class="pagina-sub" style="margin:0;">Nenhuma conta conectada. Sem conta, a opção "Completar com trechos do YouTube" fica sem efeito.</p>`}
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <button class="botao primario" id="yt-conectar" ${aguardando ? "disabled" : ""}>${aguardando ? "Aguardando o login na janela do navegador..." : "Conectar conta"}</button>
        </div>
        ${msgConexao}
        <details class="entenda-ajuste"><summary>Como funciona</summary><p>"Conectar conta" abre uma janela do Microsoft Edge com um perfil só do robô. Você mesmo faz o login no Google/YouTube; o robô nunca vê nem preenche a senha. Ao terminar, os cookies da sessão ficam salvos só neste computador e a janela fecha. Se o YouTube limitar ou pedir verificação durante uma produção, a fonte YouTube é pausada naquela produção (o vídeo segue com as outras fontes/IA) — o robô não troca de conta sozinho. Se a sessão expirar, a conta aparece como "sessão expirada — reconectar".</p></details>
      </div>`;
}

async function _atualizarBlocoYoutube(container) {
  let yt;
  try {
    yt = await Api.get("/api/youtube/contas");
  } catch (exc) {
    return;
  }
  if (_cacheIntegracoes) _cacheIntegracoes.youtube = yt;
  const secao = container.querySelector("#bloco-youtube");
  if (!secao) return;
  secao.innerHTML = _htmlBlocoYoutube(yt);
  _wireBlocoYoutube(container);
  _agendarPollingYoutube(container, yt);
}

function _agendarPollingYoutube(container, yt) {
  if (_timerYoutube) { clearTimeout(_timerYoutube); _timerYoutube = null; }
  if (yt && yt.conectando && yt.conectando.fase === "aguardando_login") {
    _timerYoutube = setTimeout(() => {
      if (container.isConnected && container.querySelector("#bloco-youtube")) _atualizarBlocoYoutube(container);
    }, 2000);
  }
}

function _wireBlocoYoutube(container) {
  const secao = container.querySelector("#bloco-youtube");
  if (!secao) return;
  secao.querySelector("#yt-conectar")?.addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    try {
      await Api.post("/api/youtube/contas/conectar", {});
    } catch (exc) {
      alert("Não foi possível abrir o navegador: " + exc.message);
    }
    await _atualizarBlocoYoutube(container);
  });
  secao.querySelectorAll("[data-yt-acao]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const acao = btn.dataset.ytAcao;
      try {
        if (acao === "usar") {
          await Api.post(`/api/youtube/contas/${encodeURIComponent(id)}/usar`, {});
        } else if (acao === "reconectar") {
          await Api.post("/api/youtube/contas/conectar", { id });
        } else if (acao === "remover") {
          if (!confirm("Remover esta conta? O perfil do navegador e os cookies dela serão apagados deste computador.")) return;
          await Api.del(`/api/youtube/contas/${encodeURIComponent(id)}`);
        }
      } catch (exc) {
        alert(exc.message);
      }
      await _atualizarBlocoYoutube(container);
    });
  });
}

// ---------------------------------------------------------------- render --
function _renderizarIntegracoes(container) {
  const { dados, creditos, bancos, gastoGroq, heygen, youtube } = _cacheIntegracoes;
  const cor = creditos.openrouter || {};
  const coa = creditos.openai || {};
  const itemGroq = dados.itens.find((i) => i.id === "groq");
  const ultimaConsulta = cor.atualizado_em ? formatarData(cor.atualizado_em) : "-";

  const itensOrdenados = dados.itens
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => (a.item.obrigatorio === b.item.obrigatorio ? a.idx - b.idx : a.item.obrigatorio ? -1 : 1))
    .map((x) => x.item);

  container.innerHTML = `
    <div class="pagina-cabecalho"><div><h1>Integrações</h1><p class="pagina-sub">Chaves de API usadas pelo robô. Ficam cifradas no seu computador.</p></div></div>

    <section class="bloco-secao">
      <div class="cabecalho-secao">
        <div><h2>Seus créditos</h2><p class="pagina-sub">Todas as plataformas que cobram em um lugar.</p></div>
        <div class="acoes-cabecalho-secao">
          <span class="meta-consulta">Última consulta: ${ultimaConsulta}</span>
          <button class="botao" id="btn-atualizar-creditos">Atualizar</button>
        </div>
      </div>
      <div class="grade-creditos-topo">
        ${_cartaoCreditoOpenRouter(cor)}
        ${_cartaoCreditoOpenAI(coa, _editandoCreditoOpenAI)}
        ${_cartaoCreditoGroq(itemGroq, gastoGroq)}
        ${_cartaoCreditoHeyGen(heygen)}
      </div>
    </section>

    <section class="bloco-secao">
      <div class="cabecalho-secao">
        <div><h2>Chaves de API</h2><p class="pagina-sub">Cada provedor mostra estado, finalidade e ação no mesmo lugar. Os segredos ficam cifrados e nunca voltam para a tela.</p></div>
      </div>
      <div id="grade-integracoes" class="grade-chaves">${itensOrdenados.map((item) => _cartaoIntegracao(item)).join("")}</div>
    </section>

    <section class="bloco-secao">
      <div class="cabecalho-secao">
        <div><h2>Bancos de acervo e conexões</h2><p class="pagina-sub">Bibliotecas de vídeo/foto usadas na produção. A chave, quando necessária, é a mesma da lista acima.</p></div>
      </div>
      <div class="grade-bancos-acervo">
        ${bancos.map((b) => _cartaoBancoAcervo(b)).join("")}
      </div>
    </section>

    <section class="bloco-secao" id="bloco-youtube">${_htmlBlocoYoutube(youtube)}</section>
  `;

  _wireEventosIntegracoes(container);
  _wireBlocoYoutube(container);
  _agendarPollingYoutube(container, youtube);
}

function _wireEventosIntegracoes(container) {
  const grade = container.querySelector("#grade-integracoes");
  grade.querySelectorAll("[data-acao='salvar']").forEach((btn) => {
    btn.addEventListener("click", () => _salvarChave(container, btn.dataset.id, false));
  });
  grade.querySelectorAll("[data-acao='adicionar']").forEach((btn) => {
    btn.addEventListener("click", () => _salvarChave(container, btn.dataset.id, true));
  });
  grade.querySelectorAll("[data-acao='remover']").forEach((btn) => {
    btn.addEventListener("click", () => _removerChave(container, btn.dataset.id, btn.dataset.indice));
  });
  grade.querySelectorAll("[data-acao='trocar']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cartao = btn.closest(".cartao-integracao");
      cartao.querySelector(".bloco-nova-chave").classList.remove("oculto-chave");
      cartao.querySelector(".bloco-chave-atual").style.display = "none";
    });
  });

  container.querySelector("#btn-atualizar-creditos")?.addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    await _buscarERenderizar(container, true);
  });
  container.querySelector("[data-acao='editar-credito-openai']")?.addEventListener("click", () => {
    _editandoCreditoOpenAI = true;
    _renderizarIntegracoes(container);
  });
  container.querySelector("[data-acao='cancelar-credito-openai']")?.addEventListener("click", () => {
    _editandoCreditoOpenAI = false;
    _renderizarIntegracoes(container);
  });
  container.querySelector("[data-acao='salvar-credito-openai']")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    const campo = container.querySelector("#campo-credito-openai");
    const valor = parseFloat(String(campo.value).replace(",", "."));
    if (isNaN(valor) || valor < 0) { campo.focus(); return; }
    btn.disabled = true;
    try {
      await Api.post("/api/creditos/openai", { valor });
      _editandoCreditoOpenAI = false;
      await _buscarERenderizar(container);
    } catch (exc) {
      alert("Erro ao salvar saldo: " + exc.message);
      btn.disabled = false;
    }
  });
}

async function _salvarChave(container, id, adicionar) {
  const campo = container.querySelector(`#campo-chave-${id}`);
  const chave = campo.value.trim();
  if (!chave) { campo.focus(); return; }
  const cartao = container.querySelector(`.cartao-integracao[data-id="${id}"]`);
  const botoes = cartao.querySelectorAll("button");
  botoes.forEach((b) => (b.disabled = true));
  try {
    const resultado = await Api.post(`/api/integracoes/${id}`, { chave, adicionar });
    if (resultado && resultado.mensagem) {
      _mensagemIntegracaoPendente = { id, mensagem: resultado.mensagem, ok: resultado.ok };
    }
  } catch (exc) {
    _mensagemIntegracaoPendente = { id, mensagem: "Erro ao salvar a chave: " + exc.message, ok: false };
  } finally {
    // reabilita os botoes mesmo se algo der errado, para a tela nunca travar
    botoes.forEach((b) => (b.disabled = false));
  }
  await _buscarERenderizar(container);
}

async function _removerChave(container, id, indice) {
  if (!confirm("Remover esta chave?")) return;
  await Api.del(`/api/integracoes/${id}?indice=${indice}`);
  await _buscarERenderizar(container);
}

// usado pela tela Produzir para saber quantas chaves obrigatorias faltam
async function _obterIntegracoesResumo() {
  return Api.get("/api/integracoes");
}
