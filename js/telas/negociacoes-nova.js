// Nova negociação. Pode vir de um imóvel: #/negociacoes/novo?imovel=<id>

import { esc, icone, mensagemErro, toast } from '../util.js';
import { montarFormNegociacao, carregarEquipe } from '../negociacao-form.js';
import { carregarImovelNegociacao } from '../componentes/escolha-imovel.js';

export async function telaNegociacaoNova(el, imovelId = null) {
  el.innerHTML = '<div class="carregando">Carregando…</div>';

  let equipe;
  let imovel = null;
  try {
    [equipe, imovel] = await Promise.all([
      carregarEquipe(),
      imovelId ? carregarImovelNegociacao(imovelId) : null,
    ]);
  } catch (error) {
    el.innerHTML = `<div class="card vazio">${esc(mensagemErro(error))}</div>`;
    return;
  }

  el.innerHTML = `
    <nav class="trilha"><a href="#/negociacoes">Negociações</a>${icone('chevronRight', 14)}<span>Nova negociação</span></nav>
    <div class="titulo-pagina">
      <div>
        <h1>Nova negociação</h1>
        <p class="apoio">Imóvel, locatário, valores e garantia combinados. O contrato é gerado depois, a partir daqui.</p>
      </div>
    </div>
    <div id="form-caixa"></div>`;

  montarFormNegociacao(el.querySelector('#form-caixa'), {
    imovel,
    equipe,
    textoBotao: 'Salvar negociação',
    aoCancelar: () => { location.hash = '#/negociacoes'; },
    aoSalvar: (id) => {
      toast('Negociação salva.');
      location.hash = `#/negociacoes/${id}`;
    },
  });
}
