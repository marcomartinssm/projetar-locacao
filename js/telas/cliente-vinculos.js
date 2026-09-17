// Aba Vínculos do cliente: cônjuge, representante legal, procurador e sócio.
// Cada vínculo liga duas fichas e aparece nas duas.
// Leitura do que fica guardado: "<vinculado> é <tipo> de <cliente>".

import { sb } from '../supabase.js';
import { esc, icone, iniciais, formatarCpfCnpj, mensagemErro, toast } from '../util.js';
import { select } from '../formulario.js';
import { montarEscolhaCliente } from '../componentes/escolha-cliente.js';

export const SELECT_VINCULOS = '*, '
  + 'cliente:cad_clientes!cad_clientes_vinculos_cliente_id_fkey(id, codigo, nome, cpf_cnpj, tipo_pessoa, estado_civil), '
  + 'vinculado:cad_clientes!cad_clientes_vinculos_cliente_vinculado_id_fkey(id, codigo, nome, cpf_cnpj, tipo_pessoa, estado_civil)';

const TIPOS_VINCULO = [['conjuge', 'Cônjuge'], ['representante_legal', 'Representante legal'], ['procurador', 'Procurador(a)'], ['socio', 'Sócio(a)']];
const NOME_TIPO = Object.fromEntries(TIPOS_VINCULO);

// Frase mostrada embaixo do nome da outra pessoa
const FRASE_OUTRA_E = {
  conjuge: 'É cônjuge deste cliente',
  representante_legal: 'É representante legal deste cliente',
  procurador: 'É procurador(a) deste cliente',
  socio: 'É sócio(a) deste cliente',
};
const FRASE_ESTE_E = {
  conjuge: 'Este cliente é cônjuge desta pessoa',
  representante_legal: 'Este cliente é representante legal desta pessoa',
  procurador: 'Este cliente é procurador(a) desta pessoa',
  socio: 'Este cliente é sócio(a) desta pessoa',
};

const CASADOS = ['casado', 'uniao_estavel'];

export function renderVinculos(caixa, ficha, recarregar, adicionando = false) {
  const atual = ficha.cliente;
  const itens = ficha.vinculos.map((v) => {
    const esteEhVinculado = v.cliente_vinculado_id === atual.id;
    return { ...v, outra: esteEhVinculado ? v.cliente : v.vinculado, frase: (esteEhVinculado ? FRASE_ESTE_E : FRASE_OUTRA_E)[v.tipo] };
  });
  const semConjuge = CASADOS.includes(atual.estado_civil) && !itens.some((v) => v.tipo === 'conjuge');

  caixa.innerHTML = `
    <section class="card secao-card">
      <div class="secao-cabecalho">
        <h2 class="h-card">Vínculos com outras pessoas</h2>
        ${adicionando ? '' : `<button type="button" class="btn btn-secundario btn-peq" data-acao="adicionar">${icone('link', 14)}<span>Vincular pessoa</span></button>`}
      </div>
      <p class="apoio">Cônjuge, sócio, procurador e representante legal têm ficha própria de cliente e ficam ligados aqui. O vínculo aparece nas duas fichas.</p>
      ${semConjuge ? `
        <div class="aviso dourado">${icone('alert', 20)}<div><strong>Cliente ${atual.estado_civil === 'casado' ? 'casado' : 'em união estável'} sem cônjuge vinculado</strong>
          <p>Para entrar em contrato, o cônjuge precisa estar cadastrado e vinculado.</p></div></div>` : ''}
      ${adicionando ? formVinculo() : ''}
      ${itens.length ? `
        <div class="contatos">
          ${itens.map((v) => `
            <div class="contato">
              <span class="avatar">${esc(iniciais(v.outra.nome))}</span>
              <div class="contato-info">
                <strong>${esc(v.outra.nome)}</strong>
                <small>${esc(v.frase)} · Código ${v.outra.codigo}${v.outra.cpf_cnpj ? ` · ${v.outra.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} ${esc(formatarCpfCnpj(v.outra.cpf_cnpj))}` : ''}</small>
              </div>
              <span class="selo-vinculo">${esc(NOME_TIPO[v.tipo])}</span>
              <a class="link-abrir" href="#/clientes/${v.outra.id}">Abrir ficha${icone('arrowUpRight', 14)}</a>
              <button type="button" class="icon-btn" data-remover="${v.id}" aria-label="Remover vínculo">${icone('trash')}</button>
            </div>`).join('')}
        </div>` : (adicionando ? '' : '<p class="t-faint">Nenhum vínculo cadastrado.</p>')}
    </section>`;

  const estado = { pessoa: null };
  const form = caixa.querySelector('.form-vinculo');
  if (form) {
    montarEscolhaCliente(form.querySelector('[data-escolha="pessoa"]'), {
      placeholder: 'Buscar a pessoa por nome, telefone ou CPF',
      ignorar: (c) => c.id === atual.id,
      aoMudar: (cliente) => { estado.pessoa = cliente; },
    });
    ajustarSentido(form);
  }

  caixa.onchange = (ev) => {
    if (ev.target.name === 'tipo' && form) ajustarSentido(form);
  };

  caixa.onclick = (ev) => {
    const botao = ev.target.closest('button');
    if (!botao) return;
    const d = botao.dataset;
    if (d.acao === 'adicionar') renderVinculos(caixa, ficha, recarregar, true);
    else if ('cancelar' in d) renderVinculos(caixa, ficha, recarregar);
    else if (d.acao === 'salvar-vinculo') salvar(form, ficha, estado, recarregar);
    else if (d.remover) remover(itens.find((v) => v.id === d.remover), recarregar);
  };
}

