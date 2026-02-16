/**
 * Comedy Generation Service
 *
 * Unified pipeline (single API call):
 * - Phase A: Generate overlap statements via association-field pairing (voice-neutral)
 * - Phase B: Reauthor selected overlaps via voice/style contract
 */

import OpenAI from "openai";
import { SYSTEM_PROMPT_UNIFIED_OVERLAP } from "./systemPrompt";
import { UNIFIED_OVERLAP_ENGINE_DEVELOPER_PROMPT } from "./developerPrompt";
import { StyleContract, STYLE_CONTRACTS } from "./style-contracts";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in environment variables. Please check your .env.local file.");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BASE_MODEL = process.env.OPENAI_MODEL ?? "gpt-4-turbo-preview";
const UNIFIED_MODEL = process.env.UNIFIED_MODEL || process.env.REWRITE_MODEL || process.env.OPENAI_MODEL || "gpt-4o";

const JSON_OUTPUT_REMINDER = `CRITICAL: You must return valid JSON only. Do not include any text outside the JSON structure.`;

export interface ComedyGenerationConfig {
  baseTemperature?: number;
  rewriteTemperature?: number;
  premiseCount?: number;
  enableRewrite?: boolean;
}

function getDefaultConfig(): Required<ComedyGenerationConfig> {
  return {
    baseTemperature: 0.7,
    rewriteTemperature: 0.8,
    premiseCount: 15,
    enableRewrite: true,
  };
}

function getDefaultStyleContract(): StyleContract {
  return STYLE_CONTRACTS[0];
}

export type WorldPremiseItem = { world: string; premise: string };
export type Overlap = { id: string; label: string; statement: string };
export type Rewrite = { id: string; alts: [string, string, string] };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export interface JokeGenResponse {
  jokes?: string[];
  error?: string;
}

export interface GenerateComedyResponse extends JokeGenResponse {
  baseJokes?: string[]; // Deprecated: use selectedPremises instead
  selectedPremises?: WorldPremiseItem[]; // The selected premises sent to rewrite (for debugging)
  // Unified diagnostics (optional; safe to ignore)
  overlaps?: Array<{ id: string; label: string; statement: string }>;
  rewrites?: Array<{ id: string; alts: string[] }>;
  // Ready-to-display text report (the app can render this directly)
  reportText?: string;
}

export interface GenerateOverlapReportResponse {
  report: string;
  overlaps?: Overlap[];
  rewrites?: Rewrite[];
}

function getOpenAIClient(): OpenAI {
  return client;
}

function redactContent(content: string, maxLength: number = 50): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + "...";
}

function buildUserMessage(topic: string, premiseCount: number) {
  return `Topic:\n${topic}\n\nGenerate ${premiseCount} collision notes.\n\nEach note must:\n- Be EXACTLY one sentence\n- Express one collision or angle\n- Include at least one concrete object or action\n\nReturn them as JSON with the key "items".`;
}

/**
 * Step 1: Generate base premise notes
 */
export async function generateBasePremises({
  topic,
  premiseCount,
  temperature,
  addReminder,
}: {
  topic: string;
  premiseCount: number;
  temperature: number;
  addReminder: boolean;
}): Promise<WorldPremiseItem[]> {
  const openai = getOpenAIClient();
  const userMessage = `Topic:\n${topic}\n\nGenerate ${premiseCount} collision notes.\n\nEach note must:\n- Be EXACTLY one sentence\n- Express one collision or angle\n- Include at least one concrete object or action\n\nReturn them as JSON with the key "items".`;
  const maxTokens = Math.min(180 * premiseCount, 3600);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT_UNIFIED_OVERLAP, // still JSON-only; safe for legacy callers
    },
    {
      role: "developer",
      content: UNIFIED_OVERLAP_ENGINE_DEVELOPER_PROMPT,
    },
    {
      role: "user",
      content: userMessage,
    },
  ];

  if (addReminder) {
    messages.push({ role: "developer", content: JSON_OUTPUT_REMINDER });
  }

  const completion = await openai.chat.completions.create({
    model: UNIFIED_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature,
    top_p: 0.95,
    presence_penalty: 0.3,
    frequency_penalty: 0.1,
    max_tokens: maxTokens,
  });

  const outputText = completion.choices[0]?.message?.content || "";
  if (!outputText.trim()) throw new Error("Empty response from OpenAI.");

  const parsed = JSON.parse(outputText.trim());
  if (!Array.isArray(parsed.items)) {
    throw new Error('Response must include an "items" array.');
  }

  return parsed.items.map((item: unknown) => {
    const row = asRecord(item);
    const worldValue = row.world;
    const premiseValue = row.premise;
    return {
      world: typeof worldValue === "string" && worldValue.trim() ? worldValue.trim() : "unspecified",
      premise: typeof premiseValue === "string" ? premiseValue.trim() : String(premiseValue ?? "").trim(),
    };
  });
}

