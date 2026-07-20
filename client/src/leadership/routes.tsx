/**
 * Leadership Dashboard — routing entry.
 *
 * Exposes the module as a single lazy-loaded route element for `/leadership`.
 * Lazy-loading keeps the ECharts/SheetJS bundle out of the main dashboard chunk
 * until a leader navigates to the module (design "Routing Integration").
 *
 * Consumers add this to the existing router without touching other routes, e.g.:
 *
 * ```tsx
 * import { leadershipRoute } from './leadership/routes';
 * // ...
 * <Route path="/leadership/*" element={leadershipRoute} />
 * ```
 *
 * The `/leadership/*` wildcard (or a nested `<Routes>`) lets the module own any
 * sub-paths it needs later while remaining fully isolated.
 */
import React, { Suspense } from 'react';
import { Route } from 'react-router-dom';

/**
 * Lazily-loaded module entry. Kept as `React.lazy(() => import('./leadership'))`
 * so the default export of `index.tsx` (the provider + shell) is the mounted
 * component.
 */
const LeadershipModule = React.lazy(() => import('./index'));

/** The path this module is mounted at. */
export const LEADERSHIP_PATH = '/leadership';

/**
 * The route element for `/leadership`. Wrapped in `Suspense` so the lazy chunk
 * has a fallback while it loads.
 */
export const leadershipRoute: React.ReactElement = (
  <Suspense fallback={<div className="leadership-loading">Loading Leadership Dashboard…</div>}>
    <LeadershipModule />
  </Suspense>
);

/**
 * Convenience `<Route>` for routers composed from elements. Uses a wildcard so
 * the isolated module can own its own sub-paths.
 */
export const LeadershipRoute: React.ReactElement = (
  <Route path={`${LEADERSHIP_PATH}/*`} element={leadershipRoute} />
);

export default leadershipRoute;
