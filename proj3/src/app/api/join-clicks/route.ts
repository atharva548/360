import { NextResponse } from "next/server";
import { listJoinClicks, logJoinClick } from "@/lib/join-clicks";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ joinClickLog: listJoinClicks() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      leadId?: string;
      isDemoPreview?: boolean;
    };

    if (!body.leadId?.trim()) {
      return NextResponse.json(
        { success: false, error: "leadId is required." },
        { status: 400 }
      );
    }

    const result = logJoinClick({
      leadId: body.leadId,
      isDemoPreview: Boolean(body.isDemoPreview),
    });

    if (!result.success) {
      return NextResponse.json(result, { status: result.error.includes("not found") ? 404 : 422 });
    }

    return NextResponse.json({ success: true, event: result.event });
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }
}
