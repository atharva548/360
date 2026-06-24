import { PROXY_CAPACITY_BUFFER } from "./constants";
import { generateId, getStore } from "./datastore";
import { isPhoneSuppressed } from "./suppression";
import type {
  Community,
  Interest,
  RejectedRoutingAttempt,
  RouteLeadInput,
  RouteLeadResult,
} from "./types";

function interestMatches(communityInterest: Interest, leadInterest: Interest): boolean {
  if (communityInterest === "Both" || leadInterest === "Both") {
    return true;
  }
  return communityInterest === leadInterest;
}

function isEligible(community: Community): boolean {
  if (
    community.status === "Full" ||
    community.status === "Paused" ||
    community.status === "Privacy Risk" ||
    community.status === "Pending Invite"
  ) {
    return false;
  }
  const threshold = community.proxyCapacity - PROXY_CAPACITY_BUFFER;
  return community.currentCount < threshold;
}

function logRejection(
  input: RouteLeadInput,
  reason: string
): RejectedRoutingAttempt {
  const store = getStore();
  const attempt: RejectedRoutingAttempt = {
    id: generateId("reject"),
    name: input.name,
    phone: input.phone,
    city: input.city,
    language: input.language,
    interest: input.interest,
    reason,
    timestamp: new Date().toISOString(),
  };
  store.rejectedRoutingAttempts.unshift(attempt);
  return attempt;
}

/** Deterministic router: segment match → skip ineligible → best proxy capacity */
export function routeLead(input: RouteLeadInput): RouteLeadResult {
  const store = getStore();

  if (!input.consented) {
    logRejection(input, "Consent not provided — routing blocked for compliance");
    return { success: false, error: "Consent is required to join a community." };
  }

  if (isPhoneSuppressed(input.phone, store)) {
    logRejection(input, "Phone on suppression list — opt-out honored");
    return {
      success: false,
      error:
        "This number has opted out of Atlas Travels communications. Contact support if this is an error.",
    };
  }

  const segmentMatches = store.communities.filter(
    (c) =>
      c.city.toLowerCase() === input.city.toLowerCase() &&
      c.language.toLowerCase() === input.language.toLowerCase() &&
      interestMatches(c.interest, input.interest)
  );

  if (segmentMatches.length === 0) {
    logRejection(
      input,
      `No community found for ${input.city} / ${input.language} / ${input.interest}`
    );
    return {
      success: false,
      error: `No community available for ${input.city} (${input.language}, ${input.interest}). Our team will contact you shortly.`,
    };
  }

  const eligible = segmentMatches.filter(isEligible);

  if (eligible.length === 0) {
    const allPaused = segmentMatches.every((c) => c.status === "Paused");
    const privacyBlocked = segmentMatches.every((c) => c.status === "Privacy Risk");
    const allFull = segmentMatches.every(
      (c) =>
        c.status === "Full" ||
        c.currentCount >= c.proxyCapacity - PROXY_CAPACITY_BUFFER
    );
    const allPendingInvite = segmentMatches.every((c) => c.status === "Pending Invite");

    let reason = "All matching communities at proxy capacity";
    if (allPaused) {
      reason = "Matching communities paused — routing suspended by operator";
    } else if (privacyBlocked) {
      reason = "Matching communities flagged Privacy Risk — routing suspended";
    } else if (allPendingInvite) {
      reason = `Community slot exists for ${input.city} / ${input.language} / ${input.interest} — awaiting operator invite link`;
    } else if (allFull) {
      reason = "All matching communities at or near proxy capacity";
    } else if (segmentMatches.some((c) => c.status === "Paused")) {
      reason = "Matching communities paused or at capacity";
    }

    logRejection(input, reason);
    return {
      success: false,
      error:
        "All communities in your segment are currently full. Please try again later or contact Atlas Travels support.",
    };
  }

  const best = eligible.sort((a, b) => a.currentCount - b.currentCount)[0];

  best.currentCount += 1;

  if (best.currentCount >= best.proxyCapacity) {
    best.status = "Full";
  }

  const lead = {
    id: generateId("lead"),
    name: input.name,
    phone: input.phone,
    city: input.city,
    language: input.language,
    interest: input.interest,
    consented: input.consented,
    routedCommunityId: best.id,
    timestamp: new Date().toISOString(),
  };

  store.leads.unshift(lead);

  return { success: true, lead, community: best };
}

/** Bulk-register dummy leads for simulation testing */
export function simulateOverflowLeads(
  city: string,
  language: string,
  interest: Interest,
  count: number
): { routed: number; rejected: number; attempts: RejectedRoutingAttempt[] } {
  let routed = 0;
  let rejected = 0;
  const attempts: RejectedRoutingAttempt[] = [];

  for (let i = 0; i < count; i++) {
    const result = routeLead({
      name: `SimUser ${i + 1}`,
      phone: `+91900000${String(i + 1).padStart(4, "0")}`,
      city,
      language,
      interest,
      consented: true,
    });

    if (result.success) {
      routed += 1;
    } else {
      rejected += 1;
      const latest = getStore().rejectedRoutingAttempts[0];
      if (latest) attempts.push(latest);
    }
  }

  return { routed, rejected, attempts };
}
