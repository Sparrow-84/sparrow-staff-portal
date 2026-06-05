import { supabase } from './supabase';

/** Per-user spine settings: customizable Home layout + the ambient values footer. */
export interface UserSettings {
  user_id: string;
  home_layout: string[] | null; // ordered widget keys; null = use the default layout
  values_footer_enabled: boolean;
  prefs: Record<string, unknown>;
  updated_at: string;
}

export async function fetchSettings(userId: string): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserSettings) ?? null;
}

export async function saveSettings(
  userId: string,
  patch: Partial<Pick<UserSettings, 'home_layout' | 'values_footer_enabled' | 'prefs'>>,
): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}
