import { colors, theme } from '../../theme';

export default function AdminSettings() {
  return (
    <div>
      <h1 style={{ color: colors.text, fontSize: '24px', marginBottom: '24px', fontFamily: theme.fonts.heading }}>
        Settings
      </h1>

      <div
        style={{
          background: colors.secondary,
          border: `1px solid ${colors.border}`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.xl,
          maxWidth: '600px',
        }}
      >
        <p
          style={{
            color: colors.textSecondary,
            fontSize: '16px',
            marginBottom: '24px',
          }}
        >
          Settings coming soon
        </p>

        <div
          style={{
            borderTop: `1px solid ${colors.border}`,
            paddingTop: theme.spacing.lg,
          }}
        >
          <h2 style={{ color: colors.text, fontSize: '16px', marginBottom: '12px', fontFamily: theme.fonts.heading }}>
            Platform Information
          </h2>
          <p style={{ color: colors.textSecondary, fontSize: '14px', lineHeight: '1.6' }}>
            Engineering Health &amp; Delivery Governance Platform v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
