/** Proxy capacity buffer — communities stop accepting new routes before hard cap */
export const PROXY_CAPACITY_BUFFER = 5;

export const CITIES = [
  "Mumbai",
  "Delhi",
  "Hyderabad",
  "Chennai",
  "Bangalore",
  "Lucknow",
  "Kolkata",
] as const;

export const LANGUAGES = [
  "Hindi",
  "Urdu",
  "English",
  "Tamil",
  "Telugu",
  "Kannada",
  "Bengali",
] as const;

export const INTERESTS = ["Hajj", "Umrah", "Both"] as const;

export type City = (typeof CITIES)[number];
export type Language = (typeof LANGUAGES)[number];
