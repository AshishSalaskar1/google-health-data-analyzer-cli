import guidance from "../knowledge/guidance.json" with { type: "json" };
import type { CoachEvidence } from "../src/coach/models.ts";

const STOP = new Set(["about", "after", "also", "been", "from", "have", "into", "just", "more", "than", "that", "their", "this", "what", "when", "where", "which", "with", "your"]);

function terms(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g)?.filter((term) => term.length > 2 && !STOP.has(term)) ?? [];
}

export function retrieveGuidance(query: string, maximum = 3): CoachEvidence[] {
  const queryTerms = terms(query);
  return guidance.map((document) => {
    const title = terms(`${document.topic} ${document.title}`);
    const body = terms(document.text);
    const score = queryTerms.reduce((sum, term) => sum + title.filter((word) => word === term).length * 4 + body.filter((word) => word === term).length, 0);
    return { document, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, maximum).map(({ document }, index) => ({
    id: `G${index + 1}`, title: document.title, kind: "guidance", source: document.organization,
    url: document.url, coverage: `Reviewed ${document.reviewedAt}`, data: document.text,
  }));
}
