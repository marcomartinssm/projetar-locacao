// Ficha do contrato: resumo, partes, garantia, auditoria e edição.

import { sb } from '../supabase.js';
import {
  esc, icone, iniciais, formatarCpfCnpj, formatarData, formatarMoeda, mensagemErro, toast, rotulo,
  GARANTIAS, FORMAS_COBRANCA, INDICES_REAJUSTE, FORMAS_INTERMEDIACAO, SITUACOES_CONTRATO, TIPOS_IMOVEL,
} from '../util.js';
import { limparErros, mostrarErros, mostrarErroForm } from '../formulario.js';
import { enderecoImovel, textoPercentual } from '../imovel-form.js';
import { montarFormContrato, lerContrato, carregarSeguradoras, guardarSeguradoras } from '../contrato-form.js';
import { cartaoConta, SELECT_CONTAS } from './imoveis-contas.js';
import { renderFinanceiro } from './contratos-financeiro.js';
import { situacaoContrato } from './contratos-lista.js';

const ABAS = [
  ['resumo', 'Resumo', true],
  ['partes', 'Partes', true],
  ['garantia', 'Garantia', true],
  ['contas', 'Contas do imóvel', true],
  ['financeiro', 'Financeiro', true],
  ['auditoria', 'Auditoria', true],
];
const CLIENTE = 'id, codigo, nome, cpf_cnpj, tipo_pessoa';

export async function telaContratoFicha(el, id, abaPedida) {
  el.innerHTML = '<div class="carregando">Carregando contrato…</div>';

  const [contrato, pessoas, proprietarios, equipe] = await Promise.all([
    sb.from('loc_contratos')
      .select(`*,
        imovel:loc_imoveis(id, codigo, tipo, logradouro, numero, complemento, bairro, cidade, uf),
        locatario:cad_clientes!loc_contratos_locatario_cliente_id_fkey(${CLIENTE}),
        negociacao:loc_negociacoes(id, codigo)`)
      .eq('id', id).maybeSingle(),
    sb.from('loc_contratos_pessoas').select(`papel, cliente:cad_clientes(${CLIENTE})`).eq('contrato_id', id).order('criado_em'),
    sb.from('loc_contratos_proprietarios').select(`percentual, cliente:cad_clientes(${CLIENTE})`).eq('contrato_id', id).order('percentual', { ascending: false }),
    sb.from('loc_equipe').select('id, nome'),
  ]);

  const erro = contrato.error || pessoas.error || proprietarios.error || equipe.error;
  if (erro) return void (el.innerHTML = `<div class="card vazio">${esc(mensagemErro(erro))}</div>`);
  if (!contrato.data) return void (el.innerHTML = '<div class="card vazio">Contrato não encontrado. <a href="#/contratos">Voltar para a lista</a></div>');
  if (!el.isConnected) return;

  const ficha = { c: contrato.data, pessoas: pessoas.data, proprietarios: proprietarios.data, equipe: equipe.data };
  const editar = abaPedida === 'editar';
  const aba = ABAS.some(([chave, , pronta]) => chave === abaPedida && pronta) ? abaPedida : 'resumo';
  const recarregar = () => telaContratoFicha(el, id, aba);

  el.innerHTML = `${cabecalho(ficha, editar ? null : aba)}<div id="aba-conteudo" class="pilha"></div>`;
  ligarAcoes(el, ficha, recarregar);

  const caixa = el.querySelector('#aba-conteudo');
  if (editar) renderEditar(caixa, ficha, recarregar);
  else if (aba === 'partes') renderPartes(caixa, ficha);
  else if (aba === 'garantia') renderGarantia(caixa, ficha);
  else if (aba === 'contas') renderContasImovel(caixa, ficha);
  else if (aba === 'financeiro') renderFinanceiro(caixa, ficha);
  else if (aba === 'auditoria') import('../componentes/auditoria.js').then((m) => m.renderAuditoria(caixa, { entidade: 'contrato', entidadeId: id }));
  else renderResumo(caixa, ficha);
}

