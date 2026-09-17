// Campos do contrato, usados no "Gerar contrato" (a partir da negociação) e na edição da ficha.


import {
  esc, icone, iniciais, formatarData, formatarNumeroBR, lerNumeroBR, rotulo,
  GARANTIAS, FORMAS_COBRANCA, INDICES_REAJUSTE, FORMAS_INTERMEDIACAO,
} from './util.js';
import { sb } from './supabase.js';
import { campo, select, campoTexto } from './formulario.js';
import { textoPercentual } from './imovel-form.js';

const decimal = (v) => (v == null ? '' : formatarNumeroBR(v, 2));
const pct = (v) => (v == null ? '' : textoPercentual(v).replace('%', ''));
const inteiro = (v) => (v == null ? '' : String(v));

// ---------- as mesmas contas que o banco faz (aqui só para mostrar na hora) ----------
const emData = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
const paraIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const somarMeses = (d, meses) => new Date(d.getFullYear(), d.getMonth() + meses, d.getDate());
const diaDoMes = (d, dia) => {
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth(), Math.min(dia, ultimo));
};

export function calcularContrato({ inicio, prazo, dia, forma, indice }) {
  const conta = { fim: null, primeiroVencimento: null, proximoReajuste: null };
  if (!inicio) return conta;
  const d = emData(inicio);
  if (prazo > 0) {
    const fim = somarMeses(d, prazo);
    fim.setDate(fim.getDate() - 1);
    conta.fim = paraIso(fim);
  }
  if (dia >= 1 && dia <= 31) {
    let v = diaDoMes(d, dia);
    if (v < d) v = diaDoMes(new Date(d.getFullYear(), d.getMonth() + 1, 1), dia);
    if ((forma || 'pos') === 'pos') v = diaDoMes(new Date(v.getFullYear(), v.getMonth() + 1, 1), dia);
    conta.primeiroVencimento = paraIso(v);
  }
  if (indice !== 'sem_reajuste') conta.proximoReajuste = paraIso(somarMeses(d, 12));
  return conta;
}

// A lista de seguradoras é um cadastro: quem digitar um nome novo faz ele entrar na lista.
export async function carregarSeguradoras() {
  const { data, error } = await sb.from('loc_seguradoras').select('nome').eq('ativo', true).order('nome');
  return error ? [] : data.map((s) => s.nome);
}

export async function guardarSeguradoras(dados) {
  for (const nome of [dados.garantia_seguradora, dados.seguro_seguradora]) {
    if (nome) await sb.rpc('loc_guardar_seguradora', { p_nome: nome });
  }
}

const leitura = (nome, rotuloCampo, dica) => `
  <div class="campo">
    <label>${rotuloCampo}</label>
    <div class="campo-leitura" data-leitura="${nome}">—</div>
    <small class="t-muted">${dica}</small>
  </div>`;

