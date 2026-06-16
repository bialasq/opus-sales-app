import type {
  AISuggestion,
  AISuggestionEval,
  AnalystFactsPayload,
  EvaluatedAISuggestion,
} from "../shared/api-types";

/** Trim, lowercase, spacje, bez znaków interpunkcyjnych (fuzzy match SKU). */
export function normalizeProductKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim();
}

function normalize(s: string): string {
  return normalizeProductKey(s);
}

/** Porównanie nazw produktów: wielkość liter, spacje, diakrytyki, substring. */
export function fuzzyProductMatch(a: string, b: string): boolean {
  const na = normalizeProductKey(a);
  const nb = normalizeProductKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  return false;
}

/** Nazwy produktów wyciągnięte z faktów Analityka (tekst + JSON). */
export function extractProductNamesFromFacts(
  facts: AnalystFactsPayload
): Set<string> {
  const names = new Set<string>();

  const topNames = facts.metrics?.topProductNames;
  if (Array.isArray(topNames)) {
    for (const n of topNames) {
      if (typeof n === "string" && n.trim()) names.add(normalize(n));
    }
  }

  const alerts = facts.toolSnapshots?.getLowStockAlerts as
    | {
        stockoutRisk?: { product?: string }[];
        overstock?: { product?: string }[];
      }
    | undefined;

  if (alerts?.stockoutRisk) {
    for (const row of alerts.stockoutRisk) {
      if (row.product) names.add(normalize(row.product));
    }
  }
  if (alerts?.overstock) {
    for (const row of alerts.overstock) {
      if (row.product) names.add(normalize(row.product));
    }
  }

  for (const anomaly of facts.anomalies || []) {
    for (const match of anomaly.match(/[A-ZĄĆĘŁŃÓŚŹŻ][\wąćęłńóśźż\s-]{2,40}/gi) || []) {
      const t = match.trim();
      if (t.length > 2) names.add(normalize(t));
    }
  }

  return names;
}

/** Produkty wspomniane w tytule/opisie sugestii. */
export function extractMentionedProducts(
  suggestion: AISuggestion,
  catalogProductNames: string[]
): string[] {
  const text = `${suggestion.title} ${suggestion.description}`;
  const mentioned: string[] = [];

  for (const name of catalogProductNames) {
    if (fuzzyProductMatch(text, name)) {
      mentioned.push(name);
    }
  }

  const labelMatch = text.match(/(?:Promocja|Domówienie|produkt)[:\s]+([^(\n,.]+)/i);
  if (labelMatch) {
    const candidate = labelMatch[1].trim();
    if (candidate.length > 1) {
      const catalogHit = catalogProductNames.find((c) => fuzzyProductMatch(candidate, c));
      mentioned.push(catalogHit ?? candidate);
    }
  }

  return [...new Set(mentioned)];
}

export type VerifyAgentOutputResult = {
  verified: boolean;
  eval: AISuggestionEval;
};

function productInFacts(
  product: string,
  factProducts: Set<string>,
  factsBlob: string
): boolean {
  const norm = normalize(product);
  if ([...factProducts].some((f) => fuzzyProductMatch(product, f))) {
    return true;
  }
  const normBlob = normalizeProductKey(factsBlob);
  if (norm.length >= 3 && normBlob.includes(norm)) {
    return true;
  }
  return false;
}

/**
 * Szybki test logiczny: czy produkt w sugestii jest zakotwiczony w faktach Analityka.
 */
export function verifyAgentOutput(
  facts: AnalystFactsPayload,
  suggestion: AISuggestion,
  catalogProductNames: string[]
): VerifyAgentOutputResult {
  const factProducts = extractProductNamesFromFacts(facts);
  const factsBlob = JSON.stringify(facts).toLowerCase();
  const mentioned = extractMentionedProducts(suggestion, catalogProductNames);

  if (mentioned.length === 0) {
    return {
      verified: true,
      eval: { verified: true, evalFlags: [] },
    };
  }

  const flags: string[] = [];
  let matchedFact: string | undefined;

  for (const product of mentioned) {
    const inCatalog = catalogProductNames.some((c) => fuzzyProductMatch(c, product));
    const inFacts = productInFacts(product, factProducts, factsBlob);

    if (inFacts) {
      matchedFact = product;
      continue;
    }

    if (inCatalog && !inFacts) {
      flags.push("potential_hallucination");
    } else if (!inCatalog) {
      flags.push("potential_hallucination");
    }
  }

  const uniqueFlags = [...new Set(flags)];
  return {
    verified: uniqueFlags.length === 0,
    eval: {
      verified: uniqueFlags.length === 0,
      evalFlags: uniqueFlags,
      potential_hallucination: uniqueFlags.includes("potential_hallucination"),
      matchedFact,
    },
  };
}

export function evaluateAllSuggestions(
  facts: AnalystFactsPayload | undefined,
  suggestions: AISuggestion[],
  catalogProductNames: string[]
): {
  suggestions: EvaluatedAISuggestion[];
  summary: { total: number; verified: number; potential_hallucination: number };
} {
  if (!facts || suggestions.length === 0) {
    return {
      suggestions: suggestions.map((s) => ({ ...s })),
      summary: {
        total: suggestions.length,
        verified: suggestions.length,
        potential_hallucination: 0,
      },
    };
  }

  let hallucinations = 0;
  const evaluated: EvaluatedAISuggestion[] = suggestions.map((s) => {
    const { eval: ev } = verifyAgentOutput(facts, s, catalogProductNames);
    if (ev.potential_hallucination) hallucinations += 1;
    return { ...s, eval: ev };
  });

  return {
    suggestions: evaluated,
    summary: {
      total: suggestions.length,
      verified: suggestions.length - hallucinations,
      potential_hallucination: hallucinations,
    },
  };
}