function formVinculo() {
  return `
    <div class="form-inline form-vinculo">
      <div class="grade-2">
        ${select('tipo', 'Tipo de vínculo', TIPOS_VINCULO, 'conjuge', { vazio: false })}
        <div class="campo" data-sentido>
          <label for="f-sentido">Quem é o quê</label>
          <select id="f-sentido" name="sentido">
            <option value="outra">A pessoa escolhida é <span data-nome-tipo></span> deste cliente</option>
            <option value="este">Este cliente é <span data-nome-tipo></span> da pessoa escolhida</option>
          </select>
        </div>
      </div>
      <div class="campo">
        <label>Pessoa</label>
        <div data-escolha="pessoa"></div>
      </div>
      <p class="erro-form" hidden></p>
      <div class="acoes">
        <button type="button" class="btn btn-secundario btn-peq" data-cancelar>Cancelar</button>
        <button type="button" class="btn btn-primario btn-peq" data-acao="salvar-vinculo">${icone('check', 14)}<span>Salvar vínculo</span></button>
      </div>
    </div>`;
}

// Para cônjuge a direção não importa; para os outros, escolhe quem é o quê.
function ajustarSentido(form) {
  const tipo = form.querySelector('[name="tipo"]').value;
  const bloco = form.querySelector('[data-sentido]');
  bloco.hidden = tipo === 'conjuge';
  const nome = NOME_TIPO[tipo].toLowerCase();
  const [outra, este] = bloco.querySelectorAll('option');
  outra.textContent = `A pessoa escolhida é ${nome} deste cliente`;
  este.textContent = `Este cliente é ${nome} da pessoa escolhida`;
}

async function salvar(form, ficha, estado, recarregar) {
  const erro = form.querySelector('.erro-form');
  const mostrarErro = (texto) => { erro.textContent = texto; erro.hidden = false; };
  erro.hidden = true;

  if (!estado.pessoa) return mostrarErro('Escolha a pessoa.');
  const tipo = form.querySelector('[name="tipo"]').value;
  const atual = ficha.cliente.id;
  const outra = estado.pessoa.id;

  const jaExiste = ficha.vinculos.some((v) => v.tipo === tipo
    && ((v.cliente_id === atual && v.cliente_vinculado_id === outra) || (v.cliente_id === outra && v.cliente_vinculado_id === atual)));
  if (jaExiste) return mostrarErro('Esse vínculo já existe.');

  // guardado como "<vinculado> é <tipo> de <cliente>"
  const esteEhOQue = tipo !== 'conjuge' && form.querySelector('[name="sentido"]').value === 'este';
  const linha = esteEhOQue
    ? { cliente_id: outra, cliente_vinculado_id: atual, tipo }
    : { cliente_id: atual, cliente_vinculado_id: outra, tipo };

  const botao = form.querySelector('[data-acao="salvar-vinculo"]');
  botao.disabled = true;
  const { error } = await sb.from('cad_clientes_vinculos').insert(linha);
  botao.disabled = false;
  if (error) return mostrarErro(error.code === '23505' ? 'Esse vínculo já existe.' : mensagemErro(error));

  toast('Vínculo salvo.');
  recarregar();
}

async function remover(vinculo, recarregar) {
  if (!vinculo) return;
  if (!window.confirm(`Remover o vínculo de ${NOME_TIPO[vinculo.tipo].toLowerCase()} com ${vinculo.outra.nome}? As duas fichas continuam cadastradas.`)) return;
  const { error } = await sb.from('cad_clientes_vinculos').delete().eq('id', vinculo.id);
  if (error) return toast(mensagemErro(error), 'erro');
  toast('Vínculo removido.');
  recarregar();
}
