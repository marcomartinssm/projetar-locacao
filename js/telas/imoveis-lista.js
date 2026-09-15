// Lista de imóveis com busca e filtros.

import { sb } from '../supabase.js';
import { esc, icone, formatarMoeda, mensagemErro, rotulo, TIPOS_IMOVEL, SITUACOES_IMOVEL, DESTINACOES } from '../util.js';
import { enderecoImovel, situacaoImovel } from '../imovel-form.js';

const POR_PAGINA = 20;

// Os filtros ficam guardados enquanto a pessoa navega entre as telas.
const filtros = { termo: '', situacao: '', tipo: '', destinacao: '', pagina: 0 };
let ultimaBusca = 0;

const opcoes = (lista, primeira) =>
  `<option value="">${primeira}</option>${lista.map(([valor, texto]) => `<option value="${valor}">${texto}</option>`).join('')}`;

export function telaImoveisLista(el) {
  el.innerHTML = `
    <div class="titulo-pagina">
      <div>
        <h1>Imóveis</h1>
        <p class="apoio">Imóveis administrados pela Projetar · Araranguá</p>
      </div>
      <a class="btn btn-primario" href="#/imoveis/novo">${icone('plus')}<span>Novo imóvel</span></a>
    </div>
    <section class="card filtros">
      <div class="filtros-linha">
        <label class="busca">
          ${icone('search', 18)}
          <input id="busca" type="search" value="${esc(filtros.termo)}" placeholder="Buscar por código, endereço, bairro, condomínio ou proprietário" aria-label="Buscar imóveis">
        </label>
        <label class="seletor"><span>Situação</span><select id="filtro-situacao">${opcoes(SITUACOES_IMOVEL, 'Todas')}</select></label>
        <label class="seletor"><span>Tipo</span><select id="filtro-tipo">${opcoes(TIPOS_IMOVEL, 'Todos')}</select></label>
        <label class="seletor"><span>Destinação</span><select id="filtro-destinacao">${opcoes(DESTINACOES, 'Todas')}</select></label>
      </div>
    </section>
    <section class="card tabela tabela-imoveis" id="tabela"><div class="carregando">Carregando…</div></section>`;

  const recomecar = () => { filtros.pagina = 0; carregar(el); };
  for (const nome of ['situacao', 'tipo', 'destinacao']) {
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

  const { data, error } = await sb.rpc('loc_buscar_imoveis', {
    p_termo: filtros.termo || null,
    p_situacao: filtros.situacao || null,
    p_tipo: filtros.tipo || null,
    p_destinacao: filtros.destinacao || null,
    p_limite: POR_PAGINA,
    p_offset: filtros.pagina * POR_PAGINA,
  });
  if (estaBusca !== ultimaBusca || !tabela.isConnected) return; // chegou resposta de uma busca antiga

  if (error) {
    tabela.innerHTML = `<div class="vazio">${esc(mensagemErro(error))}</div>`;
    return;
  }

  const cabecalho = '<div class="linha cabecalho"><span>Código</span><span>Imóvel</span><span>Bairro</span><span>Proprietário</span><span class="valor-celula">Aluguel</span><span>Situação</span><span></span></div>';

  if (!data.length) {
    const semFiltro = !filtros.termo && !filtros.situacao && !filtros.tipo && !filtros.destinacao;
    tabela.innerHTML = `${cabecalho}<div class="vazio">${semFiltro
      ? 'Nenhum imóvel cadastrado ainda. Clique em <strong>Novo imóvel</strong> para começar.'
      : 'Nenhum imóvel encontrado com esses filtros.'}</div>`;
    return;
  }

  const traco = '<span class="t-faint">—</span>';
  const linhas = data.map((m) => `
    <a class="linha" href="#/imoveis/${m.id}">
      <span class="t-muted">${m.codigo}</span>
      <span class="nome-celula"><strong>${esc(rotulo(TIPOS_IMOVEL, m.tipo))}</strong><small>${esc(enderecoImovel(m) || 'Sem endereço')}</small></span>
      <span>${m.bairro ? esc(m.bairro) : traco}</span>
      <span class="texto-cortado">${m.proprietario_principal
        ? `${esc(m.proprietario_principal)}${m.outros_proprietarios ? ` <span class="t-faint">+${m.outros_proprietarios}</span>` : ''}`
        : '<span class="t-faint">Sem proprietário</span>'}</span>
      <span class="valor-celula">${m.valor_aluguel != null ? esc(formatarMoeda(m.valor_aluguel)) : traco}</span>
      <span>${situacaoImovel(m.situacao)}</span>
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
