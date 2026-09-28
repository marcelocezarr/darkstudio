// Tela Avatares: biblioteca de apresentadores HeyGen (criar por foto,
// importar por ID, motor/resolucao por avatar, previa paga por botao).
// Sempre 16:9. Excluir remove so a copia local.

let _avCache = null; // {lista, heygen, pendentes}
let _avTimer = null;

const AV_ROTULO_STATUS = {
  verificado: { txt: "Verificado na sua conta", cls: "ok" },
  processando: { txt: "Processando na HeyGen", cls: "info" },
  nao_verificado: { txt: "Não verificado", cls: "atencao" },
  pendente_envio: { txt: "Pendente de envio", cls: "atencao" },
  falhou: { txt: "Falhou na HeyGen", cls: "erro" },
};

async function telaAvatares(container) {
  container.innerHTML = `<div class="pagina-cabecalho"><div><h1>Avatares</h1><p class="pagina-sub">Carregando...</p></div></div>`;
  await _avCarregar(container, false);
}

async function _avCarregar(container, forcar) {
  const [lista, heygen, pend] = await Promise.all([
    Api.get("/api/avatares"),
    Api.get(`/api/avatares/heygen${forcar ? "?forcar=true" : ""}`).catch(() => ({ configurado: false, tipo: "desconhecido" })),
    Api.get("/api/avatares/pendentes").catch(() => ({ pendentes: [] })),
  ]);
  _avCache = { lista, heygen, pendentes: pend.pendentes || [] };
  _avRender(container);
  _avAgendarAtualizacao(container);
}

// enquanto houver previa gerando / avatar processando, atualiza sozinho
function _avAgendarAtualizacao(container) {
  if (_avTimer) clearTimeout(_avTimer);
  const ocupado = (_avCache.lista.avatares || []).some(
    (a) => (a.previa && a.previa.status === "gerando") || a.status === "processando"
  );
  if (!ocupado) return;
  _avTimer = setTimeout(async () => {
    if (!document.body.contains(container) || !container.querySelector(".av-pagina")) return;
    try {
      const proc = (_avCache.lista.avatares || []).filter((a) => a.status === "processando");
      for (const a of proc) await Api.post(`/api/avatares/${a.id}/verificar`).catch(() => null);
      _avCache.lista = await Api.get("/api/avatares");
      _avRender(container);
    } catch (_) { /* tenta de novo */ }
    _avAgendarAtualizacao(container);
  }, 8000);
}

function _avMoeda(v) { return formatarMoeda(v); }

function _avCartaoConexao(h) {
  let selo, titulo, texto, saldoHtml = "";
  if (!h.configurado) {
    selo = `<span class="av-selo atencao"><span class="av-ponto"></span>HeyGen desconectada</span>`;
    titulo = "Conecte a sua conta HeyGen";
    texto = `Cole a chave da API em <a href="#integracoes">Integrações</a>. A conexão permite criar avatares por foto e validar os importados antes do primeiro uso. Sem chave, as fotos ficam guardadas como "pendente de envio".`;
  } else if (h.tipo === "desconhecido" && h.saldo == null && h.creditos == null && h.aviso) {
    selo = `<span class="av-selo erro"><span class="av-ponto"></span>Sem resposta</span>`;
    titulo = "HeyGen configurada";
    texto = escaparHtml(h.aviso);
  } else {
    selo = `<span class="av-selo ok"><span class="av-ponto"></span>HeyGen conectada</span>`;
    titulo = "Conta HeyGen conectada";
    const det = h.detalhe || {};
    texto = [det.plano ? `Plano ${escaparHtml(det.plano)}` : "", h.aviso ? escaparHtml(h.aviso) : ""].filter(Boolean).join(" · ") || "A chave foi aceita pela HeyGen.";
    if (h.saldo != null) saldoHtml = `<div class="av-saldo"><span>Saldo da API</span><strong>${_avMoeda(h.saldo)}</strong></div>`;
    else if (h.creditos != null) saldoHtml = `<div class="av-saldo"><span>Créditos</span><strong>${Number(h.creditos).toLocaleString("pt-BR")}</strong></div>`;
  }
  return `
    <div class="av-conexao">
      <div class="av-conexao-texto">
        ${selo}
        <h3>${titulo}</h3>
        <p class="pagina-sub">${texto}</p>
      </div>
      ${saldoHtml}
      <div class="av-conexao-acoes">
        ${h.configurado ? `<button class="botao" id="av-testar">Testar conexão</button>` : `<a class="botao primario" href="#integracoes">Configurar chave</a>`}
        <a class="link-simples" href="${escaparHtml(h.url_recarga || "https://app.heygen.com/settings?nav=API")}" target="_blank" rel="noopener">Abrir HeyGen ${Icones.externo}</a>
      </div>
    </div>`;
}

