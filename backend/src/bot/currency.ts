/**
 * Reads the answer to "what currency should I show your money in?".
 * Only naira and US dollars are supported. Other currencies are named so
 * the bot can say plainly that they aren't available, instead of repeating
 * the question. Unqualified "dollar" means US dollars, but a qualified one
 * (Canadian dollar, CAD, ...) must never be saved as USD.
 */
export type CurrencyAnswer =
  | { kind: 'ok'; currency: 'NGN' | 'USD' }
  | { kind: 'unsupported'; name: string }
  | { kind: 'unclear' };

const NAIRA = /(\bnaira\b|\bngn\b|₦)/i;
const US_DOLLAR = /(\bus\s*dollars?\b|\busd\b|\bdollars?\b|\bamerican\b|\$)/i;

const UNSUPPORTED: [RegExp, string][] = [
  [/\b(cad|canadian)\b/i, 'Canadian dollar'],
  [/\b(aud|australian)\b/i, 'Australian dollar'],
  [/\b(nzd|new zealand)\b/i, 'New Zealand dollar'],
  [/\b(sgd|singapore)\b/i, 'Singapore dollar'],
  [/\b(hkd|hong kong)\b/i, 'Hong Kong dollar'],
  [/\b(zar|rands?)\b|south africa/i, 'South African rand'],
  [/\b(jpy|yen)\b/i, 'Japanese yen'],
  [/\b(eur|euros?)\b/i, 'euro'],
  [/\b(gbp|pounds?|sterling)\b/i, 'British pound'],
  [/\b(ghs|cedis?)\b/i, 'Ghanaian cedi'],
  [/\b(kes|kenyan|shillings?)\b/i, 'Kenyan shilling'],
  [/\b(egp)\b/i, 'Egyptian pound'],
  [/\b(inr|rupees?)\b/i, 'Indian rupee'],
  [/\b(cny|rmb|yuan)\b/i, 'Chinese yuan'],
  [/\b(brl|reais|real)\b/i, 'Brazilian real'],
  [/\b(aed|dirhams?)\b/i, 'UAE dirham'],
  [/\b(chf|francs?)\b/i, 'Swiss franc'],
  [/\b(try|lira)\b/i, 'Turkish lira'],
  [/\b(ars|mxn|pesos?)\b/i, 'peso'],
];

export function parseDisplayCurrency(text: string): CurrencyAnswer {
  if (NAIRA.test(text)) return { kind: 'ok', currency: 'NGN' };
  for (const [pattern, name] of UNSUPPORTED) {
    if (pattern.test(text)) return { kind: 'unsupported', name };
  }
  if (US_DOLLAR.test(text)) return { kind: 'ok', currency: 'USD' };
  return { kind: 'unclear' };
}
