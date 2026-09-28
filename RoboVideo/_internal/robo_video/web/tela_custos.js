// Tela Custos: resumo do mes (planos + uso de APIs) no topo, depois o
// detalhamento por provedor, por producao e os saldos informados.

const _MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const _ICONE_CALENDARIO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 3v4M8 3v4M3 10h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const _ICONE_CHEVRON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// mes selecionado pelo usuario nesta navegacao (null = usa o default da API)
let _mesCustosSelecionado = null;

function _nomeMesExtenso(mesStr) {
  if (!mesStr) return "-";
  const [ano, mes] = mesStr.split("-").map(Number);
  const nome = _MESES_PT[(mes || 1) - 1] || mesStr;
  return `${nome} de ${ano}`;
}

function _pct(parte, total) {
  if (!total) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

async function telaCustos(container) {
  container.innerHTML = `<div id="corpo-custos"><p class="pagina-sub">Carregando...</p></div>`;
  await _recarregarCustos(container);
}

async function _recarregarCustos(container, forcarCreditos) {
  const mesQuery = _mesCustosSelecionado ? `?mes=${_mesCustosSelecionado}` : "";
  const [resumoMes, resumo, integracoes, producoes, creditos] = await Promise.all([
    Api.get(`/api/custos/resumo${mesQuery}`),
    Api.get("/api/custos"),
    Api.get("/api/integracoes"),
    Api.get("/api/producoes"),
    Api.get(`/api/creditos${forcarCreditos ? "?forcar=true" : ""}`).catch(() => ({})),
  ]);
  _mesCustosSelecionado = resumoMes.mes;

  const corpo = container.querySelector("#corpo-custos");
  corpo.innerHTML = _htmlResumoMes(resumoMes) + _htmlDetalhamento(resumo, integracoes, producoes, creditos);

  _ligarEventosResumoMes(container, corpo, resumoMes);
  _ligarEventosDetalhamento(container, corpo);
}

// ------------------------------------------------------- bloco de resumo --
function _htmlResumoMes(r) {
  const percApis = _pct(r.apis_usd, r.total_usd);
  const percPlanos = 100 - percApis;
  const statusComposicao = r.completo ? "Composição completa" : "Composição parcial";
  const notaTotal = r.completo
    ? "Completo"
    : "Parcial · planos informados + uso registrado";
  const linhaMinuto = r.usd_por_minuto != null
    ? `${formatarMoeda(r.usd_por_minuto)} por minuto entregue${r.completo ? "" : " · parcial"} — Total registrado dividido por ${_formatarNumero(r.minutos_entregues)} minutos entregues.`
    : `Custo por minuto indisponível — nenhum minuto entregue neste período.`;

  return `
    <div class="resumo-custos-cabecalho">
      <div>
        <h1>Custos de produção</h1>
        <p class="pagina-sub">Entenda o gasto dos seus vídeos. Do uso de APIs à parcela dos seus planos.</p>
      </div>
      <div>
        <div class="seletor-mes-custos">
          <button class="botao-seletor-mes" id="btn-seletor-mes" type="button">
            ${_ICONE_CALENDARIO} ${_nomeMesExtenso(r.mes)} ${_ICONE_CHEVRON}
          </button>
          <div class="lista-meses-custos" id="lista-meses-custos" hidden>
            ${(r.meses_disponiveis || [])
              .map((m) => `<button type="button" data-mes="${m}" class="${m === r.mes ? "ativo" : ""}">${_nomeMesExtenso(m)}</button>`)
              .join("")}
          </div>
        </div>
        <div class="periodo-atual-nota">Período atual · valores em dólar</div>
      </div>
    </div>

    <div class="faixa-composicao-custos">
      <div class="cartao-composicao">
        <div class="rotulo-composicao">Planos de serviços</div>
        <div class="valor-composicao">${formatarMoeda(r.planos_usd)}</div>
        <div class="legenda-composicao">Mensalidades dos serviços informadas por você</div>
      </div>
      <div class="simbolo-conector">+</div>
      <div class="cartao-composicao">
        <div class="rotulo-composicao">Uso de APIs</div>
        <div class="valor-composicao">${formatarMoeda(r.apis_usd)}</div>
        <div class="legenda-composicao">Consumo registrado, além dos planos</div>
      </div>
      <div class="simbolo-conector">=</div>
      <div class="cartao-composicao total">
        <div class="rotulo-composicao">Total registrado</div>
        <div class="valor-composicao">${formatarMoeda(r.total_usd)}</div>
        <div class="legenda-composicao">${notaTotal}</div>
      </div>
    </div>

    <button type="button" class="link-gerenciar-planos" id="btn-gerenciar-planos">Gerenciar planos ${_ICONE_CHEVRON}</button>

    <div class="bloco-composicao-origem">
      <div class="cabecalho-composicao">
        <h3>De onde vem o valor</h3>
        <span class="nota-composicao-status">${statusComposicao}</span>
      </div>
      <div class="barra-composicao">
        <div class="seg-planos" style="width:${percPlanos}%"></div>
        <div class="seg-apis" style="width:${percApis}%"></div>
      </div>
      <div class="legenda-barra-composicao">
        <span class="item-legenda"><span class="ponto planos"></span>Planos de serviços · ${formatarMoeda(r.planos_usd)} (${percPlanos.toFixed(1)}%)</span>
        <span class="item-legenda"><span class="ponto apis"></span>Uso de APIs · ${formatarMoeda(r.apis_usd)} (${percApis.toFixed(1)}%)</span>
      </div>
    </div>

    <p class="linha-custo-por-minuto"><strong>${linhaMinuto}</strong></p>

    ${r.completo ? "" : `
    <div class="caixa-aviso-incompleto">
      ${Icones.alerta}
      <div>
        <div class="titulo-aviso">A conta ainda está incompleta</div>
        <ul>${(r.pendencias || []).map((p) => `<li>${escaparHtml(p)}</li>`).join("")}</ul>
      </div>
    </div>`}
  `;
}

function _formatarNumero(v) {
  if (v == null || isNaN(v)) return "0";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _ligarEventosResumoMes(container, corpo, resumoMes) {
  const btnSeletor = corpo.querySelector("#btn-seletor-mes");
  const lista = corpo.querySelector("#lista-meses-custos");
  btnSeletor?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    lista.hidden = !lista.hidden;
  });
  document.addEventListener("click", () => { if (lista) lista.hidden = true; }, { once: true });
  lista?.querySelectorAll("button[data-mes]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      _mesCustosSelecionado = btn.dataset.mes;
      await _recarregarCustos(container);
    });
  });

  corpo.querySelector("#btn-gerenciar-planos")?.addEventListener("click", () => {
    _abrirModalPlanos(container);
  });
}

