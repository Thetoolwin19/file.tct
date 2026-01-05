import { GoogleGenAI } from "@google/genai";

export const summarizeContent = async (text: string): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing");
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // We use flash for speed and cost effectiveness on large text chunks
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Please provide a concise summary (max 3 sentences) of the following text, focusing on the main topics. Text: ${text.substring(0, 10000)}`, // Limit chars to avoid token limits
    });

    return response.text || "No summary available.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating summary.";
  }
};