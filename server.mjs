import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 5501);
const model = process.env.OPENAI_MODEL || 'gpt-5';
const maxBody = 24 * 1024 * 1024;
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

const server = http.createServer(async (request, response) => {
  try {
    const pathname = request.url.split('?')[0].replace(/\/$/, '') || '/';
    if (request.method === 'OPTIONS' && (pathname === '/api/solve' || pathname === '/api/quiz')) {
      response.writeHead(204, corsHeaders());
      return response.end();
    }
    if (request.method === 'POST' && pathname === '/api/solve') return await solve(request, response);
    if (request.method === 'POST' && pathname === '/api/quiz') return await generateQuiz(request, response);
    if (request.method === 'GET') return await serveStatic(request, response);
    return sendJson(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: 'Server error' });
  }
});

async function solve(request, response) {
  if (!process.env.OPENAI_API_KEY) return sendJson(response, 503, { error: 'OPENAI_API_KEY is not configured.' });
  const body = JSON.parse(await readBody(request));
  const content = [{ type: 'input_text', text: createPrompt(body) }];
  if (body.fileData && body.fileType?.startsWith('image/')) content.push({ type: 'input_image', image_url: body.fileData, detail: 'high' });
  if (body.fileData && body.fileType === 'application/pdf') content.push({ type: 'input_file', filename: body.fileName || 'question.pdf', file_data: body.fileData });

  const apiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model,
      ...(process.env.SEARCH_WEB === '1' ? { tools: [{ type: 'web_search' }] } : {}),
      input: [{ role: 'user', content }]
    })
  });
  const result = await apiResponse.json();
  if (!apiResponse.ok) return sendJson(response, apiResponse.status, { error: result.error?.message || 'OpenAI request failed' });
  const outputText = result.output_text || (result.output || [])
    .flatMap((item) => item.type === 'message' ? (item.content || []) : [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text || '')
    .join('');
  return sendJson(response, 200, parseModelAnswer(outputText));
}

async function generateQuiz(request, response) {
  if (!process.env.OPENAI_API_KEY) return sendJson(response, 503, { error: 'OPENAI_API_KEY is not configured.' });
  const body = JSON.parse(await readBody(request));
  const count = Number(body.count);
  if (!Number.isInteger(count) || ![10, 20, 30, 40, 50].includes(count)) return sendJson(response, 400, { error: '문제 수는 10, 20, 30, 40, 50 중 하나여야 합니다.' });
  const grade = String(body.grade || '초등학교 1학년');
  const subject = String(body.subject || '수학');
  const unit = String(body.unit || '기초 단원');
  const prompt = `당신은 한국의 ${grade} 학생을 위한 ${subject} 학습 문제 출제자입니다. 과목은 반드시 ${subject}이고, 단원은 ${unit}입니다. 다른 과목의 문제를 만들지 말고 이 과목과 단원에 맞는 객관식 문제를 정확히 ${count}개 만들어 주세요. 학생 수준에 맞는 문제만 내고, 문제마다 보기 4개를 제공하세요. 정답은 보기 번호 0, 1, 2, 3 중 하나로 표시하세요. 문제는 서로 중복되지 않아야 하며, 수학·과학 계산 문제는 정답을 다시 검산하고, 국어·영어·역사 문제는 지문이나 사실 관계를 정확히 확인하세요. 모든 내용은 자연스러운 한국어로 작성하세요. 반드시 다음 JSON 형식만 출력하세요: {"questions":[{"question":"문제","choices":["보기1","보기2","보기3","보기4"],"answer":0,"explanation":"정답인 이유와 풀이"}]}`;
  const apiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model, input: prompt })
  });
  const result = await apiResponse.json();
  if (!apiResponse.ok) return sendJson(response, apiResponse.status, { error: result.error?.message || 'OpenAI request failed' });
  const parsed = parseQuiz(result);
  if (!parsed || parsed.questions.length !== count) return sendJson(response, 502, { error: `AI가 ${count}개 문제를 정확히 만들지 못했습니다. 다시 시도해 주세요.` });
  return sendJson(response, 200, { subject, grade, unit, questions: parsed.questions });
}

function createPrompt(body) {
  const feedback = body.feedback === 'incorrect' ? '\nThe student says the previous answer was wrong. Re-solve from the beginning, do not defend the previous answer, and verify the result.' : '';
  return 'You are an exact ' + (body.subject || 'general') + ' tutoring assistant. Read the problem carefully, calculate it, verify it, and explain it clearly. Respond entirely in Korean. The title, question summary, final answer, and every explanation step must be written in natural Korean. Do not use English unless it is part of the original problem or a necessary mathematical symbol. Provide a concrete, educational solution rather than a brief summary: first identify what the problem asks, then state the relevant concept or formula, show each substitution and calculation, explain the reasoning between steps, and finish with a verification or conclusion. Unless the problem is trivial, provide at least 3 detailed steps. Never skip important intermediate calculations.' + feedback + '\n' +
    (body.question ? 'Typed problem:\n' + body.question : 'The problem is in the attached image or PDF.') +
    '\nReturn JSON only: {"title":"한국어 제목","question":"한국어 문제 요약","answer":"정확한 최종 답","steps":["한국어 풀이 1단계","한국어 풀이 2단계"]}. If the problem cannot be read, do not guess; set answer to "문제를 읽을 수 없습니다" and explain why in Korean steps.';
}

function parseModelAnswer(text) {
  const fence = String.fromCharCode(96).repeat(3);
  const cleaned = text.replace(new RegExp('^' + fence + '(?:json)?\\s*', 'i'), '').replace(new RegExp('\\s*' + fence + '$'), '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.answer && Array.isArray(parsed.steps)) return parsed;
  } catch {}
  return { title: 'AI result', question: '', answer: text || 'No answer was generated.', steps: ['Review the generated explanation and ask again if needed.'] };
}

function parseQuiz(result) {
  const text = extractOutputText(result);
  const fence = String.fromCharCode(96).repeat(3);
  const cleaned = text.replace(new RegExp('^' + fence + '(?:json)?\\s*', 'i'), '').replace(new RegExp('\\s*' + fence + '$'), '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.questions)) return null;
    const questions = parsed.questions.filter((item) => item && typeof item.question === 'string' && Array.isArray(item.choices) && item.choices.length === 4 && Number.isInteger(item.answer) && item.answer >= 0 && item.answer < 4).map((item) => ({ question: item.question, choices: item.choices.map(String), answer: item.answer, explanation: String(item.explanation || '') }));
    return { questions };
  } catch { return null; }
}

function extractOutputText(result) {
  return result.output_text || (result.output || [])
    .flatMap((item) => item.type === 'message' ? (item.content || []) : [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text || '')
    .join('');
}

async function serveStatic(request, response) {
  const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const target = normalize(join(root, requested));
  if (!target.startsWith(root)) return sendText(response, 403, 'Forbidden');
  try {
    const data = await readFile(target);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(target)] || 'application/octet-stream' });
    return response.end(data);
  } catch {
    return sendText(response, 404, 'Not found');
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { data += chunk; if (data.length > maxBody) reject(new Error('Request too large')); });
    request.on('end', () => resolve(data));
    request.on('error', reject);
  });
}
function corsHeaders() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }; }
function sendJson(response, status, value) { response.writeHead(status, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); }
function sendText(response, status, value) { response.writeHead(status, { ...corsHeaders(), 'Content-Type': 'text/plain; charset=utf-8' }); response.end(value); }
server.listen(port, () => console.log('SearchMate server listening on http://localhost:' + port));
