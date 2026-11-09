import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/v2/auth';

export const { GET, POST } = toNextJsHandler(auth);
