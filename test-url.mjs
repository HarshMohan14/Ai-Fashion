async function test() {
    const synthesizedPrompt = "A highly detailed, continuous, photorealistic image generation prompt describing this exact person wearing these exact clothes. The model is a man with wheatish skin. He is wearing a white t-shirt and blue jeans. Incorporate this style context: casual summer wear. This is a very long prompt to simulate the 800 character limit. ".repeat(6);
    const truncated = synthesizedPrompt.slice(0, 800);
    const encodedPrompt = encodeURIComponent(truncated);
    const seed = 12345;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=1024&nologo=true&seed=${seed}`;
    console.log("URL length:", imageUrl.length);
    console.log("URL:", imageUrl);
    
    try {
        const res = await fetch(imageUrl);
        console.log("Fetch Status:", res.status);
        console.log("Content-Type:", res.headers.get('content-type'));
    } catch(e) {
        console.error("Error:", e.message);
    }
}
test();
