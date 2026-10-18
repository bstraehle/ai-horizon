#!/usr/bin/env node
/**
 * leaderboard-remove – remove one entry (by initials) from the production leaderboard.
 *
 * Usage:
 *   node scripts/leaderboard-remove.cjs ABC          # dry run: print the board and the match
 *   node scripts/leaderboard-remove.cjs ABC --yes    # remove it
 *   node scripts/leaderboard-remove.cjs ABC --yes --id=1
 *
 * Uses your local AWS credentials (DynamoDB table `ai-horizon-leaderboard`, us-west-2). The write
 * is conditional on the board `version`, like the leaderboard Lambda, so a score submitted between
 * the read and the write is never lost; rerun the command if it reports a conflict.
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = "ai-horizon-leaderboard";
const args = process.argv.slice(2);
const initials = (args.find((a) => !a.startsWith("--")) || "").toUpperCase();
const confirmed = args.includes("--yes");
const id = Number((args.find((a) => a.startsWith("--id=")) || "--id=1").split("=")[1]);

async function main() {
  if (!/^[A-Z]{1,3}$/.test(initials) || !Number.isInteger(id)) {
    console.error("Usage: node scripts/leaderboard-remove.cjs <INITIALS> [--yes] [--id=1]");
    process.exit(2);
  }
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-west-2" }));
  const { Item: item } = await db.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
  if (!item) throw new Error(`Leaderboard ${id} not found`);
  const scores = Array.isArray(item.scores) ? item.scores : [];
  const version = typeof item.version === "number" ? item.version : 0;

  console.log(`Leaderboard ${id} (version ${version}):`);
  scores.forEach((e, i) => {
    const mark = e.id === initials ? "  <-- remove" : "";
    console.log(`  ${String(i + 1).padStart(2)}. ${e.id} ${e.score} ${e.date || ""}${mark}`);
  });
  if (!scores.some((e) => e.id === initials)) {
    console.error(`No entry for ${initials}.`);
    process.exit(1);
  }
  if (!confirmed) {
    console.log("Dry run. Add --yes to remove the entry.");
    return;
  }

  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: "SET #scores = :scores, #updatedAt = :now, #ver = #ver + :one",
        ConditionExpression: "#ver = :expected",
        ExpressionAttributeNames: {
          "#scores": "scores",
          "#updatedAt": "updatedAt",
          "#ver": "version",
        },
        ExpressionAttributeValues: {
          ":scores": scores.filter((e) => e.id !== initials),
          ":now": new Date().toISOString(),
          ":one": 1,
          ":expected": version,
        },
      })
    );
  } catch (err) {
    if (err && err.name === "ConditionalCheckFailedException") {
      console.error(
        "The board changed while removing; nothing was written. Run the command again."
      );
      process.exit(1);
    }
    throw err;
  }
  console.log(`Removed ${initials} (board version ${version + 1}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
