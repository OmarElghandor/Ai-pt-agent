import {
  loadUserProgress,
  type KnownProgress,
} from '@/lib/mongo/userProgress';

type CacheEntry = {
  learnerId: string;
  known: KnownProgress;
  at: number;
};

let cache: CacheEntry | null = null;
const TTL_MS = 60_000;

export async function warmKnownCache(learnerId: string): Promise<KnownProgress | null> {
  const known = await loadUserProgress(learnerId);
  if (known) {
    cache = { learnerId, known, at: Date.now() };
  }
  return known;
}

export function getKnownCache(learnerId?: string): KnownProgress | null {
  if (!cache) return null;
  if (learnerId && cache.learnerId !== learnerId) return null;
  if (Date.now() - cache.at > TTL_MS) return null;
  return cache.known;
}

export function clearKnownCache(): void {
  cache = null;
}
