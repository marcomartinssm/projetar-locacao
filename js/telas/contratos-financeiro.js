// Aba Financeiro do contrato: sempre 12 meses na tela, o detalhe de cada mês
// e o lançamento de contas extras. Cada mês lançado vira um movimento com código.

import { sb } from '../supabase.js';
import { esc, icone, formatarData, formatarMoeda, lerNumeroBR, mensagemErro, toast } from '../util.js';
import { campo, select as selectCampo, campoTexto, limparErros, mostrarErros, mostrarErroForm } from '../formulario.js';
import { TIPOS_CONTA } from './imoveis-contas.js';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const primeiroDia = (iso) => `${iso.slice(0, 7)}-01`;
const mesTexto = (iso) => `${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
const mesLongo = (iso) => `${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;

// soma meses a uma competência (aaaa-mm-01)
function somarMeses(iso, meses) {
  const ano = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7)) - 1 + meses;
  const d = new Date(ano, mes, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const SITUACAO = {
  previsto: ['Previsto', 'prev'],
  aberto: ['Aberto', 'abre'],
  pago: ['Pago', 'pago'],
  cancelado: ['Cancelado', 'canc'],
};
const selo = (situacao, atrasado) => {
  const [texto, classe] = SITUACAO[situacao] ?? [situacao, 'prev'];
  const atraso = atrasado && situacao === 'aberto';
  return `<span class="situacao-imovel mov-${atraso ? 'atrasado' : classe}"><i></i>${atraso ? 'Atrasado' : texto}</span>`;
};

// ---------- tela ----------
export function renderFinanceiro(caixa, ficha) {
  const estado = { de: mesAtual(), mes: null, contas: null };
  const { c } = ficha;

  const desenhar = async () => {
    if (estado.mes) return detalheMes(caixa, c, estado, desenhar);
    return listaMeses(caixa, c, estado, desenhar);
  };
  desenhar();
}

async function buscarMeses(contratoId, de) {
  const { data, error } = await sb.rpc('loc_financeiro_contrato', {
    p_contrato_id: contratoId, p_de: de, p_ate: somarMeses(de, 11),
  });
  if (error) throw error;
  return data;
}

// ---------- os 12 meses ----------
async function listaMeses(caixa, c, estado, desenhar) {
  caixa.innerHTML = '<div class="carregando">Carregando os meses…</div>';
  let meses;
  try {
    meses = await buscarMeses(c.id, estado.de);
  } catch (error) {
    caixa.innerHTML = `<div class="card vazio">${esc(mensagemErro(error))}</div>`;
    return;
  }
  if (!caixa.isConnected) return;

  const hoje = new Date().toISOString().slice(0, 10);
  const total = (campo) => meses.reduce((soma, m) => soma + Number(m[campo]), 0);

  caixa.innerHTML = `
    <section class="card filtros faixa-meses">
      <button type="button" class="icon-btn" data-andar="-12" aria-label="12 meses antes">${icone('chevronLeft')}</button>
      <strong>${esc(mesTexto(estado.de))} a ${esc(mesTexto(somarMeses(estado.de, 11)))}</strong>
      <button type="button" class="icon-btn" data-andar="12" aria-label="12 meses depois">${icone('chevronRight')}</button>
      <button type="button" class="link-acao" data-hoje>Voltar para hoje</button>
      <p class="apoio">Sempre 12 meses na tela. As setas andam para trás e para frente, sem limite.</p>
      <button type="button" class="btn btn-secundario btn-peq" data-extra>${icone('plus', 14)}<span>Lançar conta extra</span></button>
    </section>
    <section class="card tabela tabela-meses">
      <div class="linha cabecalho">
        <span>Mês</span><span>Movimento</span><span>Vence</span>
        <span class="valor-celula">Cobrar do locatário</span>
        <span class="valor-celula">Repassar ao proprietário</span>
        <span class="valor-celula">Projetar</span>
        <span>Situação</span><span></span>
      </div>
      ${meses.map((m) => {
        const fora = !m.dentro_contrato;
        const detalheReceber = fora ? 'fora do contrato'
          : [m.dias < m.dias_mes ? `${m.dias} dias (proporcional)` : 'aluguel cheio',
            Number(m.extras_locatario) ? `extras ${formatarMoeda(m.extras_locatario)}` : ''].filter(Boolean).join(' · ');
        const detalheRepasse = fora ? ''
          : [Number(m.taxa_adm) ? `adm ${formatarMoeda(m.taxa_adm)}` : '',
            Number(m.intermediacao) ? `intermediação ${formatarMoeda(m.intermediacao)}` : '',
            Number(m.extras_proprietario) ? `extras ${formatarMoeda(m.extras_proprietario)}` : ''].filter(Boolean).join(' · ');
        return `
        <div class="linha ${fora ? 'fora' : ''}" data-mes="${m.competencia}" role="button" tabindex="0">
          <span><strong>${esc(mesTexto(m.competencia))}</strong></span>
          <span class="t-muted">${m.codigo ? `nº ${m.codigo}` : '<span class="t-faint">—</span>'}</span>
          <span class="t-muted">${esc(formatarData(m.vencimento))}</span>
          <span class="valor-celula"><strong>${esc(formatarMoeda(m.receber))}</strong><small>${esc(detalheReceber)}</small></span>
          <span class="valor-celula"><strong class="${Number(m.repassar) < 0 ? 't-erro' : ''}">${esc(formatarMoeda(m.repassar))}</strong><small>${esc(detalheRepasse)}</small></span>
          <span class="valor-celula t-ok"><strong>${esc(formatarMoeda(m.projetar))}</strong></span>
          <span>${fora ? '' : selo(m.situacao, m.vencimento < hoje)}</span>
          <span class="seta">${icone('chevronRight')}</span>
        </div>`;
      }).join('')}
      <div class="linha rodape-meses">
        <span>Total</span><span></span><span></span>
        <span class="valor-celula"><strong>${esc(formatarMoeda(total('receber')))}</strong></span>
        <span class="valor-celula"><strong>${esc(formatarMoeda(total('repassar')))}</strong></span>
        <span class="valor-celula t-ok"><strong>${esc(formatarMoeda(total('projetar')))}</strong></span>
        <span></span><span></span>
      </div>
    </section>
    <p class="apoio">Previsto = o sistema já sabe o que vai acontecer, mas ninguém mexeu no mês ainda. Aberto = o mês virou movimento, com código. Pago = o locatário pagou. O boleto e o Pix da Unicred entram na etapa seguinte.</p>`;

  caixa.querySelectorAll('[data-andar]').forEach((b) => b.addEventListener('click', () => {
    estado.de = somarMeses(estado.de, Number(b.dataset.andar));
    desenhar();
  }));
  caixa.querySelector('[data-hoje]').addEventListener('click', () => { estado.de = mesAtual(); desenhar(); });
  caixa.querySelector('[data-extra]').addEventListener('click', () => formConta(caixa, c, estado, desenhar, estado.de));

  caixa.querySelectorAll('[data-mes]').forEach((linha) => {
    const abrir = () => { estado.mes = linha.dataset.mes; desenhar(); };
    linha.addEventListener('click', abrir);
    linha.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); } });
  });
}