function buildUnifiedUserMessage(args: {
  topic: string;
  rewriteCount: number;
  styleContract: StyleContract;
}): string {
  const { topic, rewriteCount, styleContract } = args;
  const styleContractJson = JSON.stringify(styleContract, null, 2);

  return `PREMISE:
${topic}

VOICE CONTRACT (apply ONLY to rewrites):
${styleContractJson}

OUTPUT REQUIREMENTS:
- overlaps: generate 10–15 overlap statements (voice-neutral).
- rewrites: choose exactly ${rewriteCount} of the strongest overlaps and write exactly 3 alternatives each.
- Strong, certain language in rewrites (ban hedge words: suggests, implies, seems, almost, kind of, sort of).
- Limit conjunctions. Prefer short, purposeful sentences.
- Labels must be plain language (no clinical taxonomy).
- No punchlines. No joke templates. No random absurd substitution.
`;
}

function parseUnifiedPayload(parsed: unknown): { overlaps: Overlap[]; rewrites: Rewrite[] } {
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
    const altsRaw = Array.isArray(row.alts) ? row.alts : [];
    const fixedAlts = [
      String(altsRaw[0] ?? "").trim(),
      String(altsRaw[1] ?? "").trim(),
      String(altsRaw[2] ?? "").trim(),
    ] as [string, string, string];

    return {
      id: typeof row.id === "string" ? row.id.trim() : "",
      alts: fixedAlts,
    };
  });

  return { overlaps, rewrites };
}

type UnifiedOverlapResponse = {
  overlaps: Array<{ id: string; label: string; statement: string }>;
  rewrites: Array<{ id: string; alts: string[] }>;
};

async function generateUnifiedOverlapsAndRewrites(args: {
  topic: string;
  rewriteCount: number;
  styleContract: StyleContract;
  temperature: number;
  addReminder: boolean;
}): Promise<UnifiedOverlapResponse> {
  const openai = getOpenAIClient();
  const userMessage = buildUnifiedUserMessage({
    topic: args.topic,
    rewriteCount: args.rewriteCount,
    styleContract: args.styleContract,
  });

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT_UNIFIED_OVERLAP },
    { role: "developer" as const, content: UNIFIED_OVERLAP_ENGINE_DEVELOPER_PROMPT },
    { role: "user" as const, content: userMessage },
  ];

  if (args.addReminder) {
    messages.push({ role: "developer" as const, content: JSON_OUTPUT_REMINDER });
  }

  const completion = await openai.chat.completions.create({
    model: UNIFIED_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature: args.temperature,
    top_p: 1,
    presence_penalty: 0.2,
    frequency_penalty: 0.1,
    max_tokens: 3600,
  });

  const outputText = completion.choices[0]?.message?.content || "";
  if (!outputText.trim()) throw new Error("Empty response from OpenAI");

  let parsed: any;
  try {
    parsed = JSON.parse(outputText.trim());
  } catch {
    const preview = redactContent(outputText, 500);
    console.error(`[Unified] Invalid JSON. Response preview: ${preview}`);
    throw new Error("Unified overlap engine returned invalid JSON.");
  }

  if (!Array.isArray(parsed?.overlaps) || !Array.isArray(parsed?.rewrites)) {
    const preview = redactContent(outputText, 500);
    console.error(`[Unified] Missing overlaps/rewrites arrays. Response preview: ${preview}`);
    throw new Error('Unified response must include "overlaps" and "rewrites" arrays.');
  }

  return { overlaps: parsed.overlaps, rewrites: parsed.rewrites };
}

function formatReportText(args: {
  premise: string;
  styleContract: StyleContract;
  overlaps: UnifiedOverlapResponse["overlaps"];
  rewrites: UnifiedOverlapResponse["rewrites"];
}): string {
  const { premise, styleContract, overlaps, rewrites } = args;
  const voiceName =
    styleContract?.voiceDescription ||
    styleContract?.reference ||
    styleContract?.styleId ||
    "unspecified";

  const lines: string[] = [];
  lines.push(`OVERLAP COMEDY ENGINE REPORT`);
  lines.push(`Premise: ${premise}`);
  lines.push(`Voice: ${voiceName}`);
  lines.push("");
  lines.push("SECTION A — OVERLAP STATEMENTS");
  lines.push("");

  overlaps.forEach((o, idx) => {
    const n = idx + 1;
    const label = String(o.label ?? "").trim();
    const statement = String(o.statement ?? "").trim();
    lines.push(`A${n}. ${label}`);
    lines.push(`${statement}`);
    lines.push("");
  });

  lines.push("SECTION B — REAUTHORED EXPRESSIONS");
  lines.push("");

  rewrites.forEach((r) => {
    const id = String(r.id ?? "").trim();
    const overlap = overlaps.find((o) => String(o.id).trim() === id);
    const label = overlap?.label ? String(overlap.label).trim() : "";
    const statement = overlap?.statement ? String(overlap.statement).trim() : "";

    lines.push(`${id}${label ? ` — ${label}` : ""}`);
    if (statement) lines.push(statement);
    lines.push("");

    const alts = Array.isArray(r.alts) ? r.alts : [];
    alts.slice(0, 3).forEach((alt, i) => {
      lines.push(`${i + 1}. ${String(alt ?? "").trim()}`);
    });
    lines.push("");
  });

  return lines.join("\n").trim() + "\n";
}

