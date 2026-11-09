/**
 * Shared Arabic normalisation for side-channel matching (classify, topic
 * request, CTA yes/no). Fold hamza/alef variants, ya/alef maqsura, ta marbuta,
 * strip tashkeel/tatweel, map Arabic-Indic digits to Latin.
 */
export function normalizeAr(s: string): string {
  return s
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '') // tashkeel + dagger alef
    .replace(/\u0640/g, '') // tatweel
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[؟?]/g, '')
    .toLowerCase();
}
