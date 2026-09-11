// Consulta de CNPJ na BrasilAPI (dados públicos da Receita Federal, serviço gratuito).
// CPF não tem consulta gratuita (dado pessoal protegido pela LGPD): decisão do Marco
// em 11/09/2026 foi não consultar CPF por enquanto.

import { aplicarMascaraCep, cpfCnpjValido, digitos, formatarData } from './util.js';

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

// A Receita devolve tudo em maiúsculas: "RUA CORONEL JOAO FERNANDES" → "Rua Coronel Joao Fernandes"
export function emTitulo(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((palavra, i) => (i > 0 && MINUSCULAS.has(palavra) ? palavra : palavra.charAt(0).toUpperCase() + palavra.slice(1)))
    .join(' ');
}

// Devolve os dados da empresa, null se o CNPJ não existe na Receita, ou lança erro se a consulta falhar.
export async function buscarCnpj(cnpj) {
  const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (resposta.status === 404 || resposta.status === 400) return null;
  if (!resposta.ok) throw new Error(`BrasilAPI respondeu ${resposta.status}`);
  const d = await resposta.json();

  const tipo = d.descricao_tipo_de_logradouro || '';
  const rua = d.logradouro || '';
  // Junta o tipo ("RUA") ao nome, a menos que o nome já traga essa palavra ("SAUN QUADRA 5").
  const jaTemTipo = tipo && rua.toUpperCase().split(/\s+/).includes(tipo.toUpperCase());
  const logradouro = tipo && !jaTemTipo ? `${tipo} ${rua}` : rua;
  const semNumero = /^S\/?N$/i.test(d.numero || '');

  return {
    cnpj,
    nome: d.razao_social || '',
    nome_fantasia: d.nome_fantasia || '',
    data_fundacao: d.data_inicio_atividade || '',
    cep: d.cep ? aplicarMascaraCep(d.cep) : '',
    logradouro: emTitulo(logradouro),
    numero: semNumero ? 'S/N' : (d.numero || ''),
    complemento: emTitulo(d.complemento),
    bairro: emTitulo(d.bairro),
    cidade: emTitulo(d.municipio),
    uf: d.uf || '',
    situacao: d.descricao_situacao_cadastral || '',
    data_situacao: d.data_situacao_cadastral || '',
  };
}

export const CAMPOS_EMPRESA = ['nome', 'nome_fantasia', 'data_fundacao', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];

// Preenche só os campos que estão vazios (nunca apaga o que a pessoa digitou).
export function preencherVazios(form, dados, campos = CAMPOS_EMPRESA) {
  for (const nome of campos) {
    const campo = form.elements.namedItem(nome);
    if (campo && !campo.value.trim() && dados[nome]) campo.value = dados[nome];
  }
}

export function textoSituacao(empresa) {
  if (!empresa.situacao) return '';
  if (empresa.situacao === 'ATIVA') return 'Situação na Receita: ATIVA.';
  const desde = empresa.data_situacao ? ` desde ${formatarData(empresa.data_situacao)}` : '';
  return `Atenção: empresa ${empresa.situacao} na Receita Federal${desde}.`;
}

// Liga a consulta a um campo de CNPJ: ao completar 14 números válidos, busca e chama aoEncontrar(empresa).
export function ligarBuscaCnpj(input, aoEncontrar) {
  const bloco = input.closest('.campo');
  let situacao = bloco.querySelector('.info-campo');
  if (!situacao) {
    situacao = document.createElement('small');
    situacao.className = 'info-campo';
    situacao.hidden = true;
    bloco.appendChild(situacao);
  }
  const mostrar = (texto, erro = false) => {
    situacao.textContent = texto;
    situacao.classList.toggle('erro', erro);
    situacao.hidden = !texto;
  };

  let ultimoBuscado = '';
  input.addEventListener('input', async () => {
    const cnpj = digitos(input.value);
    if (cnpj.length < 14) {
      ultimoBuscado = '';
      mostrar('');
      return;
    }
    if (cnpj === ultimoBuscado || !cpfCnpjValido(cnpj)) return;
    ultimoBuscado = cnpj;
    mostrar('Buscando dados na Receita…');

    try {
      const empresa = await buscarCnpj(cnpj);
      if (digitos(input.value) !== cnpj) return; // o CNPJ mudou enquanto buscava
      if (!empresa) {
        mostrar('CNPJ não encontrado na Receita. Preencha os dados à mão.', true);
        return;
      }
      mostrar(textoSituacao(empresa), empresa.situacao !== 'ATIVA');
      aoEncontrar(empresa);
    } catch {
      mostrar('Não foi possível consultar o CNPJ agora. Preencha os dados à mão.', true);
    }
  });
}
