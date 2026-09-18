import { cleanString, uniqueStrings } from './utils.js';

export type MetadataCatalog = {
  companies: string[];
  fields: string[];
  affiliations: string[];
};

export type ParsedMetadata = {
  company: string | null;
  field: string | null;
  context: string | null;
  affiliations: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(phrase.toLowerCase())}(?:$|[^a-z0-9])`, 'i').test(text);
}

/* Longest first, so "Jane Street Capital" wins over "Jane Street". Copies the
   input because the catalog is shared across every contact in a sync run. */
function byLengthDescending(values: string[]): string[] {
  return [...values].sort((a, b) => b.length - a.length);
}

export function fieldFromRole(role: string, company?: string | null): string | null {
  const cleaned = cleanString(role);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if ((lower === 'sp' || /\bstrat(?:egy)?\s*(?:and|&)\s*product\b/.test(lower)) && company === 'Jane Street') return 'Strat and Product';
  if (/\b(?:quant|quantitative|qt)\b/.test(lower) || /\bquant\s+trader\b/.test(lower)) return 'Quant';
  if (/\b(?:swe|software engineer(?:ing)?)\b/.test(lower)) return 'Software Engineering';
  if (/\b(?:ml|machine learning)\b/.test(lower)) return 'Machine Learning';
  if (/\b(?:venture capital|vc)\b/.test(lower)) return 'VC';
  return cleaned;
}

export function canonicalizeOrganization(value: string): { company: string | null; field: string | null; affiliations: string[] } {
  const cleaned = cleanString(value);
  if (!cleaned) return { company: null, field: null, affiliations: [] };
  const spc = cleaned.match(/^(?:spc|south park commons)(?:\s+(.+))?$/i);
  if (spc) {
    const suffix = cleanString(spc[1]);
    return { company: null, field: /\bhead\b/i.test(suffix) ? 'Head' : null, affiliations: ['SPC'] };
  }

  const janeStreet = cleaned.match(/^(?:js|jane street)(?:\s*[/ -]\s*|\s+)?(.*)$/i);
  if (janeStreet) {
    const suffix = cleanString(janeStreet[1]);
    if (/^cmu$/i.test(suffix)) return { company: 'Jane Street', field: null, affiliations: ['CMU'] };
    return { company: 'Jane Street', field: suffix ? fieldFromRole(suffix, 'Jane Street') : null, affiliations: [] };
  }
  return { company: cleaned, field: null, affiliations: [] };
}

export function parseContactNotes(notes: string, catalog: MetadataCatalog): ParsedMetadata {
  const cleaned = cleanString(notes);
  if (!cleaned) return { company: null, field: null, context: null, affiliations: [] };
  const lower = cleaned.toLowerCase();
  const affiliations: string[] = [];

  if (/\b(?:uchicago|uchic|uchi)\b/i.test(cleaned)) affiliations.push('UChicago');
  if (/\b(?:irvington(?: high school)?|high school)\b/i.test(cleaned)) affiliations.push('Irvington');
  if (/\b(?:south park commons|spc)\b/i.test(cleaned)) affiliations.push('SPC');
  for (const affiliation of byLengthDescending(catalog.affiliations)) {
    if (affiliation.toLowerCase() === 'jane street') continue;
    if (affiliation.length >= 3 && containsPhrase(lower, affiliation)) affiliations.push(affiliation);
  }

  let company: string | null = /\b(?:js|jane street)\b/i.test(cleaned) ? 'Jane Street' : null;
  if (!company) {
    const matchedCompany = byLengthDescending(catalog.companies)
      .filter((item) => item.length >= 4 && item.toUpperCase() !== 'SPC')
      .find((item) => containsPhrase(lower, item)) ?? null;
    company = matchedCompany ? canonicalizeOrganization(matchedCompany).company : null;
  }

  let field: string | null = null;
  if (/\b(?:quant|quantitative|qt)\b/i.test(cleaned)) field = 'Quant';
  else if (/\b(?:strat(?:egy)?\s*(?:and|&)\s*product)\b/i.test(cleaned) || (company === 'Jane Street' && /\bsp\b/i.test(cleaned))) field = 'Strat and Product';
  else if (/\b(?:software engineer(?:ing)?|swe)\b/i.test(cleaned)) field = 'Software Engineering';
  else if (/\b(?:machine learning|ml)\b/i.test(cleaned)) field = 'Machine Learning';
  else if (/\b(?:venture capital|vc)\b/i.test(cleaned)) field = 'VC';
  else if (/\brobotics?\b/i.test(cleaned)) field = 'Robotics';
  else if (/\bastrophysics?\b/i.test(cleaned)) field = 'Astrophysics';
  else if (/\bphysics\b/i.test(cleaned)) field = 'Physics';
  else if (/\bfinance\b/i.test(cleaned)) field = 'Finance';
  if (!field) {
    field = byLengthDescending(catalog.fields)
      .filter((item) => item.length >= 3)
      .find((item) => containsPhrase(lower, item)) ?? null;
  }

  const contextMatch = cleaned.match(/\bmet\s+(?:at|through|via|in)\s+(.+?)(?=\s*[,;\n]|$)/i);
  const context = contextMatch ? cleanString(contextMatch[1]) : null;
  return { company, field, context, affiliations: uniqueStrings(affiliations) };
}
