// Vercel serverless function: generates a hairstyle preview using Google's Gemini API
// (the "Nano Banana" image model, gemini-2.5-flash-image), which has a genuine free tier —
// no credit card, no billing account required. Get a key at https://aistudio.google.com/apikey
// and add it in Vercel → Project → Settings → Environment Variables as GEMINI_API_KEY.
//
// Unlike task/polling APIs, this returns the generated image directly in one request.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { targetImage, targetMimeType, referenceImage, referenceMimeType, styleNote } = req.body || {};

  if (!targetImage) {
    return res.status(400).json({ error: 'Missing targetImage (the customer photo, base64).' });
  }
  if (!referenceImage && !styleNote) {
    return res.status(400).json({ error: 'Provide a reference hairstyle photo, a style description, or both.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY. Add it in Vercel project settings.' });
  }

  // Build the prompt + image parts sent to Gemini.
  let promptText =
    'Photo 1 shows a person (the customer). ' +
    (referenceImage
      ? 'Photo 2 shows a reference hairstyle. Edit Photo 1 so the customer has the hairstyle from Photo 2, adapted naturally to their head shape and hair type. '
      : '') +
    (styleNote ? `Apply this hairstyle description: "${styleNote}". ` : '') +
    'Keep the customer\'s face, facial features, skin tone, expression, clothing, and background exactly the same as Photo 1 — only change the hair. ' +
    'Return a single photorealistic edited photo, no text or collage.';

  const parts = [
    { text: promptText },
    { inlineData: { mimeType: targetMimeType || 'image/jpeg', data: targetImage } }
  ];
  if (referenceImage) {
    parts.push({ inlineData: { mimeType: referenceMimeType || 'image/jpeg', data: referenceImage } });
  }

  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseModalities: ['IMAGE'] }
        })
      }
    );

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data.error?.message || 'Gemini request failed', raw: data });
    }

    const resultParts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = resultParts.find(p => p.inlineData);
    if (!imagePart) {
      const textPart = resultParts.find(p => p.text);
      return res.status(502).json({ error: textPart?.text || 'Gemini did not return an image. Try a clearer photo.' });
    }

    return res.status(200).json({
      image: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
