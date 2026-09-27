// Aba Financeiro do contrato, no formato do Imoview: duas colunas (ALUGUEL e REPASSE),
// um bloco por envolvido, cada lançamento com a conta do plano de contas.
// Sempre 12 meses na tela, com setas para andar sem limite; cada mês abre e fecha.
// Visão da empresa: o que entra é verde com "+", o que sai é vermelho com "−".
//
// Recebimento: data, forma, conta que recebeu, e multa e juros calculados
// pelas porcentagens do contrato (a Projetar fica com a taxa de adm deles).
// Repasse: Pix ou transferência, na conta cadastrada do proprietário, com comprovante.
// Cobrança: Pix copia e cola gerado aqui, e boleto emitido no banco e colado aqui
// (quando a API da Unicred entrar, a mesma cobrança passa a nascer no banco).

import { sb } from '../supabase.js';
import { esc, icone, formatarData, formatarMoeda, formatarCpfCnpj, lerNumeroBR, mensagemErro, toast, rotulo } from '../util.js';
import { campo, select as selectCampo, campoTexto, limparErros, mostrarErros, mostrarErroForm } from '../formulario.js';
import { TIPOS_CONTA } from './imoveis-contas.js';
import { pixCopiaCola, chavePix, txidDoMovimento } from '../pix.js';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesTexto = (iso) => `${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
const primeiroDia = (iso) => `${iso.slice(0, 7)}-01`;
const ESPACO = 'anexos';

function somarMeses(iso, meses) {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// dinheiro sempre na visão da empresa
const dinheiro = (valor) => {
  const n = Number(valor) || 0;
  return `<strong class="${n < 0 ? 't-erro' : 't-ok'}">${n < 0 ? '−' : '+'} ${esc(formatarMoeda(Math.abs(n)))}</strong>`;
};

const SITUACOES_COBRANCA = [['rascunho', 'Rascunho'], ['registrada', 'Pronta'], ['enviada', 'Enviada'],
  ['paga', 'Paga'], ['baixada', 'Baixada'], ['vencida', 'Vencida'], ['cancelada', 'Cancelada']];
const TIPOS_COBRANCA = [['boleto', 'Boleto'], ['pix', 'Pix'], ['boleto_pix', 'Boleto com Pix']];

const SELECT_MOVIMENTOS = `id, codigo, contrato_id, competencia, vencimento, situacao, pago_em, historico, forma_recebimento,
  valor_pago, conta_empresa_id, observacao,
  repasses:loc_movimento_repasses(id, cliente_id, papel, percentual, vencimento, situacao, pago_em, forma_pagamento,
    conta_empresa_id, conta_bancaria_id, comprovante_path, observacao,
    cliente:cad_clientes(id, nome, cpf_cnpj)),
  cobrancas:loc_cobrancas(id, codigo, tipo, origem, valor, vencimento, situacao, nosso_numero, linha_digitavel,
    url_boleto, arquivo_path, pix_chave, pix_txid, pix_copia_cola, enviada_em, enviada_como, observacao),
  lancamentos:loc_lancamentos(id, codigo, tipo, descricao, valor, automatico, observacao, repasse_id, centro_custo,
    conta:loc_plano_contas(codigo, nome, cobrar_acrescimos, declara_ir))`;

// ---------- tela ----------
export function renderFinanceiro(caixa, ficha) {
  const estado = { de: mesAtual(), contas: null, abertos: new Set([mesAtual()]), formas: null, contasEmpresa: null, contasBanco: new Map() };
  const desenhar = () => listaMeses(caixa, ficha.c, estado, desenhar);
  desenhar();
}

async function apoio(estado) {
  if (estado.formas && estado.contasEmpresa) return;
  const [formas, contas] = await Promise.all([
    sb.from('cad_formas_pagamento').select('*').eq('ativo', true).order('ordem'),
    sb.from('cad_contas_empresa').select('*').eq('ativo', true).order('codigo'),
  ]);
  estado.formas = formas.data ?? [];
  estado.contasEmpresa = contas.data ?? [];
}

const opcoesFormas = (estado, onde) => estado.formas.filter((f) => f[onde]).map((f) => [f.codigo, f.nome]);
const opcoesContas = (estado) => estado.contasEmpresa.map((c) => [c.id, c.nome]);
const nomeForma = (estado, codigo) => estado.formas?.find((f) => f.codigo === codigo)?.nome ?? codigo;
const contaQueRecebe = (estado) => estado.contasEmpresa.find((c) => c.recebe_aluguel) ?? estado.contasEmpresa[0] ?? null;
const contaQuePaga = (estado) => estado.contasEmpresa.find((c) => c.paga_repasse) ?? estado.contasEmpresa[0] ?? null;

async function listaMeses(caixa, c, estado, desenhar) {
  caixa.innerHTML = '<div class="carregando">Carregando os meses…</div>';
  const ate = somarMeses(estado.de, 11);

  const [movimentos, resumo] = await Promise.all([
    sb.from('loc_movimentos').select(SELECT_MOVIMENTOS)
      .eq('contrato_id', c.id).gte('competencia', estado.de).lte('competencia', ate)
      .order('competencia'),
    sb.rpc('loc_financeiro_contrato', { p_contrato_id: c.id, p_de: estado.de, p_ate: ate }),
    apoio(estado),
  ]);

  const erro = movimentos.error || resumo.error;
  if (erro) {
    caixa.innerHTML = `<div class="card vazio">${esc(mensagemErro(erro))}</div>`;
    return;
  }
  if (!caixa.isConnected) return;

  const hoje = hojeIso();
  const meses = resumo.data;
  const porMes = new Map(movimentos.data.map((m) => [m.competencia, m]));

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
        <button type="button" class="link-acao" data-abrir-todos="sim">Abrir todos</button>
        <button type="button" class="link-acao" data-abrir-todos="nao">Fechar todos</button>
        <button type="button" class="btn btn-secundario btn-peq" data-extra>${icone('plus', 14)}<span>Lançar conta extra</span></button>
      </div>
    </section>

    ${avisoConta(estado)}

    <section class="card cabecalho-lados">
      <span>Aluguel · a receber do locatário</span>
      <span>Repasse · a pagar ao proprietário</span>
    </section>

    ${meses.map((mes) => cartaoMes(mes, porMes.get(mes.competencia) ?? null, hoje, c, estado, estado.abertos.has(mes.competencia))).join('')}`;

  caixa.querySelectorAll('details.mes-card').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) estado.abertos.add(d.dataset.mes);
    else estado.abertos.delete(d.dataset.mes);
  }));
  caixa.querySelectorAll('[data-abrir-todos]').forEach((b) => b.addEventListener('click', () => {
    const abrir = b.dataset.abrirTodos === 'sim';
    caixa.querySelectorAll('details.mes-card').forEach((d) => {
      d.open = abrir;
      if (abrir) estado.abertos.add(d.dataset.mes); else estado.abertos.delete(d.dataset.mes);
    });
  }));

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
  const achar = (id) => movimentos.data.find((m) => m.id === id);

  // ---- recebimento do locatário ----
  caixa.querySelectorAll('[data-receber]').forEach((b) => b.addEventListener('click', () =>
    painelRecebimento(caixa, achar(b.dataset.receber), c, estado, desenhar)));
  caixa.querySelectorAll('[data-desfazer-receber]').forEach((b) => b.addEventListener('click', () =>
    acao('loc_movimento_desfazer_recebimento', { p_movimento_id: b.dataset.desfazerReceber }, 'Recebimento desfeito.', b)));

  // ---- repasse ao proprietário ----
  caixa.querySelectorAll('[data-repassar]').forEach((b) => b.addEventListener('click', () => {
    const mov = achar(b.dataset.movimento);
    painelRepasse(caixa, mov.repasses.find((r) => r.id === b.dataset.repassar), mov, estado, desenhar);
  }));
  caixa.querySelectorAll('[data-desfazer-repasse]').forEach((b) => b.addEventListener('click', () =>
    acao('loc_repasse_desfazer', { p_repasse_id: b.dataset.desfazerRepasse }, 'Repasse desfeito.', b)));

  // ---- cobranças ----
  caixa.querySelectorAll('[data-cobrar]').forEach((b) => b.addEventListener('click', () =>
    painelCobranca(caixa, achar(b.dataset.movimento), c, estado, desenhar, b.dataset.cobrar)));
  caixa.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', () => copiar(b.dataset.copiar)));
  caixa.querySelectorAll('[data-enviada]').forEach((b) => b.addEventListener('click', () =>
    acao('loc_cobranca_situacao', { p_cobranca_id: b.dataset.enviada, p_situacao: 'enviada', p_dados: { enviada_como: 'whatsapp' } }, 'Cobrança marcada como enviada.', b)));
  caixa.querySelectorAll('[data-cancelar-cobranca]').forEach((b) => b.addEventListener('click', () =>
    acao('loc_cobranca_situacao', { p_cobranca_id: b.dataset.cancelarCobranca, p_situacao: 'cancelada', p_dados: {} }, 'Cobrança cancelada.', b)));
  caixa.querySelectorAll('[data-abrir-arquivo]').forEach((b) => b.addEventListener('click', () => abrirArquivo(b.dataset.abrirArquivo)));

  caixa.querySelectorAll('[data-apagar]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const { error } = await sb.from('loc_lancamentos').delete().eq('id', b.dataset.apagar);
    if (error) { b.disabled = false; return toast(mensagemErro(error), 'erro'); }
    toast('Lançamento apagado.');
    desenhar();
  }));
}

