// Tela Producoes: historico de todas as producoes, com acoes de abrir video/pasta.

const ROTULO_STATUS = {
  fila: "Na fila",
  produzindo: "Produzindo",
  pronto: "Pronto",
  erro: "Erro",
  cancelado: "Cancelado",
  aguardando_creditos: "Aguardando créditos",
};

async function telaProducoes(container) {
  container.innerHTML = `<div class="pagina-cabecalho"><div><h1>Produções</h1><p class="pagina-sub">Histórico completo de vídeos gerados.</p></div></div><div id="corpo-producoes"><p class="pagina-sub">Carregando...</p></div>`;
  const producoes = await Api.get("/api/producoes");
  const corpo = container.querySelector("#corpo-producoes");

  if (!producoes.length) {
    corpo.innerHTML = `<p class="pagina-sub">Nenhuma produção ainda. Vá em <a href="#produzir">Produzir</a> para começar.</p>`;
    return;
  }

  const ordenadas = producoes.slice().sort((a, b) => (b.estado?.criado_em || "").localeCompare(a.estado?.criado_em || ""));

  corpo.innerHTML = `
    <table class="tabela">
      <thead><tr><th>Nome</th><th>Preset</th><th>Data</th><th>Duração</th><th>Status</th><th>Custo</th><th>Ações</th></tr></thead>
      <tbody>
        ${ordenadas
          .map(
            (p) => `
          <tr>
            <td>${escaparHtml(p.nome || p.job_id)}</td>
            <td>${p.preset_nome || p.projeto_id ? escaparHtml(p.preset_nome || p.projeto_nome || p.projeto_id) : '<span class="msg-teste-neutra">—</span>'}</td>
            <td>${formatarData(p.estado?.criado_em)}</td>
            <td>${formatarDuracao(p.duracao_s)}</td>
            <td><span class="selo-status ${p.estado?.status}">${ROTULO_STATUS[p.estado?.status] || p.estado?.status || "-"}</span></td>
            <td>${formatarMoeda(p.custos?.total_usd)}</td>
            <td>
              <div class="acoes-tabela">
                <button class="botao" data-acao="abrir-video" data-id="${p.job_id}" ${p.estado?.status !== "pronto" ? "disabled" : ""}>${Icones.video} Vídeo</button>
                <button class="botao" data-acao="abrir-pasta" data-id="${p.job_id}">${Icones.pasta} Pasta</button>
                <a class="botao" href="#acompanhar?job=${p.job_id}">Ver</a>
              </div>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  corpo.querySelectorAll("[data-acao='abrir-video']").forEach((b) =>
    b.addEventListener("click", () => _abrirArquivoProducao(b.dataset.id, "video"))
  );
  corpo.querySelectorAll("[data-acao='abrir-pasta']").forEach((b) =>
    b.addEventListener("click", () => _abrirArquivoProducao(b.dataset.id, "pasta"))
  );
}

async function _abrirArquivoProducao(jobId, alvo) {
  try {
    await Api.post(`/api/producoes/${jobId}/abrir`, { alvo });
  } catch (exc) {
    alert("Não foi possível abrir: " + exc.message);
  }
}
