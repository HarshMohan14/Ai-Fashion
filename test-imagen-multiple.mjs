import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

async function test() {
  const genAI = new GoogleGenerativeAI('AIzaSyB5IMomyqdVLVr7wslvxv6JSJGH0e6l2mg');
  const modelName = 'gemini-2.5-flash-image';

  try {
    console.log(`Testing ${modelName} with multiple images...`);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    // Create dummy base64 images for testing
    const dummyImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    const parts = [
      { text: "reference_image_1 (model photosheet): this is the ONLY identity source — keep the exact face, skin tone, hair, height, and body proportions." },
      { inlineData: { data: dummyImageBase64, mimeType: "image/png" } },
      { text: "reference_image_2 (wardrobe garment): dress the same subject in this garment exactly as shown." },
      { inlineData: { data: dummyImageBase64, mimeType: "image/png" } },
      { text: "reference_image_3 (wardrobe garment): dress the same subject in this garment exactly as shown." },
      { inlineData: { data: dummyImageBase64, mimeType: "image/png" } },
      { text: "A continuous, photorealistic image generation prompt describing this exact person wearing these exact clothes. The model is a man with wheatish skin. He is wearing a white t-shirt and blue jeans." }
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