function avisoConta(estado) {
  const conta = contaQueRecebe(estado);
  if (conta && conta.pix_chave && conta.titular_nome) return '';
  return `
    <div class="aviso neutro">${icone('alert', 20)}<div>
      <strong>Falta completar a conta da imobiliária</strong>
      <p>Sem a chave Pix e a razão social o sistema não gera o Pix copia e cola.
         Complete em <a href="#/config/contas">Configurações › Contas da imobiliária</a>.</p>
    </div></div>`;
}

// ---------- um mês = um movimento, com os dois lados dentro ----------
function cartaoMes(mes, mov, hoje, contrato, estado, aberto) {
  if (!mes.dentro_contrato || !mov) {
    return `
      <section class="card mes-card fora">
        <div class="mes-topo"><span class="mes-seta"></span><strong>${esc(mesTexto(mes.competencia))}</strong>
          <span class="t-faint">${mes.dentro_contrato ? 'sem movimento gerado' : 'fora do prazo do contrato'}</span></div>
      </section>`;
  }

  const doLocatario = (mov.lancamentos ?? []).filter((l) => !l.repasse_id);
  const saldoLocatario = doLocatario.reduce((s, l) => s + Number(l.valor), 0);
  const atrasado = mov.situacao !== 'pago' && mov.vencimento < hoje;
  const saldoRepasses = -(mov.lancamentos ?? []).filter((l) => l.repasse_id).reduce((s, l) => s + Number(l.valor), 0);
  const repassesPagos = (mov.repasses ?? []).length && (mov.repasses ?? []).every((r) => r.situacao === 'pago');

  return `
    <details class="card mes-card" data-mes="${mes.competencia}" ${aberto ? 'open' : ''}>
      <summary class="mes-topo">
        <span class="mes-seta">${icone('chevronRight', 16)}</span>
        <strong>${esc(mesTexto(mes.competencia))}</strong>
        <span class="t-muted">Movimento nº ${mov.codigo}</span>
        <span class="mes-resumo">
          <span>Receber ${dinheiro(saldoLocatario)} <small>${mov.situacao === 'pago' ? 'recebido' : atrasado ? 'vencido' : `vence ${esc(formatarData(mov.vencimento))}`}</small></span>
          <span>Repassar ${dinheiro(saldoRepasses)} <small>${repassesPagos ? 'repassado' : mov.situacao === 'pago' ? 'liberado' : 'bloqueado'}</small></span>
        </span>
      </summary>
      <div class="mes-lados">
        <div class="mes-lado">
          <div class="lado-cabecalho">
            <div>
              <strong>${esc(contrato.locatario?.nome ?? 'Locatário')}</strong>
              <small>Vence ${esc(formatarData(mov.vencimento))}${mov.pago_em ? ` · recebido ${esc(formatarData(mov.pago_em))}` : ''}</small>
            </div>
            ${dinheiro(saldoLocatario)}
          </div>
          <div class="mov-lancamentos">
            ${doLocatario.sort((a, b) => a.codigo - b.codigo).map((l) => linhaLancamento(l, 1, mov.situacao === 'pago')).join('')}
          </div>
          <div class="mov-rodape">
            ${mov.situacao === 'pago'
              ? `<span class="selo-mov pago">Recebido ${esc(formatarData(mov.pago_em))}</span>
                 <button type="button" class="link-acao" data-desfazer-receber="${mov.id}">Desfazer</button>`
              : `<span class="selo-mov ${atrasado ? 'atraso' : 'aberto'}">${atrasado ? 'Vencido' : 'A receber'}</span>
                 <button type="button" class="btn btn-secundario btn-peq" data-receber="${mov.id}">${icone('check', 14)}<span>Registrar recebimento</span></button>`}
          </div>
          <div class="forma-linha">
            Forma de recebimento:
            <strong>${mov.forma_recebimento ? esc(nomeForma(estado, mov.forma_recebimento)) : '<span class="t-faint">—</span>'}</strong>
            ${mov.valor_pago != null ? `<span class="t-muted">· recebido ${esc(formatarMoeda(mov.valor_pago))}</span>` : ''}
          </div>
          ${blocoCobrancas(mov, estado)}
        </div>

        <div class="mes-lado">
          ${(mov.repasses ?? []).map((rep) => blocoRepasse(rep, mov, hoje, estado)).join('') || '<p class="t-faint">Sem repasse neste mês.</p>'}
        </div>
      </div>
    </details>`;
}

