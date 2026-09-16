// Confere se um telefone tem WhatsApp, chamando a função do Supabase
// (que fala com a Evolution API). A chave fica no Supabase, nunca aqui.

import { sb } from './supabase.js';
import { digitos, formatarTelefone } from './util.js';

// Devolve null quando não dá para conferir (sem configuração ou fora do ar).
// Senão: { existe, numero, mudou, texto, tom }
//
// O WhatsApp normaliza o nono dígito: às vezes o número digitado não existe,
// mas a versão sem o 9 existe. Nesse caso mostramos qual número foi encontrado.
export async function conferirWhatsapp(telefone) {
  const numero = digitos(telefone);
  if (numero.length < 10 || numero.length > 11) return null;

  const { data, error } = await sb.functions.invoke('whatsapp-existe', { body: { telefone: numero } });
  if (error || !data || data.erro) return null;

  const existe = Boolean(data.existe);
  const encontrado = digitos(data.numero).replace(/^55/, '');
  const mudou = existe && Boolean(encontrado) && encontrado !== numero;

  return {
    existe,
    numero: encontrado,
    mudou,
    texto: existe
      ? (mudou ? `Tem WhatsApp, mas no número ${formatarTelefone(encontrado)}` : 'Tem WhatsApp')
      : 'Não encontrado no WhatsApp',
    tom: existe && !mudou ? 'ok' : 'atencao',
  };
}
