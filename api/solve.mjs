import { extractOutputText, openAI, parseJson, readBody, sendJson } from './_shared.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
  try {
    const body = await readBody(request);
    const content = [{ type: 'input_text', text: createPrompt(body) }];
    if (body.fileData && body.fileType?.startsWith('image/')) content.push({ type: 'input_image', image_url: body.fileData, detail: 'high' });
    if (body.fileData && body.fileType === 'application/pdf') content.push({ type: 'input_file', filename: body.fileName || 'question.pdf', file_data: body.fileData });
    const result = await openAI({
      ...(process.env.SEARCH_WEB === '1' ? { tools: [{ type: 'web_search' }] } : {}),
      input: [{ role: 'user', content }]
    });
    const text = extractOutputText(result);
    let answer;
    try { answer = parseJson(text); } catch { answer = { title: 'AI 풀이', question: '', answer: text, steps: ['생성된 풀이를 확인해 주세요.'] }; }
    return sendJson(response, 200, answer);
  } catch (error) {
    console.error(error);
    return sendJson(response, error.status || 500, { error: error.message || 'Server error' });
  }
}

function createPrompt(body) {
  const feedback = body.feedback === 'incorrect' ? '\n이전 답이 틀렸다는 피드백이 있습니다. 처음부터 다시 풀고 결과를 검산하세요.' : '';
  return `당신은 정확하고 친절한 ${body.subject || '일반'} 학습 도우미입니다. 문제를 꼼꼼히 읽고 계산을 검산한 뒤 자연스러운 한국어로 설명하세요. 중요한 중간 계산을 생략하지 말고, 가능한 경우 3단계 이상의 풀이를 제공하세요.${feedback}\n` +
    (body.question ? `입력된 문제:\n${body.question}` : '문제는 첨부된 이미지 또는 PDF에 있습니다.') +
    '\nJSON만 출력하세요: {"title":"제목","question":"문제 요약","answer":"최종 답","steps":["풀이 1단계","풀이 2단계"]}. 문제를 읽을 수 없으면 추측하지 말고 그 이유를 한국어로 설명하세요.';
}
