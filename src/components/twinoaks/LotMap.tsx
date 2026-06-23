import { useState } from 'react';
import { designationGridLabel, HOUSE_NUM, type NoticeType, type Space } from '@/lib/housing-types';

const NOTICE_SVG: Record<NoticeType, { fill: string; text: string }> = {
  '1': { fill: '#facc15', text: '#1a1a1a' },
  '2': { fill: '#f97316', text: '#ffffff' },
  '3': { fill: '#dc2626', text: '#ffffff' },
  E:   { fill: '#111827', text: '#ffffff' },
};

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

const DESIG_HEX: Partial<Record<string, [string, string]>> = {
  lcp:   ['#e9d5ff', '#7c3aed'],
  sv:    ['#fde68a', '#d97706'],
  pm:    ['#99f6e4', '#0f766e'],
  other: ['rgba(255,255,255,0.6)', '#64748b'],
};

type LotPos = { x: number; y: number; w: number; h: number };

// viewBox="0 0 1120 630"
// Row 1 (lots 1-11) is straight and parallel to Row 2, with SW Mobile Place road between them.
// Lots 9-11 are geographically adjacent to the river; the river path renders on top to clip their corners.
const LOTS: Record<string, LotPos> = {
  // ── Row 1: SW Mobile Place (north row) ───────────────────────────────────
  '1':  { x: 1056, y: 55, w: 55, h: 80 },
  '1B': { x: 1000, y: 55, w: 50, h: 80 },
  '2':  { x: 944,  y: 55, w: 55, h: 80 },
  '3':  { x: 888,  y: 55, w: 55, h: 80 },
  '4':  { x: 832,  y: 55, w: 55, h: 80 },
  '5':  { x: 776,  y: 55, w: 55, h: 80 },
  '6':  { x: 720,  y: 55, w: 55, h: 80 },
  '7':  { x: 664,  y: 55, w: 55, h: 80 },
  '8':  { x: 608,  y: 55, w: 55, h: 80 },
  '9':  { x: 552,  y: 55, w: 55, h: 80 },
  '10': { x: 496,  y: 55, w: 55, h: 80 },
  '11': { x: 440,  y: 55, w: 55, h: 80 },
  // ── Row 2: SW Twin Oaks Circle upper ─────────────────────────────────────
  '12': { x: 1017, y: 159, w: 94, h: 88 },
  '13': { x: 961,  y: 159, w: 55, h: 88 },
  '14': { x: 905,  y: 159, w: 55, h: 88 },
  '15': { x: 849,  y: 159, w: 55, h: 88 },
  '16': { x: 793,  y: 159, w: 55, h: 88 },
  '17': { x: 737,  y: 159, w: 55, h: 88 },
  '18': { x: 681,  y: 159, w: 55, h: 88 },
  '19': { x: 625,  y: 159, w: 55, h: 88 },
  '20': { x: 569,  y: 159, w: 55, h: 88 },
  '21': { x: 513,  y: 159, w: 55, h: 88 },
  '22': { x: 464,  y: 159, w: 49, h: 88 },
  // ── Corner wrap: lots 23–27 ───────────────────────────────────────────────
  '23': { x: 391,  y: 159, w: 49, h: 88 },
  '24': { x: 323,  y: 159, w: 62, h: 88 },
  '25': { x: 253,  y: 159, w: 65, h: 88 },
  '26': { x: 179,  y: 159, w: 70, h: 88 },
  '27': { x: 91,   y: 159, w: 82, h: 88 },
  // ── Far-left column (caretaker) ───────────────────────────────────────────
  '28': { x: 91,   y: 247, w: 65, h: 100 },
  '29': { x: 91,   y: 347, w: 65, h: 100 },
  // ── Interior block – top row (lot 30 = left, lot 39 = right) ─────────────
  '30': { x: 496,  y: 271, w: 52, h: 72 },
  '31': { x: 550,  y: 271, w: 52, h: 72 },
  '32': { x: 604,  y: 271, w: 52, h: 72 },
  '33': { x: 658,  y: 271, w: 52, h: 72 },
  '34': { x: 712,  y: 271, w: 52, h: 72 },
  '35': { x: 766,  y: 271, w: 52, h: 72 },
  '36': { x: 820,  y: 271, w: 52, h: 72 },
  '37': { x: 874,  y: 271, w: 52, h: 72 },
  '38': { x: 928,  y: 271, w: 52, h: 72 },
  '39': { x: 982,  y: 271, w: 52, h: 72 },
  // ── Interior block – bottom row (lot 49 = left, lot 40 = right) ──────────
  '49': { x: 496,  y: 349, w: 52, h: 72 },
  '48': { x: 550,  y: 349, w: 52, h: 72 },
  '47': { x: 604,  y: 349, w: 52, h: 72 },
  '46': { x: 658,  y: 349, w: 52, h: 72 },
  '45': { x: 712,  y: 349, w: 52, h: 72 },
  '44': { x: 766,  y: 349, w: 52, h: 72 },
  '43': { x: 820,  y: 349, w: 52, h: 72 },
  '42': { x: 874,  y: 349, w: 52, h: 72 },
  '41': { x: 928,  y: 349, w: 52, h: 72 },
  '40': { x: 982,  y: 349, w: 52, h: 72 },
  // ── Park section – same row as interior bottom, extends left ──────────────
  '50': { x: 432,  y: 349, w: 52, h: 72 },
  '51': { x: 376,  y: 349, w: 52, h: 72 },
  '52': { x: 320,  y: 349, w: 52, h: 72 },
  '53': { x: 264,  y: 349, w: 52, h: 72 },
  // ── SW Pleasant Place (lot 54 = left, lot 57 = right) ────────────────────
  '54': { x: 496,  y: 445, w: 58, h: 72 },
  '55': { x: 556,  y: 445, w: 58, h: 72 },
  '56': { x: 616,  y: 445, w: 58, h: 72 },
  '57': { x: 676,  y: 445, w: 58, h: 72 },
  // ── SW Twin Oaks Circle lower (lot 61 = left, lot 58 = right) ────────────
  '61': { x: 496,  y: 517, w: 58, h: 72 },
  '60': { x: 556,  y: 517, w: 58, h: 72 },
  '59': { x: 616,  y: 517, w: 58, h: 72 },
  '58': { x: 676,  y: 517, w: 58, h: 72 },
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
      <svg viewBox="80 0 1120 630" className="w-full h-auto" style={{ minWidth: 520 }}>
        <defs>
          <pattern id="lm-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#e2e8f0" strokeWidth="1.5" />
          </pattern>
          <filter id="lm-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="3" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* ── Background ── */}
        <rect width="1220" height="630" fill="#f8fafc" rx="8" />

        {/* ── Roads ── */}
        {/* SW Mobile Place — between Row 1 and Row 2 */}
        <rect x="440" y="135" width="695" height="24" fill="#cbd5e1" />
        <line x1="440" y1="147" x2="1135" y2="147"
          stroke="white" strokeWidth="1.5" strokeDasharray="8,5" />
        <text x="780" y="151" fontSize="7" fontWeight="700" textAnchor="middle"
          fill="#475569" fontFamily="sans-serif" letterSpacing="2">SW MOBILE PLACE</text>

        {/* Connecting road between lots 22 and 23 — links SW Mobile Place to SW Twin Oaks Circle */}
        <rect x="440" y="135" width="24" height="112" fill="#cbd5e1" />
        <line x1="452" y1="159" x2="452" y2="247"
          stroke="white" strokeWidth="1.5" strokeDasharray="8,5" />

        {/* SW Twin Oaks Circle upper — between Row 2 and interior block */}
        <rect x="156" y="247" width="1044" height="24" fill="#cbd5e1" />
        <line x1="156" y1="259" x2="1200" y2="259"
          stroke="white" strokeWidth="1.5" strokeDasharray="8,5" />
        <text x="640" y="263" fontSize="7" fontWeight="700" textAnchor="middle"
          fill="#475569" fontFamily="sans-serif" letterSpacing="2">SW TWIN OAKS CIRCLE</text>

        {/* Connector beside lot 12 — links SW Twin Oaks Circle to SW Mobile Place */}
        <rect x="1111" y="159" width="24" height="88" fill="#cbd5e1" />
        <line x1="1123" y1="159" x2="1123" y2="247"
          stroke="white" strokeWidth="1.5" strokeDasharray="8,5" />

        {/* SW Twin Oaks Circle west curve — connects upper to lower along the left side */}
        <rect x="156" y="271" width="24" height="318" fill="#cbd5e1" />
        <line x1="168" y1="271" x2="168" y2="589"
          stroke="white" strokeWidth="1.5" strokeDasharray="8,5" />

        {/* SW Pleasant Place — between interior block and pleasant place row */}
        <rect x="180" y="421" width="931" height="24" fill="#cbd5e1" />
        <line x1="180" y1="433" x2="1111" y2="433"
          stroke="white" strokeWidth="1.5" strokeDasharray="8,5" />
        <text x="615" y="437" fontSize="7" fontWeight="700" textAnchor="middle"
          fill="#475569" fontFamily="sans-serif" letterSpacing="2">SW PLEASANT PLACE</text>

        {/* Short connector beside lots 57 & 58 — links SW Pleasant Place to SW Twin Oaks Circle lower */}
        <rect x="734" y="445" width="24" height="144" fill="#cbd5e1" />
        <line x1="746" y1="445" x2="746" y2="589"
          stroke="white" strokeWidth="1.5" strokeDasharray="8,5" />

        {/* SW Twin Oaks Circle lower */}
        <rect x="156" y="589" width="1044" height="24" fill="#cbd5e1" />
        <line x1="156" y1="601" x2="1200" y2="601"
          stroke="white" strokeWidth="1.5" strokeDasharray="8,5" />
        <text x="640" y="605" fontSize="7" fontWeight="700" textAnchor="middle"
          fill="#475569" fontFamily="sans-serif" letterSpacing="2">SW TWIN OAKS CIRCLE</text>

        {/* ── Park open space (interior top level) ── */}
        <rect x="180" y="271" width="82"  height="150" fill="#dcfce7" stroke="#86efac" strokeWidth="1" rx="4" />
        <rect x="262" y="271" width="232" height="72"  fill="#dcfce7" stroke="#86efac" strokeWidth="1" rx="4" />
        <rect x="484" y="343" width="12"  height="78"  fill="#dcfce7" stroke="#86efac" strokeWidth="1" />
        <text x="378" y="288" fill="#15803d" fontSize="10" fontWeight="600" fontFamily="sans-serif">Park</text>
        {/* Laundry */}
        <rect x="356" y="281" width="64" height="34" fill="#e0f2fe" stroke="#F0A500" strokeWidth="1.5" rx="3" />
        <text x="388" y="303" fill="#0369a1" fontSize="8.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">Laundry</text>
        {/* Proposed Community Building */}
        <rect x="192" y="277" width="46" height="136" fill="#fef9c3" stroke="#fde047" strokeWidth="1.5" strokeDasharray="3,2" rx="3" />
        <text x="215" y="337" fill="#92400e" fontSize="7.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">Community</text>
        <text x="215" y="349" fill="#92400e" fontSize="7.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">Building</text>


        {/* ── Interior alley (shared drive between facing rows) ── */}
        <rect x="264" y="343" width="772" height="6" fill="#e2e8f0" rx="1" />

        {/* ── Not-park areas ── */}
        <rect x="1036" y="271" width="82"  height="150" fill="#edf2f7" stroke="#d0dae6" strokeWidth="1" rx="3" />
        <rect x="758"  y="445" width="360" height="144" fill="#edf2f7" stroke="#d0dae6" strokeWidth="1" rx="3" />
        <rect x="91"   y="447" width="65"  height="142" fill="#edf2f7" stroke="#d0dae6" strokeWidth="1" rx="3" />
        <rect x="180"  y="445" width="316" height="144" fill="#edf2f7" stroke="#d0dae6" strokeWidth="1" rx="3" />
        <text x="1077" y="344" fill="#94a3b8" fontSize="7.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">Not park</text>
        <text x="1077" y="355" fill="#94a3b8" fontSize="7.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">owned</text>
        <text x="938"  y="510" fill="#94a3b8" fontSize="7.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">Not park</text>
        <text x="938"  y="521" fill="#94a3b8" fontSize="7.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">owned</text>
        <text x="123"  y="511" fill="#94a3b8" fontSize="7.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">Not park</text>
        <text x="123"  y="522" fill="#94a3b8" fontSize="7.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">owned</text>
        <text x="338"  y="510" fill="#94a3b8" fontSize="7.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">Not park</text>
        <text x="338"  y="521" fill="#94a3b8" fontSize="7.5" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">owned</text>


        {/* ── Lot tiles ── */}
        {Object.entries(LOTS).map(([label, { x, y, w, h }]) => {
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

          const fill   = style.fill;
          const stroke = isSelected || isHovered ? '#F0A500' : style.stroke;
          const sw     = isSelected || isHovered ? 2.5 : 1.5;

          return (
            <g
              key={label}
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
              <text
                x={cx} y={cy - (desLabel ? 7 : 0)}
                fontSize="12" fontWeight="700" textAnchor="middle" dominantBaseline="middle"
                fill={isSelected ? '#78350f' : style.text}
                fontFamily="sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {label}
              </text>
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
              {!space && (
                <text x={cx} y={cy + 10} fontSize="9" textAnchor="middle" fill="#d1d5db"
                  fontFamily="sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}>?</text>
              )}
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

        {/* ── Mary's River (on top so it clips the corners of lots 9–11) ── */}
        <path
          d="M0,-30 L0,130 Q45,158 91,159 Q130,163 179,162 Q215,163 253,161 Q286,162 323,160 Q354,158 391,148 Q416,100 440,75 Q462,68 496,72 Q526,62 556,54 Q586,46 620,34 Q655,8 820,-30 Z"
          fill="#bfdbfe" opacity="0.78"
          style={{ pointerEvents: 'none' }}
        />
        <text x="195" y="52" fill="#3b82f6" fontSize="11" fontWeight="700"
          fontFamily="sans-serif" letterSpacing="2" opacity="0.9"
          style={{ pointerEvents: 'none' }}>MARYS RIVER</text>

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
          if (tipX < 84) tipX = 84;
          if (tipX + tipW > 1196) tipX = 1196 - tipW;
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
