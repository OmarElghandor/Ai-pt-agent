/**
 * Per-user / global daily caps for custom-deck generation (12 §2.8).
 * Plans later only change this function.
 */

export type QuotaUser = {
  id: string;
  /** Reserved for future plan-based limits. */
  plan?: string | null;
};

export type QuotaSnapshot = {
  userLimit: number;
  userUsed: number;
  userRemaining: number;
  globalLimit: number | null;
  globalUsed: number;
  allowed: boolean;
  reason?: 'user_cap' | 'global_cap';
};

export function customDeckDailyLimitFromEnv(): number {
  const raw = process.env.CUSTOM_DECK_DAILY_LIMIT?.trim();
  const n = raw ? Number(raw) : 3;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3;
}

export function customDeckGlobalDailyLimitFromEnv(): number | null {
  const raw = process.env.CUSTOM_DECK_GLOBAL_DAILY_LIMIT?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** Single choke point for plan changes later. */
export function customDeckQuota(
  _user: QuotaUser,
  opts: {
    userUsed: number;
    globalUsed: number;
    userLimit?: number;
    globalLimit?: number | null;
  },
): QuotaSnapshot {
  const userLimit = opts.userLimit ?? customDeckDailyLimitFromEnv();
  const globalLimit =
    opts.globalLimit === undefined
      ? customDeckGlobalDailyLimitFromEnv()
      : opts.globalLimit;
  const userUsed = opts.userUsed;
  const globalUsed = opts.globalUsed;
  const userRemaining = Math.max(0, userLimit - userUsed);

  if (userUsed >= userLimit) {
    return {
      userLimit,
      userUsed,
      userRemaining: 0,
      globalLimit,
      globalUsed,
      allowed: false,
      reason: 'user_cap',
    };
  }
  if (globalLimit != null && globalUsed >= globalLimit) {
    return {
      userLimit,
      userUsed,
      userRemaining,
      globalLimit,
      globalUsed,
      allowed: false,
      reason: 'global_cap',
    };
  }
  return {
    userLimit,
    userUsed,
    userRemaining,
    globalLimit,
    globalUsed,
    allowed: true,
  };
}
