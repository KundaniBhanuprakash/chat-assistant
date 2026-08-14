import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Production is the default: the app always loads the local `dist/` build.
 *
 * Live reload is opt-in and only ever applied when BOTH conditions hold:
 *   - CAP_LIVE_RELOAD_URL is set in the shell running `npx cap sync`
 *   - NODE_ENV is not "production"
 * A store/release build never sets these, so no remote URL can leak into it.
 */
const liveReloadUrl = process.env.CAP_LIVE_RELOAD_URL;
const isProduction = process.env.NODE_ENV === 'production';
const useLiveReload = Boolean(liveReloadUrl) && !isProduction;

const config: CapacitorConfig = {
  appId: 'app.lovable.d0825e51a3d242d0b0b266bd4711c220',
  appName: 'Context Talk Agent',
  webDir: 'dist',
  ...(useLiveReload
    ? { server: { url: liveReloadUrl, cleartext: true } }
    : {}),
};

export default config;
