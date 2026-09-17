// Ficha da negociação: resumo, conferência das fichas para o contrato, situação e auditoria.

import { sb } from '../supabase.js';
import {
  esc, icone, iniciais, formatarCpfCnpj, formatarData, formatarMoeda, mensagemErro, toast, rotulo, listaTexto,
  GARANTIAS, DESTINACOES, SITUACOES_NEGOCIACAO,
} from '../util.js';
import { textoPercentual } from '../imovel-form.js';
import { carregarImovelNegociacao, tituloImovel } from '../componentes/escolha-imovel.js';
import { montarFormNegociacao, carregarEquipe } from '../negociacao-form.js';
import { situacaoNegociacao } from './negociacoes-lista.js';

const ABAS = [['resumo', 'Resumo'], ['auditoria', 'Auditoria']];
const CLIENTE = 'id, codigo, nome, cpf_cnpj, tipo_pessoa';

export async function telaNegociacaoFicha(el, id, abaPedida) {
  el.innerHTML = '<div class="carregando">Carregando negociação…</div>';

  const [negociacao, pessoas, equipe] = await Promise.all([
    sb.from('loc_negociacoes')
      .select(`*, locatario:cad_clientes!loc_negociacoes_locatario_cliente_id_fkey(${CLIENTE})`)
      .eq('id', id).maybeSingle(),
    sb.from('loc_negociacoes_pessoas')
      .select(`id, papel, cliente:cad_clientes(${CLIENTE})`)
      .eq('negociacao_id', id).order('criado_em'),
    carregarEquipe().then((data) => ({ data }), (error) => ({ error })),
  ]);

  const erro = negociacao.error || pessoas.error || equipe.error;
  if (erro) {
    el.innerHTML = `<div class="card vazio">${esc(mensagemErro(erro))}</div>`;
    return;
  }
  if (!negociacao.data) {
    el.innerHTML = '<div class="card vazio">Negociação não encontrada. <a href="#/negociacoes">Voltar para a lista</a></div>';
    return;
  }

  let imovel;
  try {
    imovel = await carregarImovelNegociacao(negociacao.data.imovel_id);
  } catch (error) {
    el.innerHTML = `<div class="card vazio">${esc(mensagemErro(error))}</div>`;
    return;
  }

  const ficha = { n: negociacao.data, pessoas: pessoas.data, equipe: equipe.data, imovel };
  const editar = abaPedida === 'editar' && ['em_negociacao', 'fechada'].includes(ficha.n.situacao);
  const aba = ABAS.some(([chave]) => chave === abaPedida) ? abaPedida : 'resumo';
  const recarregar = () => telaNegociacaoFicha(el, id, aba);

  el.innerHTML = `${cabecalho(ficha, editar ? null : aba)}<div id="aba-conteudo" class="pilha"></div>`;
  ligarAcoes(el, ficha, recarregar);

  const caixa = el.querySelector('#aba-conteudo');
  if (editar) renderEditar(caixa, ficha);
  else if (aba === 'auditoria') import('../componentes/auditoria.js').then((m) => m.renderAuditoria(caixa, { entidade: 'negociacao', entidadeId: id }));
  else renderResumo(caixa, ficha);
}

