/**
 * VersionPanel — lists stored version snapshots, compares any two, and restores
 * a selected version (Req 10.3, 10.4, 10.5).
 *
 * Versions come from the module context (`useLeadership().versions`); each is
 * shown with its id, reporting cycle, and creation timestamp. The user may pick
 * two versions to compare: the panel calls {@link compareVersions} and renders
 * a readable summary of the resulting {@link VersionDiff} (added / removed /
 * changed metrics, target changes, and any other structural changes), using
 * {@link isEmptyDiff} to show a "No differences" message when the snapshots are
 * equivalent. Each version also has a Restore button that calls
 * `restoreVersion(versionId)` from the context (Req 10.5).
 *
 * Note: creating snapshots (`snapshotVersion`) is a provider concern; this
 * panel only lists / compares / restores versions already present in state.
 *
 * Styling uses the shared dark-theme design tokens (`dash`).
 */
import { useMemo, useState } from 'react';
import {
  compareVersions,
  isEmptyDiff,
  type VersionDiff,
} from '../services/persistence-service';
import { useLeadership } from '../state/useLeadership';
import { dash } from '../theme';
import type { Version } from '../model/editing-types';

/** Format an ISO-8601 timestamp for display, falling back to the raw string. */
function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString();
}

const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 11,
  fontWeight: 600,
  color: dash.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

/** A single line describing one category of differences in a diff summary. */
function DiffLine({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <li
      data-testid="diff-line"
      style={{ fontSize: 13, color: dash.text, marginBottom: 4 }}
    >
      <span style={{ color: dash.textStrong, fontWeight: 600 }}>{count}</span>{' '}
      {label}
    </li>
  );
}

/** Readable summary of a {@link VersionDiff}. */
function DiffSummary({ diff }: { diff: VersionDiff }) {
  if (isEmptyDiff(diff)) {
    return (
      <div
        data-testid="diff-empty"
        style={{ fontSize: 14, color: dash.textMuted, padding: '4px 0' }}
      >
        No differences between the selected versions.
      </div>
    );
  }

  return (
    <ul data-testid="diff-summary" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      <DiffLine label="metric(s) added" count={diff.addedMetrics.length} />
      <DiffLine label="metric(s) removed" count={diff.removedMetrics.length} />
      <DiffLine label="metric value(s) changed" count={diff.changedMetrics.length} />
      <DiffLine label="target(s) changed" count={diff.targetChanges.length} />
      {diff.otherChanges && (
        <li
          data-testid="diff-line"
          style={{ fontSize: 13, color: dash.text, marginBottom: 4 }}
        >
          Other structural changes detected.
        </li>
      )}
    </ul>
  );
}

/** A single version list item with select-to-compare and restore controls. */
function VersionListItem({
  version,
  selected,
  onToggleSelect,
  onRestore,
}: {
  version: Version;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  return (
    <li
      data-testid="version-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        marginBottom: 6,
        background: selected ? dash.panelBgAlt : dash.panelBg,
        border: `1px solid ${selected ? dash.primary : dash.border}`,
        borderRadius: 8,
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(version.id)}
        aria-label={`Select version ${version.cycle} for comparison`}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: dash.textStrong }}>
          {version.cycle}
        </div>
        <div style={{ fontSize: 12, color: dash.textMuted }}>
          {formatTimestamp(version.createdAt)}
        </div>
        <div
          style={{
            fontSize: 11,
            color: dash.textFaint,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {version.id}
        </div>
      </div>
      <button
        type="button"
        data-testid="restore-button"
        onClick={() => onRestore(version.id)}
        style={{
          padding: '6px 14px',
          borderRadius: 8,
          border: `1px solid ${dash.border}`,
          background: 'transparent',
          color: dash.text,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Restore
      </button>
    </li>
  );
}

/**
 * The Version panel. Lists version snapshots, lets the user compare any two,
 * and restore a selected version.
 */
export default function VersionPanel() {
  const { versions, restoreVersion } = useLeadership();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((existing) => existing !== id);
      }
      // Keep at most the two most-recently selected versions for comparison.
      const next = [...prev, id];
      return next.length > 2 ? next.slice(next.length - 2) : next;
    });
  };

  // Compute the diff only when exactly two versions are selected.
  const diff = useMemo<VersionDiff | null>(() => {
    if (selectedIds.length !== 2) return null;
    const a = versions.find((v) => v.id === selectedIds[0]);
    const b = versions.find((v) => v.id === selectedIds[1]);
    if (!a || !b) return null;
    return compareVersions(a, b);
  }, [selectedIds, versions]);

  return (
    <section
      aria-label="Versions"
      data-testid="version-panel"
      style={{
        background: dash.panelBg,
        border: `1px solid ${dash.border}`,
        borderRadius: 10,
        padding: 16,
        color: dash.text,
      }}
    >
      <h3
        style={{
          margin: '0 0 12px',
          fontSize: 13,
          fontWeight: 600,
          color: dash.textStrong,
        }}
      >
        Versions
      </h3>

      {versions.length === 0 ? (
        <div
          data-testid="version-empty"
          style={{
            padding: 24,
            textAlign: 'center',
            color: dash.textMuted,
            fontSize: 14,
          }}
        >
          No saved versions yet.
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: dash.textMuted }}>
            Select two versions to compare their differences.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {versions.map((version) => (
              <VersionListItem
                key={version.id}
                version={version}
                selected={selectedIds.includes(version.id)}
                onToggleSelect={toggleSelect}
                onRestore={restoreVersion}
              />
            ))}
          </ul>

          {selectedIds.length === 2 && diff !== null && (
            <div
              data-testid="version-comparison"
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: `1px solid ${dash.border}`,
              }}
            >
              <h4 style={sectionTitleStyle}>Comparison</h4>
              <DiffSummary diff={diff} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
