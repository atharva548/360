import type { DataStore } from "./types";

/** Normalize phone to last 10 digits for Indian numbers */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function isPhoneSuppressed(phone: string, store: DataStore): boolean {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  return (store.suppressedPhones ?? []).some(
    (entry) => normalizePhone(entry) === normalized
  );
}
