// Tela Canais: o canal é a IDENTIDADE (voz, avatar, mundo, prompts, trilha) e
// guarda vários PRESETS de produção. Mestre-detalhe: lista à esquerda, editor
// com abas à direita. Herança: Vídeo → preset/canal → padrão global.
// Reaproveita de tela_produzir.js (carregado antes): caches de estilos,
// geradores e bancos e os helpers de takes/bancos/estilo.

const CAN_ABAS = [
  ["identidade", "Identidade e personagem"],
  ["mundo", "Mundo e imagens"],
  ["prompts", "Prompts e trilha"],
  ["presets", "Presets de produção"],
];
const CAN_MUNDO_MAX = 400;
const CAN_PROVEDORES_PADRAO = [{ id: "openai", nome: "OpenAI TTS", configurado: false }, { id: "darkplanner", nome: "Dark Planner", configurado: false }];

let _canLista = [];
let _canSelecionado = null; // id do canal aberto; "" = novo canal
let _canRascunho = null; // cópia local em edição
let _canSalvoJson = ""; // para o selo "● Salvo"
let _canAba = "identidade";
let _canOpcoes = null;
let _canAvatares = null; // null = tela Avatares ainda não existe
let _canPresetEditando = null; // {id|"" , nome, padrao, ajustes}

function _canNovo() {
  return {
    id: "", nome: "", idioma: "pt", nicho: "", publico: "", palavras_evitar: [],
    provedor_tts: "", voz_tts: "", velocidade_narracao: 1.0, avatar_padrao_id: "",
    pct_personagem_video_ia: 0, pct_personagem_imagem_ia: 0,
    mundo_epoca: "", mundo_assunto: "", mundo_mostra: "", mundo_nunca_mostra: "",
    estilo_visual_imagens: "", orientacao_busca_visual: "",
    prompt_gerador_imagens: "", prompt_gerador_videos: "",
    trilha_url: "", trilha_arquivo: "", trilha_arquivo_nome: "", trilha_volume: 0.15, trilha_usar_padrao: false,
    presets: [],
  };
}

// campos que o formulário do canal edita (o resto é do servidor)
const CAN_CAMPOS_FORM = ["nome", "idioma", "nicho", "publico", "palavras_evitar", "provedor_tts", "voz_tts",
  "velocidade_narracao", "avatar_padrao_id", "pct_personagem_video_ia", "pct_personagem_imagem_ia",
  "mundo_epoca", "mundo_assunto", "mundo_mostra", "mundo_nunca_mostra", "estilo_visual_imagens",
  "orientacao_busca_visual", "prompt_gerador_imagens", "prompt_gerador_videos", "trilha_url", "trilha_volume",
  "trilha_usar_padrao"];
function _canAssinatura(c) {
  const o = {};
  CAN_CAMPOS_FORM.forEach((k) => { o[k] = c[k] === undefined ? null : c[k]; });
  return JSON.stringify(o);
}
function _canSujo() { return _canRascunho && _canAssinatura(_canRascunho) !== _canSalvoJson; }

function _canSigla(nome) {
  const partes = String(nome || "?").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}
function _canStatus(c) {
  const itens = [];
  if (c.voz_tts || c.provedor_tts) itens.push("voz própria");
  if (c.avatar_padrao_id) itens.push("avatar definido");
  const n = (c.presets || []).length;
  itens.push(n === 1 ? "1 preset" : `${n} presets`);
  return itens.join(" · ");
}
function _canEntenda(texto) {
  return `<details class="entenda-ajuste"><summary>Entenda este ajuste</summary><p>${texto}</p></details>`;
}

async function _canCarregarBase() {
  const [lista, opcoes, avatares] = await Promise.all([
    Api.get("/api/canais"),
    Api.get("/api/canais/opcoes").catch(() => null),
    Api.get("/api/avatares").catch(() => null),
    _carregarEstilos(),
    _carregarGeradores(),
    _carregarBancos(),
  ]);
  _canLista = lista || [];
  _canOpcoes = opcoes || { provedores_tts: CAN_PROVEDORES_PADRAO, trilha_max_mb: 30 };
  // /api/avatares pode devolver lista ou {avatares:[...]} (tela Avatares, outro módulo)
  if (Array.isArray(avatares)) _canAvatares = avatares;
  else if (avatares && Array.isArray(avatares.avatares)) _canAvatares = avatares.avatares;
  else if (avatares && Array.isArray(avatares.itens)) _canAvatares = avatares.itens;
  else _canAvatares = null;
}

async function telaCanais(container) {
  await _canCarregarBase();
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const pedido = params.get("id");
  if (pedido && _canLista.some((c) => c.id === pedido)) _canSelecionado = pedido;
  else if (params.has("novo")) _canSelecionado = "";
  else if (_canSelecionado === null || (_canSelecionado && !_canLista.some((c) => c.id === _canSelecionado))) {
    _canSelecionado = _canLista.length ? _canLista[0].id : "";
  }
  const aba = params.get("aba");
  if (aba && CAN_ABAS.some(([id]) => id === aba)) _canAba = aba;
  _canAbrir(_canSelecionado, false);

  container.innerHTML = `
    <div class="pagina-cabecalho">
      <div><h1>Canais</h1><p class="pagina-sub">Guarde voz, avatar, prompts e presets de produção para reutilizar em cada vídeo.</p></div>
      <button class="botao primario" id="can-novo">+ Novo canal</button>
    </div>
    <div class="can-layout">
      <aside class="can-lista" id="can-lista"></aside>
      <section class="can-editor" id="can-editor"></section>
    </div>`;
  container.querySelector("#can-novo").addEventListener("click", () => _canTrocar(container, ""));
  _canRenderLista(container);
  _canRenderEditor(container);
}

function _canAbrir(id, manterAba) {
  const c = id ? _canLista.find((x) => x.id === id) : null;
  _canSelecionado = c ? c.id : "";
  _canRascunho = c ? JSON.parse(JSON.stringify(c)) : _canNovo();
  _canSalvoJson = c ? _canAssinatura(_canRascunho) : "";
  _canPresetEditando = null;
  if (!manterAba && !c && _canAba === "presets") _canAba = "identidade";
}

