// Funções de apoio: formatação, validação, ícones, avisos.

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const digitos = (v) => String(v ?? '').replace(/\D/g, '');

// ---------- formatação para exibir ----------
export function formatarCpfCnpj(v) {
  const d = digitos(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return v ?? '';
}

export function formatarTelefone(v) {
  const d = digitos(v);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return v ?? '';
}

export function formatarCep(v) {
  const d = digitos(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (v ?? '');
}

export function formatarData(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

// ---------- máscaras enquanto digita ----------
export function aplicarMascaraTelefone(v) {
  const d = digitos(v).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function aplicarMascaraCpfCnpj(v) {
  const d = digitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function aplicarMascaraCep(v) {
  const d = digitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// ---------- validação ----------
export function cpfCnpjValido(v) {
  const d = digitos(v);
  const n = [...d].map(Number);
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += n[i] * (10 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== n[9]) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += n[i] * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    return resto === n[10];
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const digito = (tamanho) => {
      const pesos = tamanho === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let soma = 0;
      for (let i = 0; i < tamanho; i++) soma += n[i] * pesos[i];
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    return digito(12) === n[12] && digito(13) === n[13];
  }
  return false;
}

export const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? ''));

// ---------- textos ----------
export function iniciais(texto) {
  const partes = String(texto || '').split(/[\s@._-]+/).filter((p) => p && !/^(de|da|do|das|dos|e)$/i.test(p));
  if (!partes.length) return '?';
  return ((partes[0][0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

export function listaTexto(itens) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

export function mensagemErro(error) {
  if (!error) return 'Algo deu errado. Tente de novo.';
  const texto = `${error.message || ''} ${error.details || ''}`;
  if (error.code === '23505') {
    if (/principal/.test(texto)) return 'Já existe outro item marcado como principal.';
    if (/telefone/.test(texto)) return 'Esse telefone já pertence a outro cliente.';
    if (/email/.test(texto)) return 'Esse e-mail já pertence a outro cliente.';
    if (/cpf_cnpj/.test(texto)) return 'Esse CPF/CNPJ já pertence a outro cliente.';
    return 'Esse dado já existe em outro cadastro.';
  }
  if (error.code === '23514') {
    if (/cpf_cnpj/.test(texto)) return 'CPF/CNPJ inválido. Confira os números.';
    if (/telefone/.test(texto)) return 'Telefone inválido. Use DDD + número.';
    if (/email/.test(texto)) return 'E-mail inválido.';
    return 'Algum dado está em formato inválido.';
  }
  if (error.code === '42501') return 'Você não tem permissão para fazer isso.';
  if (error.code === 'P0001' && error.message) return error.message;
  return error.message || 'Algo deu errado. Tente de novo.';
}

let temporizadorToast;
export function toast(mensagem, tipo = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = mensagem;
  el.className = `toast ${tipo === 'erro' ? 'erro' : ''}`;
  el.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { el.hidden = true; }, tipo === 'erro' ? 6000 : 3000);
}

// ---------- listas fixas ----------
export const REL_ROTULO = {
  locador: 'Locador',
  locatario: 'Locatário',
  locatario_solidario: 'Solidário',
  fiador: 'Fiador',
  lead: 'Lead',
  comprador: 'Comprador',
  vendedor: 'Vendedor',
  fornecedor: 'Fornecedor',
  parceiro: 'Parceiro',
};

export const REL_FILTROS = [
  ['', 'Todos'],
  ['locador', 'Locadores'],
  ['locatario', 'Locatários'],
  ['locatario_solidario', 'Solidários'],
  ['fiador', 'Fiadores'],
  ['lead', 'Leads'],
  ['comprador', 'Compradores'],
  ['vendedor', 'Vendedores'],
  ['fornecedor', 'Fornecedores'],
  ['parceiro', 'Parceiros'],
];

const REL_LOCACAO = new Set(['locador', 'locatario', 'locatario_solidario', 'fiador']);
export const chipRel = (tipo) => `<span class="rel ${REL_LOCACAO.has(tipo) ? 'loc' : ''}">${esc(REL_ROTULO[tipo] ?? tipo)}</span>`;

export const ESTADOS_CIVIS = [
  ['solteiro', 'Solteiro(a)'],
  ['casado', 'Casado(a)'],
  ['uniao_estavel', 'União estável'],
  ['divorciado', 'Divorciado(a)'],
  ['separado', 'Separado(a)'],
  ['viuvo', 'Viúvo(a)'],
];

export const TIPOS_TELEFONE = [['celular', 'Celular'], ['fixo', 'Fixo'], ['comercial', 'Comercial']];

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

// ---------- ícones (traço, 24px) ----------
const ICONES = {
  search: '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>',
  plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
  home: '<path d="M3 10.5L12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path>',
  contract: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"></path><path d="M14 3v5h5"></path><path d="M9 13h6"></path><path d="M9 17h6"></path>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"></rect><path d="M3 10h18"></path><path d="M16 15h2"></path>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"></path>',
  whatsapp: '<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.6-5.2A8.5 8.5 0 1 1 21 11.5z"></path>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 7l9 6 9-6"></path>',
  edit: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
  trash: '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"></path>',
  chevronRight: '<path d="M9 6l6 6-6 6"></path>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"></path>',
  arrowUpRight: '<path d="M7 17L17 7"></path><path d="M8 7h9v9"></path>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"></path>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"></path><path d="M12 10v4.5"></path><path d="M12 17.5v.01"></path>',
};

export const icone = (nome, tamanho = 16) =>
  `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] ?? ''}</svg>`;

export const badgePrincipal = `<span class="badge-principal">${icone('star', 11)}Principal</span>`;

// ---------- valores em reais e percentuais ----------
const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarMoeda = (v) => (v == null || v === '' ? '' : MOEDA.format(Number(v)));

export const formatarNumeroBR = (v, casas = 2) =>
  (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));

// "R$ 2.200,50", "2.200", "10%" ou "2200.5" → número (null se vazio ou inválido)
export function lerNumeroBR(texto) {
  const limpo = String(texto ?? '').replace(/[R$\s%]/g, '');
  if (!limpo) return null;
  let normal = limpo;
  if (limpo.includes(',')) normal = limpo.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) normal = limpo.replace(/\./g, '');
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

// ---------- listas do imóvel ----------
export const TIPOS_IMOVEL = [
  ['apartamento', 'Apartamento'], ['casa', 'Casa'], ['sobrado', 'Sobrado'], ['kitnet', 'Kitnet'],
  ['cobertura', 'Cobertura'], ['sala_comercial', 'Sala comercial'], ['loja', 'Loja'], ['galpao', 'Galpão'],
  ['terreno', 'Terreno'], ['chacara', 'Chácara'], ['box_garagem', 'Box de garagem'], ['outro', 'Outro'],
];
export const SITUACOES_IMOVEL = [['disponivel', 'Disponível'], ['alugado', 'Alugado'], ['indisponivel', 'Indisponível'], ['inativo', 'Inativo']];
export const DESTINACOES = [['residencial', 'Residencial'], ['nao_residencial', 'Não residencial']];
export const CHAVES_LOCAL = [['imobiliaria', 'Imobiliária'], ['proprietario', 'Proprietário'], ['outro', 'Outro']];
export const TIPOS_DIMOB = [['urbano', 'Urbano'], ['rural', 'Rural']];

// Texto de uma opção da lista: rotulo(TIPOS_IMOVEL, 'galpao') → "Galpão"
export const rotulo = (lista, valor) => (lista.find(([v]) => v === valor) || [null, valor ?? ''])[1];

Object.assign(ICONES, {
  image: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="M21 16l-5-5-9 9"></path>',
  paw: '<circle cx="11" cy="4" r="2"></circle><circle cx="18" cy="8" r="2"></circle><circle cx="4" cy="8" r="2"></circle><path d="M12 11c-3 0-6 4-6 7a3 3 0 0 0 3 3c1.2 0 2-.7 3-.7s1.8.7 3 .7a3 3 0 0 0 3-3c0-3-3-7-6-7z"></path>',
  globe: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a14 14 0 0 1 0 18"></path><path d="M12 3a14 14 0 0 0 0 18"></path>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"></path><path d="M17 9a3 3 0 0 1 0 6"></path>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"></path><path d="M9 8h6"></path><path d="M9 12h6"></path>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"></path>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"></path>',
  bin: '<path d="M4 7h16"></path><path d="M10 3h4"></path><path d="M6 7l1 14h10l1-14"></path>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"></rect><path d="M9 7h2"></path><path d="M13 7h2"></path><path d="M9 11h2"></path><path d="M13 11h2"></path><path d="M9 15h2"></path><path d="M13 15h2"></path><path d="M10 21v-3h4v3"></path>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
  eyeOff: '<path d="M3 3l18 18"></path><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"></path><path d="M9.9 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2"></path><path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"></path>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"></path><path d="M14 3v5h5"></path>',
  upload: '<path d="M12 16V4"></path><path d="M7 9l5-5 5 5"></path><path d="M4 16v4h16v-4"></path>',
  download: '<path d="M12 4v12"></path><path d="M7 11l5 5 5-5"></path><path d="M4 20h16"></path>',
  bank: '<path d="M3 10l9-6 9 6"></path><path d="M5 10v8"></path><path d="M9.5 10v8"></path><path d="M14.5 10v8"></path><path d="M19 10v8"></path><path d="M3 21h18"></path>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"></path><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"></path>',
  handshake: '<path d="M3 11l4-4 4 3 3-2 7 5"></path><path d="M7 7L3 11l6 6 2-1 2 2 2-1 2 2 4-4"></path><path d="M11 16l-2-2"></path><path d="M13 15l-2-2"></path>',
  x: '<path d="M6 6l12 12"></path><path d="M18 6L6 18"></path>',
  undo: '<path d="M9 14L4 9l5-5"></path><path d="M4 9h11a5 5 0 0 1 0 10h-3"></path>',
});

// ---------- listas da negociação ----------
export const SITUACOES_NEGOCIACAO = [
  ['em_negociacao', 'Em negociação'], ['fechada', 'Fechada'], ['contrato_gerado', 'Contrato gerado'], ['cancelada', 'Cancelada'],
];
export const SITUACOES_CONTRATO = [['ativo', 'Ativo'], ['encerrado', 'Encerrado'], ['rescindido', 'Rescindido']];
export const FORMAS_COBRANCA = [['pos', 'Aluguel vencido (PÓS)'], ['pre', 'Aluguel adiantado (PRÉ)']];
export const INDICES_REAJUSTE = [['igpm', 'IGP-M'], ['ipca', 'IPCA'], ['inpc', 'INPC'], ['sem_reajuste', 'Sem reajuste']];
export const FORMAS_INTERMEDIACAO = [['unica', 'Única'], ['parcelada', 'Parcelada']];
export const GARANTIAS = [
  ['fiador', 'Fiador'], ['caucao', 'Caução'], ['seguro_fianca', 'Seguro fiança'], ['credpago', 'CredPago'],
  ['titulo_capitalizacao', 'Título de capitalização'], ['sem_garantia', 'Sem garantia'],
];