function _avOpcoes(lista, atual) {
  return lista.map((o) => `<option value="${escaparHtml(o.id)}" ${String(atual || "") === String(o.id) ? "selected" : ""}>${escaparHtml(o.nome)}</option>`).join("");
}

function _avCartao(a, opc) {
  const st = AV_ROTULO_STATUS[a.status] || { txt: a.status, cls: "neutro" };
  const img = a.miniatura_url
    ? `<img src="${escaparHtml(a.miniatura_url)}" alt="" loading="lazy" />`
    : `<div class="av-sem-foto">${escaparHtml((a.nome || "?").toUpperCase())}</div>`;
  const prev = a.previa || {};
  let midia = img;
  if (a.previa_url) midia = `<video src="${escaparHtml(a.previa_url)}" controls preload="metadata" poster="${escaparHtml(a.miniatura_url || "")}"></video>`;
  let linhaPrevia = "";
  if (prev.status === "gerando") linhaPrevia = `<p class="av-linha info">Gerando prévia na HeyGen… (pode levar alguns minutos)</p>`;
  else if (prev.status === "erro") linhaPrevia = `<p class="av-linha erro">Prévia: ${escaparHtml(prev.erro || "falhou")}</p>`;
  const acoes = [];
  if (!a.heygen_id) acoes.push(`<button class="botao primario pequeno" data-acao="enviar" data-id="${a.id}">Enviar para a HeyGen</button>`);
  else {
    acoes.push(`<button class="botao pequeno" data-acao="verificar" data-id="${a.id}">Verificar</button>`);
    if (a.status === "verificado" || a.status === "nao_verificado")
      acoes.push(`<button class="botao pequeno" data-acao="previa" data-id="${a.id}" ${prev.status === "gerando" ? "disabled" : ""}>${Icones.video} Gerar prévia</button>`);
  }
  return `
    <div class="av-cartao" data-id="${a.id}">
      <div class="av-midia">${midia}<span class="av-etiqueta">Avatar · 16:9</span></div>
      <div class="av-corpo">
        <span class="av-selo ${st.cls}"><span class="av-ponto"></span>${escaparHtml(st.txt)}</span>
        <div class="av-nome-linha">
          <input class="av-nome" value="${escaparHtml(a.nome)}" data-id="${a.id}" maxlength="80" title="Clique para renomear" />
        </div>
        <div class="av-id">${a.heygen_id ? `ID HeyGen: <code>${escaparHtml(a.heygen_id)}</code>` : "Ainda não enviado"}</div>
        ${a.erro ? `<p class="av-linha ${a.status === "falhou" ? "erro" : "atencao"}">${escaparHtml(a.erro)}</p>` : ""}
        ${linhaPrevia}
        <div class="av-selects">
          <label>Motor<select data-campo="motor" data-id="${a.id}">${_avOpcoes(opc.motores, a.motor || "")}</select></label>
          <label>Resolução<select data-campo="resolucao" data-id="${a.id}">${_avOpcoes(opc.resolucoes, a.resolucao)}</select></label>
        </div>
        <div class="av-acoes">
          ${acoes.join("")}
          <button class="link-simples av-remover" data-acao="remover" data-id="${a.id}">Remover</button>
        </div>
      </div>
    </div>`;
}