// ---------- cabeçalho ----------
function cabecalho({ c }, aba) {
  const i = c.imovel;
  const botoes = [`<a class="btn btn-secundario" href="#/contratos/${c.id}/editar">${icone('edit')}<span>Editar</span></a>`];
  if (c.situacao === 'ativo') {
    botoes.push(`<button type="button" class="btn btn-secundario" data-acao="encerrar">${icone('x')}<span>Encerrar</span></button>`);
  } else {
    botoes.push(`<button type="button" class="btn btn-secundario" data-acao="reativar">${icone('undo')}<span>Reativar</span></button>`);
  }

  return `
    <nav class="trilha"><a href="#/contratos">Contratos</a>${icone('chevronRight', 14)}<span>Contrato ${c.codigo}</span></nav>
    <section class="card ficha-topo">
      <span class="icone-ficha">${icone('contract', 26)}</span>
      <div class="ficha-info">
        <div class="ficha-nome"><h1>Contrato ${c.codigo} · ${esc(rotulo(TIPOS_IMOVEL, i.tipo))} · ${esc(enderecoImovel(i) || 'Sem endereço')}</h1>${situacaoContrato(c.situacao)}</div>
        <div class="ficha-detalhes">
          <span>Locatário <a href="#/clientes/${c.locatario.id}"><strong>${esc(c.locatario.nome)}</strong></a></span>
          <span>Aluguel <strong>${esc(formatarMoeda(c.valor_aluguel))}</strong></span>
          <span>Vigência <strong>${esc(formatarData(c.inicio))} a ${esc(formatarData(c.fim))}</strong></span>
          ${c.proximo_reajuste ? `<span>Próximo reajuste <strong>${esc(formatarData(c.proximo_reajuste))} · ${esc(rotulo(INDICES_REAJUSTE, c.indice_reajuste))}</strong></span>` : ''}
          ${c.negociacao ? `<span>Origem <a href="#/negociacoes/${c.negociacao.id}"><strong>Negociação ${c.negociacao.codigo}</strong></a></span>` : ''}
        </div>
      </div>
      <div class="ficha-botoes">${botoes.join('')}</div>
    </section>
    <div class="painel-situacao" hidden></div>
    ${aba ? `<div class="abas" role="tablist">
      ${ABAS.map(([chave, texto, pronta]) => (pronta
        ? `<a role="tab" aria-selected="${chave === aba}" class="aba ${chave === aba ? 'ativa' : ''}" href="#/contratos/${c.id}/${chave}">${texto}</a>`
        : `<span class="aba desativada" title="Em breve">${texto}</span>`)).join('')}
    </div>` : ''}`;
}

function ligarAcoes(el, { c }, recarregar) {
  const painel = el.querySelector('.painel-situacao');

  const mudar = async (situacao, data, motivo, botao) => {
    botao.disabled = true;
    const { error } = await sb.rpc('loc_mudar_situacao_contrato', { p_id: c.id, p_situacao: situacao, p_data: data, p_motivo: motivo });
    botao.disabled = false;
    if (error) return toast(mensagemErro(error), 'erro');
    toast(situacao === 'ativo' ? 'Contrato reativado.' : 'Contrato encerrado.');
    recarregar();
  };

  el.querySelector('[data-acao="reativar"]')?.addEventListener('click', (ev) => mudar('ativo', null, null, ev.currentTarget));

  el.querySelector('[data-acao="encerrar"]')?.addEventListener('click', () => {
    painel.hidden = false;
    painel.innerHTML = `
      <section class="card secao-card">
        <h2 class="h-card">Encerrar o contrato</h2>
        <p class="apoio">O imóvel volta a ficar disponível. Use "Rescindido" quando o contrato terminou antes do prazo.</p>
        <div class="grade-3">
          <div class="campo"><label for="f-tipo">Como terminou</label>
            <select id="f-tipo"><option value="encerrado">Encerrado (chegou ao fim)</option><option value="rescindido">Rescindido (terminou antes)</option></select></div>
          <div class="campo"><label for="f-data">Data</label><input id="f-data" type="date"></div>
        </div>
        <div class="campo largo-total"><label for="f-motivo">Motivo (opcional)</label><textarea id="f-motivo" rows="2"></textarea></div>
        <div class="acoes entre">
          <button type="button" class="btn btn-secundario" data-acao="voltar">Voltar</button>
          <button type="button" class="btn btn-perigo" data-acao="confirmar">${icone('x')}<span>Encerrar contrato</span></button>
        </div>
      </section>`;
    painel.querySelector('[data-acao="voltar"]').addEventListener('click', () => { painel.hidden = true; painel.innerHTML = ''; });
    painel.querySelector('[data-acao="confirmar"]').addEventListener('click', (ev) => mudar(
      painel.querySelector('#f-tipo').value,
      painel.querySelector('#f-data').value || null,
      painel.querySelector('#f-motivo').value.trim() || null,
      ev.currentTarget,
    ));
  });
}

