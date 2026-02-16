import OpenAI from "openai";
import { getStyleContract } from "@/lib/style-contracts";
import { SYSTEM_PROMPT_UNIFIED_OVERLAP } from "./systemPrompt";
import { UNIFIED_OVERLAP_ENGINE_DEVELOPER_PROMPT } from "./developerPrompt";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in environment variables. Please check your .env.local file.");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const UNIFIED_MODEL = process.env.UNIFIED_MODEL || process.env.REWRITE_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";

type Overlap = { id: string; label: string; statement: string };
type Rewrite = { id: string; alts: [string, string, string] };
type UnifiedPayload = { overlaps: Overlap[]; rewrites: Rewrite[] };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function parseUnifiedPayload(parsed: unknown): UnifiedPayload {
  const root = asRecord(parsed);
  if (!Array.isArray(root.overlaps) || !Array.isArray(root.rewrites)) {
    throw new Error('Unified response must include "overlaps" and "rewrites" arrays.');
  }

  const overlaps: Overlap[] = root.overlaps.map((item: unknown, index: number) => {
    const row = asRecord(item);
    const idValue = row.id;
    const labelValue = row.label;
    const statementValue = row.statement;
    return {
      id: typeof idValue === "string" && idValue.trim() ? idValue.trim() : `A${index + 1}`,
      label: typeof labelValue === "string" ? labelValue.trim() : "",
      statement: typeof statementValue === "string" ? statementValue.trim() : "",
    };
  });

  const rewrites: Rewrite[] = root.rewrites.map((item: unknown) => {
    const row = asRecord(item);
    const alts = Array.isArray(row.alts) ? row.alts : [];
    return {
      id: typeof row.id === "string" ? row.id.trim() : "",
      alts: [String(alts[0] ?? "").trim(), String(alts[1] ?? "").trim(), String(alts[2] ?? "").trim()] as [string, string, string],
    };
  });

  return { overlaps, rewrites };
}

function buildUnifiedUserMessage(premise: string, styleId: string, rewriteCount: number): string {
  const styleContract = getStyleContract(styleId);

  return `PREMISE:\n${premise}\n\nVOICE CONTRACT (apply only to rewrites):\n${JSON.stringify(styleContract, null, 2)}\n\nrewriteCount K: ${rewriteCount}\n\nReturn JSON only in this exact shape:\n{\n  "overlaps": [\n    { "id": "A1", "label": "plain language label", "statement": "single sentence overlap statement" }\n  ],\n  "rewrites": [\n    { "id": "A1", "alts": ["alt 1", "alt 2", "alt 3"] }\n  ]\n}\n\nRules:\n- overlaps: 10 to 15 items\n- rewrites: exactly K items\n- rewrite ids must exist in overlaps\n- alts must be exactly 3 items\n- labels must be plain language\n- phase B must not invent new overlaps\n- phase B language must be certain and avoid: suggests, implies, seems, almost, kind of, sort of\n- every overlap statement must include concrete objects/actions from at least two domains implied by the premise\n- avoid generic contrast templates such as "criteria differ", "perceptions vary", "doesn't match claims", unless anchored to concrete nouns\n- each rewrite alternative must add fresh imagery/details from the same overlap seam (not synonym swaps)\n- no punchlines, no joke templates, no random absurd substitution`;
}

function buildReport(premise: string, payload: UnifiedPayload): string {
  const overlapMap = new Map(payload.overlaps.map((item) => [item.id, item]));
  const overlapLines = payload.overlaps
    .map((overlap) => {
      const labelLine = overlap.label ? `${overlap.id} — ${overlap.label}` : overlap.id;
      return `${labelLine}\n${overlap.statement}`;
    })
    .join("\n\n");

  const rewriteLines = payload.rewrites
    .map((rewrite) => {
      const overlap = overlapMap.get(rewrite.id);
      const labelLine = overlap?.label ? `${rewrite.id} — ${overlap.label}` : rewrite.id;
      const alternatives = rewrite.alts.join("\n\n");
      return `${labelLine}\n\n${alternatives}`;
    })
    .join("\n\n");

  return `John Branyan's Overlap Comedy Engine — Unified Report\n\nPremise Clarified:\n${premise.trim()}\n\nSECTION A — OVERLAP STATEMENTS\n\n${overlapLines}\n\nSECTION B — REWRITES\n\n${rewriteLines}`;
}

export async function runTwoPhaseReport(premise: string, styleId: string): Promise<string> {
  const rewriteCount = Number(process.env.REWRITE_COUNT ?? 10);
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT_UNIFIED_OVERLAP },
    { role: "developer", content: UNIFIED_OVERLAP_ENGINE_DEVELOPER_PROMPT },
    { role: "user", content: buildUnifiedUserMessage(premise, styleId, rewriteCount) },
  ];

  const response = await client.chat.completions.create({
    model: UNIFIED_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature: 1,
    top_p: 1,
    presence_penalty: 0.35,
    frequency_penalty: 0.1,
    max_tokens: 3600,
  });

  const raw = response.choices[0]?.message?.content ?? "";
  if (!raw.trim()) {
    throw new Error("OpenAI returned empty response.");
  }

  let parsed: unknown;
  try {
    parsed = parseJson<unknown>(raw);
  } catch {
    const preview = raw.length > 500 ? raw.substring(0, 500) + "..." : raw;
    console.error(`[runTwoPhaseReport] Invalid JSON. Response preview: ${preview}`);
    throw new Error("OpenAI returned invalid JSON.");
  }

  const payload = parseUnifiedPayload(parsed);
  return buildReport(premise, payload);
}
