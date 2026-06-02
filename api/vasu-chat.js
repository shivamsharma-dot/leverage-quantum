const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { messages, systemPrompt, history = [] } = req.body || {}
  if (!messages?.length) return res.status(400).json({ error: 'No messages' })

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [
          ...history.map(m => ({ role: m.role, content: m.content })),
          ...messages.map(m => ({ role: m.role || 'user', content: m.content }))
        ]
      })
    })

    const d = await r.json()
    if (!r.ok) return res.status(500).json({ error: d.error?.message || 'Claude error' })
    return res.status(200).json({ content: d.content?.[0]?.text || '' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
