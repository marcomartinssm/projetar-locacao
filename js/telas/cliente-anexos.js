// Aba Anexos do cliente. Os arquivos ficam no espaço privado "anexos" do Supabase,
// na pasta clientes/<id do cliente>/. Só a equipe autorizada vê e envia.

import { sb } from '../supabase.js';
import { esc, icone, formatarData, mensagemErro, toast } from '../util.js';

export const TIPOS_ANEXO = [
  ['rg', 'RG'], ['cnh', 'CNH'], ['cpf', 'CPF'], ['comprovante_residencia', 'Comprovante de residência'],
  ['comprovante_renda', 'Comprovante de renda'], ['contrato_social', 'Contrato social'],
  ['certidao_casamento', 'Certidão de casamento'], ['procuracao', 'Procuração'], ['outro', 'Outro'],
];

const ESPACO = 'anexos';
const ACEITOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const LIMITE_BYTES = 20 * 1024 * 1024;

const rotuloTipo = (tipo) => (TIPOS_ANEXO.find(([v]) => v === tipo) || [tipo, 'Outro'])[1];

const nomeSeguro = (nome) => nome
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(-80) || 'arquivo';

const nomeOriginal = (caminho) => caminho.split('/').pop().replace(/^[0-9a-f-]{36}-/, '');

const tipoDoArquivo = (arquivo) => arquivo.type || (/\.heic$/i.test(arquivo.name) ? 'image/heic' : '');

