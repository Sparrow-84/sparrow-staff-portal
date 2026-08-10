const STORAGE_KEY = 'sparrow.dark_mode';

// Cached locally so the correct theme applies immediately on load, before the
// profile fetch (which holds the real per-staff preference) resolves.
export function getCachedTheme(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function applyTheme(dark: boolean | null | undefined): void {
  // Coerce explicitly — classList.toggle(token, force) treats an explicitly-passed
  // `undefined` as if force were omitted at all, which flips the class instead of
  // forcing it off. That previously turned dark mode on for everyone the moment
  // profile.dark_mode came back undefined (e.g. before the DB column existed).
  const isDark = dark === true;
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem(STORAGE_KEY, isDark ? '1' : '0');
}
