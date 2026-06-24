import chalk from 'chalk';
import type {
  CompliancePayload,
  ComplianceResult,
  SecurityIsolationEvent,
  SessionContext,
  StudentProfile,
  WhatsAppFallbackEvent,
} from './types.js';

/** TRAI-mandated call recording disclosure (logged verbatim for audit trail). */
const TRAI_CALL_RECORDING_DISCLOSURE =
  'This call may be recorded for quality assurance and regulatory compliance as permitted under TRAI guidelines. By continuing, you acknowledge this disclosure.';

const WHATSAPP_PARENT_CONSENT_TEMPLATE =
  'VidyaGyan: We could not process your voice query because parental consent is required for minor accounts under DPDP Act 2023. Please complete consent at https://vidyagyan.hcl.in/consent or visit your nearest VidyaGyan help center.';

/**
 * Deterministic compliance gate — executes BEFORE any LLM or TTS pipeline stage.
 *
 * Minor-Consent Trap mitigation:
 * - Eligibility is computed purely from DB flags (`isMinor`, `parentalConsent`).
 * - The LLM never sees the session when this gate fails (`llmExecutionAllowed = false`).
 * - A hard security isolation event is emitted so downstream orchestrators cannot bypass.
 */
export function evaluateCompliance(payload: CompliancePayload): ComplianceResult {
  const evaluatedAt = new Date();
  const { student, sessionId, phoneNumber } = payload;

  // ── Minor-Consent Trap: deterministic block, no LLM path ──────────────────
  if (student.isMinor && !student.parentalConsent) {
    const securityIsolationEvent: SecurityIsolationEvent = {
      eventType: 'MINOR_CONSENT_TRAP_BLOCKED',
      sessionId,
      rollId: student.rollId,
      studentName: student.name,
      reason:
        'DPDP Act 2023: Minor account lacks explicit parental consent. LLM and voice synthesis paths isolated.',
      timestamp: evaluatedAt,
    };

    const whatsAppFallback: WhatsAppFallbackEvent = {
      sessionId,
      phoneNumber,
      rollId: student.rollId,
      messageTemplate: WHATSAPP_PARENT_CONSENT_TEMPLATE,
      dispatchedAt: evaluatedAt,
    };

    logSecurityIsolation(securityIsolationEvent);
    logWhatsAppFallback(whatsAppFallback);

    return {
      passed: false,
      llmExecutionAllowed: false,
      callRecordingDisclosure: null,
      securityIsolationEvent,
      whatsAppFallback,
      evaluatedAt,
    };
  }

  // Valid session — mandatory TRAI disclosure before voice/LLM processing
  logTraiDisclosure(sessionId, TRAI_CALL_RECORDING_DISCLOSURE);

  return {
    passed: true,
    llmExecutionAllowed: true,
    callRecordingDisclosure: TRAI_CALL_RECORDING_DISCLOSURE,
    securityIsolationEvent: null,
    whatsAppFallback: null,
    evaluatedAt,
  };
}

/** Build session at call connect — caller identity unknown until verify_student_identity. */
export function buildPendingSessionContext(sessionId: string, phoneNumber: string): SessionContext {
  return {
    sessionId,
    phoneNumber,
    rollId: null,
    student: null,
    language: 'hi',
    verificationStatus: 'pending',
    compliancePassed: false,
    callRecordingDisclosureLogged: false,
    llmExecutionAllowed: true,
    startedAt: new Date(),
  };
}

/** Pin verified student + compliance outcome onto the session. */
export function applyVerifiedStudent(
  session: SessionContext,
  student: StudentProfile,
  compliance: ComplianceResult
): SessionContext {
  return {
    ...session,
    rollId: student.rollId,
    student,
    language: student.languagePreference,
    verificationStatus: compliance.passed ? 'verified' : 'blocked',
    compliancePassed: compliance.passed,
    callRecordingDisclosureLogged: compliance.callRecordingDisclosure !== null,
    llmExecutionAllowed: compliance.llmExecutionAllowed,
  };
}

/** Build an immutable session context pinned entirely to DB + compliance outcome. */
export function buildSessionContext(
  sessionId: string,
  phoneNumber: string,
  complianceResult: ComplianceResult,
  student: CompliancePayload['student']
): SessionContext {
  return {
    sessionId,
    phoneNumber,
    rollId: student.rollId,
    student,
    language: student.languagePreference,
    verificationStatus: complianceResult.passed ? 'verified' : 'blocked',
    compliancePassed: complianceResult.passed,
    callRecordingDisclosureLogged: complianceResult.callRecordingDisclosure !== null,
    llmExecutionAllowed: complianceResult.llmExecutionAllowed,
    startedAt: new Date(),
  };
}

function timestamp(): string {
  return new Date().toISOString();
}

function logTraiDisclosure(sessionId: string, disclosure: string): void {
  console.log(
    chalk.cyan(`[${timestamp()}] [TRAI]`) +
      chalk.white(` Session ${sessionId} — Mandatory call-recording disclosure logged:`)
  );
  console.log(chalk.cyanBright(`  "${disclosure}"`));
}

function logSecurityIsolation(event: SecurityIsolationEvent): void {
  console.log(
    chalk.red.bold(`[${timestamp()}] [DPDP/SECURITY ISOLATION]`) +
      chalk.red(` ${event.eventType}`)
  );
  console.log(chalk.red(`  Session: ${event.sessionId}`));
  console.log(chalk.red(`  Student: ${event.studentName} (${event.rollId})`));
  console.log(chalk.red(`  Reason:  ${event.reason}`));
  console.log(
    chalk.red.bold('  ⛔ LLM execution path BYPASSED — Minor-Consent Trap enforced at gate.')
  );
}

function logWhatsAppFallback(event: WhatsAppFallbackEvent): void {
  console.log(
    chalk.yellow.bold(`[${timestamp()}] [WHATSAPP FALLBACK]`) +
      chalk.yellow(` Dispatch queued → ${event.phoneNumber}`)
  );
  console.log(chalk.yellow(`  Roll ID: ${event.rollId}`));
  console.log(chalk.yellowBright(`  Message: "${event.messageTemplate}"`));
}

export { TRAI_CALL_RECORDING_DISCLOSURE, WHATSAPP_PARENT_CONSENT_TEMPLATE };
