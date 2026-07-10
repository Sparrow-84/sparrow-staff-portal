export const LABEL_COLORS: { id: string; swatch: string; pill: string }[] = [
  { id: 'green',  swatch: 'bg-sparrow-green', pill: 'bg-sparrow-sage text-sparrow-green' },
  { id: 'blue',   swatch: 'bg-blue-400',      pill: 'bg-blue-100 text-blue-700' },
  { id: 'teal',   swatch: 'bg-teal-500',      pill: 'bg-teal-100 text-teal-700' },
  { id: 'lime',   swatch: 'bg-lime-500',       pill: 'bg-lime-100 text-lime-700' },
  { id: 'orange', swatch: 'bg-orange-400',    pill: 'bg-orange-100 text-orange-700' },
  { id: 'amber',  swatch: 'bg-amber-400',     pill: 'bg-amber-100 text-amber-700' },
  { id: 'red',    swatch: 'bg-red-400',       pill: 'bg-red-100 text-red-700' },
  { id: 'violet', swatch: 'bg-violet-400',    pill: 'bg-violet-100 text-violet-700' },
  { id: 'pink',   swatch: 'bg-pink-400',      pill: 'bg-pink-100 text-pink-700' },
];

export function LabelPill({ label, color }: { label: string; color: string }) {
  const meta = LABEL_COLORS.find((c) => c.id === color);
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight ${meta?.pill ?? 'bg-slate-100 text-slate-600'}`}>
      {label}
    </span>
  );
}
