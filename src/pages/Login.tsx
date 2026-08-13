import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// Surface an OAuth error returned in the URL (e.g. roster rejection from the DB trigger).
function urlAuthError(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return hash.get('error_description') ?? query.get('error_description');
}

export function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(urlAuthError());

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sparrow-sage dark:bg-sparrow-dark-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-8 text-center shadow-card">
        <h1 className="font-serif text-2xl font-semibold">Sparrow Staff Portal</h1>
        <p className="mt-2 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Sign in with your Sparrow account.</p>

        {isSupabaseConfigured ? (
          <>
            <button onClick={signIn} disabled={busy} className="btn-primary mt-6 w-full">
              {busy ? 'Redirecting…' : 'Sign in with Google'}
            </button>
            {error && <p className="mt-3 text-sm text-priority-p1">{error}</p>}
          </>
        ) : (
          <div className="mt-6 rounded-lg bg-sparrow-cream dark:bg-sparrow-dark-surface2 p-4 text-left text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
            <p className="font-semibold">Supabase isn’t connected yet.</p>
            <p className="mt-1 text-sparrow-gray dark:text-sparrow-dark-gray">
              Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{' '}
              <code>.env.local</code>, then run the migration + seed. See <code>README.md</code>.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
