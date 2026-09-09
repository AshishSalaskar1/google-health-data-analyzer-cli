const EMERGENCY = /\b(chest pain|can't breathe|cannot breathe|severe shortness of breath|faint(?:ed|ing)?|stroke|overdose|suicid(?:e|al)|kill myself|self[- ]harm)\b/i;

export function emergencyResponse(question: string): string | null {
  if (!EMERGENCY.test(question)) return null;
  return "This may need immediate help. Call your local emergency number now or go to the nearest emergency department. Do not wait for this coach to interpret wearable data. If you may harm yourself, contact emergency services or a crisis hotline and stay with someone you trust.";
}
