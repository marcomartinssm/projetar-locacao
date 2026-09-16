// Campo para buscar e escolher um cliente do cadastro (nome, telefone ou CPF/CNPJ),
// com cadastro rápido sem sair da tela.

import { sb } from '../supabase.js';
import {
  esc, icone, iniciais, digitos, formatarCpfCnpj, formatarTelefone,
  cpfCnpjValido, emailValido, mensagemErro, toast,
} from '../util.js';
import { campo, ligarMascaras } from '../formulario.js';

const MOTIVO = { telefone: 'o telefone', email: 'o e-mail', cpf_cnpj: 'o CPF/CNPJ' };

const cartaoPessoa = (p, indice) => `
  <div class="prop-linha">
    <span class="avatar pequeno">${esc(iniciais(p.nome))}</span>
    <div class="prop-info">
      <strong>${esc(p.nome)}</strong>
      <small>${[`Código ${p.codigo}`, p.cpf_cnpj ? formatarCpfCnpj(p.cpf_cnpj) : '', p.telefone_principal ? formatarTelefone(p.telefone_principal) : '']
        .filter(Boolean).map(esc).join(' · ')}</small>
    </div>
    <button type="button" class="btn btn-primario btn-peq" data-usar="${indice}">${icone('check', 14)}<span>Usar este cliente</span></button>
  </div>`;

