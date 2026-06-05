import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchSettings } from '@/lib/settings';

// Ambient rotating snippet — a quiet presence at the bottom of every screen, not a
// banner or popup. Rotates daily so it doesn't go stale. Per-user toggle in Settings.
//
// PLACEHOLDER COPY: replace with Sparrow's official mission line, core values, and an
// approved verse (Susanna owns this content). A future slice can move these into a
// DB table so they're editable without a deploy.
const SNIPPETS = [
  'Every workflow should end with a person on the other side.',
  'We reduce the overhead that gets between people — never replace the person.',
  'A timely, personal response is the measure of our work.',
  'Warm handoffs over hand-offs: someone is always waiting on the other side.',
  'Twin Oaks · LifeChange · Sparrow — one mission, many neighbors.',
];

/** Custom event SettingsView fires so the footer updates instantly on toggle. */
export const VALUES_FOOTER_EVENT = 'sparrow:valuesfooter';

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

export function ValuesFooter() {
  const { profile } = useAuth();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!profile) return;
    fetchSettings(profile.id)
      .then((s) => setEnabled(s?.values_footer_enabled ?? true))
      .catch(() => {
        /* non-critical; default to showing */
      });
    const handler = (e: Event) => setEnabled((e as CustomEvent<boolean>).detail);
    window.addEventListener(VALUES_FOOTER_EVENT, handler);
    return () => window.removeEventListener(VALUES_FOOTER_EVENT, handler);
  }, [profile]);

  if (!enabled) return null;
  const snippet = SNIPPETS[dayOfYear(new Date()) % SNIPPETS.length];

  return (
    <footer className="border-t border-sparrow-rule bg-white px-4 py-2 text-center">
      <p className="text-xs italic text-sparrow-gray">{snippet}</p>
    </footer>
  );
}
