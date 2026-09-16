// Confere se um telefone tem WhatsApp, chamando a função do Supabase
// (que fala com a Evolution API). A chave fica no Supabase, nunca aqui.

import { sb } from './supabase.js';
import { digitos } from './util.js';

// true = tem WhatsApp · false = não encontrado · null = não deu para conferir
export async function conferirWhatsapp(telefone) {
  const numero = digitos(telefone);
  if (numero.length < 10 || numero.length > 11) return null;

  const { data, error } = await sb.functions.invoke('whatsapp-existe', { body: { telefone: numero } });
  if (error || !data || data.erro) return null;
  return Boolean(data.existe);
}
