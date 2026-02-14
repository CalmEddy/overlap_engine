import { describe, expect, it } from "vitest";
import { phase1Schema, phase2Schema, unifiedOutputSchema } from "@/lib/schemas";

describe("schema guards", () => {
  it("accepts valid phase1 json", () => {
    const sample = {
      premise: "Parents now need an app to negotiate bedtime.",
      core: Array.from({ length: 10 }).map((_, i) => ({
        world: "family",
        a: `anchor-a-${i}`,
        b: `anchor-b-${i}`,
        overlap: "This is one concrete overlap sentence with enough length."
      })),
      outer: Array.from({ length: 12 }).map((_, i) => ({
        world: "remote",
        seed: `seed-${i}`,
        a: `anchor-a-${i}`,
        b: `anchor-b-${i}`,
        overlap: "This is one concrete outer overlap sentence with enough length."
      })),
      compression: Array.from({ length: 5 }).map((_, i) => ({
        world: "line",
        a: `anchor-a-${i}`,
        b: `anchor-b-${i}`,
        line: "This is one compression sentence with enough length."
      }))
    };

    expect(() => phase1Schema.parse(sample)).not.toThrow();
  });

  it("rejects missing report title in phase2", () => {
    expect(() => phase2Schema.parse({ report: "bad report" })).toThrow();
  });

  it("validates unified payload shape with linked rewrite ids", () => {
    const topic = "Horse quality hay for sale";
    const jokeCount = 10;
    const overlaps = Array.from({ length: 10 }).map((_, i) => ({
      id: `A${i + 1}`,
      label: `${topic} angle ${i + 1}`,
      statement: `Overlap statement ${i + 1} keeps the same premise anchor in a concrete sentence.`
    }));
    const rewrites = Array.from({ length: jokeCount }).map((_, i) => ({
      id: overlaps[i].id,
      alts: [
        `Alt one for ${overlaps[i].id} in certain language.`,
        `Alt two for ${overlaps[i].id} in certain language.`,
        `Alt three for ${overlaps[i].id} in certain language.`
      ]
    }));

    const parsed = unifiedOutputSchema.parse({ overlaps, rewrites });
    expect(parsed.overlaps.length).toBeGreaterThanOrEqual(10);
    expect(parsed.overlaps.length).toBeLessThanOrEqual(15);
    expect(parsed.rewrites.length).toBe(jokeCount);
    parsed.rewrites.forEach((rewrite) => {
      expect(rewrite.alts).toHaveLength(3);
      expect(parsed.overlaps.some((overlap) => overlap.id === rewrite.id)).toBe(true);
    });
  });
});
