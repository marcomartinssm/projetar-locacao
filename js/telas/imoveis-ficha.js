// Ficha do imóvel: cabeçalho + abas. Nesta etapa funcionam Dados e Proprietários.

import { sb } from '../supabase.js';
import {
  esc, icone, iniciais, formatarCep, formatarCpfCnpj, formatarData, formatarMoeda, formatarNumeroBR,
  mensagemErro, toast, rotulo, TIPOS_IMOVEL, DESTINACOES, SITUACOES_IMOVEL, CHAVES_LOCAL, TIPOS_DIMOB,
} from '../util.js';
import { limparErros, mostrarErros, mostrarErroForm, ligarMascaras } from '../formulario.js';
import { camposImovel, lerImovel, enderecoImovel, situacaoImovel, textoPercentual, mensagemErroImovel } from '../imovel-form.js';
import { montarEditorProprietarios } from '../componentes/editor-proprietarios.js';

const ABAS = [
  ['dados', 'Dados', true],
  ['proprietarios', 'Proprietários', true],
  ['contas', 'Contas', false],
  ['anuncio', 'Anúncio', false],
  ['anexos', 'Anexos', false],
];

export async function telaImovelFicha(el, id, abaPedida) {
  el.innerHTML = '<div class="carregando">Carregando imóvel…</div>';

  const [imovel, proprietarios] = await Promise.all([
    sb.from('loc_imoveis').select('*').eq('id', id).maybeSingle(),
    sb.from('loc_imoveis_proprietarios')
      .select('id, percentual, cliente:cad_clientes(id, codigo, nome, cpf_cnpj, tipo_pessoa)')
      .eq('imovel_id', id)
      .order('percentual', { ascending: false }),
  ]);

  const erro = imovel.error || proprietarios.error;
  if (erro) {
    el.innerHTML = `<div class="card vazio">${esc(mensagemErro(erro))}</div>`;
    return;
  }
  if (!imovel.data) {
    el.innerHTML = '<div class="card vazio">Imóvel não encontrado. <a href="#/imoveis">Voltar para a lista</a></div>';
    return;
  }

  const ficha = { imovel: imovel.data, proprietarios: proprietarios.data };
  const editar = abaPedida === 'editar';
  const aba = editar ? 'dados' : (ABAS.some(([chave, , pronta]) => chave === abaPedida && pronta) ? abaPedida : 'dados');
  const recarregar = () => telaImovelFicha(el, id, aba);

  el.innerHTML = `${cabecalho(ficha, aba)}<div id="aba-conteudo"></div>`;
  const caixa = el.querySelector('#aba-conteudo');
  if (aba === 'proprietarios') renderProprietarios(caixa, ficha, recarregar);
  else if (editar) renderEditar(caixa, ficha);
  else renderDados(caixa, ficha);
}

// ---------- peças ----------
const dado = (rotuloDado, valor) =>
  `<div class="dado"><span class="rotulo">${rotuloDado}</span><span class="valor">${valor == null || valor === '' ? '<span class="t-faint">—</span>' : esc(valor)}</span></div>`;

const grade = (pares) => `<div class="dados-grade">${pares.map(([r, v]) => dado(r, v)).join('')}</div>`;

const cartao = (titulo, corpo, acao = '') =>
  `<section class="card secao-card"><div class="secao-cabecalho"><h2 class="h-card">${titulo}</h2>${acao}</div>${corpo}</section>`;

