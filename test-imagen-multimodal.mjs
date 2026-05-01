import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

async function test() {
  const genAI = new GoogleGenerativeAI('AIzaSyB5IMomyqdVLVr7wslvxv6JSJGH0e6l2mg');
  const modelName = 'gemini-2.5-flash-image';

  try {
    console.log(`Testing ${modelName} with an image input...`);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    // Create a dummy 1x1 pixel base64 image for testing
    const dummyImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    const parts = [
      { text: "Use this image as a reference for the person's face. Generate a photorealistic cute cat." },
      { inlineData: { data: dummyImageBase64, mimeType: "image/png" } }
    ];

    const result = await model.generateContent(parts);
    
    const resParts = result.response.candidates?.[0]?.content?.parts ?? [];
    let success = false;
    for (const part of resParts) {
      if (part.inlineData && part.inlineData.data) {
        console.log(`SUCCESS! ${modelName} returned an image. Data length: ${part.inlineData.data.length}`);
        success = true;
        break;
      }
    }
    if (!success) {
       console.log(`No image returned by ${modelName}. Response text:`, result.response.text());
    }
  } catch (e) {
    console.error(`Error with ${modelName}:`, e.message);
  }
}

test();
