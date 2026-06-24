import { NextResponse } from "next/server";
import {
  createCommunityFromSegment,
  listCommunities,
  updateCommunityInviteLink,
} from "@/lib/communities";
import { getStore } from "@/lib/datastore";
import { isMockInviteLink } from "@/lib/invite-links";
import type { Interest } from "@/lib/types";

export async function GET() {
  const store = getStore();
  return NextResponse.json({
    communities: store.communities,
    leads: store.leads,
    dispatchTasks: store.dispatchTasks,
    rejectedRoutingAttempts: store.rejectedRoutingAttempts,
    joinClickLog: store.joinClickLog,
  });
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      communityId?: string;
      inviteLink?: string;
    };

    if (!body.communityId?.trim() || !body.inviteLink?.trim()) {
      return NextResponse.json(
        { success: false, error: "communityId and inviteLink are required." },
        { status: 400 }
      );
    }

    const result = updateCommunityInviteLink(body.communityId, body.inviteLink);

    if (!result.success) {
      return NextResponse.json(result, { status: result.error.includes("not found") ? 404 : 422 });
    }

    return NextResponse.json({
      success: true,
      community: result.community,
      isMock: isMockInviteLink(result.community.inviteLink),
    });
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }
}

/** Operator-only listing with mock/real status */
export async function POST() {
  const communities = listCommunities().map((community) => ({
    ...community,
    isMockInvite: isMockInviteLink(community.inviteLink),
  }));

  return NextResponse.json({ communities });
}

/** Create a placeholder community row for a rejected segment */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      city?: string;
      language?: string;
      interest?: Interest;
    };

    if (!body.city?.trim() || !body.language?.trim() || !body.interest) {
      return NextResponse.json(
        { success: false, error: "city, language, and interest are required." },
        { status: 400 }
      );
    }

    const result = createCommunityFromSegment({
      city: body.city,
      language: body.language,
      interest: body.interest,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      community: result.community,
      created: result.created,
      isMock: isMockInviteLink(result.community.inviteLink),
    });
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }
}
