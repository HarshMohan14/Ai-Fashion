import { GoogleGenerativeAI } from '@google/generative-ai';

async function test() {
  const genAI = new GoogleGenerativeAI('AIzaSyB5IMomyqdVLVr7wslvxv6JSJGH0e6l2mg');
  const modelsToTest = ['imagen-4.0-generate-001', 'gemini-2.5-flash-image'];

  for (const modelName of modelsToTest) {
    try {
      console.log(`Testing ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("A photorealistic cute cat.");
      
      const parts = result.response.candidates?.[0]?.content?.parts ?? [];
      let success = false;
      for (const part of parts) {
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
}

test();