function _avPendentes(pendentes) {
  if (!pendentes.length) return "";
  return `
    <section class="bloco-secao">
      <div class="cabecalho-secao">
        <div><h2>Fotos importadas dos projetos</h2><p class="pagina-sub">Imagens de avatar dos antigos Projetos. Crie um personagem a partir de cada uma (ou ignore).</p></div>
      </div>
      <div class="av-grade-pendentes">
        ${pendentes.map((p, i) => `
          <div class="av-pendente">
            <img src="/api/avatares/pendentes/arquivo?caminho=${encodeURIComponent(p.arquivo)}" alt="" loading="lazy" />
            <input class="av-pendente-nome" data-i="${i}" value="${escaparHtml(p.nome_sugerido)}" maxlength="80" />
            <button class="botao pequeno primario" data-acao="criar-pendente" data-i="${i}">Criar avatar</button>
          </div>`).join("")}
      </div>
    </section>`;
}

function _avRender(container) {
  const { lista, heygen, pendentes } = _avCache;
  const avs = lista.avatares || [];
  const opc = { motores: lista.motores || [], resolucoes: lista.resolucoes || [] };
  container.innerHTML = `
    <div class="av-pagina">
      <div class="pagina-cabecalho">
        <div><h1>Avatares</h1><p class="pagina-sub">Apresentadores da HeyGen que abrem o vídeo e aparecem nos trechos escolhidos pelo roteiro.</p></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="botao" id="av-importar">Importar por ID</button>
          <button class="botao primario" id="av-criar">+ Criar por foto</button>
        </div>
      </div>
      ${_avCartaoConexao(heygen)}
      <section class="bloco-secao">
        <div class="cabecalho-secao">
          <div><h2>Os seus avatares <span class="av-contagem">· ${avs.length} guardado${avs.length === 1 ? "" : "s"}</span></h2></div>
        </div>
        <div class="av-grade">
          ${avs.map((a) => _avCartao(a, opc)).join("")}
          <button class="av-cartao av-novo" id="av-novo-cartao">
            <span class="av-mais">+</span>
            <strong>${avs.length ? "Criar outro personagem" : "Nenhum personagem ainda"}</strong>
            <span class="pagina-sub">A partir de uma foto de rosto — sem sair daqui.</span>
          </button>
        </div>
        <div class="av-notas">
          <p><strong>O enquadramento é sempre paisagem 16:9.</strong> Motor e resolução você escolhe por avatar, no cartão. O vídeo final é montado em 16:9 — avatar em outro formato sairia com barra ou corte.</p>
          <p><strong>Custos (API HeyGen, estimados):</strong> criar um personagem ~${_avMoeda(lista.custo_criar_usd || 1)} (uma vez); vídeo ~US$ 0,04–0,08 por segundo conforme motor/resolução. Remover aqui apaga só a cópia local — nada é apagado na sua conta HeyGen.</p>
        </div>
      </section>
      ${_avPendentes(pendentes)}
    </div>`;
  _avEventos(container);
}

// ------------------------------------------------------------- eventos --
function _avEventos(container) {
  const q = (s) => container.querySelector(s);
  q("#av-criar").addEventListener("click", () => _avModalCriar(container));
  q("#av-novo-cartao").addEventListener("click", () => _avModalCriar(container));
  q("#av-importar").addEventListener("click", () => _avModalImportar(container));
  q("#av-testar")?.addEventListener("click", async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true; b.textContent = "Testando...";
    try {
      const r = await Api.post("/api/avatares/heygen/testar");
      alert((r.ok ? "✓ " : "✗ ") + r.mensagem);
    } catch (exc) { alert("Erro: " + exc.message); }
    await _avCarregar(container, true);
  });

  container.querySelectorAll(".av-nome").forEach((inp) => {
    const salvar = async () => {
      const a = (_avCache.lista.avatares || []).find((x) => x.id === inp.dataset.id);
      const nome = inp.value.trim();
      if (!a || !nome || nome === a.nome) { inp.value = a ? a.nome : inp.value; return; }
      try { await Api.put(`/api/avatares/${a.id}`, { nome }); a.nome = nome; }
      catch (exc) { alert("Erro ao renomear: " + exc.message); inp.value = a.nome; }
    };
    inp.addEventListener("blur", salvar);
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") inp.blur(); });
  });
  container.querySelectorAll(".av-selects select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      try { await Api.put(`/api/avatares/${sel.dataset.id}`, { [sel.dataset.campo]: sel.value || null }); }
      catch (exc) { alert("Erro ao salvar: " + exc.message); }
      _avCache.lista = await Api.get("/api/avatares");
    });
  });
  container.querySelectorAll("[data-acao]").forEach((btn) => {
    btn.addEventListener("click", () => _avAcao(container, btn));
  });
}