// ---------- montagem ----------
// c: contrato salvo (ou {} com os padrões vindos da negociação), fiadores: fichas vindas da negociação
export function montarFormContrato(el, { c = {}, garantiaTipo, fiadores = [], seguradoras = [], textoBotao, aoCancelar, aoSalvar }) {
  const novo = !c.id;
  const gar = garantiaTipo || c.garantia_tipo || 'sem_garantia';
  const camposGarantia = {
    caucao: [['garantia_valor', 'Valor da caução (R$)', decimal(c.garantia_valor), 'decimal']],
    seguro_fianca: [
      ['garantia_seguradora', 'Seguradora', c.garantia_seguradora, 'seguradora'], ['garantia_apolice', 'Nº da apólice', c.garantia_apolice],
      ['garantia_inicio', 'Início da vigência', c.garantia_inicio, 'date'], ['garantia_fim', 'Fim da vigência', c.garantia_fim, 'date'],
      ['garantia_valor', 'Valor (R$)', decimal(c.garantia_valor), 'decimal'],
    ],
    titulo_capitalizacao: [
      ['garantia_apolice', 'Nº do título', c.garantia_apolice], ['garantia_valor', 'Valor (R$)', decimal(c.garantia_valor), 'decimal'],
      ['garantia_inicio', 'Início', c.garantia_inicio, 'date'], ['garantia_fim', 'Término', c.garantia_fim, 'date'],
    ],
    credpago: [['garantia_apolice', 'Nº da análise / contrato', c.garantia_apolice]],
  }[gar] ?? [];

  const campoGarantia = ([nome, rotuloCampo, valor, tipo]) => campo(nome, rotuloCampo, valor, {
    tipo: tipo === 'date' ? 'date' : 'text',
    inputmode: tipo === 'decimal' ? 'decimal' : undefined,
    lista: tipo === 'seguradora' ? 'lista-seguradoras' : undefined,
    placeholder: tipo === 'seguradora' ? 'Escolha na lista ou digite uma nova' : undefined,
  });

  el.innerHTML = `
    <datalist id="lista-seguradoras">${seguradoras.map((nome) => `<option value="${esc(nome)}"></option>`).join('')}</datalist>
    <form class="card painel form-contrato" novalidate>
      <h2 class="h-secao">Datas e cobrança</h2>
      <div class="grade-3">
        ${campo('inicio', 'Início do contrato *', c.inicio, { tipo: 'date' })}
        ${campo('prazo_meses', 'Prazo (meses) *', inteiro(c.prazo_meses), { inputmode: 'numeric' })}
        ${leitura('fim', 'Fim do contrato', 'Calculado pelo início e pelo prazo')}
        ${campo('valor_aluguel', 'Valor do aluguel (R$) *', decimal(c.valor_aluguel), { inputmode: 'decimal' })}
        ${campo('dia_vencimento', 'Dia de vencimento *', inteiro(c.dia_vencimento), { inputmode: 'numeric' })}
        ${select('forma_cobranca', 'Forma de cobrança', FORMAS_COBRANCA, c.forma_cobranca ?? 'pos', { vazio: false })}
        ${leitura('primeiro_vencimento', 'Primeiro vencimento', 'Calculado pela forma de cobrança')}
      </div>

      <h2 class="h-secao">Reajuste</h2>
      <div class="grade-3">
        ${select('indice_reajuste', 'Índice de reajuste', INDICES_REAJUSTE, c.indice_reajuste ?? 'igpm', { vazio: false })}
        ${leitura('proximo_reajuste', 'Próximo reajuste', 'Um ano depois do início')}
      </div>

      <h2 class="h-secao">Repasse ao proprietário</h2>
      <div class="opcoes-linha">
        <label class="check"><input type="radio" name="repasse_tipo" value="dia_fixo" ${(c.repasse_tipo ?? 'dia_fixo') === 'dia_fixo' ? 'checked' : ''}><span>Fixo, todo dia</span></label>
        <input class="campo-mini" name="repasse_dia" inputmode="numeric" value="${esc(inteiro(c.repasse_dia))}" aria-label="Dia do repasse">
        <span class="t-muted">do mês</span>
      </div>
      <div class="opcoes-linha">
        <label class="check"><input type="radio" name="repasse_tipo" value="apos_recebimento" ${c.repasse_tipo === 'apos_recebimento' ? 'checked' : ''}><span>Após</span></label>
        <input class="campo-mini" name="repasse_dias" inputmode="numeric" value="${esc(inteiro(c.repasse_dias))}" aria-label="Dias após o recebimento">
        <span class="t-muted">dias do recebimento do aluguel</span>
      </div>
      <label class="check"><input type="checkbox" name="retem_irrf" ${c.retem_irrf ? 'checked' : ''}><span>Retém imposto de renda (IRRF) no repasse</span></label>

      <h2 class="h-secao">Garantia · ${esc(rotulo(GARANTIAS, gar))}</h2>
      ${gar === 'fiador' ? (fiadores.length
        ? `<div class="prop-lista">${fiadores.map((f) => `
            <div class="prop-linha">
              <span class="avatar pequeno">${esc(iniciais(f.nome))}</span>
              <div class="prop-info"><strong>${esc(f.nome)}</strong><small>Código ${f.codigo} · veio da negociação</small></div>
            </div>`).join('')}</div>`
        : '<p class="t-faint">Nenhum fiador na negociação.</p>')
        : ''}
      ${camposGarantia.length ? `<div class="grade-3">${camposGarantia.map(campoGarantia).join('')}</div>` : ''}
      ${gar === 'sem_garantia' ? '<p class="t-faint">Contrato sem garantia.</p>' : ''}
      <div class="grade-3">${campoTexto('garantia_observacao', 'Observação da garantia', c.garantia_observacao)}</div>

      <h2 class="h-secao">Seguro incêndio</h2>
      <label class="check"><input type="checkbox" name="seguro_incendio" ${c.seguro_incendio ? 'checked' : ''}><span>Tem seguro incêndio</span></label>
      <div class="grade-3" data-bloco-seguro>
        ${campo('seguro_seguradora', 'Seguradora', c.seguro_seguradora, { lista: 'lista-seguradoras', placeholder: 'Escolha na lista ou digite uma nova' })}
        ${campo('seguro_apolice', 'Nº da apólice', c.seguro_apolice)}
        ${campo('seguro_valor_anual', 'Valor anual (R$)', decimal(c.seguro_valor_anual), { inputmode: 'decimal' })}
        ${campo('seguro_inicio', 'Início da vigência', c.seguro_inicio, { tipo: 'date' })}
        ${campo('seguro_fim', 'Fim da vigência', c.seguro_fim, { tipo: 'date' })}
      </div>

      <h2 class="h-secao">Multa, juros e rescisão</h2>
      <div class="grade-4">
        ${campo('multa_atraso', 'Multa por atraso (%)', pct(novo ? c.multa_atraso ?? 10 : c.multa_atraso), { inputmode: 'decimal' })}
        ${campo('juros_mes', 'Juros ao mês (%)', pct(novo ? c.juros_mes ?? 1 : c.juros_mes), { inputmode: 'decimal' })}
        ${campo('desconto_pontualidade', 'Desconto pontualidade (R$)', decimal(c.desconto_pontualidade), { inputmode: 'decimal' })}
        <div></div>
        ${campo('multa_rescisao_alugueis', 'Multa de rescisão (aluguéis)', pct(novo ? c.multa_rescisao_alugueis ?? 3 : c.multa_rescisao_alugueis), { inputmode: 'decimal' })}
        ${campo('sem_multa_apos_meses', 'Sem multa após (meses)', inteiro(c.sem_multa_apos_meses), { inputmode: 'numeric' })}
      </div>
      <p class="apoio">A multa de rescisão é proporcional ao tempo que falta do contrato.</p>

      <h2 class="h-secao">Taxas da imobiliária</h2>
      <div class="grade-4">
        ${campo('taxa_administracao', 'Taxa de administração (%)', pct(c.taxa_administracao), { inputmode: 'decimal' })}
        ${campo('taxa_adm_multas', 'Taxa adm sobre multas (%)', pct(c.taxa_adm_multas), { inputmode: 'decimal' })}
        ${campo('taxa_adm_juros', 'Taxa adm sobre juros (%)', pct(c.taxa_adm_juros), { inputmode: 'decimal' })}
        ${campo('taxa_adm_multa_rescisoria', 'Taxa adm sobre multa rescisória (%)', pct(c.taxa_adm_multa_rescisoria), { inputmode: 'decimal' })}
        ${campo('taxa_intermediacao', 'Taxa de intermediação (%)', pct(c.taxa_intermediacao), { inputmode: 'decimal' })}
        ${select('intermediacao_forma', 'Intermediação cobrada', FORMAS_INTERMEDIACAO, c.intermediacao_forma ?? 'unica', { vazio: false })}
        ${campo('intermediacao_parcelas', 'Parcelas', inteiro(c.intermediacao_parcelas), { inputmode: 'numeric' })}
        ${campo('intermediacao_a_partir_de', 'A partir do aluguel nº', inteiro(c.intermediacao_a_partir_de), { inputmode: 'numeric' })}
      </div>
      <p class="apoio">As taxas sobre multas, juros e multa rescisória são a parte da imobiliária quando o locatário paga esses valores. O restante vai para o proprietário.</p>

      <h2 class="h-secao">Anotações</h2>
      <div class="grade-2">
        ${campoTexto('anotacoes', 'Anotações internas', c.anotacoes)}
        ${campoTexto('texto_acerto_contas', 'Texto do acerto de contas', c.texto_acerto_contas)}
      </div>

      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primario">${icone('check')}<span>${esc(textoBotao)}</span></button>
      </div>
    </form>`;

  const form = el.querySelector('form');
  const f = (nome) => form.elements.namedItem(nome);

  // ---------- campos calculados ao vivo ----------
  const mostrar = (nome, valor) => {
    const caixa = form.querySelector(`[data-leitura="${nome}"]`);
    caixa.textContent = valor ? formatarData(valor) : '—';
  };
  const recalcular = () => {
    const conta = calcularContrato({
      inicio: f('inicio').value,
      prazo: Number(f('prazo_meses').value.trim()),
      dia: Number(f('dia_vencimento').value.trim()),
      forma: f('forma_cobranca').value,
      indice: f('indice_reajuste').value,
    });
    mostrar('fim', conta.fim);
    mostrar('primeiro_vencimento', conta.primeiroVencimento);
    mostrar('proximo_reajuste', conta.proximoReajuste);
  };
  for (const nome of ['inicio', 'prazo_meses', 'dia_vencimento', 'forma_cobranca', 'indice_reajuste']) {
    f(nome).addEventListener('input', recalcular);
    f(nome).addEventListener('change', recalcular);
  }
  recalcular();

  // ---------- blocos que aparecem conforme a escolha ----------
  const blocoSeguro = form.querySelector('[data-bloco-seguro]');
  const verSeguro = () => { blocoSeguro.hidden = !f('seguro_incendio').checked; };
  f('seguro_incendio').addEventListener('change', verSeguro);
  verSeguro();

  const parcelas = form.querySelector('[data-campo="intermediacao_parcelas"]');
  const verParcelas = () => { parcelas.hidden = f('intermediacao_forma').value !== 'parcelada'; };
  f('intermediacao_forma').addEventListener('change', verParcelas);
  verParcelas();

  form.querySelector('[data-acao="cancelar"]').addEventListener('click', aoCancelar);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    aoSalvar(form);
  });

  return form;
}

