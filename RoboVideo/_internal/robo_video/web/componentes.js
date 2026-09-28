// Helpers de UI compartilhados entre as telas: icones inline, modal, banner
// global de saldo baixo, formatacao de numeros/datas/duracao.

const Icones = {
  alerta: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  erro: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 8v5m0 3h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 11v5m0-8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lixeira: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  externo: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M14 5h5v5M9 15 19 5M13 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copiar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="2"/></svg>',
  pasta: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  video: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="14" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="m16 10 6-3v10l-6-3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
};

function formatarMoeda(v) {
  if (v == null || isNaN(v)) return "US$ 0,00";
  return "US$ " + Number(v).toFixed(2).replace(".", ",");
}

function formatarData(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (_) { return iso; }
}

function formatarDuracao(segundos) {
  if (segundos == null || isNaN(segundos)) return "-";
  const s = Math.round(segundos);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function escaparHtml(txt) {
  const div = document.createElement("div");
  div.textContent = txt == null ? "" : String(txt);
  return div.innerHTML;
}

// -------------------------------------------------------------- modal ----
function abrirModal(htmlInterno) {
  fecharModal();
  const raiz = document.getElementById("raiz-modal");
  const fundo = document.createElement("div");
  fundo.className = "fundo-modal";
  fundo.id = "fundo-modal-ativo";
  fundo.innerHTML = `<div class="modal">${htmlInterno}</div>`;
  fundo.addEventListener("click", (ev) => {
    if (ev.target === fundo) fecharModal();
  });
  raiz.appendChild(fundo);
  return fundo;
}

function fecharModal() {
  const atual = document.getElementById("fundo-modal-ativo");
  if (atual) atual.remove();
}

// ------------------------------------------------------- banner generico --
function htmlBanner(tipo, icone, mensagemHtml, acaoHtml) {
  return `<div class="banner banner-${tipo}">${icone}<div>${mensagemHtml}</div>${acaoHtml ? `<div class="banner-acao">${acaoHtml}</div>` : ""}</div>`;
}

// --------------------------------------------- banner global de saldo -----
// Buscado uma vez por navegacao de tela e injetado no topo de #conteudo.
async function montarBannerSaldoGlobal(container) {
  try {
    const custosResumo = await Api.get("/api/custos");
    const alertas = custosResumo.alertas_saldo_baixo || [];
    if (!alertas.length) return;
    const nomes = alertas
      .map((a) => `${a.provedor} (${a.tipo === "estimado" ? "~" : ""}${formatarMoeda(a.saldo_usd)}${a.tipo ? " " + rotuloTipoSaldo(a.tipo) : ""})`)
      .join(", ");
    const div = document.createElement("div");
    div.innerHTML = htmlBanner(
      "aviso",
      Icones.alerta,
      `Saldo baixo em: <strong>${escaparHtml(nomes)}</strong>. Verifique antes de produzir mais vídeos.`,
      `<a href="#custos" class="botao link-simples">Ver Custos</a>`
    );
    container.prepend(div.firstElementChild);
  } catch (_) {
    // silencioso: nao trava a tela por causa do banner
  }
}

// ------------------------------------------------ creditos (saldo) -------
// OpenRouter: saldo real (API). OpenAI: estimado (informado - gasto).
const LINKS_RECARGA = {
  openrouter: "https://openrouter.ai/settings/credits",
  openai: "https://platform.openai.com/settings/organization/billing/overview",
};

function formatarSaldoCredito(info) {
  if (!info || info.saldo == null || info.tipo === "desconhecido") return "desconhecido";
  return (info.tipo === "estimado" ? "~" : "") + formatarMoeda(info.saldo);
}

function rotuloTipoSaldo(tipo) {
  return { real: "real", estimado: "estimado", desconhecido: "desconhecido", informado: "informado" }[tipo] || tipo || "";
}

// Linha do bloco "Creditos" (etapa Revisao): saldo, necessario e situacao.
function htmlLinhaCredito(pid, p) {
  const link = p.url_recarga || LINKS_RECARGA[pid];
  let situacao;
  if (!p.usado) situacao = `<span class="msg-teste-neutra">não usado nesta produção</span>`;
  else if (p.suficiente === true) situacao = `<span class="msg-teste-ok">✓ suficiente</span>`;
  else if (p.suficiente === false) situacao = `<span class="msg-teste-erro">✗ insuficiente</span>`;
  else situacao = `<span class="msg-teste-neutra">? não verificado</span>`;
  const partes = [p.tipo === "desconhecido" || p.saldo == null
    ? "saldo desconhecido"
    : `saldo ${formatarSaldoCredito(p)} <span class="tipo-saldo">${rotuloTipoSaldo(p.tipo)}</span>`];
  if (p.usado) partes.push(`precisa ~${formatarMoeda(p.necessario)}`);
  let det = partes.join(" · ");
  if (p.suficiente === false) {
    det += ` · <a href="${link}" target="_blank" rel="noopener">Recarregar ${Icones.externo}</a>`;
    if (pid === "openai") det += ` · depois informe o novo saldo em <a href="#custos">Custos</a>`;
  } else if (p.tipo === "desconhecido" && p.usado && pid === "openai") {
    det += ` · <a href="#custos">informar saldo</a>`;
  }
  if (p.aviso && p.tipo === "desconhecido" && p.configurado) det += `<br>${escaparHtml(p.aviso)}`;
  return `<div class="linha-credito"><div class="nome">${escaparHtml(p.nome || pid)}</div><div class="situacao">${situacao}</div><div class="det">${det}</div></div>`;
}
