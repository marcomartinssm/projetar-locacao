// Escolha de uma ficha de cliente: mostra o escolhido (com "Trocar") ou a busca para escolher.

import { esc, iniciais } from '../util.js';
import { montarBuscaCliente } from './busca-cliente.js';

export function montarEscolhaCliente(slot, { escolhido = null, placeholder, ignorar, aoMudar = () => {} }) {
  const desenhar = (atual) => {
    if (!atual) {
      montarBuscaCliente(slot, {
        placeholder,
        ignorar,
        aoEscolher: (cliente) => {
          aoMudar(cliente);
          desenhar(cliente);
        },
      });
      return;
    }
    slot.innerHTML = `
      <div class="escolhido">
        <span class="avatar pequeno">${esc(iniciais(atual.nome))}</span>
        <div class="prop-info"><strong>${esc(atual.nome)}</strong><small>Código ${atual.codigo}</small></div>
        <button type="button" class="link-acao" data-trocar-escolha>Trocar</button>
      </div>`;
    slot.querySelector('[data-trocar-escolha]').addEventListener('click', () => {
      aoMudar(null);
      desenhar(null);
    });
  };
  desenhar(escolhido);
}
