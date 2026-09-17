// Lista de negociações com busca e filtros.

import { sb } from '../supabase.js';
import { esc, icone, formatarData, formatarMoeda, mensagemErro, rotulo, SITUACOES_NEGOCIACAO, TIPOS_IMOVEL } from '../util.js';

const POR_PAGINA = 20;

const filtros = { termo: '', situacao: '', corretor: '', pagina: 0 };
let ultimaBusca = 0;

export const situacaoNegociacao = (situacao) =>
  `<span class="situacao-imovel neg-${esc(situacao)}"><i></i>${esc(rotulo(SITUACOES_NEGOCIACAO, situacao))}</span>`;

export async function telaNegociacoesLista(el) {
  const { data: equipe } = await sb.from('loc_equipe').select('id, nome').eq('corretor', true).order('nome');
  if (!el.isConnected) return; // a tela já foi trocada enquanto carregava

  el.innerHTML = `
    <div class="titulo-pagina">
      <div>
        <h1>Negociações</h1>
        <p class="apoio">Negociação do imóvel com o locatário. Quando fecha, vira contrato.</p>
      </div>
      <a class="btn btn-primario" href="#/negociacoes/novo">${icone('plus')}<span>Nova negociação</span></a>
    </div>
    <section class="card filtros">
      <div class="filtros-linha">
        <label class="busca">
          ${icone('search', 18)}
          <input id="busca" type="search" value="${esc(filtros.termo)}" placeholder="Buscar por código, imóvel, locatário ou corretor" aria-label="Buscar negociações">
        </label>
        <label class="seletor"><span>Situação</span><select id="filtro-situacao">
          <option value="">Todas</option>${SITUACOES_NEGOCIACAO.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}
        </select></label>
        <label class="seletor"><span>Corretor</span><select id="filtro-corretor">
          <option value="">Todos</option>${(equipe ?? []).map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}
        </select></label>
      </div>
    </section>
    <section class="card tabela tabela-negociacoes" id="tabela"><div class="carregando">Carregando…</div></section>`;

  const recomecar = () => { filtros.pagina = 0; carregar(el); };
  for (const nome of ['situacao', 'corretor']) {
    const campo = el.querySelector(`#filtro-${nome}`);
    campo.value = filtros[nome];
    campo.addEventListener('change', () => { filtros[nome] = campo.value; recomecar(); });
  }

  let espera;
  el.querySelector('#busca').addEventListener('input', (ev) => {
    clearTimeout(espera);
    espera = setTimeout(() => { filtros.termo = ev.target.value.trim(); recomecar(); }, 300);
  });

  carregar(el);
}

async function carregar(el) {
  const tabela = el.querySelector('#tabela');
  if (!tabela) return;
  const estaBusca = ++ultimaBusca;

  const { data, error } = await sb.rpc('loc_buscar_negociacoes', {
    p_termo: filtros.termo || null,
    p_situacao: filtros.situacao || null,
    p_corretor_id: filtros.corretor || null,
    p_limite: POR_PAGINA,
    p_offset: filtros.pagina * POR_PAGINA,
  });
  if (estaBusca !== ultimaBusca || !tabela.isConnected) return;

  if (error) {
    tabela.innerHTML = `<div class="vazio">${esc(mensagemErro(error))}</div>`;
    return;
  }

  const cabecalho = '<div class="linha cabecalho"><span>Código</span><span>Data</span><span>Imóvel</span><span>Locatário</span><span class="valor-celula">Aluguel</span><span>Corretor</span><span>Situação</span><span></span></div>';

  if (!data.length) {
    const semFiltro = !filtros.termo && !filtros.situacao && !filtros.corretor;
    tabela.innerHTML = `${cabecalho}<div class="vazio">${semFiltro
      ? 'Nenhuma negociação ainda. Clique em <strong>Nova negociação</strong> para começar.'
      : 'Nenhuma negociação encontrada com esses filtros.'}</div>`;
    return;
  }

  const traco = '<span class="t-faint">—</span>';
  const linhas = data.map((m) => `
    <a class="linha" href="#/negociacoes/${m.id}">
      <span class="t-muted">${m.codigo}</span>
      <span class="t-muted">${esc(formatarData(m.data_negociacao))}</span>
      <span class="nome-celula"><strong class="texto-cortado">${esc(rotulo(TIPOS_IMOVEL, m.imovel_tipo))} · ${esc(m.imovel_endereco || 'Sem endereço')}</strong><small>Imóvel ${m.imovel_codigo}</small></span>
      <span class="texto-cortado">${esc(m.locatario_nome)}</span>
      <span class="valor-celula">${m.valor_aluguel != null ? esc(formatarMoeda(m.valor_aluguel)) : traco}</span>
      <span class="texto-cortado t-muted">${m.corretor_nome ? esc(m.corretor_nome) : traco}</span>
      <span>${situacaoNegociacao(m.situacao)}</span>
      <span class="seta">${icone('chevronRight')}</span>
    </a>`).join('');

  const total = Number(data[0].total);
  const paginas = Math.ceil(total / POR_PAGINA);
  const inicio = filtros.pagina * POR_PAGINA + 1;
  const fim = inicio + data.length - 1;

  tabela.innerHTML = `${cabecalho}${linhas}
    <div class="rodape-tabela">
      <span>Mostrando ${inicio}–${fim} de ${total}</span>
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