// ---------- peças ----------
const dado = (rotuloDado, valor, html = false) =>
  `<div class="dado"><span class="rotulo">${rotuloDado}</span><span class="valor">${valor == null || valor === '' ? '<span class="t-faint">—</span>' : (html ? valor : esc(valor))}</span></div>`;

const cartao = (titulo, corpo) =>
  `<section class="card secao-card"><div class="secao-cabecalho"><h2 class="h-card">${titulo}</h2></div>${corpo}</section>`;

const grade = (pares) => `<div class="dados-grade">${pares.map(([r, v]) => dado(r, v)).join('')}</div>`;

const linhaPessoa = (c, papel) => `
  <div class="contato">
    <span class="avatar pequeno">${esc(iniciais(c.nome))}</span>
    <div class="contato-info">
      <a href="#/clientes/${c.id}"><strong>${esc(c.nome)}</strong></a>
      <small>Código ${c.codigo}${c.cpf_cnpj ? ` · ${c.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} ${esc(formatarCpfCnpj(c.cpf_cnpj))}` : ''}</small>
    </div>
    <span class="selo-vinculo">${esc(papel)}</span>
  </div>`;

const textoIntermediacao = (c) => {
  if (c.taxa_intermediacao == null) return '';
  const forma = rotulo(FORMAS_INTERMEDIACAO, c.intermediacao_forma).toLowerCase();
  const parcelas = c.intermediacao_forma === 'parcelada' && c.intermediacao_parcelas ? ` em ${c.intermediacao_parcelas}x` : '';
  const apartir = c.intermediacao_a_partir_de ? ` · a partir do aluguel ${c.intermediacao_a_partir_de}` : '';
  return `${textoPercentual(c.taxa_intermediacao)} · ${forma}${parcelas}${apartir}`;
};

const textoRepasse = (c) => (c.repasse_tipo === 'dia_fixo'
  ? (c.repasse_dia ? `Fixo, todo dia ${c.repasse_dia}` : 'Fixo, dia não informado')
  : `${c.repasse_dias ?? 0} dias após o recebimento`);