// ---------- cobranças do mês (boleto e Pix) ----------
function blocoCobrancas(mov, estado) {
  const cobrancas = (mov.cobrancas ?? []).filter((cb) => cb.situacao !== 'cancelada')
    .sort((a, b) => a.codigo - b.codigo);

  return `
    <div class="cobranca-bloco">
      <div class="cobranca-topo">
        <span>Cobrança</span>
        ${mov.situacao === 'pago' ? '' : `
          <button type="button" class="link-acao" data-cobrar="pix" data-movimento="${mov.id}">${icone('qr', 13)} Gerar Pix</button>
          <button type="button" class="link-acao" data-cobrar="boleto" data-movimento="${mov.id}">${icone('barcode', 13)} Colar boleto</button>`}
      </div>
      ${cobrancas.length ? cobrancas.map((cb) => linhaCobranca(cb, mov)).join('')
        : '<p class="t-faint">Nenhum boleto ou Pix gerado para este mês.</p>'}
    </div>`;
}

const comoNasceu = (cb) => {
  if (cb.origem === 'api') return 'emitida pelo banco';
  return cb.tipo === 'pix' ? 'gerada aqui no sistema' : 'emitida no banco e colada aqui';
};

function linhaCobranca(cb, mov) {
  const texto = cb.tipo === 'pix' ? cb.pix_copia_cola : cb.linha_digitavel;
  return `
    <div class="cobranca-linha">
      <span class="cobranca-tipo">${icone(cb.tipo === 'pix' ? 'qr' : 'barcode', 14)}${esc(rotulo(TIPOS_COBRANCA, cb.tipo))}</span>
      <span class="cobranca-info">
        <span>nº ${cb.codigo} · ${esc(formatarMoeda(cb.valor))} · vence ${esc(formatarData(cb.vencimento))}</span>
        <small>${esc(rotulo(SITUACOES_COBRANCA, cb.situacao))} · ${esc(comoNasceu(cb))}${cb.nosso_numero ? ` · nosso número ${esc(cb.nosso_numero)}` : ''}${cb.enviada_em ? ` · enviada${cb.enviada_como ? ` por ${esc(cb.enviada_como)}` : ''}` : ''}</small>
      </span>
      <span class="cobranca-acoes">
        ${texto ? `<button type="button" class="link-acao" data-copiar="${esc(texto)}">${icone('copy', 13)} Copiar</button>` : ''}
        ${cb.arquivo_path ? `<button type="button" class="link-acao" data-abrir-arquivo="${cb.arquivo_path}">Ver PDF</button>` : ''}
        ${cb.url_boleto ? `<a class="link-acao" href="${esc(cb.url_boleto)}" target="_blank" rel="noopener">Abrir</a>` : ''}
        ${mov.situacao !== 'pago' && cb.situacao !== 'enviada' ? `<button type="button" class="link-acao" data-enviada="${cb.id}">Marcar enviada</button>` : ''}
        ${mov.situacao !== 'pago' ? `<button type="button" class="link-acao" data-cobrar="${cb.id}" data-movimento="${mov.id}">Editar</button>
           <button type="button" class="link-acao t-erro" data-cancelar-cobranca="${cb.id}">Cancelar</button>` : ''}
      </span>
    </div>`;
}

