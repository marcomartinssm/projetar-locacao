// Novo imóvel: dados principais + proprietários. O resto se completa na ficha.

import { sb } from '../supabase.js';
import { icone, toast } from '../util.js';
import { limparErros, mostrarErros, mostrarErroForm, ligarMascaras } from '../formulario.js';
import { camposImovel, lerImovel, mensagemErroImovel } from '../imovel-form.js';
import { montarEditorProprietarios } from '../componentes/editor-proprietarios.js';

export function telaImovelNovo(el) {
  el.innerHTML = `
    <nav class="trilha"><a href="#/imoveis">Imóveis</a>${icone('chevronRight', 14)}<span>Novo imóvel</span></nav>
    <div class="titulo-pagina">
      <div>
        <h1>Novo imóvel</h1>
        <p class="apoio">O resto (contas, anúncio, fotos e anexos) você completa na ficha depois de salvar.</p>
      </div>
    </div>
    <form class="card painel" id="form-imovel" novalidate>
      ${camposImovel({}, {
        completo: false,
        antesDosValores: '<h2 class="h-secao">Proprietários</h2><div id="editor-proprietarios"></div>',
      })}
      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <a class="btn btn-secundario" href="#/imoveis">Cancelar</a>
        <button class="btn btn-primario" type="submit">${icone('check')}<span>Salvar imóvel</span></button>
      </div>
    </form>`;

  const form = el.querySelector('#form-imovel');
  ligarMascaras(form);
  const proprietarios = montarEditorProprietarios(form.querySelector('#editor-proprietarios'));
  form.elements.namedItem('tipo').focus();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);

    const { dados, erros } = lerImovel(form);
    if (mostrarErros(form, erros)) return;
    const problema = proprietarios.validar();
    if (problema) return mostrarErroForm(form, '.erro-form', problema);

    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    const { data, error } = await sb.rpc('loc_criar_imovel', {
      p_dados: { ...dados, proprietarios: proprietarios.paraSalvar() },
    });
    botao.disabled = false;
    if (error) return mostrarErroForm(form, '.erro-form', mensagemErroImovel(error));

    toast('Imóvel cadastrado.');
    location.hash = `#/imoveis/${data}`;
  });
}
