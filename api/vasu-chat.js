const GROQ_KEY = process.env.VITE_GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { messages, systemPrompt, history = [] } = req.body || {}
  if (!messages?.length) return res.status(400).json({ error: 'No messages' })

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1500,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map(m => ({ role: m.role, content: m.content })),
          ...messages.map(m => ({ role: m.role || 'user', content: m.content }))
        ]
      })
    })
    const d = await r.json()
    if (!r.ok) return res.status(500).json({ error: d.error?.message || 'Groq error' })
    return res.status(200).json({ content: d.choices?.[0]?.message?.content || '' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
