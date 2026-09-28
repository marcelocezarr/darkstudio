// Roteamento simples por hash. Cada tela e uma funcao async que preenche
// #conteudo (definidas em tela_*.js, carregados antes deste arquivo).

const ROTAS = {
  projetos: telaCanais, // a tela Projetos virou presets do canal (link antigo abre Canais)
  produzir: telaProduzir,
  acompanhar: telaAcompanhar,
  producoes: telaProducoes,
  canais: telaCanais,
  avatares: telaAvatares,
  integracoes: telaIntegracoes,
  custos: telaCustos,
};

function elConteudo() {
  return document.getElementById("conteudo");
}

function marcarMenuAtivo(rota) {
  document.querySelectorAll(".menu-lateral a").forEach((a) => {
    a.classList.toggle("ativo", a.dataset.rota === (rota === "projetos" ? "canais" : rota));
  });
}

let _tokenNavegacao = 0;

async function rotear() {
  const meuToken = ++_tokenNavegacao;
  const rota = (location.hash || "#produzir").slice(1).split("?")[0];
  const fn = ROTAS[rota] || telaProduzir;
  marcarMenuAtivo(rota in ROTAS ? rota : "produzir");
  fecharModal();
  const conteudo = elConteudo();
  try {
    await fn(conteudo);
  } catch (exc) {
    if (meuToken !== _tokenNavegacao) return; // navegou para outro lugar antes de terminar
    conteudo.innerHTML = `<div class="banner banner-erro">${Icones.erro}<div>Erro ao carregar a tela: ${escaparHtml(exc.message || String(exc))}</div></div>`;
    return;
  }
  if (meuToken !== _tokenNavegacao) return;
  montarBannerSaldoGlobal(conteudo);
}

window.addEventListener("hashchange", rotear);
window.addEventListener("DOMContentLoaded", rotear);
