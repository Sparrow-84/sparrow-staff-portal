import { NOTICE_COLOR, designationGridLabel, designationTextClass, lotClasses, type NoticeType, type Space } from '@/lib/housing-types';

interface Props {
  spaces: Space[];
  onSelect: (space: Space) => void;
  noticeMap?: Record<string, NoticeType>;
}

export function LotGrid({ spaces, onSelect, noticeMap }: Props) {
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-10">
      {spaces.map((s) => {
        const filled = s.status !== 'vacant';
        const desLabel = designationGridLabel(s);
        const desTextClass = designationTextClass(s.designation_type, filled);
        const notice = noticeMap?.[s.id];
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            title={`Lot ${s.label}${desLabel ? ` · ${desLabel}` : ''}${notice ? ` · Notice ${notice}` : ''}`}
            className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border text-sm font-semibold transition hover:ring-2 hover:ring-sparrow-gold ${lotClasses(s)}`}
          >
            <span>{s.label}</span>
            {desLabel && (
              <span className={`text-[9px] font-semibold leading-none ${desTextClass}`}>
                {desLabel}
              </span>
            )}
            {!s.ownership && (
              <span className="text-[10px] leading-none text-gray-300">?</span>
            )}
            {notice && (
              <span className={`absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${NOTICE_COLOR[notice]}`}>
                {notice}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