// ---------- leitura do formulário ----------
const TEXTOS = ['garantia_seguradora', 'garantia_apolice', 'garantia_observacao', 'seguro_seguradora', 'seguro_apolice',
  'anotacoes', 'texto_acerto_contas'];
const DATAS = ['inicio', 'garantia_inicio', 'garantia_fim', 'seguro_inicio', 'seguro_fim'];
const INTEIROS = ['prazo_meses', 'dia_vencimento', 'repasse_dia', 'repasse_dias', 'sem_multa_apos_meses',
  'intermediacao_parcelas', 'intermediacao_a_partir_de'];
const DECIMAIS = ['valor_aluguel', 'garantia_valor', 'seguro_valor_anual', 'desconto_pontualidade', 'multa_rescisao_alugueis'];
const PERCENTUAIS = ['multa_atraso', 'juros_mes', 'taxa_administracao', 'taxa_adm_multas', 'taxa_adm_juros',
  'taxa_adm_multa_rescisoria', 'taxa_intermediacao'];

export function lerContrato(form) {
  const dados = {};
  const erros = {};
  const el = (nome) => form.elements.namedItem(nome);

  for (const nome of [...TEXTOS, ...DATAS]) {
    if (el(nome)) dados[nome] = el(nome).value.trim() || null;
  }
  for (const nome of ['forma_cobranca', 'indice_reajuste', 'intermediacao_forma']) dados[nome] = el(nome).value;
  dados.repasse_tipo = form.querySelector('[name="repasse_tipo"]:checked')?.value ?? 'dia_fixo';
  dados.retem_irrf = el('retem_irrf').checked;
  dados.seguro_incendio = el('seguro_incendio').checked;

  for (const nome of INTEIROS) {
    const valor = el(nome).value.trim();
    if (!valor) { dados[nome] = null; continue; }
    if (!/^\d+$/.test(valor)) { erros[nome] = 'Use só números.'; continue; }
    dados[nome] = Number(valor);
  }
  for (const nome of [...DECIMAIS, ...PERCENTUAIS]) {
    if (!el(nome)) { dados[nome] = null; continue; }
    const valor = el(nome).value.trim();
    if (!valor) { dados[nome] = null; continue; }
    const numero = lerNumeroBR(valor);
    if (numero == null || numero < 0) { erros[nome] = 'Valor inválido.'; continue; }
    if (PERCENTUAIS.includes(nome) && numero > 100) { erros[nome] = 'Percentual de 0 a 100.'; continue; }
    dados[nome] = numero;
  }

  if (!dados.inicio) erros.inicio = 'Informe o início do contrato.';
  if (!dados.prazo_meses) erros.prazo_meses = 'Informe o prazo em meses.';
  if (!dados.valor_aluguel) erros.valor_aluguel = 'Informe o valor do aluguel.';
  if (!dados.dia_vencimento || dados.dia_vencimento < 1 || dados.dia_vencimento > 31) erros.dia_vencimento = 'Dia de 1 a 31.';
  // Estes campos não têm caixa de erro própria: viram aviso no rodapé do formulário.
  let aviso = null;
  if (dados.repasse_tipo === 'dia_fixo' && (!dados.repasse_dia || dados.repasse_dia < 1 || dados.repasse_dia > 31)) {
    aviso = 'Informe o dia do repasse (1 a 31).';
  } else if (dados.repasse_tipo === 'apos_recebimento' && dados.repasse_dias == null) {
    aviso = 'Informe em quantos dias depois do recebimento o repasse é feito.';
  }
  if (dados.repasse_tipo === 'dia_fixo') dados.repasse_dias = null;
  else dados.repasse_dia = null;
  if (dados.intermediacao_forma === 'parcelada' && !dados.intermediacao_parcelas) erros.intermediacao_parcelas = 'Informe as parcelas.';
  if (dados.intermediacao_forma === 'unica') dados.intermediacao_parcelas = null;

  return { dados, erros, aviso };
}
