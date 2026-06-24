import { Type, type FunctionDeclaration } from '@google/genai';
import type { LanguageCode, SessionContext, StudentProfile } from './types.js';
import { isSessionVerified } from './types.js';

export const VERIFY_STUDENT_TOOL: FunctionDeclaration = {
  name: 'verify_student_identity',
  description:
    'Call IMMEDIATELY when the caller states their name. Checks the VidyaGyan student registry. Required before any other tool.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'Full or first name as spoken by the caller' },
      rollId: { type: Type.STRING, description: 'Optional roll ID if the caller also provided it' },
    },
    required: ['name'],
  },
};

/** Runtime tool handlers — sole source of variable student facts during a call. */
export const STUDENT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_admit_card_status',
    description:
      'Returns admit card availability and download URL for the verified caller. Call when asked about admit card, hall ticket, or प्रवेश पत्र.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] },
  },
  {
    name: 'get_exam_center',
    description:
      'Returns exam center name and full address. Call when asked about exam center, centre, or परीक्षा केंद्र.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] },
  },
  {
    name: 'get_exam_schedule',
    description:
      'Returns exam date, reporting time, and schedule notes. Call when asked about exam date, time, schedule, or समय.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] },
  },
  {
    name: 'get_registration_status',
    description:
      'Returns registration status for the lateral admission exam. Call when asked about registration or पंजीकरण.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] },
  },
  {
    name: 'get_eligibility_status',
    description:
      'Returns eligibility outcome and criteria summary. Call when asked about eligibility or पात्रता.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] },
  },
  {
    name: 'get_roll_id',
    description: 'Returns the student roll ID. Call when asked about roll number or रोल.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] },
  },
];

/** All tools exposed on the Live session (verify first, then student lookups). */
export const LIVE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  VERIFY_STUDENT_TOOL,
  ...STUDENT_TOOL_DECLARATIONS,
];

export type StudentToolName =
  | 'get_admit_card_status'
  | 'get_exam_center'
  | 'get_exam_schedule'
  | 'get_registration_status'
  | 'get_eligibility_status'
  | 'get_roll_id';

export interface ToolExecutionResult {
  tool: StudentToolName;
  data: Record<string, unknown>;
  fieldsUsed: (keyof StudentProfile)[];
  lookupMs: number;
}

/** Execute a student lookup tool — requires verified session with pinned student. */
export function executeStudentTool(
  session: SessionContext,
  toolName: string
): ToolExecutionResult {
  const start = performance.now();

  if (!isSessionVerified(session) || !session.student) {
    return {
      tool: 'get_roll_id',
      data: { error: 'Caller not verified. Call verify_student_identity first.' },
      fieldsUsed: [],
      lookupMs: performance.now() - start,
    };
  }

  const student = session.student;
  const name = toolName as StudentToolName;

  switch (name) {
    case 'get_admit_card_status':
      return {
        tool: name,
        data: {
          rollId: student.rollId,
          admitCardAvailable: student.admitCardAvailable,
          admitCardDownloadUrl: student.admitCardDownloadUrl,
        },
        fieldsUsed: ['rollId', 'admitCardAvailable', 'admitCardDownloadUrl'],
        lookupMs: performance.now() - start,
      };

    case 'get_exam_center':
      return {
        tool: name,
        data: {
          rollId: student.rollId,
          examCenter: student.examCenter,
          examCenterAddress: student.examCenterAddress,
          district: student.district,
          state: student.state,
        },
        fieldsUsed: ['examCenter', 'examCenterAddress', 'district', 'state'],
        lookupMs: performance.now() - start,
      };

    case 'get_exam_schedule':
      return {
        tool: name,
        data: {
          rollId: student.rollId,
          examDate: student.examDate,
          reportingTime: student.reportingTime,
          examEndTime: student.examEndTime,
          scheduleNotes: student.scheduleNotes,
        },
        fieldsUsed: ['examDate', 'reportingTime', 'examEndTime', 'scheduleNotes'],
        lookupMs: performance.now() - start,
      };

    case 'get_registration_status':
      return {
        tool: name,
        data: {
          rollId: student.rollId,
          registrationStatus: student.registrationStatus,
          registeredAt: student.registeredAt,
        },
        fieldsUsed: ['registrationStatus', 'registeredAt'],
        lookupMs: performance.now() - start,
      };

    case 'get_eligibility_status':
      return {
        tool: name,
        data: {
          rollId: student.rollId,
          eligibilityStatus: student.eligibilityStatus,
          eligibilityNotes: student.eligibilityNotes,
        },
        fieldsUsed: ['eligibilityStatus', 'eligibilityNotes'],
        lookupMs: performance.now() - start,
      };

    case 'get_roll_id':
      return {
        tool: name,
        data: { rollId: student.rollId, name: student.name },
        fieldsUsed: ['rollId', 'name'],
        lookupMs: performance.now() - start,
      };

    default:
      return {
        tool: 'get_roll_id',
        data: { error: `Unknown tool: ${toolName}` },
        fieldsUsed: [],
        lookupMs: performance.now() - start,
      };
  }
}

