export type V2UserRole = 'learner' | 'admin';
export type V2UserGender = 'm' | 'f';

export type V2User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: V2UserRole;
  gender: V2UserGender | null;
  onboarded_at: Date | string | null;
  langify_user_id: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function normalizeGender(value: unknown): V2UserGender | null {
  if (value === 'm' || value === 'f') return value;
  return null;
}

export function normalizeRole(value: unknown): V2UserRole {
  return value === 'admin' ? 'admin' : 'learner';
}
