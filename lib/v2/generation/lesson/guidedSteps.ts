import type { Page } from '@/lib/v2/content/page';

function blockIndexFromTarget(target: string): number | null {
  const m = /^b(\d+)/i.exec(target.trim());
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Ensure guided step targets follow block order.
 * A recap (dip to an earlier block) is allowed only as the last step.
 * Auto-reorders when possible; leftover mid-page dips become warnings.
 */
export function reorderGuidedSteps(page: Page): {
  page: Page;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (page.mode !== 'guided' || !page.steps?.length) {
    return { page, warnings };
  }

  const steps = [...page.steps];
  const indexed = steps.map((step, i) => ({
    step,
    i,
    bi: blockIndexFromTarget(step.target),
  }));

  // Find forward sequence: non-decreasing block index from start.
  let maxSeen = -1;
  const forward: typeof indexed = [];
  const recaps: typeof indexed = [];
  for (const row of indexed) {
    if (row.bi == null) {
      forward.push(row);
      continue;
    }
    if (row.bi >= maxSeen) {
      maxSeen = row.bi;
      forward.push(row);
    } else {
      recaps.push(row);
    }
  }

  if (recaps.length === 0) {
    return { page, warnings };
  }

  // Keep at most one recap as the last step; drop extras with warning.
  const lastRecap = recaps[recaps.length - 1]!;
  if (recaps.length > 1) {
    warnings.push(
      `guided_recap: moved ${recaps.length} out-of-order steps; kept one recap as last`,
    );
  } else {
    warnings.push('guided_recap: moved recap step to end');
  }

  const nextSteps = [...forward.map((r) => r.step), lastRecap.step];
  return {
    page: { ...page, steps: nextSteps },
    warnings,
  };
}

/** Validate after reorder: at most one trailing recap. */
export function checkGuidedBlockOrder(page: Page): string[] {
  const issues: string[] = [];
  if (page.mode !== 'guided' || !page.steps?.length) return issues;
  let maxSeen = -1;
  for (let i = 0; i < page.steps.length; i++) {
    const bi = blockIndexFromTarget(page.steps[i]!.target);
    if (bi == null) continue;
    if (bi < maxSeen) {
      if (i !== page.steps.length - 1) {
        issues.push(
          `step ${i} target b${bi} recap mid-page (only last step may recap)`,
        );
      }
    } else {
      maxSeen = bi;
    }
  }
  return issues;
}
