import { useState } from 'react';
import { designationGridLabel, type NoticeType, type Space } from '@/lib/housing-types';

// Notice badge colors (matching infraction level palette)
const NOTICE_SVG: Record<NoticeType, { fill: string; text: string }> = {
  '1': { fill: '#facc15', text: '#1a1a1a' },
  '2': { fill: '#f97316', text: '#ffffff' },
  '3': { fill: '#dc2626', text: '#ffffff' },
  E:   { fill: '#111827', text: '#ffffff' },
};

// Lot tile fill/stroke colors — mirrors lotClasses() in housing-types
const TILE = {
  sparrow_occ: { fill: '#1E4D30', stroke: '#1E4D30', text: '#ffffff' },
  sparrow_vac: { fill: '#ffffff', stroke: '#1E4D30', text: '#1E4D30' },
  blue_occ:    { fill: '#1d4ed8', stroke: '#1d4ed8', text: '#ffffff' },
  blue_vac:    { fill: '#ffffff', stroke: '#1d4ed8', text: '#1d4ed8' },
  unknown:     { fill: '#ffffff', stroke: '#d1d5db', text: '#9ca3af', dash: true },
} as const;

function tileFill(space?: Space) {
  if (!space?.ownership) return TILE.unknown;
  const occ = space.status !== 'vacant';
  if (space.ownership === 'sparrow_owned') return occ ? TILE.sparrow_occ : TILE.sparrow_vac;
  return occ ? TILE.blue_occ : TILE.blue_vac;
}

// Designation sub-label hex: [occupied, vacant]
const DESIG_HEX: Partial<Record<string, [string, string]>> = {
  lcp:   ['#e9d5ff', '#7c3aed'],
  sv:    ['#fde68a', '#d97706'],
  pm:    ['#99f6e4', '#0f766e'],
  other: ['rgba(255,255,255,0.6)', '#64748b'],
};

type LotPos = { x: number; y: number; w: number; h: number; angle?: number };

