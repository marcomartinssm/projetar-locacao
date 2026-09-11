// Lista de clientes com busca e filtros.

import { sb } from '../supabase.js';
import { esc, icone, chipRel, formatarCpfCnpj, formatarTelefone, mensagemErro, REL_FILTROS } from '../util.js';

const POR_PAGINA = 20;

// Os filtros ficam guardados enquanto a pessoa navega entre as telas.
const filtros = { termo: '', relacionamento: '', tipo: '', situacao: 'ativos', pagina: 0 };
let ultimaBusca = 0;

export function telaLista(el) {
  el.innerHTML = `
    <div class="titulo-pagina">
      <div>
        <h1>Clientes</h1>
        <p class="apoio">Cadastro geral da Projetar: uma ficha por pessoa</p>
      </div>
      <a class="btn btn-primario" href="#/clientes/novo">${icone('plus')}<span>Novo cliente</span></a>
    </div>
    <section class="card filtros">
      <div class="filtros-linha">
        <label class="busca">
          ${icone('search', 18)}
          <input id="busca" type="search" value="${esc(filtros.termo)}" placeholder="Buscar por nome, CPF/CNPJ, código, telefone ou e-mail" aria-label="Buscar clientes">
        </label>
        <label class="seletor"><span>Tipo</span>
          <select id="filtro-tipo">
            <option value="">Todos</option>
            <option value="PF">Pessoa física</option>
            <option value="PJ">Pessoa jurídica</option>
          </select>
        </label>
        <label class="seletor"><span>Situação</span>
          <select id="filtro-situacao">
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
      </div>
      <div class="chips" id="chips-rel">
        ${REL_FILTROS.map(([valor, rotulo]) => `<button type="button" class="chip ${filtros.relacionamento === valor ? 'ativo' : ''}" data-rel="${valor}">${rotulo}</button>`).join('')}
      </div>
    </section>
    <section class="card tabela" id="tabela"><div class="carregando">Carregando…</div></section>`;

  el.querySelector('#filtro-tipo').value = filtros.tipo;
  el.querySelector('#filtro-situacao').value = filtros.situacao;

  const recomecar = () => { filtros.pagina = 0; carregar(el); };
  let espera;
  el.querySelector('#busca').addEventListener('input', (ev) => {
    clearTimeout(espera);
    espera = setTimeout(() => { filtros.termo = ev.target.value.trim(); recomecar(); }, 300);
  });
  el.querySelector('#filtro-tipo').addEventListener('change', (ev) => { filtros.tipo = ev.target.value; recomecar(); });
  el.querySelector('#filtro-situacao').addEventListener('change', (ev) => { filtros.situacao = ev.target.value; recomecar(); });
  el.querySelector('#chips-rel').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-rel]');
    if (!chip) return;
    filtros.relacionamento = chip.dataset.rel;
    el.querySelectorAll('#chips-rel .chip').forEach((c) => c.classList.toggle('ativo', c === chip));
    recomecar();
  });

  carregar(el);
}

async function carregar(el) {
  const tabela = el.querySelector('#tabela');
  if (!tabela) return;
  const estaBusca = ++ultimaBusca;

  const { data, error } = await sb.rpc('cad_buscar_clientes', {
    p_termo: filtros.termo || null,
    p_relacionamento: filtros.relacionamento || null,
    p_tipo_pessoa: filtros.tipo || null,
    p_ativo: filtros.situacao === 'todos' ? null : filtros.situacao === 'ativos',
    p_limite: POR_PAGINA,
    p_offset: filtros.pagina * POR_PAGINA,
  });
  if (estaBusca !== ultimaBusca || !tabela.isConnected) return; // chegou resposta de uma busca antiga

  if (error) {
    tabela.innerHTML = `<div class="vazio">${esc(mensagemErro(error))}</div>`;
    return;
  }

  const cabecalho = '<div class="linha cabecalho"><span>Código</span><span>Nome</span><span>CPF / CNPJ</span><span>Telefone</span><span>Relacionamentos</span><span>Situação</span><span></span></div>';

  if (!data.length) {
    const semFiltro = !filtros.termo && !filtros.relacionamento && !filtros.tipo && filtros.situacao === 'ativos';
    tabela.innerHTML = `${cabecalho}<div class="vazio">${semFiltro
      ? 'Nenhum cliente cadastrado ainda. Clique em <strong>Novo cliente</strong> para começar.'
      : 'Nenhum cliente encontrado com esses filtros.'}</div>`;
    return;
  }

  const traco = '<span class="t-faint">—</span>';
  const linhas = data.map((c) => `
    <a class="linha" href="#/clientes/${c.id}">
      <span class="t-muted">${c.codigo}</span>
      <span class="nome-celula"><strong>${esc(c.nome)}</strong><small>${c.tipo_pessoa === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'}</small></span>
      <span>${c.cpf_cnpj ? esc(formatarCpfCnpj(c.cpf_cnpj)) : traco}</span>
      <span>${c.telefone_principal ? esc(formatarTelefone(c.telefone_principal)) : traco}</span>
      <span class="chips-mini">${c.relacionamentos.length ? c.relacionamentos.map(chipRel).join('') : '<small class="t-faint">Sem relacionamentos</small>'}</span>
      <span class="situacao ${c.ativo ? '' : 'inativo'}"><i></i>${c.ativo ? 'Ativo' : 'Inativo'}</span>
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
