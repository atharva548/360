import { generateId, getStore } from "./datastore";
import type { JoinClickEvent } from "./types";

export function logJoinClick(input: {
  leadId: string;
  isDemoPreview: boolean;
}): { success: true; event: JoinClickEvent } | { success: false; error: string } {
  const store = getStore();
  if (!store.joinClickLog) {
    store.joinClickLog = [];
  }

  const lead = store.leads.find((l) => l.id === input.leadId);

  if (!lead) {
    return { success: false, error: "Lead not found." };
  }

  if (!lead.routedCommunityId) {
    return { success: false, error: "Lead was not routed to a community." };
  }

  const community = store.communities.find((c) => c.id === lead.routedCommunityId);

  if (!community) {
    return { success: false, error: "Community not found." };
  }

  const event: JoinClickEvent = {
    id: generateId("join-click"),
    leadId: lead.id,
    leadName: lead.name,
    phone: lead.phone,
    communityId: community.id,
    communityName: community.name,
    city: lead.city,
    language: lead.language,
    interest: lead.interest,
    inviteLink: community.inviteLink,
    isDemoPreview: input.isDemoPreview,
    timestamp: new Date().toISOString(),
  };

  store.joinClickLog.unshift(event);
  return { success: true, event };
}

export function listJoinClicks(): JoinClickEvent[] {
  return getStore().joinClickLog;
}
