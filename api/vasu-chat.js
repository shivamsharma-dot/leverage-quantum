import Anthropic from '@anthropic-ai/sdk'

// Claude is called server-side so the API key never reaches the browser.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-4-8'

// Opus with adaptive thinking can take a while — give the function room.
export const config = { maxDuration: 60 }

// Build a clean Claude messages array. The Anthropic API requires the first
// message to be from the user, so we drop any leading assistant turns (e.g.
// the VASU welcome message) and coerce everything to {role, content} strings.
function buildMessages(history, messages) {
  const combined = [...history, ...messages]
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
    }))
    .filter(m => m.content.trim().length > 0)
  while (combined.length && combined[0].role !== 'user') combined.shift()
  return combined
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, systemPrompt, history = [] } = req.body || {}
  if (!messages?.length) return res.status(400).json({ error: 'No messages' })
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' })
  }

  const claudeMessages = buildMessages(history, messages)
  if (!claudeMessages.length) return res.status(400).json({ error: 'No user message to send' })

  // Stream the response back as Server-Sent Events so the UI can render it live.
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages: claudeMessages,
    })

    stream.on('text', (delta) => {
      res.write(`data: ${JSON.stringify({ delta })}\n\n`)
    })

    await stream.finalMessage()
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (e) {
    // Headers are already sent, so surface the error as a stream event.
    res.write(`data: ${JSON.stringify({ error: e?.message || 'Claude error' })}\n\n`)
    res.end()
  }
}
