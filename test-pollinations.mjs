async function test() {
  const prompt = "A photorealistic editorial shot of a 25-year-old man with a sharp jawline, wheatish skin, and short hair, wearing a navy blue linen button-down shirt and beige chinos.";
  const encodedPrompt = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=1024&nologo=true`;
  console.log("Fetching:", imageUrl);
  try {
    const res = await fetch(imageUrl);
    console.log("Status:", res.status);
    if (!res.ok) {
        const text = await res.text();
        console.log("Error body:", text);
    }
  } catch (e) {
    console.error("Fetch error:", e.message);
  }
}
test();