// -------------------------------------------------------- modal de planos --
async function _abrirModalPlanos(container) {
  const { itens } = await Api.get("/api/custos/planos");
  const mesAtual = _mesCustosSelecionado || new Date().toISOString().slice(0, 7);

  const fundo = abrirModal(`
    <h3>Planos de serviços</h3>
    <p class="pagina-sub">Mensalidades fixas (ex.: assinaturas de APIs) que entram no cartão "Planos de serviços" no mês em que estiverem ativas.</p>
    <div class="lista-planos-modal" id="lista-planos-modal">
      ${_htmlListaPlanos(itens)}
    </div>
    <div class="form-plano-novo">
      <div class="campo">
        <label>Nome</label>
        <input type="text" id="m-plano-nome" placeholder="ex.: ElevenLabs Creator" />
      </div>
      <div class="campo">
        <label>US$/mês</label>
        <input type="text" inputmode="decimal" id="m-plano-valor" placeholder="22,00" />
      </div>
      <div class="campo">
        <label>Ativo desde</label>
        <input type="month" id="m-plano-desde" value="${mesAtual}" />
      </div>
      <button class="botao" id="m-plano-adicionar">Adicionar</button>
    </div>
    <div style="display:flex; justify-content:flex-end; margin-top:16px;">
      <button class="botao" id="m-plano-fechar">Fechar</button>
    </div>
  `);

  const recarregarLista = async () => {
    const { itens } = await Api.get("/api/custos/planos");
    fundo.querySelector("#lista-planos-modal").innerHTML = _htmlListaPlanos(itens);
    _ligarEventosListaPlanos(fundo, container);
  };

  _ligarEventosListaPlanos(fundo, container);

  fundo.querySelector("#m-plano-fechar").addEventListener("click", async () => {
    fecharModal();
    await _recarregarCustos(container);
  });

  fundo.querySelector("#m-plano-adicionar").addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    const nome = fundo.querySelector("#m-plano-nome").value.trim();
    const valorTxt = fundo.querySelector("#m-plano-valor").value;
    const desde = fundo.querySelector("#m-plano-desde").value;
    const valor = parseFloat(String(valorTxt).replace(",", "."));
    if (!nome || isNaN(valor) || valor < 0 || !desde) return;
    btn.disabled = true;
    try {
      await Api.post("/api/custos/planos", { nome, valor_mensal_usd: valor, ativo_desde: desde });
      fundo.querySelector("#m-plano-nome").value = "";
      fundo.querySelector("#m-plano-valor").value = "";
      await recarregarLista();
    } catch (exc) {
      alert("Erro ao criar plano: " + exc.message);
    } finally {
      btn.disabled = false;
    }
  });
}