function blocoRepasse(rep, mov, hoje, estado) {
  const lancamentos = (mov.lancamentos ?? []).filter((l) => l.repasse_id === rep.id);
  const saldo = -lancamentos.reduce((s, l) => s + Number(l.valor), 0);
  const bloqueado = mov.situacao !== 'pago' && rep.situacao !== 'pago';
  const atrasado = !bloqueado && rep.situacao !== 'pago' && rep.vencimento && rep.vencimento < hoje;

  return `
    <div class="repasse-bloco ${bloqueado ? 'bloqueado' : ''}">
      <div class="lado-cabecalho">
        <div>
          <strong>${esc(rep.cliente?.nome ?? 'Proprietário')}${rep.percentual != null ? ` · ${Number(rep.percentual)}%` : ''}</strong>
          <small>Repasse ${rep.vencimento ? esc(formatarData(rep.vencimento)) : '—'}${rep.pago_em ? ` · feito ${esc(formatarData(rep.pago_em))}` : ''}</small>
        </div>
        ${dinheiro(saldo)}
      </div>
      <div class="mov-lancamentos">
        ${lancamentos.sort((a, b) => a.codigo - b.codigo).map((l) => linhaLancamento(l, -1, rep.situacao === 'pago')).join('')}
      </div>
      <div class="mov-rodape">
        ${rep.situacao === 'pago'
          ? `<span class="selo-mov pago">Repassado ${esc(formatarData(rep.pago_em))}</span>
             ${rep.comprovante_path ? `<button type="button" class="link-acao" data-abrir-arquivo="${rep.comprovante_path}">Ver comprovante</button>` : ''}
             <button type="button" class="link-acao" data-desfazer-repasse="${rep.id}">Desfazer</button>`
          : bloqueado
            ? '<span class="selo-mov bloq" title="O locatário ainda não pagou">B · bloqueado</span>'
            : `<span class="selo-mov ${atrasado ? 'atraso' : 'aberto'}">${atrasado ? 'Repasse atrasado' : 'Liberado'}</span>
               <button type="button" class="btn btn-secundario btn-peq" data-repassar="${rep.id}" data-movimento="${mov.id}">${icone('bank', 14)}<span>Pagar repasse</span></button>`}
      </div>
      <div class="forma-linha">
        Forma de pagamento:
        <strong>${rep.forma_pagamento ? esc(nomeForma(estado, rep.forma_pagamento)) : '<span class="t-faint">—</span>'}</strong>
        ${rep.observacao ? `<span class="t-muted">· ${esc(rep.observacao)}</span>` : ''}
      </div>
    </div>`;
}

function linhaLancamento(l, sinal, travado) {
  const marcas = [
    l.conta?.cobrar_acrescimos ? '<span class="marca" title="Cobrar acréscimos: multa e juros incidem neste valor">CA</span>' : '',
    l.conta?.declara_ir ? '<span class="marca" title="Entra na declaração de imposto de renda">IR</span>' : '',
  ].join('');

  return `
    <div class="lanc-linha">
      <span class="lanc-conta">${l.conta ? esc(l.conta.codigo) : '<span class="t-faint">—</span>'}</span>
      <span class="lanc-texto">
        <span>${esc(l.descricao)}${marcas}</span>
        <small>nº ${l.codigo} · CC ${esc(l.centro_custo ?? 'LOCAÇÃO')}${l.automatico ? '' : ' · lançado à mão'}${l.observacao ? ` · ${esc(l.observacao)}` : ''}</small>
      </span>
      <span class="lanc-valor">${dinheiro(sinal * Number(l.valor))}</span>
      ${!l.automatico && !travado ? `<button type="button" class="icon-btn" data-apagar="${l.id}" aria-label="Apagar lançamento">${icone('trash', 14)}</button>` : '<span></span>'}
    </div>`;
}

// ---------- copiar e abrir arquivo ----------
async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('Copiado.');
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    toast('Copiado.');
  }
}

async function abrirArquivo(caminho) {
  const janela = window.open('', '_blank');
  const { data, error } = await sb.storage.from(ESPACO).createSignedUrl(caminho, 60);
  if (error || !data?.signedUrl) {
    janela?.close();
    return toast(error ? mensagemErro(error) : 'Não foi possível abrir o arquivo.', 'erro');
  }
  janela.location = data.signedUrl;
}

