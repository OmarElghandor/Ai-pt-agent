/** Three-tier generation outcomes — FATAL fails the job; AUTO-FIX is silent; WARNING is stored. */

export type IssueTier = 'fatal' | 'fix' | 'warning';

export type TierIssue = {
  path: string;
  rule: string;
  message: string;
  tier: IssueTier;
};

export type JobOutcomeExtras = {
  fatals: TierIssue[];
  fixes: TierIssue[];
  warnings: TierIssue[];
  /** True when warnings remain after the single retry (or non-fatal leftovers). */
  flagged: boolean;
  retries: number;
  auto_fix_count: number;
};

export function fatal(
  path: string,
  rule: string,
  message: string,
): TierIssue {
  return { path, rule, message, tier: 'fatal' };
}

export function fix(path: string, rule: string, message: string): TierIssue {
  return { path, rule, message, tier: 'fix' };
}

export function warning(
  path: string,
  rule: string,
  message: string,
): TierIssue {
  return { path, rule, message, tier: 'warning' };
}

export function emptyExtras(retries = 0): JobOutcomeExtras {
  return {
    fatals: [],
    fixes: [],
    warnings: [],
    flagged: false,
    retries,
    auto_fix_count: 0,
  };
}

export function mergeExtras(
  ...parts: Partial<JobOutcomeExtras>[]
): JobOutcomeExtras {
  const fatals: TierIssue[] = [];
  const fixes: TierIssue[] = [];
  const warnings: TierIssue[] = [];
  let retries = 0;
  for (const p of parts) {
    if (p.fatals) fatals.push(...p.fatals);
    if (p.fixes) fixes.push(...p.fixes);
    if (p.warnings) warnings.push(...p.warnings);
    if (typeof p.retries === 'number') retries = Math.max(retries, p.retries);
  }
  return {
    fatals,
    fixes,
    warnings,
    flagged: warnings.length > 0 || fatals.length === 0 && fixes.length > 0,
    retries,
    auto_fix_count: fixes.length,
  };
}

/** Max 5 deduped lines: `path: what to change`. Never zod dumps. */
export function formatRetryHints(issues: TierIssue[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const iss of issues) {
    const line = `${iss.path}: ${iss.message}`.replace(/\s+/g, ' ').trim();
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length >= 5) break;
  }
  return lines.length ? `FIX (max 5):\n${lines.join('\n')}` : '';
}

/** Warnings for admin / job.issues — never fatals. */
export function warningsAsStrings(extras: JobOutcomeExtras): string[] {
  return extras.warnings.map((w) => `${w.rule}: ${w.path}: ${w.message}`);
}

export function progressFromExtras(extras: JobOutcomeExtras): Record<string, unknown> {
  return {
    auto_fix_count: extras.auto_fix_count,
    warnings: extras.warnings,
    retries: extras.retries,
    flagged: extras.flagged || extras.warnings.length > 0,
  };
}
