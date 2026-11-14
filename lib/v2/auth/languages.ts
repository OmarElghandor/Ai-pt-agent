/** Closed list of profile language options (00: store preference only for now). */

export const PROFILE_LANG_CODES = ['eg', 'pt-PT', 'en', 'es', 'de'] as const;

export type ProfileLangCode = (typeof PROFILE_LANG_CODES)[number];

export const DEFAULT_NATIVE_LANG: ProfileLangCode = 'eg';
export const DEFAULT_TARGET_LANG: ProfileLangCode = 'pt-PT';

/** Only these are selectable today; others stay visible but disabled. */
export const ALLOWED_NATIVE_LANGS: readonly ProfileLangCode[] = ['eg'];
export const ALLOWED_TARGET_LANGS: readonly ProfileLangCode[] = ['pt-PT'];

export const PROFILE_LANG_OPTIONS: readonly {
  value: ProfileLangCode;
  label: string;
}[] = [
  { value: 'eg', label: 'عربي مصري' },
  { value: 'pt-PT', label: 'Português' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
];

export function isProfileLangCode(value: unknown): value is ProfileLangCode {
  return (
    typeof value === 'string' &&
    (PROFILE_LANG_CODES as readonly string[]).includes(value)
  );
}

export function isNativeLangAllowed(value: unknown): value is ProfileLangCode {
  return (
    isProfileLangCode(value) &&
    (ALLOWED_NATIVE_LANGS as readonly string[]).includes(value)
  );
}

export function isTargetLangAllowed(value: unknown): value is ProfileLangCode {
  return (
    isProfileLangCode(value) &&
    (ALLOWED_TARGET_LANGS as readonly string[]).includes(value)
  );
}

export function normalizeNativeLang(value: unknown): ProfileLangCode {
  return isProfileLangCode(value) ? value : DEFAULT_NATIVE_LANG;
}

export function normalizeTargetLang(value: unknown): ProfileLangCode {
  return isProfileLangCode(value) ? value : DEFAULT_TARGET_LANG;
}
