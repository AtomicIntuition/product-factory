import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return NextResponse.json(
      { error: "Auth not configured" },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const { password } = body as { password?: string };

    if (!password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const valid =
      password.length === adminKey.length &&
      timingSafeEqual(Buffer.from(password), Buffer.from(adminKey));

    if (!valid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set("admin_session", adminKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
