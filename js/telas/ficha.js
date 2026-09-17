// Ficha do cliente: cabeçalho + abas Dados, Contatos, Contas bancárias, Anexos, Vínculos e Relacionamentos.

import { sb } from '../supabase.js';
import {
  esc, icone, chipRel, iniciais, digitos, formatarCpfCnpj, formatarTelefone, formatarCep, formatarData,
  cpfCnpjValido, emailValido, mensagemErro, toast, badgePrincipal, ESTADOS_CIVIS, TIPOS_TELEFONE,
} from '../util.js';
import {
  campo, select, campoTexto, camposIdentificacao, camposEndereco, lerCampos, limparErros,
  mostrarErros, mostrarErroForm, ligarMascaras, ligarListaProfissoes, guardarProfissao,
  CAMPOS_PF, CAMPOS_PJ, CAMPOS_ENDERECO,
} from '../formulario.js';
import { ligarBuscaCnpj, preencherVazios } from '../consultas.js';
import { renderContasBancarias, SELECT_CONTAS_BANCARIAS } from './cliente-contas.js';
import { renderAnexos } from './cliente-anexos.js';
import { renderVinculos, SELECT_VINCULOS } from './cliente-vinculos.js';
import { renderRelacionamentos } from './cliente-relacionamentos.js';

const ABAS = [
  ['dados', 'Dados'],
  ['contatos', 'Contatos'],
  ['contas', 'Contas bancárias'],
  ['anexos', 'Anexos'],
  ['vinculos', 'Vínculos'],
  ['relacionamentos', 'Relacionamentos'],
  ['auditoria', 'Auditoria'],
];
const ROTULO_ESTADO_CIVIL = Object.fromEntries(ESTADOS_CIVIS);
const ROTULO_TIPO_TELEFONE = Object.fromEntries(TIPOS_TELEFONE);
const TABELA = { telefones: 'cad_clientes_telefones', emails: 'cad_clientes_emails' };

export async function telaFicha(el, id, abaPedida) {
  el.innerHTML = '<div class="carregando">Carregando ficha…</div>';

  const [cliente, telefones, emails, relacionamentos, contasBancarias, anexos, vinculos] = await Promise.all([
    sb.from('cad_clientes').select('*').eq('id', id).maybeSingle(),
    sb.from('cad_clientes_telefones').select('*').eq('cliente_id', id).order('principal', { ascending: false }).order('criado_em'),
    sb.from('cad_clientes_emails').select('*').eq('cliente_id', id).order('principal', { ascending: false }).order('criado_em'),
    sb.from('cad_clientes_relacionamentos').select('*').eq('cliente_id', id),
    sb.from('cad_clientes_contas_bancarias').select(SELECT_CONTAS_BANCARIAS).eq('cliente_id', id).order('principal', { ascending: false }).order('criado_em'),
    sb.from('cad_clientes_anexos').select('*').eq('cliente_id', id).order('criado_em', { ascending: false }),
    sb.from('cad_clientes_vinculos').select(SELECT_VINCULOS).or(`cliente_id.eq.${id},cliente_vinculado_id.eq.${id}`).order('criado_em'),
  ]);

  const erro = [cliente, telefones, emails, relacionamentos, contasBancarias, anexos, vinculos].find((r) => r.error)?.error;
  if (erro) {
    el.innerHTML = `<div class="card vazio">${esc(mensagemErro(erro))}</div>`;
    return;
  }
  if (!cliente.data) {
    el.innerHTML = '<div class="card vazio">Cliente não encontrado. <a href="#/clientes">Voltar para a lista</a></div>';
    return;
  }

  const ficha = {
    cliente: cliente.data,
    telefones: telefones.data,
    emails: emails.data,
    relacionamentos: relacionamentos.data,
    contasBancarias: contasBancarias.data,
    anexos: anexos.data,
    vinculos: vinculos.data,
  };
  const editar = abaPedida === 'editar';
  const aba = editar ? 'dados' : (ABAS.some(([chave]) => chave === abaPedida) ? abaPedida : 'dados');
  const recarregar = () => telaFicha(el, id, aba);

  el.innerHTML = `${cabecalho(ficha, aba)}<div id="aba-conteudo"></div>`;
  const caixa = el.querySelector('#aba-conteudo');
  if (aba === 'contatos') renderContatos(caixa, ficha, recarregar);
  else if (aba === 'contas') renderContasBancarias(caixa, ficha, recarregar);
  else if (aba === 'anexos') renderAnexos(caixa, ficha, recarregar);
  else if (aba === 'vinculos') renderVinculos(caixa, ficha, recarregar);
  else if (aba === 'relacionamentos') renderRelacionamentos(caixa, ficha, recarregar);
  else if (aba === 'auditoria') import('../componentes/auditoria.js').then((m) => m.renderAuditoria(caixa, { entidade: 'cliente', entidadeId: id }));
  else if (editar) renderEditarDados(caixa, ficha);
  else renderDados(caixa, ficha);
}

