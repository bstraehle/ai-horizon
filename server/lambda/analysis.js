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
    'You are a senior analyst for AI HORIZON, a fast, arcade-style space shooter, in which a player has 60 seconds to collect stars and destroy asteroids without getting killed by an asteroid. Based on the provided scoring rules, general tips (in order of importance), and game summary, provide your analysis (in the same order of importance as the general tips) to help the player improve. Respond in the provided answer format, do not include JSON backticks.\n<scoring rules - start>\n- Regular asteroids: +10\n- Hardened asteroids (10 hits): +100\n- 5 bonus asteroids (10 hits): +250\n- Regular stars: +25\n- Bonus stars: +50\n- Every 1000 points: +250\n- Finale (last 10 seconds): all points double\n- End of run accuracy bonus (0-100%)\n<scoring rules - end>\n<general tips - start>\n1. Don\'t get killed by an asteroid, play the full 60 seconds.\n2. Finish strong during the double-point finale (last 10 seconds)\n3. Destroy all 5 bonus asteroids\n4. Collect more bonus stars\n5. With unlimited shots, increase shots fired accuracy for end of run bonus (0-100%)\n6. Destroy more hardened asteroids\n7. Collect more regular stars - aim for clusters\n8. Destroy more regular asteroids - aim for clusters\n<general tips - end>\n<game summary - start>\n%%prompt%%\n<game summary - end>\n<answer format - start>\n{\n"feedback": "<friendly feedback to game play with optional reference to leaderboard in less than 10 words in language based on locale (no emojis)>",\n"specific-tip-1": "⏱️ <1. General tip in less than 10 words in language based on locale, give specific example from game summary>",\n"specific-tip-2": "🎮 <2. General tip in less than 10 words in language based on locale, give specific example from game summary>",\n"specific-tip-3": "🌑 <3. General tip in less than 10 words in language based on locale, give specific example from game summary>",\n"specific-tip-4": "🌟 <4. General tip in less than 10 words in language based on locale, give specific example from game summary>",\n"specific-tip-5": "🎯 <5. General tip in less than 10 words in language based on locale, give specific example from game summary>",\n"specific-tip-6": "🛡️ <6. General tip in less than 10 words in language based on locale, give specific example from game summary>",\n"specific-tip-7": "⭐ <7. General tip in less than 10 words in language based on locale, give specific example from game summary>",\n"specific-tip-8": "🪨 <8. General tip in less than 10 words in language based on locale, give specific example from game summary>"\n}\n<answer format - end>\nYour answer:';

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
