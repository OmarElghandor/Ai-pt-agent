/**
 * Role-play (Module A) days with a real task. Conversations v3:
 * start with day 33 only; later café/pharmacy/shop/appointment/tickets.
 */
export const ROLE_PLAY_DAYS: readonly number[] = [33];

export function isRolePlayDay(day: number): boolean {
  return ROLE_PLAY_DAYS.includes(day);
}

/** Greeting / non-task days must not appear as role-play packs. */
export function isGreetingStyleDay(day: number): boolean {
  return day === 1 || day === 2;
}