function _canTrocar(container, id) {
  if (_canSujo() && !confirm("Há alterações não salvas neste canal. Descartar?")) return;
  _canAbrir(id, true);
  if (!id && _canAba === "presets") _canAba = "identidade";
  _canRenderLista(container);
  _canRenderEditor(container);
}

// ----------------------------------------------------------------- lista --
function _canRenderLista(container) {
  const el = container.querySelector("#can-lista");
  el.innerHTML = `
    <div class="can-lista-titulo">Seus canais <span class="can-contador">${_canLista.length}</span></div>
    ${_canLista.map((c) => `
      <button type="button" class="can-item ${c.id === _canSelecionado ? "ativo" : ""}" data-id="${escaparHtml(c.id)}">
        <span class="can-sigla">${escaparHtml(_canSigla(c.nome))}</span>
        <span class="can-item-texto"><strong>${escaparHtml(c.nome)}</strong><small>${escaparHtml(_canStatus(c))}</small></span>
      </button>`).join("")}
    ${_canSelecionado === "" ? `
      <div class="can-item ativo can-item-novo"><span class="can-sigla">+</span><span class="can-item-texto"><strong>Novo canal</strong><small>ainda não salvo</small></span></div>` : ""}
    <div class="can-item can-item-nenhum">
      <span class="can-sigla">—</span>
      <span class="can-item-texto"><strong>Nenhum — configuração manual</strong><small>Produzir sem canal é legítimo.</small></span>
    </div>`;
  el.querySelectorAll("button.can-item").forEach((b) => b.addEventListener("click", () => _canTrocar(container, b.dataset.id)));
}

// ---------------------------------------------------------------- editor --
function _canRenderEditor(container) {
  const c = _canRascunho;
  const editando = !!c.id;
  const el = container.querySelector("#can-editor");
  const nPresets = (c.presets || []).length;
  el.innerHTML = `
    <div class="can-editor-topo">
      <div>
        <div class="can-rotulo">${editando ? "EDITANDO CANAL" : "NOVO CANAL"}</div>
        <h2>${editando ? escaparHtml(c.nome) : "Configure um canal"}</h2>
        <p class="pagina-sub">Somente o nome é obrigatório. ${editando ? "Em branco, cada campo herda o ajuste global." : "Os demais campos podem herdar os ajustes globais."}</p>
      </div>
      <span class="can-selo-salvo" id="can-selo" ${editando && !_canSujo() ? "" : "hidden"}>● Salvo</span>
    </div>
    <div class="abas can-abas" id="can-abas">
      ${CAN_ABAS.map(([id, nome]) => `<button type="button" data-aba="${id}" class="${_canAba === id ? "ativo" : ""}" ${id === "presets" && !editando ? "disabled title=\"Salve o canal primeiro\"" : ""}>${nome}${id === "presets" && editando ? ` <span class="can-contador">${nPresets}</span>` : ""}</button>`).join("")}
    </div>
    <div id="can-corpo-aba"></div>
    <div class="can-rodape" id="can-rodape" ${_canAba === "presets" ? "hidden" : ""}>
      <div>${editando ? '<button type="button" class="botao perigo" id="can-excluir">Excluir canal</button>' : ""}</div>
      <span class="can-cascata">Vídeo → preset/canal → padrão global.</span>
      <button type="button" class="botao primario" id="can-salvar">${editando ? "Salvar canal" : "Criar canal"}</button>
    </div>`;
  el.querySelectorAll("#can-abas button").forEach((b) => b.addEventListener("click", () => {
    if (b.disabled) return;
    _canAba = b.dataset.aba;
    _canPresetEditando = null;
    _canRenderEditor(container);
  }));
  el.querySelector("#can-salvar")?.addEventListener("click", () => _canSalvar(container));
  el.querySelector("#can-excluir")?.addEventListener("click", () => _canExcluir(container));
  const corpo = el.querySelector("#can-corpo-aba");
  if (_canAba === "identidade") _canAbaIdentidade(container, corpo);
  else if (_canAba === "mundo") _canAbaMundo(container, corpo);
  else if (_canAba === "prompts") _canAbaPrompts(container, corpo);
  else _canAbaPresets(container, corpo);
}

function _canMarcarSujo(container) {
  const selo = container.querySelector("#can-selo");
  if (selo) selo.hidden = !(_canRascunho.id && !_canSujo());
}

// liga inputs [data-campo] ao rascunho
function _canLigarCampos(container, corpo) {
  corpo.querySelectorAll("[data-campo]").forEach((inp) => {
    const campo = inp.dataset.campo;
    const ev = inp.tagName === "SELECT" || inp.type === "checkbox" ? "change" : "input";
    inp.addEventListener(ev, () => {
      let v;
      if (inp.type === "checkbox") v = inp.checked;
      else if (inp.type === "number" || inp.type === "range") v = inp.value === "" ? null : Number(inp.value);
      else v = inp.value;
      if (campo === "palavras_evitar") v = String(v).split(",").map((s) => s.trim()).filter(Boolean);
      _canRascunho[campo] = v;
      const cont = corpo.querySelector(`[data-contador="${campo}"]`);
      if (cont) cont.textContent = `${String(v || "").length}/${CAN_MUNDO_MAX}`;
      _canMarcarSujo(container);
    });
  });
}