// ---------- cabeçalho ----------
function cabecalho({ n, imovel }, aba) {
  const aberta = ['em_negociacao', 'fechada'].includes(n.situacao);
  const botoes = [];
  if (aberta) botoes.push(`<a class="btn btn-secundario" href="#/negociacoes/${n.id}/editar">${icone('edit')}<span>Editar</span></a>`);
  if (n.situacao === 'em_negociacao') {
    botoes.push(`<button type="button" class="btn btn-secundario" data-acao="cancelar">${icone('x')}<span>Cancelar</span></button>`);
    botoes.push(`<button type="button" class="btn btn-primario" data-acao="fechar">${icone('check')}<span>Fechar negociação</span></button>`);
  } else if (n.situacao === 'fechada') {
    botoes.push(`<button type="button" class="btn btn-secundario" data-acao="reabrir">${icone('undo')}<span>Reabrir</span></button>`);
    botoes.push(`<button type="button" class="btn btn-primario" disabled title="O contrato chega na próxima etapa">${icone('contract')}<span>Gerar contrato</span></button>`);
  } else if (n.situacao === 'cancelada') {
    botoes.push(`<button type="button" class="btn btn-secundario" data-acao="reabrir">${icone('undo')}<span>Reabrir</span></button>`);
  }

  return `
    <nav class="trilha"><a href="#/negociacoes">Negociações</a>${icone('chevronRight', 14)}<span>Negociação ${n.codigo}</span></nav>
    <section class="card ficha-topo">
      <span class="icone-ficha">${icone('handshake', 26)}</span>
      <div class="ficha-info">
        <div class="ficha-nome"><h1>Negociação ${n.codigo} · ${esc(tituloImovel(imovel))}</h1>${situacaoNegociacao(n.situacao)}</div>
        <div class="ficha-detalhes">
          <span>Data <strong>${esc(formatarData(n.data_negociacao))}</strong></span>
          <span>Aluguel <strong>${n.valor_aluguel != null ? esc(formatarMoeda(n.valor_aluguel)) : '—'}</strong></span>
          <span>Prazo <strong>${n.prazo_meses ? `${n.prazo_meses} meses` : '—'}</strong></span>
          <span>Início previsto <strong>${n.inicio_previsto ? esc(formatarData(n.inicio_previsto)) : '—'}</strong></span>
        </div>
      </div>
      <div class="ficha-botoes">${botoes.join('')}</div>
    </section>
    <div class="painel-situacao" hidden></div>
    ${aba ? `<div class="abas" role="tablist">
      ${ABAS.map(([chave, texto]) => `<a role="tab" aria-selected="${chave === aba}" class="aba ${chave === aba ? 'ativa' : ''}" href="#/negociacoes/${n.id}/${chave}">${texto}</a>`).join('')}
    </div>` : ''}`;
}

function ligarAcoes(el, { n }, recarregar) {
  const painel = el.querySelector('.painel-situacao');

  const mudar = async (situacao, motivo = null, botao = null) => {
    if (botao) botao.disabled = true;
    const { error } = await sb.rpc('loc_mudar_situacao_negociacao', { p_id: n.id, p_situacao: situacao, p_motivo: motivo });
    if (botao) botao.disabled = false;
    if (error) {
      toast(mensagemErro(error), 'erro');
      return;
    }
    toast({ fechada: 'Negociação fechada.', cancelada: 'Negociação cancelada.', em_negociacao: 'Negociação reaberta.' }[situacao]);
    recarregar();
  };

  el.querySelector('[data-acao="fechar"]')?.addEventListener('click', (ev) => mudar('fechada', null, ev.currentTarget));
  el.querySelector('[data-acao="reabrir"]')?.addEventListener('click', (ev) => mudar('em_negociacao', null, ev.currentTarget));

  el.querySelector('[data-acao="cancelar"]')?.addEventListener('click', () => {
    painel.hidden = false;
    painel.innerHTML = `
      <section class="card secao-card">
        <h2 class="h-card">Cancelar esta negociação?</h2>
        <div class="campo largo-total">
          <label for="f-motivo">Motivo (opcional)</label>
          <textarea id="f-motivo" rows="2" placeholder="Ex.: locatário desistiu, proprietário não aceitou a proposta"></textarea>
        </div>
        <div class="acoes entre">
          <button type="button" class="btn btn-secundario" data-acao="voltar">Voltar</button>
          <button type="button" class="btn btn-perigo" data-acao="confirmar">${icone('x')}<span>Cancelar negociação</span></button>
        </div>
      </section>`;
    painel.querySelector('textarea').focus();
    painel.querySelector('[data-acao="voltar"]').addEventListener('click', () => { painel.hidden = true; painel.innerHTML = ''; });
    painel.querySelector('[data-acao="confirmar"]').addEventListener('click', (ev) =>
      mudar('cancelada', painel.querySelector('textarea').value.trim() || null, ev.currentTarget));
  });
}

