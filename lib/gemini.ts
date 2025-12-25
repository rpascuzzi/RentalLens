import { GoogleGenerativeAI } from "@google/generative-ai";
import * as FileSystem from 'expo-file-system/legacy';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  throw new Error('Missing Google API Key environment variable');
}

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

export async function analyzeImage(fileUri: string) {
  try {
    const base64String = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'base64',
    });

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
    });

    const prompt = "Analyze this inventory photo. Count the distinct items. Return ONLY a raw JSON object with a key 'items' which is an array of objects: { name: string, count: number, condition: string }.";

    const imagePart = {
      inlineData: {
        data: base64String,
        mimeType: "image/jpeg"
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    let text = response.text();
    
    console.log('Gemini Raw Response:', text);

    // Clean up potential markdown formatting if Gemini didn't return raw JSON
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const data = JSON.parse(text);
    
    return data.items || data; // Handle if items is missing or if data is the array itself
  } catch (error) {
    console.error("Gemini analysis error:", error);
    throw error;
  }
}
