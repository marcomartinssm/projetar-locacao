// Aba Contas do imóvel: cadastro das contas (IPTU, água, luz, lixo, condomínio).
// Os lançamentos de cada mês ficam no contrato. A senha do portal fica guardada
// protegida no Supabase (Vault); ver a senha fica registrado.

import { sb } from '../supabase.js';
import {
  esc, icone, iniciais, digitos, formatarMoeda, formatarNumeroBR, formatarTelefone,
  lerNumeroBR, emailValido, mensagemErro, toast,
} from '../util.js';
import { campo, select, campoTexto, limparErros, mostrarErros, mostrarErroForm, ligarMascaras } from '../formulario.js';
import { montarBuscaCliente } from '../componentes/busca-cliente.js';

export const TIPOS_CONTA = [['iptu', 'IPTU'], ['agua', 'Água'], ['luz', 'Luz'], ['lixo', 'Lixo'], ['condominio', 'Condomínio']];

const CONFIG = {
  iptu: { icone: 'receipt', identificador: 'Inscrição imobiliária', valor: 'Valor anual do carnê (R$)', valorCurto: 'Valor anual', empresa: 'prefeitura' },
  agua: { icone: 'droplet', identificador: 'Matrícula', valor: 'Valor mensal médio (R$)', valorCurto: 'Valor mensal', empresa: 'companhia de água' },
  luz: { icone: 'bolt', identificador: 'Nº da instalação (UC)', valor: 'Valor mensal médio (R$)', valorCurto: 'Valor mensal', empresa: 'Celesc' },
  lixo: { icone: 'bin', identificador: 'Inscrição / identificação', valor: 'Valor mensal (R$)', valorCurto: 'Valor mensal', empresa: 'prefeitura' },
  condominio: { icone: 'building', identificador: 'Unidade', valor: null, valorCurto: null, fundo: true, empresa: 'administradora do condomínio' },
};

const ORDEM = Object.fromEntries(TIPOS_CONTA.map(([tipo], i) => [tipo, i]));
const nomeTipo = (tipo) => (TIPOS_CONTA.find(([v]) => v === tipo) || [tipo, tipo])[1];
const decimal = (v) => (v == null ? '' : formatarNumeroBR(v, 2));

// Busca usada pela ficha do imóvel (as duas ligações com cad_clientes têm nome próprio).
export const SELECT_CONTAS = '*, '
  + 'empresa:cad_clientes!loc_imoveis_contas_empresa_cliente_id_fkey(id, codigo, nome, cpf_cnpj, tipo_pessoa), '
  + 'titular:cad_clientes!loc_imoveis_contas_titular_cliente_id_fkey(id, codigo, nome, cpf_cnpj, tipo_pessoa)';

// Senhas que estão sendo mostradas agora (somem sozinhas depois de 30 segundos).
const senhasVisiveis = new Map();

