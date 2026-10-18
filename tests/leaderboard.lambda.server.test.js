import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const snsSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class GetCommand {
    constructor(params) {
      this.params = params;
    }
  }

  class UpdateCommand {
    constructor(params) {
      this.params = params;
    }
  }

  return {
    DynamoDBDocumentClient: {
      from: () => ({ send: sendMock }),
    },
    GetCommand,
    UpdateCommand,
  };
});

vi.mock("@aws-sdk/client-sns", () => ({
  SNSClient: class {
    send(cmd) {
      return snsSend(cmd);
    }
  },
  PublishCommand: class {
    constructor(params) {
      this.params = params;
    }
  },
}));

const { handler, MAX_SCORE, MAX_TEXT_LENGTH } = await import("../server/lambda/leaderboard.js");

/** @param {any} body */
const put = (body) =>
  handler({
    httpMethod: "PUT",
    queryStringParameters: { id: "1" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    requestContext: { identity: { sourceIp: "203.0.113.7" } },
  });

/**
 * Build a submission whose run summary is consistent: `kills` regular asteroids, two shots per
 * kill (50% accuracy), milestone bonuses applied exactly as ScoringManager does.
 * @param {string} id
 * @param {number} kills 1..220
 */
function run(id, kills) {
  let base = 0;
  for (let i = 0; i < kills; i++) {
    const before = base;
    base += 10;
    base += 250 * (Math.floor(base / 1000) - Math.floor(before / 1000));
  }
  const accuracyBonus = Math.round(base * 0.5);
  const score = base + accuracyBonus;
  const summary = {
    timer: { totalSeconds: 90, survivedSeconds: 90, missedSeconds: 0 },
    score: {
      playerBaseScore: base,
      playerAccuracyBonus: accuracyBonus,
      playerBaseScoreFinale: 0,
      playerFinaleBonus: 0,
      playerFinalScore: score,
    },
    stats: {
      regularStarsEncountered: 150,
      regularStarsCollected: 0,
      bonusStarsEncountered: 30,
      bonusStarsCollected: 0,
      regularAsteroidsEncountered: 300,
      regularAsteroidsKilled: kills,
      hardenedAsteroidsEncountered: 60,
      hardenedAsteroidsKilled: 0,
      bonusAsteroidsEncountered: 8,
      bonusAsteroidsKilled: 0,
      shotsFiredTotal: kills * 2,
      shotsFiredHitTarget: kills,
    },
  };
  return { id, score, accuracy: 0.5, "game-summary": JSON.stringify(summary) };
}

/**
 * Route GetCommand to the stored item and UpdateCommand to `onUpdate` (default: echo the write).
 * @param {any[]} scores
 * @param {(params:any)=>any} [onUpdate]
 */
function mockTable(scores, onUpdate) {
  sendMock.mockImplementation(async (command) => {
    const { params } = command;
    if (!params.UpdateExpression)
      return { Item: { id: 1, version: 7, scores: structuredClone(scores) } };
    if (onUpdate) return onUpdate(params);
    return {
      Attributes: { id: 1, version: 8, scores: params.ExpressionAttributeValues[":scores"] },
    };
  });
}

const updateCalls = () => sendMock.mock.calls.filter(([c]) => c.params.UpdateExpression);

const fullBoard = Array.from({ length: 10 }, (_, i) => ({
  id: `A${String.fromCharCode(65 + i)}`,
  score: 1000 - i * 10,
}));

describe("leaderboard Lambda single-entry submissions", () => {
  beforeEach(() => {
    sendMock.mockReset();
    snsSend.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("ranks the entry server-side and writes with a version condition", async () => {
    mockTable([
      { id: "AAA", score: 500 },
      { id: "BBB", score: 100 },
    ]);
    const submitted = run("CCC", 20);
    expect(submitted.score).toBe(300);

    const res = await put({ entry: { ...submitted, extra: "x" } });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accepted).toBe(true);
    expect(body.version).toBe(8);
    expect(body.scores.map((e) => e.id)).toEqual(["AAA", "CCC", "BBB"]);

    const [update] = updateCalls();
    const values = update[0].params.ExpressionAttributeValues;
    expect(values[":expected"]).toBe(7);
    const stored = values[":scores"].find((e) => e.id === "CCC");
    expect(stored).toEqual({ ...submitted, date: new Date().toISOString().slice(0, 10) });
  });

  it("keeps the board at 10 entries and rejects scores below the cutoff without writing", async () => {
    mockTable(fullBoard);

    const below = JSON.parse((await put({ entry: run("ZZZ", 60) })).body);
    expect(below.accepted).toBe(false);
    expect(below.scores).toHaveLength(10);
    expect(updateCalls()).toHaveLength(0);

    const above = JSON.parse((await put({ entry: run("ZZZ", 100) })).body);
    expect(above.accepted).toBe(true);
    expect(above.scores).toHaveLength(10);
    expect(above.scores[0].id).toBe("ZZZ");
    expect(above.scores.some((e) => e.id === "AJ")).toBe(false);
  });

  it("keeps only the higher score for existing initials", async () => {
    mockTable([{ id: "AAA", score: 500 }]);

    const lower = JSON.parse((await put({ entry: run("AAA", 20) })).body);
    expect(lower.accepted).toBe(false);
    expect(updateCalls()).toHaveLength(0);

    const higher = JSON.parse((await put({ entry: run("AAA", 40) })).body);
    expect(higher.accepted).toBe(true);
    expect(higher.scores).toEqual([expect.objectContaining({ id: "AAA", score: 600 })]);
  });

  it.each([
    ["legacy full-list payload", { scores: fullBoard, version: 7 }],
    ["blocked initials", { entry: run("ASS", 10) }],
    ["malformed initials", { entry: { ...run("ABC", 10), id: "abcd" } }],
    ["non-integer score", { entry: { ...run("ABC", 10), score: 10.5 } }],
    ["zero score", { entry: { ...run("ABC", 10), score: 0 } }],
    ["implausible score", { entry: { ...run("ABC", 10), score: MAX_SCORE + 1 } }],
    ["missing run summary", { entry: { id: "ABC", score: 150 } }],
    ["score not matching its summary", { entry: { ...run("ABC", 10), score: 151 } }],
    [
      "oversized run summary",
      { entry: { ...run("ABC", 10), "game-summary": "x".repeat(MAX_TEXT_LENGTH + 1) } },
    ],
    ["invalid JSON", "{not json"],
  ])("rejects %s with 400 and never touches DynamoDB", async (_label, body) => {
    const res = await put(body);
    expect(res.statusCode).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("drops oversized or non-string ai-analysis and out-of-range accuracy", async () => {
    mockTable([]);
    const submitted = run("ABC", 10);

    await put({ entry: { ...submitted, accuracy: 7, "ai-analysis": { feedback: "object" } } });

    const stored = updateCalls()[0][0].params.ExpressionAttributeValues[":scores"][0];
    expect(stored).toEqual({
      id: "ABC",
      score: submitted.score,
      date: expect.any(String),
      "game-summary": submitted["game-summary"],
    });
  });

  it("retries when a concurrent write wins, then returns 409 after repeated conflicts", async () => {
    let failures = 1;
    const conflict = () => {
      const err = new Error("conditional");
      err.name = "ConditionalCheckFailedException";
      throw err;
    };
    mockTable([], (params) => {
      if (failures-- > 0) conflict();
      return {
        Attributes: { id: 1, version: 9, scores: params.ExpressionAttributeValues[":scores"] },
      };
    });
    expect((await put({ entry: run("ABC", 10) })).statusCode).toBe(200);
    expect(updateCalls()).toHaveLength(2);

    sendMock.mockReset();
    mockTable([], conflict);
    const res = await put({ entry: run("ABC", 10) });
    expect(res.statusCode).toBe(409);
    expect(updateCalls()).toHaveLength(3);
  });

  it("returns 404 when the leaderboard item does not exist", async () => {
    sendMock.mockResolvedValue({});
    expect((await put({ entry: run("ABC", 10) })).statusCode).toBe(404);
    expect(
      (await handler({ httpMethod: "GET", queryStringParameters: { id: "2" } })).statusCode
    ).toBe(404);
  });

  it("stores device details but never returns them from GET or PUT", async () => {
    const device = { userAgent: "UA", width: 360, height: 800, locale: "en-US", timeZone: "UTC" };
    const withDevice = (e) => {
      const summary = JSON.parse(e["game-summary"]);
      return { ...e, "game-summary": JSON.stringify({ ...summary, device }) };
    };
    const other = withDevice(run("OLD", 30));
    mockTable([other]);

    const putRes = JSON.parse((await put({ entry: withDevice(run("NEW", 40)) })).body);
    const stored = updateCalls()[0][0].params.ExpressionAttributeValues[":scores"];
    expect(stored.every((e) => JSON.parse(e["game-summary"]).device)).toBe(true);
    expect(putRes.scores).toHaveLength(2);

    const getRes = JSON.parse(
      (await handler({ httpMethod: "GET", queryStringParameters: { id: "1" } })).body
    );
    for (const e of [...putRes.scores, ...getRes.scores]) {
      const summary = JSON.parse(e["game-summary"]);
      expect(summary.device).toBeUndefined();
      expect(summary.stats.regularAsteroidsKilled).toBeGreaterThan(0);
    }
  });

  it("trims stored lists to 10 entries on GET", async () => {
    mockTable([...fullBoard, { id: "ZZZ", score: 1 }, { id: "ZZY", score: 0 }]);
    const res = await handler({ httpMethod: "GET", queryStringParameters: { id: "1" } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).scores).toHaveLength(10);
  });
});

describe("leaderboard Lambda alerts", () => {
  const TOPIC = "arn:aws:sns:us-west-2:000000000000:ai-horizon-alerts";

  beforeEach(() => {
    sendMock.mockReset();
    snsSend.mockReset();
    snsSend.mockResolvedValue({});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    // Jump past any rejection-alert cooldown left by earlier tests.
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    process.env.ALERT_TOPIC_ARN = TOPIC;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ALERT_TOPIC_ARN;
  });

  it("e-mails a new #1 with the run summary and a removal command", async () => {
    mockTable([{ id: "AAA", score: 500 }]);

    expect((await put({ entry: run("NEW", 100) })).statusCode).toBe(200);

    expect(snsSend).toHaveBeenCalledTimes(1);
    const { params } = snsSend.mock.calls[0][0];
    expect(params.TopicArn).toBe(TOPIC);
    expect(params.Subject).toBe("AI Horizon: new #1 NEW 1875");
    const message = JSON.parse(params.Message);
    expect(message.runnerUp).toEqual({ id: "AAA", score: 500 });
    expect(message.sourceIp).toBe("203.0.113.7");
    expect(message.summary.stats.regularAsteroidsKilled).toBe(100);
    expect(message.remove).toBe("node scripts/leaderboard-remove.cjs NEW --yes");
  });

  it("does not alert for entries below #1 or when no topic is configured", async () => {
    mockTable([{ id: "AAA", score: 5000 }]);
    await put({ entry: run("LOW", 20) });
    expect(snsSend).not.toHaveBeenCalled();

    delete process.env.ALERT_TOPIC_ARN;
    mockTable([]);
    await put({ entry: run("TOP", 20) });
    expect(snsSend).not.toHaveBeenCalled();
  });

  it("e-mails a rejected run summary at most once per cooldown window", async () => {
    const forged = { ...run("BAD", 10), score: 151 };

    await put({ entry: forged });
    await put({ entry: forged });
    expect(snsSend).toHaveBeenCalledTimes(1);
    expect(snsSend.mock.calls[0][0].params.Subject).toBe(
      "AI Horizon: rejected BAD 151 (score does not match summary)"
    );

    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    await put({ entry: forged });
    expect(snsSend).toHaveBeenCalledTimes(2);
  });

  it("still accepts the submission when SNS fails", async () => {
    snsSend.mockRejectedValue(new Error("sns down"));
    mockTable([]);
    expect((await put({ entry: run("TOP", 20) })).statusCode).toBe(200);
  });
});
