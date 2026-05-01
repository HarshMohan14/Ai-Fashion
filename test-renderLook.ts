import { renderLook } from './src/lib/nanoBanana.ts';
import 'dotenv/config';

async function test() {
  try {
    const res = await renderLook({
      prompt: "casual wear",
      referenceUrls: [
        "https://erbudndgtrlcwbmowgtj.supabase.co/storage/v1/object/public/models/mock.jpg",
        "https://erbudndgtrlcwbmowgtj.supabase.co/storage/v1/object/public/wardrobe/shirt.jpg"
      ]
    });
    console.log("SUCCESS:", res);
  } catch(e) {
    console.error("ERROR:", e);
  }
}
test();
