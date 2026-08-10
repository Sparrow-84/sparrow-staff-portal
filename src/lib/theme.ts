const STORAGE_KEY = 'sparrow.dark_mode';

// Cached locally so the correct theme applies immediately on load, before the
// profile fetch (which holds the real per-staff preference) resolves.
export function getCachedTheme(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem(STORAGE_KEY, dark ? '1' : '0');
}
