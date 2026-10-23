/** v2 product shell — off unless explicitly enabled. */
export function isV2Enabled(): boolean {
  return process.env.V2_ENABLED === 'true';
}

/** Component gallery — allowed in non-production, or when V2_DEV=true. */
export function isV2DevAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.V2_DEV === 'true';
}
