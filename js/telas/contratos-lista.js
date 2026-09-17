// Lista de contratos com busca e filtro de situação.

import { sb } from '../supabase.js';
import { esc, icone, formatarData, formatarMoeda, mensagemErro, rotulo, SITUACOES_CONTRATO, TIPOS_IMOVEL } from '../util.js';

const POR_PAGINA = 20;
const filtros = { termo: '', situacao: '', pagina: 0 };
let ultimaBusca = 0;

export const situacaoContrato = (situacao) =>
  `<span class="situacao-imovel ctr-${esc(situacao)}"><i></i>${esc(rotulo(SITUACOES_CONTRATO, situacao))}</span>`;

export function telaContratosLista(el) {
  el.innerHTML = `
    <div class="titulo-pagina">
      <div>
        <h1>Contratos</h1>
        <p class="apoio">Contratos de locação administrados pela Projetar. Cada um nasce de uma negociação.</p>
      </div>
      <a class="btn btn-secundario" href="#/negociacoes">${icone('handshake')}<span>Ir para negociações</span></a>
    </div>
    <section class="card filtros">
      <div class="filtros-linha">
        <label class="busca">
          ${icone('search', 18)}
          <input id="busca" type="search" value="${esc(filtros.termo)}" placeholder="Buscar por código, imóvel, endereço ou locatário" aria-label="Buscar contratos">
        </label>
        <label class="seletor"><span>Situação</span><select id="filtro-situacao">
          <option value="">Todas</option>${SITUACOES_CONTRATO.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}
        </select></label>
      </div>
    </section>
    <section class="card tabela tabela-contratos" id="tabela"><div class="carregando">Carregando…</div></section>`;

  const campo = el.querySelector('#filtro-situacao');
  campo.value = filtros.situacao;
  campo.addEventListener('change', () => { filtros.situacao = campo.value; filtros.pagina = 0; carregar(el); });

  let espera;
  el.querySelector('#busca').addEventListener('input', (ev) => {
    clearTimeout(espera);
    espera = setTimeout(() => { filtros.termo = ev.target.value.trim(); filtros.pagina = 0; carregar(el); }, 300);
  });

  carregar(el);
}

async function carregar(el) {
  const tabela = el.querySelector('#tabela');
  if (!tabela) return;
  const estaBusca = ++ultimaBusca;

  const { data, error } = await sb.rpc('loc_buscar_contratos', {
    p_termo: filtros.termo || null,
    p_situacao: filtros.situacao || null,
    p_limite: POR_PAGINA,
    p_offset: filtros.pagina * POR_PAGINA,
  });
  if (estaBusca !== ultimaBusca || !tabela.isConnected) return;

  if (error) {
    tabela.innerHTML = `<div class="vazio">${esc(mensagemErro(error))}</div>`;
    return;
  }

  const cabecalho = '<div class="linha cabecalho"><span>Código</span><span>Imóvel</span><span>Locatário</span><span>Proprietário</span><span class="valor-celula">Aluguel</span><span>Vencimento</span><span>Vigência</span><span>Situação</span><span></span></div>';

  if (!data.length) {
    tabela.innerHTML = `${cabecalho}<div class="vazio">${!filtros.termo && !filtros.situacao
      ? 'Nenhum contrato ainda. Os contratos nascem de uma negociação fechada, em <strong>Negociações</strong>.'
      : 'Nenhum contrato encontrado com esses filtros.'}</div>`;
    return;
  }

  const traco = '<span class="t-faint">—</span>';
  const linhas = data.map((c) => `
    <a class="linha" href="#/contratos/${c.id}">
      <span class="t-muted">${c.codigo}</span>
      <span class="nome-celula"><strong>${esc(rotulo(TIPOS_IMOVEL, c.imovel_tipo))} · ${esc(c.imovel_endereco || 'Sem endereço')}</strong><small>Imóvel ${c.imovel_codigo}</small></span>
      <span class="texto-cortado">${esc(c.locatario_nome)}</span>
      <span class="texto-cortado t-muted">${c.proprietario_principal ? esc(c.proprietario_principal) : traco}</span>
      <span class="valor-celula">${esc(formatarMoeda(c.valor_aluguel))}</span>
      <span class="t-muted">dia ${c.dia_vencimento}</span>
      <span class="t-muted">${esc(formatarData(c.inicio))} a ${esc(formatarData(c.fim))}</span>
      <span>${situacaoContrato(c.situacao)}</span>
      <span class="seta">${icone('chevronRight')}</span>
    </a>`).join('');

  const total = Number(data[0].total);
  const paginas = Math.ceil(total / POR_PAGINA);
  const inicio = filtros.pagina * POR_PAGINA + 1;

  tabela.innerHTML = `${cabecalho}${linhas}
    <div class="rodape-tabela">
      <span>Mostrando ${inicio}–${inicio + data.length - 1} de ${total}</span>
      <div class="paginacao">
        <button type="button" class="btn btn-secundario btn-peq" data-pagina="-1" ${filtros.pagina === 0 ? 'disabled' : ''}>${icone('chevronLeft', 14)}<span>Anterior</span></button>
        <button type="button" class="btn btn-secundario btn-peq" data-pagina="1" ${filtros.pagina >= paginas - 1 ? 'disabled' : ''}><span>Próxima</span>${icone('chevronRight', 14)}</button>
      </div>
    </div>`;

  tabela.querySelectorAll('[data-pagina]').forEach((botao) => botao.addEventListener('click', () => {
    filtros.pagina += Number(botao.dataset.pagina);
    carregar(el);
  }));
}