export function montarBuscaCliente(container, {
  aoEscolher,
  ignorar = () => false,
  placeholder = 'Buscar cliente por nome, telefone ou CPF',
  permitirCadastro = true,
}) {
  container.innerHTML = `
    <div class="busca-cliente">
      <label class="busca">${icone('search', 16)}<input type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></label>
      <div class="busca-cliente-resultados" hidden></div>
      ${permitirCadastro
        ? '<p class="busca-cliente-rodape">Não achou? <button type="button" class="link-acao" data-acao="abrir-cadastro">Cadastrar cliente rápido</button></p>'
        : ''}
      <div class="cadastro-rapido" hidden></div>
    </div>`;

  const input = container.querySelector('input[type="search"]');
  const lista = container.querySelector('.busca-cliente-resultados');
  const cadastro = container.querySelector('.cadastro-rapido');
  let espera;
  let ultimaBusca = 0;
  let resultados = [];
  let tipoPessoa = 'PF';

  const escolher = (cliente) => {
    if (ignorar(cliente)) {
      toast('Esse cliente já está na lista.', 'erro');
      return;
    }
    input.value = '';
    lista.hidden = true;
    fecharCadastro();
    aoEscolher(cliente);
  };

  // ---------- busca ----------
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') ev.preventDefault(); // não enviar o formulário em volta
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
    escolher(resultados[Number(botao.dataset.indice)]);
  });

  // ---------- cadastro rápido ----------
  const fecharCadastro = () => {
    cadastro.hidden = true;
    cadastro.innerHTML = '';
  };

  function abrirCadastro() {
    const pj = tipoPessoa === 'PJ';
    const doc = pj ? 'CNPJ' : 'CPF';
    cadastro.hidden = false;
    cadastro.innerHTML = `
      <div class="form-inline">
        <div class="alternar" role="group" aria-label="Tipo de pessoa">
          <button type="button" class="chip ${pj ? '' : 'ativo'}" data-tipo="PF">Pessoa física</button>
          <button type="button" class="chip ${pj ? 'ativo' : ''}" data-tipo="PJ">Pessoa jurídica</button>
        </div>
        <div class="grade-2">
          ${campo('rapido_telefone', 'Telefone *', '', { tipo: 'tel', mascara: 'telefone', placeholder: '(48) 99999-9999', inputmode: 'numeric' })}
          ${campo('rapido_nome', pj ? 'Razão social *' : 'Nome completo *', '')}
          ${campo('rapido_email', 'E-mail', '', { tipo: 'email', placeholder: 'nome@exemplo.com.br' })}
          ${campo('rapido_cpf_cnpj', `${doc} (opcional)`, '', { mascara: 'cpf_cnpj', placeholder: pj ? '00.000.000/0000-00' : '000.000.000-00', inputmode: 'numeric' })}
        </div>
        <div class="verificacao"></div>
        <p class="erro-form" hidden></p>
        <p class="t-muted form-nota">A ficha completa (endereço, documentos, conta bancária) você preenche depois em Clientes.</p>
        <div class="acoes">
          <button type="button" class="btn btn-secundario btn-peq" data-acao="fechar">Cancelar</button>
          <button type="button" class="btn btn-primario btn-peq" data-acao="salvar">${icone('check', 14)}<span>Cadastrar e usar</span></button>
        </div>
      </div>`;
    ligarMascaras(cadastro);
    cadastro.querySelector('[name="rapido_telefone"]').focus();
  }

  const valor = (nome) => cadastro.querySelector(`[name="rapido_${nome}"]`)?.value.trim() ?? '';

  const marcarErro = (nome, texto) => {
    const bloco = cadastro.querySelector(`[data-campo="rapido_${nome}"]`);
    if (!bloco) return;
    bloco.classList.add('com-erro');
    const aviso = bloco.querySelector('.erro-campo');
    aviso.textContent = texto;
    aviso.hidden = false;
  };

  const limpar = () => {
    cadastro.querySelectorAll('.erro-campo').forEach((e) => { e.hidden = true; e.textContent = ''; });
    cadastro.querySelectorAll('.com-erro').forEach((e) => e.classList.remove('com-erro'));
    const erro = cadastro.querySelector('.erro-form');
    if (erro) erro.hidden = true;
    const verificacao = cadastro.querySelector('.verificacao');
    if (verificacao) verificacao.innerHTML = '';
  };

  const mostrarErro = (texto) => {
    const erro = cadastro.querySelector('.erro-form');
    erro.textContent = texto;
    erro.hidden = false;
  };

  let encontrados = [];
  let liberadoParecido = false;

  async function salvar() {
    const pj = tipoPessoa === 'PJ';
    const doc = pj ? 'CNPJ' : 'CPF';
    limpar();

    const telefone = digitos(valor('telefone'));
    const nome = valor('nome');
    const email = valor('email').toLowerCase();
    const documento = digitos(valor('cpf_cnpj'));

    let temErro = false;
    if (telefone.length < 10 || telefone.length > 11) { marcarErro('telefone', 'Informe o telefone com DDD.'); temErro = true; }
    if (!nome) { marcarErro('nome', pj ? 'Informe a razão social.' : 'Informe o nome.'); temErro = true; }
    if (email && !emailValido(email)) { marcarErro('email', 'E-mail inválido.'); temErro = true; }
    if (documento && documento.length !== (pj ? 14 : 11)) { marcarErro('cpf_cnpj', `${doc} deve ter ${pj ? 14 : 11} números.`); temErro = true; }
    else if (documento && !cpfCnpjValido(documento)) { marcarErro('cpf_cnpj', `${doc} inválido. Confira os números.`); temErro = true; }
    if (temErro) return;

    const botao = cadastro.querySelector('[data-acao="salvar"]');
    botao.disabled = true;

    const verificado = await sb.rpc('cad_verificar_cliente', {
      p_telefone: telefone, p_email: email || null, p_cpf_cnpj: documento || null, p_nome: nome,
    });
    if (verificado.error) {
      botao.disabled = false;
      return mostrarErro(mensagemErro(verificado.error));
    }

    const exatos = verificado.data.filter((r) => r.motivo !== 'nome_parecido');
    const parecidos = verificado.data.filter((r) => r.motivo === 'nome_parecido');
    const caixa = cadastro.querySelector('.verificacao');

    if (exatos.length) {
      botao.disabled = false;
      encontrados = exatos.map((r) => ({ ...r, id: r.cliente_id }));
      const motivos = [...new Set(exatos.map((r) => MOTIVO[r.motivo]))].join(' e ');
      caixa.innerHTML = `
        <div class="aviso vinho">${icone('users', 20)}<div><strong>Esse cliente já está cadastrado</strong>
          <p>${motivos.charAt(0).toUpperCase() + motivos.slice(1)} já pertence à ficha abaixo. Use o cadastro existente.</p></div></div>
        <div class="lista-pessoas">${encontrados.map(cartaoPessoa).join('')}</div>`;
      return;
    }

    if (parecidos.length && !liberadoParecido) {
      botao.disabled = false;
      liberadoParecido = true;
      encontrados = parecidos.map((r) => ({ ...r, id: r.cliente_id }));
      caixa.innerHTML = `
        <div class="aviso dourado">${icone('alert', 20)}<div><strong>Existe cliente com nome parecido</strong>
          <p>Ninguém tem esse telefone, e-mail ou ${doc}. Confira se não é uma destas pessoas. Se não for, clique de novo em "Cadastrar e usar".</p></div></div>
        <div class="lista-pessoas">${encontrados.map(cartaoPessoa).join('')}</div>`;
      return;
    }

    const criado = await sb.rpc('cad_criar_cliente', {
      p_dados: {
        tipo_pessoa: tipoPessoa,
        nome,
        cpf_cnpj: documento || null,
        email: email || null,
        // WhatsApp vem da conferência automática feita ao digitar o telefone.
        telefone: { numero: telefone, tipo: 'celular', whatsapp: cadastro.querySelector('[name="rapido_telefone"]')?.dataset.whatsapp === '1' },
      },
    });
    if (criado.error) {
      botao.disabled = false;
      return mostrarErro(mensagemErro(criado.error));
    }

    const ficha = await sb.from('cad_clientes').select('id, codigo, nome, cpf_cnpj, tipo_pessoa').eq('id', criado.data).single();
    botao.disabled = false;
    if (ficha.error) return mostrarErro(mensagemErro(ficha.error));

    toast('Cliente cadastrado.');
    liberadoParecido = false;
    escolher({ ...ficha.data, telefone_principal: telefone });
  }

  container.addEventListener('click', (ev) => {
    const botao = ev.target.closest('button');
    if (!botao) return;

    if (botao.dataset.acao === 'abrir-cadastro') {
      liberadoParecido = false;
      abrirCadastro();
    } else if (botao.dataset.acao === 'fechar') {
      fecharCadastro();
    } else if (botao.dataset.acao === 'salvar') {
      salvar();
    } else if (botao.dataset.tipo) {
      tipoPessoa = botao.dataset.tipo;
      liberadoParecido = false;
      abrirCadastro();
    } else if (botao.dataset.usar) {
      escolher(encontrados[Number(botao.dataset.usar)]);
    }
  });

  container.addEventListener('keydown', (ev) => {
    // Enter dentro do cadastro rápido salva, sem enviar o formulário em volta.
    if (ev.key !== 'Enter' || !cadastro.contains(ev.target)) return;
    ev.preventDefault();
    salvar();
  });
}