function abrirPainel(caixa, html) {
  const painel = document.createElement('div');
  painel.className = 'pilha';
  painel.innerHTML = html;
  caixa.prepend(painel);
  painel.scrollIntoView({ block: 'nearest' });
  const form = painel.querySelector('form');
  painel.querySelector('[data-cancelar]').addEventListener('click', () => painel.remove());
  return { painel, form };
}

// ---------- registrar o recebimento ----------
async function painelRecebimento(caixa, mov, contrato, estado, desenhar) {
  const { data: enc } = await sb.rpc('loc_calcular_encargos', { p_movimento_id: mov.id, p_data: hojeIso() });
  const e = Array.isArray(enc) ? enc[0] : enc;
  const totalMes = (mov.lancamentos ?? []).filter((l) => !l.repasse_id).reduce((s, l) => s + Number(l.valor), 0);
  const conta = contaQueRecebe(estado);
  const atraso = Number(e?.dias_atraso ?? 0);

  const { painel, form } = abrirPainel(caixa, `
    <form class="card painel" novalidate>
      <h2 class="h-card">Registrar recebimento · ${esc(mesTexto(mov.competencia))}</h2>
      <p class="apoio">Movimento nº ${mov.codigo} · vence ${esc(formatarData(mov.vencimento))} ·
        valor do mês ${esc(formatarMoeda(totalMes))}</p>

      <div data-atraso>${avisoAtraso(atraso, e, contrato)}</div>

      <div class="grade-3">
        ${campo('pago_em', 'Recebido em *', hojeIso(), { tipo: 'date' })}
        ${selectCampo('forma_recebimento', 'Forma de recebimento *', opcoesFormas(estado, 'no_recebimento'), 'pix')}
        ${selectCampo('conta_empresa_id', 'Caiu na conta', opcoesContas(estado), conta?.id ?? '')}
      </div>

      <label class="check"><input type="checkbox" name="cobrar_encargos" ${atraso > 0 ? 'checked' : ''}>
        <span>Cobrar multa e juros pelo atraso</span></label>

      <div class="grade-3">
        ${campo('multa', 'Multa (R$)', e?.multa ? Number(e.multa).toFixed(2).replace('.', ',') : '0,00', { inputmode: 'decimal' })}
        ${campo('juros', 'Juros (R$)', e?.juros ? Number(e.juros).toFixed(2).replace('.', ',') : '0,00', { inputmode: 'decimal' })}
        ${campo('valor_pago', 'Total recebido (R$)', (totalMes + Number(e?.multa ?? 0) + Number(e?.juros ?? 0)).toFixed(2).replace('.', ','), { inputmode: 'decimal' })}
      </div>
      ${campoTexto('observacao', 'Observação', '')}

      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario" data-cancelar>Cancelar</button>
        <button type="submit" class="btn btn-primario">${icone('check')}<span>Registrar recebimento</span></button>
      </div>
    </form>`);

  const el = (n) => form.elements.namedItem(n);

  // Se o recebimento for lançado com outra data, a multa e os juros seguem essa data.
  const recalcular = async () => {
    const data = el('pago_em').value;
    if (!data) return;
    const { data: novo } = await sb.rpc('loc_calcular_encargos', { p_movimento_id: mov.id, p_data: data });
    const x = Array.isArray(novo) ? novo[0] : novo;
    if (!x) return;
    const dias = Number(x.dias_atraso ?? 0);
    painel.querySelector('[data-atraso]').innerHTML = avisoAtraso(dias, x, contrato);
    if (dias > 0 && !el('cobrar_encargos').checked) el('cobrar_encargos').checked = true;
    if (dias === 0) el('cobrar_encargos').checked = false;
    el('multa').value = Number(x.multa ?? 0).toFixed(2).replace('.', ',');
    el('juros').value = Number(x.juros ?? 0).toFixed(2).replace('.', ',');
    ligarEncargos();
  };

  const somar = () => {
    const multa = el('cobrar_encargos').checked ? (lerNumeroBR(el('multa').value) ?? 0) : 0;
    const juros = el('cobrar_encargos').checked ? (lerNumeroBR(el('juros').value) ?? 0) : 0;
    el('valor_pago').value = (totalMes + multa + juros).toFixed(2).replace('.', ',');
  };
  const ligarEncargos = () => {
    const ligado = el('cobrar_encargos').checked;
    el('multa').disabled = !ligado;
    el('juros').disabled = !ligado;
    somar();
  };
  el('cobrar_encargos').addEventListener('change', ligarEncargos);
  el('multa').addEventListener('input', somar);
  el('juros').addEventListener('input', somar);
  el('pago_em').addEventListener('change', recalcular);
  ligarEncargos();
  el('pago_em').focus();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    const erros = {};
    if (!el('pago_em').value) erros.pago_em = 'Informe a data.';
    if (!el('forma_recebimento').value) erros.forma_recebimento = 'Escolha a forma.';
    if (mostrarErros(form, erros)) return;

    const cobrar = el('cobrar_encargos').checked;
    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    const { error } = await sb.rpc('loc_movimento_receber', {
      p_movimento_id: mov.id,
      p_dados: {
        pago_em: el('pago_em').value,
        forma_recebimento: el('forma_recebimento').value,
        conta_empresa_id: el('conta_empresa_id').value || null,
        cobrar_encargos: cobrar,
        multa: cobrar ? (lerNumeroBR(el('multa').value) ?? 0) : 0,
        juros: cobrar ? (lerNumeroBR(el('juros').value) ?? 0) : 0,
        valor_pago: lerNumeroBR(el('valor_pago').value),
        observacao: el('observacao').value.trim() || null,
      },
    });
    botao.disabled = false;
    if (error) return mostrarErroForm(form, '.erro-form', mensagemErro(error));

    toast('Recebimento registrado. O repasse está liberado.');
    painel.remove();
    desenhar();
  });
}

