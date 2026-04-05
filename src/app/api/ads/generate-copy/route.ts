import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const { prompt } = await request.json()

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Prompt is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system:
      'You are an expert digital marketing copywriter. Generate compelling ad copy based on the following brief. Return only the ad copy text, no explanations or headers.',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      stream.on('text', (text) => {
        controller.enqueue(encoder.encode(text))
      })

      stream.on('error', (error) => {
        console.error('Anthropic streaming error:', error)
        controller.error(error)
      })

      stream.on('end', () => {
        controller.close()
      })
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}
