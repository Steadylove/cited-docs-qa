import { describe, expect, it } from "vitest";
import { demoEmbed } from "@/lib/embed-demo";
import { cosine, fuseByRank, rankChunks } from "@/lib/retrieve";
import { overlapScore } from "@/lib/tokens";

describe("demo retrieval", () => {
  it("hashes the same text to the same unit vector and ranks related text closer", () => {
    const [left, right] = demoEmbed(["sick leave policy", "sick leave policy"]).vectors;
    expect(left).toEqual(right);
    expect(cosine(left!, right!)).toBeCloseTo(1, 6);

    const question = demoEmbed(["Does sick leave roll over?"]).vectors[0]!;
    const sick = demoEmbed(["Sick leave is 10 days per year and does not roll over."]).vectors[0]!;
    const payday = demoEmbed(["Payday is the 15th and the last business day of the month."]).vectors[0]!;
    expect(cosine(question, sick)).toBeGreaterThan(cosine(question, payday));
  });

  it("matches light inflections and fuses a passage that both lists agree on", () => {
    expect(overlapScore("how many people does the company employ", "The company employs 86 people")).toBeGreaterThan(
      0.6,
    );
    const fused = fuseByRank([
      [{ id: "only-vector" }, { id: "both" }],
      [{ id: "both" }],
    ]);
    expect(fused[0]?.id).toBe("both");
    expect(fused[0]?.fusedScore).toBeGreaterThan(fused[1]?.fusedScore ?? 0);
  });

  it("orders hybrid hits by the fused score it reports", () => {
    const ranked = rankChunks(
      [
        {
          id: "vector-only",
          pageNumber: 1,
          chunkIndex: 0,
          content: "unrelated payroll calendar",
          charStart: 0,
          charEnd: 10,
          embedding: [1, 0],
        },
        {
          id: "both",
          pageNumber: 2,
          chunkIndex: 1,
          content: "sick leave does not roll over",
          charStart: 0,
          charEnd: 10,
          embedding: [0.2, 0.8],
        },
      ],
      [0, 1],
      "sick leave roll over",
      2,
      true,
    );
    expect(ranked.map((chunk) => chunk.id)[0]).toBe("both");
    const scores = ranked.map((chunk) => chunk.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores[0]).not.toBeCloseTo(cosine([0.2, 0.8], [0, 1]), 5);
  });
});