async function _avAcao(container, btn) {
  const id = btn.dataset.id;
  const a = id ? (_avCache.lista.avatares || []).find((x) => x.id === id) : null;
  const acao = btn.dataset.acao;
  if (acao === "remover") {
    if (!confirm(`Remover "${a.nome}" da biblioteca?\n\nApaga só a cópia local (foto e prévia). O avatar continua na sua conta HeyGen.`)) return;
    await Api.del(`/api/avatares/${id}`).catch((exc) => alert("Erro: " + exc.message));
    return _avCarregar(container, false);
  }
  if (acao === "previa") return _avModalPrevia(container, a);
  if (acao === "criar-pendente") {
    const p = _avCache.pendentes[Number(btn.dataset.i)];
    const nome = container.querySelector(`.av-pendente-nome[data-i="${btn.dataset.i}"]`).value.trim();
    if (!nome) return alert("Dê um nome ao avatar.");
    const aviso = _avCache.heygen.configurado
      ? `Criar o personagem "${nome}" na HeyGen?\n\nUsa crédito da API HeyGen (~${_avMoeda(_avCache.lista.custo_criar_usd || 1)}), uma vez.`
      : `Guardar "${nome}" na biblioteca? Sem chave da HeyGen ele fica "pendente de envio".`;
    if (!confirm(aviso)) return;
    btn.disabled = true; btn.textContent = "Criando...";
    try { await Api.post("/api/avatares/pendentes/criar", { arquivo: p.arquivo, nome }); }
    catch (exc) { alert("Erro: " + exc.message); }
    return _avCarregar(container, false);
  }
  btn.disabled = true;
  try {
    if (acao === "enviar") {
      if (!confirm(`Enviar "${a.nome}" para a HeyGen?\n\nCriar o personagem usa crédito da API (~${_avMoeda(_avCache.lista.custo_criar_usd || 1)}), uma vez.`)) { btn.disabled = false; return; }
      btn.textContent = "Enviando...";
      await Api.post(`/api/avatares/${id}/enviar`);
    } else if (acao === "verificar") {
      btn.textContent = "Verificando...";
      await Api.post(`/api/avatares/${id}/verificar`);
    }
  } catch (exc) { alert("Erro: " + exc.message); }
  await _avCarregar(container, false);
}