/** Map CLI intent to tool name for the offline simulator. */
export function intentToTool(intent: string): StudentToolName | null {
  const map: Record<string, StudentToolName> = {
    admit_card: 'get_admit_card_status',
    exam_center: 'get_exam_center',
    schedule: 'get_exam_schedule',
    registration: 'get_registration_status',
    eligibility: 'get_eligibility_status',
    roll_id: 'get_roll_id',
  };
  return map[intent] ?? null;
}

/** Build a short spoken line from tool output (CLI mock path). */
export function formatToolResponseForVoice(
  tool: StudentToolName,
  data: Record<string, unknown>,
  language: LanguageCode,
  studentName: string
): string {
  switch (tool) {
    case 'get_admit_card_status':
      if (data.admitCardAvailable && data.admitCardDownloadUrl) {
        return language === 'hi'
          ? `${studentName}, आपका प्रवेश पत्र उपलब्ध है। लिंक: ${data.admitCardDownloadUrl}`
          : `${studentName}, your admit card is available. Download at: ${data.admitCardDownloadUrl}`;
      }
      return language === 'hi'
        ? `${studentName}, आपका प्रवेश पत्र अभी उपलब्ध नहीं है।`
        : `${studentName}, your admit card is not yet available.`;

    case 'get_exam_center':
      return language === 'hi'
        ? `${studentName}, परीक्षा केंद्र ${data.examCenter}, ${data.examCenterAddress} है।`
        : `${studentName}, your exam center is ${data.examCenter}, at ${data.examCenterAddress}.`;

    case 'get_exam_schedule':
      return language === 'hi'
        ? `${studentName}, परीक्षा ${data.examDate} को है। रिपोर्टिंग समय ${data.reportingTime}। ${data.scheduleNotes ?? ''}`
        : `${studentName}, exam on ${data.examDate}. Report by ${data.reportingTime}. ${data.scheduleNotes ?? ''}`;

    case 'get_registration_status':
      return language === 'hi'
        ? `${studentName}, पंजीकरण स्थिति: ${data.registrationStatus} (${data.registeredAt})।`
        : `${studentName}, registration status: ${data.registrationStatus} (registered ${data.registeredAt}).`;

    case 'get_eligibility_status':
      return language === 'hi'
        ? `${studentName}, पात्रता: ${data.eligibilityStatus}। ${data.eligibilityNotes ?? ''}`
        : `${studentName}, eligibility: ${data.eligibilityStatus}. ${data.eligibilityNotes ?? ''}`;

    case 'get_roll_id':
      return language === 'hi'
        ? `${studentName}, आपकी रोल आईडी ${data.rollId} है।`
        : `${studentName}, your roll ID is ${data.rollId}.`;
  }
}