// ---------- aba Resumo ----------
function renderResumo(caixa, { c, proprietarios, equipe }) {
  const nomeEquipe = (id) => equipe.find((p) => p.id === id)?.nome ?? '';
  const donos = proprietarios.map((p) => `${p.cliente.nome} ${textoPercentual(p.percentual)}`).join(' · ');

  caixa.innerHTML = `
    ${c.situacao !== 'ativo' ? `<div class="aviso neutro">${icone('alert', 20)}<div>
      <strong>${esc(rotulo(SITUACOES_CONTRATO, c.situacao))} em ${esc(formatarData(c.encerrado_em))}</strong>
      ${c.encerrado_motivo ? `<p>${esc(c.encerrado_motivo)}</p>` : ''}</div></div>` : ''}
    <div class="grade-cards">
      ${cartao('Datas e cobrança', grade([
        ['Início', formatarData(c.inicio)], ['Prazo', `${c.prazo_meses} meses`], ['Fim', formatarData(c.fim)],
        ['Dia de vencimento', c.dia_vencimento], ['Forma de cobrança', rotulo(FORMAS_COBRANCA, c.forma_cobranca)],
        ['Primeiro vencimento', formatarData(c.primeiro_vencimento)],
      ]))}
      ${cartao('Valores e taxas', grade([
        ['Aluguel', formatarMoeda(c.valor_aluguel)], ['Taxa de administração', textoPercentual(c.taxa_administracao)],
        ['Taxa de intermediação', textoIntermediacao(c)],
        ['Taxa adm sobre multas', textoPercentual(c.taxa_adm_multas)], ['Taxa adm sobre juros', textoPercentual(c.taxa_adm_juros)],
        ['Taxa adm sobre multa rescisória', textoPercentual(c.taxa_adm_multa_rescisoria)],
        ['Multa por atraso', textoPercentual(c.multa_atraso)], ['Juros ao mês', textoPercentual(c.juros_mes)],
        ['Desconto pontualidade', formatarMoeda(c.desconto_pontualidade)],
      ]))}
      ${cartao('Repasse', grade([
        ['Como', textoRepasse(c)], ['Retém IRRF', c.retem_irrf ? 'Sim' : 'Não'], ['Proprietários', donos],
      ]))}
      ${cartao('Reajuste e rescisão', grade([
        ['Índice', rotulo(INDICES_REAJUSTE, c.indice_reajuste)], ['Próximo reajuste', formatarData(c.proximo_reajuste)],
        ['Multa de rescisão', c.multa_rescisao_alugueis ? `${textoPercentual(c.multa_rescisao_alugueis).replace('%', '')} aluguéis, proporcional` : ''],
        ['Sem multa após', c.sem_multa_apos_meses ? `${c.sem_multa_apos_meses} meses` : ''],
      ]))}
      ${cartao('Garantia e seguro', grade([
        ['Garantia', rotulo(GARANTIAS, c.garantia_tipo)],
        ['Seguro incêndio', c.seguro_incendio ? (c.seguro_seguradora || 'Sim') : 'Não'],
        ['Vigência do seguro', c.seguro_inicio || c.seguro_fim ? `${formatarData(c.seguro_inicio)} a ${formatarData(c.seguro_fim)}` : ''],
      ]))}
      ${cartao('Corretores e anotações', `${grade([
        ['Corretor que alugou', nomeEquipe(c.corretor_id)], ['Captador', nomeEquipe(c.captador_id)],
      ])}
        ${c.anotacoes ? `<p class="conta-obs texto-livre"><strong>Anotações:</strong> ${esc(c.anotacoes)}</p>` : ''}
        ${c.texto_acerto_contas ? `<p class="conta-obs texto-livre"><strong>Acerto de contas:</strong> ${esc(c.texto_acerto_contas)}</p>` : ''}`)}
    </div>`;
}

// ---------- aba Partes ----------
function renderPartes(caixa, { c, pessoas, proprietarios }) {
  const solidarios = pessoas.filter((p) => p.papel === 'solidario');
  const fiadores = pessoas.filter((p) => p.papel === 'fiador');

  caixa.innerHTML = `
    <div class="grade-cards">
      ${cartao('Quem aluga', `<div class="contatos">
        ${linhaPessoa(c.locatario, 'Locatário')}
        ${solidarios.map((p) => linhaPessoa(p.cliente, 'Solidário')).join('')}
        ${fiadores.map((p) => linhaPessoa(p.cliente, 'Fiador')).join('')}
      </div>`)}
      ${cartao('Quem recebe o repasse', `<div class="contatos">
        ${proprietarios.map((p) => linhaPessoa(p.cliente, `Proprietário ${textoPercentual(p.percentual)}`)).join('')}
      </div>
      <p class="apoio">Os percentuais ficaram guardados como estavam quando o contrato foi criado. Mudar os proprietários do imóvel não muda este contrato.</p>`)}
    </div>`;
}

