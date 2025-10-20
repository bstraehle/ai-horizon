import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-west-2" });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = "ai-horizon-leaderboard";

/**
 * Lambda handler
 * @param {{httpMethod:string,queryStringParameters?:Record<string,string>,body?:string}} event
 */
export const handler = async (event) => {
  try {
    const { httpMethod, queryStringParameters, body } = event;
    let response;
    let jsonResponse;
    let updateData;

    switch (httpMethod) {
      case "GET":
        if (queryStringParameters && queryStringParameters.id) {
          console.log("DynamoDB GET request: ", queryStringParameters.id);
          response = await getItem(Number(queryStringParameters.id));
          jsonResponse = JSON.stringify(response);
          console.log("DynamoDB GET response: ", jsonResponse);
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
        console.log("DynamoDB PUT request: ", updateData);
        response = await updateItem(Number(queryStringParameters.id), updateData);
        jsonResponse = JSON.stringify(response);
        console.log("DynamoDB PUT response: ", jsonResponse);
        if (response && response.conflict) {
          return {
            statusCode: 409,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
              "Access-Control-Allow-Headers": "Content-Type",
            },
            body: jsonResponse,
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
        "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: jsonResponse,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("DynamoDB error:", message);
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
 * @param {number} id
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

  // ensure version property exists for clients implementing optimistic concurrency
  if (typeof result.Item.version !== "number") result.Item.version = 0;
  return result.Item;
}

/**
 * Update an item in the leaderboard table.
 * @param {number} id
 * @param {{[key:string]: any}} updateData
 * @returns {Promise<{message:string,item:any,conflict?:boolean}>}
 */
async function updateItem(id, updateData) {
  /** @type {{[key:string]: any}} */
  delete updateData.id;
  const nowIso = new Date().toISOString();
  updateData.updatedAt = nowIso;

  // Optimistic concurrency: expect caller to send 'version'. If absent, treat as unconditional create of version (0 -> 1).
  const providedVersion = typeof updateData.version === "number" ? updateData.version : undefined;
  // version is not directly updated in the dynamic loop below; we increment explicitly.
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

  // Always increment version atomically; add to update expression.
  updateExpressions.push("#ver = if_not_exists(#ver, :zero) + :one");
  expressionAttributeNames["#ver"] = "version";
  expressionAttributeValues[":one"] = 1;
  expressionAttributeValues[":zero"] = 0;

  let condition = "attribute_exists(id)"; // ensure item exists
  if (providedVersion !== undefined) {
    // Only match if current version equals providedVersion
    condition += " AND #ver = :expectedVersion";
    expressionAttributeValues[":expectedVersion"] = providedVersion;
  }

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
      // Fetch current item so we can return latest version + scores for client to merge
      const current = await getItem(id);
      return { conflict: true, message: "Version mismatch", item: current };
    }
    throw err;
  }
}
