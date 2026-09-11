// Peças de formulário reaproveitadas no cadastro e na edição da ficha.

import {
  esc, formatarCpfCnpj, formatarCep, UFS, ESTADOS_CIVIS,
  aplicarMascaraTelefone, aplicarMascaraCpfCnpj, aplicarMascaraCep,
} from './util.js';

export const CAMPOS_PF = ['nome', 'rg', 'rg_orgao_emissor', 'rg_uf', 'data_nascimento', 'nacionalidade', 'estado_civil', 'profissao'];
export const CAMPOS_PJ = ['nome', 'nome_fantasia', 'inscricao_estadual', 'inscricao_municipal', 'data_fundacao'];
export const CAMPOS_ENDERECO = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];

export function campo(nome, rotulo, valor = '', o = {}) {
  const extras = [
    o.placeholder ? `placeholder="${esc(o.placeholder)}"` : '',
    o.inputmode ? `inputmode="${o.inputmode}"` : '',
    o.maxlength ? `maxlength="${o.maxlength}"` : '',
    o.mascara ? `data-mascara="${o.mascara}"` : '',
    o.autocomplete ? `autocomplete="${o.autocomplete}"` : '',
  ].filter(Boolean).join(' ');
  return `<div class="campo ${o.largo ? 'largo' : ''}" data-campo="${nome}">
      <label for="f-${nome}">${rotulo}</label>
      <input id="f-${nome}" name="${nome}" type="${o.tipo || 'text'}" value="${esc(valor ?? '')}" ${extras}>
      <span class="erro-campo" hidden></span>
    </div>`;
}

export function select(nome, rotulo, opcoes, valor = '', o = {}) {
  return `<div class="campo ${o.largo ? 'largo' : ''}" data-campo="${nome}">
      <label for="f-${nome}">${rotulo}</label>
      <select id="f-${nome}" name="${nome}">
        ${o.vazio === false ? '' : '<option value="">—</option>'}
        ${opcoes.map(([v, r]) => `<option value="${esc(v)}"${String(valor ?? '') === v ? ' selected' : ''}>${esc(r)}</option>`).join('')}
      </select>
      <span class="erro-campo" hidden></span>
    </div>`;
}

export function campoTexto(nome, rotulo, valor = '') {
  return `<div class="campo largo-total" data-campo="${nome}">
      <label for="f-${nome}">${rotulo}</label>
      <textarea id="f-${nome}" name="${nome}" rows="3">${esc(valor ?? '')}</textarea>
      <span class="erro-campo" hidden></span>
    </div>`;
}

export function camposIdentificacao(pj, c = {}, { comDocumento = false } = {}) {
  if (pj) {
    return `<div class="grade-3">
      ${campo('nome', 'Razão social *', c.nome, { largo: true })}
      ${campo('nome_fantasia', 'Nome fantasia', c.nome_fantasia)}
      ${comDocumento ? campo('cpf_cnpj', 'CNPJ', formatarCpfCnpj(c.cpf_cnpj), { mascara: 'cpf_cnpj', placeholder: '00.000.000/0000-00', inputmode: 'numeric' }) : ''}
      ${campo('inscricao_estadual', 'Inscrição estadual', c.inscricao_estadual)}
      ${campo('inscricao_municipal', 'Inscrição municipal', c.inscricao_municipal)}
      ${campo('data_fundacao', 'Data de fundação', c.data_fundacao, { tipo: 'date' })}
    </div>`;
  }
  return `<div class="grade-3">
      ${campo('nome', 'Nome completo *', c.nome, { largo: true })}
      ${comDocumento ? campo('cpf_cnpj', 'CPF', formatarCpfCnpj(c.cpf_cnpj), { mascara: 'cpf_cnpj', placeholder: '000.000.000-00', inputmode: 'numeric' }) : ''}
      ${campo('rg', 'RG', c.rg)}
      ${campo('rg_orgao_emissor', 'Órgão emissor', c.rg_orgao_emissor, { placeholder: 'SSP' })}
      ${select('rg_uf', 'UF do RG', UFS.map((u) => [u, u]), c.rg_uf)}
      ${campo('data_nascimento', 'Data de nascimento', c.data_nascimento, { tipo: 'date' })}
      ${campo('nacionalidade', 'Nacionalidade', c.nacionalidade)}
      ${select('estado_civil', 'Estado civil', ESTADOS_CIVIS, c.estado_civil)}
      ${campo('profissao', 'Profissão', c.profissao)}
    </div>`;
}

export function camposEndereco(c = {}) {
  return `<div class="grade-3">
      ${campo('cep', 'CEP', formatarCep(c.cep), { mascara: 'cep', placeholder: '00000-000', inputmode: 'numeric' })}
      ${campo('logradouro', 'Rua', c.logradouro, { largo: true })}
      ${campo('numero', 'Número', c.numero)}
      ${campo('complemento', 'Complemento', c.complemento)}
      ${campo('bairro', 'Bairro', c.bairro)}
      ${campo('cidade', 'Cidade', c.cidade)}
      ${select('uf', 'UF', UFS.map((u) => [u, u]), c.uf)}
    </div>`;
}

export function lerCampos(form, nomes) {
  const dados = {};
  for (const nome of nomes) {
    const el = form.elements.namedItem(nome);
    if (!el) continue;
    const valor = el.value.trim();
    dados[nome] = valor === '' ? null : valor;
  }
  return dados;
}

export function limparErros(form) {
  form.querySelectorAll('.erro-campo').forEach((e) => { e.hidden = true; e.textContent = ''; });
  form.querySelectorAll('.campo.com-erro').forEach((c) => c.classList.remove('com-erro'));
  form.querySelectorAll('.erro-form').forEach((e) => { e.hidden = true; });
}

// Marca os campos com erro. Devolve true se houve algum erro.
export function mostrarErros(form, erros) {
  const chaves = Object.keys(erros);
  for (const chave of chaves) {
    const bloco = form.querySelector(`[data-campo="${chave}"]`);
    if (!bloco) continue;
    bloco.classList.add('com-erro');
    const aviso = bloco.querySelector('.erro-campo');
    aviso.textContent = erros[chave];
    aviso.hidden = false;
  }
  if (chaves.length) form.querySelector(`[data-campo="${chaves[0]}"] input, [data-campo="${chaves[0]}"] select`)?.focus();
  return chaves.length > 0;
}

export function mostrarErroForm(form, seletor, mensagem) {
  const aviso = form.querySelector(seletor);
  aviso.textContent = mensagem;
  aviso.hidden = false;
}

const MASCARAS = { telefone: aplicarMascaraTelefone, cpf_cnpj: aplicarMascaraCpfCnpj, cep: aplicarMascaraCep };

export function ligarMascaras(raiz) {
  raiz.querySelectorAll('[data-mascara]').forEach((input) => {
    const aplicar = MASCARAS[input.dataset.mascara];
    if (!aplicar || input.dataset.mascaraLigada) return;
    input.addEventListener('input', () => { input.value = aplicar(input.value); });
    input.dataset.mascaraLigada = '1';
  });
}
