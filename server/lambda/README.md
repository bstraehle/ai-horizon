````markdown
# Lambda Leaderboard Functions

This directory contains the AWS Lambda handler and sample API Gateway proxy event payloads used for local testing.

## Files

| File                        | Purpose                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `leaderboard.js`            | Lambda handler implementing GET (fetch item) & PUT (optimistic update) for the leaderboard record.              |
| `test-leaderboard-get.json` | Example API Gateway event for a GET request (`?id=1`).                                                          |
| `test-leaderboard-put.json` | Example API Gateway event for a PUT request with a JSON body containing a scores payload.                       |
| `aws-sdk.d.ts`              | Ambient module declarations to silence bundler / type tooling complaints when not using full AWS types locally. |

## Handler Contract

### GET /?id=<number>

Returns the stored leaderboard item. Ensures a numeric `version` field (default 0) for clients using optimistic concurrency.

### PUT /?id=<number>

Expects a JSON body with fields to update. Common fields:

```jsonc
{
  "scores": [{ "id": "ABC", "score": 1200 }],
  "version": 3,
}
```

If `version` is supplied the update will only succeed if the current stored version matches. On mismatch the handler returns:

```jsonc
{
  "conflict": true,
  "message": "Version mismatch",
  "item": { "id": 1, "scores": [...], "version": 4 }
}
```

## Sample Events

### test-get.json

Minimal required fields: `httpMethod` ("GET"), and `queryStringParameters.id`.

### test-put.json

Includes a stringified JSON body (mirroring how some tooling injects raw string bodies). When invoking manually ensure you provide a proper JSON string body.

## Local Testing Notes

These JSON event files are intended for local invocation frameworks (e.g. AWS SAM, serverless-offline, or a bespoke harness). They are strict JSON; comments are placed here instead of inside the files to remain spec compliant.

## Future Enhancements

1. Externalize table name and region via environment variables.
2. Add schema validation (e.g. score object shape) before performing DynamoDB update.
3. Optional pagination / multiple leaderboard rows (current design assumes a single aggregated item by id).
````