// ---------- peças ----------
const dado = (rotulo, valor) =>
  `<div class="dado"><span class="rotulo">${rotulo}</span><span class="valor">${valor == null || valor === '' ? '<span class="t-faint">—</span>' : esc(valor)}</span></div>`;

const grade = (pares) => `<div class="dados-grade">${pares.map(([rotulo, valor]) => dado(rotulo, valor)).join('')}</div>`;

const cartao = (titulo, corpo, acao = '') =>
  `<section class="card secao-card"><div class="secao-cabecalho"><h2 class="h-card">${titulo}</h2>${acao}</div>${corpo}</section>`;

const juntar = (...partes) => partes.filter(Boolean).join(' / ');

function cabecalho(ficha, aba) {
  const c = ficha.cliente;
  const pj = c.tipo_pessoa === 'PJ';
  const tiposAtivos = [...new Set(ficha.relacionamentos.filter((r) => r.ativo).map((r) => r.tipo))];
  const contagem = {
    contatos: ficha.telefones.length + ficha.emails.length,
    contas: ficha.contasBancarias.filter((conta) => conta.ativo).length,
    anexos: ficha.anexos.length,
    vinculos: ficha.vinculos.length,
    relacionamentos: tiposAtivos.length,
  };

  return `
    <nav class="trilha"><a href="#/clientes">Clientes</a>${icone('chevronRight', 14)}<span>${esc(c.nome)}</span></nav>
    <section class="card ficha-topo">
      <span class="avatar grande">${esc(iniciais(c.nome))}</span>
      <div class="ficha-info">
        <div class="ficha-nome">
          <h1>${esc(c.nome)}</h1>
          <span class="status ${c.ativo ? '' : 'inativo'}"><i></i>${c.ativo ? 'Ativo' : 'Inativo'}</span>
        </div>
        <div class="ficha-detalhes">
          <span>Código <strong>${c.codigo}</strong></span>
          <span>${pj ? 'Pessoa jurídica' : 'Pessoa física'}</span>
          <span>${pj ? 'CNPJ' : 'CPF'} <strong>${c.cpf_cnpj ? esc(formatarCpfCnpj(c.cpf_cnpj)) : '—'}</strong></span>
          <span>Cadastrado em <strong>${formatarData(c.criado_em)}</strong></span>
        </div>
        <div class="chips-mini">${tiposAtivos.length ? tiposAtivos.map(chipRel).join('') : '<small class="t-faint">Sem relacionamentos</small>'}</div>
      </div>
      <a class="btn btn-secundario" href="#/clientes/${c.id}/editar">${icone('edit')}<span>Editar</span></a>
    </section>
    <div class="abas" role="tablist">
      ${ABAS.map(([chave, rotulo]) => {
        const n = contagem[chave];
        return `<a role="tab" aria-selected="${chave === aba}" class="aba ${chave === aba ? 'ativa' : ''}" href="#/clientes/${c.id}/${chave}">${rotulo}${n ? `<span class="contagem">${n}</span>` : ''}</a>`;
      }).join('')}
    </div>`;
}

// ---------- aba Dados ----------
function renderDados(caixa, ficha) {
  const c = ficha.cliente;
  const pj = c.tipo_pessoa === 'PJ';

  const identificacao = pj
    ? [['Razão social', c.nome], ['Nome fantasia', c.nome_fantasia], ['CNPJ', formatarCpfCnpj(c.cpf_cnpj)],
       ['Inscrição estadual', c.inscricao_estadual], ['Inscrição municipal', c.inscricao_municipal], ['Data de fundação', formatarData(c.data_fundacao)]]
    : [['Nome completo', c.nome], ['CPF', formatarCpfCnpj(c.cpf_cnpj)], ['RG', c.rg],
       ['Órgão emissor / UF', juntar(c.rg_orgao_emissor, c.rg_uf)], ['Data de nascimento', formatarData(c.data_nascimento)], ['Código no Imoview', c.codigo_imoview]];

  const endereco = [['CEP', formatarCep(c.cep)], ['Rua', c.logradouro], ['Número', c.numero],
    ['Complemento', c.complemento], ['Bairro', c.bairro], ['Cidade / UF', juntar(c.cidade, c.uf)]];

  caixa.innerHTML = `
    <div class="grade-cards">
      ${cartao(pj ? 'Empresa' : 'Identificação', grade(identificacao))}
      ${pj ? '' : cartao('Informações pessoais', `${grade([['Nacionalidade', c.nacionalidade], ['Estado civil', ROTULO_ESTADO_CIVIL[c.estado_civil]], ['Profissão', c.profissao]])}
        <p class="apoio">O cônjuge tem ficha própria e aparece na aba <a href="#/clientes/${c.id}/vinculos">Vínculos</a>.</p>`)}
      ${cartao('Endereço', grade(endereco))}
      ${cartao('Observações', c.observacoes ? `<p class="texto-livre">${esc(c.observacoes)}</p>` : '<p class="t-faint">Sem observações.</p>')}
    </div>`;
}