// ---------- detalhe de um mês ----------
async function detalheMes(caixa, c, estado, desenhar) {
  caixa.innerHTML = '<div class="carregando">Carregando o mês…</div>';
  const mes = estado.mes;
  let dados;
  let lancamentos = [];
  try {
    const linhas = await buscarMeses(c.id, mes);
    dados = linhas[0];
    if (dados?.movimento_id) {
      const r = await sb.from('loc_lancamentos').select('*').eq('movimento_id', dados.movimento_id).order('criado_em');
      if (r.error) throw r.error;
      lancamentos = r.data;
    }
  } catch (error) {
    caixa.innerHTML = `<div class="card vazio">${esc(mensagemErro(error))}</div>`;
    return;
  }
  if (!caixa.isConnected || !dados) return;

  const voltar = () => { estado.mes = null; desenhar(); };
  const previstos = [
    { lado: 'locatario', tipo: 'aluguel', descricao: `Aluguel de ${mesLongo(mes)}${dados.dias < dados.dias_mes ? ` · ${dados.dias} dias (proporcional)` : ''}`, valor: dados.aluguel },
    { lado: 'proprietario', tipo: 'aluguel', descricao: `Aluguel de ${mesLongo(mes)}`, valor: dados.aluguel },
    ...(Number(dados.taxa_adm) ? [{ lado: 'proprietario', tipo: 'taxa_administracao', descricao: 'Taxa de administração', valor: -dados.taxa_adm }] : []),
    ...(Number(dados.intermediacao) ? [{ lado: 'proprietario', tipo: 'taxa_intermediacao', descricao: 'Taxa de intermediação', valor: -dados.intermediacao }] : []),
  ];
  const linhas = dados.movimento_id ? lancamentos : previstos;
  const doLado = (lado) => linhas.filter((l) => l.lado === lado);

  const linhaLanc = (l) => `
    <div class="contato">
      <span class="conta-icone">${icone(l.tipo === 'conta_extra' ? 'receipt' : l.tipo === 'aluguel' ? 'contract' : 'wallet', 16)}</span>
      <div class="contato-info">
        <strong>${esc(l.descricao)}</strong>
        <small>${l.automatico === false ? 'lançado à mão' : l.id ? 'automático do contrato' : 'previsto'}${l.observacao ? ` · ${esc(l.observacao)}` : ''}</small>
      </div>
      <strong class="valor-lanc ${Number(l.valor) < 0 ? 't-erro' : ''}">${esc(formatarMoeda(l.valor))}</strong>
      ${l.id && !l.automatico ? `<button type="button" class="icon-btn" data-apagar="${l.id}" aria-label="Apagar lançamento">${icone('trash')}</button>` : ''}
    </div>`;

  const bloco = (titulo, lado, total, cor) => `
    <section class="card secao-card">
      <div class="secao-cabecalho"><h2 class="h-card">${titulo}</h2></div>
      <div class="contatos">${doLado(lado).map(linhaLanc).join('') || '<p class="t-faint">Nada neste mês.</p>'}</div>
      <div class="total-lado"><span>${lado === 'locatario' ? 'Total a cobrar' : 'Repasse'}</span><strong class="${cor}">${esc(formatarMoeda(total))}</strong></div>
    </section>`;

  caixa.innerHTML = `
    <section class="card filtros faixa-meses">
      <button type="button" class="link-acao" data-voltar>‹ voltar para os 12 meses</button>
      <strong>${esc(mesLongo(mes))}</strong>
      ${dados.codigo ? `<span class="selo-conta atual">Movimento nº ${dados.codigo}</span>` : ''}
      ${dados.dentro_contrato ? selo(dados.situacao, false) : '<span class="t-faint">fora do prazo do contrato</span>'}
      <span class="t-muted">Vence ${esc(formatarData(dados.vencimento))}</span>
      <div class="faixa-acoes">
        ${dados.dentro_contrato ? `<button type="button" class="btn btn-secundario btn-peq" data-extra>${icone('plus', 14)}<span>Lançar conta extra</span></button>` : ''}
        ${dados.dentro_contrato && !dados.movimento_id ? `<button type="button" class="btn btn-secundario btn-peq" data-gerar>${icone('check', 14)}<span>Gerar movimento</span></button>` : ''}
        ${dados.movimento_id && dados.situacao !== 'pago' ? `<button type="button" class="btn btn-primario btn-peq" data-pago>${icone('check', 14)}<span>Marcar como pago</span></button>` : ''}
        ${dados.movimento_id && dados.situacao === 'pago' ? `<button type="button" class="btn btn-secundario btn-peq" data-reabrir>${icone('undo', 14)}<span>Desfazer pagamento</span></button>` : ''}
      </div>
    </section>
    ${dados.dentro_contrato ? `
      <div class="grade-cards">
        ${bloco('Cobrar do locatário', 'locatario', dados.receber, '')}
        ${bloco('Repassar ao proprietário', 'proprietario', dados.repassar, Number(dados.repassar) < 0 ? 't-erro' : 't-ok')}
      </div>
      <section class="card secao-card">
        <div class="secao-cabecalho"><h2 class="h-card">Fica com a Projetar</h2></div>
        <div class="dados-grade">
          <div class="dado"><span class="rotulo">Taxa de administração</span><span class="valor">${esc(formatarMoeda(dados.taxa_adm))}</span></div>
          <div class="dado"><span class="rotulo">Taxa de intermediação</span><span class="valor">${esc(formatarMoeda(dados.intermediacao))}</span></div>
          <div class="dado"><span class="rotulo">Total do mês</span><span class="valor t-ok"><strong>${esc(formatarMoeda(dados.projetar))}</strong></span></div>
        </div>
        <p class="apoio">As contas extras ainda não entram nesta conta: falta combinar para onde vai o dinheiro de cada uma.</p>
      </section>`
      : '<div class="card vazio">Este mês está fora do prazo do contrato.</div>'}`;

  caixa.querySelector('[data-voltar]').addEventListener('click', voltar);
  caixa.querySelector('[data-extra]')?.addEventListener('click', () => formConta(caixa, c, estado, desenhar, mes));

  caixa.querySelector('[data-gerar]')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const { error } = await sb.rpc('loc_garantir_movimento', { p_contrato_id: c.id, p_competencia: mes });
    if (error) return toast(mensagemErro(error), 'erro');
    toast('Movimento gerado.');
    desenhar();
  });

  const mudarSituacao = async (situacao, ev) => {
    ev.currentTarget.disabled = true;
    const { error } = await sb.rpc('loc_movimento_situacao', { p_movimento_id: dados.movimento_id, p_situacao: situacao, p_data: null });
    if (error) return toast(mensagemErro(error), 'erro');
    toast(situacao === 'pago' ? 'Movimento marcado como pago.' : 'Pagamento desfeito.');
    desenhar();
  };
  caixa.querySelector('[data-pago]')?.addEventListener('click', (ev) => mudarSituacao('pago', ev));
  caixa.querySelector('[data-reabrir]')?.addEventListener('click', (ev) => mudarSituacao('aberto', ev));

  caixa.querySelectorAll('[data-apagar]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const { error } = await sb.from('loc_lancamentos').delete().eq('id', b.dataset.apagar);
    if (error) return toast(mensagemErro(error), 'erro');
    toast('Lançamento apagado.');
    desenhar();
  }));
}

