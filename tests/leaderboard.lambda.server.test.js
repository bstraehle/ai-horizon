import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

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

const { handler } = await import("../server/lambda/leaderboard.js");

describe("leaderboard Lambda persistence", () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ Attributes: { id: 1, scores: [] } });
  });

  it("trims leaderboard payloads to the supported max entry count on PUT", async () => {
    const manyEntries = Array.from({ length: 30 }, (_, index) => ({
      id: `A${index}`,
      score: 1000 - index,
    }));

    await handler({
      httpMethod: "PUT",
      queryStringParameters: { id: "1" },
      body: JSON.stringify({ scores: manyEntries }),
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0];
    const params = command.params;
    const storedScores = params.ExpressionAttributeValues[":val0"];

    expect(Array.isArray(storedScores)).toBe(true);
    expect(storedScores).toHaveLength(25);
    expect(storedScores[0]).toMatchObject({ id: "A0", score: 1000 });
    expect(storedScores[24]).toMatchObject({ id: "A24", score: 976 });
  });
});
