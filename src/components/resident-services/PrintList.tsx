import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { providerName, type ResidentService } from '@/lib/resident-services';
import { groupNumbers, type ResidentNumber } from '@/lib/resident-numbers';

/**
 * The printed Resident Services handouts (design approved 2026-11-11). They follow the
 * Sparrow document standards: Arial, the bird + "Sparrow" running header, a green H1 with a
 * thin rule per section, yellow and green callouts, and Susanna's own overrides: Sparrow's
 * phone and website on the header's right, and "Printed [date] by Sparrow Resident
 * Services" + page number in the footer.
 *
 * Two handouts share one frame:
 *  - PrintList: "Resources in Our Area", the Assistance Programs on screen.
 *  - PrintNumbers: "Essential Phone Numbers", the Essential Phone Numbers tab.
 *
 * They never show: the client's name, the filters used, internal notes, contacts, or a
 * confidential address -- those rows say "Call them for the location".
 *
 * How it prints: it's rendered into <body> only while printing, everything else on the page
 * is hidden by @media print, and the table's <thead> repeats the header on every page.
 * The footer uses @page margin boxes (Chrome and Edge).
 */
const PHONE = '(541) 753-3334';
const WEBSITE = 'sparrowinc.org';

function PrintFrame({ title, subtitle, onDone, children }: { title: string; subtitle: string; onDone: () => void; children: ReactNode }) {
  const logoRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let done = false;
    const finish = () => { if (!done) { done = true; onDone(); } };
    window.addEventListener('afterprint', finish);
    // Wait for the logo so it's on the page, then open the print dialog.
    const go = () => requestAnimationFrame(() => { window.print(); });
    const img = logoRef.current;
    if (img && !img.complete) { img.addEventListener('load', go, { once: true }); img.addEventListener('error', go, { once: true }); }
    else go();
    return () => window.removeEventListener('afterprint', finish);
  }, [onDone]);

  const printed = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  // The footer text goes in CSS (an @page margin box), so the date is escaped for a CSS string.
  const footer = `Printed ${printed} by Sparrow Resident Services`.replace(/["\\]/g, '');

  return createPortal(
    <div className="rs-print-root">
      <style>{`
        @media screen { .rs-print-root { display: none; } }
        @media print {
          body > *:not(.rs-print-root) { display: none !important; }
          html, body { background: #fff !important; }
          @page {
            size: letter;
            margin: 0.45in 1in 0.7in 1in;
            @bottom-left { content: "${footer}"; font: 7pt Arial, sans-serif; color: #767676; vertical-align: top; padding-top: 6pt; border-top: 0.5pt solid #D8D8D8; }
            @bottom-center { content: ""; vertical-align: top; border-top: 0.5pt solid #D8D8D8; }
            @bottom-right { content: "Page " counter(page); font: 7pt Arial, sans-serif; color: #767676; vertical-align: top; padding-top: 6pt; border-top: 0.5pt solid #D8D8D8; }
          }
        }
        .rs-print-root { font-family: Arial, Helvetica, sans-serif; color: #1A1A1A; font-size: 10pt; line-height: 1.3; background: #fff; }
        .rs-print-root * { box-sizing: border-box; }
        .rsp-frame { width: 100%; border-collapse: collapse; }
        .rsp-frame > thead > tr > td, .rsp-frame > tbody > tr > td { padding: 0; }
        .rsp-rh { display: flex; align-items: center; gap: 4pt; font-size: 8pt; border-bottom: 0.5pt solid #D8D8D8; padding-bottom: 4pt; margin-bottom: 0.35in; }
        .rsp-rh img { width: 13.5pt; height: 13.5pt; }
        .rsp-rh b { color: #1E4D30; }
        .rsp-rh span { margin-left: auto; color: #767676; }
        .rsp-title { font-size: 26pt; font-weight: 700; color: #1E4D30; margin: 0; line-height: 1.1; }
        .rsp-subt { font-size: 10pt; color: #767676; margin: 4pt 0 8pt; }
        .rsp-rule { border-bottom: 0.5pt solid #D8D8D8; margin: 0 0 10pt; }
        .rsp-callout { display: flex; margin: 0 0 8pt; break-inside: avoid; }
        .rsp-callout::before { content: ""; flex: 0 0 3pt; }
        .rsp-callout > div { padding: 6pt 9pt; flex: 1; }
        .rsp-yellow { background: #FFF8E1; } .rsp-yellow::before { background: #F0A500; }
        .rsp-green { background: #E8F2EC; margin-top: 16pt; } .rsp-green::before { background: #1E4D30; }
        .rsp-green ul { list-style: none; margin: 3pt 0 0; padding: 0; }
        .rsp-green li { margin: 1.5pt 0; }
        .rsp-green li b { display: inline-block; min-width: 1.1in; }
        .rsp-h1 { font-size: 14pt; font-weight: 700; color: #1E4D30; margin: 14pt 0 3pt; break-after: avoid; }
        .rsp-h1rule { border-bottom: 0.5pt solid #D8D8D8; break-after: avoid; }
        .rsp-row { display: grid; grid-template-columns: 1.2fr 1fr; gap: 0 10pt; padding: 6pt 0; border-bottom: 0.5pt solid #D8D8D8; break-inside: avoid; }
        .rsp-row > div { display: flex; flex-direction: column; gap: 1pt; }
        .rsp-row b { font-weight: 700; }
        .rsp-how { grid-column: 1 / 3; margin-top: 3pt; }
        .rsp-num { display: flex; justify-content: space-between; align-items: baseline; gap: 10pt; padding: 4pt 0; border-bottom: 0.5pt solid #D8D8D8; break-inside: avoid; }
        .rsp-num small { display: block; color: #767676; font-size: 9pt; }
        .rsp-num b { white-space: nowrap; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>
      <table className="rsp-frame">
        <thead>
          <tr><td>
            <div className="rsp-rh">
              <img ref={logoRef} src="/brand/logo-mark-gold.png" alt="" />
              <b>Sparrow</b>
              <span>{PHONE} · {WEBSITE}</span>
            </div>
          </td></tr>
        </thead>
        <tbody>
          <tr><td>
            <h1 className="rsp-title">{title}</h1>
            <p className="rsp-subt">{subtitle}</p>
            <div className="rsp-rule" />
            {children}
          </td></tr>
        </tbody>
      </table>
    </div>,
    document.body,
  );
}

export function PrintList({
  services,
  typeOrder,
  keepNumbers,
  onDone,
}: {
  services: ResidentService[];
  /** Types in the order to print them (what the person came in for first). */
  typeOrder: string[];
  /** The "Other numbers to keep, any time" box: Essential Phone Numbers marked "Also on every Assistance Programs printout". */
  keepNumbers: Pick<ResidentNumber, 'name' | 'phone' | 'note'>[];
  onDone: () => void;
}) {
  const groups = typeOrder
    .map((type) => ({
      type,
      rows: services
        .filter((s) => s.service_type === type)
        .sort((a, b) => providerName(a).localeCompare(providerName(b)) || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.rows.length > 0);

  return (
    <PrintFrame title="Resources in Our Area" subtitle="Local programs and services we know and refer people to" onDone={onDone}>
      <div className="rsp-callout rsp-yellow"><div>
        <b>Please call ahead.</b> We do our best to keep this list accurate and up to date, but the programs below can change their hours, rules or locations. Call a program before you go.
      </div></div>

      {groups.map((g) => (
        <section key={g.type}>
          <h2 className="rsp-h1">{g.type}</h2>
          <div className="rsp-h1rule" />
          {g.rows.map((s) => (
            <div key={s.id} className="rsp-row">
              <div>
                <b>{providerName(s)}</b>
                <span>{s.name}</span>
              </div>
              <div>
                {s.help_phone && <b>{s.help_phone}</b>}
                {/* Never print a confidential address: the program decides who gets it. */}
                {s.address_confidential
                  ? <span>Call them for the location</span>
                  : s.address && <span>{s.address}</span>}
                {s.hours && <span>{s.hours}</span>}
              </div>
              {s.how_to_access && <div className="rsp-how"><span><b>First steps:</b> {s.how_to_access}</span></div>}
            </div>
          ))}
        </section>
      ))}

      {keepNumbers.length > 0 && (
        <div className="rsp-callout rsp-green"><div>
          <b>Other numbers to keep, any time</b>
          <ul>
            {keepNumbers.map((n) => (
              <li key={`${n.phone}-${n.name}`}><b>{n.phone}</b>{n.name}{n.note ? ` · ${n.note}` : ''}</li>
            ))}
          </ul>
        </div></div>
      )}
    </PrintFrame>
  );
}

/** The Essential Phone Numbers tab, printed. Emergency numbers appear once, in their own section
 *  at the top -- there's no bottom box on this one. */
export function PrintNumbers({ numbers, onDone }: { numbers: ResidentNumber[]; onDone: () => void }) {
  return (
    <PrintFrame title="Essential Phone Numbers" subtitle="Phone numbers to keep handy" onDone={onDone}>
      {groupNumbers(numbers).map((g) => (
        <section key={g.key}>
          <h2 className="rsp-h1">{g.label}</h2>
          <div className="rsp-h1rule" />
          {g.rows.map((n) => (
            <div key={n.id} className="rsp-num">
              <span>{n.name}{n.note && <small>{n.note}</small>}</span>
              <b>{n.phone}</b>
            </div>
          ))}
        </section>
      ))}
    </PrintFrame>
  );
}