function avisoAtraso(dias, e, contrato) {
  if (!(dias > 0)) return '';
  return `<div class="aviso neutro">${icone('alert', 20)}<div>
    <strong>${dias} ${dias === 1 ? 'dia' : 'dias'} de atraso</strong>
    <p>Multa de ${esc(String(contrato.multa_atraso ?? 0))}% e juros de ${esc(String(contrato.juros_mes ?? 0))}% ao mês
       sobre ${esc(formatarMoeda(e?.base ?? 0))} (só o que tem a marca CA).
       A Projetar fica com ${esc(String(contrato.taxa_adm_multas ?? 0))}% da multa e
       ${esc(String(contrato.taxa_adm_juros ?? 0))}% dos juros; o resto vai no repasse do proprietário.</p></div></div>`;
}

// ---------- pagar o repasse ----------
async function painelRepasse(caixa, rep, mov, estado, desenhar) {
  if (!estado.contasBanco.has(rep.cliente_id)) {
    const { data } = await sb.from('cad_clientes_contas_bancarias')
      .select('*').eq('cliente_id', rep.cliente_id).eq('ativo', true)
      .order('principal', { ascending: false });
    estado.contasBanco.set(rep.cliente_id, data ?? []);
  }
  const contasProp = estado.contasBanco.get(rep.cliente_id);
  // valor a transferir: sempre positivo, é o que sai da conta da Projetar
  const valor = Math.abs((mov.lancamentos ?? []).filter((l) => l.repasse_id === rep.id).reduce((s, l) => s + Number(l.valor), 0));
  const daEmpresa = contaQuePaga(estado);

  const textoConta = (cb) => [cb.banco_nome, cb.agencia && `ag. ${cb.agencia}`, cb.conta && `c/c ${cb.conta}`,
    cb.pix_chave && `Pix ${cb.pix_chave}`].filter(Boolean).join(' · ') || 'conta sem dados';

  const { painel, form } = abrirPainel(caixa, `
    <form class="card painel" novalidate>
      <h2 class="h-card">Pagar repasse · ${esc(mesTexto(mov.competencia))}</h2>
      <p class="apoio">Movimento nº ${mov.codigo} · ${esc(rep.cliente?.nome ?? '')} ·
        líquido a repassar <strong>${esc(formatarMoeda(valor))}</strong></p>

      ${contasProp.length ? '' : `<div class="aviso neutro">${icone('alert', 20)}<div>
        <strong>Este proprietário não tem conta cadastrada</strong>
        <p>Você pode registrar o pagamento assim mesmo, mas o certo é cadastrar a conta
           na ficha dele, na aba Contas bancárias.</p></div></div>`}

      <div class="grade-3">
        ${campo('pago_em', 'Pago em *', hojeIso(), { tipo: 'date' })}
        ${selectCampo('forma_pagamento', 'Forma de pagamento *', opcoesFormas(estado, 'no_pagamento'), 'pix')}
        ${selectCampo('conta_empresa_id', 'Saiu da conta', opcoesContas(estado), daEmpresa?.id ?? '')}
      </div>
      ${contasProp.length ? `<div class="grade-2">
        ${selectCampo('conta_bancaria_id', 'Conta do proprietário', contasProp.map((cb) => [cb.id, textoConta(cb)]), contasProp[0].id, { vazio: false, largo: true })}
      </div>` : ''}

      ${contasProp.length ? `<div class="copiar-bloco">
        <div>
          <strong>Dados para o Pix ou transferência</strong>
          <pre id="dados-repasse">${esc(dadosRepasse(rep, contasProp[0], valor))}</pre>
        </div>
        <button type="button" class="btn btn-secundario btn-peq" data-copiar-dados>${icone('copy', 14)}<span>Copiar</span></button>
      </div>` : ''}

      <div class="campo largo-total" data-campo="comprovante">
        <label for="f-comprovante">Comprovante (PDF ou imagem)</label>
        <input id="f-comprovante" name="comprovante" type="file" accept="application/pdf,image/*">
        <span class="erro-campo" hidden></span>
      </div>
      ${campoTexto('observacao', 'Observação', '')}

      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario" data-cancelar>Cancelar</button>
        <button type="submit" class="btn btn-primario">${icone('check')}<span>Registrar repasse</span></button>
      </div>
    </form>`);

  const el = (n) => form.elements.namedItem(n);
  const caixaDados = form.querySelector('#dados-repasse');
  if (el('conta_bancaria_id')) {
    el('conta_bancaria_id').addEventListener('change', () => {
      const cb = contasProp.find((x) => x.id === el('conta_bancaria_id').value);
      caixaDados.textContent = dadosRepasse(rep, cb, valor);
    });
  }
  const botaoCopiar = form.querySelector('[data-copiar-dados]');
  if (botaoCopiar) botaoCopiar.addEventListener('click', () => copiar(caixaDados.textContent));
  el('pago_em').focus();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    const erros = {};
    if (!el('pago_em').value) erros.pago_em = 'Informe a data.';
    if (!el('forma_pagamento').value) erros.forma_pagamento = 'Escolha a forma.';
    if (mostrarErros(form, erros)) return;

    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;

    let caminho = null;
    const arquivo = el('comprovante').files?.[0];
    if (arquivo) {
      if (arquivo.size > 20 * 1024 * 1024) {
        botao.disabled = false;
        return mostrarErros(form, { comprovante: 'O arquivo passa de 20 MB.' });
      }
      caminho = `contratos/${mov.contrato_id}/repasses/${crypto.randomUUID()}-${arquivo.name.replace(/[^\w.-]+/g, '-')}`;
      const envio = await sb.storage.from(ESPACO).upload(caminho, arquivo, { contentType: arquivo.type || 'application/octet-stream' });
      if (envio.error) {
        botao.disabled = false;
        return mostrarErroForm(form, '.erro-form', mensagemErro(envio.error));
      }
    }

    const { error } = await sb.rpc('loc_repasse_pagar', {
      p_repasse_id: rep.id,
      p_dados: {
        pago_em: el('pago_em').value,
        forma_pagamento: el('forma_pagamento').value,
        conta_empresa_id: el('conta_empresa_id').value || null,
        conta_bancaria_id: el('conta_bancaria_id')?.value || null,
        comprovante_path: caminho,
        observacao: el('observacao').value.trim() || null,
      },
    });
    botao.disabled = false;
    if (error) {
      if (caminho) await sb.storage.from(ESPACO).remove([caminho]);
      return mostrarErroForm(form, '.erro-form', mensagemErro(error));
    }

    toast('Repasse registrado.');
    painel.remove();
    desenhar();
  });
}