// ---------- lançar conta extra ----------
async function formConta(caixa, c, estado, desenhar, mesInicial) {
  if (!estado.contas) {
    const { data } = await sb.from('loc_imoveis_contas')
      .select('id, tipo, descricao, valor, ativo').eq('imovel_id', c.imovel.id).eq('ativo', true).order('criado_em');
    estado.contas = data ?? [];
  }
  const nomeConta = (conta) => {
    const tipo = (TIPOS_CONTA.find(([v]) => v === conta.tipo) || [null, conta.tipo])[1];
    return conta.descricao ? `${tipo} · ${conta.descricao}` : tipo;
  };

  const opcoesMes = Array.from({ length: 18 }, (_, i) => somarMeses(primeiroDia(mesInicial), i - 3))
    .map((m) => [m, mesTexto(m)]);

  const painel = document.createElement('div');
  painel.className = 'pilha';
  painel.innerHTML = `
    <form class="card painel" novalidate>
      <h2 class="h-card">Lançar conta extra</h2>
      <p class="apoio">Água, IPTU, condomínio, luz, reembolso de conserto. Você escolhe em que mês entra e por quantos meses repete.</p>
      <div class="grade-2">
        ${selectCampo('conta_imovel_id', 'Conta do imóvel', estado.contas.map((x) => [x.id, nomeConta(x)]), '', { vazio: true })}
        ${campo('descricao', 'Descrição que aparece na cobrança *', '', { placeholder: 'IPTU 2027 · parcela 1 de 10' })}
      </div>
      <div class="grade-3">
        ${selectCampo('lado', 'Cobrar de', [['locatario', 'Locatário'], ['proprietario', 'Descontar do proprietário']], 'locatario', { vazio: false })}
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
  form.elements.namedItem('descricao').focus();

  // Escolher a conta do imóvel já sugere a descrição.
  form.elements.namedItem('conta_imovel_id').addEventListener('change', (ev) => {
    const conta = estado.contas.find((x) => x.id === ev.target.value);
    const descricao = form.elements.namedItem('descricao');
    if (conta && !descricao.value.trim()) descricao.value = nomeConta(conta);
  });

  painel.querySelector('[data-cancelar]').addEventListener('click', () => painel.remove());

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    const erros = {};
    const valor = lerNumeroBR(form.elements.namedItem('valor').value);
    const meses = form.elements.namedItem('meses').value.trim();
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
        lado: form.elements.namedItem('lado').value,
        valor,
        descricao: form.elements.namedItem('descricao').value.trim(),
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
