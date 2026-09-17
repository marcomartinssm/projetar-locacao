// Lista de fichas escolhidas (ex.: locatários solidários, fiadores) com busca para adicionar.

import { esc, icone, iniciais, formatarCpfCnpj } from '../util.js';
import { montarBuscaCliente } from './busca-cliente.js';

export function montarListaClientes(container, { iniciais: iniciaisLista = [], placeholder, vazio, ignorar = () => false }) {
  const itens = [...iniciaisLista];

  container.innerHTML = '<div class="prop-lista"></div><div class="lista-busca"></div>';
  const lista = container.querySelector('.prop-lista');

  const desenhar = () => {
    lista.innerHTML = itens.length
      ? itens.map((c, n) => `
        <div class="prop-linha">
          <span class="avatar pequeno">${esc(iniciais(c.nome))}</span>
          <div class="prop-info">
            <strong>${esc(c.nome)}</strong>
            <small>Código ${c.codigo}${c.cpf_cnpj ? ` · ${esc(formatarCpfCnpj(c.cpf_cnpj))}` : ''}</small>
          </div>
          <button type="button" class="icon-btn" data-remover="${n}" aria-label="Remover ${esc(c.nome)}">${icone('trash')}</button>
        </div>`).join('')
      : (vazio ? `<p class="t-faint">${vazio}</p>` : '');
  };

  lista.addEventListener('click', (ev) => {
    const botao = ev.target.closest('[data-remover]');
    if (!botao) return;
    itens.splice(Number(botao.dataset.remover), 1);
    desenhar();
  });

  montarBuscaCliente(container.querySelector('.lista-busca'), {
    placeholder,
    ignorar: (c) => itens.some((i) => i.id === c.id) || ignorar(c),
    aoEscolher: (cliente) => {
      itens.push(cliente);
      desenhar();
    },
  });

  desenhar();

  return {
    ids: () => itens.map((c) => c.id),
    tem: (id) => itens.some((c) => c.id === id),
  };
}
