import { describe, expect, it } from "vitest";
import { isMockInviteLink, isValidWhatsAppInviteLink } from "./invite-links";

describe("isMockInviteLink", () => {
  it("flags readable seed placeholder links as mock", () => {
    expect(isMockInviteLink("https://chat.whatsapp.com/InviteMumbaiHindi02")).toBe(true);
  });

  it("accepts opaque WhatsApp invite hashes as real", () => {
    expect(isMockInviteLink("https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrSt")).toBe(false);
  });
});

describe("isValidWhatsAppInviteLink", () => {
  it("accepts chat.whatsapp.com URLs", () => {
    expect(isValidWhatsAppInviteLink("https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrSt")).toBe(true);
  });

  it("rejects non-WhatsApp URLs", () => {
    expect(isValidWhatsAppInviteLink("https://example.com/group")).toBe(false);
  });
});