function cabecalho({ imovel: i, proprietarios }, aba) {
  const titulo = `${rotulo(TIPOS_IMOVEL, i.tipo)} · ${enderecoImovel(i) || 'Sem endereço'}`;
  const local = [i.bairro, [i.cidade, i.uf].filter(Boolean).join('/')].filter(Boolean).join(', ');
  const selos = [
    i.permite_animais ? `<span class="selo ouro">${icone('paw', 12)}Permite animais</span>` : '',
    i.site_publicar ? `<span class="selo vinho">${icone('globe', 12)}No site</span>` : '',
    i.grupo_olx_publicar ? `<span class="selo vinho">${icone('megaphone', 12)}No Grupo OLX</span>` : '',
  ].join('');

  return `
    <nav class="trilha"><a href="#/imoveis">Imóveis</a>${icone('chevronRight', 14)}<span>Imóvel ${i.codigo}</span></nav>
    <section class="card ficha-topo">
      <span class="capa-imovel">${icone('image', 28)}</span>
      <div class="ficha-info">
        <div class="ficha-nome"><h1>${esc(titulo)}</h1>${situacaoImovel(i.situacao)}</div>
        <div class="ficha-detalhes">
          <span>Código <strong>${i.codigo}</strong></span>
          ${i.codigo_imoview ? `<span>Imoview <strong>${i.codigo_imoview}</strong></span>` : ''}
          ${local ? `<span>${esc(local)}</span>` : ''}
          <span>${esc(rotulo(DESTINACOES, i.destinacao))}</span>
          ${i.valor_aluguel != null ? `<span>Aluguel <strong>${esc(formatarMoeda(i.valor_aluguel))}</strong></span>` : ''}
        </div>
        ${selos ? `<div class="chips-mini">${selos}</div>` : ''}
      </div>
      <a class="btn btn-secundario" href="#/imoveis/${i.id}/editar">${icone('edit')}<span>Editar</span></a>
    </section>
    <div class="abas" role="tablist">
      ${ABAS.map(([chave, texto, pronta]) => {
        if (!pronta) return `<span class="aba desativada" title="Em breve">${texto}</span>`;
        const n = chave === 'proprietarios' ? proprietarios.length : null;
        return `<a role="tab" aria-selected="${chave === aba}" class="aba ${chave === aba ? 'ativa' : ''}" href="#/imoveis/${i.id}/${chave}">${texto}${n ? `<span class="contagem">${n}</span>` : ''}</a>`;
      }).join('')}
    </div>`;
}

// ---------- aba Dados ----------
function renderDados(caixa, { imovel: i }) {
  const simNao = (v) => (v ? 'Sim' : 'Não');
  const m2 = (v) => (v == null ? '' : `${formatarNumeroBR(v, 2).replace(/,00$/, '')} m²`);

  caixa.innerHTML = `
    <div class="grade-cards">
      ${cartao('Identificação', grade([
        ['Tipo', rotulo(TIPOS_IMOVEL, i.tipo)], ['Destinação', rotulo(DESTINACOES, i.destinacao)], ['Situação', rotulo(SITUACOES_IMOVEL, i.situacao)],
        ['Filial', i.unidade], ['Código no Imoview', i.codigo_imoview], ['Vago desde', formatarData(i.vago_desde)],
      ]))}
      ${cartao('Endereço', grade([
        ['CEP', formatarCep(i.cep)], ['Rua', i.logradouro], ['Número', i.numero],
        ['Complemento', i.complemento], ['Bairro', i.bairro], ['Cidade / UF', [i.cidade, i.uf].filter(Boolean).join(' / ')],
        ['Condomínio', i.condominio_nome],
      ]))}
      ${cartao('Características', grade([
        ['Área privativa', m2(i.area_privativa_m2)], ['Área total', m2(i.area_total_m2)], ['Andar', i.andar],
        ['Quartos', i.quartos], ['Suítes', i.suites], ['Banheiros', i.banheiros],
        ['Vagas', i.vagas], ['Mobiliado', simNao(i.mobiliado)], ['Permite animais', simNao(i.permite_animais)],
      ]))}
      ${cartao('Valores', `${grade([
        ['Valor do aluguel', formatarMoeda(i.valor_aluguel)], ['Condomínio (mensal)', formatarMoeda(i.valor_condominio)], ['IPTU (anual)', formatarMoeda(i.valor_iptu_anual)],
        ['Seguro incêndio (anual)', formatarMoeda(i.valor_seguro_incendio_anual)], ['Taxa de administração', textoPercentual(i.taxa_administracao)], ['Taxa de intermediação', textoPercentual(i.taxa_intermediacao)],
      ])}
        <p class="apoio">O IPTU (anual) é a soma dos IPTUs da aba Contas. Os valores viram sugestão quando o contrato for criado.</p>`)}
      ${cartao('Documentação', grade([
        ['Matrícula', i.matricula], ['Cartório', i.cartorio], ['Tipo DIMOB', rotulo(TIPOS_DIMOB, i.tipo_dimob)],
      ]))}
      ${cartao('Chaves e observações', `${grade([
        ['Onde estão as chaves', rotulo(CHAVES_LOCAL, i.chaves_local)], ['Nº do chaveiro', i.chaves_identificador],
      ])}
        ${i.observacoes ? `<p class="texto-livre">${esc(i.observacoes)}</p>` : '<p class="t-faint">Sem observações.</p>'}`)}
    </div>`;
}

