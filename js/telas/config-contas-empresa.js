// Configurações › Contas da imobiliária.
// É a conta que RECEBE o aluguel e a conta de onde SAI o repasse.
// Nada de senha ou certificado aqui: credenciais do banco ficam nos
// Secrets do Supabase. Aqui só ficam os dados que identificam a conta
// e o convênio de cobrança, para quando a API do banco entrar.

import { sb } from '../supabase.js';
import { esc, icone, mensagemErro, toast, formatarCpfCnpj } from '../util.js';
import { campo, select as selectCampo, campoTexto, limparErros, mostrarErros, mostrarErroForm } from '../formulario.js';

const TIPOS_CONTA_BANCO = [['corrente', 'Conta corrente'], ['poupanca', 'Poupança'], ['pagamento', 'Conta de pagamento']];
const TIPOS_PIX = [['cpf_cnpj', 'CPF / CNPJ'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['aleatoria', 'Chave aleatória']];
const PROVEDORES = [['unicred', 'Unicred'], ['sicredi', 'Sicredi'], ['sicoob', 'Sicoob'],
  ['banco_brasil', 'Banco do Brasil'], ['itau', 'Itaú'], ['bradesco', 'Bradesco'], ['outro', 'Outro']];
const AMBIENTES = [['homologacao', 'Teste (homologação)'], ['producao', 'Valendo (produção)']];

const dado = (rot, valor, html = false) =>
  `<div class="dado"><span class="rotulo">${rot}</span><span class="valor">${valor == null || valor === ''
    ? '<span class="t-faint">—</span>' : (html ? valor : esc(valor))}</span></div>`;

const CAMPOS = ['nome', 'banco_codigo', 'banco_nome', 'agencia', 'conta', 'tipo_conta', 'pix_tipo', 'pix_chave',
  'titular_nome', 'titular_cpf_cnpj', 'cidade', 'cobranca_convenio', 'cobranca_carteira', 'cobranca_variacao',
  'cobranca_nosso_numero', 'cobranca_dias_baixa', 'cobranca_instrucoes', 'api_provedor', 'api_ambiente',
  'api_observacao', 'observacao'];

export async function telaContasEmpresa(caixa) {
  caixa.innerHTML = '<div class="carregando">Carregando as contas…</div>';
  const { data, error } = await sb.from('cad_contas_empresa').select('*').order('codigo');
  if (!caixa.isConnected) return;
  if (error) {
    caixa.innerHTML = `<div class="card vazio">${esc(mensagemErro(error))}</div>`;
    return;
  }

  const contas = data ?? [];
  const recarregar = () => telaContasEmpresa(caixa);

  caixa.innerHTML = `
    <div class="titulo-pagina">
      <div>
        <h1>Contas da imobiliária</h1>
        <p class="apoio">Onde o aluguel cai e de onde sai o repasse. O boleto e o Pix usam estes dados.</p>
      </div>
      <button type="button" class="btn btn-primario" data-nova>${icone('plus')}<span>Nova conta</span></button>
    </div>

    ${contas.length ? contas.map(cartao).join('') : '<div class="card vazio">Nenhuma conta cadastrada ainda.</div>'}`;

  caixa.querySelector('[data-nova]').addEventListener('click', () => formConta(caixa, null, recarregar));
  caixa.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () =>
    formConta(caixa, contas.find((c) => c.id === b.dataset.editar), recarregar)));
}

function cartao(c) {
  const faltando = [
    !c.agencia && 'agência', !c.conta && 'conta', !c.pix_chave && 'chave Pix',
    !c.titular_nome && 'razão social', !c.cidade && 'cidade',
  ].filter(Boolean);

  return `
    <section class="card conta-empresa ${c.ativo ? '' : 'inativa'}">
      <div class="conta-topo">
        <div>
          <strong>${esc(c.nome)}</strong>
          <small>${esc([c.banco_nome, c.agencia && `ag. ${c.agencia}`, c.conta && `c/c ${c.conta}`].filter(Boolean).join(' · ') || 'sem dados bancários')}</small>
        </div>
        <div class="conta-marcas">
          ${c.recebe_aluguel ? '<span class="selo-mov aberto">Recebe o aluguel</span>' : ''}
          ${c.paga_repasse ? '<span class="selo-mov aberto">Paga o repasse</span>' : ''}
          ${c.ativo ? '' : '<span class="selo-mov">Inativa</span>'}
          <button type="button" class="btn btn-secundario btn-peq" data-editar="${c.id}">${icone('edit', 14)}<span>Editar</span></button>
        </div>
      </div>
      <div class="dados-grade">
        ${dado('Chave Pix', c.pix_chave)}
        ${dado('Razão social no Pix', c.titular_nome)}
        ${dado('CNPJ', c.titular_cpf_cnpj ? formatarCpfCnpj(c.titular_cpf_cnpj) : '')}
        ${dado('Cidade', c.cidade)}
        ${dado('Convênio de cobrança', c.cobranca_convenio)}
        ${dado('Boleto pela API', c.api_ativa
          ? `<strong class="t-ok">ligada</strong> · ${esc(c.api_ambiente === 'producao' ? 'valendo' : 'teste')}`
          : '<span class="t-faint">desligada — emissão pelo internet banking</span>', true)}
      </div>
      ${faltando.length ? `<p class="aviso-inline">${icone('alert', 14)} Falta preencher: ${esc(faltando.join(', '))}. Sem isso o Pix copia e cola não sai.</p>` : ''}
    </section>`;
}