function _htmlListaPlanos(itens) {
  if (!itens || !itens.length) {
    return `<p class="pagina-sub">Nenhum plano cadastrado ainda.</p>`;
  }
  return itens
    .map(
      (p) => `<div class="linha-plano" data-id="${p.id}">
        <div class="info-plano">
          <div class="nome-plano">${escaparHtml(p.nome)}</div>
          <div class="det-plano">Ativo desde ${_nomeMesExtenso(p.ativo_desde)}</div>
        </div>
        <div class="valor-plano">${formatarMoeda(p.valor_mensal_usd)}/mês</div>
        <button class="botao link-simples" data-acao="apagar-plano" data-id="${p.id}" title="Remover">${Icones.lixeira}</button>
      </div>`
    )
    .join("");
}

function _ligarEventosListaPlanos(fundo, container) {
  fundo.querySelectorAll("[data-acao='apagar-plano']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remover este plano?")) return;
      btn.disabled = true;
      try {
        await Api.del(`/api/custos/planos/${btn.dataset.id}`);
        const { itens } = await Api.get("/api/custos/planos");
        fundo.querySelector("#lista-planos-modal").innerHTML = _htmlListaPlanos(itens);
        _ligarEventosListaPlanos(fundo, container);
      } catch (exc) {
        alert("Erro ao remover plano: " + exc.message);
        btn.disabled = false;
      }
    });
  });
}

// ------------------------------------------------ detalhamento (existente) --
// Dark Planner: narracao pela assinatura -- mostra a cota do plano, nao saldo.
function _cartaoCustoDarkPlanner(i, gasto) {
  const st = i.darkplanner || (i.ultimo_teste && i.ultimo_teste.extra) || {};
  const ct = st.cota || null;
  let cotaHtml;
  if (st.codigo === "falha") {
    cotaHtml = `<p class="pagina-sub" style="margin:0;">${escaparHtml(st.mensagem || "Serviço indisponível.")}</p>`;
  } else if (ct && (ct.restantes != null || ct.limite != null)) {
    const txt = ct.restantes != null
      ? `${ct.restantes}${ct.limite != null ? " de " + ct.limite : ""} narrações restantes hoje`
      : `limite de ${ct.limite} narrações/dia`;
    cotaHtml = `<p class="pagina-sub ${ct.restantes === 0 ? "msg-teste-erro" : ""}" style="margin:0;">Cota: ${escaparHtml(txt)}${ct.plano ? " · plano " + escaparHtml(ct.plano) : ""}</p>`;
  } else {
    cotaHtml = `<p class="pagina-sub" style="margin:0;">${escaparHtml(st.mensagem || "Cota indisponível.")}</p>`;
  }
  return `
      <div class="cartao-custo-provedor">
        <div class="nome">${escaparHtml(i.nome)}</div>
        <div class="valor">${formatarMoeda(gasto)}</div>
        <div class="pagina-sub" style="margin:0 0 8px;">narração pela assinatura (sem custo por uso)</div>
        ${cotaHtml}
      </div>`;
}

