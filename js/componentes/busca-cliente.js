// Campo para buscar e escolher um cliente do cadastro (nome, telefone ou CPF/CNPJ).

import { sb } from '../supabase.js';
import { esc, icone, iniciais, formatarCpfCnpj, formatarTelefone } from '../util.js';

export function montarBuscaCliente(container, { aoEscolher, ignorar = () => false, placeholder = 'Buscar cliente por nome, telefone ou CPF' }) {
  container.innerHTML = `
    <div class="busca-cliente">
      <label class="busca">${icone('search', 16)}<input type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></label>
      <div class="busca-cliente-resultados" hidden></div>
      <p class="busca-cliente-rodape">Não achou? <a href="#/clientes/novo" target="_blank" rel="noopener">Cadastre o cliente</a> e depois busque de novo.</p>
    </div>`;

  const input = container.querySelector('input');
  const lista = container.querySelector('.busca-cliente-resultados');
  let espera;
  let ultimaBusca = 0;
  let resultados = [];

  // Enter aqui não deve enviar o formulário em volta; Esc fecha a lista.
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') ev.preventDefault();
    if (ev.key === 'Escape') lista.hidden = true;
  });

  input.addEventListener('input', () => {
    clearTimeout(espera);
    const termo = input.value.trim();
    if (termo.length < 2) {
      lista.hidden = true;
      return;
    }
    espera = setTimeout(async () => {
      const estaBusca = ++ultimaBusca;
      const { data, error } = await sb.rpc('cad_buscar_clientes', {
        p_termo: termo, p_relacionamento: null, p_tipo_pessoa: null, p_ativo: true, p_limite: 8, p_offset: 0,
      });
      if (estaBusca !== ultimaBusca) return;

      resultados = error ? [] : data.filter((c) => !ignorar(c));
      if (error) {
        lista.innerHTML = '<p class="t-faint">Não foi possível buscar agora.</p>';
      } else if (!resultados.length) {
        lista.innerHTML = '<p class="t-faint">Nenhum cliente encontrado.</p>';
      } else {
        lista.innerHTML = resultados.map((c, i) => {
          const detalhes = [
            `Código ${c.codigo}`,
            c.cpf_cnpj ? formatarCpfCnpj(c.cpf_cnpj) : '',
            c.telefone_principal ? formatarTelefone(c.telefone_principal) : '',
          ].filter(Boolean).map(esc).join(' · ');
          return `<button type="button" class="resultado-cliente" data-indice="${i}">
              <span class="avatar pequeno">${esc(iniciais(c.nome))}</span>
              <span class="resultado-info"><strong>${esc(c.nome)}</strong><small>${detalhes}</small></span>
            </button>`;
        }).join('');
      }
      lista.hidden = false;
    }, 300);
  });

  lista.addEventListener('click', (ev) => {
    const botao = ev.target.closest('[data-indice]');
    if (!botao) return;
    const cliente = resultados[Number(botao.dataset.indice)];
    input.value = '';
    lista.hidden = true;
    aoEscolher(cliente);
  });
}