export interface GenerateComedyParams {
  topic: string;
  jokeCount: number;
  clean?: boolean;
  styleContract?: StyleContract;
  config?: ComedyGenerationConfig;
}

/**
 * Generate comedy material using unified single-call pipeline
 *
 * Pipeline (single call):
 * 1) Generate overlaps (10–15)
 * 2) Select strongest K overlaps internally
 * 3) Reauthor selected overlaps into 3 alternatives each under the style contract
 *
 * @param params - Generation parameters
 * @returns JSON response with re-authored material + ready-to-display report text
 */
export async function generateComedy({
  topic,
  jokeCount,
  clean = true,
  styleContract,
  config = {},
}: GenerateComedyParams): Promise<GenerateComedyResponse> {
  const finalConfig = { ...getDefaultConfig(), ...config };
  // NOTE: `clean` is currently unused in the unified prompt; keep param for API compatibility.
  if (!finalConfig.enableRewrite) {
    throw new Error("Rewrite is disabled but required to produce a report");
  }

  const contractToUse = styleContract || getDefaultStyleContract();
  console.log(`[Comedy Generation][Unified] Topic: ${topic}, N_final: ${jokeCount}`);

  let unified: UnifiedOverlapResponse;
  try {
    unified = await generateUnifiedOverlapsAndRewrites({
      topic,
      rewriteCount: jokeCount,
      styleContract: contractToUse,
      temperature: finalConfig.rewriteTemperature,
      addReminder: false,
    });
  } catch (err) {
    console.warn(
      `[Comedy Generation][Unified] Error, retrying: ${err instanceof Error ? err.message : "Unknown error"}`
    );
    unified = await generateUnifiedOverlapsAndRewrites({
      topic,
      rewriteCount: jokeCount,
      styleContract: contractToUse,
      temperature: finalConfig.rewriteTemperature,
      addReminder: true,
    });
  }

  // Provide a ready-to-display report string. The app can print this and discard everything else.
  const reportText = formatReportText({
    premise: topic,
    styleContract: contractToUse,
    overlaps: unified.overlaps,
    rewrites: unified.rewrites,
  });

  // Backward compatibility: also return `jokes` as "one item per rewritten overlap"
  // where text is the 3 alternatives joined by newlines.
  const jokes: string[] = unified.rewrites.map((r) => {
    const alts = Array.isArray(r.alts) ? r.alts : [];
    return alts.map((s) => String(s).trim()).filter(Boolean).join("\n");
  });

  return {
    jokes,
    overlaps: unified.overlaps,
    rewrites: unified.rewrites,
    reportText,
  };
}

function buildReportFromUnified(topic: string, overlaps: Overlap[], rewrites: Rewrite[]): string {
  const overlapMap = new Map(overlaps.map((item) => [item.id, item]));
  const blocks = rewrites
    .map((rewrite, index) => {
      const overlap = overlapMap.get(rewrite.id);
      const premiseLine = overlap?.statement ?? `Overlap for ${rewrite.id}`;
      return `OVERLAP #${index + 1}\n${premiseLine}\n${rewrite.alts.join("\n")}`;
    })
    .join("\n\n");

  return `John Branyan's Overlap Comedy Engine — Unified Report\n\nPremise Clarified:\n${topic.trim()}\n\nRewrites:\n${blocks}`;
}

export async function generateOverlapReport({
  topic,
  styleContract,
  config = {},
}: {
  topic: string;
  styleContract?: StyleContract;
  config?: ComedyGenerationConfig;
}): Promise<GenerateOverlapReportResponse> {
  const finalConfig = { ...getDefaultConfig(), ...config };
  const contractToUse = styleContract || getDefaultStyleContract();

  if (!finalConfig.enableRewrite) {
    return { report: "" };
  }

  const { overlaps, rewrites } = await generateUnifiedOverlapsAndRewrites({
    topic,
    rewriteCount: finalConfig.premiseCount,
    styleContract: contractToUse,
    temperature: finalConfig.rewriteTemperature,
    addReminder: false,
  });

  // Convert rewrites to the expected format for generateOverlapReport
  const formattedRewrites: Rewrite[] = rewrites.map((r) => {
    const alts = Array.isArray(r.alts) ? r.alts : [];
    return {
      id: r.id,
      alts: [
        String(alts[0] ?? "").trim(),
        String(alts[1] ?? "").trim(),
        String(alts[2] ?? "").trim(),
      ] as [string, string, string],
    };
  });

  // Convert overlaps to the expected format
  const formattedOverlaps: Overlap[] = overlaps.map((o) => ({
    id: o.id,
    label: o.label,
    statement: o.statement,
  }));

  return {
    report: buildReportFromUnified(topic, formattedOverlaps, formattedRewrites),
    overlaps: formattedOverlaps,
    rewrites: formattedRewrites,
  };
}