function formConta(caixa, c, recarregar) {
  const d = c ?? {};
  const painel = document.createElement('div');
  painel.className = 'pilha';
  painel.innerHTML = `
    <form class="card painel" novalidate>
      <h2 class="h-card">${c ? 'Editar conta' : 'Nova conta da imobiliária'}</h2>
      <div class="grade-3">
        ${campo('nome', 'Nome da conta *', d.nome ?? '', { placeholder: 'Unicred · conta principal' })}
        ${campo('banco_nome', 'Banco', d.banco_nome ?? '', { placeholder: 'Unicred' })}
        ${campo('banco_codigo', 'Código do banco', d.banco_codigo ?? '', { inputmode: 'numeric', placeholder: '136' })}
        ${campo('agencia', 'Agência', d.agencia ?? '', { inputmode: 'numeric' })}
        ${campo('conta', 'Conta (com dígito)', d.conta ?? '')}
        ${selectCampo('tipo_conta', 'Tipo', TIPOS_CONTA_BANCO, d.tipo_conta ?? 'corrente')}
      </div>

      <h3 class="h-secao">Pix</h3>
      <div class="grade-3">
        ${selectCampo('pix_tipo', 'Tipo da chave', TIPOS_PIX, d.pix_tipo ?? 'cpf_cnpj')}
        ${campo('pix_chave', 'Chave Pix', d.pix_chave ?? '')}
        ${campo('cidade', 'Cidade do recebedor', d.cidade ?? 'Araranguá')}
        ${campo('titular_nome', 'Razão social que aparece no Pix', d.titular_nome ?? '', { placeholder: 'Projetar Imóveis' })}
        ${campo('titular_cpf_cnpj', 'CNPJ', d.titular_cpf_cnpj ?? '', { mascara: 'cpfcnpj', inputmode: 'numeric' })}
      </div>

      <details class="bloco-tecnico">
        <summary>Cobrança de boleto e integração com o banco</summary>
        <p class="apoio">Preencha quando a Unicred liberar o convênio de cobrança. Enquanto estiver
          desligado, o boleto continua sendo emitido no internet banking e colado no sistema.
          <strong>Senha, token e certificado não entram aqui</strong> — eles ficam guardados à parte, nos Secrets.</p>
        <div class="grade-3">
          ${campo('cobranca_convenio', 'Convênio', d.cobranca_convenio ?? '')}
          ${campo('cobranca_carteira', 'Carteira', d.cobranca_carteira ?? '')}
          ${campo('cobranca_variacao', 'Variação', d.cobranca_variacao ?? '')}
          ${campo('cobranca_nosso_numero', 'Último nosso número', d.cobranca_nosso_numero ?? '', { inputmode: 'numeric' })}
          ${campo('cobranca_dias_baixa', 'Dias para baixa após o vencimento', d.cobranca_dias_baixa ?? '', { inputmode: 'numeric' })}
          ${selectCampo('api_provedor', 'Banco da integração', PROVEDORES, d.api_provedor ?? '')}
          ${selectCampo('api_ambiente', 'Ambiente', AMBIENTES, d.api_ambiente ?? 'homologacao', { vazio: false })}
        </div>
        ${campoTexto('cobranca_instrucoes', 'Instruções que saem no boleto', d.cobranca_instrucoes ?? '')}
        ${campoTexto('api_observacao', 'Anotações da integração', d.api_observacao ?? '')}
        <label class="check"><input type="checkbox" name="api_ativa" ${d.api_ativa ? 'checked' : ''}>
          <span>Emitir boleto pela API do banco (só marque quando estiver funcionando)</span></label>
      </details>

      <div class="marcas-conta">
        <label class="check"><input type="checkbox" name="recebe_aluguel" ${d.recebe_aluguel ? 'checked' : ''}>
          <span>É nesta conta que o aluguel cai</span></label>
        <label class="check"><input type="checkbox" name="paga_repasse" ${d.paga_repasse ? 'checked' : ''}>
          <span>É desta conta que sai o repasse</span></label>
        <label class="check"><input type="checkbox" name="ativo" ${d.ativo === false ? '' : 'checked'}>
          <span>Conta ativa</span></label>
      </div>
      ${campoTexto('observacao', 'Observação', d.observacao ?? '')}

      <p class="erro-form" hidden></p>
      <div class="acoes entre">
        <button type="button" class="btn btn-secundario" data-cancelar>Cancelar</button>
        <button type="submit" class="btn btn-primario">${icone('check')}<span>Salvar</span></button>
      </div>
    </form>`;

  caixa.prepend(painel);
  const form = painel.querySelector('form');
  form.elements.namedItem('nome').focus();
  painel.querySelector('[data-cancelar]').addEventListener('click', () => painel.remove());

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    if (mostrarErros(form, form.elements.namedItem('nome').value.trim() ? {} : { nome: 'Dê um nome para a conta.' })) return;

    const dados = { id: c?.id ?? null };
    for (const nome of CAMPOS) dados[nome] = form.elements.namedItem(nome).value.trim() || null;
    for (const nome of ['recebe_aluguel', 'paga_repasse', 'ativo', 'api_ativa']) dados[nome] = form.elements.namedItem(nome).checked;

    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    const { error } = await sb.rpc('cad_guardar_conta_empresa', { p_dados: dados });
    botao.disabled = false;
    if (error) return mostrarErroForm(form, '.erro-form', mensagemErro(error));

    toast('Conta salva.');
    painel.remove();
    recarregar();
  });
}
