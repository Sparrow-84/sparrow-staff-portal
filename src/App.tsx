import { useEffect } from 'react';
import { useAuth } from './auth/AuthContext';
import { Login } from './pages/Login';
import { AppShell } from './components/AppShell';
import { initOneSignal, loginOneSignal, logoutOneSignal } from './lib/push';

initOneSignal();

function Splash({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sparrow-mist">
      <p className="text-sm text-sparrow-gray">{message}</p>
    </div>
  );
}

export function App() {
  const { session, profile, loading, signOut } = useAuth();

  useEffect(() => {
    if (profile?.id) loginOneSignal(profile.id);
  }, [profile?.id]);

  useEffect(() => {
    if (!session) logoutOneSignal();
  }, [session]);

  if (loading) return <Splash message="Loading…" />;
  if (!session) return <Login />;

  // Signed in but no roster profile (shouldn't normally happen — the DB trigger
  // links staff on first sign-in and rejects unknown emails).
  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sparrow-sage px-4">
        <div className="max-w-sm rounded-2xl border border-sparrow-rule bg-white p-8 text-center shadow-card">
          <h1 className="font-serif text-xl font-semibold">Not authorized</h1>
          <p className="mt-2 text-sm text-sparrow-gray">
            This account isn’t on the Sparrow staff roster. Ask an admin to add your email.
          </p>
          <button onClick={signOut} className="btn-primary mt-6 w-full">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <AppShell />;
}
