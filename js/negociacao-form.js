// Formulário da negociação, usado na "Nova negociação" e no "Editar" da ficha.

import { sb } from './supabase.js';
import { esc, icone, formatarNumeroBR, lerNumeroBR, mensagemErro, GARANTIAS } from './util.js';
import { campo, select, campoTexto, limparErros, mostrarErros, mostrarErroForm } from './formulario.js';
import { textoPercentual } from './imovel-form.js';
import { montarEscolhaImovel } from './componentes/escolha-imovel.js';
import { montarEscolhaCliente } from './componentes/escolha-cliente.js';
import { montarListaClientes } from './componentes/lista-clientes.js';

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const textoDecimal = (v) => (v == null ? '' : formatarNumeroBR(v, 2));
const textoPct = (v) => (v == null ? '' : textoPercentual(v).replace('%', ''));

export async function carregarEquipe() {
  const { data, error } = await sb.from('loc_equipe').select('id, nome, corretor, captador, ativo').order('nome');
  if (error) throw error;
  return data;
}

// n: negociação salva (ou {}), pessoas: [{papel, cliente}], imovel: imóvel completo, locatario: ficha
export function montarFormNegociacao(el, { n = {}, pessoas = [], imovel = null, locatario = null, equipe, textoBotao, aoCancelar, aoSalvar }) {
  const nova = !n.id;
  const opcoesEquipe = (tipo, atual) => equipe
    .filter((p) => (p[tipo] && p.ativo) || p.id === atual)
    .map((p) => [p.id, p.nome]);
  const padrao = (tipo) => equipe.find((p) => p[tipo] && p.ativo)?.id ?? '';

  el.innerHTML = `
    <form class="card painel form-negociacao" novalidate>
      <h2 class="h-secao">Imóvel</h2>
      <div data-campo="imovel_id"><div data-slot="imovel"></div><span class="erro-campo" hidden></span></div>

      <h2 class="h-secao">Locatário</h2>
      <div data-campo="locatario_cliente_id"><div data-slot="locatario"></div><span class="erro-campo" hidden></span></div>
      <div class="sub-bloco">
        <span class="sub-titulo">Locatários solidários</span>
        <div data-slot="solidarios"></div>
      </div>

      <h2 class="h-secao">Valores e prazo</h2>
      <div class="grade-4">
        ${campo('valor_aluguel', 'Valor do aluguel (R$)', textoDecimal(n.valor_aluguel), { inputmode: 'decimal', placeholder: '0,00' })}
        ${campo('prazo_meses', 'Prazo (meses)', n.prazo_meses ?? '', { inputmode: 'numeric' })}
        ${campo('inicio_previsto', 'Início previsto', n.inicio_previsto ?? '', { tipo: 'date' })}
        ${campo('data_negociacao', 'Data da negociação', n.data_negociacao ?? hoje(), { tipo: 'date' })}
        ${campo('taxa_administracao', 'Taxa de administração (%)', textoPct(n.taxa_administracao), { inputmode: 'decimal' })}
        ${campo('taxa_intermediacao', 'Taxa de intermediação (%)', textoPct(n.taxa_intermediacao), { inputmode: 'decimal' })}
      </div>
      <p class="apoio" data-sugestao hidden></p>

      <h2 class="h-secao">Garantia</h2>
      <div class="grade-3">
        ${select('garantia_tipo', 'Tipo de garantia', GARANTIAS, n.garantia_tipo ?? 'fiador', { vazio: false })}
      </div>
      <div class="sub-bloco" data-bloco-fiadores>
        <span class="sub-titulo">Fiadores</span>
        <div data-slot="fiadores"></div>
      </div>

      <h2 class="h-secao">Corretores</h2>
      <div class="grade-3">
        ${select('corretor_id', 'Corretor que alugou', opcoesEquipe('corretor', n.corretor_id), nova ? padrao('corretor') : n.corretor_id)}
        ${select('captador_id', 'Captador do imóvel', opcoesEquipe('captador', n.captador_id), nova ? padrao('captador') : n.captador_id)}
      </div>

      <h2 class="h-secao">Anotações</h2>
      <div class="grade-3">${campoTexto('anotacoes', 'Anotações internas', n.anotacoes)}</div>

      <p class="apoio">Os detalhes da garantia, do seguro incêndio e das regras de cobrança entram quando o contrato for gerado.</p>
      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primario">${icone('check')}<span>${esc(textoBotao)}</span></button>
      </div>
    </form>`;

  const form = el.querySelector('form');
  const f = (nome) => form.elements.namedItem(nome);
  let imovelAtual = imovel;
  let locatarioAtual = locatario;

  // Valores do imóvel viram sugestão nos campos vazios.
  const sugestao = form.querySelector('[data-sugestao]');
  const sugerirDoImovel = (i) => {
    if (!i) return;
    const usados = [];
    const preencher = (nome, valor, texto) => {
      if (valor == null || f(nome).value.trim()) return;
      f(nome).value = texto(valor);
      usados.push(nome);
    };
    preencher('valor_aluguel', i.valor_aluguel, textoDecimal);
    preencher('taxa_administracao', i.taxa_administracao, textoPct);
    preencher('taxa_intermediacao', i.taxa_intermediacao, textoPct);
    if (usados.length) {
      sugestao.textContent = 'Valor do aluguel e taxas vieram do cadastro do imóvel. Ajuste se a negociação for diferente.';
      sugestao.hidden = false;
    }
  };

  montarEscolhaImovel(form.querySelector('[data-slot="imovel"]'), {
    escolhido: imovel,
    aoMudar: (i) => { imovelAtual = i; sugerirDoImovel(i); },
  });
  if (nova) sugerirDoImovel(imovel); // nova negociação aberta a partir de um imóvel

  montarEscolhaCliente(form.querySelector('[data-slot="locatario"]'), {
    escolhido: locatario,
    placeholder: 'Buscar locatário por nome, telefone ou CPF',
    aoMudar: (c) => { locatarioAtual = c; },
  });

  const clientesDe = (papel) => pessoas.filter((p) => p.papel === papel).map((p) => p.cliente);
  const solidarios = montarListaClientes(form.querySelector('[data-slot="solidarios"]'), {
    iniciais: clientesDe('solidario'),
    placeholder: 'Adicionar locatário solidário',
    ignorar: (c) => c.id === locatarioAtual?.id,
  });
  const fiadores = montarListaClientes(form.querySelector('[data-slot="fiadores"]'), {
    iniciais: clientesDe('fiador'),
    placeholder: 'Adicionar fiador',
    vazio: 'Nenhum fiador ainda.',
    ignorar: (c) => c.id === locatarioAtual?.id,
  });

  const blocoFiadores = form.querySelector('[data-bloco-fiadores]');
  const mostrarFiadores = () => { blocoFiadores.hidden = f('garantia_tipo').value !== 'fiador'; };
  f('garantia_tipo').addEventListener('change', mostrarFiadores);
  mostrarFiadores();

  form.querySelector('[data-acao="cancelar"]').addEventListener('click', aoCancelar);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    const erros = {};

    if (!imovelAtual) erros.imovel_id = 'Escolha o imóvel.';
    if (!locatarioAtual) erros.locatario_cliente_id = 'Escolha o locatário.';

    const dados = {
      imovel_id: imovelAtual?.id ?? null,
      locatario_cliente_id: locatarioAtual?.id ?? null,
      data_negociacao: f('data_negociacao').value || null,
      inicio_previsto: f('inicio_previsto').value || null,
      garantia_tipo: f('garantia_tipo').value,
      corretor_id: f('corretor_id').value || null,
      captador_id: f('captador_id').value || null,
      anotacoes: f('anotacoes').value.trim() || null,
    };

    const valor = f('valor_aluguel').value.trim();
    dados.valor_aluguel = valor ? lerNumeroBR(valor) : null;
    if (valor && (dados.valor_aluguel == null || dados.valor_aluguel <= 0)) erros.valor_aluguel = 'Valor inválido.';

    const prazo = f('prazo_meses').value.trim();
    dados.prazo_meses = prazo ? Number(prazo) : null;
    if (prazo && (!/^\d+$/.test(prazo) || Number(prazo) < 1)) erros.prazo_meses = 'Use só números (meses).';

    for (const nome of ['taxa_administracao', 'taxa_intermediacao']) {
      const texto = f(nome).value.trim();
      dados[nome] = texto ? lerNumeroBR(texto) : null;
      if (texto && (dados[nome] == null || dados[nome] < 0 || dados[nome] > 100)) erros[nome] = 'Percentual de 0 a 100.';
    }

    if (locatarioAtual && (solidarios.tem(locatarioAtual.id) || fiadores.tem(locatarioAtual.id))) {
      mostrarErros(form, erros);
      return mostrarErroForm(form, '.erro-form', 'O locatário não pode ser também solidário ou fiador. Remova da lista.');
    }
    if (mostrarErros(form, erros)) return;

    dados.solidarios = solidarios.ids();
    dados.fiadores = dados.garantia_tipo === 'fiador' ? fiadores.ids() : [];

    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    const { data, error } = await sb.rpc('loc_salvar_negociacao', { p_id: n.id ?? null, p_dados: dados });
    botao.disabled = false;
    if (error) return mostrarErroForm(form, '.erro-form', mensagemErro(error));
    aoSalvar(data);
  });

  return form;
}
