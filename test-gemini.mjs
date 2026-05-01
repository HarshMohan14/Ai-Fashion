import { GoogleGenerativeAI } from '@google/generative-ai';

async function test() {
  const genAI = new GoogleGenerativeAI('AIzaSyB5IMomyqdVLVr7wslvxv6JSJGH0e6l2mg');
  try {
    const model = genAI.getGenerativeModel({ model: 'imagen-3.0-generate-001' });
    const result = await model.generateContent("A cute cat with a blue hat.");
    console.log("Success with imagen-3.0-generate-001");
    // console.log(JSON.stringify(result.response, null, 2));
  } catch (e) {
    console.error("Error with imagen-3.0-generate-001:", e.message);
  }
}

test();
