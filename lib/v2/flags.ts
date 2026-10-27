function envFlagTrue(name: string): boolean {
  const raw = process.env[name]?.trim();
  if (!raw) return false;
  // tolerate quoted values from .env (V2_ENABLED="true")
  const v = raw.replace(/^['"]|['"]$/g, '').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function envFlagFalse(name: string): boolean {
  const raw = process.env[name]?.trim();
  if (!raw) return false;
  const v = raw.replace(/^['"]|['"]$/g, '').toLowerCase();
  return v === 'false' || v === '0' || v === 'no';
}

/** v2 product shell — off unless explicitly enabled. */
export function isV2Enabled(): boolean {
  return envFlagTrue('V2_ENABLED');
}

/** Component gallery — allowed in non-production, or when V2_DEV=true. */
export function isV2DevAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || envFlagTrue('V2_DEV');
}

/**
 * Image generation during / after lesson text gen.
 * Default OFF — image_spec is still stored on pages for later.
 * Set GENERATE_IMAGES=true to enable.
 */
export function isGenerateImagesEnabled(): boolean {
  if (envFlagFalse('GENERATE_IMAGES')) return false;
  if (!process.env.GENERATE_IMAGES?.trim()) return false;
  return envFlagTrue('GENERATE_IMAGES');
}