// Geographic layout in SVG viewBox="0 0 1160 715"
// Row 1 uses angle=-7 (rotate around rect center) to follow the river slope.
const LOTS: Record<string, LotPos> = {
  // ── Row 1: SW Mobile Place, angled (right=1, left=11) ──────────────────
  '1':  { x: 1056, y: 80,  w: 55, h: 90, angle: -7 },
  '1B': { x: 1000, y: 87,  w: 50, h: 90, angle: -7 },
  '2':  { x: 944,  y: 94,  w: 55, h: 90, angle: -7 },
  '3':  { x: 888,  y: 101, w: 55, h: 90, angle: -7 },
  '4':  { x: 832,  y: 108, w: 55, h: 90, angle: -7 },
  '5':  { x: 776,  y: 115, w: 55, h: 90, angle: -7 },
  '6':  { x: 720,  y: 122, w: 55, h: 90, angle: -7 },
  '7':  { x: 664,  y: 129, w: 55, h: 90, angle: -7 },
  '8':  { x: 608,  y: 136, w: 55, h: 90, angle: -7 },
  '9':  { x: 552,  y: 143, w: 55, h: 90, angle: -7 },
  '10': { x: 496,  y: 150, w: 55, h: 90, angle: -7 },
  '11': { x: 440,  y: 157, w: 55, h: 90, angle: -7 },
  // ── Row 2: upper SW Twin Oaks Circle (right=12, left=22) ───────────────
  '12': { x: 1056, y: 220, w: 55, h: 95 },
  '13': { x: 1000, y: 220, w: 55, h: 95 },
  '14': { x: 944,  y: 220, w: 55, h: 95 },
  '15': { x: 888,  y: 220, w: 55, h: 95 },
  '16': { x: 832,  y: 220, w: 55, h: 95 },
  '17': { x: 776,  y: 220, w: 55, h: 95 },
  '18': { x: 720,  y: 220, w: 55, h: 95 },
  '19': { x: 664,  y: 220, w: 55, h: 95 },
  '20': { x: 608,  y: 220, w: 55, h: 95 },
  '21': { x: 552,  y: 220, w: 55, h: 95 },
  '22': { x: 496,  y: 220, w: 55, h: 95 },
  // ── Corner wrap: lots 23-27 ─────────────────────────────────────────────
  '23': { x: 430,  y: 222, w: 60, h: 98  },
  '24': { x: 362,  y: 224, w: 62, h: 102 },
  '25': { x: 292,  y: 227, w: 65, h: 105 },
  '26': { x: 218,  y: 230, w: 70, h: 110 },
  '27': { x: 130,  y: 235, w: 82, h: 118 },
  // ── Far-left column ─────────────────────────────────────────────────────
  '28': { x: 58,   y: 370, w: 78, h: 88  },
  '29': { x: 58,   y: 463, w: 78, h: 105 },
  // ── Interior block – top row (left=30, right=39) ────────────────────────
  '30': { x: 496,  y: 332, w: 50, h: 78 },
  '31': { x: 548,  y: 332, w: 50, h: 78 },
  '32': { x: 600,  y: 332, w: 50, h: 78 },
  '33': { x: 652,  y: 332, w: 50, h: 78 },
  '34': { x: 704,  y: 332, w: 50, h: 78 },
  '35': { x: 756,  y: 332, w: 50, h: 78 },
  '36': { x: 808,  y: 332, w: 50, h: 78 },
  '37': { x: 860,  y: 332, w: 50, h: 78 },
  '38': { x: 912,  y: 332, w: 50, h: 78 },
  '39': { x: 964,  y: 332, w: 50, h: 78 },
  // ── Interior block – bottom row (49=under 30, 40=under 39) ─────────────
  '49': { x: 496,  y: 413, w: 50, h: 78 },
  '48': { x: 548,  y: 413, w: 50, h: 78 },
  '47': { x: 600,  y: 413, w: 50, h: 78 },
  '46': { x: 652,  y: 413, w: 50, h: 78 },
  '45': { x: 704,  y: 413, w: 50, h: 78 },
  '44': { x: 756,  y: 413, w: 50, h: 78 },
  '43': { x: 808,  y: 413, w: 50, h: 78 },
  '42': { x: 860,  y: 413, w: 50, h: 78 },
  '41': { x: 912,  y: 413, w: 50, h: 78 },
  '40': { x: 964,  y: 413, w: 50, h: 78 },
  // ── Park section lots (green gap between 50 and 49) ─────────────────────
  '50': { x: 428,  y: 413, w: 56, h: 78 },
  '51': { x: 366,  y: 413, w: 56, h: 78 },
  '52': { x: 304,  y: 413, w: 56, h: 78 },
  '53': { x: 242,  y: 413, w: 56, h: 78 },
  // ── SW Pleasant Place (54=left, 57=right) ───────────────────────────────
  '54': { x: 496,  y: 538, w: 58, h: 78 },
  '55': { x: 556,  y: 538, w: 58, h: 78 },
  '56': { x: 616,  y: 538, w: 58, h: 78 },
  '57': { x: 676,  y: 538, w: 58, h: 78 },
  // ── SW Twin Oaks Circle lower (61=left, 58=right) ───────────────────────
  '61': { x: 496,  y: 622, w: 58, h: 78 },
  '60': { x: 556,  y: 622, w: 58, h: 78 },
  '59': { x: 616,  y: 622, w: 58, h: 78 },
  '58': { x: 676,  y: 622, w: 58, h: 78 },
};

const HOUSE_NUM: Record<string, string> = {
  '1':'241','2':'243','3':'245','4':'247','5':'249','6':'251','7':'253',
  '8':'255','9':'257','10':'259','11':'261',
  '12':'241','13':'243','14':'245','15':'247','16':'249','17':'251',
  '18':'255','19':'259','20':'263','21':'265','22':'267','23':'271',
  '24':'273','25':'275','26':'277','27':'279','28':'281','29':'315',
  '30':'264','31':'262','32':'260','33':'258','34':'256','35':'254',
  '36':'252','37':'250','38':'248','39':'246',
  '40':'245','41':'247','42':'249','43':'251','44':'253','45':'255',
  '46':'257','47':'259','48':'261','49':'263',
  '50':'287','51':'269','52':'271','53':'273',
  '54':'264','55':'262','56':'260','57':'258',
  '58':'441','59':'435','60':'431','61':'425',
};

interface Props {
  spaces: Space[];
  onSelect: (space: Space) => void;
  selectedId?: string | null;
  noticeMap?: Record<string, NoticeType>;
}

