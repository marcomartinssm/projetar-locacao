// Campos do cadastro de imóvel, usados no "Novo imóvel" e na edição da ficha.

import {
  esc, digitos, formatarCep, formatarMoeda, formatarNumeroBR, lerNumeroBR, mensagemErro, rotulo,
  UFS, TIPOS_IMOVEL, SITUACOES_IMOVEL, DESTINACOES, CHAVES_LOCAL, TIPOS_DIMOB,
} from './util.js';
import { campo, select, campoTexto } from './formulario.js';

export const enderecoImovel = (i) =>
  [[i.logradouro, i.numero].filter(Boolean).join(', '), i.complemento].filter(Boolean).join(' · ');

export const situacaoImovel = (situacao) =>
  `<span class="situacao-imovel ${esc(situacao)}"><i></i>${esc(rotulo(SITUACOES_IMOVEL, situacao))}</span>`;

export const textoPercentual = (v) => (v == null ? '' : `${formatarNumeroBR(v, 2).replace(/,00$/, '')}%`);

const textoDecimal = (v) => (v == null ? '' : formatarNumeroBR(v, 2));
const textoInteiro = (v) => (v == null ? '' : String(v));

export function mensagemErroImovel(error) {
  if (error?.code === '23505' && /codigo_imoview/.test(`${error.message} ${error.details || ''}`)) {
    return 'Esse código do Imoview já está em outro imóvel.';
  }
  return mensagemErro(error);
}

export function camposImovel(i = {}, { completo = true, antesDosValores = '' } = {}) {
  const decimal = (nome, rotuloCampo, valor, placeholder = '0,00') =>
    campo(nome, rotuloCampo, textoDecimal(valor), { inputmode: 'decimal', placeholder });
  const inteiro = (nome, rotuloCampo, valor) =>
    campo(nome, rotuloCampo, textoInteiro(valor), { inputmode: 'numeric' });
  const percentual = (nome, rotuloCampo, valor) =>
    campo(nome, rotuloCampo, valor == null ? '' : textoPercentual(valor).replace('%', ''), { inputmode: 'decimal', placeholder: '10' });

  return `
      <h2 class="h-secao">Identificação</h2>
      <div class="grade-4">
        ${select('tipo', 'Tipo *', TIPOS_IMOVEL, i.tipo)}
        ${select('destinacao', 'Destinação *', DESTINACOES, i.destinacao ?? 'residencial', { vazio: false })}
        ${select('situacao', 'Situação *', SITUACOES_IMOVEL, i.situacao ?? 'disponivel', { vazio: false })}
        ${inteiro('codigo_imoview', 'Código no Imoview', i.codigo_imoview)}
      </div>

      <h2 class="h-secao">Endereço</h2>
      <div class="grade-3">
        ${campo('cep', 'CEP', formatarCep(i.cep), { mascara: 'cep', placeholder: '00000-000', inputmode: 'numeric' })}
        ${campo('logradouro', 'Rua', i.logradouro, { largo: true })}
        ${campo('numero', 'Número', i.numero)}
        ${campo('complemento', 'Complemento', i.complemento, { placeholder: 'Apto, sala, bloco' })}
        ${campo('bairro', 'Bairro', i.bairro)}
        ${campo('cidade', 'Cidade', i.cidade)}
        ${select('uf', 'UF', UFS.map((u) => [u, u]), i.uf)}
        ${campo('condominio_nome', 'Condomínio / edifício', i.condominio_nome)}
      </div>

      <h2 class="h-secao">Características</h2>
      <div class="grade-4">
        ${decimal('area_privativa_m2', 'Área privativa (m²)', i.area_privativa_m2, '')}
        ${decimal('area_total_m2', 'Área total (m²)', i.area_total_m2, '')}
        ${inteiro('quartos', 'Quartos', i.quartos)}
        ${inteiro('suites', 'Suítes', i.suites)}
        ${inteiro('banheiros', 'Banheiros', i.banheiros)}
        ${inteiro('vagas', 'Vagas', i.vagas)}
        ${inteiro('andar', 'Andar', i.andar)}
      </div>
      <div class="checks-linha">
        <label class="check"><input type="checkbox" name="mobiliado" ${i.mobiliado ? 'checked' : ''}><span>Mobiliado</span></label>
        <label class="check"><input type="checkbox" name="permite_animais" ${i.permite_animais ? 'checked' : ''}><span>Permite animais</span></label>
      </div>
${completo ? `
      <h2 class="h-secao">Documentação</h2>
      <div class="grade-3">
        ${campo('matricula', 'Matrícula', i.matricula)}
        ${campo('cartorio', 'Cartório', i.cartorio)}
        ${select('tipo_dimob', 'Tipo DIMOB', TIPOS_DIMOB, i.tipo_dimob ?? 'urbano', { vazio: false })}
      </div>

      <h2 class="h-secao">Chaves e controle</h2>
      <div class="grade-3">
        ${select('chaves_local', 'Onde estão as chaves', CHAVES_LOCAL, i.chaves_local)}
        ${campo('chaves_identificador', 'Nº do chaveiro / identificação', i.chaves_identificador)}
        ${campo('vago_desde', 'Vago desde', i.vago_desde, { tipo: 'date' })}
        ${campoTexto('observacoes', 'Observações', i.observacoes)}
      </div>` : ''}

      ${antesDosValores}

      <h2 class="h-secao">Valores</h2>
      <div class="grade-3">
        ${decimal('valor_aluguel', 'Valor do aluguel (R$)', i.valor_aluguel)}
        ${decimal('valor_condominio', 'Condomínio mensal (R$)', i.valor_condominio)}
        <div class="campo">
          <label>IPTU anual (R$)</label>
          <div class="campo-leitura">${i.valor_iptu_anual != null ? esc(formatarMoeda(i.valor_iptu_anual)) : '—'}</div>
          <small class="t-muted">Soma automática dos IPTUs da aba Contas</small>
        </div>
        ${decimal('valor_seguro_incendio_anual', 'Seguro incêndio anual (R$)', i.valor_seguro_incendio_anual)}
        ${percentual('taxa_administracao', 'Taxa de administração (%)', i.taxa_administracao)}
        ${percentual('taxa_intermediacao', 'Taxa de intermediação (%)', i.taxa_intermediacao)}
      </div>`;
}