// ------------------------------------------------ aba 1: identidade --
function _canAbaIdentidade(container, corpo) {
  const c = _canRascunho;
  const provs = (_canOpcoes && _canOpcoes.provedores_tts) || CAN_PROVEDORES_PADRAO;
  const opcoesAvatar = _canAvatares === null
    ? `<option value="${escaparHtml(c.avatar_padrao_id || "")}">${c.avatar_padrao_id ? escaparHtml(c.avatar_padrao_id) : "Nenhum — só voz"}</option>`
    : `<option value="">Nenhum — só voz / escolhido na hora</option>` +
      _canAvatares.map((a) => `<option value="${escaparHtml(a.id)}" ${a.id === c.avatar_padrao_id ? "selected" : ""}>${escaparHtml(a.nome || a.id)}</option>`).join("") +
      (c.avatar_padrao_id && !_canAvatares.some((a) => a.id === c.avatar_padrao_id) ? `<option value="${escaparHtml(c.avatar_padrao_id)}" selected>${escaparHtml(c.avatar_padrao_id)} (não encontrado)</option>` : "");
  const pctSlider = (campo, rotulo, ajuda) => `
    <div class="campo">
      <label>${rotulo}</label>
      <div class="slider-linha">
        <input type="range" min="0" max="100" step="5" value="${Number(c[campo]) || 0}" data-campo="${campo}" id="can-${campo}" />
        <span class="can-pct-caixa"><input type="number" min="0" max="100" step="1" value="${Number(c[campo]) || 0}" id="can-${campo}-num" /> %</span>
      </div>
      <div class="ajuda">${ajuda}</div>
    </div>`;
  corpo.innerHTML = `
    <div class="can-secao-titulo">IDENTIDADE <span>· só o nome é obrigatório</span></div>
    <div class="linha-campos">
      <div class="campo"><label for="can-nome">Nome</label><input type="text" id="can-nome" data-campo="nome" value="${escaparHtml(c.nome)}" maxlength="80" placeholder="ex.: Histórias de Oficina" /></div>
      <div class="campo" style="max-width:160px;"><label for="can-idioma">Idioma</label><input type="text" id="can-idioma" data-campo="idioma" value="${escaparHtml(c.idioma || "")}" placeholder="pt" /></div>
    </div>
    <div class="linha-campos">
      <div class="campo"><label>Nicho / tema</label><input type="text" data-campo="nicho" value="${escaparHtml(c.nicho || "")}" placeholder="ex.: carros clássicos e mecânica" /></div>
      <div class="campo"><label>Público</label><input type="text" data-campo="publico" value="${escaparHtml(c.publico || "")}" placeholder="ex.: entusiastas de carros, 30+" /></div>
    </div>
    <div class="campo"><label>Palavras a evitar <span class="rotulo-opcional">(separadas por vírgula)</span></label><input type="text" data-campo="palavras_evitar" value="${escaparHtml((c.palavras_evitar || []).join(", "))}" /></div>

    <div class="can-secao-titulo">VOZ E PERSONAGEM</div>
    <div class="linha-campos">
      <div class="campo">
        <label>Voz do canal · provedor</label>
        <select id="can-provedor" data-campo="provedor_tts">
          <option value="" ${!c.provedor_tts ? "selected" : ""}>Automático (a voz global)</option>
          ${provs.map((p) => `<option value="${escaparHtml(p.id)}" ${c.provedor_tts === p.id ? "selected" : ""}>${escaparHtml(p.nome)}${p.configurado ? "" : " — sem chave"}</option>`).join("")}
        </select>
      </div>
      <div class="campo">
        <label>Voz</label>
        <select id="can-voz"><option value="${escaparHtml(c.voz_tts || "")}">${escaparHtml(c.voz_tts || "Padrão do provedor")}</option></select>
        <div class="ajuda" id="can-voz-ajuda">Em branco usa a voz global.</div>
      </div>
    </div>
    <div class="linha-campos">
      <div class="campo">
        <label>Avatar padrão</label>
        <select id="can-avatar" data-campo="avatar_padrao_id" ${_canAvatares === null ? "disabled" : ""}>${opcoesAvatar}</select>
        <div class="ajuda">${_canAvatares === null ? 'A biblioteca de avatares ainda não está disponível. <a href="#avatares">Avatares</a>' : 'Em branco usa só voz ou o avatar escolhido no pedido. <a href="#avatares">Gerenciar avatares</a>'}</div>
      </div>
      <div class="campo">
        <label>Velocidade da narração</label>
        <div class="slider-linha">
          <input type="range" min="0.7" max="1.2" step="0.05" value="${Number(c.velocidade_narracao) || 1}" data-campo="velocidade_narracao" id="can-velocidade" />
          <span class="slider-rotulo" id="can-velocidade-rot" style="min-width:60px;">${(Number(c.velocidade_narracao) || 1).toFixed(2).replace(".", ",")}×</span>
        </div>
        <div class="ajuda">De 0,70 (devagar) a 1,20 (rápido). Padrão 1,00.</div>
      </div>
    </div>
    <div class="linha-campos">
    ${pctSlider("pct_personagem_video_ia", "Personagem no vídeo de IA",
      "De cada 100 cenas que saem em VÍDEO de IA, quantas mostram o SEU personagem. O clipe com ele custa o mesmo que o normal.")}
    ${pctSlider("pct_personagem_imagem_ia", "Personagem na imagem de IA",
      "De cada 100 cenas que saem em IMAGEM parada de IA, quantas mostram o SEU personagem. <strong class=\"can-custo\">Essa sai cerca de 43% mais cara.</strong>")}
    </div>
    <div class="can-nota ${(c.pct_personagem_video_ia || c.pct_personagem_imagem_ia) && !c.avatar_padrao_id ? "can-nota-aviso" : ""}" id="can-nota-personagem">
      Os dois precisam de um avatar escolhido acima — é o rosto dele que serve de referência. Em 0, as cenas de IA mostram uma pessoa qualquer, como hoje.
      Comece com 0: acima disso o vídeo fica mais caro.
    </div>
    ${_canEntenda("A voz, a velocidade e o avatar são a identidade do canal: valem para todo vídeo dele. Por vídeo você só troca o fornecedor da narração (mesma voz, outro fornecedor) e liga ou desliga o apresentador.")}`;

  _canLigarCampos(container, corpo);
  const velo = corpo.querySelector("#can-velocidade");
  velo.addEventListener("input", () => { corpo.querySelector("#can-velocidade-rot").textContent = `${Number(velo.value).toFixed(2).replace(".", ",")}×`; });
  ["pct_personagem_video_ia", "pct_personagem_imagem_ia"].forEach((campo) => {
    const rng = corpo.querySelector(`#can-${campo}`);
    const num = corpo.querySelector(`#can-${campo}-num`);
    const nota = () => {
      const alerta = (Number(_canRascunho.pct_personagem_video_ia) || Number(_canRascunho.pct_personagem_imagem_ia)) && !_canRascunho.avatar_padrao_id;
      corpo.querySelector("#can-nota-personagem").classList.toggle("can-nota-aviso", !!alerta);
    };
    rng.addEventListener("input", () => { num.value = rng.value; nota(); });
    num.addEventListener("input", () => {
      const v = Math.max(0, Math.min(100, Math.round(Number(num.value) || 0)));
      rng.value = v;
      _canRascunho[campo] = v;
      _canMarcarSujo(container);
      nota();
    });
  });
  corpo.querySelector("#can-nome").addEventListener("input", () => {
    // o título do editor acompanha o nome só quando já existe
  });

  // vozes do provedor (reusa /api/vozes)
  const selProv = corpo.querySelector("#can-provedor");
  const selVoz = corpo.querySelector("#can-voz");
  const ajuda = corpo.querySelector("#can-voz-ajuda");
  const carregar = async () => {
    const prov = selProv.value;
    const escolhida = _canRascunho.voz_tts || "";
    ajuda.textContent = "Em branco usa a voz global.";
    if (!prov) {
      selVoz.innerHTML = `<option value="">Padrão global</option>`;
      selVoz.disabled = true;
      return;
    }
    selVoz.disabled = true;
    selVoz.innerHTML = `<option value="${escaparHtml(escolhida)}">Carregando vozes…</option>`;
    try {
      const idioma = (_canRascunho.idioma || "").trim();
      const r = await Api.get(`/api/vozes?provedor=${encodeURIComponent(prov)}${idioma ? "&idioma=" + encodeURIComponent(idioma) : ""}`);
      const vozes = r.vozes || [];
      selVoz.innerHTML = `<option value="">Padrão${r.padrao ? " (" + escaparHtml(r.padrao) + ")" : ""}</option>` +
        vozes.map((v) => `<option value="${escaparHtml(v.id)}" ${v.id === escolhida ? "selected" : ""}>${escaparHtml(v.nome)}${v.idiomas && v.idiomas.length ? " · " + escaparHtml(v.idiomas.slice(0, 3).join(", ")) : ""}</option>`).join("");
      if (escolhida && !vozes.some((v) => v.id === escolhida)) {
        selVoz.insertAdjacentHTML("beforeend", `<option value="${escaparHtml(escolhida)}" selected>${escaparHtml(escolhida)} (salva)</option>`);
      }
    } catch (exc) {
      selVoz.innerHTML = `<option value="${escaparHtml(escolhida)}">${escaparHtml(escolhida || "Padrão do provedor")}</option>`;
      ajuda.innerHTML = `<span class="msg-teste-erro">${escaparHtml(exc.message || "vozes indisponíveis")}</span> <a href="#integracoes">Integrações</a>`;
    } finally {
      selVoz.disabled = false;
    }
  };
  selProv.addEventListener("change", () => { _canRascunho.voz_tts = ""; _canMarcarSujo(container); carregar(); });
  selVoz.addEventListener("change", () => { _canRascunho.voz_tts = selVoz.value; _canMarcarSujo(container); });
  carregar();
}

