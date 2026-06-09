import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_ROUTES = ["/invoices", "/billing", "/settings", "/onboarding"];
const AUTH_ROUTES = ["/login", "/auth"];

function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const hasSbCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));

  // Not logged in → block protected routes
  if (isProtectedRoute(pathname) && !hasSbCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already logged in → prevent going back to login/signup
  if (isAuthRoute(pathname) && hasSbCookie) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/auth/:path*",
    "/login",
    "/signup",
    "/billing/:path*",
    "/settings/:path*",
    "/invoices/:path*",
    "/onboarding/:path*",
  ],
};