export function LotMap({ spaces, onSelect, selectedId, noticeMap }: Props) {
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const spaceByLabel = new Map(spaces.map((s) => [s.label, s]));

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-sparrow-rule bg-white p-3">
      <svg viewBox="0 0 1160 715" className="w-full h-auto" style={{ minWidth: 560 }}>
        <defs>
          <pattern id="lm-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#e2e8f0" strokeWidth="1.5" />
          </pattern>
          <filter id="lm-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="3" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* ── Background ── */}
        <rect width="1160" height="715" fill="#f8fafc" rx="8" />

        {/* ── Mary's River ── */}
        <path
          d="M0,0 L0,78 Q80,88 200,82 Q320,76 430,85 Q430,18 560,0 Z"
          fill="#bfdbfe" opacity="0.85"
        />
        <text x="145" y="58" fill="#3b82f6" fontSize="11" fontWeight="700"
          fontFamily="sans-serif" letterSpacing="2" opacity="0.8">MARYS RIVER</text>

        {/* ── Park open space (interior block, upper-left) ── */}
        <rect x="180" y="332" width="314" height="78" fill="#dcfce7" stroke="#86efac" strokeWidth="1" rx="4" />
        <text x="242" y="358" fill="#15803d" fontSize="10" fontWeight="600" fontFamily="sans-serif">Park</text>
        {/* Laundry */}
        <rect x="358" y="340" width="62" height="34" fill="#e0f2fe" stroke="#F0A500" strokeWidth="1.5" rx="3" />
        <text x="389" y="362" fill="#0369a1" fontSize="8.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">Laundry</text>
        {/* Proposed Community Building */}
        <rect x="195" y="345" width="58" height="30" fill="#fef9c3" stroke="#fde047" strokeWidth="1.5" strokeDasharray="3,2" rx="3" />
        <text x="224" y="364" fill="#92400e" fontSize="7.5" textAnchor="middle" fontFamily="sans-serif">Comm. Bldg</text>

        {/* ── Green space below interior block park ── */}
        <rect x="180" y="413" width="60" height="78" fill="#dcfce7" stroke="#86efac" strokeWidth="1" rx="4" />

        {/* ── Not-park-owned zones ── */}
        <rect x="1114" y="220" width="42" height="95" fill="url(#lm-hatch)" rx="3" />
        <rect x="1017" y="332" width="139" height="159" fill="url(#lm-hatch)" rx="3" />
        <rect x="0"    y="578" width="172" height="137" fill="url(#lm-hatch)" rx="3" />
        <rect x="172"  y="578" width="320" height="137" fill="url(#lm-hatch)" rx="3" />
        <rect x="737"  y="538" width="423" height="177" fill="url(#lm-hatch)" rx="3" />
        <text x="1080" y="430" fill="#94a3b8" fontSize="8.5" textAnchor="middle" fontFamily="sans-serif">Not park</text>
        <text x="487"  y="650" fill="#94a3b8" fontSize="8.5" textAnchor="middle" fontFamily="sans-serif">Not park owned</text>
        <text x="940"  y="630" fill="#94a3b8" fontSize="8.5" textAnchor="middle" fontFamily="sans-serif">Not park owned</text>

        {/* ── Street labels ── */}
        <text x="780"  y="215" fill="#94a3b8" fontSize="8" textAnchor="middle" fontFamily="sans-serif" letterSpacing="1">SW MOBILE PLACE</text>
        <text x="780"  y="325" fill="#94a3b8" fontSize="8" textAnchor="middle" fontFamily="sans-serif" letterSpacing="1">SW TWIN OAKS CIRCLE</text>
        <text x="597"  y="532" fill="#94a3b8" fontSize="8" textAnchor="middle" fontFamily="sans-serif" letterSpacing="1">SW PLEASANT PLACE</text>
        <text x="597"  y="710" fill="#94a3b8" fontSize="8" textAnchor="middle" fontFamily="sans-serif" letterSpacing="1">SW TWIN OAKS CIRCLE</text>
        {/* Caretaker label */}
        <text x="132"  y="362" fill="#94a3b8" fontSize="7.5" fontStyle="italic" textAnchor="middle" fontFamily="sans-serif">Caretaker</text>

        {/* ── Lot tiles ── */}
        {Object.entries(LOTS).map(([label, { x, y, w, h, angle }]) => {
          const space = spaceByLabel.get(label);
          const isSelected = !!space && space.id === selectedId;
          const isHovered = label === hoverLabel;
          const cx = x + w / 2;
          const cy = y + h / 2;
          const style = tileFill(space);
          const filled = !!space && space.status !== 'vacant';
          const desLabel = space ? designationGridLabel(space) : null;
          const desHex = space?.designation_type
            ? (DESIG_HEX[space.designation_type]?.[filled ? 0 : 1] ?? '#9ca3af')
            : '#9ca3af';
          const notice = space && noticeMap ? noticeMap[space.id] : undefined;
          const nStyle = notice ? NOTICE_SVG[notice] : undefined;

          const fill  = isSelected ? '#fef08a' : style.fill;
          const stroke = isSelected ? '#eab308' : isHovered ? '#F0A500' : style.stroke;
          const sw     = isSelected || isHovered ? 2.5 : 1.5;

          return (
            <g
              key={label}
              transform={angle ? `rotate(${angle},${cx},${cy})` : undefined}
              onClick={() => space && onSelect(space)}
              onMouseEnter={() => setHoverLabel(label)}
              onMouseLeave={() => setHoverLabel(null)}
              style={{ cursor: space ? 'pointer' : 'default' }}
              role={space ? 'button' : undefined}
            >
              <rect
                x={x} y={y} width={w} height={h}
                fill={fill} stroke={stroke} strokeWidth={sw}
                strokeDasharray={'dash' in style && style.dash ? '4,2' : undefined}
                rx="5"
              />
              {/* Lot number */}
              <text
                x={cx} y={cy - (desLabel ? 7 : 0)}
                fontSize="12" fontWeight="700" textAnchor="middle" dominantBaseline="middle"
                fill={isSelected ? '#78350f' : style.text}
                fontFamily="sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {label}
              </text>
              {/* Designation sub-label */}
              {desLabel && (
                <text
                  x={cx} y={cy + 9}
                  fontSize="8" fontWeight="600" textAnchor="middle" dominantBaseline="middle"
                  fill={isSelected ? '#92400e' : desHex}
                  fontFamily="sans-serif"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {desLabel}
                </text>
              )}
              {/* Unknown marker */}
              {!space && (
                <text x={cx} y={cy + 10} fontSize="9" textAnchor="middle" fill="#d1d5db"
                  fontFamily="sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}>?</text>
              )}
              {/* Notice badge */}
              {nStyle && (
                <g style={{ pointerEvents: 'none' }}>
                  <circle cx={x + w - 9} cy={y + 9} r="8" fill={nStyle.fill} />
                  <text x={x + w - 9} y={y + 9} fontSize="7" fontWeight="700"
                    textAnchor="middle" dominantBaseline="middle"
                    fill={nStyle.text} fontFamily="sans-serif">
                    {notice}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* ── Hover tooltip ── */}
        {hoverLabel && (() => {
          const pos = LOTS[hoverLabel];
          if (!pos) return null;
          const { x, y, w, h } = pos;
          const cx = x + w / 2;
          const space = spaceByLabel.get(hoverLabel);
          const houseNum = HOUSE_NUM[hoverLabel];
          const status = space?.status ?? 'No record';
          const tipW = 110;
          const tipH = houseNum ? 58 : 44;
          let tipX = cx - tipW / 2;
          let tipY = y - tipH - 6;
          if (tipX < 4) tipX = 4;
          if (tipX + tipW > 1156) tipX = 1156 - tipW;
          if (tipY < 4) tipY = y + h + 6;

          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={tipX} y={tipY} width={tipW} height={tipH}
                rx="5" fill="white" stroke="#e2e8f0" strokeWidth="1"
                filter="url(#lm-shadow)" />
              <text x={tipX + 8} y={tipY + 16} fontSize="11" fontWeight="700"
                fill="#0f172a" fontFamily="sans-serif">Lot {hoverLabel}</text>
              {houseNum && (
                <text x={tipX + 8} y={tipY + 34} fontSize="9" fill="#64748b" fontFamily="sans-serif">
                  # {houseNum} · {status}
                </text>
              )}
              {!houseNum && (
                <text x={tipX + 8} y={tipY + 32} fontSize="9" fill="#64748b" fontFamily="sans-serif">
                  {status}
                </text>
              )}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