// ----------------------------------------------------- aba 2: mundo --
function _canAbaMundo(container, corpo) {
  const c = _canRascunho;
  const linha = (campo, rotulo, ph, ajuda, area) => `
    <div class="campo">
      <label>${rotulo} <span class="can-contador-car" data-contador="${campo}">${String(c[campo] || "").length}/${CAN_MUNDO_MAX}</span></label>
      ${area
        ? `<textarea data-campo="${campo}" maxlength="${CAN_MUNDO_MAX}" rows="2" class="can-area-curta" placeholder="${escaparHtml(ph)}">${escaparHtml(c[campo] || "")}</textarea>`
        : `<input type="text" data-campo="${campo}" maxlength="${CAN_MUNDO_MAX}" value="${escaparHtml(c[campo] || "")}" placeholder="${escaparHtml(ph)}" />`}
      <div class="ajuda">${ajuda}</div>
    </div>`;
  corpo.innerHTML = `
    <div class="can-secao-titulo">O MUNDO DESTE CANAL <span>· quatro linhas, cada uma até ${CAN_MUNDO_MAX} caracteres</span></div>
    <div class="can-nota">Guardado com o canal e entregue ao robô em cada produção. Quando as etapas do robô lerem o mundo, o que estiver escrito aqui passa a valer em todo trecho do vídeo.</div>
    <div class="linha-campos">
      ${linha("mundo_epoca", "Época", "ex.: hoje, na Grã-Bretanha", "Quando esta história se passa.")}
      ${linha("mundo_assunto", "Assunto", "ex.: carros, vans e a oficina que os conserta", "Do que o canal trata, em uma linha.")}
    </div>
    <div class="linha-campos">
      ${linha("mundo_mostra", "O que a tela mostra", "ex.: veículos reais, motores abertos, ferramentas, chão de oficina", "As coisas que podem aparecer.", true)}
      ${linha("mundo_nunca_mostra", "O que a tela nunca mostra", "ex.: fazendas, plantações, animais, roupa de época", "As que nunca podem. Vazio = este canal não proíbe nada.", true)}
    </div>
    <div class="can-secao-titulo">COMO AS IMAGENS SAEM <span>· estilo e busca</span></div>
    <div class="campo">
      <label>Estilo das imagens</label>
      <input type="text" data-campo="estilo_visual_imagens" value="${escaparHtml(c.estilo_visual_imagens || "")}" placeholder="vazio = o estilo padrão (fotorrealista documental)" />
      <div class="ajuda">Substitui o estilo padrão das imagens geradas por IA.</div>
    </div>
    <div class="campo">
      <label>Orientação de busca visual</label>
      <textarea data-campo="orientacao_busca_visual" rows="3" class="can-area-curta" placeholder="vazio = a orientação padrão">${escaparHtml(c.orientacao_busca_visual || "")}</textarea>
      <div class="ajuda">Guia a busca e a ordenação do material no acervo — nunca a rubrica de quem julga.</div>
    </div>
    ${_canEntenda("O mundo diz ao robô o que combina com o canal. \"Nunca mostra\" é o filtro mais forte: tudo o que estiver lá fica fora das buscas e dos prompts de imagem. Deixe em branco o que não quiser restringir.")}`;
  _canLigarCampos(container, corpo);
}

