// Aba Auditoria: quem fez o quê, quando e de onde (IP), numa ficha de cliente ou de imóvel.
// Os registros são gravados pelo banco automaticamente e não podem ser alterados.

import { sb } from '../supabase.js';
import { esc, formatarData, mensagemErro, SITUACOES_NEGOCIACAO, SITUACOES_IMOVEL, GARANTIAS } from '../util.js';

const POR_PAGINA = 50;

const TABELAS = {
  cad_clientes: 'Ficha do cliente',
  cad_clientes_telefones: 'Telefone',
  cad_clientes_emails: 'E-mail',
  cad_clientes_contas_bancarias: 'Conta bancária',
  cad_clientes_anexos: 'Anexo',
  cad_clientes_vinculos: 'Vínculo',
  cad_clientes_relacionamentos: 'Relacionamento',
  loc_imoveis: 'Dados do imóvel',
  loc_imoveis_proprietarios: 'Proprietário',
  loc_imoveis_contas: 'Conta do imóvel',
  loc_imoveis_fotos: 'Foto',
  loc_imoveis_anexos: 'Anexo',
  loc_negociacoes: 'Dados da negociação',
  loc_negociacoes_pessoas: 'Pessoa da negociação',
};

const ACOES = {
  inserir: ['Incluiu', 'inserir'],
  alterar: ['Alterou', 'alterar'],
  excluir: ['Excluiu', 'excluir'],
  ver_senha: ['Viu a senha', 'senha'],
  alterar_senha: ['Alterou a senha', 'senha'],
  apagar_senha: ['Apagou a senha', 'senha'],
};

const CAMPOS = {
  nome: 'Nome', nome_fantasia: 'Nome fantasia', cpf_cnpj: 'CPF/CNPJ', tipo_pessoa: 'Tipo de pessoa',
  rg: 'RG', rg_orgao_emissor: 'Órgão emissor', rg_uf: 'UF do RG', data_nascimento: 'Data de nascimento',
  nacionalidade: 'Nacionalidade', estado_civil: 'Estado civil', profissao: 'Profissão',
  inscricao_estadual: 'Inscrição estadual', inscricao_municipal: 'Inscrição municipal', data_fundacao: 'Data de fundação',
  cep: 'CEP', logradouro: 'Rua', numero: 'Número', complemento: 'Complemento', bairro: 'Bairro', cidade: 'Cidade', uf: 'UF',
  observacoes: 'Observações', observacao: 'Observação', ativo: 'Ativo', principal: 'Principal', whatsapp: 'WhatsApp',
  email: 'E-mail', tipo: 'Tipo', descricao: 'Descrição',
  banco_codigo: 'Código do banco', banco_nome: 'Banco', agencia: 'Agência', conta: 'Conta', tipo_conta: 'Tipo de conta',
  pix_tipo: 'Tipo da chave Pix', pix_chave: 'Chave Pix', titular_cliente_id: 'Titular',
  arquivo_path: 'Arquivo', cliente_vinculado_id: 'Pessoa vinculada', origem: 'Origem', referencia_descricao: 'Onde',
  codigo_imoview: 'Código no Imoview', destinacao: 'Destinação', situacao: 'Situação', condominio_nome: 'Condomínio',
  area_privativa_m2: 'Área privativa', area_total_m2: 'Área total', quartos: 'Quartos', suites: 'Suítes',
  banheiros: 'Banheiros', vagas: 'Vagas', andar: 'Andar', mobiliado: 'Mobiliado', permite_animais: 'Permite animais',
  matricula: 'Matrícula', cartorio: 'Cartório', tipo_dimob: 'Tipo DIMOB',
  valor_aluguel: 'Valor do aluguel', valor_condominio: 'Condomínio (mensal)', valor_iptu_anual: 'IPTU (anual)',
  valor_seguro_incendio_anual: 'Seguro incêndio (anual)', taxa_administracao: 'Taxa de administração',
  taxa_intermediacao: 'Taxa de intermediação', chaves_local: 'Local das chaves', chaves_identificador: 'Nº do chaveiro',
  vago_desde: 'Vago desde', titulo_anuncio: 'Título do anúncio', descricao_anuncio: 'Descrição do anúncio',
  site_publicar: 'Publicar no site', site_destaque: 'Destaque no site',
  grupo_olx_publicar: 'Publicar no Grupo OLX', grupo_olx_destaque: 'Destaque no Grupo OLX',
  percentual: 'Percentual', empresa_cliente_id: 'Empresa', identificador: 'Identificação', numero_cliente: 'Nº do cliente',
  valor: 'Valor', valor_fundo_reserva: 'Fundo de reserva', dia_vencimento: 'Dia de vencimento',
  contato_nome: 'Contato', contato_telefone: 'Telefone do contato', contato_email: 'E-mail do contato',
  portal_url: 'Portal', portal_usuario: 'Usuário do portal', legenda: 'Legenda', ordem: 'Ordem', capa: 'Capa',
  locatario_cliente_id: 'Locatário', data_negociacao: 'Data da negociação', prazo_meses: 'Prazo (meses)',
  inicio_previsto: 'Início previsto', garantia_tipo: 'Garantia', corretor_id: 'Corretor que alugou', captador_id: 'Captador',
  fechada_em: 'Fechada em', cancelada_em: 'Cancelada em', motivo_cancelamento: 'Motivo do cancelamento',
  anotacoes: 'Anotações', papel: 'Papel', codigo: 'Código',
};

