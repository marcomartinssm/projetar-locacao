// Novo cliente: 1) verificar se já existe  2) resultado  3) completar a ficha.

import { sb } from '../supabase.js';
import {
  esc, icone, chipRel, iniciais, digitos, formatarCpfCnpj, formatarTelefone,
  cpfCnpjValido, emailValido, mensagemErro, toast, listaTexto, TIPOS_TELEFONE,
} from '../util.js';
import {
  campo, select, campoTexto, camposIdentificacao, camposEndereco, lerCampos,
  limparErros, mostrarErros, mostrarErroForm, ligarMascaras, ligarListaProfissoes, guardarProfissao,
  CAMPOS_PF, CAMPOS_PJ, CAMPOS_ENDERECO,
} from '../formulario.js';
import { buscarCnpj, ligarBuscaCnpj, preencherVazios, textoSituacao } from '../consultas.js';

const MOTIVO = {
  telefone: { artigo: 'o telefone', rotulo: 'telefone' },
  email: { artigo: 'o e-mail', rotulo: 'e-mail' },
  cpf_cnpj: { artigo: 'o CPF/CNPJ', rotulo: 'CPF/CNPJ' },
};

// O que foi digitado fica guardado enquanto a pessoa vai e volta entre as etapas.
let rascunho = rascunhoVazio();

function rascunhoVazio() {
  return { tipo_pessoa: 'PF', telefone: '', nome: '', email: '', cpf_cnpj: '', empresa: null, whatsapp: null };
}

export function telaNovo(el) {
  rascunho = rascunhoVazio();
  etapaVerificar(el);
}

function topo(subtitulo) {
  return `
    <nav class="trilha"><a href="#/clientes">Clientes</a>${icone('chevronRight', 14)}<span>Novo cliente</span></nav>
    <div class="titulo-pagina"><div><h1>Novo cliente</h1><p class="apoio">${subtitulo}</p></div></div>`;
}

