/**
 * Static AWS endpoint configuration shared by the lazily loaded Cognito client and its callers.
 *
 * Deliberately SDK-free: the game bundle needs the API endpoint (for local/offline repository
 * setup) long before – or without ever – downloading the AWS SDK chunk that performs SigV4 signing.
 */
export const AWS_CONFIG = Object.freeze({
  identityPoolId: "us-west-2:3039071f-2d61-42c8-a869-af7594fa2c7d",
  region: "us-west-2",
  apiEndpoint: "https://0p6x6bw6c2.execute-api.us-west-2.amazonaws.com/dev/leaderboard",
});