// ---------- aba Garantia ----------
function renderGarantia(caixa, { c, pessoas }) {
  const fiadores = pessoas.filter((p) => p.papel === 'fiador');
  const campos = {
    fiador: [],
    caucao: [['Valor da caução', formatarMoeda(c.garantia_valor)]],
    seguro_fianca: [['Seguradora', c.garantia_seguradora], ['Apólice', c.garantia_apolice],
      ['Vigência', c.garantia_inicio || c.garantia_fim ? `${formatarData(c.garantia_inicio)} a ${formatarData(c.garantia_fim)}` : ''],
      ['Valor', formatarMoeda(c.garantia_valor)]],
    titulo_capitalizacao: [['Nº do título', c.garantia_apolice], ['Valor', formatarMoeda(c.garantia_valor)],
      ['Início', formatarData(c.garantia_inicio)], ['Término', formatarData(c.garantia_fim)]],
    credpago: [['Nº da análise / contrato', c.garantia_apolice]],
    sem_garantia: [],
  }[c.garantia_tipo] ?? [];

  caixa.innerHTML = `
    <div class="grade-cards">
      ${cartao(`Garantia · ${rotulo(GARANTIAS, c.garantia_tipo)}`, `
        ${campos.length ? grade(campos) : ''}
        ${c.garantia_tipo === 'fiador'
          ? (fiadores.length ? `<div class="contatos">${fiadores.map((p) => linhaPessoa(p.cliente, 'Fiador')).join('')}</div>` : '<p class="t-faint">Nenhum fiador.</p>')
          : ''}
        ${c.garantia_tipo === 'sem_garantia' && !c.garantia_observacao ? '<p class="t-faint">Contrato sem garantia.</p>' : ''}
        ${c.garantia_observacao ? `<p class="conta-obs texto-livre">${esc(c.garantia_observacao)}</p>` : ''}`)}
      ${cartao('Seguro incêndio', c.seguro_incendio
        ? grade([['Seguradora', c.seguro_seguradora], ['Apólice', c.seguro_apolice], ['Valor anual', formatarMoeda(c.seguro_valor_anual)],
          ['Início', formatarData(c.seguro_inicio)], ['Fim', formatarData(c.seguro_fim)]])
        : '<p class="t-faint">Este contrato não tem seguro incêndio.</p>')}
    </div>`;
}

// ---------- aba Contas do imóvel (só para consultar) ----------
async function renderContasImovel(caixa, { c }) {
  caixa.innerHTML = '<div class="carregando">Carregando contas do imóvel…</div>';
  const { data, error } = await sb.from('loc_imoveis_contas').select(SELECT_CONTAS).eq('imovel_id', c.imovel.id).order('criado_em');
  if (!caixa.isConnected) return;
  if (error) return void (caixa.innerHTML = `<div class="card vazio">${esc(mensagemErro(error))}</div>`);

  const atuais = data.filter((conta) => conta.ativo);
  const anteriores = data.filter((conta) => !conta.ativo);
  const card = (conta) => cartaoConta(conta, { acoes: false, senha: false });

  caixa.innerHTML = `
    <section class="card secao-card">
      <div class="secao-cabecalho">
        <h2 class="h-card">Contas do imóvel</h2>
        <a class="btn btn-secundario btn-peq" href="#/imoveis/${c.imovel.id}/contas">${icone('arrowUpRight', 14)}<span>Abrir na ficha do imóvel</span></a>
      </div>
      <p class="apoio">Cadastro das contas do imóvel (IPTU, água, luz, lixo, condomínio), só para consultar. Para mudar alguma coisa, use a ficha do imóvel. Os lançamentos de cada mês entram nas próximas etapas do sistema.</p>
    </section>
    ${atuais.length ? `<div class="contas-grade">${atuais.map(card).join('')}</div>` : '<div class="card vazio">Este imóvel não tem contas cadastradas.</div>'}
    ${anteriores.length ? `
      <details class="contas-anteriores">
        <summary>Contas anteriores (${anteriores.length})</summary>
        <div class="contas-grade">${anteriores.map(card).join('')}</div>
      </details>` : ''}`;
}

// ---------- Editar ----------
async function renderEditar(caixa, { c, pessoas }, recarregar) {
  const voltar = () => { location.hash = `#/contratos/${c.id}/resumo`; };
  caixa.innerHTML = '<h2 class="h-card">Editar contrato</h2><div id="form-caixa"></div>';
  const seguradoras = await carregarSeguradoras();
  if (!caixa.isConnected) return;

  montarFormContrato(caixa.querySelector('#form-caixa'), {
    c,
    seguradoras,
    fiadores: pessoas.filter((p) => p.papel === 'fiador').map((p) => p.cliente),
    textoBotao: 'Salvar alterações',
    aoCancelar: voltar,
    aoSalvar: async (form) => {
      limparErros(form);
      const { dados, erros, aviso } = lerContrato(form);
      if (mostrarErros(form, erros)) return;
      if (aviso) return mostrarErroForm(form, '.erro-form', aviso);

      const botao = form.querySelector('[type="submit"]');
      botao.disabled = true;
      const { error } = await sb.from('loc_contratos').update(dados).eq('id', c.id);
      botao.disabled = false;
      if (error) return mostrarErroForm(form, '.erro-form', mensagemErro(error));

      await guardarSeguradoras(dados);
      toast('Contrato salvo.');
      voltar();
      recarregar();
    },
  });
}
