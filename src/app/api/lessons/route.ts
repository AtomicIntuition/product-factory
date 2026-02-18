import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getLessons, deleteLesson, updateLesson } from "@/lib/supabase/queries";

const LessonStatusEnum = z.enum(["active", "archived"]);

const GetQuerySchema = z.object({
  status: LessonStatusEnum.optional(),
});

const DeleteQuerySchema = z.object({
  id: z.string().uuid(),
});

const PatchBodySchema = z.object({
  id: z.string().uuid(),
  status: LessonStatusEnum,
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = GetQuerySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const lessons = await getLessons(parsed.data.status);
    return NextResponse.json(lessons);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = DeleteQuerySchema.safeParse({
      id: searchParams.get("id") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid id parameter", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await deleteLesson(parsed.data.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parsed = PatchBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updated = await updateLesson(parsed.data.id, { status: parsed.data.status });
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
