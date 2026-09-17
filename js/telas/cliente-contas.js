// Aba Contas bancárias do cliente. A conta principal é a usada no repasse.
// Se a conta estiver em nome de outra pessoa, o titular é outra ficha de cliente.

import { sb } from '../supabase.js';
import { esc, icone, mensagemErro, toast, badgePrincipal } from '../util.js';
import { campo, select, limparErros, mostrarErros, mostrarErroForm } from '../formulario.js';
import { montarEscolhaCliente } from '../componentes/escolha-cliente.js';

export const SELECT_CONTAS_BANCARIAS = '*, '
  + 'titular:cad_clientes!cad_clientes_contas_bancarias_titular_cliente_id_fkey(id, codigo, nome, cpf_cnpj, tipo_pessoa)';

const BANCOS = [
  ['001', 'Banco do Brasil'], ['033', 'Santander'], ['041', 'Banrisul'], ['077', 'Inter'],
  ['104', 'Caixa Econômica Federal'], ['133', 'Cresol'], ['136', 'Unicred'], ['237', 'Bradesco'],
  ['260', 'Nubank'], ['290', 'PagBank'], ['323', 'Mercado Pago'], ['336', 'C6 Bank'],
  ['341', 'Itaú'], ['748', 'Sicredi'], ['756', 'Sicoob'],
];
const TIPOS_CONTA = [['corrente', 'Conta corrente'], ['poupanca', 'Poupança'], ['pagamento', 'Conta de pagamento']];
const TIPOS_PIX = [['cpf_cnpj', 'CPF/CNPJ'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['aleatoria', 'Chave aleatória']];
const rotulo = (lista, valor) => (lista.find(([v]) => v === valor) || [valor, valor ?? ''])[1];
const textoBanco = (c) => [c.banco_codigo, c.banco_nome].filter(Boolean).join(' · ');

// "136 · Unicred", "136", "Unicred" ou qualquer nome → { codigo, nome }
function lerBanco(texto) {
  if (!texto) return { codigo: null, nome: null };
  const comCodigo = texto.match(/^(\d{3})\s*(?:[·\-–]\s*)?(.*)$/);
  if (comCodigo) {
    const conhecido = BANCOS.find(([codigo]) => codigo === comCodigo[1]);
    return { codigo: comCodigo[1], nome: comCodigo[2].trim() || conhecido?.[1] || null };
  }
  const conhecido = BANCOS.find(([, nome]) => nome.toLowerCase() === texto.toLowerCase());
  return conhecido ? { codigo: conhecido[0], nome: conhecido[1] } : { codigo: null, nome: texto };
}

const dado = (rotuloDado, valor, html = false) =>
  `<div class="dado"><span class="rotulo">${rotuloDado}</span><span class="valor">${valor == null || valor === ''
    ? '<span class="t-faint">—</span>' : (html ? valor : esc(valor))}</span></div>`;

export function renderContasBancarias(caixa, ficha, recarregar, editando = null) {
  const contas = ficha.contasBancarias;
  const ativas = contas.filter((c) => c.ativo);
  const inativas = contas.filter((c) => !c.ativo);
  const card = (c) => (editando === c.id ? formConta(c) : cartao(c));

  caixa.innerHTML = `
    <p class="apoio">A conta principal é a usada no repasse ao proprietário. Se a conta estiver em nome de outra pessoa, o titular precisa ter ficha de cliente.</p>
    ${editando === 'nova' ? `<div class="contas-grade">${formConta({ ativo: true, principal: ativas.length === 0 })}</div>` : ''}
    ${ativas.length ? `<div class="contas-grade">${ativas.map(card).join('')}</div>` : (editando === 'nova' ? '' : '<p class="t-faint">Nenhuma conta bancária cadastrada.</p>')}
    ${editando === 'nova' ? '' : `<button type="button" class="adicionar-tracejado" data-acao="nova">${icone('plus', 18)}<span>Adicionar conta bancária</span></button>`}
    ${inativas.length ? `
      <details class="contas-anteriores" ${inativas.some((c) => c.id === editando) ? 'open' : ''}>
        <summary>Contas desativadas (${inativas.length})</summary>
        <div class="contas-grade">${inativas.map(card).join('')}</div>
      </details>` : ''}
    <datalist id="lista-bancos">${BANCOS.map(([codigo, nome]) => `<option value="${codigo} · ${esc(nome)}"></option>`).join('')}</datalist>`;

  const form = caixa.querySelector('.conta-form');
  const estado = { titular: null };
  if (form) {
    const conta = editando === 'nova' ? {} : contas.find((c) => c.id === editando);
    estado.titular = conta.titular ?? null;
    montarEscolhaCliente(form.querySelector('[data-escolha="titular"]'), {
      escolhido: estado.titular,
      placeholder: 'Buscar o titular por nome, telefone ou CPF',
      ignorar: (c) => c.id === ficha.cliente.id,
      aoMudar: (cliente) => { estado.titular = cliente; },
    });
    form.elements.namedItem('banco').focus();
  }

  caixa.onchange = (ev) => {
    if (ev.target.name === 'titular_modo' && form) {
      form.querySelector('[data-escolha="titular"]').hidden = ev.target.value !== 'outro';
    }
  };

  caixa.onsubmit = (ev) => {
    ev.preventDefault();
    const conta = editando === 'nova' ? {} : contas.find((c) => c.id === editando);
    salvar(ev.target, conta, ficha, estado, recarregar);
  };

  caixa.onclick = (ev) => {
    const botao = ev.target.closest('button');
    if (!botao) return;
    const d = botao.dataset;
    if (d.acao === 'nova') renderContasBancarias(caixa, ficha, recarregar, 'nova');
    else if (d.editar) renderContasBancarias(caixa, ficha, recarregar, d.editar);
    else if ('cancelar' in d) renderContasBancarias(caixa, ficha, recarregar);
    else if (d.excluir) excluir(contas.find((c) => c.id === d.excluir), recarregar);
    else if (d.principal) tornarPrincipal(contas, d.principal, recarregar);
  };
}

function cartao(c) {
  const titular = c.titular ? `<a href="#/clientes/${c.titular.id}">${esc(c.titular.nome)}</a>` : 'O próprio cliente';
  const subtitulo = [c.banco_codigo ? `Banco ${c.banco_codigo}` : '', rotulo(TIPOS_CONTA, c.tipo_conta), c.titular ? 'em nome de outra pessoa' : '']
    .filter(Boolean).join(' · ');

  return `
    <section class="card conta-card ${c.ativo ? '' : 'anterior'}">
      <div class="conta-topo">
        <span class="conta-icone">${icone('bank', 20)}</span>
        <div class="conta-titulo">
          <div class="linha-titulo">
            <strong>${esc(c.banco_nome || (c.pix_chave ? 'Chave Pix' : 'Banco não informado'))}</strong>
            ${c.principal ? badgePrincipal : ''}
            ${c.ativo ? '' : '<span class="selo-conta anterior">Desativada</span>'}
          </div>
          ${subtitulo ? `<small class="t-muted">${esc(subtitulo)}</small>` : ''}
        </div>
        <div class="contato-acoes">
          ${c.principal || !c.ativo ? '' : `<button type="button" class="link-acao" data-principal="${c.id}">Tornar principal</button>`}
          <button type="button" class="icon-btn" data-editar="${c.id}" aria-label="Editar conta">${icone('edit')}</button>
          <button type="button" class="icon-btn" data-excluir="${c.id}" aria-label="Excluir conta">${icone('trash')}</button>
        </div>
      </div>
      <div class="dados-grade">
        ${dado('Agência', c.agencia)}
        ${dado('Conta', c.conta)}
        ${dado('Tipo', rotulo(TIPOS_CONTA, c.tipo_conta))}
      </div>
      <div class="conta-bloco">
        <div class="dados-grade">
          ${dado('Chave Pix', c.pix_chave ? `${rotulo(TIPOS_PIX, c.pix_tipo)} · ${c.pix_chave}` : null)}
          ${dado('Titular', titular, true)}
        </div>
      </div>
      ${c.observacao ? `<p class="texto-livre conta-obs">${esc(c.observacao)}</p>` : ''}
    </section>`;
}

function formConta(c) {
  return `
    <form class="card conta-card conta-form" novalidate>
      <h3 class="h-card">${c.id ? 'Editar conta bancária' : 'Nova conta bancária'}</h3>
      <div class="grade-3">
        <div class="campo largo" data-campo="banco">
          <label for="f-banco">Banco</label>
          <input id="f-banco" name="banco" list="lista-bancos" value="${esc(textoBanco(c))}" placeholder="Digite o código ou o nome" autocomplete="off">
          <span class="erro-campo" hidden></span>
        </div>
        ${select('tipo_conta', 'Tipo de conta', TIPOS_CONTA, c.tipo_conta)}
        ${campo('agencia', 'Agência', c.agencia, { inputmode: 'numeric' })}
        ${campo('conta', 'Conta (com dígito)', c.conta)}
      </div>
      <div class="grade-3">
        ${select('pix_tipo', 'Tipo da chave Pix', TIPOS_PIX, c.pix_tipo)}
        ${campo('pix_chave', 'Chave Pix', c.pix_chave, { largo: true })}
      </div>
      <div class="campo">
        <label>Titular da conta</label>
        <div class="checks-linha">
          <label class="check"><input type="radio" name="titular_modo" value="proprio" ${c.titular ? '' : 'checked'}><span>O próprio cliente</span></label>
          <label class="check"><input type="radio" name="titular_modo" value="outro" ${c.titular ? 'checked' : ''}><span>Outra pessoa (ficha de cliente)</span></label>
        </div>
        <div data-escolha="titular" ${c.titular ? '' : 'hidden'}></div>
      </div>
      ${campo('observacao', 'Observação', c.observacao, { largo: true })}
      <div class="checks-linha">
        <label class="check"><input type="checkbox" name="principal" ${c.principal ? 'checked' : ''}><span>Conta principal <small class="t-muted">(usada no repasse)</small></span></label>
        <label class="check"><input type="checkbox" name="ativo" ${c.ativo !== false ? 'checked' : ''}><span>Conta ativa</span></label>
      </div>
      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario btn-peq" data-cancelar>Cancelar</button>
        <button type="submit" class="btn btn-primario btn-peq">${icone('check', 14)}<span>Salvar conta</span></button>
      </div>
    </form>`;
}

async function salvar(form, conta, ficha, estado, recarregar) {
  limparErros(form);
  const el = (nome) => form.elements.namedItem(nome);
  const texto = (nome) => el(nome)?.value.trim() || null;

  const banco = lerBanco(texto('banco'));
  const outraPessoa = form.querySelector('[name="titular_modo"]:checked')?.value === 'outro';

  const erros = {};
  if (texto('pix_chave') && !texto('pix_tipo')) erros.pix_tipo = 'Escolha o tipo da chave.';
  if (mostrarErros(form, erros)) return;
  if (!banco.nome && !texto('pix_chave')) return mostrarErroForm(form, '.erro-form', 'Informe o banco ou uma chave Pix.');
  if (outraPessoa && !estado.titular) return mostrarErroForm(form, '.erro-form', 'Escolha a ficha do titular da conta.');

  const ativo = el('ativo').checked;
  const dados = {
    banco_codigo: banco.codigo,
    banco_nome: banco.nome,
    agencia: texto('agencia'),
    conta: texto('conta'),
    tipo_conta: texto('tipo_conta'),
    pix_tipo: texto('pix_tipo'),
    pix_chave: texto('pix_chave'),
    titular_cliente_id: outraPessoa ? estado.titular.id : null,
    principal: el('principal').checked && ativo,
    ativo,
    observacao: texto('observacao'),
  };

  const botao = form.querySelector('[type="submit"]');
  botao.disabled = true;

  // Só pode haver uma conta principal: desmarca a antiga antes de salvar.
  const antiga = dados.principal ? ficha.contasBancarias.find((c) => c.principal && c.id !== conta.id) : null;
  if (antiga) {
    const { error } = await sb.from('cad_clientes_contas_bancarias').update({ principal: false }).eq('id', antiga.id);
    if (error) {
      botao.disabled = false;
      return mostrarErroForm(form, '.erro-form', mensagemErro(error));
    }
  }

  const { error } = conta.id
    ? await sb.from('cad_clientes_contas_bancarias').update(dados).eq('id', conta.id)
    : await sb.from('cad_clientes_contas_bancarias').insert({ ...dados, cliente_id: ficha.cliente.id });

  if (error) {
    if (antiga) await sb.from('cad_clientes_contas_bancarias').update({ principal: true }).eq('id', antiga.id);
    botao.disabled = false;
    return mostrarErroForm(form, '.erro-form', mensagemErro(error));
  }

  toast('Conta bancária salva.');
  recarregar();
}

async function tornarPrincipal(contas, id, recarregar) {
  const antiga = contas.find((c) => c.principal);
  if (antiga) {
    const { error } = await sb.from('cad_clientes_contas_bancarias').update({ principal: false }).eq('id', antiga.id);
    if (error) return toast(mensagemErro(error), 'erro');
  }
  const { error } = await sb.from('cad_clientes_contas_bancarias').update({ principal: true }).eq('id', id);
  if (error) {
    if (antiga) await sb.from('cad_clientes_contas_bancarias').update({ principal: true }).eq('id', antiga.id);
    return toast(mensagemErro(error), 'erro');
  }
  toast('Conta principal alterada.');
  recarregar();
}

async function excluir(conta, recarregar) {
  if (!conta) return;
  const nome = conta.banco_nome || 'esta conta';
  if (!window.confirm(`Excluir a conta ${nome}${conta.conta ? ` (${conta.conta})` : ''}?`)) return;
  const { error } = await sb.from('cad_clientes_contas_bancarias').delete().eq('id', conta.id);
  if (error) return toast(mensagemErro(error), 'erro');
  toast('Conta bancária excluída.');
  recarregar();
}
