/** Supported voice / UI language codes for the VidyaGyan pipeline. */
export type LanguageCode = 'hi' | 'en';

/** Caller identity verification state for inbound calls. */
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'blocked';

/** Active inbound call session. Student is null until verify_student_identity succeeds. */
export interface SessionContext {
  sessionId: string;
  /** Simulated inbound CLI — any number may call. */
  phoneNumber: string;
  rollId: string | null;
  student: StudentProfile | null;
  language: LanguageCode;
  verificationStatus: VerificationStatus;
  compliancePassed: boolean;
  callRecordingDisclosureLogged: boolean;
  llmExecutionAllowed: boolean;
  startedAt: Date;
}

/** Immutable student record shape — sole source of truth for grounded responses. */
export interface StudentProfile {
  rollId: string;
  name: string;
  phoneNumber: string;
  district: string;
  state: string;
  examCenter: string;
  examCenterAddress: string;
  admitCardAvailable: boolean;
  admitCardDownloadUrl: string | null;
  examDate: string;
  reportingTime: string;
  examEndTime: string;
  scheduleNotes: string;
  registrationStatus: 'confirmed' | 'pending' | 'incomplete';
  registeredAt: string;
  eligibilityStatus: 'eligible' | 'pending_review' | 'not_eligible';
  eligibilityNotes: string;
  languagePreference: LanguageCode;
  isMinor: boolean;
  parentalConsent: boolean;
}

/** Single conversational turn within a voice session. */
export interface VoiceTurn {
  turnId: string;
  sessionId: string;
  userQuery: string;
  agentResponse: string;
  language: LanguageCode;
  latencyMs: number;
  latencyWithinTarget: boolean;
  interrupted: boolean;
  groundedFieldsUsed: (keyof StudentProfile)[];
  timestamp: Date;
}

/** Simulated streaming audio buffer (Gemini Live / Sarvam Indic Voice bridge). */
export interface AudioStreamBuffer {
  bufferId: string;
  sessionId: string;
  chunks: string[];
  language: LanguageCode;
  isPlaying: boolean;
  playbackPosition: number;
  truncatedAt: number | null;
  totalDurationMs: number;
}

/** Payload handed to the compliance gate after identity verification. */
export interface CompliancePayload {
  sessionId: string;
  phoneNumber: string;
  rollId?: string;
  student: StudentProfile;
}

/** Result of deterministic compliance evaluation — no LLM involvement. */
export interface ComplianceResult {
  passed: boolean;
  llmExecutionAllowed: boolean;
  callRecordingDisclosure: string | null;
  securityIsolationEvent: SecurityIsolationEvent | null;
  whatsAppFallback: WhatsAppFallbackEvent | null;
  evaluatedAt: Date;
}

export interface SecurityIsolationEvent {
  eventType: 'MINOR_CONSENT_TRAP_BLOCKED';
  sessionId: string;
  rollId: string;
  studentName: string;
  reason: string;
  timestamp: Date;
}

export interface WhatsAppFallbackEvent {
  sessionId: string;
  phoneNumber: string;
  rollId: string;
  messageTemplate: string;
  dispatchedAt: Date;
}

export interface LatencyMetrics {
  turnId: string;
  dbLookupMs: number;
  complianceMs: number;
  groundingMs: number;
  ttsFormatMs: number;
  totalMs: number;
  withinTarget: boolean;
  targetMs: number;
}

export function isSessionVerified(ctx: SessionContext): boolean {
  return ctx.verificationStatus === 'verified' && ctx.student !== null;
}
