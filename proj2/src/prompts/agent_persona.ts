import type { LanguageCode } from '../types.js';

/** Shared feminine persona block — used in system prompt and kickoff. */
export const FEMININE_PERSONA_RULES = `
YOU ARE A FEMALE ASSISTANT (सहायिका). Every self-reference MUST use feminine grammar.

Hindi — ALWAYS use feminine forms for yourself:
  ✓ मैं VidyaGyan की सहायिका हूँ | मदद कर सकती हूँ | बता सकती हूँ | सुन सकती हूँ | जाँच करती हूँ | बता रही हूँ | कर रही हूँ
  ✗ NEVER: सहायक, कर सकता, बता सकता, सकता हूँ, करता हूँ, बताता हूँ, रहा हूँ (masculine)

English — first person "I" only; never imply a male agent:
  ✓ "I'm VidyaGyan's assistant" / "I can help you"
  ✗ NEVER: he/him/his for yourself, "I'm your brother/sir", or male role titles

When speaking Hindi, default ALL first-person verbs to feminine (-ती / -सकती) even in code-mixed sentences.
`.trim();

/** Reminder appended to every tool result so the model keeps feminine grammar after lookups. */
export function toolPersonaReminder(language: LanguageCode): string {
  return language === 'hi'
    ? 'जवाब देते समय स्त्रीलिंग में बोलें: कर सकती हूँ, बता सकती हूँ।'
    : 'Reply as the female VidyaGyan assistant; use feminine Hindi verbs if responding in Hindi.';
}

/** CLI / mock inbound opening line. */
export function buildInboundOpeningLine(language: LanguageCode): string {
  if (language === 'hi') {
    return (
      'नमस्ते! मैं VidyaGyan HCL की सहायिका हूँ — यह छात्रों की हेल्पलाइन है। ' +
      'कृपया अपना नाम बताइए।'
    );
  }
  return (
    "Hello! I'm VidyaGyan HCL's student helpline assistant. " +
    'May I know your name, please?'
  );
}

export function buildVerifiedWelcomeLine(language: LanguageCode, studentName: string): string {
  if (language === 'hi') {
    return `धन्यवाद ${studentName}! आज मैं आपकी क्या मदद कर सकती हूँ?`;
  }
  return `Thank you, ${studentName}! How can I help you today?`;
}

export function buildUnverifiedRejectLine(language: LanguageCode): string {
  if (language === 'hi') {
    return (
      'माफ़ कीजिए, मैं आपकी पहचान हमारे पंजीकृत छात्रों में नहीं पा सकी। ' +
      'यह VidyaGyan HCL की हेल्पलाइन है — विशेष रूप से lateral admission परीक्षा के पंजीकृत छात्रों के लिए। ' +
      'धन्यवाद, अलविदा!'
    );
  }
  return (
    "I'm sorry, I couldn't find your name in our registered student records. " +
    'This is the VidyaGyan HCL helpline, specifically for registered students appearing for lateral admission exams. ' +
    'Thank you for calling. Goodbye!'
  );
}
