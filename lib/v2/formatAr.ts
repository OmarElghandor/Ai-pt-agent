/** Eastern Arabic-Indic digits for UI counts (١٥ not 15). */
export function toArDigits(n: number | string): string {
  const s = String(n);
  return s.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!);
}