function renderEditarDados(caixa, ficha) {
  const c = ficha.cliente;
  const pj = c.tipo_pessoa === 'PJ';
  const doc = pj ? 'CNPJ' : 'CPF';
  const voltar = () => { location.hash = `#/clientes/${c.id}/dados`; };

  caixa.innerHTML = `
    <form class="card painel" id="form-dados" novalidate>
      <h2 class="h-card">Editar dados</h2>
      <h3 class="h-secao">${pj ? 'Empresa' : 'Identificação'}</h3>
      ${camposIdentificacao(pj, c, { comDocumento: true })}
      <h3 class="h-secao">Endereço</h3>
      ${camposEndereco(c)}
      <h3 class="h-secao">Outros</h3>
      ${campoTexto('observacoes', 'Observações', c.observacoes)}
      <label class="check"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}><span>Cliente ativo</span></label>
      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primario">${icone('check')}<span>Salvar alterações</span></button>
      </div>
    </form>`;

  const form = caixa.querySelector('#form-dados');
  ligarMascaras(form);
  ligarListaProfissoes(form);
  if (pj) ligarBuscaCnpj(form.elements.namedItem('cpf_cnpj'), (empresa) => preencherVazios(form, empresa));
  form.elements.namedItem('nome').focus();
  form.querySelector('[data-acao="cancelar"]').addEventListener('click', voltar);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);

    const dados = lerCampos(form, [...(pj ? CAMPOS_PJ : CAMPOS_PF), ...CAMPOS_ENDERECO, 'observacoes', 'cpf_cnpj']);
    dados.cpf_cnpj = dados.cpf_cnpj ? digitos(dados.cpf_cnpj) : null;
    dados.cep = dados.cep ? digitos(dados.cep) : null;
    dados.ativo = form.elements.namedItem('ativo').checked;

    const erros = {};
    if (!dados.nome) erros.nome = pj ? 'Informe a razão social.' : 'Informe o nome.';
    if (dados.cpf_cnpj && dados.cpf_cnpj.length !== (pj ? 14 : 11)) erros.cpf_cnpj = `${doc} deve ter ${pj ? 14 : 11} números.`;
    else if (dados.cpf_cnpj && !cpfCnpjValido(dados.cpf_cnpj)) erros.cpf_cnpj = `${doc} inválido. Confira os números.`;
    if (dados.cep && dados.cep.length !== 8) erros.cep = 'CEP deve ter 8 números.';
    if (mostrarErros(form, erros)) return;

    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    const { error } = await sb.from('cad_clientes').update(dados).eq('id', c.id);
    botao.disabled = false;
    if (error) return mostrarErroForm(form, '.erro-form', mensagemErro(error));

    await guardarProfissao(dados.profissao);
    toast('Dados salvos.');
    voltar();
  });
}

// ---------- aba Contatos ----------
function renderContatos(caixa, ficha, recarregar, editando = null) {
  const botaoNovo = (lista) =>
    `<button type="button" class="btn btn-secundario btn-peq" data-novo="${lista}">${icone('plus', 14)}<span>Adicionar</span></button>`;

  caixa.innerHTML = `
    <div class="grade-cards">
      ${cartao('Telefones', listaTelefones(ficha, editando), botaoNovo('telefones'))}
      ${cartao('E-mails', listaEmails(ficha, editando), botaoNovo('emails'))}
    </div>`;

  ligarMascaras(caixa);
  caixa.querySelector('.form-inline input')?.focus();

  caixa.onclick = (ev) => {
    const botao = ev.target.closest('button');
    if (!botao || botao.type === 'submit') return;
    const d = botao.dataset;
    if (d.novo) renderContatos(caixa, ficha, recarregar, { lista: d.novo, id: 'novo' });
    else if (d.editar) renderContatos(caixa, ficha, recarregar, { lista: d.editar, id: d.id });
    else if ('cancelar' in d) renderContatos(caixa, ficha, recarregar);
    else if (d.excluir) excluirItem(d.excluir, d.id, ficha, recarregar);
    else if (d.tornarPrincipal) tornarPrincipal(d.tornarPrincipal, d.id, ficha, recarregar);
  };
  caixa.onsubmit = (ev) => {
    ev.preventDefault();
    salvarItem(ev.target, ficha, recarregar);
  };
}