// ---------- 1. verificar ----------
function etapaVerificar(el) {
  const pj = rascunho.tipo_pessoa === 'PJ';
  const doc = pj ? 'CNPJ' : 'CPF';

  el.innerHTML = `${topo('Antes de abrir a ficha, o sistema confere se a pessoa já está cadastrada.')}
    <form class="card painel" id="form-verificar" novalidate>
      <div class="alternar" role="group" aria-label="Tipo de pessoa">
        <button type="button" class="chip ${pj ? '' : 'ativo'}" data-tipo="PF" aria-pressed="${!pj}">Pessoa física</button>
        <button type="button" class="chip ${pj ? 'ativo' : ''}" data-tipo="PJ" aria-pressed="${pj}">Pessoa jurídica</button>
      </div>
      <div class="grade-2">
        ${campo('telefone', 'Telefone *', rascunho.telefone, { tipo: 'tel', mascara: 'telefone', placeholder: '(48) 99999-9999', inputmode: 'numeric' })}
        ${campo('nome', pj ? 'Razão social *' : 'Nome completo *', rascunho.nome)}
        ${campo('email', 'E-mail', rascunho.email, { tipo: 'email', placeholder: 'nome@exemplo.com.br' })}
        ${campo('cpf_cnpj', `${doc} (opcional)`, rascunho.cpf_cnpj, { mascara: 'cpf_cnpj', placeholder: pj ? '00.000.000/0000-00' : '000.000.000-00', inputmode: 'numeric' })}
      </div>
      <div class="caixa-regras">
        <strong>O que o sistema confere</strong>
        <dl>
          <dt>Telefone</dt><dd>Verificação principal. Se já pertence a outro cliente, só dá para usar o cadastro existente. O sistema também confere sozinho se o número tem WhatsApp.</dd>
          <dt>E-mail</dt><dd>Se já pertence a outro cliente, só dá para usar o cadastro existente.</dd>
          <dt>${doc}</dt><dd>Se é válido e se já existe. Se existir, só dá para usar o cadastro existente.${pj ? ' Com o CNPJ, os dados da empresa vêm da Receita.' : ''}</dd>
          <dt>Nome</dt><dd>Se há clientes com nome parecido. É só um aviso.</dd>
        </dl>
      </div>
      <p class="erro-form" hidden></p>
      <div class="acoes"><button class="btn btn-primario" type="submit">${icone('search')}<span>Verificar e continuar</span></button></div>
    </form>`;

  const form = el.querySelector('#form-verificar');
  ligarMascaras(form);
  form.elements.namedItem('telefone').focus();

  if (pj) {
    ligarBuscaCnpj(form.elements.namedItem('cpf_cnpj'), (empresa) => {
      rascunho.empresa = empresa;
      preencherVazios(form, empresa, ['nome']);
    });
  }

  const guardar = () => {
    for (const nome of ['telefone', 'nome', 'email', 'cpf_cnpj']) rascunho[nome] = form.elements.namedItem(nome).value;
    // resultado da conferência automática de WhatsApp (vazio = não deu para conferir)
    const marca = form.elements.namedItem('telefone').dataset.whatsapp;
    rascunho.whatsapp = marca === '1' ? true : marca === '0' ? false : null;
  };

  form.querySelectorAll('[data-tipo]').forEach((botao) => botao.addEventListener('click', () => {
    guardar();
    rascunho.tipo_pessoa = botao.dataset.tipo;
    etapaVerificar(el);
  }));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    guardar();
    limparErros(form);

    const telefone = digitos(rascunho.telefone);
    const documento = digitos(rascunho.cpf_cnpj);
    const email = rascunho.email.trim().toLowerCase();
    const nome = rascunho.nome.trim();

    const erros = {};
    if (telefone.length < 10 || telefone.length > 11) erros.telefone = 'Informe o telefone com DDD.';
    if (!nome) erros.nome = pj ? 'Informe a razão social.' : 'Informe o nome.';
    if (email && !emailValido(email)) erros.email = 'E-mail inválido.';
    if (documento && documento.length !== (pj ? 14 : 11)) erros.cpf_cnpj = `${doc} deve ter ${pj ? 14 : 11} números.`;
    else if (documento && !cpfCnpjValido(documento)) erros.cpf_cnpj = `${doc} inválido. Confira os números.`;
    if (mostrarErros(form, erros)) return;

    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    const { data, error } = await sb.rpc('cad_verificar_cliente', {
      p_telefone: telefone,
      p_email: email || null,
      p_cpf_cnpj: documento || null,
      p_nome: nome,
    });
    botao.disabled = false;
    if (error) return mostrarErroForm(form, '.erro-form', mensagemErro(error));

    const exatos = data.filter((r) => r.motivo !== 'nome_parecido');
    if (exatos.length) return etapaJaExiste(el, exatos);
    const parecidos = data.filter((r) => r.motivo === 'nome_parecido');
    if (parecidos.length) return etapaParecidos(el, parecidos);
    etapaCadastro(el);
  });
}

// ---------- 2. resultado ----------
function agrupar(linhas) {
  const porCliente = new Map();
  for (const linha of linhas) {
    if (!porCliente.has(linha.cliente_id)) porCliente.set(linha.cliente_id, { ...linha, motivos: [] });
    porCliente.get(linha.cliente_id).motivos.push(linha.motivo);
  }
  return [...porCliente.values()];
}

function cartaoPessoa(p, acao) {
  const doc = p.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF';
  const detalhes = [
    `Código <strong>${p.codigo}</strong>`,
    p.cpf_cnpj ? `${doc} ${esc(formatarCpfCnpj(p.cpf_cnpj))}` : `Sem ${doc}`,
    p.telefone_principal ? esc(formatarTelefone(p.telefone_principal)) : '',
  ].filter(Boolean);
  const encontradoPor = p.motivos.filter((m) => MOTIVO[m]).map((m) => MOTIVO[m].rotulo);
  return `
    <div class="pessoa">
      <span class="avatar">${esc(iniciais(p.nome))}</span>
      <div class="pessoa-info">
        <strong>${esc(p.nome)}</strong>
        <div class="pessoa-detalhes">${detalhes.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="chips-mini">
          ${p.relacionamentos.map(chipRel).join('')}
          ${encontradoPor.length ? `<small class="t-muted">Encontrado por: ${encontradoPor.join(', ')}</small>` : ''}
        </div>
      </div>
      <a class="link-abrir" href="#/clientes/${p.cliente_id}" target="_blank" rel="noopener">Abrir ficha${icone('arrowUpRight', 14)}</a>
      ${acao}
    </div>`;
}

const primeiraMaiuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

function etapaJaExiste(el, linhas) {
  const pessoas = agrupar(linhas);
  const uma = pessoas.length === 1;
  const motivos = [...new Set(linhas.map((l) => l.motivo))];
  const varios = motivos.length > 1;
  const oQue = primeiraMaiuscula(listaTexto(motivos.map((m) => MOTIVO[m].artigo)));

  el.innerHTML = `${topo('Resultado da verificação')}
    <section class="card painel">
      <div class="aviso vinho">
        ${icone('users', 20)}
        <div>
          <strong>${uma ? 'Este cliente já está cadastrado' : 'Esses dados já estão em cadastros existentes'}</strong>
          <p>${oQue} informado${varios ? 's' : ''} já ${varios ? 'pertencem' : 'pertence'} ${uma ? 'à ficha abaixo' : 'às fichas abaixo'}. Para continuar, use o cadastro existente.</p>
        </div>
      </div>
      <div class="lista-pessoas">
        ${pessoas.map((p) => cartaoPessoa(p, `<a class="btn btn-primario btn-peq" href="#/clientes/${p.cliente_id}">${icone('check', 14)}<span>Usar este cliente</span></a>`)).join('')}
      </div>
      <p class="apoio">Não é possível criar outra ficha com o mesmo telefone, e-mail ou CPF/CNPJ.</p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario" data-acao="voltar">${icone('chevronLeft')}<span>Voltar e corrigir</span></button>
      </div>
    </section>`;

  el.querySelector('[data-acao="voltar"]').addEventListener('click', () => etapaVerificar(el));
}

function etapaParecidos(el, linhas) {
  const pessoas = agrupar(linhas);
  el.innerHTML = `${topo('Resultado da verificação')}
    <section class="card painel">
      <div class="aviso dourado">
        ${icone('alert', 20)}
        <div>
          <strong>Encontramos clientes com nome parecido</strong>
          <p>Ninguém tem o mesmo telefone, e-mail ou CPF/CNPJ informados. Confira se não é uma destas pessoas antes de continuar.</p>
        </div>
      </div>
      <div class="lista-pessoas">
        ${pessoas.map((p) => cartaoPessoa(p, `<a class="btn btn-secundario btn-peq" href="#/clientes/${p.cliente_id}">${icone('check', 14)}<span>Usar este cliente</span></a>`)).join('')}
      </div>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario" data-acao="voltar">${icone('chevronLeft')}<span>Voltar</span></button>
        <button type="button" class="btn btn-primario" data-acao="continuar">${icone('plus')}<span>Não é nenhum deles: continuar cadastro</span></button>
      </div>
    </section>`;

  el.querySelector('[data-acao="voltar"]').addEventListener('click', () => etapaVerificar(el));
  el.querySelector('[data-acao="continuar"]').addEventListener('click', () => etapaCadastro(el));
}

// ---------- 3. completar a ficha ----------
const TEXTO_WHATSAPP = {
  true: '<span class="aviso-whatsapp ok">Tem WhatsApp</span>',
  false: '<span class="aviso-whatsapp atencao">Sem WhatsApp</span>',
  null: '<span class="t-faint">não foi possível conferir</span>',
};

