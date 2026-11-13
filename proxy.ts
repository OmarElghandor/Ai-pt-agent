import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Early redirect only. Real auth is enforced by getCurrentV2User / requireV2*
 * inside each route and page. Never rely on proxy alone.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isRoot = pathname === '/';
  const isV2Page =
    isRoot ||
    pathname.startsWith('/path') ||
    pathname.startsWith('/day') ||
    pathname.startsWith('/cards') ||
    pathname.startsWith('/library') ||
    pathname.startsWith('/me') ||
    pathname.startsWith('/talk') ||
    pathname.startsWith('/topics') ||
    pathname.startsWith('/practice') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/v2-admin') ||
    pathname.startsWith('/v2-dev');

  const isPublicV2 =
    pathname === '/sign-in' ||
    pathname.startsWith('/sign-in/') ||
    pathname === '/privacy' ||
    pathname.startsWith('/privacy/');

  if (!isV2Page || isPublicV2) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set(
      'next',
      isRoot ? '/path' : pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/path/:path*',
    '/day/:path*',
    '/cards/:path*',
    '/library/:path*',
    '/me/:path*',
    '/talk/:path*',
    '/topics/:path*',
    '/practice/:path*',
    '/onboarding/:path*',
    '/v2-admin/:path*',
    '/v2-dev/:path*',
  ],
};