// ---------------------------------------------------- aba 3: prompts --
function _canBaixarTxt(nome, texto) {
  const blob = new Blob([texto || ""], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function _canAbaPrompts(container, corpo) {
  const c = _canRascunho;
  const maxMb = (_canOpcoes && _canOpcoes.trilha_max_mb) || 30;
  const bloco = (campo, rotulo, ph, ajuda, arquivo) => `
    <div class="campo">
      <div class="can-rotulo-linha"><label>${rotulo}</label><button type="button" class="botao can-botao-mini" data-baixar="${campo}" data-arquivo="${arquivo}">Baixar .txt</button></div>
      <textarea data-campo="${campo}" rows="8" placeholder="${escaparHtml(ph)}">${escaparHtml(c[campo] || "")}</textarea>
      <div class="ajuda">${ajuda}</div>
    </div>`;
  const slug = (c.nome || "canal").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  corpo.innerHTML = `
    <div class="can-secao-titulo">PROMPTS DA IA</div>
    ${bloco("prompt_gerador_imagens", "Prompt do gerador de imagens", "vazio = o prompt padrão do gerador de imagens", "Vale para as cenas que a IA preenche com imagem.", `prompt-imagens-${slug}.txt`)}
    ${bloco("prompt_gerador_videos", "Prompt do gerador de vídeos", "vazio = o prompt padrão do gerador de vídeos", "Vale para as cenas que a IA preenche com clipe.", `prompt-videos-${slug}.txt`)}

    <div class="can-secao-titulo">TRILHA DO CANAL <span>· em loop e abaixo da narração</span></div>
    <div class="can-nota">A trilha toca em loop, termina junto com a narração e fica abaixo da fala. Por vídeo você só liga ou desliga (etapa Estilo).</div>
    <div class="linha-campos">
      <div class="campo">
        <label>Endereço da música</label>
        <input type="text" data-campo="trilha_url" value="${escaparHtml(c.trilha_url || "")}" placeholder="https://… (vazio = sem link)" />
        <div class="ajuda">Link direto do arquivo (http:// ou https://). Quem baixa é o computador que produz o vídeo.</div>
      </div>
      <div class="campo" style="max-width:260px;">
        <label>Volume da música</label>
        <div class="slider-linha">
          <input type="range" min="0" max="1" step="0.01" value="${c.trilha_volume == null ? 0.15 : c.trilha_volume}" data-campo="trilha_volume" id="can-volume" />
          <span class="slider-rotulo" id="can-volume-rot" style="min-width:44px;">${Number(c.trilha_volume == null ? 0.15 : c.trilha_volume).toFixed(2).replace(".", ",")}</span>
        </div>
        <div class="ajuda">De 0 a 1 (padrão 0,15). 0 = sem música, sem perder o arquivo.</div>
      </div>
    </div>
    <div class="campo">
      <label>Ou envie o arquivo do seu PC</label>
      <div class="can-trilha" id="can-trilha">
        ${c.trilha_arquivo
          ? `<div class="can-trilha-atual">${Icones.check} <strong>${escaparHtml(c.trilha_arquivo_nome || c.trilha_arquivo)}</strong>
              <audio controls preload="none" src="/api/canais/${encodeURIComponent(c.id)}/trilha?t=${encodeURIComponent(c.atualizado_em || "")}"></audio>
              <button type="button" class="botao can-botao-mini perigo" id="can-trilha-remover">Remover</button></div>`
          : `<span class="msg-teste-neutra">Nenhum arquivo enviado.</span>`}
        <button type="button" class="botao" id="can-trilha-escolher" ${c.id ? "" : "disabled"}>${c.trilha_arquivo ? "Trocar arquivo" : "Escolher arquivo"}</button>
        <input type="file" id="can-trilha-input" accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4" hidden />
      </div>
      <div class="ajuda" id="can-trilha-ajuda">${c.id ? `MP3, WAV ou M4A, até ${maxMb} MB. Fica guardado neste computador, na pasta do canal.` : "Crie o canal primeiro para enviar um arquivo."}</div>
    </div>
    <label class="can-check"><input type="checkbox" data-campo="trilha_usar_padrao" ${c.trilha_usar_padrao ? "checked" : ""} /> Usar a música padrão do robô quando não houver link nem arquivo</label>
    <div class="ajuda" style="margin:4px 0 0 26px;">A música padrão ainda não vem embutida no app; a opção fica guardada para quando vier.</div>
    ${_canEntenda("Ordem de uso: arquivo enviado → link → música padrão (se marcada). Nada disso liga a trilha sozinho: o liga/desliga é por vídeo ou pelo preset.")}`;
  _canLigarCampos(container, corpo);
  corpo.querySelectorAll("[data-baixar]").forEach((b) => b.addEventListener("click", () => _canBaixarTxt(b.dataset.arquivo, _canRascunho[b.dataset.baixar])));
  const vol = corpo.querySelector("#can-volume");
  vol.addEventListener("input", () => { corpo.querySelector("#can-volume-rot").textContent = Number(vol.value).toFixed(2).replace(".", ","); });
  const input = corpo.querySelector("#can-trilha-input");
  corpo.querySelector("#can-trilha-escolher").addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const arq = input.files[0];
    if (!arq) return;
    const ajuda = corpo.querySelector("#can-trilha-ajuda");
    if (arq.size > maxMb * 1024 * 1024) { ajuda.innerHTML = `<span class="msg-teste-erro">O arquivo passa de ${maxMb} MB.</span>`; input.value = ""; return; }
    const form = new FormData();
    form.append("arquivo", arq);
    try {
      const novo = await Api.postFormComProgresso(`/api/canais/${encodeURIComponent(_canRascunho.id)}/trilha`, form, (pct) => { ajuda.textContent = `Enviando… ${pct}%`; });
      _canAtualizarDoServidor(novo);
      _canRenderEditor(container);
      _canRenderLista(container);
    } catch (exc) {
      ajuda.innerHTML = `<span class="msg-teste-erro">${escaparHtml(exc.message)}</span>`;
      input.value = "";
    }
  });
  corpo.querySelector("#can-trilha-remover")?.addEventListener("click", async () => {
    if (!confirm("Remover o arquivo da trilha deste canal?")) return;
    try {
      _canAtualizarDoServidor(await Api.del(`/api/canais/${encodeURIComponent(_canRascunho.id)}/trilha`));
      _canRenderEditor(container);
    } catch (exc) { alert("Erro: " + exc.message); }
  });
}

// mantém as edições locais não salvas ao receber o canal do servidor (trilha/presets)
function _canAtualizarDoServidor(novo) {
  const i = _canLista.findIndex((x) => x.id === novo.id);
  if (i >= 0) _canLista[i] = novo; else _canLista.push(novo);
  const sujo = _canSujo();
  const locais = {};
  if (sujo) CAN_CAMPOS_FORM.forEach((k) => { locais[k] = _canRascunho[k]; });
  _canRascunho = JSON.parse(JSON.stringify(novo));
  _canSalvoJson = _canAssinatura(_canRascunho);
  if (sujo) Object.assign(_canRascunho, locais);
}

