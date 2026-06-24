import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StudentProfile } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface DatabaseSchema {
  students: StudentProfile[];
}

let cachedDb: DatabaseSchema | null = null;

/** Load mock database once — simulates connection pool warm-up. */
function loadDatabase(): DatabaseSchema {
  if (cachedDb) return cachedDb;
  const raw = readFileSync(join(__dirname, 'database.json'), 'utf-8');
  cachedDb = JSON.parse(raw) as DatabaseSchema;
  return cachedDb;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}

function normalizeRollId(rollId: string): string {
  return rollId.trim().toUpperCase();
}

export interface DbLookupOptions {
  /** Skip artificial delay — use during live tool calls (student already resolved). */
  fast?: boolean;
}

/** Synchronous in-memory lookup — used by runtime tools for minimal latency. */
export function getStudentByPhoneSync(phoneNumber: string): StudentProfile | null {
  const normalized = normalizePhone(phoneNumber);
  return loadDatabase().students.find((s) => normalizePhone(s.phoneNumber) === normalized) ?? null;
}

export function getStudentByRollIdSync(rollId: string): StudentProfile | null {
  const normalized = normalizeRollId(rollId);
  return loadDatabase().students.find((s) => normalizeRollId(s.rollId) === normalized) ?? null;
}

/**
 * Retrieve a student by simulated inbound caller ID (TRAI CLI mapping).
 * Returns null when no record matches — never fabricates profile data.
 */
export async function getStudentByPhone(
  phoneNumber: string,
  options: DbLookupOptions = {}
): Promise<StudentProfile | null> {
  if (!options.fast) await simulateDbLatency();
  return getStudentByPhoneSync(phoneNumber);
}

/**
 * Retrieve a student by Roll ID — used when IVR collects roll number post-connect.
 */
export async function getStudentByRollId(
  rollId: string,
  options: DbLookupOptions = {}
): Promise<StudentProfile | null> {
  if (!options.fast) await simulateDbLatency();
  return getStudentByRollIdSync(rollId);
}

/** Resolve student via phone first, then optional roll ID fallback. */
export async function resolveStudent(
  phoneNumber: string,
  rollId?: string,
  options: DbLookupOptions = {}
): Promise<{ student: StudentProfile | null; lookupMs: number }> {
  const start = performance.now();
  const byPhone = await getStudentByPhone(phoneNumber, options);
  if (byPhone) {
    return { student: byPhone, lookupMs: performance.now() - start };
  }
  if (rollId) {
    const byRoll = await getStudentByRollId(rollId, options);
    return { student: byRoll, lookupMs: performance.now() - start };
  }
  return { student: null, lookupMs: performance.now() - start };
}

export function listAllStudents(): StudentProfile[] {
  return loadDatabase().students;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Find a registered student by spoken name (full, first name, or partial).
 * Returns null if no match or ambiguous multiple matches.
 */
export function findStudentByName(name: string): StudentProfile | null {
  const query = normalizeName(name);
  if (!query) return null;

  const students = loadDatabase().students;

  const exact = students.filter((s) => normalizeName(s.name) === query);
  if (exact.length === 1) return exact[0];

  const byFirst = students.filter((s) => normalizeName(s.name.split(/\s+/)[0] ?? '') === query);
  if (byFirst.length === 1) return byFirst[0];

  const partial = students.filter((s) => {
    const full = normalizeName(s.name);
    return full.includes(query) || query.includes(normalizeName(s.name.split(/\s+/)[0] ?? ''));
  });
  if (partial.length === 1) return partial[0];

  return null;
}

/** Verify caller identity by name and optional roll ID against mock registry. */
export function verifyCallerIdentity(
  name: string,
  rollId?: string
): { student: StudentProfile | null; lookupMs: number } {
  const start = performance.now();

  if (rollId?.trim()) {
    const byRoll = getStudentByRollIdSync(rollId);
    if (byRoll) {
      const query = normalizeName(name);
      const rollName = normalizeName(byRoll.name);
      const first = normalizeName(byRoll.name.split(/\s+/)[0] ?? '');
      if (!query || rollName === query || first === query || rollName.includes(query)) {
        return { student: byRoll, lookupMs: performance.now() - start };
      }
    }
  }

  return { student: findStudentByName(name), lookupMs: performance.now() - start };
}

/** Simulates indexed DB round-trip (~8–18 ms). Live tool path uses sync lookup instead. */
async function simulateDbLatency(): Promise<void> {
  const delay = 8 + Math.floor(Math.random() * 10);
  await new Promise((resolve) => setTimeout(resolve, delay));
}
