import { extractOutputText, openAI, parseJson, readBody, sendJson } from './_shared.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
  try {
    const body = await readBody(request);
    const count = Number(body.count);
    if (!Number.isInteger(count) || ![10, 20, 30, 40, 50].includes(count)) return sendJson(response, 400, { error: '문제 수는 10, 20, 30, 40, 50 중 하나여야 합니다.' });
    const subject = String(body.subject || '수학');
    const grade = String(body.grade || '초등학교 1학년');
    const unit = String(body.unit || '기초 단원');
    const prompt = `한국의 ${grade} 학생을 위한 ${subject} 과목의 ${unit} 단원 객관식 문제를 ${count}개 만들어 주세요. 각 문제에는 보기 4개, 정답 번호(0~3), 짧은 해설을 포함하세요. 모든 내용은 자연스러운 한국어로 작성하고 다음 JSON만 출력하세요: {"questions":[{"question":"문제","choices":["보기1","보기2","보기3","보기4"],"answer":0,"explanation":"해설"}]}`;
    const result = await openAI({ input: prompt });
    const parsed = parseJson(extractOutputText(result));
    const questions = (parsed.questions || []).filter((item) => item && typeof item.question === 'string' && Array.isArray(item.choices) && item.choices.length === 4 && Number.isInteger(item.answer) && item.answer >= 0 && item.answer < 4).map((item) => ({ question: item.question, choices: item.choices.map(String), answer: item.answer, explanation: String(item.explanation || '') }));
    if (questions.length !== count) return sendJson(response, 502, { error: `AI가 ${count}개 문제를 정확히 만들지 못했습니다. 다시 시도해 주세요.` });
    return sendJson(response, 200, { subject, grade, unit, questions });
  } catch (error) {
    console.error(error);
    return sendJson(response, error.status || 500, { error: error.message || 'Server error' });
  }
}
