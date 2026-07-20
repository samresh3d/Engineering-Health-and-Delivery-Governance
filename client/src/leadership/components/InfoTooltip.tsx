/**
 * InfoTooltip — an accessible "(i)" info popover for KPI cards.
 *
 * Behavior:
 *  - Opens on hover and keyboard focus (desktop) and on tap/click (mobile).
 *  - Rendered in a portal to `document.body` and positioned via the trigger's
 *    bounding rect, so it is never clipped by a card's overflow and does not
 *    push neighboring cards.
 *  - Closes on mouse leave (short grace delay), blur, Escape, outside click,
 *    or scroll/resize.
 *  - Subtle fade + scale entrance animation.
 *
 * The content is section-labeled: Definition, Formula, Target, Current Status
 * (optional), and Why it matters.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dash } from '../theme';

export interface InfoTooltipContent {
  title: string;
  definition: string;
  formula: string;
  target: string;
  trend?: string;
  /** Optional current status/value line, e.g. "83% · On Target". */
  currentStatus?: string;
  /** Optional color for the current-status chip. */
  statusColor?: string;
  whyItMatters: string;
}

export interface InfoTooltipProps {
  content: InfoTooltipContent;
  /** Accessible label for the trigger button. */
  label?: string;
}

interface Coords {
  top: number;
  left: number;
  placement: 'top' | 'bottom';
}

const POPOVER_WIDTH = 300;
const GAP = 10;

export default function InfoTooltip({ content, label }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const popId = useId();

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const computeCoords = useCallback((): Coords | null => {
    const el = triggerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Prefer below the icon; flip above if not enough room.
    const spaceBelow = viewportH - r.bottom;
    const placement: 'top' | 'bottom' = spaceBelow < 240 && r.top > 240 ? 'top' : 'bottom';

    // Center horizontally on the trigger, clamped to the viewport.
    let left = r.left + r.width / 2 - POPOVER_WIDTH / 2;
    left = Math.max(12, Math.min(left, viewportW - POPOVER_WIDTH - 12));

    const top = placement === 'bottom' ? r.bottom + GAP : r.top - GAP;
    return { top, left, placement };
  }, []);

  const doOpen = useCallback(() => {
    clearCloseTimer();
    setCoords(computeCoords());
    setOpen(true);
  }, [computeCoords]);

  const doClose = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }, []);

  // Reposition on scroll/resize while open; close on Escape / outside interaction.
  useEffect(() => {
    if (!open) return;
    const reposition = () => setCoords(computeCoords());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') doClose();
    };
    const onDocPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      doClose();
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDocPointer);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDocPointer);
    };
  }, [open, computeCoords, doClose]);

  useLayoutEffect(() => {
    if (open && coords === null) setCoords(computeCoords());
  }, [open, coords, computeCoords]);

  const toggle = () => (open ? doClose() : doOpen());

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label ?? `About ${content.title}`}
        aria-expanded={open}
        aria-describedby={open ? popId : undefined}
        onMouseEnter={doOpen}
        onMouseLeave={scheduleClose}
        onFocus={doOpen}
        onBlur={scheduleClose}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: `1px solid ${dash.textFaint}`,
          background: 'transparent',
          color: dash.textMuted,
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          flexShrink: 0,
        }}
      >
        i
      </button>

      {open &&
        coords !== null &&
        createPortal(
          <div
            id={popId}
            ref={popoverRef}
            role="tooltip"
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: POPOVER_WIDTH,
              transform: coords.placement === 'top' ? 'translateY(-100%)' : undefined,
              background: dash.panelBg,
              border: `1px solid ${dash.border}`,
              borderRadius: 10,
              boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
              padding: 14,
              zIndex: 9999,
              color: dash.text,
              animation: 'ld-info-pop 120ms ease-out',
              transformOrigin: coords.placement === 'top' ? 'bottom center' : 'top center',
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: dash.textStrong, marginBottom: 8 }}>
              {content.title}
            </div>

            <Section label="Definition">{content.definition}</Section>
            <Section label="Formula">
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5 }}>
                {content.formula}
              </span>
            </Section>
            <Section label="Target">{content.target}</Section>
            {content.trend && <Section label="Success criteria">{content.trend}</Section>}
            {content.currentStatus && (
              <Section label="Current status">
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: content.statusColor ?? dash.text,
                    background: `${content.statusColor ?? dash.textFaint}22`,
                  }}
                >
                  {content.currentStatus}
                </span>
              </Section>
            )}
            <Section label="Why it matters" last>
              {content.whyItMatters}
            </Section>

            <style>{`
              @keyframes ld-info-pop {
                from { opacity: 0; transform: ${coords.placement === 'top' ? 'translateY(-100%) scale(0.97)' : 'scale(0.97)'}; }
                to   { opacity: 1; transform: ${coords.placement === 'top' ? 'translateY(-100%) scale(1)' : 'scale(1)'}; }
              }
            `}</style>
          </div>,
          document.body
        )}
    </>
  );
}

function Section({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: dash.textFaint, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: dash.text, lineHeight: 1.45 }}>{children}</div>
    </div>
  );
}
