import { NextResponse } from "next/server";
import { getStore } from "@/lib/datastore";
import { simulateOverflowLeads } from "@/lib/router";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Simulation disabled in production." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      city?: string;
      language?: string;
      interest?: "Hajj" | "Umrah" | "Both";
      count?: number;
    };

    const city = body.city ?? "Mumbai";
    const language = body.language ?? "Hindi";
    const interest = body.interest ?? "Both";
    const count = body.count ?? 10;

    const result = simulateOverflowLeads(city, language, interest, count);
    const store = getStore();

    return NextResponse.json({
      ...result,
      rejectedRoutingAttempts: store.rejectedRoutingAttempts.slice(0, 20),
      communities: store.communities.filter(
        (c) =>
          c.city.toLowerCase() === city.toLowerCase() &&
          c.language.toLowerCase() === language.toLowerCase()
      ),
    });
  } catch {
    return NextResponse.json({ error: "Simulation failed." }, { status: 500 });
  }
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Simulation disabled in production." }, { status: 403 });
  }

  const store = getStore();
  return NextResponse.json({
    rejectedRoutingAttempts: store.rejectedRoutingAttempts,
  });
}
