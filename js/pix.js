// Pix "copia e cola" (BR Code, padrão do Banco Central).
//
// Isso NÃO depende de API do banco: é a chave Pix da imobiliária + o valor
// + uma identificação do mês. O inquilino cola no app do banco dele e paga.
// A baixa continua sendo na mão, pelo botão "Registrar recebimento".
// Quando a API da Unicred entrar, a mesma cobrança passa a nascer no banco
// (com txid) e a baixa vem sozinha.

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// o BR Code só aceita letras e números sem acento
const limpar = (t, max) => semAcento(t).toUpperCase().replace(/[^A-Z0-9 .&-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const bloco = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

// CRC16-CCITT (0x1021, início 0xFFFF): é o último campo do BR Code
function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i += 1) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// A chave vai no formato que o Pix espera: CPF/CNPJ só números, telefone com +55.
export function chavePix(tipo, chave) {
  const texto = String(chave ?? '').trim();
  if (!texto) return '';
  if (tipo === 'cpf_cnpj') return texto.replace(/\D/g, '');
  if (tipo === 'telefone') return `+55${texto.replace(/\D/g, '').replace(/^55/, '')}`;
  return texto;
}

// Identificação da cobrança: fica visível no extrato e no comprovante.
export function txidDoMovimento(codigo, competencia) {
  const mes = String(competencia ?? '').slice(0, 7).replace('-', '');
  return `MOV${codigo}${mes}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
}

export function pixCopiaCola({ chave, valor, nome, cidade, txid }) {
  if (!chave) throw new Error('Cadastre a chave Pix da imobiliária em Configurações › Contas da imobiliária.');
  const numero = Number(valor);
  if (!(numero > 0)) throw new Error('O valor do Pix precisa ser maior que zero.');

  const corpo =
    bloco('00', '01') +
    bloco('26', bloco('00', 'br.gov.bcb.pix') + bloco('01', chave)) +
    bloco('52', '0000') +
    bloco('53', '986') +
    bloco('54', numero.toFixed(2)) +
    bloco('58', 'BR') +
    bloco('59', limpar(nome, 25) || 'RECEBEDOR') +
    bloco('60', limpar(cidade, 15) || 'ARARANGUA') +
    bloco('62', bloco('05', limpar(txid, 25) || '***'));

  return `${corpo}6304${crc16(`${corpo}6304`)}`;
}
