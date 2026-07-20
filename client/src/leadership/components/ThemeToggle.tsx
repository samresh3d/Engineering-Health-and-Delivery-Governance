/**
 * ThemeToggle — light/dark color-mode toggle for the Leadership Dashboard.
 *
 * A single button bound to the module state via {@link useLeadership}. It reads
 * the current `theme` and calls `toggleTheme` on click. The provider owns the
 * theme value and applies the selected mode to every view (it wraps all views
 * in a themed root), so this component only has to flip the switch.
 *
 * Requirements:
 * - 13.1: the dashboard provides a light mode and a dark mode.
 * - 13.2: toggling the color mode applies the selected mode to every view
 *   (achieved here by mutating provider state, which re-themes the whole tree).
 */
import React from 'react';
import { useLeadership } from '../state/useLeadership';

export interface ThemeToggleProps {
  /** Optional extra class names for layout/styling. */
  className?: string;
}

export function ThemeToggle({
  className,
}: ThemeToggleProps): React.ReactElement {
  const { theme, toggleTheme } = useLeadership();

  const isDark = theme === 'dark';
  // The action label describes what a click will do (switch to the other mode).
  const nextMode = isDark ? 'light' : 'dark';
  const label = `Switch to ${nextMode} mode`;

  return (
    <button
      type="button"
      className={
        className
          ? `leadership-theme-toggle ${className}`
          : 'leadership-theme-toggle'
      }
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      data-theme={theme}
    >
      <span aria-hidden="true">{isDark ? '🌙' : '☀️'}</span>
      <span className="leadership-theme-toggle__text">
        {isDark ? 'Dark' : 'Light'} mode
      </span>
    </button>
  );
}

export default ThemeToggle;
