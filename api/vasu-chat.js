const GEMINI_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { messages, systemPrompt, history = [] } = req.body || {}
  if (!messages?.length) return res.status(400).json({ error: 'No messages' })

  try {
    // Build Gemini contents array
    const contents = []
    // Add history
    for (const m of history) {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })
    }
    // Add current message
    for (const m of messages) {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })
    }

    const r = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
      })
    })

    const d = await r.json()
    if (!r.ok) return res.status(500).json({ error: d.error?.message || 'Gemini error' })
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return res.status(200).json({ content: text })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
