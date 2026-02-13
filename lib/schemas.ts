import { z } from "zod";

const sentence = z.string().min(8);

export const reportRequestSchema = z.object({
  premise: z.string().min(12).max(2000),
  styleId: z.string().min(2)
});

const overlapItem = z.object({
  world: z.string().min(2),
  a: z.string().min(2),
  b: z.string().min(2),
  overlap: sentence
});

const outerItem = z.object({
  world: z.string().min(2),
  seed: z.string().min(2),
  a: z.string().min(2),
  b: z.string().min(2),
  overlap: sentence
});

const compressionItem = z.object({
  world: z.string().min(2),
  a: z.string().min(2),
  b: z.string().min(2),
  line: sentence
});

export const phase1Schema = z
  .object({
    premise: z.string().min(12),
    core: z.array(overlapItem).min(10).max(15),
    outer: z.array(outerItem).min(12).max(25),
    compression: z.array(compressionItem).min(5).max(10)
  })
  .strict();

export const phase2Schema = z
  .object({
    report: z
      .string()
      .min(100)
      .includes("John Branyan's Overlap Comedy Engine — Overlap Analysis Report")
  })
  .strict();
