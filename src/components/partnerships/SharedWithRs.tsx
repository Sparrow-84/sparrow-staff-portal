// "Shared with Resident Services": marks the parts of a Directory record that Resident Services
// staff also see (decided 2026-11-13). Shown only on an organization that's in the Resident
// Services room (it has a program there, or is waiting in To review), so whoever is typing
// knows another team will read it. Giving, donor details, stage, donor tier, interests and
// business cards are never shared and never carry the tag.
export function SharedWithRs({ show, className = '' }: { show: boolean; className?: string }) {
  if (!show) return null;
  return (
    <span
      title="Resident Services staff see this on the organization's programs."
      className={`inline-flex items-center whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 align-middle text-[10px] font-medium normal-case tracking-normal text-sky-800 dark:bg-sky-500/15 dark:text-sky-300 ${className}`}
    >
      Shared with Resident Services
    </span>
  );
}
