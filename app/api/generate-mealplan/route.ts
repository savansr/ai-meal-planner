import { NextResponse } from "next/server";

const GROQ_API_URL ="https://api.groq.com/openai/v1/chat/completions"
const GROQ_API_KEY = process.env.GROQ_API_KEY; // Ensure this is set in your environment variables

export async function POST(request: Request) {
  try {
    // Extract parameters from the request body
    const { dietType, calories, allergies, cuisine, snacks } =
      await request.json();

    const prompt = `
      You are a professional nutritionist. Create a 7-day meal plan for an individual following a ${dietType} diet aiming for ${calories} calories per day.
      
      Allergies or restrictions: ${allergies || "none"}.
      Preferred cuisine: ${cuisine || "no preference"}.
      Snacks included: ${snacks ? "yes" : "no"}.
      
      For each day, provide:
        - Breakfast
        - Lunch
        - Dinner
        ${snacks ? "- Snacks" : ""}
      
      Use simple ingredients and provide brief instructions. Include approximate calorie counts for each meal.
      
      Structure the response as a JSON object where each day is a key, and each meal (breakfast, lunch, dinner, snacks) is a sub-key. Example:
      
      {
        "Monday": {
          "Breakfast": "Oatmeal with fruits - 350 calories",
          "Lunch": "Grilled chicken salad - 500 calories",
          "Dinner": "Steamed vegetables with quinoa - 600 calories",
          "Snacks": "Greek yogurt - 150 calories"
        },
        "Tuesday": {
          "Breakfast": "Smoothie bowl - 300 calories",
          "Lunch": "Turkey sandwich - 450 calories",
          "Dinner": "Baked salmon with asparagus - 700 calories",
          "Snacks": "Almonds - 200 calories"
        }
        // ...and so on for each day
      }

      Return just the json with no extra commentaries and no backticks.
    `;

    // Log the payload for debugging
    const payload = {
      model: "mixtral-8x7b-32768", // Ensure this model is supported by Groq
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    };

    console.log("Sending payload to Groq API:", JSON.stringify(payload, null, 2));

    // Send the prompt to the Groq API
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    // Log the response status for debugging
    console.log("Groq API response status:", response.status);

    // Check if the response is successful
    if (!response.ok) {
      const errorResponse = await response.json(); // Try to parse the error response
      console.error("Groq API error response:", errorResponse);
      throw new Error(`Groq API request failed with status: ${response.status}`);
    }

    // Extract the AI's response
    const data = await response.json();
    console.log("Groq API response data:", JSON.stringify(data, null, 2));

    const aiContent = data.choices[0].message.content.trim();

    // Attempt to parse the AI's response as JSON
    let parsedMealPlan: { [day: string]: DailyMealPlan };
    console.log("AI response content:", aiContent);
    try {
      parsedMealPlan = JSON.parse(aiContent);
    } catch (parseError) {
      console.error("Error parsing AI response as JSON:", parseError);
      // If parsing fails, return the raw text with an error message
      return NextResponse.json(
        { error: "Failed to parse meal plan. Please try again." },
        { status: 500 }
      );
    }

    // Validate the structure of the parsedMealPlan
    if (typeof parsedMealPlan !== "object" || parsedMealPlan === null) {
      throw new Error("Invalid meal plan format received from AI.");
    }

    // Optionally, perform additional validation on the structure here

    // Return the parsed meal plan
    return NextResponse.json({ mealPlan: parsedMealPlan });
  } catch (error) {
    console.error("Error generating meal plan:", error);
    return NextResponse.json(
      { error: "Failed to generate meal plan. Please try again later." },
      { status: 500 }
    );
  }
}

// Define the DailyMealPlan interface here or import it if defined elsewhere
interface DailyMealPlan {
  Breakfast?: string;
  Lunch?: string;
  Dinner?: string;
  Snacks?: string;
}