export function renderAnexos(caixa, ficha, recarregar) {
  const anexos = ficha.anexos;

  caixa.innerHTML = `
    <section class="card secao-card">
      <div class="secao-cabecalho"><h2 class="h-card">Documentos</h2></div>
      <div class="anexo-envio">
        <div class="campo">
          <label for="f-anexo-tipo">Tipo do documento</label>
          <select id="f-anexo-tipo">${TIPOS_ANEXO.map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select>
        </div>
        <div class="campo">
          <label for="f-anexo-descricao">Descrição <small class="t-muted">(opcional)</small></label>
          <input id="f-anexo-descricao" placeholder="ex.: frente e verso">
        </div>
      </div>
      <label class="zona-upload" for="f-anexo-arquivo">
        ${icone('upload', 24)}
        <strong>Arraste os arquivos aqui ou clique para enviar</strong>
        <small>PDF, JPG, PNG, WEBP ou HEIC · até 20 MB cada</small>
        <input id="f-anexo-arquivo" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" hidden>
      </label>
      <p class="anexo-progresso" hidden></p>
      ${anexos.length ? `
        <div class="anexos-grade">
          ${anexos.map((a) => `
            <div class="anexo-card">
              <span class="anexo-icone">${icone(/\.pdf$/i.test(a.arquivo_path) ? 'file' : 'image', 22)}</span>
              <div class="anexo-info">
                <span class="anexo-tipo">${esc(rotuloTipo(a.tipo))}</span>
                <strong title="${esc(nomeOriginal(a.arquivo_path))}">${esc(a.descricao || nomeOriginal(a.arquivo_path))}</strong>
                <small>Enviado em ${formatarData(a.criado_em)}</small>
              </div>
              <div class="contato-acoes">
                <button type="button" class="icon-btn" data-ver="${a.id}" aria-label="Ver">${icone('eye')}</button>
                <button type="button" class="icon-btn" data-baixar="${a.id}" aria-label="Baixar">${icone('download')}</button>
                <button type="button" class="icon-btn" data-excluir="${a.id}" aria-label="Excluir">${icone('trash')}</button>
              </div>
            </div>`).join('')}
        </div>` : '<p class="t-faint">Nenhum documento enviado ainda.</p>'}
    </section>`;

  const zona = caixa.querySelector('.zona-upload');
  const entrada = caixa.querySelector('#f-anexo-arquivo');
  const progresso = caixa.querySelector('.anexo-progresso');

  const enviarLista = (lista) => {
    if (!lista?.length) return;
    enviar([...lista], {
      clienteId: ficha.cliente.id,
      tipo: caixa.querySelector('#f-anexo-tipo').value,
      descricao: caixa.querySelector('#f-anexo-descricao').value.trim() || null,
      progresso,
      recarregar,
    });
  };

  entrada.addEventListener('change', () => enviarLista(entrada.files));
  zona.addEventListener('dragover', (ev) => { ev.preventDefault(); zona.classList.add('arrastando'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
  zona.addEventListener('drop', (ev) => {
    ev.preventDefault();
    zona.classList.remove('arrastando');
    enviarLista(ev.dataTransfer.files);
  });

  caixa.onclick = (ev) => {
    const botao = ev.target.closest('button');
    if (!botao) return;
    const anexo = anexos.find((a) => a.id === (botao.dataset.ver || botao.dataset.baixar || botao.dataset.excluir));
    if (!anexo) return;
    if (botao.dataset.ver) abrir(anexo);
    else if (botao.dataset.baixar) baixar(anexo);
    else if (botao.dataset.excluir) excluir(anexo, recarregar);
  };
}

async function enviar(arquivos, { clienteId, tipo, descricao, progresso, recarregar }) {
  const recusados = [];
  const validos = arquivos.filter((arquivo) => {
    if (!ACEITOS.includes(tipoDoArquivo(arquivo))) { recusados.push(`${arquivo.name}: tipo não aceito`); return false; }
    if (arquivo.size > LIMITE_BYTES) { recusados.push(`${arquivo.name}: maior que 20 MB`); return false; }
    return true;
  });

  let enviados = 0;
  for (const [i, arquivo] of validos.entries()) {
    progresso.hidden = false;
    progresso.textContent = `Enviando ${i + 1} de ${validos.length}: ${arquivo.name}…`;

    const caminho = `clientes/${clienteId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
    const envio = await sb.storage.from(ESPACO).upload(caminho, arquivo, { contentType: tipoDoArquivo(arquivo), upsert: false });
    if (envio.error) {
      recusados.push(`${arquivo.name}: ${mensagemErro(envio.error)}`);
      continue;
    }

    const registro = await sb.from('cad_clientes_anexos').insert({ cliente_id: clienteId, tipo, descricao, arquivo_path: caminho });
    if (registro.error) {
      await sb.storage.from(ESPACO).remove([caminho]);
      recusados.push(`${arquivo.name}: ${mensagemErro(registro.error)}`);
      continue;
    }
    enviados += 1;
  }

  progresso.hidden = true;
  if (recusados.length) toast(`Não enviados: ${recusados.join(' · ')}`, 'erro');
  if (enviados) {
    toast(enviados === 1 ? 'Documento enviado.' : `${enviados} documentos enviados.`);
    recarregar();
  }
}

async function abrir(anexo) {
  // Abre a aba antes de buscar o link, para o navegador não bloquear a janela.
  const janela = window.open('', '_blank');
  const { data, error } = await sb.storage.from(ESPACO).createSignedUrl(anexo.arquivo_path, 60);
  if (error || !data?.signedUrl) {
    janela?.close();
    toast(error ? mensagemErro(error) : 'Não foi possível abrir o documento.', 'erro');
    return;
  }
  if (janela) {
    janela.opener = null;
    janela.location.href = data.signedUrl;
  } else {
    window.location.assign(data.signedUrl);
  }
}

async function baixar(anexo) {
  const { data, error } = await sb.storage.from(ESPACO)
    .createSignedUrl(anexo.arquivo_path, 60, { download: nomeOriginal(anexo.arquivo_path) });
  if (error || !data?.signedUrl) {
    toast(error ? mensagemErro(error) : 'Não foi possível baixar o documento.', 'erro');
    return;
  }
  const link = document.createElement('a');
  link.href = data.signedUrl;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function excluir(anexo, recarregar) {
  const nome = anexo.descricao || nomeOriginal(anexo.arquivo_path);
  if (!window.confirm(`Excluir o documento "${nome}"? O arquivo será apagado.`)) return;

  const arquivo = await sb.storage.from(ESPACO).remove([anexo.arquivo_path]);
  if (arquivo.error) return toast(mensagemErro(arquivo.error), 'erro');

  const { error } = await sb.from('cad_clientes_anexos').delete().eq('id', anexo.id);
  if (error) return toast(mensagemErro(error), 'erro');

  toast('Documento excluído.');
  recarregar();
}