// Códigos gravados no banco → texto
const VALORES = {
  situacao: Object.fromEntries([...SITUACOES_NEGOCIACAO, ...SITUACOES_IMOVEL]),
  garantia_tipo: Object.fromEntries(GARANTIAS),
  papel: { solidario: 'Locatário solidário', fiador: 'Fiador' },
};

// Campos que guardam o id de uma ficha de cliente ou de alguém da equipe: mostram o nome.
const CAMPOS_ID = ['locatario_cliente_id', 'corretor_id', 'captador_id', 'titular_cliente_id', 'empresa_cliente_id', 'cliente_vinculado_id'];
// Nestas tabelas o cliente_id é a pessoa incluída (e não a própria ficha).
const TABELAS_PESSOA = new Set(['loc_negociacoes_pessoas', 'loc_imoveis_proprietarios']);
const nomes = new Map();

const OCULTOS = new Set(['id', 'cliente_id', 'imovel_id', 'negociacao_id', 'criado_em', 'atualizado_em', 'senha_segredo_id']);

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

const nomeCampo = (campo) => CAMPOS[campo] ?? (campo.charAt(0).toUpperCase() + campo.slice(1)).replace(/_/g, ' ');

function valorTexto(valor, campo) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (nomes.has(valor)) return nomes.get(valor);
  if (VALORES[campo]?.[valor]) return VALORES[campo][valor];
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatarData(valor);
  if (valor === true) return 'Sim';
  if (valor === false) return 'Não';
  const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  return texto.length > 80 ? `${texto.slice(0, 77)}…` : texto;
}

function navegadorCurto(ua) {
  if (!ua) return '';
  const navegador = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Firefox\//.test(ua) ? 'Firefox'
          : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const aparelho = /iPhone|iPad/.test(ua) ? 'iPhone/iPad'
    : /Android/.test(ua) ? 'Android'
      : /Mac OS X/.test(ua) ? 'Mac'
        : /Windows/.test(ua) ? 'Windows'
          : /Linux/.test(ua) ? 'Linux' : '';
  return aparelho ? `${navegador} · ${aparelho}` : navegador;
}

// Uma palavra para identificar o item (ex.: o número do telefone, o nome do arquivo)
function resumo(registro) {
  const alteracoes = registro.alteracoes || {};
  const pegar = (chave) => (registro.acao === 'alterar'
    ? (alteracoes[chave]?.para ?? alteracoes[chave]?.de)
    : alteracoes[chave]);
  if (TABELAS_PESSOA.has(registro.tabela)) {
    const nome = nomes.get(pegar('cliente_id'));
    const papel = VALORES.papel[pegar('papel')];
    if (nome) return papel ? `${nome} (${papel})` : nome;
  }
  for (const chave of ['nome', 'numero', 'email', 'descricao', 'banco_nome', 'pix_chave', 'tipo', 'arquivo_path']) {
    const valor = pegar(chave);
    if (valor != null && valor !== '') {
      return chave === 'arquivo_path' ? String(valor).split('/').pop().replace(/^[0-9a-f-]{36}-/, '') : String(valor);
    }
  }
  return '';
}

