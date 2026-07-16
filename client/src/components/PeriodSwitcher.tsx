import type { PeriodType } from '../types/governance';
import { colors, theme } from '../theme';

export interface PeriodSwitcherProps {
  selected: PeriodType;
  onChange: (period: PeriodType) => void;
}

const PERIODS: { value: PeriodType; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

/**
 * Segmented control for switching between time periods (Month | Quarter | Year).
 * Pure UI component — triggers onChange callback with no API calls.
 * Default selection is Quarter (controlled externally via `selected` prop).
 */
export default function PeriodSwitcher({ selected, onChange }: PeriodSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Period selection"
      style={{
        display: 'inline-flex',
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${colors.border}`,
        overflow: 'hidden',
        backgroundColor: colors.secondary,
      }}
    >
      {PERIODS.map(({ value, label }) => {
        const isActive = selected === value;

        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(value)}
            style={{
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 400,
              fontFamily: theme.fonts.body,
              cursor: 'pointer',
              border: 'none',
              borderRight: value !== 'year' ? `1px solid ${colors.border}` : 'none',
              backgroundColor: isActive ? colors.primary : 'transparent',
              color: isActive ? colors.textLight : colors.text,
              transition: 'background-color 0.2s, color 0.2s',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = `0 0 0 2px ${colors.primary}40`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
