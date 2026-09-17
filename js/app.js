// Sistema de Gestão de Locação · Projetar Imóveis
// Rotas: #/clientes · #/clientes/novo · #/clientes/<id>/<aba>
//        #/imoveis  · #/imoveis/novo  · #/imoveis/<id>/<aba>
//        #/negociacoes · #/negociacoes/novo[?imovel=<id>] · #/negociacoes/<id>/<aba>
//        #/negociacoes/<id>/contrato (gerar) · #/contratos · #/contratos/<id>/<aba>

import { sb } from './supabase.js';
import { esc, icone, iniciais } from './util.js';
import { telaLista } from './telas/lista.js';
import { telaNovo } from './telas/novo.js';
import { telaFicha } from './telas/ficha.js';
import { telaImoveisLista } from './telas/imoveis-lista.js';
import { telaImovelNovo } from './telas/imoveis-novo.js';
import { telaImovelFicha } from './telas/imoveis-ficha.js';
import { telaNegociacoesLista } from './telas/negociacoes-lista.js';
import { telaNegociacaoNova } from './telas/negociacoes-nova.js';
import { telaNegociacaoFicha } from './telas/negociacoes-ficha.js';
import { telaContratosLista } from './telas/contratos-lista.js';
import { telaContratoFicha } from './telas/contratos-ficha.js';
import { telaContratoGerar } from './telas/contratos-gerar.js';

const app = document.getElementById('app');
let sessao = null;
let temAcesso = false;

const MENU = [
  ['Clientes', 'users', '#/clientes'],
  ['Imóveis', 'home', '#/imoveis'],
  ['Negociações', 'handshake', '#/negociacoes'],
  ['Contratos', 'contract', '#/contratos'],
  ['Financeiro', 'wallet', null],
];

const marca = `
  <div class="login-marca">
    <span class="marca-nome">PROJETAR IMÓVEIS</span>
    <span class="marca-creci">CRECI 2709J</span>
  </div>`;

function telaLogin() {
  app.innerHTML = `
    <div class="login-tela">
      <form class="card login-card" id="form-login" novalidate>
        ${marca}
        <p class="apoio">Gestão de Locação</p>
        <div class="campo">
          <label for="login-email">E-mail</label>
          <input id="login-email" name="email" type="email" autocomplete="username">
        </div>
        <div class="campo">
          <label for="login-senha">Senha</label>
          <input id="login-senha" name="senha" type="password" autocomplete="current-password">
        </div>
        <p class="erro-form" hidden></p>
        <button class="btn btn-primario btn-largo" type="submit">Entrar</button>
      </form>
    </div>`;

  const form = document.getElementById('form-login');
  form.elements.namedItem('email').focus();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erro = form.querySelector('.erro-form');
    const botao = form.querySelector('[type="submit"]');
    const email = form.elements.namedItem('email').value.trim();
    const senha = form.elements.namedItem('senha').value;
    if (!email || !senha) {
      erro.textContent = 'Preencha e-mail e senha.';
      erro.hidden = false;
      return;
    }
    erro.hidden = true;
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) {
      erro.textContent = 'E-mail ou senha incorretos.';
      erro.hidden = false;
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  });
}

function telaSemAcesso() {
  app.innerHTML = `
    <div class="login-tela">
      <div class="card login-card">
        ${marca}
        <h1 class="h-login">Sem acesso ao cadastro</h1>
        <p>O usuário <strong>${esc(sessao.user.email)}</strong> ainda não foi liberado para ver as fichas de clientes. Peça ao administrador para liberar o acesso.</p>
        <button class="btn btn-secundario btn-largo" id="sair" type="button">Sair</button>
      </div>
    </div>`;
  document.getElementById('sair').addEventListener('click', () => sb.auth.signOut());
}

