/** Real WhatsApp invite codes are opaque hashes, not our seed slugs like InviteMumbaiHindi01 */
const REAL_INVITE_PATTERN =
  /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{15,30}$/;

export function isMockInviteLink(link: string): boolean {
  const trimmed = link.trim();
  if (!trimmed.startsWith("https://chat.whatsapp.com/")) {
    return true;
  }

  const code = trimmed.replace("https://chat.whatsapp.com/", "");

  if (/^Invite/i.test(code)) {
    return true;
  }

  return !REAL_INVITE_PATTERN.test(trimmed);
}

export function isValidWhatsAppInviteLink(link: string): boolean {
  const trimmed = link.trim();
  return (
    trimmed.startsWith("https://chat.whatsapp.com/") &&
    trimmed.length > "https://chat.whatsapp.com/".length
  );
}
