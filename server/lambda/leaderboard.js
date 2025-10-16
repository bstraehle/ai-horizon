import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-west-2" });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = "ai-horizon-leaderboard";

/**
 * Leaderboard Lambda HTTP handler (GET / PUT) with optimistic concurrency.
 *
 * Responsibilities:
 * - GET: Fetch the leaderboard record by numeric id; ensure a numeric `version` field exists (default 0).
 * - PUT: Conditionally update the record using a version check (if client supplies `version`) and atomically increment version.
 * - Emits 409 Conflict with latest item when version mismatch to allow client merge + retry.
 * - Adds permissive CORS headers for browser invocation.
 *
 * Request Shapes:
 * - GET  /?id=1
 * - PUT  /?id=1  body: { scores: [...], version?: number, ...extraMetadata }
 *   (Client should include the last observed version for optimistic concurrency; omitted means unconditional update.)
 *
 * Response Shapes:
 * - 200 OK: { ...item } (GET) or { message, item } (PUT success)
 * - 409 Conflict (PUT): { conflict:true, message:"Version mismatch", item:{...latest} }
 * - 400: { message } for validation errors
 * - 405: { message } unsupported method
 * - 500: { message, error }
 *
 * Environment / Config:
 * - Hard-coded region 'us-west-2' and table name TABLE_NAME; adapt via env vars in production if needed.
 *
 * Error Handling:
 * - All top-level errors caught; internal conditional check failures downgraded to 409 logic in updateItem.
 *
 * @param {{httpMethod:string,queryStringParameters?:Record<string,string>,body?:string}} event Lambda proxy event.
 * @returns {Promise<{statusCode:number, headers?:Record<string,string>, body:string}>}
 */
export const handler = async (event) => {
  try {
    const { httpMethod, queryStringParameters, body } = event;
    let response;
    let updateData;

    switch (httpMethod) {
      case "GET":
        if (queryStringParameters && queryStringParameters.id) {
          response = await getItem(Number(queryStringParameters.id));
        } else {
          return { statusCode: 400, body: JSON.stringify({ message: "Missing id" }) };
        }
        break;

      case "PUT":
        if (!queryStringParameters || !queryStringParameters.id) {
          return { statusCode: 400, body: JSON.stringify({ message: "Missing id" }) };
        }
        if (!body) {
          return { statusCode: 400, body: JSON.stringify({ message: "Missing body" }) };
        }
        updateData = JSON.parse(body);
        response = await updateItem(Number(queryStringParameters.id), updateData);
        if (response && response.conflict) {
          return {
            statusCode: 409,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, PUT",
              "Access-Control-Allow-Headers": "Content-Type",
            },
            body: JSON.stringify(response),
          };
        }
        break;

      default:
        return {
          statusCode: 405,
          body: JSON.stringify({ message: "Method not allowed" }),
        };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error",
        error: message,
      }),
    };
  }
};

/**
 * Fetch leaderboard item by id.
 * Ensures a numeric `version` property for clients performing optimistic concurrency.
 * @param {number} id Partition key.
 * @returns {Promise<any>} Item object with guaranteed version field.
 * @throws {Error} When item not found.
 */
async function getItem(id) {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      id: id,
    },
  };

  const command = new GetCommand(params);
  const result = await docClient.send(command);

  if (!result.Item) {
    throw new Error(`Item with id ${id} not found`);
  }

  if (typeof result.Item.version !== "number") result.Item.version = 0;
  return result.Item;
}

/**
 * Update leaderboard record with optimistic concurrency and automatic version increment.
 *
 * Behavior:
 * - Strips client-supplied id/version from dynamic attribute update set; uses id as key; handles version separately.
 * - Adds/updates arbitrary fields provided in updateData (scores, metadata, timestamps, etc.).
 * - Always sets updatedAt ISO timestamp.
 * - Increments `version` atomically (if absent initializes to 0 then increments to 1) using if_not_exists.
 * - If client supplies `version` and it mismatches current value, returns conflict object (no throw) including latest item.
 *
 * DynamoDB Details:
 * - ConditionExpression enforces existence of id and optional version equality to detect lost update.
 * - Returns ALL_NEW attributes on success.
 *
 * @param {number} id Partition key.
 * @param {{[key:string]: any}} updateData Arbitrary fields including optional `version` (for concurrency) and `scores` array.
 * @returns {Promise<{message:string,item:any,conflict?:boolean}>} Success or conflict payload.
 */
async function updateItem(id, updateData) {
  /** @type {{[key:string]: any}} */
  delete updateData.id;
  const nowIso = new Date().toISOString();
  updateData.updatedAt = nowIso;

  const providedVersion = typeof updateData.version === "number" ? updateData.version : undefined;
  delete updateData.version;

  /** @type {string[]} */
  const updateExpressions = [];
  /** @type {{[key:string]: string}} */
  const expressionAttributeNames = {};
  /** @type {{[key:string]: any}} */
  const expressionAttributeValues = {};

  Object.keys(updateData).forEach((key, index) => {
    const attributeName = `#attr${index}`;
    const attributeValue = `:val${index}`;

    updateExpressions.push(`${attributeName} = ${attributeValue}`);
    expressionAttributeNames[attributeName] = key;
    expressionAttributeValues[attributeValue] = updateData[key];
  });

  updateExpressions.push("#ver = if_not_exists(#ver, :zero) + :one");
  expressionAttributeNames["#ver"] = "version";
  expressionAttributeValues[":one"] = 1;
  expressionAttributeValues[":zero"] = 0;

  let condition = "attribute_exists(id)";
  if (providedVersion !== undefined) {
    condition += " AND #ver = :expectedVersion";
    expressionAttributeValues[":expectedVersion"] = providedVersion;
  }

  /** @type {import('@aws-sdk/lib-dynamodb').UpdateCommandInput} */
  const params = {
    TableName: TABLE_NAME,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ConditionExpression: condition,
    ReturnValues: "ALL_NEW",
  };

  try {
    const command = new UpdateCommand(params);
    const result = await docClient.send(command);
    return {
      message: "Item updated successfully",
      item: result.Attributes,
    };
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      err.name === "ConditionalCheckFailedException"
    ) {
      const current = await getItem(id);
      return { conflict: true, message: "Version mismatch", item: current };
    }
    throw err;
  }
}
