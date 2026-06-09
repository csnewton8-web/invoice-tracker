import { type NextRequest, NextResponse } from "next/server";

const PROTECTED_ROUTES = ["/invoices", "/billing"];
const AUTH_ROUTES = ["/login", "/signup", "/auth"];

function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const hasSbCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));

  if (isProtectedRoute(pathname) && !hasSbCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute(pathname) && hasSbCookie) {
    return NextResponse.redirect(new URL("/invoices", request.url));
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
    "/invoices/:path*",
  ],
};