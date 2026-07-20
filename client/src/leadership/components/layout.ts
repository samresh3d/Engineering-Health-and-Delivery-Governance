/**
 * Pure responsive layout resolver for the Leadership Dashboard.
 *
 * Given a viewport width (in CSS pixels) and a mobile breakpoint, this decides
 * whether views should render as a single column (stacked, mobile) or as
 * multiple columns (desktop/tablet). It is intentionally React-free, pure, and
 * total — it never throws and always returns one of the two layout literals —
 * so the responsive decision can be unit- and property-tested in isolation.
 *
 * Behavior (see design.md "Property 24", Req 13.4, 13.5):
 * - Return `'single-column'` when `viewportWidth < breakpoint`, including a
 *   viewport width of `0` (Req 13.4).
 * - Return `'multi-column'` when `viewportWidth >= breakpoint` (Req 13.5).
 */

/** The layout arrangement produced for a given viewport. */
export type LayoutMode = 'single-column' | 'multi-column';

/**
 * The default mobile breakpoint (in CSS pixels). Widths below this render as a
 * single column; widths at or above it render as multiple columns.
 */
export const DEFAULT_MOBILE_BREAKPOINT = 768;

/**
 * Resolve the layout for a viewport width against a mobile breakpoint.
 *
 * The comparison is strict-below / at-or-above so the breakpoint value itself
 * yields a multi-column layout (Req 13.5). Non-finite or negative widths are
 * clamped to `0`, which resolves to `'single-column'` for any positive
 * breakpoint (Req 13.4), keeping the function total.
 *
 * @param viewportWidth The viewport width in CSS pixels (0 or greater).
 * @param breakpoint    The mobile breakpoint in CSS pixels. Defaults to
 *                      {@link DEFAULT_MOBILE_BREAKPOINT}.
 * @returns `'single-column'` when below the breakpoint, otherwise
 *          `'multi-column'`.
 */
export function resolveLayout(
  viewportWidth: number,
  breakpoint: number = DEFAULT_MOBILE_BREAKPOINT
): LayoutMode {
  // Normalize the width to a finite, non-negative number so the resolver stays
  // total for NaN/Infinity/negative inputs (all treated as the narrowest, 0).
  const width =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;

  return width < breakpoint ? 'single-column' : 'multi-column';
}
