import { generateId, getStore } from "./datastore";
import { isMockInviteLink, isValidWhatsAppInviteLink } from "./invite-links";
import type { Community, CreateCommunityInput, Interest } from "./types";

function interestMatches(a: Interest, b: Interest): boolean {
  if (a === "Both" || b === "Both") {
    return true;
  }
  return a === b;
}

function slugSegment(value: string): string {
  return value.replace(/\s+/g, "");
}

function buildPlaceholderInviteLink(
  city: string,
  language: string,
  interest: Interest,
  suffix: string
): string {
  const code = `Invite${slugSegment(city)}${slugSegment(language)}${slugSegment(interest)}${suffix}`;
  return `https://chat.whatsapp.com/${code}`;
}

function findPendingPlaceholder(input: CreateCommunityInput): Community | undefined {
  const store = getStore();
  return store.communities.find(
    (c) =>
      c.city.toLowerCase() === input.city.toLowerCase() &&
      c.language.toLowerCase() === input.language.toLowerCase() &&
      interestMatches(c.interest, input.interest) &&
      c.status === "Pending Invite"
  );
}

const DEFAULT_PROXY_CAPACITY = 40;

export function updateCommunityInviteLink(
  communityId: string,
  inviteLink: string
): { success: true; community: Community } | { success: false; error: string } {
  const trimmed = inviteLink.trim();

  if (!isValidWhatsAppInviteLink(trimmed)) {
    return {
      success: false,
      error: "Invite link must be a valid https://chat.whatsapp.com/… URL.",
    };
  }

  const store = getStore();
  const community = store.communities.find((c) => c.id === communityId);

  if (!community) {
    return { success: false, error: "Community not found." };
  }

  community.inviteLink = trimmed;
  if (community.status === "Pending Invite" && !isMockInviteLink(trimmed)) {
    community.status = "Active";
  }
  return { success: true, community };
}

export function listCommunities(): Community[] {
  return getStore().communities;
}

export function createCommunityFromSegment(
  input: CreateCommunityInput
): { success: true; community: Community; created: boolean } | { success: false; error: string } {
  const city = input.city?.trim();
  const language = input.language?.trim();
  const interest = input.interest;

  if (!city || !language || !interest) {
    return { success: false, error: "city, language, and interest are required." };
  }

  const existing = findPendingPlaceholder({ city, language, interest });
  if (existing) {
    return { success: true, community: existing, created: false };
  }

  const store = getStore();
  const segmentCount = store.communities.filter(
    (c) =>
      c.city.toLowerCase() === city.toLowerCase() &&
      c.language.toLowerCase() === language.toLowerCase() &&
      interestMatches(c.interest, interest)
  ).length;

  const suffix = String(segmentCount + 1).padStart(2, "0");
  const community: Community = {
    id: generateId("comm"),
    name: `Atlas ${city} — ${interest} Pilgrims (${language})`,
    city,
    language,
    interest,
    proxyCapacity: DEFAULT_PROXY_CAPACITY,
    currentCount: 0,
    inviteLink: buildPlaceholderInviteLink(city, language, interest, suffix),
    status: "Pending Invite",
  };

  store.communities.push(community);
  return { success: true, community, created: true };
}
