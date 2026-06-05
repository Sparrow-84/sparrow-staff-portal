import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchSettings, saveSettings } from '@/lib/settings';
import { VALUES_FOOTER_EVENT } from '@/components/ValuesFooter';

export function SettingsView() {
  const { profile } = useAuth();
  const [footer, setFooter] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    fetchSettings(profile.id)
      .then((s) => setFooter(s?.values_footer_enabled ?? true))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile]);

  if (!profile) return null;

  async function toggleFooter(next: boolean) {
    setFooter(next);
    window.dispatchEvent(new CustomEvent(VALUES_FOOTER_EVENT, { detail: next }));
    await saveSettings(profile!.id, { values_footer_enabled: next });
  }

  async function resetHome() {
    await saveSettings(profile!.id, { home_layout: null });
    setStatus('Home layout reset to default — it’ll apply next time you open Home.');
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-sparrow-gray">Preferences for {profile.full_name}.</p>

      {loading ? (
        <p className="mt-8 text-sm text-sparrow-gray">Loading…</p>
      ) : (
        <div className="mt-8 space-y-4">
          <section className="flex items-center justify-between gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
            <div>
              <p className="text-sm font-medium text-sparrow-ink">Values footer</p>
              <p className="text-xs text-sparrow-gray">
                A quiet rotating line of Sparrow’s mission and values at the bottom of every screen.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={footer}
              onClick={() => void toggleFooter(!footer)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${footer ? 'bg-sparrow-green' : 'bg-sparrow-rule'}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${footer ? 'left-[1.375rem]' : 'left-0.5'}`}
              />
            </button>
          </section>

          <section className="flex items-center justify-between gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 shadow-card">
            <div>
              <p className="text-sm font-medium text-sparrow-ink">Home dashboard</p>
              <p className="text-xs text-sparrow-gray">Reset your widget layout back to the default set and order.</p>
            </div>
            <button onClick={() => void resetHome()} className="btn-ghost border border-sparrow-rule">
              Reset layout
            </button>
          </section>

          {status && <p className="text-xs text-sparrow-green">{status}</p>}

          <p className="pt-2 text-xs text-sparrow-gray">
            More preferences (notifications, messaging, Todoist sync) arrive with later slices.
          </p>
        </div>
      )}
    </div>
  );
}
