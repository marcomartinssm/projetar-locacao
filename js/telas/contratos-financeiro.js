// Aba Financeiro do contrato, no formato do Imoview: duas colunas (ALUGUEL e REPASSE),
// um bloco por envolvido, cada lançamento com a conta do plano de contas.
// Sempre 12 meses na tela, com setas para andar sem limite.
// Visão da empresa: o que entra é verde com "+", o que sai é vermelho com "−".

import { sb } from '../supabase.js';
import { esc, icone, iniciais, formatarData, formatarMoeda, lerNumeroBR, mensagemErro, toast } from '../util.js';
import { campo, select as selectCampo, campoTexto, limparErros, mostrarErros, mostrarErroForm } from '../formulario.js';
import { TIPOS_CONTA } from './imoveis-contas.js';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesTexto = (iso) => `${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
const primeiroDia = (iso) => `${iso.slice(0, 7)}-01`;

function somarMeses(iso, meses) {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
const hojeIso = () => new Date().toISOString().slice(0, 10);

// dinheiro sempre na visão da empresa
const dinheiro = (valor) => {
  const n = Number(valor) || 0;
  return `<strong class="${n < 0 ? 't-erro' : 't-ok'}">${n < 0 ? '−' : '+'} ${esc(formatarMoeda(Math.abs(n)))}</strong>`;
};
// no repasse o dinheiro sai da empresa, então o sinal se inverte
const sinalDoTipo = (tipo, valor) => (tipo === 'repasse' ? -Number(valor) : Number(valor));

const SELECT_MOVIMENTOS = `id, codigo, tipo, competencia, vencimento, situacao, pago_em, percentual,
  referencia_movimento_id,
  envolvido:cad_clientes(id, nome),
  lancamentos:loc_lancamentos(id, codigo, tipo, descricao, valor, automatico, observacao,
    conta:loc_plano_contas(codigo, nome, cobrar_acrescimos, declara_ir))`;

// ---------- tela ----------
export function renderFinanceiro(caixa, ficha) {
  const estado = { de: mesAtual(), contas: null };
  const desenhar = () => listaMeses(caixa, ficha.c, estado, desenhar);
  desenhar();
}

async function listaMeses(caixa, c, estado, desenhar) {
  caixa.innerHTML = '<div class="carregando">Carregando os meses…</div>';
  const ate = somarMeses(estado.de, 11);

  const [movimentos, resumo] = await Promise.all([
    sb.from('loc_movimentos').select(SELECT_MOVIMENTOS)
      .eq('contrato_id', c.id).gte('competencia', estado.de).lte('competencia', ate)
      .order('competencia').order('tipo', { ascending: false }),
    sb.rpc('loc_financeiro_contrato', { p_contrato_id: c.id, p_de: estado.de, p_ate: ate }),
  ]);

  const erro = movimentos.error || resumo.error;
  if (erro) {
    caixa.innerHTML = `<div class="card vazio">${esc(mensagemErro(erro))}</div>`;
    return;
  }
  if (!caixa.isConnected) return;

  const hoje = hojeIso();
  const meses = resumo.data;
  // o movimento de referência (o aluguel) vem na mesma lista: liga um no outro aqui
  const porId = new Map(movimentos.data.map((m) => [m.id, m]));
  const porMes = new Map();
  for (const m of movimentos.data) {
    m.referencia = m.referencia_movimento_id ? porId.get(m.referencia_movimento_id) ?? null : null;
    if (!porMes.has(m.competencia)) porMes.set(m.competencia, []);
    porMes.get(m.competencia).push(m);
  }

  const totalReceber = meses.reduce((s, m) => s + Number(m.receber), 0);
  const totalRepassar = meses.reduce((s, m) => s + Number(m.repassar), 0);

  caixa.innerHTML = `
    <section class="card filtros faixa-meses">
      <button type="button" class="icon-btn" data-andar="-12" aria-label="12 meses antes">${icone('chevronLeft')}</button>
      <strong>${esc(mesTexto(estado.de))} a ${esc(mesTexto(ate))}</strong>
      <button type="button" class="icon-btn" data-andar="12" aria-label="12 meses depois">${icone('chevronRight')}</button>
      <button type="button" class="link-acao" data-hoje>Voltar para hoje</button>
      <span class="t-muted">Recebo ${dinheiro(totalReceber)} · repasso ${dinheiro(-totalRepassar)} nestes 12 meses</span>
      <div class="faixa-acoes">
        <button type="button" class="btn btn-secundario btn-peq" data-extra>${icone('plus', 14)}<span>Lançar conta extra</span></button>
      </div>
    </section>

    <section class="card cabecalho-lados">
      <span>Aluguel · a receber do locatário</span>
      <span>Repasse · a pagar ao proprietário</span>
    </section>

    ${meses.map((mes) => bloqueDoMes(mes, porMes.get(mes.competencia) ?? [], hoje)).join('')}`;

  caixa.querySelectorAll('[data-andar]').forEach((b) => b.addEventListener('click', () => {
    estado.de = somarMeses(estado.de, Number(b.dataset.andar));
    desenhar();
  }));
  caixa.querySelector('[data-hoje]').addEventListener('click', () => { estado.de = mesAtual(); desenhar(); });
  caixa.querySelector('[data-extra]').addEventListener('click', () => formConta(caixa, c, estado, desenhar, estado.de));

  const acao = async (rpc, params, mensagem, botao) => {
    botao.disabled = true;
    const { error } = await sb.rpc(rpc, params);
    if (error) { botao.disabled = false; return toast(mensagemErro(error), 'erro'); }
    toast(mensagem);
    desenhar();
  };

  caixa.querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', () =>
    acao('loc_movimento_situacao', { p_movimento_id: b.dataset.pagar, p_situacao: 'pago', p_data: null }, 'Pagamento registrado.', b)));
  caixa.querySelectorAll('[data-desfazer]').forEach((b) => b.addEventListener('click', () =>
    acao('loc_movimento_situacao', { p_movimento_id: b.dataset.desfazer, p_situacao: 'aberto', p_data: null }, 'Pagamento desfeito.', b)));
  caixa.querySelectorAll('[data-apagar]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const { error } = await sb.from('loc_lancamentos').delete().eq('id', b.dataset.apagar);
    if (error) { b.disabled = false; return toast(mensagemErro(error), 'erro'); }
    toast('Lançamento apagado.');
    desenhar();
  }));
}

// ---------- um mês: aluguel de um lado, repasses do outro ----------
function bloqueDoMes(mes, movimentos, hoje) {
  const aluguel = movimentos.filter((m) => m.tipo === 'aluguel');
  const repasses = movimentos.filter((m) => m.tipo === 'repasse');
  const fora = !mes.dentro_contrato;

  return `
    <section class="card mes-card ${fora ? 'fora' : ''}">
      <div class="mes-topo">
        <strong>${esc(mesTexto(mes.competencia))}</strong>
        ${fora ? '<span class="t-faint">fora do prazo do contrato</span>' : ''}
      </div>
      <div class="mes-lados">
        <div class="mes-lado">
          ${aluguel.map((m) => cartaoMovimento(m, hoje)).join('') || '<p class="t-faint">Sem cobrança neste mês.</p>'}
        </div>
        <div class="mes-lado">
          ${repasses.map((m) => cartaoMovimento(m, hoje)).join('') || '<p class="t-faint">Sem repasse neste mês.</p>'}
        </div>
      </div>
    </section>`;
}

function cartaoMovimento(m, hoje) {
  const bloqueado = m.tipo === 'repasse' && m.referencia?.situacao !== 'pago';
  const atrasado = m.situacao !== 'pago' && m.vencimento < hoje && !bloqueado;
  const saldo = sinalDoTipo(m.tipo, (m.lancamentos ?? []).reduce((s, l) => s + Number(l.valor), 0));

  const selos = [
    m.situacao === 'pago'
      ? `<span class="selo-mov pago">${m.tipo === 'repasse' ? 'Repassado' : 'Pago'} ${esc(formatarData(m.pago_em))}</span>`
      : bloqueado ? '<span class="selo-mov bloq" title="Repasse bloqueado: o locatário ainda não pagou">B · bloqueado</span>'
        : atrasado ? '<span class="selo-mov atraso">Atrasado</span>'
          : '<span class="selo-mov aberto">Em aberto</span>',
  ].join('');

  const acoes = m.situacao === 'pago'
    ? `<button type="button" class="link-acao" data-desfazer="${m.id}">Desfazer</button>`
    : bloqueado ? ''
      : `<button type="button" class="btn btn-secundario btn-peq" data-pagar="${m.id}">${icone('check', 14)}<span>${m.tipo === 'repasse' ? 'Marcar repasse' : 'Registrar pagamento'}</span></button>`;

  return `
    <div class="mov-card ${bloqueado ? 'bloqueado' : ''}">
      <div class="mov-topo">
        <span class="avatar pequeno">${esc(iniciais(m.envolvido?.nome ?? '?'))}</span>
        <div class="mov-quem">
          <strong>${esc(m.envolvido?.nome ?? 'Sem envolvido')}${m.percentual != null ? ` · ${Number(m.percentual)}%` : ''}</strong>
          <small>Movimento nº ${m.codigo} · ${m.tipo === 'repasse' ? 'repasse' : 'vencimento'} ${esc(formatarData(m.vencimento))}${m.referencia ? ` · ligado ao nº ${m.referencia.codigo}` : ''}</small>
        </div>
        <span class="mov-total">${dinheiro(saldo)}</span>
      </div>
      <div class="mov-lancamentos">
        ${(m.lancamentos ?? []).sort((a, b) => a.codigo - b.codigo).map((l) => linhaLancamento(l, m)).join('')}
      </div>
      <div class="mov-rodape">
        ${selos}
        <div class="mov-acoes">${acoes}</div>
      </div>
    </div>`;
}

function linhaLancamento(l, m) {
  const marcas = [
    l.conta?.cobrar_acrescimos ? '<span class="marca" title="Cobrar acréscimos: multa e juros incidem neste valor">CA</span>' : '',
    l.conta?.declara_ir ? '<span class="marca" title="Entra na declaração de imposto de renda">IR</span>' : '',
  ].join('');

  return `
    <div class="lanc-linha">
      <span class="lanc-conta">${l.conta ? esc(l.conta.codigo) : '<span class="t-faint">—</span>'}</span>
      <span class="lanc-texto">
        <span>${esc(l.descricao)}${marcas}</span>
        <small>nº ${l.codigo}${l.automatico ? '' : ' · lançado à mão'}${l.observacao ? ` · ${esc(l.observacao)}` : ''}</small>
      </span>
      <span class="lanc-valor">${dinheiro(sinalDoTipo(m.tipo, l.valor))}</span>
      ${!l.automatico && m.situacao !== 'pago' ? `<button type="button" class="icon-btn" data-apagar="${l.id}" aria-label="Apagar lançamento">${icone('trash', 14)}</button>` : '<span></span>'}
    </div>`;
}

// ---------- lançar conta extra ----------
async function formConta(caixa, c, estado, desenhar, mesInicial) {
  if (!estado.contas) {
    const [contasImovel, plano] = await Promise.all([
      sb.from('loc_imoveis_contas').select('id, tipo, descricao').eq('imovel_id', c.imovel.id).eq('ativo', true).order('criado_em'),
      sb.from('loc_plano_contas').select('id, codigo, nome').eq('tipo', 'entrada').eq('ativo', true).order('ordem'),
    ]);
    estado.contas = contasImovel.data ?? [];
    estado.plano = plano.data ?? [];
  }
  const nomeConta = (conta) => {
    const tipo = (TIPOS_CONTA.find(([v]) => v === conta.tipo) || [null, conta.tipo])[1];
    return conta.descricao ? `${tipo} · ${conta.descricao}` : tipo;
  };
  const opcoesMes = Array.from({ length: 18 }, (_, i) => somarMeses(primeiroDia(mesInicial), i - 3)).map((m) => [m, mesTexto(m)]);

  const painel = document.createElement('div');
  painel.className = 'pilha';
  painel.innerHTML = `
    <form class="card painel" novalidate>
      <h2 class="h-card">Lançar conta extra</h2>
      <p class="apoio">Entra no movimento do locatário do mês escolhido. Água, IPTU, condomínio, luz, reembolso.</p>
      <div class="grade-2">
        ${selectCampo('plano_conta_id', 'Conta do plano de contas *', estado.plano.map((p) => [p.id, `${p.codigo} · ${p.nome}`]), '', { vazio: true })}
        ${selectCampo('conta_imovel_id', 'Conta cadastrada no imóvel', estado.contas.map((x) => [x.id, nomeConta(x)]), '', { vazio: true })}
      </div>
      <div class="grade-3">
        ${campo('descricao', 'Descrição que aparece na cobrança *', '', { placeholder: 'IPTU 2027 · parcela 1 de 10' })}
        ${campo('valor', 'Valor (R$) *', '', { inputmode: 'decimal', placeholder: '0,00' })}
        ${selectCampo('competencia', 'Primeiro mês', opcoesMes, primeiroDia(mesInicial), { vazio: false })}
        ${campo('meses', 'Repetir por (meses)', '1', { inputmode: 'numeric' })}
      </div>
      ${campoTexto('observacao', 'Observação', '')}
      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario" data-cancelar>Cancelar</button>
        <button type="submit" class="btn btn-primario">${icone('check')}<span>Lançar</span></button>
      </div>
    </form>`;

  caixa.prepend(painel);
  const form = painel.querySelector('form');
  form.elements.namedItem('plano_conta_id').focus();

  form.elements.namedItem('plano_conta_id').addEventListener('change', (ev) => {
    const conta = estado.plano.find((p) => p.id === ev.target.value);
    const descricao = form.elements.namedItem('descricao');
    if (conta && !descricao.value.trim()) descricao.value = conta.nome;
  });

  painel.querySelector('[data-cancelar]').addEventListener('click', () => painel.remove());

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    const erros = {};
    const valor = lerNumeroBR(form.elements.namedItem('valor').value);
    const meses = form.elements.namedItem('meses').value.trim();
    if (!form.elements.namedItem('plano_conta_id').value) erros.plano_conta_id = 'Escolha a conta.';
    if (!form.elements.namedItem('descricao').value.trim()) erros.descricao = 'Escreva a descrição.';
    if (valor == null || valor <= 0) erros.valor = 'Informe o valor.';
    if (meses && !/^\d+$/.test(meses)) erros.meses = 'Use só números.';
    if (mostrarErros(form, erros)) return;

    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    const { error } = await sb.rpc('loc_lancar_conta_extra', {
      p_contrato_id: c.id,
      p_dados: {
        competencia: form.elements.namedItem('competencia').value,
        meses: meses || '1',
        valor,
        descricao: form.elements.namedItem('descricao').value.trim(),
        plano_conta_id: form.elements.namedItem('plano_conta_id').value,
        conta_imovel_id: form.elements.namedItem('conta_imovel_id').value || null,
        observacao: form.elements.namedItem('observacao').value.trim() || null,
      },
    });
    botao.disabled = false;
    if (error) return mostrarErroForm(form, '.erro-form', mensagemErro(error));

    toast(Number(meses || 1) > 1 ? `Conta extra lançada em ${meses} meses.` : 'Conta extra lançada.');
    painel.remove();
    desenhar();
  });
}
