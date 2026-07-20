/**
 * DetailModal — a centered overlay dialog used for card drill-downs.
 *
 * Rendered in a portal to `document.body`. Closes on backdrop click, the close
 * button, or Escape. Locks page scroll while open and animates in.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { dash } from '../theme';

export interface DetailModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function DetailModal({ title, subtitle, onClose, children }: DetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3, 7, 18, 0.72)',
        backdropFilter: 'blur(2px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 16px',
        overflow: 'auto',
        animation: 'ld-modal-fade 140ms ease-out',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(920px, 100%)',
          background: dash.appBg,
          border: `1px solid ${dash.border}`,
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          color: dash.text,
          animation: 'ld-modal-pop 160ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: `1px solid ${dash.border}`,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: dash.textStrong }}>{title}</h2>
            {subtitle && <div style={{ fontSize: 12.5, color: dash.textMuted, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${dash.border}`,
              background: dash.panelBg,
              color: dash.textMuted,
              fontSize: 16,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </header>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
      </div>

      <style>{`
        @keyframes ld-modal-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ld-modal-pop { from { opacity: 0; transform: translateY(8px) scale(0.98) } to { opacity: 1; transform: none } }
      `}</style>
    </div>,
    document.body
  );
}
