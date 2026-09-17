// Gerar contrato a partir de uma negociação fechada.

import { sb } from '../supabase.js';
import { esc, icone, formatarMoeda, mensagemErro, toast, rotulo, GARANTIAS } from '../util.js';
import { limparErros, mostrarErros, mostrarErroForm } from '../formulario.js';
import { montarFormContrato, lerContrato, carregarSeguradoras, guardarSeguradoras } from '../contrato-form.js';
import { carregarImovelNegociacao, tituloImovel } from '../componentes/escolha-imovel.js';

export async function telaContratoGerar(el, negociacaoId) {
  el.innerHTML = '<div class="carregando">Carregando negociação…</div>';

  const [negociacao, pessoas] = await Promise.all([
    sb.from('loc_negociacoes')
      .select('*, locatario:cad_clientes!loc_negociacoes_locatario_cliente_id_fkey(id, codigo, nome)')
      .eq('id', negociacaoId).maybeSingle(),
    sb.from('loc_negociacoes_pessoas').select('papel, cliente:cad_clientes(id, codigo, nome)').eq('negociacao_id', negociacaoId),
  ]);

  const erro = negociacao.error || pessoas.error;
  if (erro) return void (el.innerHTML = `<div class="card vazio">${esc(mensagemErro(erro))}</div>`);
  if (!negociacao.data) return void (el.innerHTML = '<div class="card vazio">Negociação não encontrada. <a href="#/negociacoes">Voltar</a></div>');

  const n = negociacao.data;
  if (n.situacao !== 'fechada') {
    el.innerHTML = `<div class="card vazio">
      ${n.situacao === 'contrato_gerado' ? 'Esta negociação já virou contrato.' : 'Feche a negociação antes de gerar o contrato.'}
      <a href="#/negociacoes/${n.id}">Voltar para a negociação</a></div>`;
    return;
  }

  let imovel;
  let conferencia;
  let seguradoras;
  try {
    [imovel, conferencia, seguradoras] = await Promise.all([
      carregarImovelNegociacao(n.imovel_id),
      sb.rpc('loc_conferir_negociacao', { p_negociacao_id: n.id }).then((r) => { if (r.error) throw r.error; return r.data; }),
      carregarSeguradoras(),
    ]);
  } catch (e) {
    el.innerHTML = `<div class="card vazio">${esc(mensagemErro(e))}</div>`;
    return;
  }
  if (!el.isConnected) return;

  const pendencias = conferencia.filter((p) => p.faltando.length);
  const fiadores = pessoas.data.filter((p) => p.papel === 'fiador').map((p) => p.cliente);

  if (pendencias.length) {
    el.innerHTML = `
      <nav class="trilha"><a href="#/negociacoes/${n.id}">Negociação ${n.codigo}</a>${icone('chevronRight', 14)}<span>Gerar contrato</span></nav>
      <div class="aviso dourado">${icone('alert', 20)}<div>
        <strong>Ainda falta completar ${pendencias.length === 1 ? 'uma ficha' : `${pendencias.length} fichas`}</strong>
        <p>${pendencias.map((p) => esc(p.nome)).join(', ')}. Volte para a negociação, complete as fichas e tente de novo.</p>
      </div></div>
      <div><a class="btn btn-secundario" href="#/negociacoes/${n.id}">Voltar para a negociação</a></div>`;
    return;
  }

  el.innerHTML = `
    <nav class="trilha"><a href="#/negociacoes/${n.id}">Negociação ${n.codigo}</a>${icone('chevronRight', 14)}<span>Gerar contrato</span></nav>
    <div class="titulo-pagina">
      <div>
        <h1>Gerar contrato</h1>
        <p class="apoio">Os dados da negociação e do imóvel já vieram preenchidos. Confira e complete.</p>
      </div>
    </div>
    <section class="card resumo-origem">
      <span>Negociação <strong>${n.codigo}</strong></span>
      <span>${esc(tituloImovel(imovel))}</span>
      <span>Locatário <strong>${esc(n.locatario.nome)}</strong></span>
      <span>Garantia <strong>${esc(rotulo(GARANTIAS, n.garantia_tipo))}</strong></span>
      <span>Aluguel <strong>${n.valor_aluguel != null ? esc(formatarMoeda(n.valor_aluguel)) : '—'}</strong></span>
      <span class="ok-linha">${icone('check', 14)}Fichas completas</span>
    </section>
    <div id="form-caixa"></div>`;

  const form = montarFormContrato(el.querySelector('#form-caixa'), {
    garantiaTipo: n.garantia_tipo,
    fiadores,
    seguradoras,
    c: {
      inicio: n.inicio_previsto,
      prazo_meses: n.prazo_meses,
      valor_aluguel: n.valor_aluguel,
      taxa_administracao: n.taxa_administracao,
      taxa_intermediacao: n.taxa_intermediacao,
      seguro_valor_anual: imovel.valor_seguro_incendio_anual,
      anotacoes: n.anotacoes,
      repasse_dia: 15,
    },
    textoBotao: 'Criar contrato',
    aoCancelar: () => { location.hash = `#/negociacoes/${n.id}`; },
    aoSalvar: async (formulario) => {
      limparErros(formulario);
      const { dados, erros, aviso } = lerContrato(formulario);
      if (mostrarErros(formulario, erros)) return;
      if (aviso) return mostrarErroForm(formulario, '.erro-form', aviso);

      const botao = formulario.querySelector('[type="submit"]');
      botao.disabled = true;
      const { data, error } = await sb.rpc('loc_gerar_contrato', { p_negociacao_id: n.id, p_dados: dados });
      botao.disabled = false;
      if (error) return mostrarErroForm(formulario, '.erro-form', mensagemErro(error));

      await guardarSeguradoras(dados);
      toast('Contrato criado.');
      location.hash = `#/contratos/${data}`;
    },
  });
  form.elements.namedItem('dia_vencimento').focus();
}