// --------------------------------------------------------------- modais --
function _avModalCriar(container) {
  const conectado = _avCache.heygen.configurado;
  const fundo = abrirModal(`
    <div class="av-modal">
      <div class="av-modal-topo">HEYGEN · Criar personagem por foto</div>
      <p class="pagina-sub">Escolha uma foto de rosto e dê um nome. ${conectado ? "O personagem é criado na sua conta HeyGen e já fica disponível aqui." : "Sem a chave da HeyGen ele fica guardado como <strong>pendente de envio</strong> e é enviado depois."}</p>
      <div class="campo"><label>Nome</label><input type="text" id="av-m-nome" placeholder="ex.: Marcos, o mecânico" maxlength="80" /></div>
      <div class="campo">
        <label>Foto do rosto</label>
        <label class="av-drop" id="av-m-drop">
          <input type="file" id="av-m-foto" accept="image/jpeg,image/png,image/webp" hidden />
          <span id="av-m-drop-txt">Arraste a foto aqui ou clique para escolher</span>
          <img id="av-m-prev" alt="" hidden />
        </label>
        <div class="ajuda">JPG, PNG ou WEBP, até 8 MB. <strong>1 foto</strong>, uma pessoa só, rosto de frente, nítido e bem iluminado, cabeça inteira no quadro, sem óculos escuros nem mãos no rosto.</div>
      </div>
      ${conectado ? `<div class="av-aviso-custo">${Icones.info}<span>Usa crédito da API HeyGen (~${_avMoeda(_avCache.lista.custo_criar_usd || 1)}) <strong>uma vez</strong>, na criação. Depois o personagem fica na sua conta e você o usa quantas vezes quiser.</span></div>` : ""}
      <p class="av-validacao" id="av-m-valida">⚠ Para liberar o botão, escolha: um nome + uma foto</p>
      <div class="rodape-modal">
        <button class="botao" id="av-m-cancelar">Cancelar</button>
        <button class="botao primario" id="av-m-ok" disabled>${conectado ? "Criar personagem" : "Guardar"}</button>
      </div>
    </div>`);
  const q = (s) => fundo.querySelector(s);
  let arquivo = null;
  const validar = () => {
    const ok = !!(q("#av-m-nome").value.trim() && arquivo);
    q("#av-m-ok").disabled = !ok;
    q("#av-m-valida").hidden = ok;
  };
  const escolher = (f) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return alert("Use JPG, PNG ou WEBP.");
    if (f.size > 8 * 1024 * 1024) return alert("A foto passa de 8 MB.");
    arquivo = f;
    const img = q("#av-m-prev");
    img.src = URL.createObjectURL(f); img.hidden = false;
    q("#av-m-drop-txt").textContent = f.name;
    if (!q("#av-m-nome").value.trim()) q("#av-m-nome").value = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    validar();
  };
  q("#av-m-foto").addEventListener("change", (ev) => escolher(ev.target.files[0]));
  const drop = q("#av-m-drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add("arrastando"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.remove("arrastando"); }));
  drop.addEventListener("drop", (ev) => escolher(ev.dataTransfer.files[0]));
  q("#av-m-nome").addEventListener("input", validar);
  q("#av-m-cancelar").addEventListener("click", fecharModal);
  q("#av-m-ok").addEventListener("click", async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true; b.textContent = conectado ? "Criando na HeyGen..." : "Guardando...";
    const fd = new FormData();
    fd.append("nome", q("#av-m-nome").value.trim());
    fd.append("foto", arquivo);
    try {
      const a = await Api.postForm("/api/avatares", fd);
      fecharModal();
      if (a.erro && a.status !== "verificado" && a.status !== "processando") alert(`Avatar guardado, mas ainda não foi para a HeyGen:\n${a.erro}`);
    } catch (exc) {
      alert("Erro: " + exc.message);
      b.disabled = false; b.textContent = conectado ? "Criar personagem" : "Guardar";
      return;
    }
    await _avCarregar(container, false);
  });
}

