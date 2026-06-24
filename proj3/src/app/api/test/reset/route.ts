import { NextResponse } from "next/server";
import { resetStore } from "@/lib/datastore";

/** Dev/test-only endpoint to reset in-memory state between automated test runs */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production." }, { status: 403 });
  }

  resetStore();
  return NextResponse.json({ ok: true });
}