function _htmlDetalhamento(resumo, integracoes, producoes, creditos) {
  const mesAtual = new Date().toISOString().slice(0, 7);
  const totalMes = resumo.por_mes ? resumo.por_mes[mesAtual] || 0 : 0;
  const alertaIds = new Set((resumo.alertas_saldo_baixo || []).map((a) => a.provedor));

  const cartoesProvedor = integracoes.itens
    .filter((i) => i.configurado)
    .map((i) => {
      const gasto = (resumo.por_provedor || {})[i.id] || 0;
      const saldo = resumo.saldos ? resumo.saldos[i.id] : undefined;
      const emAlerta = alertaIds.has(i.id);
      const saldoManual = i.id !== "openrouter" && i.id !== "openai" && i.id !== "darkplanner";
      if (i.id === "darkplanner") return _cartaoCustoDarkPlanner(i, gasto);
      return `
      <div class="cartao-custo-provedor" style="${emAlerta ? "border-color: var(--amarelo);" : ""}">
        <div class="nome">${escaparHtml(i.nome)}</div>
        <div class="valor">${formatarMoeda(gasto)}</div>
        <div class="pagina-sub" style="margin:0 0 8px;">gasto total registrado</div>
        ${saldoManual ? `<div class="campo-saldo">
          <input type="text" inputmode="decimal" placeholder="Saldo informado (US$)" value="${saldo != null ? saldo : ""}" data-saldo-id="${i.id}" />
          <button class="botao" data-acao="salvar-saldo" data-id="${i.id}">Salvar</button>
        </div>` : `<p class="pagina-sub" style="margin:0;">saldo em "Saldos de crédito" abaixo</p>`}
        ${emAlerta ? `<p class="pagina-sub" style="color:var(--amarelo); margin-top:6px;">${Icones.alerta} Saldo baixo</p>` : ""}
      </div>`;
    })
    .join("");

  const linhasProducoes = producoes
    .slice()
    .sort((a, b) => (b.estado?.criado_em || "").localeCompare(a.estado?.criado_em || ""))
    .slice(0, 12)
    .map(
      (p) => `<tr><td>${escaparHtml(p.nome || p.job_id)}</td><td>${formatarData(p.estado?.criado_em)}</td><td>${formatarMoeda(p.custos?.total_usd)}</td></tr>`
    )
    .join("");

  const cor = creditos.openrouter || {};
  const coa = creditos.openai || {};
  const detOa = coa.detalhe || {};
  const htmlSaldoOr = cor.configurado === false
    ? `<p class="pagina-sub">Chave do OpenRouter não configurada.</p>`
    : `<div class="valor ${cor.tipo === "desconhecido" ? "msg-teste-neutra" : (cor.saldo < 1 ? "msg-teste-erro" : "msg-teste-ok")}">${formatarSaldoCredito(cor)}</div>
       <p class="pagina-sub" style="margin:0 0 8px;">Saldo <strong>real</strong>, consultado na API do OpenRouter${cor.atualizado_em ? " em " + formatarData(cor.atualizado_em) : ""}.${cor.aviso ? "<br>" + escaparHtml(cor.aviso) : ""}</p>`;
  const htmlSaldoOa = coa.tipo === "estimado"
    ? `<div class="valor ${coa.saldo < 1 ? "msg-teste-erro" : "msg-teste-ok"}">${formatarSaldoCredito(coa)}</div>
       <p class="pagina-sub" style="margin:0 0 8px;">Informado ${formatarMoeda(detOa.informado)} em ${formatarData(detOa.informado_em)} − gasto registrado desde então ${formatarMoeda(detOa.gasto_desde)}.${coa.aviso ? "<br>" + escaparHtml(coa.aviso) : ""}</p>`
    : `<div class="valor msg-teste-neutra">desconhecido</div><p class="pagina-sub" style="margin:0 0 8px;">Informe o saldo para o app conferir antes de cada produção.</p>`;

  return `
    <h3 style="margin-top:8px;">Saldos de crédito</h3>
    <div class="grade-saldos-credito">
      <div class="cartao">
        <div class="nome"><strong>OpenRouter</strong> <span class="tipo-saldo">real</span></div>
        ${htmlSaldoOr}
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="botao" id="btn-atualizar-openrouter">Atualizar</button>
          <a class="botao link-simples" href="${LINKS_RECARGA.openrouter}" target="_blank" rel="noopener">Recarregar ${Icones.externo}</a>
        </div>
      </div>
      <div class="cartao">
        <div class="nome"><strong>OpenAI</strong> <span class="tipo-saldo">estimado</span></div>
        ${htmlSaldoOa}
        <div class="campo-saldo">
          <input type="text" inputmode="decimal" id="campo-saldo-openai" placeholder="Saldo atual na OpenAI (veja no painel) US$" />
          <button class="botao" id="btn-salvar-saldo-openai">Salvar</button>
        </div>
        <p class="pagina-sub" style="margin:6px 0 0; font-size:0.78rem;">A OpenAI não informa o saldo pela API. Copie o valor do
          <a href="${LINKS_RECARGA.openai}" target="_blank" rel="noopener">painel de billing ${Icones.externo}</a>; o app desconta
          automaticamente o que cada produção gastar e confere antes de começar (valor estimado).</p>
      </div>
    </div>
    <h3>Histórico</h3>
    <div class="grade-cartoes">
      <div class="cartao-status"><div class="rotulo">Total do mês</div><div class="valor">${formatarMoeda(totalMes)}</div></div>
      <div class="cartao-status"><div class="rotulo">Total histórico</div><div class="valor">${formatarMoeda(resumo.total_usd)}</div></div>
      <div class="cartao-status"><div class="rotulo">Estimativa próximos 5 vídeos</div><div class="valor">${formatarMoeda(resumo.estimativa_proximos_5_usd)}</div></div>
    </div>
    <h3>Por provedor</h3>
    <div class="grade-custos-provedor">${cartoesProvedor || '<p class="pagina-sub">Nenhum provedor configurado ainda.</p>'}</div>
    <h3 style="margin-top:26px;">Custo por produção (mais recentes)</h3>
    <table class="tabela">
      <thead><tr><th>Produção</th><th>Data</th><th>Custo</th></tr></thead>
      <tbody>${linhasProducoes || '<tr><td colspan="3" class="pagina-sub">Nenhuma produção ainda.</td></tr>'}</tbody>
    </table>
  `;
}