const acoesItem = (lista, item) => `
      <div class="contato-acoes">
        ${item.principal ? '' : `<button type="button" class="link-acao" data-tornar-principal="${lista}" data-id="${item.id}">Tornar principal</button>`}
        <button type="button" class="icon-btn" data-editar="${lista}" data-id="${item.id}" aria-label="Editar">${icone('edit')}</button>
        <button type="button" class="icon-btn" data-excluir="${lista}" data-id="${item.id}" aria-label="Excluir">${icone('trash')}</button>
      </div>`;

const campoPrincipal = (item) => (item.principal
  ? '<span class="t-muted form-nota">É o principal.</span><input type="hidden" name="principal" value="sim">'
  : '<label class="check"><input type="checkbox" name="principal"><span>Tornar principal</span></label>');

const botoesForm = `
      <p class="erro-form" hidden></p>
      <div class="acoes">
        <button type="button" class="btn btn-secundario btn-peq" data-cancelar>Cancelar</button>
        <button type="submit" class="btn btn-primario btn-peq">Salvar</button>
      </div>`;

function formTelefone(t) {
  return `
    <form class="form-inline" data-form="telefones" data-id="${t.id ?? 'novo'}" novalidate>
      <div class="grade-2">
        ${campo('numero', 'Telefone *', formatarTelefone(t.numero), { tipo: 'tel', mascara: 'telefone', placeholder: '(48) 99999-9999', inputmode: 'numeric' })}
        ${select('tipo', 'Tipo', TIPOS_TELEFONE, t.tipo, { vazio: false })}
        ${campo('observacao', 'Observação', t.observacao, { placeholder: 'ex.: recados', largo: true })}
      </div>
      <div class="checks-linha">
        <label class="check"><input type="checkbox" name="whatsapp" ${t.whatsapp ? 'checked' : ''} disabled><span>WhatsApp <small class="t-muted">(conferido sozinho)</small></span></label>
        ${campoPrincipal(t)}
      </div>
      ${botoesForm}
    </form>`;
}

function formEmail(e) {
  return `
    <form class="form-inline" data-form="emails" data-id="${e.id ?? 'novo'}" novalidate>
      <div class="grade-2">
        ${campo('email', 'E-mail *', e.email, { tipo: 'email', placeholder: 'nome@exemplo.com.br' })}
        ${campo('observacao', 'Observação', e.observacao, { placeholder: 'ex.: financeiro' })}
      </div>
      <div class="checks-linha">${campoPrincipal(e)}</div>
      ${botoesForm}
    </form>`;
}

function listaTelefones(ficha, ed) {
  const linhas = ficha.telefones.map((t) => (ed?.lista === 'telefones' && ed.id === t.id ? formTelefone(t) : `
    <div class="contato">
      <span class="contato-icone ${t.whatsapp ? 'whats' : ''}">${icone(t.whatsapp ? 'whatsapp' : 'phone', 18)}</span>
      <div class="contato-info">
        <div><strong>${esc(formatarTelefone(t.numero))}</strong>${t.principal ? badgePrincipal : ''}</div>
        <small>${[ROTULO_TIPO_TELEFONE[t.tipo], t.whatsapp ? 'WhatsApp' : '', t.observacao].filter(Boolean).map(esc).join(' · ')}</small>
      </div>
      ${acoesItem('telefones', t)}
    </div>`)).join('');
  const novo = ed?.lista === 'telefones' && ed.id === 'novo'
    ? formTelefone({ tipo: 'celular', whatsapp: false, principal: ficha.telefones.length === 0 })
    : '';
  return `<div class="contatos">${novo}${linhas}${!linhas && !novo ? '<p class="t-faint">Nenhum telefone.</p>' : ''}</div>`;
}

