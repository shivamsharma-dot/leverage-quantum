import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Vite's default modulePreload injects a <link rel="modulepreload"> for every
    // chunk reachable from the entry -- for a single-entry SPA where App.jsx holds a
    // React.lazy()/dynamic import() for every one of ~40 dashboard pages, that means
    // every page's chunk eagerly preloads on every page load, regardless of which one
    // route is actually rendered. Confirmed live: 55 modulepreload tags firing on a
    // single form page, ~1.9MB of the ~2.3MB downloaded JS unrelated to that route
    // (the Recharts core alone is 360KB, loaded on a page with no charts). Disabling
    // it does not disable lazy-loading itself -- React.lazy()'s own dynamic import()
    // still fetches a route's chunk the moment it's actually needed, exactly as
    // before; this only removes the *eager, unconditional* hint that undid the
    // point of splitting the routes in the first place. The one real tradeoff:
    // a route's chunk now starts fetching on first navigation to it instead of
    // being pre-warmed, so the first click into a page not yet visited this
    // session is marginally slower -- worth it against loading unrelated
    // multi-hundred-KB chart/settings/other-dashboard code on every single load.
    modulePreload: false,
  },
})


