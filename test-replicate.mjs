import fs from 'fs';

// Read token manually since we don't have Vite env here
const envFile = fs.readFileSync('.env', 'utf-8');
const replicateTokenMatch = envFile.match(/VITE_REPLICATE_API_TOKEN=(.+)/);
const replicateToken = replicateTokenMatch ? replicateTokenMatch[1].trim() : '';

async function testReplicate() {
  console.log('Testing Replicate with token:', replicateToken ? 'Found' : 'Missing');
  
  // Use public placeholder images
  const targetImage = "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=400"; // Woman wearing clothes
  const swapImage = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=400"; // Close up face

  try {
    const repRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${replicateToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: '278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34', // codeplugtech/face-swap
        input: {
          target_image: targetImage,
          swap_image: swapImage, 
          input_image: targetImage // trying to guess the right parameter name
        }
      })
    });

    if (!repRes.ok) {
        console.error('Replicate API failed:', await repRes.text());
        return;
    }

    let prediction = await repRes.json();
    console.log('Prediction started:', prediction.id);

    while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { Authorization: `Token ${replicateToken}` }
      });
      prediction = await pollRes.json();
      console.log('Status:', prediction.status);
    }

    if (prediction.status === 'succeeded') {
       console.log('Face Swap successful! Output:', prediction.output);
    } else {
       console.warn('Face Swap failed:', prediction.error);
    }

  } catch (e) {
    console.error('Error:', e);
  }
}

testReplicate();