function montarLayout(ativo) {
  const email = sessao.user.email;
  app.innerHTML = `
    <header class="topo">
      <div class="topo-marca">
        <div class="marca"><span class="marca-nome">PROJETAR IMÓVEIS</span><span class="marca-creci">CRECI 2709J</span></div>
        <span class="topo-divisor"></span>
        <span class="topo-sistema">Gestão de Locação</span>
      </div>
      <div class="topo-usuario">
        <span class="topo-email">${esc(email)}</span>
        <span class="avatar-topo">${esc(iniciais(email.split('@')[0]))}</span>
        <button class="btn-sair" id="sair" type="button">Sair</button>
      </div>
    </header>
    <div class="barra-ouro"></div>
    <div class="layout">
      <nav class="menu" aria-label="Menu principal">
        ${MENU.map(([rotulo, ic, href]) => href
          ? `<a class="menu-item ${rotulo === ativo ? 'ativo' : ''}" href="${href}">${icone(ic, 18)}<span>${rotulo}</span></a>`
          : `<span class="menu-item desativado" title="Em breve">${icone(ic, 18)}<span>${rotulo}</span></span>`).join('')}
      </nav>
      <main class="conteudo" id="conteudo"></main>
    </div>`;
  document.getElementById('sair').addEventListener('click', () => sb.auth.signOut());
  return document.getElementById('conteudo');
}

function rotear() {
  if (!sessao) return telaLogin();
  if (!temAcesso) return telaSemAcesso();

  const hash = location.hash || '#/clientes';

  if (hash.startsWith('#/imoveis')) {
    const conteudo = montarLayout('Imóveis');
    window.scrollTo(0, 0);
    if (hash === '#/imoveis/novo') return telaImovelNovo(conteudo);
    const ficha = hash.match(/^#\/imoveis\/([0-9a-f-]{36})(?:\/([a-z]+))?$/);
    if (ficha) return telaImovelFicha(conteudo, ficha[1], ficha[2] || 'dados');
    if (hash !== '#/imoveis') history.replaceState(null, '', '#/imoveis');
    return telaImoveisLista(conteudo);
  }

  if (hash.startsWith('#/negociacoes')) {
    const conteudo = montarLayout('Negociações');
    window.scrollTo(0, 0);
    const nova = hash.match(/^#\/negociacoes\/novo(?:\?imovel=([0-9a-f-]{36}))?$/);
    if (nova) return telaNegociacaoNova(conteudo, nova[1] || null);
    const gerar = hash.match(/^#\/negociacoes\/([0-9a-f-]{36})\/contrato$/);
    if (gerar) return telaContratoGerar(conteudo, gerar[1]);
    const ficha = hash.match(/^#\/negociacoes\/([0-9a-f-]{36})(?:\/([a-z]+))?$/);
    if (ficha) return telaNegociacaoFicha(conteudo, ficha[1], ficha[2] || 'resumo');
    if (hash !== '#/negociacoes') history.replaceState(null, '', '#/negociacoes');
    return telaNegociacoesLista(conteudo);
  }

  if (hash.startsWith('#/contratos')) {
    const conteudo = montarLayout('Contratos');
    window.scrollTo(0, 0);
    const ficha = hash.match(/^#\/contratos\/([0-9a-f-]{36})(?:\/([a-z]+))?$/);
    if (ficha) return telaContratoFicha(conteudo, ficha[1], ficha[2] || 'resumo');
    if (hash !== '#/contratos') history.replaceState(null, '', '#/contratos');
    return telaContratosLista(conteudo);
  }

  const conteudo = montarLayout('Clientes');
  window.scrollTo(0, 0);
  if (hash === '#/clientes/novo') return telaNovo(conteudo);
  const ficha = hash.match(/^#\/clientes\/([0-9a-f-]{36})(?:\/([a-z]+))?$/);
  if (ficha) return telaFicha(conteudo, ficha[1], ficha[2] || 'dados');
  if (hash !== '#/clientes') history.replaceState(null, '', '#/clientes');
  return telaLista(conteudo);
}

async function verificarAcesso() {
  const { data, error } = await sb.rpc('cad_tem_acesso');
  temAcesso = !error && data === true;
}

sb.auth.onAuthStateChange((_evento, novaSessao) => {
  // Fora do callback, como recomenda o supabase-js (evita travar outras chamadas).
  setTimeout(async () => {
    const trocouUsuario = novaSessao?.user?.id !== sessao?.user?.id;
    sessao = novaSessao;
    if (app.dataset.pronto && !trocouUsuario) return; // ex.: renovação automática do login
    if (sessao) await verificarAcesso();
    else temAcesso = false;
    app.dataset.pronto = '1';
    rotear();
  }, 0);
});

window.addEventListener('hashchange', () => {
  if (app.dataset.pronto) rotear();
});