async function _canSalvar(container) {
  const c = _canRascunho;
  if (!(c.nome || "").trim()) { alert("Dê um nome ao canal."); _canAba = "identidade"; _canRenderEditor(container); return; }
  const corpo = {};
  CAN_CAMPOS_FORM.forEach((k) => { if (c[k] !== undefined) corpo[k] = c[k]; });
  const btn = container.querySelector("#can-salvar");
  btn.disabled = true;
  try {
    const salvo = c.id ? await Api.put(`/api/canais/${encodeURIComponent(c.id)}`, corpo) : await Api.post("/api/canais", corpo);
    const i = _canLista.findIndex((x) => x.id === salvo.id);
    if (i >= 0) _canLista[i] = salvo; else _canLista.push(salvo);
    _canSelecionado = salvo.id;
    _canRascunho = JSON.parse(JSON.stringify(salvo));
    _canSalvoJson = _canAssinatura(_canRascunho);
    _canRenderLista(container);
    _canRenderEditor(container);
  } catch (exc) {
    alert("Erro ao salvar: " + exc.message);
    btn.disabled = false;
  }
}

async function _canExcluir(container) {
  const c = _canRascunho;
  if (!confirm(`Excluir o canal “${c.nome}”? Os presets e a trilha enviada também serão apagados. Produções já feitas não mudam.`)) return;
  try {
    await Api.del(`/api/canais/${encodeURIComponent(c.id)}`);
    _canLista = _canLista.filter((x) => x.id !== c.id);
    _canAbrir(_canLista.length ? _canLista[0].id : "", true);
    if (!_canRascunho.id) _canAba = "identidade";
    _canRenderLista(container);
    _canRenderEditor(container);
  } catch (exc) { alert("Erro ao excluir: " + exc.message); }
}

// ---------------------------------------------------- aba 4: presets --
// Resumo de uma linha de um preset (ou do estado do Produzir).
function resumoAjustesPreset(aj) {
  aj = aj || {};
  const partes = [];
  if (aj.estilo) { const est = _estiloPorId(aj.estilo); partes.push(est ? est.nome : aj.estilo); }
  if (aj.pct_real != null) partes.push(`${aj.pct_real}% real`);
  if (aj.segundos_por_cena != null) partes.push(`${String(aj.segundos_por_cena).replace(".", ",")} s/cena`);
  if (aj.trilha === false) partes.push("sem trilha");
  if (aj.apresentador) partes.push(`apresentador a cada ${aj.avatar_intervalo_s || 60} s`);
  if (aj.takes_ativos) partes.push(`templates a cada ${aj.takes_intervalo_s || 25} s`);
  if (aj.legenda_ativa) partes.push(aj.legenda_escala != null && Number(aj.legenda_escala) !== 100 ? `legenda ${Math.round(aj.legenda_escala)}%` : "legenda");
  if (aj.usar_youtube) partes.push("YouTube");
  if (aj.usar_gpu) partes.push("placa de vídeo");
  return partes.join(" · ") || "Padrões globais";
}

function _canAbaPresets(container, corpo) {
  if (_canPresetEditando) { _canEditorPreset(container, corpo); return; }
  const c = _canRascunho;
  const presets = c.presets || [];
  corpo.innerHTML = `
    <div class="can-secao-titulo">PRESETS DE PRODUÇÃO <span>· estilo e ajustes reutilizáveis deste canal</span></div>
    <div class="can-nota">Ao escolher o canal no Produzir, o preset marcado como <strong>padrão</strong> já vem aplicado. Título, roteiro e áudio ficam fora do preset. Você também cria presets pelo Produzir, em “Salvar como preset do canal”.</div>
    <div class="can-presets">
      ${presets.map((p) => `
        <div class="can-preset ${p.padrao ? "padrao" : ""}">
          <div class="can-preset-topo">
            <strong>${escaparHtml(p.nome)}</strong>
            ${p.padrao ? '<span class="can-selo-padrao">Padrão do canal</span>' : ""}
          </div>
          <div class="can-preset-resumo">${escaparHtml(resumoAjustesPreset(p.ajustes))}</div>
          <div class="can-preset-acoes">
            <button type="button" class="botao can-botao-mini" data-preset-acao="editar" data-id="${p.id}">Editar</button>
            ${p.padrao ? "" : `<button type="button" class="botao can-botao-mini" data-preset-acao="padrao" data-id="${p.id}">Tornar padrão</button>`}
            <button type="button" class="botao can-botao-mini" data-preset-acao="duplicar" data-id="${p.id}" title="Duplicar">${Icones.copiar}</button>
            <button type="button" class="botao can-botao-mini perigo" data-preset-acao="excluir" data-id="${p.id}" title="Excluir">${Icones.lixeira}</button>
          </div>
        </div>`).join("")}
      <button type="button" class="can-preset-novo" id="can-preset-novo"><span class="mais">+</span>${presets.length ? "Novo preset" : "Criar o primeiro preset"}<small>Parte dos padrões globais</small></button>
    </div>
    <p class="can-cascata" style="margin-top:14px;">Vídeo → preset/canal → padrão global.</p>`;
  corpo.querySelector("#can-preset-novo").addEventListener("click", () => {
    _canPresetEditando = { id: "", nome: "", padrao: presets.length === 0, ajustes: {} };
    _canRenderEditor(container);
  });
  corpo.querySelectorAll("[data-preset-acao]").forEach((b) => b.addEventListener("click", async () => {
    const p = presets.find((x) => x.id === b.dataset.id);
    const base = `/api/canais/${encodeURIComponent(c.id)}/presets/${encodeURIComponent(p.id)}`;
    try {
      if (b.dataset.presetAcao === "editar") {
        _canPresetEditando = JSON.parse(JSON.stringify(p));
        _canRenderEditor(container);
        return;
      }
      if (b.dataset.presetAcao === "padrao") await Api.put(base, { padrao: true });
      else if (b.dataset.presetAcao === "duplicar") await Api.post(`${base}/duplicar`);
      else if (b.dataset.presetAcao === "excluir") {
        if (!confirm(`Excluir o preset “${p.nome}”?`)) return;
        await Api.del(base);
      }
      _canAtualizarDoServidor(await Api.get(`/api/canais/${encodeURIComponent(c.id)}`));
      _canRenderLista(container);
      _canRenderEditor(container);
    } catch (exc) { alert("Erro: " + exc.message); }
  }));
}

