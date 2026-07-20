/**
 * IdentityPrompt — captures the local display name used for "Updated By".
 *
 * The data-management layer attributes every edit to a display name (Req 5.2,
 * Assumption A1). This component captures that name once: when `currentUser` is
 * not yet set it renders a small labelled input plus a Save button; on save it
 * calls `setCurrentUser`, and the provider persists the value via auto-save (no
 * separate storage is needed here).
 *
 * When a user is already identified it renders a compact "Editing as {name}"
 * label with a "Change" affordance that clears the local draft and lets the
 * person re-enter their name.
 */
import { useState } from 'react';
import { useLeadership } from '../state/useLeadership';
import { dash } from '../theme';

export default function IdentityPrompt() {
  const { currentUser, setCurrentUser } = useLeadership();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  const showPrompt = currentUser === null || editing;

  const save = () => {
    const name = draft.trim();
    if (name.length === 0) {
      return;
    }
    setCurrentUser(name);
    setDraft('');
    setEditing(false);
  };

  if (!showPrompt) {
    return (
      <div
        className="leadership-identity"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: dash.textMuted,
        }}
      >
        <span>
          Editing as <strong style={{ color: dash.textStrong }}>{currentUser}</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft(currentUser ?? '');
            setEditing(true);
          }}
          style={{
            padding: '2px 8px',
            borderRadius: 6,
            border: `1px solid ${dash.border}`,
            background: 'transparent',
            color: dash.text,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <form
      className="leadership-identity-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        padding: 12,
        background: dash.panelBg,
        border: `1px solid ${dash.border}`,
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label
          htmlFor="leadership-identity-name"
          style={{ fontSize: 13, fontWeight: 600, color: dash.textStrong }}
        >
          Your name
        </label>
        <input
          id="leadership-identity-name"
          type="text"
          value={draft}
          autoFocus
          placeholder="e.g. Jamie Rivera"
          onChange={(event) => setDraft(event.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: `1px solid ${dash.border}`,
            background: dash.panelBgAlt,
            color: dash.text,
            fontSize: 13,
            minWidth: 200,
          }}
        />
      </div>
      <button
        type="submit"
        disabled={draft.trim().length === 0}
        style={{
          padding: '8px 16px',
          borderRadius: 6,
          border: 'none',
          background: dash.primary,
          color: dash.textStrong,
          cursor: draft.trim().length === 0 ? 'not-allowed' : 'pointer',
          opacity: draft.trim().length === 0 ? 0.6 : 1,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Save
      </button>
    </form>
  );
}