const TEXTOS = ['tipo', 'destinacao', 'situacao', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
  'condominio_nome', 'matricula', 'cartorio', 'tipo_dimob', 'chaves_local', 'chaves_identificador', 'vago_desde', 'observacoes'];
const INTEIROS = ['codigo_imoview', 'quartos', 'suites', 'banheiros', 'vagas', 'andar'];
const DECIMAIS = ['area_privativa_m2', 'area_total_m2', 'valor_aluguel', 'valor_condominio', 'valor_seguro_incendio_anual',
  'taxa_administracao', 'taxa_intermediacao'];

// Lê o formulário. Só entram os campos que existem na tela (o "Novo imóvel" tem menos campos).
export function lerImovel(form) {
  const dados = {};
  const erros = {};
  const el = (nome) => form.elements.namedItem(nome);

  for (const nome of TEXTOS) {
    if (!el(nome)) continue;
    dados[nome] = el(nome).value.trim() || null;
  }

  if (el('cep')) {
    const cep = digitos(el('cep').value);
    dados.cep = cep || null;
    if (cep && cep.length !== 8) erros.cep = 'CEP deve ter 8 números.';
  }

  for (const nome of INTEIROS) {
    if (!el(nome)) continue;
    const valor = el(nome).value.trim();
    if (!valor) { dados[nome] = null; continue; }
    if (!/^\d+$/.test(valor)) { erros[nome] = 'Use só números.'; continue; }
    dados[nome] = Number(valor);
  }

  for (const nome of DECIMAIS) {
    if (!el(nome)) continue;
    const valor = el(nome).value.trim();
    if (!valor) { dados[nome] = null; continue; }
    const numero = lerNumeroBR(valor);
    if (numero == null || numero < 0) { erros[nome] = 'Valor inválido.'; continue; }
    dados[nome] = numero;
  }
  for (const nome of ['taxa_administracao', 'taxa_intermediacao']) {
    if (dados[nome] != null && dados[nome] > 100) erros[nome] = 'Percentual até 100.';
  }

  for (const nome of ['mobiliado', 'permite_animais']) {
    if (el(nome)) dados[nome] = el(nome).checked;
  }

  if (el('tipo') && !dados.tipo) erros.tipo = 'Escolha o tipo do imóvel.';
  return { dados, erros };
}
