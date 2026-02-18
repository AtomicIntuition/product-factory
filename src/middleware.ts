import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set([
  "/api/etsy/auth/start",
  "/api/etsy/auth/callback",
  "/api/auth/login",
  "/login",
]);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

function isProtectedPath(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.startsWith("/dashboard");
}

function isAuthenticated(request: NextRequest, adminKey: string): boolean {
  // Check admin_session cookie
  const sessionCookie = request.cookies.get("admin_session")?.value;
  if (sessionCookie && sessionCookie === adminKey) {
    return true;
  }

  // Check Authorization: Bearer header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === adminKey) {
      return true;
    }
  }

  // Check x-api-key header
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && apiKey === adminKey) {
    return true;
  }

  return false;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Skip non-protected paths
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // Allow public paths through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const adminKey = process.env.ADMIN_API_KEY;

  // If no ADMIN_API_KEY is set, allow all requests (local dev / backend-only mode)
  if (!adminKey) {
    return NextResponse.next();
  }

  if (isAuthenticated(request, adminKey)) {
    return NextResponse.next();
  }

  // Unauthenticated: API routes get 401, dashboard routes redirect to login
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Dashboard routes — redirect to login
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*"],
};
