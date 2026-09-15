// Lista editável de proprietários de um imóvel (cliente + percentual).
// Usada no "Novo imóvel" e na aba Proprietários da ficha.

import { esc, icone, iniciais, formatarCpfCnpj, formatarNumeroBR, lerNumeroBR } from '../util.js';
import { montarBuscaCliente } from './busca-cliente.js';

const textoPct = (v) => (v == null ? '' : formatarNumeroBR(v, 2).replace(/,00$/, ''));
const fechaCem = (soma) => Math.abs(soma - 100) < 0.0001;

export function montarEditorProprietarios(container, itensIniciais = []) {
  const itens = itensIniciais.map((i) => ({ cliente: i.cliente, percentual: i.percentual }));

  container.innerHTML = '<div class="prop-lista"></div><div class="prop-soma"></div><div class="prop-busca"></div>';
  const lista = container.querySelector('.prop-lista');
  const soma = container.querySelector('.prop-soma');

  const somaAtual = () => itens.reduce((total, i) => total + (Number(i.percentual) || 0), 0);

  const atualizarSoma = () => {
    if (!itens.length) {
      soma.innerHTML = '';
      return;
    }
    const total = somaAtual();
    const ok = fechaCem(total);
    soma.innerHTML = `<span class="soma ${ok ? 'ok' : 'atencao'}">${icone(ok ? 'check' : 'alert', 14)}Total ${textoPct(total)}%${ok ? '' : ' · precisa fechar 100%'}</span>`;
  };

  const desenhar = () => {
    lista.innerHTML = itens.length
      ? itens.map((i, n) => `
        <div class="prop-linha">
          <span class="avatar pequeno">${esc(iniciais(i.cliente.nome))}</span>
          <div class="prop-info">
            <strong>${esc(i.cliente.nome)}</strong>
            <small>Código ${i.cliente.codigo}${i.cliente.cpf_cnpj ? ` · ${esc(formatarCpfCnpj(i.cliente.cpf_cnpj))}` : ''}</small>
          </div>
          <label class="prop-pct"><input type="text" inputmode="decimal" value="${esc(textoPct(i.percentual))}" data-linha="${n}" aria-label="Percentual de ${esc(i.cliente.nome)}"><span>%</span></label>
          <button type="button" class="icon-btn" data-remover="${n}" aria-label="Remover ${esc(i.cliente.nome)}">${icone('trash')}</button>
        </div>`).join('')
      : '<p class="t-faint">Nenhum proprietário ainda. Busque o cliente abaixo.</p>';
    atualizarSoma();
  };

  lista.addEventListener('input', (ev) => {
    const linha = ev.target.dataset.linha;
    if (linha == null) return;
    itens[Number(linha)].percentual = lerNumeroBR(ev.target.value);
    atualizarSoma();
  });

  lista.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.dataset.linha != null) ev.preventDefault();
  });

  lista.addEventListener('click', (ev) => {
    const botao = ev.target.closest('[data-remover]');
    if (!botao) return;
    itens.splice(Number(botao.dataset.remover), 1);
    desenhar();
  });

  montarBuscaCliente(container.querySelector('.prop-busca'), {
    ignorar: (c) => itens.some((i) => i.cliente.id === c.id),
    aoEscolher: (cliente) => {
      // O primeiro proprietário já entra com 100%; os seguintes, em branco para dividir.
      itens.push({ cliente, percentual: itens.length ? null : 100 });
      desenhar();
      lista.querySelector(`[data-linha="${itens.length - 1}"]`)?.focus();
    },
  });

  desenhar();

  return {
    validar() {
      if (!itens.length) return 'Adicione pelo menos um proprietário.';
      if (itens.some((i) => i.percentual == null || i.percentual <= 0 || i.percentual > 100)) {
        return 'Informe o percentual de cada proprietário (maior que 0 e até 100).';
      }
      if (!fechaCem(somaAtual())) return 'A soma dos percentuais precisa fechar 100%.';
      return null;
    },
    paraSalvar: () => itens.map((i) => ({ cliente_id: i.cliente.id, percentual: i.percentual })),
  };
}