function listaEmails(ficha, ed) {
  const linhas = ficha.emails.map((e) => (ed?.lista === 'emails' && ed.id === e.id ? formEmail(e) : `
    <div class="contato">
      <span class="contato-icone">${icone('mail', 18)}</span>
      <div class="contato-info">
        <div><strong>${esc(e.email)}</strong>${e.principal ? badgePrincipal : ''}</div>
        ${e.observacao ? `<small>${esc(e.observacao)}</small>` : ''}
      </div>
      ${acoesItem('emails', e)}
    </div>`)).join('');
  const novo = ed?.lista === 'emails' && ed.id === 'novo' ? formEmail({ principal: ficha.emails.length === 0 }) : '';
  return `<div class="contatos">${novo}${linhas}${!linhas && !novo ? '<p class="t-faint">Nenhum e-mail.</p>' : ''}</div>`;
}

async function salvarItem(form, ficha, recarregar) {
  const lista = form.dataset.form;
  const id = form.dataset.id;
  const tabela = TABELA[lista];
  const itens = ficha[lista];
  const valor = (nome) => form.elements.namedItem(nome).value.trim();
  limparErros(form);

  const erros = {};
  let dados;
  if (lista === 'telefones') {
    const numero = digitos(valor('numero'));
    if (numero.length < 10 || numero.length > 11) erros.numero = 'Informe o telefone com DDD.';
    dados = { numero, tipo: valor('tipo'), whatsapp: form.elements.namedItem('whatsapp').checked, observacao: valor('observacao') || null };
  } else {
    const email = valor('email').toLowerCase();
    if (!emailValido(email)) erros.email = 'E-mail inválido.';
    dados = { email, observacao: valor('observacao') || null };
  }
  if (mostrarErros(form, erros)) return;

  const marcaPrincipal = form.elements.namedItem('principal');
  dados.principal = marcaPrincipal.type === 'checkbox' ? marcaPrincipal.checked : true;
  const antigoPrincipal = dados.principal ? itens.find((i) => i.principal && i.id !== id) : null;

  const botao = form.querySelector('[type="submit"]');
  botao.disabled = true;

  // Só pode haver um principal: desmarca o antigo antes de salvar o novo.
  if (antigoPrincipal) {
    const { error } = await sb.from(tabela).update({ principal: false }).eq('id', antigoPrincipal.id);
    if (error) {
      botao.disabled = false;
      return mostrarErroForm(form, '.erro-form', mensagemErro(error));
    }
  }

  const { error } = id === 'novo'
    ? await sb.from(tabela).insert({ ...dados, cliente_id: ficha.cliente.id })
    : await sb.from(tabela).update(dados).eq('id', id);

  if (error) {
    if (antigoPrincipal) await sb.from(tabela).update({ principal: true }).eq('id', antigoPrincipal.id);
    botao.disabled = false;
    return mostrarErroForm(form, '.erro-form', mensagemErro(error));
  }

  toast(lista === 'telefones' ? 'Telefone salvo.' : 'E-mail salvo.');
  recarregar();
}

async function excluirItem(lista, id, ficha, recarregar) {
  const tabela = TABELA[lista];
  const itens = ficha[lista];
  const item = itens.find((i) => i.id === id);

  if (lista === 'telefones' && itens.length === 1) {
    toast('O cliente precisa ter pelo menos um telefone.', 'erro');
    return;
  }
  const descricao = lista === 'telefones' ? formatarTelefone(item.numero) : item.email;
  if (!window.confirm(`Excluir ${descricao}?`)) return;

  const { error } = await sb.from(tabela).delete().eq('id', id);
  if (error) {
    toast(mensagemErro(error), 'erro');
    return;
  }
  const substituto = item.principal ? itens.find((i) => i.id !== id) : null;
  if (substituto) await sb.from(tabela).update({ principal: true }).eq('id', substituto.id);

  toast(lista === 'telefones' ? 'Telefone excluído.' : 'E-mail excluído.');
  recarregar();
}

async function tornarPrincipal(lista, id, ficha, recarregar) {
  const tabela = TABELA[lista];
  const antigo = ficha[lista].find((i) => i.principal);

  if (antigo) {
    const { error } = await sb.from(tabela).update({ principal: false }).eq('id', antigo.id);
    if (error) {
      toast(mensagemErro(error), 'erro');
      return;
    }
  }
  const { error } = await sb.from(tabela).update({ principal: true }).eq('id', id);
  if (error) {
    if (antigo) await sb.from(tabela).update({ principal: true }).eq('id', antigo.id);
    toast(mensagemErro(error), 'erro');
    return;
  }
  recarregar();
}
