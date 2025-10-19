import { describe, it } from "vitest";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("LeaderboardManager visual formatting check", () => {
  it("displays all data for ranks 1-10", () => {
    const entries = [
      { id: "AAA", score: 1000, accuracy: 0.95, date: "2025-10-18" },
      { id: "BBB", score: 900, accuracy: 0.88, date: "2025-10-17" },
      { id: "CCC", score: 800, accuracy: 0.82, date: "2025-10-16" },
      { id: "DDD", score: 700, accuracy: 0.75, date: "2025-10-15" },
      { id: "EEE", score: 600, accuracy: 0.7, date: "2025-10-14" },
      { id: "FFF", score: 500, accuracy: 0.65, date: "2025-10-13" },
      { id: "GGG", score: 400, accuracy: 0.6, date: "2025-10-12" },
      { id: "HHH", score: 300, accuracy: 0.55, date: "2025-10-11" },
      { id: "III", score: 200, accuracy: 0.5, date: "2025-10-10" },
      { id: "JJJ", score: 100, accuracy: 0.45, date: "2025-10-09" },
    ];

    console.log("\n=== Leaderboard Formatting Test ===\n");

    entries.forEach((entry, index) => {
      const formatted = LeaderboardManager.formatRow(entry, index);
      console.log(`Rank ${formatted.rank}: ${formatted.text}`);
      console.log(`  Medal: "${formatted.medal}"`);
      console.log(`  Icon: "${formatted.icon}"`);
      console.log(`  Accuracy: "${formatted.accuracyFormatted}"`);
      console.log(`  Date: "${formatted.dateFormatted}"`);
      console.log();
    });

    console.log("\n=== Using formatRows (what actually renders) ===\n");
    const textLines = LeaderboardManager.formatRows(entries);
    textLines.forEach((line, index) => {
      console.log(`${index + 1}. ${line}`);
    });
  });
});
