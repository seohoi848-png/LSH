const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  let raw = '';
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export function sendJson(response, status, value) {
  response.status(status).json(value);
}

export async function openAI(input) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is not configured.');
    error.status = 503;
    throw error;
  }
  const result = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model, ...input })
  });
  const data = await result.json();
  if (!result.ok) {
    const error = new Error(data.error?.message || 'OpenAI request failed');
    error.status = result.status;
    throw error;
  }
  return data;
}

export function extractOutputText(result) {
  return result.output_text || (result.output || [])
    .flatMap((item) => item.type === 'message' ? (item.content || []) : [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text || '')
    .join('');
}

export function parseJson(text) {
  const fence = String.fromCharCode(96).repeat(3);
  const cleaned = String(text).replace(new RegExp('^' + fence + '(?:json)?\\s*', 'i'), '').replace(new RegExp('\\s*' + fence + '$'), '').trim();
  return JSON.parse(cleaned);
}
