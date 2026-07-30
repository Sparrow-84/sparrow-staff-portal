import { supabase } from './supabase';

// Business-card photos (migration 0111) — two fixed slots (front/back), no history; a
// re-upload overwrites the same storage path. Private bucket + signed URLs (partnerships
// staff only), same pattern as grant-documents.

export type CardSide = 'front' | 'back';
export type CardOwnerTable = 'partners' | 'partnership_connections';

export async function uploadBusinessCardPhoto(
  table: CardOwnerTable,
  recordId: string,
  side: CardSide,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${recordId}/${side}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('partnership-cards')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (upErr) throw new Error(upErr.message);

  const column = side === 'front' ? 'business_card_front_path' : 'business_card_back_path';
  const { error } = await supabase.from(table).update({ [column]: path }).eq('id', recordId);
  if (error) throw new Error(error.message);
  return path;
}

/** Signed URL for a business card photo (1 hour expiry — regenerate each time it's viewed). */
export async function getBusinessCardPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('partnership-cards').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
