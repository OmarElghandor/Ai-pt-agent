/**
 * Legacy Module A role-play days on the learn topics list.
 * Role-play v1 situations live at `/roleplay` — day 33 stays reachable
 * from admin / pack routes only.
 */
export const ROLE_PLAY_DAYS: readonly number[] = [];

export function isRolePlayDay(day: number): boolean {
  return ROLE_PLAY_DAYS.includes(day);
}

/** Greeting / non-task days must not appear as role-play packs. */
export function isGreetingStyleDay(day: number): boolean {
  return day === 1 || day === 2;
}
