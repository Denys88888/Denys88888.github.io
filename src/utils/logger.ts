// Lightweight browser logger. (Winston is a Node-only logger and can't run in the
// browser, so the frontend uses this small wrapper instead of raw console.* calls.)
// Silenced in production builds except for errors.
const isProd = import.meta.env.PROD;

export const logger = {
  info(message: string, ...meta: unknown[]): void {
    if (!isProd) console.info(`[info] ${message}`, ...meta);
  },
  warn(message: string, ...meta: unknown[]): void {
    if (!isProd) console.info(`[warn] ${message}`, ...meta);
  },
  error(message: string, ...meta: unknown[]): void {
    // Errors are always surfaced so field issues are diagnosable.
    console.error(`[error] ${message}`, ...meta);
  },
};
