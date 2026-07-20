import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MONDAY_GUIDE_INSTRUCTIONS, type SessionLogType } from '@/lib/lcp-types';
import { RichTextView } from './RichText';

function formatDateHeader(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export interface MondayMentorContent {
  sessionNumber: number;
  sessionTitle: string;
  brief: string | null;
  handoutEcho: string | null;
  goingDeeper: string | null;
}

export function SessionSplitLayout({
  sessionLabel,
  sessionDate,
  sessionType,
  mondayContent,
  mondayLoading,
  children,
}: {
  sessionLabel: string;
  sessionDate: string;
  sessionType?: SessionLogType;
  mondayContent?: MondayMentorContent | null;
  mondayLoading?: boolean;
  children: ReactNode;
}) {
  const [notesOpen, setNotesOpen] = useState(true);
  const [leftPct, setLeftPct] = useState(38);
  const [notes, setNotes] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Lock body scroll while session overlay is active
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Drag-to-resize handler
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.max(15, Math.min(80, pct)));
    }
    function onMouseUp() {
      isDragging.current = false;
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-white">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-sparrow-rule bg-white px-4 py-2.5 shadow-sm">
        <div className="min-w-0 flex-1">
          <span className="font-serif text-base font-semibold text-sparrow-ink">{sessionLabel}</span>
          <span className="ml-3 hidden text-xs text-sparrow-gray sm:inline">
            {formatDateHeader(sessionDate)}
          </span>
        </div>
        <button
          onClick={() => setNotesOpen((v) => !v)}
          className={`hidden rounded-lg px-3 py-1.5 text-xs font-medium transition md:block ${
            notesOpen
              ? 'bg-sparrow-sage text-sparrow-green'
              : 'bg-sparrow-mist text-sparrow-gray hover:text-sparrow-ink'
          }`}
        >
          {notesOpen ? 'Hide notes' : '+ Notes'}
        </button>
      </div>

      {/* Split body */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">

        {/* Notes pane — desktop only */}
        {notesOpen && (
          <div
            className="hidden shrink-0 flex-col overflow-hidden border-r border-sparrow-rule md:flex"
            style={{ width: `${leftPct}%` }}
          >
            {sessionType === 'monday_mentoring' ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="shrink-0 border-b border-sparrow-rule bg-sparrow-mist px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
                    Monday Mentor Guide
                  </p>
                  <p className="text-[10px] text-sparrow-gray/70">
                    Same instructions every week — session content below changes weekly
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="mb-4 whitespace-pre-line rounded-lg bg-sparrow-sage/30 p-3 text-xs italic leading-relaxed text-sparrow-ink">
                    {MONDAY_GUIDE_INSTRUCTIONS}
                  </div>

                  {mondayLoading ? (
                    <p className="text-sm text-sparrow-gray">Loading this week's session…</p>
                  ) : mondayContent ? (
                    <>
                      <p className="mb-3 text-sm font-semibold text-sparrow-green">
                        Session {mondayContent.sessionNumber} · {mondayContent.sessionTitle}
                      </p>
                      <div className="mb-4">
                        <p className="field-label mb-1">Mentor Brief</p>
                        <RichTextView html={mondayContent.brief} empty="Not filled in yet — add it in Curriculum Admin." />
                      </div>
                      <div className="mb-4">
                        <p className="field-label mb-1">From Her Handout</p>
                        <RichTextView html={mondayContent.handoutEcho} empty="Not filled in yet — add it in Curriculum Admin." />
                      </div>
                      <div>
                        <p className="field-label mb-1">Going Deeper</p>
                        <RichTextView html={mondayContent.goingDeeper} empty="Not filled in yet — add it in Curriculum Admin." />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-sparrow-gray">
                      No Thursday session has been filed yet, so there's nothing for Monday to reference.
                    </p>
                  )}
                </div>
                <div className="shrink-0 border-t border-sparrow-rule">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full resize-none bg-white p-3 text-xs leading-relaxed text-sparrow-ink outline-none placeholder:text-sparrow-rule"
                    placeholder="Personal scratch notes — visible only here, not saved"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="shrink-0 border-b border-sparrow-rule bg-sparrow-mist px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
                    Session Notes
                  </p>
                  <p className="text-[10px] text-sparrow-gray/70">
                    Prep notes &amp; curriculum — visible only here, not saved
                  </p>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="flex-1 resize-none bg-white p-4 font-mono text-sm leading-relaxed text-sparrow-ink outline-none placeholder:text-sparrow-rule"
                  placeholder={"Session goal:\n\nTalking points:\n• \n• \n\nDiscussion questions:\n• \n\nMaterials needed:"}
                />
              </>
            )}
          </div>
        )}

        {/* Drag handle — desktop only, only when notes open */}
        {notesOpen && (
          <div
            className="group relative hidden w-1.5 shrink-0 cursor-col-resize select-none bg-sparrow-rule/60 transition-colors hover:bg-sparrow-green/30 md:block"
            onMouseDown={() => {
              isDragging.current = true;
            }}
          >
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-1">
              <div className="h-1 w-1 rounded-full bg-sparrow-gray/50" />
              <div className="h-1 w-1 rounded-full bg-sparrow-gray/50" />
              <div className="h-1 w-1 rounded-full bg-sparrow-gray/50" />
            </div>
          </div>
        )}

        {/* Session log pane */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