export function renderContas(caixa, ficha, recarregar, editando = null) {
  const contas = [...ficha.contas].sort((a, b) =>
    (ORDEM[a.tipo] - ORDEM[b.tipo]) || String(a.descricao ?? '').localeCompare(String(b.descricao ?? ''), 'pt-BR'));
  const atuais = contas.filter((c) => c.ativo);
  const anteriores = contas.filter((c) => !c.ativo);
  const card = (c) => (editando === c.id ? formConta(c) : cartaoConta(c));

  caixa.innerHTML = `
    <p class="apoio">Aqui fica só o cadastro das contas do imóvel. Quando houver mais de uma do mesmo tipo (IPTU do apartamento, da garagem, do depósito), use a descrição para separar. O IPTU anual do imóvel é a soma dos IPTUs atuais. Os lançamentos de cada mês ficam no contrato.</p>
    ${editando === 'nova' ? `<div class="contas-grade">${formConta({ ativo: true })}</div>` : ''}
    ${atuais.length ? `<div class="contas-grade">${atuais.map(card).join('')}</div>` : (editando === 'nova' ? '' : '<p class="t-faint">Nenhuma conta cadastrada ainda.</p>')}
    ${editando === 'nova' ? '' : `<button type="button" class="adicionar-tracejado" data-acao="nova">${icone('plus', 18)}<span>Adicionar conta · IPTU, água, luz, lixo ou condomínio</span></button>`}
    ${anteriores.length ? `
      <details class="contas-anteriores" ${anteriores.some((c) => c.id === editando) ? 'open' : ''}>
        <summary>Contas anteriores (${anteriores.length})</summary>
        <div class="contas-grade">${anteriores.map(card).join('')}</div>
      </details>` : ''}`;

  const form = caixa.querySelector('.conta-form');
  const escolhidos = {};
  if (form) {
    const conta = editando === 'nova' ? { ativo: true } : contas.find((c) => c.id === editando);
    escolhidos.empresa = conta.empresa ?? null;
    escolhidos.titular = conta.titular ?? null;
    ligarMascaras(form);
    montarEscolha(form, 'empresa', escolhidos);
    montarEscolha(form, 'titular', escolhidos);
    ajustarPorTipo(form);
    form.elements.namedItem('tipo').focus();
  }

  caixa.onchange = (ev) => {
    if (ev.target.name === 'tipo' && form) ajustarPorTipo(form);
  };

  caixa.onsubmit = (ev) => {
    ev.preventDefault();
    const conta = editando === 'nova' ? {} : contas.find((c) => c.id === editando);
    salvarConta(ev.target, conta, ficha, escolhidos, recarregar);
  };

  caixa.onclick = (ev) => {
    const botao = ev.target.closest('button');
    if (!botao) return;
    const d = botao.dataset;

    if (d.acao === 'nova') renderContas(caixa, ficha, recarregar, 'nova');
    else if (d.editar) renderContas(caixa, ficha, recarregar, d.editar);
    else if ('cancelar' in d) renderContas(caixa, ficha, recarregar);
    else if (d.excluir) excluirConta(contas.find((c) => c.id === d.excluir), recarregar);
    else if (d.trocar && form) { escolhidos[d.trocar] = null; montarEscolha(form, d.trocar, escolhidos); }
    else if (d.verSenha) verSenha(botao, d.verSenha);
    else if (d.copiarSenha) copiarSenha(d.copiarSenha);
    else if (d.esconderSenha) esconderSenha(caixa, d.esconderSenha);
  };
}

// ---------- cartão de uma conta ----------
const linkCliente = (c) => `<a href="#/clientes/${c.id}">${esc(c.nome)}</a>`;

const dado = (rotulo, valor, html = false) =>
  `<div class="dado"><span class="rotulo">${rotulo}</span><span class="valor">${valor == null || valor === ''
    ? '<span class="t-faint">—</span>' : (html ? valor : esc(valor))}</span></div>`;

function caixaSenha(contaId) {
  const visivel = senhasVisiveis.get(contaId);
  if (visivel != null) {
    return `
      <div class="senha-caixa" data-senha-caixa="${contaId}">
        <span class="t-ouro">${icone('lock', 15)}</span>
        <span class="senha-valor">${esc(visivel || '(vazia)')}</span>
        <span class="senha-acoes">
          <button type="button" class="link-acao" data-copiar-senha="${contaId}">${icone('copy', 13)}Copiar</button>
          <button type="button" class="link-acao" data-esconder-senha="${contaId}">${icone('eyeOff', 13)}Esconder</button>
        </span>
      </div>`;
  }
  return `
    <div class="senha-caixa" data-senha-caixa="${contaId}">
      <span class="t-ouro">${icone('lock', 15)}</span>
      <span class="senha-valor">••••••••</span>
      <span class="senha-acoes">
        <button type="button" class="link-acao" data-ver-senha="${contaId}">${icone('eye', 13)}Mostrar</button>
      </span>
    </div>`;
}