// ---------- peças ----------
const dado = (rotuloDado, valor, html = false) =>
  `<div class="dado"><span class="rotulo">${rotuloDado}</span><span class="valor">${valor == null || valor === '' ? '<span class="t-faint">—</span>' : (html ? valor : esc(valor))}</span></div>`;

const cartao = (titulo, corpo, acao = '') =>
  `<section class="card secao-card"><div class="secao-cabecalho"><h2 class="h-card">${titulo}</h2>${acao}</div>${corpo}</section>`;

// Para onde mandar a pessoa completar a ficha, conforme o que falta.
function linkCompletar(item) {
  const falta = item.faltando;
  const aba = falta.every((f) => f === 'conta bancária para o repasse') ? 'contas'
    : falta.every((f) => /vinculado/.test(f)) ? 'vinculos'
      : falta.every((f) => ['telefone', 'e-mail'].includes(f)) ? 'contatos'
        : 'editar';
  return `<a class="btn btn-secundario btn-peq" href="#/clientes/${item.cliente_id}/${aba}">${icone('arrowUpRight', 14)}<span>Completar ficha</span></a>`;
}

// ---------- aba Resumo ----------
async function renderResumo(caixa, { n, pessoas, equipe, imovel }) {
  const nomeEquipe = (idEquipe) => equipe.find((p) => p.id === idEquipe)?.nome ?? '';
  const aberta = ['em_negociacao', 'fechada'].includes(n.situacao);
  const garantiaFiador = n.garantia_tipo === 'fiador';

  const partes = [
    { cliente: n.locatario, papel: 'Locatário' },
    ...pessoas.filter((p) => p.papel === 'solidario').map((p) => ({ cliente: p.cliente, papel: 'Solidário' })),
    ...imovel.proprietarios.map((p) => ({ cliente: p.cliente, papel: `Proprietário ${textoPercentual(p.percentual)}` })),
    ...(garantiaFiador ? pessoas.filter((p) => p.papel === 'fiador').map((p) => ({ cliente: p.cliente, papel: 'Fiador' })) : []),
  ];

  const situacaoTexto = n.situacao === 'fechada' && n.fechada_em ? `Fechada em ${formatarData(n.fechada_em)}`
    : n.situacao === 'cancelada' && n.cancelada_em ? `Cancelada em ${formatarData(n.cancelada_em)}`
      : rotulo(SITUACOES_NEGOCIACAO, n.situacao);

  caixa.innerHTML = `
    ${aberta ? '<section class="card secao-card conferencia"><div class="carregando">Conferindo as fichas…</div></section>' : ''}
    ${n.situacao === 'cancelada' && n.motivo_cancelamento
      ? `<div class="aviso neutro">${icone('x', 20)}<div><strong>Motivo do cancelamento</strong><p>${esc(n.motivo_cancelamento)}</p></div></div>` : ''}
    <div class="grade-cards">
      ${cartao('Partes', `<div class="contatos">${partes.map(({ cliente: c, papel }) => `
        <div class="contato">
          <span class="avatar pequeno">${esc(iniciais(c.nome))}</span>
          <div class="contato-info">
            <a href="#/clientes/${c.id}"><strong>${esc(c.nome)}</strong></a>
            <small>Código ${c.codigo}${c.cpf_cnpj ? ` · ${c.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} ${esc(formatarCpfCnpj(c.cpf_cnpj))}` : ''}</small>
          </div>
          <span class="selo-vinculo">${esc(papel)}</span>
        </div>`).join('')}</div>`)}
      ${cartao('Condições', `<div class="dados-grade">
          ${dado('Imóvel', `<a href="#/imoveis/${imovel.id}">Imóvel ${imovel.codigo}</a>`, true)}
          ${dado('Garantia', rotulo(GARANTIAS, n.garantia_tipo))}
          ${dado('Destinação', rotulo(DESTINACOES, imovel.destinacao))}
          ${dado('Taxa de administração', textoPercentual(n.taxa_administracao))}
          ${dado('Taxa de intermediação', textoPercentual(n.taxa_intermediacao))}
          ${dado('Situação', situacaoTexto)}
          ${dado('Corretor que alugou', nomeEquipe(n.corretor_id))}
          ${dado('Captador', nomeEquipe(n.captador_id))}
        </div>
        ${n.anotacoes ? `<p class="conta-obs texto-livre"><strong>Anotações:</strong> ${esc(n.anotacoes)}</p>` : ''}`)}
    </div>`;

  if (!aberta) return;

  const bloco = caixa.querySelector('.conferencia');
  const { data, error } = await sb.rpc('loc_conferir_negociacao', { p_negociacao_id: n.id });
  if (!bloco.isConnected) return;
  if (error) {
    bloco.innerHTML = `<div class="vazio">${esc(mensagemErro(error))}</div>`;
    return;
  }

  const problemas = [];
  if (!imovel.proprietarios.length) problemas.push('O imóvel não tem proprietário cadastrado.');
  if (garantiaFiador && !pessoas.some((p) => p.papel === 'fiador')) problemas.push('A garantia é fiador, mas nenhum fiador foi adicionado.');
  if (n.valor_aluguel == null || !n.prazo_meses || !n.inicio_previsto) problemas.push('Faltam valor do aluguel, prazo ou início previsto.');

  const incompletas = data.filter((item) => item.faltando.length).length;
  const pendencias = incompletas + problemas.length;
  const tudoOk = pendencias === 0;

  bloco.classList.toggle('ok', tudoOk);
  bloco.innerHTML = `
    <div class="secao-cabecalho">
      <h2 class="h-card">Pronto para gerar o contrato?</h2>
      <span class="soma ${tudoOk ? 'ok' : 'atencao'}">${icone(tudoOk ? 'check' : 'alert', 14)}${tudoOk
        ? 'Tudo completo'
        : incompletas ? `${incompletas} ${incompletas === 1 ? 'ficha para completar' : 'fichas para completar'}` : 'Há pendências'}</span>
    </div>
    <p class="apoio">O sistema confere se as fichas de todos têm os dados que o contrato usa. ${tudoOk
      ? (n.situacao === 'fechada' ? 'Está tudo pronto. O botão Gerar contrato chega na próxima etapa do sistema.' : 'Está tudo pronto. Feche a negociação para seguir para o contrato.')
      : 'O contrato só pode ser gerado quando tudo estiver completo.'}</p>
    ${problemas.map((p) => `<div class="conf-linha"><span class="conf-icone atencao">${icone('alert', 14)}</span><div class="conf-info"><strong>${esc(p)}</strong></div></div>`).join('')}
    ${data.map((item) => {
      const ok = !item.faltando.length;
      return `
        <div class="conf-linha">
          <span class="conf-icone ${ok ? 'ok' : 'atencao'}">${icone(ok ? 'check' : 'alert', 14)}</span>
          <div class="conf-info">
            <strong>${esc(item.nome)} <span class="t-muted">· ${esc(item.papel)}</span></strong>
            <small class="${ok ? '' : 't-ouro'}">${ok ? 'Ficha completa' : `Falta: ${esc(listaTexto(item.faltando))}`}</small>
          </div>
          ${ok ? '' : linkCompletar(item)}
        </div>`;
    }).join('')}`;
}

// ---------- Editar ----------
function renderEditar(caixa, { n, pessoas, equipe, imovel }) {
  const voltar = () => { location.hash = `#/negociacoes/${n.id}/resumo`; };
  caixa.innerHTML = '<h2 class="h-card">Editar negociação</h2><div id="form-caixa"></div>';
  montarFormNegociacao(caixa.querySelector('#form-caixa'), {
    n,
    pessoas,
    imovel,
    locatario: n.locatario,
    equipe,
    textoBotao: 'Salvar alterações',
    aoCancelar: voltar,
    aoSalvar: () => {
      toast('Negociação salva.');
      voltar();
    },
  });
}
