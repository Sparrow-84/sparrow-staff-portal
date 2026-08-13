export const LABEL_COLORS: { id: string; swatch: string; pill: string }[] = [
  { id: 'green',   swatch: 'bg-sparrow-green', pill: 'bg-sparrow-sage dark:bg-sparrow-green/15 text-sparrow-green dark:text-sparrow-dark-green' },
  { id: 'blue',    swatch: 'bg-blue-400',      pill: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  { id: 'sky',     swatch: 'bg-sky-400',       pill: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  { id: 'cyan',    swatch: 'bg-cyan-500',      pill: 'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' },
  { id: 'teal',    swatch: 'bg-teal-500',      pill: 'bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300' },
  { id: 'lime',    swatch: 'bg-lime-500',      pill: 'bg-lime-100 dark:bg-lime-500/15 text-lime-700 dark:text-lime-300' },
  { id: 'yellow',  swatch: 'bg-yellow-400',    pill: 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300' },
  { id: 'orange',  swatch: 'bg-orange-400',    pill: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300' },
  { id: 'amber',   swatch: 'bg-amber-400',     pill: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  { id: 'red',     swatch: 'bg-red-400',       pill: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300' },
  { id: 'rose',    swatch: 'bg-rose-400',      pill: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  { id: 'pink',    swatch: 'bg-pink-400',      pill: 'bg-pink-100 dark:bg-pink-500/15 text-pink-700 dark:text-pink-300' },
  { id: 'fuchsia', swatch: 'bg-fuchsia-400',   pill: 'bg-fuchsia-100 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300' },
  { id: 'violet',  swatch: 'bg-violet-400',    pill: 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  { id: 'indigo',  swatch: 'bg-indigo-400',    pill: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' },
];

export function LabelPill({ label, color }: { label: string; color: string }) {
  const meta = LABEL_COLORS.find((c) => c.id === color);
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight ${meta?.pill ?? 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300'}`}>
      {label}
    </span>
  );
}