function _ligarEventosDetalhamento(container, corpo) {
  corpo.querySelector("#btn-atualizar-openrouter")?.addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    await _recarregarCustos(container, true);
  });
  corpo.querySelector("#btn-salvar-saldo-openai")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    const campo = corpo.querySelector("#campo-saldo-openai");
    const valor = parseFloat(String(campo.value).replace(",", "."));
    if (isNaN(valor) || valor < 0) { campo.focus(); return; }
    btn.disabled = true;
    try {
      await Api.post("/api/creditos/openai", { valor });
      await _recarregarCustos(container);
    } catch (exc) {
      alert("Erro ao salvar saldo: " + exc.message);
      btn.disabled = false;
    }
  });

  corpo.querySelectorAll("[data-acao='salvar-saldo']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const campo = corpo.querySelector(`[data-saldo-id="${btn.dataset.id}"]`);
      const valor = parseFloat(String(campo.value).replace(",", "."));
      if (isNaN(valor)) { campo.focus(); return; }
      btn.disabled = true;
      try {
        await Api.post(`/api/custos/saldo/${btn.dataset.id}`, { saldo_usd: valor });
        await _recarregarCustos(container);
      } catch (exc) {
        alert("Erro ao salvar saldo: " + exc.message);
        btn.disabled = false;
      }
    });
  });
}