function dadosRepasse(rep, cb, valor) {
  const linhas = [
    `Favorecido: ${rep.cliente?.nome ?? ''}`,
    rep.cliente?.cpf_cnpj ? `CPF/CNPJ: ${formatarCpfCnpj(rep.cliente.cpf_cnpj)}` : null,
    cb?.pix_chave ? `Chave Pix: ${cb.pix_chave}` : null,
    cb?.banco_nome ? `Banco: ${cb.banco_nome}${cb.banco_codigo ? ` (${cb.banco_codigo})` : ''}` : null,
    cb?.agencia ? `Agência: ${cb.agencia}` : null,
    cb?.conta ? `Conta: ${cb.conta}` : null,
    `Valor: ${formatarMoeda(valor)}`,
  ];
  return linhas.filter(Boolean).join('\n');
}

// ---------- cobrança: Pix gerado aqui, boleto emitido no banco ----------
function painelCobranca(caixa, mov, contrato, estado, desenhar, alvo) {
  const existente = (mov.cobrancas ?? []).find((cb) => cb.id === alvo) ?? null;
  const tipo = existente?.tipo ?? (alvo === 'pix' ? 'pix' : 'boleto');
  const conta = contaQueRecebe(estado);
  const total = (mov.lancamentos ?? []).filter((l) => !l.repasse_id).reduce((s, l) => s + Number(l.valor), 0);
  const valor = existente ? Number(existente.valor) : total;
  const ehPix = tipo === 'pix';

  const { painel, form } = abrirPainel(caixa, `
    <form class="card painel" novalidate>
      <h2 class="h-card">${existente ? 'Editar cobrança' : ehPix ? 'Gerar Pix copia e cola' : 'Colar boleto do banco'} ·
        ${esc(mesTexto(mov.competencia))}</h2>
      <p class="apoio">Movimento nº ${mov.codigo} · total do mês ${esc(formatarMoeda(total))}</p>

      ${ehPix ? `<p class="apoio">O Pix é montado com a chave da conta <strong>${esc(conta?.nome ?? '—')}</strong>.
         O inquilino cola no app do banco e paga. A baixa continua no botão “Registrar recebimento”.</p>`
        : `<p class="apoio">Emita o boleto no internet banking da Unicred e cole aqui a linha digitável
           (e o PDF, se quiser). Boleto tem que ser registrado no banco para poder ser pago —
           por isso o sistema ainda não emite sozinho.</p>`}

      <div class="grade-3">
        ${campo('valor', 'Valor (R$) *', valor.toFixed(2).replace('.', ','), { inputmode: 'decimal' })}
        ${campo('vencimento', 'Vencimento *', existente?.vencimento ?? mov.vencimento, { tipo: 'date' })}
        ${selectCampo('conta_empresa_id', 'Conta que recebe', opcoesContas(estado), existente?.conta_empresa_id ?? conta?.id ?? '')}
      </div>

      ${ehPix ? `
        <div class="campo largo-total" data-campo="pix_copia_cola">
          <label for="f-pix_copia_cola">Pix copia e cola</label>
          <textarea id="f-pix_copia_cola" name="pix_copia_cola" rows="3" readonly>${esc(existente?.pix_copia_cola ?? '')}</textarea>
          <span class="erro-campo" hidden></span>
        </div>
        <div class="acoes">
          <button type="button" class="btn btn-secundario btn-peq" data-gerar>${icone('qr', 14)}<span>Gerar</span></button>
          <button type="button" class="btn btn-secundario btn-peq" data-copiar-pix>${icone('copy', 14)}<span>Copiar</span></button>
        </div>`
      : `
        <div class="grade-2">
          ${campo('nosso_numero', 'Nosso número', existente?.nosso_numero ?? '')}
          ${campo('url_boleto', 'Link do boleto (se tiver)', existente?.url_boleto ?? '')}
        </div>
        ${campoTexto('linha_digitavel', 'Linha digitável (47 números)', existente?.linha_digitavel ?? '')}
        <div class="campo largo-total" data-campo="arquivo">
          <label for="f-arquivo">PDF do boleto</label>
          <input id="f-arquivo" name="arquivo" type="file" accept="application/pdf">
          <span class="erro-campo" hidden></span>
        </div>`}

      ${campoTexto('observacao', 'Observação', existente?.observacao ?? '')}
      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario" data-cancelar>Cancelar</button>
        <button type="submit" class="btn btn-primario">${icone('check')}<span>Salvar cobrança</span></button>
      </div>
    </form>`);

  const el = (n) => form.elements.namedItem(n);

  if (ehPix) {
    const gerar = () => {
      const escolhida = estado.contasEmpresa.find((x) => x.id === el('conta_empresa_id').value) ?? conta;
      try {
        el('pix_copia_cola').value = pixCopiaCola({
          chave: chavePix(escolhida?.pix_tipo, escolhida?.pix_chave),
          valor: lerNumeroBR(el('valor').value) ?? 0,
          nome: escolhida?.titular_nome ?? 'Projetar Imoveis',
          cidade: escolhida?.cidade ?? 'Ararangua',
          txid: txidDoMovimento(mov.codigo, mov.competencia),
        });
      } catch (erro) {
        mostrarErroForm(form, '.erro-form', erro.message);
      }
    };
    form.querySelector('[data-gerar]').addEventListener('click', () => { limparErros(form); gerar(); });
    form.querySelector('[data-copiar-pix]').addEventListener('click', () => {
      if (!el('pix_copia_cola').value) return toast('Gere o Pix primeiro.', 'erro');
      copiar(el('pix_copia_cola').value);
    });
    if (!existente) gerar();
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    const erros = {};
    const valorNovo = lerNumeroBR(el('valor').value);
    if (valorNovo == null || valorNovo <= 0) erros.valor = 'Informe o valor.';
    if (!el('vencimento').value) erros.vencimento = 'Informe o vencimento.';
    if (ehPix && !el('pix_copia_cola').value) erros.pix_copia_cola = 'Clique em Gerar.';
    if (!ehPix) {
      const digitos = el('linha_digitavel').value.replace(/\D/g, '');
      if (digitos && ![47, 48].includes(digitos.length)) erros.linha_digitavel = `Tem ${digitos.length} números; o certo são 47.`;
      if (!digitos && !el('url_boleto').value.trim() && !el('arquivo').files?.length) {
        erros.linha_digitavel = 'Cole a linha digitável, o link ou o PDF do boleto.';
      }
    }
    if (mostrarErros(form, erros)) return;

    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;

    let caminho = existente?.arquivo_path ?? null;
    const arquivo = ehPix ? null : el('arquivo').files?.[0];
    if (arquivo) {
      caminho = `contratos/${contrato.id}/boletos/${crypto.randomUUID()}-${arquivo.name.replace(/[^\w.-]+/g, '-')}`;
      const envio = await sb.storage.from(ESPACO).upload(caminho, arquivo, { contentType: arquivo.type || 'application/pdf' });
      if (envio.error) {
        botao.disabled = false;
        return mostrarErroForm(form, '.erro-form', mensagemErro(envio.error));
      }
    }

    const dados = {
      id: existente?.id ?? null,
      tipo,
      origem: 'manual',
      valor: valorNovo,
      vencimento: el('vencimento').value,
      conta_empresa_id: el('conta_empresa_id').value || null,
      observacao: el('observacao').value.trim() || null,
    };
    if (ehPix) {
      const escolhida = estado.contasEmpresa.find((x) => x.id === el('conta_empresa_id').value) ?? conta;
      dados.pix_chave = chavePix(escolhida?.pix_tipo, escolhida?.pix_chave);
      dados.pix_txid = txidDoMovimento(mov.codigo, mov.competencia);
      dados.pix_copia_cola = el('pix_copia_cola').value;
    } else {
      dados.nosso_numero = el('nosso_numero').value.trim() || null;
      dados.linha_digitavel = el('linha_digitavel').value.trim() || null;
      dados.url_boleto = el('url_boleto').value.trim() || null;
      dados.arquivo_path = caminho;
    }

    const { error } = await sb.rpc('loc_cobranca_salvar', { p_movimento_id: mov.id, p_dados: dados });
    botao.disabled = false;
    if (error) {
      if (arquivo && caminho) await sb.storage.from(ESPACO).remove([caminho]);
      return mostrarErroForm(form, '.erro-form', mensagemErro(error));
    }

    toast(ehPix ? 'Pix gerado e guardado no movimento.' : 'Boleto guardado no movimento.');
    painel.remove();
    desenhar();
  });
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

  const { painel, form } = abrirPainel(caixa, `
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
    </form>`);

  form.elements.namedItem('plano_conta_id').focus();
  form.elements.namedItem('plano_conta_id').addEventListener('change', (ev) => {
    const conta = estado.plano.find((p) => p.id === ev.target.value);
    const descricao = form.elements.namedItem('descricao');
    if (conta && !descricao.value.trim()) descricao.value = conta.nome;
  });

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
