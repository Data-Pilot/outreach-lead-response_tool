/**
 * Defaults for Strategic Identity → Enhance reference uploads.
 * Server reads env overrides in `api/outreach-config/enhance/route.ts`.
 * Client uses these for instant validation (restart dev after changing server env).
 */
export const STRATEGIC_ENHANCE_DEFAULTS = {
  maxFiles: 5,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 2 * 1024 * 1024,
} as const;
