import { colors, theme } from '../theme';

export interface DataBackedMonthPickerProps {
  selectedMonth: string; // YYYY-MM
  onMonthChange: (month: string) => void;
  availableMonths: string[]; // from API, YYYY-MM format sorted descending
}

/**
 * Formats a YYYY-MM string to a readable "MMM YYYY" label (e.g. "Jan 2024").
 */
function formatMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * DataBackedMonthPicker — A dropdown showing only months for which data exists.
 * Displays month labels as "MMM YYYY" while using YYYY-MM as the option value.
 * When no months are available, the control is disabled with an informational message.
 */
export default function DataBackedMonthPicker({
  selectedMonth,
  onMonthChange,
  availableMonths,
}: DataBackedMonthPickerProps) {
  const hasMonths = availableMonths.length > 0;

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: colors.text,
          fontFamily: theme.fonts.body,
        }}
      >
        Month
      </span>
      <select
        value={hasMonths ? selectedMonth : ''}
        onChange={(e) => onMonthChange(e.target.value)}
        disabled={!hasMonths}
        aria-label="Select month"
        style={{
          padding: '6px 10px',
          borderRadius: '4px',
          border: `1px solid ${colors.border}`,
          fontSize: '14px',
          minWidth: '160px',
          fontFamily: theme.fonts.body,
          color: hasMonths ? colors.text : colors.textSecondary,
          backgroundColor: hasMonths ? colors.background : colors.secondary,
          cursor: hasMonths ? 'pointer' : 'not-allowed',
        }}
      >
        {hasMonths ? (
          availableMonths.map((month) => (
            <option key={month} value={month}>
              {formatMonthLabel(month)}
            </option>
          ))
        ) : (
          <option value="">No data available</option>
        )}
      </select>
    </label>
  );
}