function etapaCadastro(el) {
  const pj = rascunho.tipo_pessoa === 'PJ';
  const telefone = digitos(rascunho.telefone);
  const email = rascunho.email.trim().toLowerCase();
  const documento = digitos(rascunho.cpf_cnpj);

  el.innerHTML = `${topo('Ninguém tem esse telefone, e-mail ou documento. Complete a ficha.')}
    <form class="card painel" id="form-cadastro" novalidate>
      <div class="verificados">
        <div class="dado"><span class="rotulo">Telefone</span><span class="valor">${esc(formatarTelefone(telefone))}</span></div>
        <div class="dado"><span class="rotulo">WhatsApp</span><span class="valor">${TEXTO_WHATSAPP[String(rascunho.whatsapp)]}</span></div>
        <div class="dado"><span class="rotulo">E-mail</span><span class="valor">${email ? esc(email) : '—'}</span></div>
        <div class="dado"><span class="rotulo">${pj ? 'CNPJ' : 'CPF'}</span><span class="valor">${documento ? esc(formatarCpfCnpj(documento)) : '—'}</span></div>
        <button type="button" class="btn btn-secundario btn-peq" data-acao="alterar">${icone('edit', 14)}<span>Alterar</span></button>
      </div>

      <div class="aviso" id="dados-receita" hidden></div>

      <h2 class="h-secao">${pj ? 'Empresa' : 'Identificação'}</h2>
      ${camposIdentificacao(pj, { nome: rascunho.nome, nacionalidade: pj ? null : 'Brasileira' })}

      <h2 class="h-secao">Endereço</h2>
      ${camposEndereco()}

      <h2 class="h-secao">Telefone principal</h2>
      <div class="grade-3">
        ${select('telefone_tipo', 'Tipo', TIPOS_TELEFONE, 'celular', { vazio: false })}
      </div>

      ${campoTexto('observacoes', 'Observações')}

      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <a class="btn btn-secundario" href="#/clientes">Cancelar</a>
        <button class="btn btn-primario" type="submit">${icone('check')}<span>Salvar cliente</span></button>
      </div>
    </form>`;

  const form = el.querySelector('#form-cadastro');
  ligarMascaras(form);
  ligarListaProfissoes(form);
  if (pj && documento) completarComReceita(form, documento);

  form.querySelector('[data-acao="alterar"]').addEventListener('click', () => {
    rascunho.nome = form.elements.namedItem('nome').value;
    etapaVerificar(el);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);

    const dados = lerCampos(form, [...(pj ? CAMPOS_PJ : CAMPOS_PF), ...CAMPOS_ENDERECO, 'observacoes']);
    if (dados.cep) dados.cep = digitos(dados.cep);

    const erros = {};
    if (!dados.nome) erros.nome = pj ? 'Informe a razão social.' : 'Informe o nome.';
    if (dados.cep && dados.cep.length !== 8) erros.cep = 'CEP deve ter 8 números.';
    if (mostrarErros(form, erros)) return;

    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    const { data, error } = await sb.rpc('cad_criar_cliente', {
      p_dados: {
        ...dados,
        tipo_pessoa: rascunho.tipo_pessoa,
        cpf_cnpj: documento || null,
        email: email || null,
        telefone: {
          numero: telefone,
          tipo: form.elements.namedItem('telefone_tipo').value,
          whatsapp: rascunho.whatsapp === true,
        },
      },
    });
    botao.disabled = false;
    if (error) return mostrarErroForm(form, '.erro-form', mensagemErro(error));

    await guardarProfissao(dados.profissao);
    rascunho = rascunhoVazio();
    toast('Cliente cadastrado.');
    location.hash = `#/clientes/${data}`;
  });
}

// Empresa com CNPJ: preenche os campos vazios com os dados da Receita e mostra a situação.
async function completarComReceita(form, cnpj) {
  const caixa = form.querySelector('#dados-receita');
  const mostrar = (tom, ic, titulo, texto = '') => {
    caixa.className = `aviso ${tom}`;
    caixa.innerHTML = `${icone(ic, 20)}<div><strong>${titulo}</strong>${texto ? `<p>${esc(texto)}</p>` : ''}</div>`;
    caixa.hidden = false;
  };

  let empresa = rascunho.empresa?.cnpj === cnpj ? rascunho.empresa : null;
  if (!empresa) {
    mostrar('neutro', 'search', 'Buscando dados do CNPJ na Receita…');
    try {
      empresa = await buscarCnpj(cnpj);
    } catch {
      if (form.isConnected) mostrar('dourado', 'alert', 'Não foi possível consultar o CNPJ agora', 'Preencha os dados da empresa à mão.');
      return;
    }
    if (!form.isConnected) return;
    if (!empresa) {
      mostrar('dourado', 'alert', 'CNPJ não encontrado na Receita', 'Preencha os dados da empresa à mão.');
      return;
    }
    rascunho.empresa = empresa;
  }

  preencherVazios(form, empresa);
  const ativa = empresa.situacao === 'ATIVA';
  mostrar(
    ativa ? 'verde' : 'dourado',
    ativa ? 'check' : 'alert',
    ativa ? 'Dados preenchidos com a Receita Federal' : 'Atenção à situação da empresa',
    `${textoSituacao(empresa)} Confira os campos antes de salvar.`,
  );
}
