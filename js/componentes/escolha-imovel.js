// Escolha de um imóvel da locação: mostra o escolhido (com proprietários e valores) ou a busca.

import { sb } from '../supabase.js';
import { esc, icone, formatarMoeda, rotulo, TIPOS_IMOVEL } from '../util.js';
import { enderecoImovel, situacaoImovel, textoPercentual } from '../imovel-form.js';

// Imóvel completo para a negociação: dados, valores e proprietários.
export async function carregarImovelNegociacao(id) {
  const { data, error } = await sb.from('loc_imoveis')
    .select(`id, codigo, tipo, destinacao, situacao, logradouro, numero, complemento, bairro, cidade, uf,
      valor_aluguel, taxa_administracao, taxa_intermediacao,
      proprietarios:loc_imoveis_proprietarios(percentual, cliente:cad_clientes(id, codigo, nome))`)
    .eq('id', id)
    .single();
  if (error) throw error;
  data.proprietarios.sort((a, b) => Number(b.percentual) - Number(a.percentual));
  return data;
}

export const tituloImovel = (i) => `${rotulo(TIPOS_IMOVEL, i.tipo)} · ${enderecoImovel(i) || 'Sem endereço'}`;

function resumoImovel(i) {
  const donos = i.proprietarios.length
    ? `Proprietários: ${i.proprietarios.map((p) => `${p.cliente.nome} ${textoPercentual(p.percentual)}`).join(' · ')}`
    : 'Sem proprietário cadastrado';
  const valores = [
    i.valor_aluguel != null ? `Aluguel ${formatarMoeda(i.valor_aluguel)}` : '',
    i.taxa_administracao != null ? `Adm ${textoPercentual(i.taxa_administracao)}` : '',
    i.taxa_intermediacao != null ? `Intermediação ${textoPercentual(i.taxa_intermediacao)}` : '',
  ].filter(Boolean);
  return [donos, ...valores].map(esc).join(' · ');
}

export function montarEscolhaImovel(slot, { escolhido = null, aoMudar = () => {} }) {
  const desenhar = (atual) => {
    if (atual) {
      slot.innerHTML = `
        <div class="escolhido imovel-escolhido">
          <span class="capa-mini">${icone('home', 20)}</span>
          <div class="prop-info">
            <strong>Imóvel ${atual.codigo} · ${esc(tituloImovel(atual))}</strong>
            <small>${resumoImovel(atual)}</small>
          </div>
          ${situacaoImovel(atual.situacao)}
          <button type="button" class="link-acao" data-trocar-imovel>Trocar</button>
        </div>`;
      slot.querySelector('[data-trocar-imovel]').addEventListener('click', () => {
        aoMudar(null);
        desenhar(null);
      });
      return;
    }

    slot.innerHTML = `
      <div class="busca-cliente">
        <label class="busca">${icone('search', 16)}<input type="search" placeholder="Buscar imóvel por código, endereço, bairro ou proprietário" aria-label="Buscar imóvel"></label>
        <div class="busca-cliente-resultados" hidden></div>
      </div>`;

    const input = slot.querySelector('input');
    const lista = slot.querySelector('.busca-cliente-resultados');
    let espera;
    let ultimaBusca = 0;
    let resultados = [];

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') ev.preventDefault();
      if (ev.key === 'Escape') lista.hidden = true;
    });

    input.addEventListener('input', () => {
      clearTimeout(espera);
      const termo = input.value.trim();
      if (!termo) {
        lista.hidden = true;
        return;
      }
      espera = setTimeout(async () => {
        const estaBusca = ++ultimaBusca;
        const { data, error } = await sb.rpc('loc_buscar_imoveis', {
          p_termo: termo, p_situacao: null, p_tipo: null, p_destinacao: null, p_limite: 8, p_offset: 0,
        });
        if (estaBusca !== ultimaBusca) return;
        resultados = error ? [] : data;
        lista.innerHTML = error
          ? '<p class="t-faint">Não foi possível buscar agora.</p>'
          : !data.length
            ? '<p class="t-faint">Nenhum imóvel encontrado.</p>'
            : data.map((m, n) => `
              <button type="button" class="resultado-cliente" data-indice="${n}">
                <span class="capa-mini">${icone('home', 16)}</span>
                <span class="resultado-info">
                  <strong>Imóvel ${m.codigo} · ${esc(tituloImovel(m))}</strong>
                  <small>${[m.bairro, m.proprietario_principal, m.valor_aluguel != null ? formatarMoeda(m.valor_aluguel) : '']
                    .filter(Boolean).map(esc).join(' · ')}</small>
                </span>
                ${situacaoImovel(m.situacao)}
              </button>`).join('');
        lista.hidden = false;
      }, 300);
    });

    lista.addEventListener('click', async (ev) => {
      const botao = ev.target.closest('[data-indice]');
      if (!botao) return;
      lista.hidden = true;
      input.disabled = true;
      try {
        const imovel = await carregarImovelNegociacao(resultados[Number(botao.dataset.indice)].id);
        aoMudar(imovel);
        desenhar(imovel);
      } catch {
        input.disabled = false;
        lista.innerHTML = '<p class="t-faint">Não foi possível abrir esse imóvel agora.</p>';
        lista.hidden = false;
      }
    });
  };

  desenhar(escolhido);
}
