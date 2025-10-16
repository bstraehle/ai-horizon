import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = new BedrockRuntimeClient({
  region: "us-west-2",
  maxAttempts: 3,
});

/**
 * Lambda handler
 * @param {{httpMethod:string,body?:string}} event
 */
export const handler = async (event) => {
  try {
    const { httpMethod, body } = event;
    let response;

    switch (httpMethod) {
      case "POST":
        if (body) {
          response = await analysis(body);
        } else {
          return { statusCode: 400, body: JSON.stringify({ message: "Missing request body" }) };
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
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    //console.error("Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify({
        message: "Internal server error",
        error: message,
      }),
    };
  }
};

/**
 * Analyze a game summary using Bedrock and return a structured response.
 * @param {string} body - The game summary / prompt to analyze
 */
async function analysis(body) {
  const modelId =
    "arn:aws:bedrock:us-west-2:819097794827:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0";

  var prompt =
    'You are a senior analyst for "AI HORIZON", a fast, arcade-style space shooter, in which a player needs to collect stars, blast asteroids, and beat the clock. Based on the provided scoring rules, general tips (in order of importance), and game summary, provide your analysis (in order of importance) to help the player improve. Respond in the provided answer format, do not include JSON backticks. <scoring rules - start> - Unlimited shots - Regular asteroids: +10 - Hardened asteroids (10 hits): +100 - 5 bonus asteroids (10 hits): +250 - Regular stars: +25 - Bonus stars: +50 - Every 1000 points: +250 - Last 10 seconds: all asteroid and star points are doubled - End of run accuracy bonus (0-100%): +(score × asteroids destroyed / shots fired) <scoring rules - end> <general tips - start> 1. Play full 60 seconds 2. Maximize double points in last 10 seconds 3. Destroy all 5 bonus asteroids 4. Collect more bonus stars 5. Increase shot accuracy with short bursts for accuracy bonus 6. Destroy more hardened asteroids 7. Collect more stars 8. Destroy more asteroids <general tips - end> <game summary - start> %%prompt%% <game summary - end> <answer format - start> { "feedback": "<friendly feedback to game play in less than 10 words in language based on locale>", "specific-tip-1": "<emoji> <1. General tip in less than 10 words in language based on locale, give specific example from game summary>", "specific-tip-2": "<emoji> <2. General tip in less than 10 words in language based on locale, give specific example from game summary>", "specific-tip-3": "<emoji> <3. General tip in less than 10 words in language based on locale, give specific example from game summary>", "specific-tip-4": "<emoji> <4. General tip in less than 10 words in language based on locale, give specific example from game summary>", "specific-tip-5": "<emoji> <5. General tip in less than 10 words in language based on locale, give specific example from game summary>", "specific-tip-6": "<emoji> <6. General tip in less than 10 words in language based on locale, give specific example from game summary>", "specific-tip-7": "<emoji> <7. General tip in less than 10 words in language based on locale, give specific example from game summary>", "specific-tip-8": "<emoji> <8. General tip in less than 10 words in language based on locale, give specific example from game summary>" } <answer format - end> Your answer:';

  prompt = prompt.replace("%%prompt%%", body);

  const requestBody = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  const command = new InvokeModelCommand({
    modelId: modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(requestBody),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  return responseBody.content[0].text;
}