// Editor de preset: todos os ajustes de produção. O objeto `e` imita o
// estado do Produzir (padrões globais + ajustes) para reaproveitar os helpers.
function _canEstadoPreset(ajustes) {
  const e = _estadoProduzirPadrao();
  e.estilo = _estiloPadraoNovoPedido();
  Object.assign(e, { apresentador: false, avatar_intervalo_s: 60 }, ajustes || {});
  return e;
}

function _canEditorPreset(container, corpo) {
  const pe = _canPresetEditando;
  const e = _canEstadoPreset(pe.ajustes);
  const estilos = _estilosCache || [];
  const provs = (_canOpcoes && _canOpcoes.provedores_tts) || CAN_PROVEDORES_PADRAO;
  const chk = (id, marcado, rotulo, ajuda) => `<label class="can-check"><input type="checkbox" id="${id}" ${marcado ? "checked" : ""} /> ${rotulo}</label>${ajuda ? `<div class="ajuda can-ajuda-check">${ajuda}</div>` : ""}`;
  corpo.innerHTML = `
    <div class="can-preset-editor">
      <button type="button" class="botao link-simples" id="pe-voltar">← Presets</button>
      <div class="linha-campos" style="margin-top:10px;">
        <div class="campo"><label>Nome do preset</label><input type="text" id="pe-nome" value="${escaparHtml(pe.nome)}" maxlength="120" placeholder="ex.: 50% real · 4 s por cena · placa de vídeo" /></div>
      </div>
      ${chk("pe-padrao", pe.padrao, "Usar como padrão ao escolher este canal")}

      <div class="can-secao-titulo">ESTILO</div>
      <div class="linha-campos">
        <div class="campo"><label>Estilo de edição</label><select id="pe-estilo">${_optgroupsEstiloHtml(estilos, e.estilo)}</select></div>
        <div class="campo"><label>Narração (fornecedor)</label>
          <select id="pe-provedor"><option value="">A do canal</option>${provs.map((p) => `<option value="${escaparHtml(p.id)}" ${e.provedor_tts === p.id ? "selected" : ""}>${escaparHtml(p.nome)}</option>`).join("")}</select>
          <div class="ajuda">Mesma voz do canal, outro fornecedor.</div></div>
      </div>
      ${chk("pe-trilha", e.trilha, "Trilha sonora", "Desmarque para os vídeos saírem sem música.")}
      ${chk("pe-apresentador", e.apresentador, "Apresentador", "O avatar padrão do canal abre o vídeo e reaparece a cada intervalo.")}
      <div class="linha-campos">
        <div class="campo"><label>Avatar a cada (s)</label><input type="number" id="pe-avatar-intervalo" min="15" max="600" step="5" value="${e.avatar_intervalo_s || 60}" /></div>
        <div class="campo"><label>Templates a cada (s)</label><input type="number" id="pe-takes-intervalo" min="15" max="60" step="5" value="${e.takes_intervalo_s || 25}" /></div>
      </div>
      ${chk("pe-takes", e.takes_ativos, "Templates (composições)")}
      <details class="entenda-ajuste"><summary>Templates no rodízio</summary><div id="pe-takes-lista">${_listaTakesHtml(e)}</div></details>
      ${chk("pe-legenda", e.legenda_ativa, "Legenda")}
      <div class="linha-campos">
        <div class="campo"><label>Estilo da legenda</label>${_selectHtml("pe-legenda-estilo", LEGENDA_ESTILOS_UI, e.legenda_estilo || "preenchimento")}</div>
        <div class="campo"><label>Tamanho <span class="slider-rotulo" id="pe-legenda-escala-rot">${legendaEscalaEfetiva(e)}%</span></label><input type="range" id="pe-legenda-escala" min="60" max="160" step="1" value="${legendaEscalaEfetiva(e)}" /></div>
        <div class="campo"><label>Posição</label>${_selectHtml("pe-legenda-posicao", [["inferior", "Inferior"], ["centro", "Central"]], e.legenda_posicao || "inferior")}</div>
      </div>

      <div class="can-secao-titulo">IMAGENS DO VÍDEO</div>
      <div class="campo">
        <label>Footage real x IA</label>
        <div class="slider-linha"><input type="range" id="pe-pct-real" min="0" max="100" step="5" value="${e.pct_real}" /><span class="slider-rotulo" id="pe-pct-real-rot">${e.pct_real}% real / ${100 - e.pct_real}% IA</span></div>
      </div>
      <div class="linha-campos">
        <div class="campo"><label>Mídia da IA</label>${_selectHtml("pe-midia-ia", [["so_imagens", "Só imagens"], ["imagens_videos", "Imagens + vídeos"]], e.midia_ia)}</div>
        <div class="campo"><label>Mídia do acervo</label>${_selectHtml("pe-midia-acervo", [["fotos_videos", "Fotos + vídeos"], ["so_fotos", "Só fotos"], ["so_videos", "Só vídeos"]], e.midia_acervo)}</div>
      </div>
      <div class="linha-campos">
        <div class="campo"><label>Gerador de imagem IA</label><select id="pe-gerador">${_opcoesGeradorHtml(e)}</select></div>
        <div class="campo"><label>Qualidade OpenAI</label><select id="pe-qualidade">${_opcoesQualidadeHtml(e)}</select></div>
      </div>
      <div class="campo"><label>Bancos de acervo</label><div id="pe-bancos">${_listaBancosHtml(e)}</div></div>
      ${chk("pe-youtube", e.usar_youtube, "Completar com trechos do YouTube")}
      ${chk("pe-juiz", e.juiz_visual, "Juiz visual (garante que o acervo mostre o tema)")}

      <div class="can-secao-titulo">TEMPO E PROCESSAMENTO</div>
      <div class="campo">
        <label>Segundos por cena</label>
        <div class="slider-linha"><input type="range" id="pe-spc" min="3" max="7" step="0.5" value="${e.segundos_por_cena}" /><span class="slider-rotulo" id="pe-spc-rot">${e.segundos_por_cena} s</span></div>
      </div>
      ${chk("pe-gpu", e.usar_gpu, "Codificar com a placa de vídeo (GPU)")}
      ${_canEntenda("O preset guarda só os ajustes de produção. A voz, o avatar, o mundo e a trilha vêm do canal. O que você mudar em um vídeo vale só para ele, até salvar como preset.")}
      <div class="can-rodape">
        <div>${pe.id ? '<button type="button" class="botao perigo" id="pe-excluir">Excluir preset</button>' : ""}</div>
        <span class="can-cascata">Vídeo → preset/canal → padrão global.</span>
        <div style="display:flex; gap:8px;"><button type="button" class="botao" id="pe-cancelar">Cancelar</button><button type="button" class="botao primario" id="pe-salvar">${pe.id ? "Salvar preset" : "Criar preset"}</button></div>
      </div>
    </div>`;

  const q = (s) => corpo.querySelector(s);
  q("#pe-pct-real").addEventListener("input", (ev) => { q("#pe-pct-real-rot").textContent = `${ev.target.value}% real / ${100 - ev.target.value}% IA`; });
  q("#pe-spc").addEventListener("input", (ev) => { q("#pe-spc-rot").textContent = `${ev.target.value} s`; });
  q("#pe-legenda-escala").addEventListener("input", (ev) => { q("#pe-legenda-escala-rot").textContent = `${ev.target.value}%`; });
  q("#pe-takes").addEventListener("change", (ev) => { corpo.querySelectorAll("#pe-takes-lista [data-take]").forEach((cb) => { cb.disabled = !ev.target.checked; }); });
  q("#pe-gerador").addEventListener("change", (ev) => { q("#pe-qualidade").disabled = !_geradorUsaOpenai(ev.target.value); });
  q("#pe-qualidade").disabled = !_geradorUsaOpenai(e.gerador_imagem);
  const voltar = () => { _canPresetEditando = null; _canRenderEditor(container); };
  q("#pe-voltar").addEventListener("click", voltar);
  q("#pe-cancelar").addEventListener("click", voltar);
  q("#pe-excluir")?.addEventListener("click", async () => {
    if (!confirm(`Excluir o preset “${pe.nome}”?`)) return;
    try {
      await Api.del(`/api/canais/${encodeURIComponent(_canRascunho.id)}/presets/${encodeURIComponent(pe.id)}`);
      _canAtualizarDoServidor(await Api.get(`/api/canais/${encodeURIComponent(_canRascunho.id)}`));
      voltar();
      _canRenderLista(container);
    } catch (exc) { alert("Erro: " + exc.message); }
  });
  q("#pe-salvar").addEventListener("click", async () => {
    const nome = q("#pe-nome").value.trim();
    if (!nome) { alert("Dê um nome ao preset."); return; }
    const marcadosTakes = new Set([...corpo.querySelectorAll("#pe-takes-lista [data-take]:checked")].map((x) => x.dataset.take));
    const semChave = new Set(((_bancosCache || {}).bancos || []).filter((b) => b.precisa_chave && !b.chave_configurada).map((b) => b.id));
    const bancosAntes = _bancosMarcados(e).filter((id) => semChave.has(id));
    const bancos = [...corpo.querySelectorAll("#pe-bancos [data-banco]:checked")].map((x) => x.dataset.banco);
    const ajustes = {
      estilo: q("#pe-estilo").value,
      provedor_tts: q("#pe-provedor").value,
      trilha: q("#pe-trilha").checked,
      apresentador: q("#pe-apresentador").checked,
      avatar_intervalo_s: Math.max(15, Math.min(600, Math.round(Number(q("#pe-avatar-intervalo").value) || 60))),
      takes_ativos: q("#pe-takes").checked,
      takes_intervalo_s: Math.max(15, Math.min(60, Number(q("#pe-takes-intervalo").value) || 25)),
      takes_lista: TAKES_IDS_UI.filter((id) => marcadosTakes.has(id)),
      legenda_ativa: q("#pe-legenda").checked,
      legenda_estilo: q("#pe-legenda-estilo").value,
      legenda_escala: Number(q("#pe-legenda-escala").value),
      legenda_tamanho: legendaRotuloEscala(Number(q("#pe-legenda-escala").value)),
      legenda_posicao: q("#pe-legenda-posicao").value,
      pct_real: Number(q("#pe-pct-real").value),
      midia_ia: q("#pe-midia-ia").value,
      midia_acervo: q("#pe-midia-acervo").value,
      gerador_imagem: q("#pe-gerador").value,
      qualidade_openai: q("#pe-qualidade").value,
      bancos_acervo: [...new Set([...bancos, ...bancosAntes])],
      usar_youtube: q("#pe-youtube").checked,
      juiz_visual: q("#pe-juiz").checked,
      segundos_por_cena: Number(q("#pe-spc").value),
      usar_gpu: q("#pe-gpu").checked,
    };
    // mantém o que o editor não mostra (cores/fonte da legenda etc.)
    const corpoReq = { nome, padrao: q("#pe-padrao").checked, ajustes: { ...(pe.ajustes || {}), ...ajustes } };
    const base = `/api/canais/${encodeURIComponent(_canRascunho.id)}/presets`;
    try {
      if (pe.id) await Api.put(`${base}/${encodeURIComponent(pe.id)}`, corpoReq);
      else await Api.post(base, corpoReq);
      _canAtualizarDoServidor(await Api.get(`/api/canais/${encodeURIComponent(_canRascunho.id)}`));
      voltar();
      _canRenderLista(container);
    } catch (exc) { alert("Erro ao salvar o preset: " + exc.message); }
  });
}

// <select> de estilo agrupado (validados primeiro), usado no editor de preset.
function _optgroupsEstiloHtml(estilos, valorAtual) {
  const opcao = (est) =>
    `<option value="${est.id}" ${valorAtual === est.id ? "selected" : ""}>${escaparHtml(est.nome)}${est.disponivel === false ? " (precisa do Edge)" : ""}</option>`;
  const validados = estilos.filter((est) => est.grupo === "validado");
  const teste = estilos.filter((est) => est.grupo !== "validado");
  const grupo = (rotulo, lista) => (lista.length ? `<optgroup label="${rotulo}">${lista.map(opcao).join("")}</optgroup>` : "");
  return grupo("Validados", validados) + grupo("Teste", teste);
}
