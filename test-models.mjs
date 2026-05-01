import { GoogleGenerativeAI } from '@google/generative-ai';

async function listModels() {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyB5IMomyqdVLVr7wslvxv6JSJGH0e6l2mg`);
    const data = await res.json();
    console.log("Models:", data.models.map(m => m.name).filter(name => name.includes('imagen') || name.includes('image')));
  } catch(e) {
    console.error(e);
  }
}
listModels();
