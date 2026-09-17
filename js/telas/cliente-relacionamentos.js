// Aba Relacionamentos do cliente: onde a pessoa aparece no sistema.
// Locador, locatário, solidário e fiador aparecem sozinhos (imóveis e contratos).
// Lead, comprador, vendedor, fornecedor e parceiro também podem ser marcados à mão.

import { sb } from '../supabase.js';
import { esc, icone, formatarData, mensagemErro, toast, chipRel } from '../util.js';

const MANUAIS = [['lead', 'Lead'], ['comprador', 'Comprador'], ['vendedor', 'Vendedor'], ['fornecedor', 'Fornecedor'], ['parceiro', 'Parceiro']];

const ORIGEM = {
  manual: 'Marcado à mão',
  imovel_locacao: 'Automático · imóvel',
  contrato_locacao: 'Automático · contrato',
  crm: 'CRM de vendas',
  vendas: 'Vendas',
};

function onde(r) {
  const texto = r.referencia_descricao;
  if (r.referencia_id && r.origem === 'imovel_locacao') {
    return `<a href="#/imoveis/${r.referencia_id}">${esc(texto || 'Abrir imóvel')}</a>`;
  }
  return texto ? esc(texto) : '<span class="t-faint">—</span>';
}

export function renderRelacionamentos(caixa, ficha, recarregar) {
  const lista = [...ficha.relacionamentos].sort((a, b) => Number(b.ativo) - Number(a.ativo) || String(b.criado_em).localeCompare(String(a.criado_em)));
  const jaMarcados = new Set(lista.filter((r) => r.origem === 'manual').map((r) => r.tipo));
  const disponiveis = MANUAIS.filter(([tipo]) => !jaMarcados.has(tipo));

  caixa.innerHTML = `
    <section class="card secao-card">
      <div class="secao-cabecalho"><h2 class="h-card">Relacionamentos</h2></div>
      <p class="apoio">Locador, locatário, solidário e fiador aparecem sozinhos quando a pessoa entra num imóvel ou contrato. Lead, comprador, vendedor, fornecedor e parceiro podem ser marcados à mão.</p>

      ${disponiveis.length ? `
        <div class="form-linha">
          <div class="campo">
            <label for="f-rel-tipo">Marcar como</label>
            <select id="f-rel-tipo">${disponiveis.map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select>
          </div>
          <div class="campo">
            <label for="f-rel-obs">Observação <small class="t-muted">(opcional)</small></label>
            <input id="f-rel-obs" placeholder="ex.: fornecedor de manutenção elétrica">
          </div>
          <button type="button" class="btn btn-secundario" data-acao="marcar">${icone('plus', 16)}<span>Marcar</span></button>
        </div>` : ''}

      ${lista.length ? `
        <div class="tabela-rel">
          <div class="rel-linha cabecalho"><span>Relacionamento</span><span>Onde</span><span>Origem</span><span>Desde</span><span></span></div>
          ${lista.map((r) => `
            <div class="rel-linha ${r.ativo ? '' : 'inativo'}">
              <span>${chipRel(r.tipo)}</span>
              <span class="texto-cortado">${onde(r)}</span>
              <span class="t-muted">${esc(ORIGEM[r.origem] || r.origem)}</span>
              <span class="t-muted">${formatarData(r.criado_em)}</span>
              <span>${r.origem === 'manual' ? `<button type="button" class="icon-btn" data-remover="${r.id}" aria-label="Remover">${icone('trash')}</button>` : ''}</span>
            </div>`).join('')}
        </div>` : '<p class="t-faint">Nenhum relacionamento ainda.</p>'}
    </section>`;

  caixa.onclick = async (ev) => {
    const botao = ev.target.closest('button');
    if (!botao) return;

    if (botao.dataset.acao === 'marcar') {
      botao.disabled = true;
      const { error } = await sb.from('cad_clientes_relacionamentos').insert({
        cliente_id: ficha.cliente.id,
        tipo: caixa.querySelector('#f-rel-tipo').value,
        origem: 'manual',
        referencia_descricao: caixa.querySelector('#f-rel-obs').value.trim() || null,
      });
      botao.disabled = false;
      if (error) return toast(error.code === '23505' ? 'Esse relacionamento já está marcado.' : mensagemErro(error), 'erro');
      toast('Relacionamento marcado.');
      recarregar();
    } else if (botao.dataset.remover) {
      const rel = lista.find((r) => r.id === botao.dataset.remover);
      if (!rel || !window.confirm('Remover este relacionamento?')) return;
      const { error } = await sb.from('cad_clientes_relacionamentos').delete().eq('id', rel.id);
      if (error) return toast(mensagemErro(error), 'erro');
      toast('Relacionamento removido.');
      recarregar();
    }
  };
}
