import { NextResponse } from "next/server";
import { INTERESTS } from "@/lib/constants";
import { routeLead } from "@/lib/router";
import type { Interest, RouteLeadInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RouteLeadInput;

    if (
      !body.name?.trim() ||
      !body.phone?.trim() ||
      !body.city ||
      !body.language ||
      !body.interest
    ) {
      return NextResponse.json(
        { success: false, error: "All fields are required." },
        { status: 400 }
      );
    }

    if (!INTERESTS.includes(body.interest)) {
      return NextResponse.json(
        { success: false, error: "Invalid interest selection." },
        { status: 400 }
      );
    }

    const result = routeLead({
      name: body.name.trim(),
      phone: body.phone.trim(),
      city: body.city,
      language: body.language,
      interest: body.interest as Interest,
      consented: Boolean(body.consented),
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 422 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request." },
      { status: 400 }
    );
  }
}