function cartaoConta(c) {
  const cfg = CONFIG[c.tipo];
  const campos = [
    dado(cfg.identificador, c.identificador),
    dado('Nº do cliente', c.numero_cliente),
    dado('Titular', c.titular ? linkCliente(c.titular) : null, true),
    cfg.valorCurto ? dado(cfg.valorCurto, c.valor != null ? formatarMoeda(c.valor) : null) : '',
    cfg.fundo ? dado('Fundo de reserva', c.valor_fundo_reserva != null ? formatarMoeda(c.valor_fundo_reserva) : null) : '',
    dado('Vencimento', c.dia_vencimento ? `Dia ${c.dia_vencimento}` : null),
  ].join('');

  const temContato = c.contato_nome || c.contato_telefone || c.contato_email;
  const temPortal = c.portal_url || c.portal_usuario || c.senha_segredo_id;

  return `
    <section class="card conta-card ${c.ativo ? '' : 'anterior'}">
      <div class="conta-topo">
        <span class="conta-icone">${icone(cfg.icone, 20)}</span>
        <div class="conta-titulo">
          <div class="linha-titulo">
            <strong>${nomeTipo(c.tipo)}</strong>
            ${c.descricao ? `<span class="descricao">· ${esc(c.descricao)}</span>` : ''}
            <span class="selo-conta ${c.ativo ? 'atual' : 'anterior'}">${c.ativo ? 'Atual' : 'Anterior'}</span>
          </div>
          ${c.empresa ? linkCliente(c.empresa) : '<small class="t-faint">Empresa não informada</small>'}
        </div>
        <div class="contato-acoes">
          <button type="button" class="icon-btn" data-editar="${c.id}" aria-label="Editar conta">${icone('edit')}</button>
          <button type="button" class="icon-btn" data-excluir="${c.id}" aria-label="Excluir conta">${icone('trash')}</button>
        </div>
      </div>
      <div class="dados-grade">${campos}</div>
      ${temContato ? `
        <div class="conta-bloco">
          <div class="dados-grade">
            ${dado('Contato', c.contato_nome)}
            ${dado('Telefone', c.contato_telefone ? formatarTelefone(c.contato_telefone) : null)}
            ${dado('E-mail', c.contato_email)}
          </div>
        </div>` : ''}
      ${temPortal ? `
        <div class="conta-bloco">
          <div class="dados-grade">
            ${dado('Portal', c.portal_url ? `<a href="${esc(/^https?:\/\//i.test(c.portal_url) ? c.portal_url : `https://${c.portal_url}`)}" target="_blank" rel="noopener noreferrer">${esc(c.portal_url)}</a>` : null, true)}
            ${dado('Usuário', c.portal_usuario)}
          </div>
          ${c.senha_segredo_id
            ? `${caixaSenha(c.id)}<span class="senha-nota">Senha guardada protegida. Cada visualização fica registrada.</span>`
            : '<span class="senha-nota">Sem senha guardada.</span>'}
        </div>` : ''}
      ${c.observacoes ? `<p class="texto-livre conta-obs">${esc(c.observacoes)}</p>` : ''}
    </section>`;
}

// ---------- formulário ----------
function formConta(c) {
  const nova = !c.id;
  const cfg = CONFIG[c.tipo] ?? CONFIG.iptu;

  return `
    <form class="card conta-card conta-form" novalidate>
      <h3 class="h-card">${nova ? 'Nova conta' : `Editar ${nomeTipo(c.tipo)}${c.descricao ? ` · ${esc(c.descricao)}` : ''}`}</h3>

      <div class="grade-3">
        ${select('tipo', 'Tipo *', TIPOS_CONTA, c.tipo)}
        ${campo('descricao', 'Descrição', c.descricao, { placeholder: 'ex.: Apartamento, Garagem 01, Depósito', largo: true })}
      </div>

      <div class="campo">
        <label>Empresa <small class="t-muted" data-dica-empresa>(ex.: ${esc(cfg.empresa)})</small></label>
        <div data-escolha="empresa"></div>
      </div>

      <div class="grade-3">
        ${campo('identificador', cfg.identificador, c.identificador)}
        ${campo('numero_cliente', 'Nº do cliente', c.numero_cliente)}
        ${campo('dia_vencimento', 'Dia de vencimento', c.dia_vencimento ?? '', { inputmode: 'numeric', placeholder: '1 a 31' })}
        <div data-so-valor>${campo('valor', cfg.valor ?? 'Valor (R$)', decimal(c.valor), { inputmode: 'decimal', placeholder: '0,00' })}</div>
        <div data-so-fundo>${campo('valor_fundo_reserva', 'Fundo de reserva (R$)', decimal(c.valor_fundo_reserva), { inputmode: 'decimal', placeholder: '0,00' })}</div>
      </div>

      <div class="campo">
        <label>Titular da conta <small class="t-muted">(em nome de quem está)</small></label>
        <div data-escolha="titular"></div>
      </div>

      <h4 class="h-secao">Contato</h4>
      <div class="grade-3">
        ${campo('contato_nome', 'Nome', c.contato_nome, { placeholder: 'síndico, atendimento' })}
        ${campo('contato_telefone', 'Telefone', c.contato_telefone ? formatarTelefone(c.contato_telefone) : '', { tipo: 'tel', mascara: 'telefone', inputmode: 'numeric', placeholder: '(48) 99999-9999' })}
        ${campo('contato_email', 'E-mail', c.contato_email, { tipo: 'email' })}
      </div>

      <h4 class="h-secao">Portal</h4>
      <div class="grade-3">
        ${campo('portal_url', 'Site do portal', c.portal_url, { placeholder: 'prefeitura.gov.br' })}
        ${campo('portal_usuario', 'Usuário', c.portal_usuario, { autocomplete: 'off' })}
        <div class="campo" data-campo="senha">
          <label for="f-senha">Senha</label>
          <input id="f-senha" name="senha" type="password" autocomplete="new-password" placeholder="${c.senha_segredo_id ? 'Em branco mantém a atual' : ''}">
          <span class="erro-campo" hidden></span>
        </div>
      </div>
      <div class="checks-linha">
        ${c.senha_segredo_id ? '<label class="check"><input type="checkbox" name="remover_senha"><span>Apagar a senha guardada</span></label>' : ''}
        <span class="senha-nota">A senha é guardada protegida e só aparece ao clicar em "Mostrar".</span>
      </div>

      ${campoTexto('observacoes', 'Observações', c.observacoes)}
      <label class="check"><input type="checkbox" name="ativo" ${c.ativo !== false ? 'checked' : ''}><span>Conta atual <small class="t-muted">(desmarque quando for de um período anterior)</small></span></label>

      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario btn-peq" data-cancelar>Cancelar</button>
        <button type="submit" class="btn btn-primario btn-peq">${icone('check', 14)}<span>Salvar conta</span></button>
      </div>
    </form>`;
}

function ajustarPorTipo(form) {
  const tipo = form.elements.namedItem('tipo').value || 'iptu';
  const cfg = CONFIG[tipo];
  form.querySelector('label[for="f-identificador"]').textContent = cfg.identificador;
  form.querySelector('[data-dica-empresa]').textContent = `(ex.: ${cfg.empresa})`;
  const blocoValor = form.querySelector('[data-so-valor]');
  blocoValor.hidden = !cfg.valor;
  if (cfg.valor) form.querySelector('label[for="f-valor"]').textContent = cfg.valor;
  form.querySelector('[data-so-fundo]').hidden = !cfg.fundo;
}

function montarEscolha(form, chave, escolhidos) {
  const slot = form.querySelector(`[data-escolha="${chave}"]`);
  const escolhido = escolhidos[chave];
  if (escolhido) {
    slot.innerHTML = `
      <div class="escolhido">
        <span class="avatar pequeno">${esc(iniciais(escolhido.nome))}</span>
        <div class="prop-info"><strong>${esc(escolhido.nome)}</strong><small>Código ${escolhido.codigo}</small></div>
        <button type="button" class="link-acao" data-trocar="${chave}">Trocar</button>
      </div>`;
    return;
  }
  montarBuscaCliente(slot, {
    placeholder: chave === 'empresa'
      ? 'Buscar empresa: prefeitura, Celesc, administradora…'
      : 'Buscar titular por nome, telefone ou CPF',
    aoEscolher: (cliente) => {
      escolhidos[chave] = cliente;
      montarEscolha(form, chave, escolhidos);
    },
  });
}

async function salvarConta(form, conta, ficha, escolhidos, recarregar) {
  limparErros(form);
  const el = (nome) => form.elements.namedItem(nome);
  const texto = (nome) => el(nome)?.value.trim() || null;

  const tipo = texto('tipo');
  const cfg = CONFIG[tipo];
  const erros = {};
  if (!tipo) erros.tipo = 'Escolha o tipo da conta.';

  let dia = null;
  if (texto('dia_vencimento')) {
    dia = Number(texto('dia_vencimento'));
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) erros.dia_vencimento = 'Use um dia de 1 a 31.';
  }

  const lerValor = (nome) => {
    if (!texto(nome)) return null;
    const numero = lerNumeroBR(texto(nome));
    if (numero == null || numero < 0) erros[nome] = 'Valor inválido.';
    return numero;
  };
  const valor = cfg?.valor ? lerValor('valor') : null;
  const fundo = cfg?.fundo ? lerValor('valor_fundo_reserva') : null;

  const telefone = texto('contato_telefone') ? digitos(texto('contato_telefone')) : null;
  if (telefone && (telefone.length < 10 || telefone.length > 11)) erros.contato_telefone = 'Informe o telefone com DDD.';
  const email = texto('contato_email')?.toLowerCase() ?? null;
  if (email && !emailValido(email)) erros.contato_email = 'E-mail inválido.';

  if (mostrarErros(form, erros)) return;

  const dados = {
    tipo,
    descricao: texto('descricao'),
    empresa_cliente_id: escolhidos.empresa?.id ?? null,
    identificador: texto('identificador'),
    numero_cliente: texto('numero_cliente'),
    titular_cliente_id: escolhidos.titular?.id ?? null,
    valor,
    valor_fundo_reserva: fundo,
    dia_vencimento: dia,
    contato_nome: texto('contato_nome'),
    contato_telefone: telefone,
    contato_email: email,
    portal_url: texto('portal_url'),
    portal_usuario: texto('portal_usuario'),
    ativo: el('ativo').checked,
    observacoes: texto('observacoes'),
  };

  const botao = form.querySelector('[type="submit"]');
  botao.disabled = true;

  let id = conta.id;
  if (id) {
    const { error } = await sb.from('loc_imoveis_contas').update(dados).eq('id', id);
    if (error) {
      botao.disabled = false;
      return mostrarErroForm(form, '.erro-form', mensagemErro(error));
    }
  } else {
    const { data, error } = await sb.from('loc_imoveis_contas')
      .insert({ ...dados, imovel_id: ficha.imovel.id })
      .select('id')
      .single();
    if (error) {
      botao.disabled = false;
      return mostrarErroForm(form, '.erro-form', mensagemErro(error));
    }
    id = data.id;
  }

  const senha = el('senha').value;
  const apagarSenha = el('remover_senha')?.checked;
  if (senha || apagarSenha) {
    const { error } = await sb.rpc('loc_conta_definir_senha', { p_conta_id: id, p_senha: senha || '' });
    if (error) {
      toast(`Conta salva, mas a senha não foi guardada: ${mensagemErro(error)}`, 'erro');
      recarregar();
      return;
    }
    senhasVisiveis.delete(id);
  }

  toast('Conta salva.');
  recarregar();
}

async function excluirConta(conta, recarregar) {
  if (!conta) return;
  const nome = `${nomeTipo(conta.tipo)}${conta.descricao ? ` · ${conta.descricao}` : ''}`;
  const aviso = conta.senha_segredo_id ? ' A senha guardada também será apagada.' : '';
  if (!window.confirm(`Excluir a conta ${nome}?${aviso}`)) return;

  const { error } = await sb.from('loc_imoveis_contas').delete().eq('id', conta.id);
  if (error) {
    toast(mensagemErro(error), 'erro');
    return;
  }
  senhasVisiveis.delete(conta.id);
  toast('Conta excluída.');
  recarregar();
}

// ---------- senha ----------
async function verSenha(botao, contaId) {
  botao.disabled = true;
  const { data, error } = await sb.rpc('loc_conta_ver_senha', { p_conta_id: contaId });
  botao.disabled = false;
  if (error) {
    toast(mensagemErro(error), 'erro');
    return;
  }
  senhasVisiveis.set(contaId, data ?? '');
  const caixaAtual = botao.closest('[data-senha-caixa]');
  if (caixaAtual) caixaAtual.outerHTML = caixaSenha(contaId);

  setTimeout(() => {
    if (!senhasVisiveis.has(contaId)) return;
    senhasVisiveis.delete(contaId);
    const aberta = document.querySelector(`[data-senha-caixa="${contaId}"]`);
    if (aberta) aberta.outerHTML = caixaSenha(contaId);
  }, 30000);
}

async function copiarSenha(contaId) {
  const senha = senhasVisiveis.get(contaId);
  if (senha == null) return;
  try {
    await navigator.clipboard.writeText(senha);
    toast('Senha copiada.');
  } catch {
    toast('Não foi possível copiar. Selecione e copie a senha.', 'erro');
  }
}

function esconderSenha(caixa, contaId) {
  senhasVisiveis.delete(contaId);
  const aberta = caixa.querySelector(`[data-senha-caixa="${contaId}"]`);
  if (aberta) aberta.outerHTML = caixaSenha(contaId);
}
