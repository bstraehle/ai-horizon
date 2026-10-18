import { describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: class {} }));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: vi.fn() }) },
  GetCommand: class {},
  UpdateCommand: class {},
}));
vi.mock("@aws-sdk/client-sns", () => ({ SNSClient: class {}, PublishCommand: class {} }));

const client = await import("../js/utils/initials.js");
const server = await import("../server/lambda/leaderboard.js");

describe("leaderboard initials rules", () => {
  it("keeps the client and Lambda blocklists identical", () => {
    expect([...client.BLOCKED_INITIALS].sort()).toEqual([...server.BLOCKED_INITIALS].sort());
  });

  it.each([client.isAllowedInitials, server.isAllowedInitials])(
    "accepts 1-3 upper-case letters and rejects blocked or malformed initials",
    (isAllowed) => {
      expect(isAllowed("BJS")).toBe(true);
      expect(isAllowed("A")).toBe(true);
      expect(isAllowed("ASS")).toBe(false);
      expect(isAllowed("abc")).toBe(false);
      expect(isAllowed("ABCD")).toBe(false);
      expect(isAllowed("???")).toBe(false);
      expect(isAllowed("")).toBe(false);
      expect(isAllowed(undefined)).toBe(false);
    }
  );
});