function _avModalImportar(container) {
  const conectado = _avCache.heygen.configurado;
  const fundo = abrirModal(`
    <div class="av-modal">
      <div class="av-modal-topo">HEYGEN · Importar por ID</div>
      <p class="pagina-sub">Cole o <strong>avatar_id</strong> (ID do look) de um avatar que já existe na sua conta HeyGen, ou escolha da lista. Não gasta crédito.</p>
      ${conectado ? "" : `<div class="banner banner-aviso">${Icones.alerta}<div>Configure a chave da HeyGen em <a href="#integracoes">Integrações</a> para importar.</div></div>`}
      <div class="campo"><label>ID do avatar</label><input type="text" id="av-i-id" placeholder="ex.: lk_abc123..." /></div>
      <div class="campo"><label>Nome <span class="rotulo-opcional">(opcional — usa o da HeyGen)</span></label><input type="text" id="av-i-nome" maxlength="80" /></div>
      ${conectado ? `<button class="link-simples" id="av-i-listar">Ver os avatares da minha conta</button><div id="av-i-lista" class="av-lista-conta"></div>` : ""}
      <div class="rodape-modal">
        <button class="botao" id="av-i-cancelar">Cancelar</button>
        <button class="botao primario" id="av-i-ok" ${conectado ? "" : "disabled"}>Importar</button>
      </div>
    </div>`);
  const q = (s) => fundo.querySelector(s);
  q("#av-i-cancelar").addEventListener("click", fecharModal);
  q("#av-i-listar")?.addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    const alvo = q("#av-i-lista");
    alvo.innerHTML = `<p class="pagina-sub">Carregando...</p>`;
    try {
      const r = await Api.get("/api/avatares/heygen/conta");
      const itens = r.avatares || [];
      alvo.innerHTML = itens.length
        ? itens.map((i) => `<button class="av-item-conta" data-id="${escaparHtml(i.id)}" data-nome="${escaparHtml(i.nome)}" ${i.na_biblioteca ? "disabled" : ""}>
            ${i.preview_imagem ? `<img src="${escaparHtml(i.preview_imagem)}" alt="" loading="lazy" />` : `<span class="av-item-sem"></span>`}
            <span><strong>${escaparHtml(i.nome || i.id)}</strong><small>${escaparHtml(i.tipo)} · ${escaparHtml(i.status)}${i.na_biblioteca ? " · já na biblioteca" : ""}</small></span></button>`).join("")
        : `<p class="pagina-sub">Nenhum avatar próprio na conta.</p>`;
      alvo.querySelectorAll(".av-item-conta").forEach((b) => b.addEventListener("click", () => {
        q("#av-i-id").value = b.dataset.id;
        if (!q("#av-i-nome").value) q("#av-i-nome").value = b.dataset.nome;
      }));
    } catch (exc) { alvo.innerHTML = `<p class="msg-teste-erro">${escaparHtml(exc.message)}</p>`; }
  });
  q("#av-i-ok").addEventListener("click", async (ev) => {
    const id = q("#av-i-id").value.trim();
    if (!id) return q("#av-i-id").focus();
    const b = ev.currentTarget;
    b.disabled = true; b.textContent = "Validando...";
    try {
      const a = await Api.post("/api/avatares/importar", { heygen_id: id, nome: q("#av-i-nome").value.trim() || null });
      fecharModal();
      if (a.status === "nao_verificado" && a.erro) alert(`Importado como "não verificado":\n${a.erro}`);
    } catch (exc) {
      alert("Erro: " + exc.message);
      b.disabled = false; b.textContent = "Importar";
      return;
    }
    await _avCarregar(container, false);
  });
}

function _avModalPrevia(container, a) {
  const fundo = abrirModal(`
    <div class="av-modal">
      <div class="av-modal-topo">HEYGEN · Gerar prévia</div>
      <p class="pagina-sub">Gera ~5 segundos de <strong>${escaparHtml(a.nome)}</strong> falando uma frase de teste com a voz padrão da HeyGen (${escaparHtml(a.motor_nome)}, ${escaparHtml(a.resolucao)}, 16:9).</p>
      <div class="av-aviso-custo">${Icones.alerta}<span>Isto <strong>gasta crédito</strong> da API HeyGen: cerca de ${_avMoeda(a.custo_previa_usd)}. A prévia não é gerada automaticamente em nenhum outro lugar.</span></div>
      <div class="rodape-modal">
        <button class="botao" id="av-p-cancelar">Cancelar</button>
        <button class="botao primario" id="av-p-ok">Gerar prévia (~${_avMoeda(a.custo_previa_usd)})</button>
      </div>
    </div>`);
  fundo.querySelector("#av-p-cancelar").addEventListener("click", fecharModal);
  fundo.querySelector("#av-p-ok").addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    try { await Api.post(`/api/avatares/${a.id}/previa`, { confirmar: true }); fecharModal(); }
    catch (exc) { alert("Erro: " + exc.message); fecharModal(); }
    await _avCarregar(container, false);
  });
}