function renderEditar(caixa, { imovel: i }) {
  const voltar = () => { location.hash = `#/imoveis/${i.id}/dados`; };

  caixa.innerHTML = `
    <form class="card painel" id="form-imovel" novalidate>
      <h2 class="h-card">Editar imóvel</h2>
      ${camposImovel(i, { completo: true })}
      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primario">${icone('check')}<span>Salvar alterações</span></button>
      </div>
    </form>`;

  const form = caixa.querySelector('#form-imovel');
  ligarMascaras(form);
  form.querySelector('[data-acao="cancelar"]').addEventListener('click', voltar);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    const { dados, erros } = lerImovel(form);
    if (mostrarErros(form, erros)) return;

    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    const { error } = await sb.from('loc_imoveis').update(dados).eq('id', i.id);
    botao.disabled = false;
    if (error) return mostrarErroForm(form, '.erro-form', mensagemErroImovel(error));

    toast('Imóvel salvo.');
    voltar();
  });
}

// ---------- aba Proprietários ----------
function renderProprietarios(caixa, ficha, recarregar, editando = false) {
  const { imovel: i, proprietarios } = ficha;

  if (editando) {
    caixa.innerHTML = `
      <section class="card painel">
        <h2 class="h-card">Editar proprietários</h2>
        <p class="apoio">Cada proprietário é uma ficha do cadastro de clientes e aparece lá como Locador. A soma precisa fechar 100%.</p>
        <div id="editor-proprietarios"></div>
        <p class="erro-form" hidden></p>
        <div class="acoes entre">
          <button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>
          <button type="button" class="btn btn-primario" data-acao="salvar">${icone('check')}<span>Salvar proprietários</span></button>
        </div>
      </section>`;

    const painel = caixa.querySelector('.painel');
    const erro = painel.querySelector('.erro-form');
    const editor = montarEditorProprietarios(
      painel.querySelector('#editor-proprietarios'),
      proprietarios.map((p) => ({ cliente: p.cliente, percentual: Number(p.percentual) })),
    );

    painel.querySelector('[data-acao="cancelar"]').addEventListener('click', () => renderProprietarios(caixa, ficha, recarregar));
    painel.querySelector('[data-acao="salvar"]').addEventListener('click', async (ev) => {
      erro.hidden = true;
      const problema = editor.validar();
      if (problema) {
        erro.textContent = problema;
        erro.hidden = false;
        return;
      }
      const botao = ev.currentTarget;
      botao.disabled = true;
      const { error } = await sb.rpc('loc_salvar_proprietarios', { p_imovel_id: i.id, p_itens: editor.paraSalvar() });
      botao.disabled = false;
      if (error) {
        erro.textContent = mensagemErro(error);
        erro.hidden = false;
        return;
      }
      toast('Proprietários salvos.');
      recarregar();
    });
    return;
  }

  const soma = proprietarios.reduce((total, p) => total + Number(p.percentual), 0);
  const fecha = Math.abs(soma - 100) < 0.0001;

  caixa.innerHTML = `
    <section class="card secao-card">
      <div class="secao-cabecalho">
        <h2 class="h-card">Proprietários do imóvel</h2>
        <button type="button" class="btn btn-secundario btn-peq" data-acao="editar">${icone(proprietarios.length ? 'edit' : 'plus', 14)}<span>${proprietarios.length ? 'Editar proprietários' : 'Adicionar proprietário'}</span></button>
      </div>
      <p class="apoio">Cada proprietário é uma ficha do cadastro de clientes e aparece lá como Locador.</p>
      ${proprietarios.length ? `
        <div class="contatos">
          ${proprietarios.map((p) => `
            <div class="contato">
              <span class="avatar">${esc(iniciais(p.cliente.nome))}</span>
              <div class="contato-info">
                <strong>${esc(p.cliente.nome)}</strong>
                <small>Código ${p.cliente.codigo}${p.cliente.cpf_cnpj ? ` · ${p.cliente.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} ${esc(formatarCpfCnpj(p.cliente.cpf_cnpj))}` : ''}</small>
              </div>
              <div class="prop-barra"><span class="trilho"><i style="width: ${Math.min(100, Number(p.percentual))}%"></i></span><strong>${textoPercentual(p.percentual)}</strong></div>
              <a class="link-abrir" href="#/clientes/${p.cliente.id}">Abrir ficha${icone('arrowUpRight', 14)}</a>
            </div>`).join('')}
        </div>
        <div class="prop-soma"><span class="soma ${fecha ? 'ok' : 'atencao'}">${icone(fecha ? 'check' : 'alert', 14)}Total ${textoPercentual(soma)}${fecha ? '' : ' · precisa fechar 100%'}</span></div>`
        : '<p class="t-faint">Nenhum proprietário cadastrado.</p>'}
    </section>`;

  caixa.querySelector('[data-acao="editar"]').addEventListener('click', () => renderProprietarios(caixa, ficha, recarregar, true));
}