function mudancas(registro) {
  if (registro.acao !== 'alterar') return '';
  const itens = Object.entries(registro.alteracoes || {}).filter(([campo]) => !OCULTOS.has(campo));
  if (!itens.length) return '';
  return `<ul class="aud-mudancas">${itens.map(([campo, v]) =>
    `<li><b>${esc(nomeCampo(campo))}:</b> ${esc(valorTexto(v?.de, campo))} → ${esc(valorTexto(v?.para, campo))}</li>`).join('')}</ul>`;
}

function linha(registro) {
  const [acaoTexto, acaoClasse] = ACOES[registro.acao] ?? [registro.acao, ''];
  const identificacao = resumo(registro);
  return `
    <div class="aud-linha">
      <span>${esc(dataHora(registro.criado_em))}</span>
      <span class="texto-cortado" title="${esc(registro.usuario_email ?? '')}">${esc(registro.usuario_email || 'Sistema')}</span>
      <span><span class="aud-acao ${acaoClasse}">${esc(acaoTexto)}</span></span>
      <span>${esc(TABELAS[registro.tabela] ?? registro.tabela)}${identificacao ? `: <strong>${esc(identificacao)}</strong>` : ''}${mudancas(registro)}</span>
      <span class="aud-origem">${esc(registro.ip || '—')}<small>${esc(navegadorCurto(registro.navegador))}</small></span>
    </div>`;
}

// Busca de uma vez os nomes das fichas e da equipe citadas nos registros.
async function buscarNomes(lista) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const ids = new Set();
  for (const r of lista) {
    const campos = TABELAS_PESSOA.has(r.tabela) ? [...CAMPOS_ID, 'cliente_id'] : CAMPOS_ID;
    for (const campo of campos) {
      const v = r.alteracoes?.[campo];
      for (const valor of (v && typeof v === 'object' ? [v.de, v.para] : [v])) {
        if (typeof valor === 'string' && uuid.test(valor) && !nomes.has(valor)) ids.add(valor);
      }
    }
  }
  if (!ids.size) return;
  const listaIds = [...ids];
  const [clientes, equipe] = await Promise.all([
    sb.from('cad_clientes').select('id, nome').in('id', listaIds),
    sb.from('loc_equipe').select('id, nome').in('id', listaIds),
  ]);
  for (const item of [...(clientes.data ?? []), ...(equipe.data ?? [])]) nomes.set(item.id, item.nome);
}

export async function renderAuditoria(caixa, { entidade, entidadeId }) {
  caixa.innerHTML = `
    <section class="card secao-card">
      <div class="secao-cabecalho"><h2 class="h-card">Auditoria</h2></div>
      <p class="apoio">Tudo o que foi feito nesta ficha: data e hora, quem fez, o quê e de qual internet (IP). Os registros são gravados automaticamente e não podem ser alterados.</p>
      <div class="auditoria-lista"><div class="carregando">Carregando…</div></div>
      <div class="acoes" data-mais hidden><button type="button" class="btn btn-secundario btn-peq">Carregar mais</button></div>
    </section>`;

  const lista = caixa.querySelector('.auditoria-lista');
  const mais = caixa.querySelector('[data-mais]');
  const botaoMais = mais.querySelector('button');
  let pagina = 0;
  let registros = [];

  async function carregar() {
    const { data, error } = await sb.from('aud_registros')
      .select('*')
      .eq('entidade', entidade)
      .eq('entidade_id', entidadeId)
      .order('criado_em', { ascending: false })
      .order('id', { ascending: false })
      .range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1);

    if (error) {
      lista.innerHTML = `<div class="vazio">${esc(mensagemErro(error))}</div>`;
      return;
    }
    await buscarNomes(data);
    registros = registros.concat(data);
    if (!registros.length) {
      lista.innerHTML = '<p class="t-faint">Nenhum registro ainda.</p>';
      mais.hidden = true;
      return;
    }
    lista.innerHTML = `
      <div class="aud-linha cabecalho"><span>Data e hora</span><span>Usuário</span><span>Ação</span><span>O quê</span><span>Origem (IP)</span></div>
      ${registros.map(linha).join('')}`;
    mais.hidden = data.length < POR_PAGINA;
  }

  botaoMais.addEventListener('click', async () => {
    botaoMais.disabled = true;
    pagina += 1;
    await carregar();
    botaoMais.disabled = false;
  });

  await carregar();
}
