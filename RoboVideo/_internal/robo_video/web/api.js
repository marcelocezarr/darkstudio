// Cliente HTTP simples para a API local (mesmo host/porta que serve o painel).

const Api = {
  async _tratar(resp) {
    if (!resp.ok) {
      let msg = `erro ${resp.status}`;
      try {
        const corpo = await resp.json();
        msg = corpo.detail || msg;
      } catch (_) { /* ignora */ }
      throw new Error(msg);
    }
    if (resp.status === 204) return null;
    return resp.json();
  },

  get(caminho) {
    return fetch(caminho).then(this._tratar);
  },

  post(caminho, corpo) {
    return fetch(caminho, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo || {}),
    }).then(this._tratar);
  },

  put(caminho, corpo) {
    return fetch(caminho, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo || {}),
    }).then(this._tratar);
  },

  del(caminho) {
    return fetch(caminho, { method: "DELETE" }).then(this._tratar);
  },

  // POST multipart (usado so por /api/producoes)
  postForm(caminho, formData) {
    return fetch(caminho, { method: "POST", body: formData }).then(this._tratar);
  },

  // POST multipart via XMLHttpRequest, com callback de progresso de upload
  // (0-100). Usado pelo envio de audio do rascunho (arquivos grandes).
  postFormComProgresso(caminho, formData, aoProgredir) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", caminho);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && aoProgredir) aoProgredir(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = () => {
        let corpo = null;
        try { corpo = JSON.parse(xhr.responseText); } catch (_) { /* ignora */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(corpo);
        else reject(new Error((corpo && corpo.detail) || `erro ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error("falha de rede no envio"));
      xhr.send(formData);
    });
  },
};
