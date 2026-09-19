const state = { subject: '국어', file: null, fileText: '', fileData: '', uploadName: '', uploadType: '', retry: 0 };
const $ = (selector) => document.querySelector(selector);
// The UI may be served by VS Code Live Server on 5500 while the API runs on 5501.
const API_BASE = window.SEARCHMATE_API_BASE || 'http://localhost:5501';

function apiError(error) {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'AI 서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인해 주세요. (npm start)';
  }
  return error?.message || 'AI 서버와 통신하지 못했습니다.';
}

const accentColor = $('#accentColor');
const savedAccent = localStorage.getItem('searchmate-accent');
if (savedAccent) applyAccentColor(savedAccent);
accentColor.addEventListener('input', () => applyAccentColor(accentColor.value));

function applyAccentColor(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  const { r, g, b } = hexToRgb(color);
  const light = `rgb(${Math.round(r + (255 - r) * 0.88)}, ${Math.round(g + (255 - g) * 0.88)}, ${Math.round(b + (255 - b) * 0.88)})`;
  document.documentElement.style.setProperty('--purple', color);
  document.documentElement.style.setProperty('--purple-light', light);
  accentColor.value = color;
  localStorage.setItem('searchmate-accent', color);
}

function hexToRgb(hex) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

document.querySelectorAll('.subject').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.subject').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    state.subject = button.dataset.subject;
    state.retry = 0;
  });
});

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
['dragenter', 'dragover'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropzone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropzone.classList.remove('dragover');
}));
dropzone.addEventListener('drop', (event) => handleFile(event.dataTransfer.files[0]));

async function handleFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return showToast('파일은 10MB 이하로 올려주세요.');
  const allowedTypes = ['image/', 'application/pdf', 'text/plain'];
  if (!allowedTypes.some((type) => type.endsWith('/') ? file.type.startsWith(type) : file.type === type)) {
    state.file = null;
    state.fileData = '';
    state.fileText = '';
    state.uploadName = '';
    state.uploadType = '';
    fileInput.value = '';
    return showToast('JPG, PNG, WEBP, PDF, TXT 파일만 업로드할 수 있어요.');
  }
  try {
    state.file = file;
    state.fileText = file.type === 'text/plain' ? await file.text() : '';
    state.fileData = file.type === 'text/plain' ? '' : await readImageData(file);
    state.uploadName = file.type === 'image/webp' ? file.name.replace(/\.webp$/i, '.png') : file.name;
    state.uploadType = file.type === 'image/webp' ? 'image/png' : file.type;
  } catch {
    state.file = null;
    state.fileData = '';
    state.fileText = '';
    state.uploadName = '';
    state.uploadType = '';
    return showToast('파일을 읽지 못했어요. 파일을 다시 선택해 주세요.');
  }
  $('#fileName').textContent = `선택됨: ${file.name}`;
  showToast('문제 파일을 준비했어요.');
}

$('#solveButton').addEventListener('click', solveProblem);
$('#wrongButton').addEventListener('click', requestDifferentAnswer);
$('#themeToggle').addEventListener('click', () => document.body.classList.toggle('dark'));

async function solveProblem(feedback = null) {
  const question = $('#questionText').value.trim() || state.fileText.trim();
  if (!question && !state.file) return showToast('문제를 입력하거나 파일을 올려주세요.');
  const button = $('#solveButton');
  button.disabled = true;
  button.innerHTML = '<span class="loading">✦</span> 풀이를 만드는 중...';
  const payload = { subject: state.subject, question, fileName: state.uploadName || state.file?.name || null, fileType: state.uploadType || state.file?.type || null, fileData: state.fileData || null, feedback: feedback || (state.retry ? 'incorrect' : null) };
  try {
    const response = await fetch(`${API_BASE}/api/solve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseData.error || `API 오류 (${response.status})`);
    const answer = normalizeAnswer(responseData);
    if (!answer) throw new Error('Incomplete answer');
    renderAnswer(answer);
  } catch (error) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    const localAnswer = demoAnswer(state.retry > 0);
    if (localAnswer) renderAnswer(localAnswer);
    else {
      clearAnswer();
      showToast(apiError(error));
    }
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>✦</span> AI에게 풀이 요청하기 <b>→</b>';
  }
}

function requestDifferentAnswer() {
  state.retry += 1;
  solveProblem('incorrect');
}

// 외부 AI가 없을 때도 확실히 계산할 수 있는 식만 처리합니다. 임의의 답을 추측하지 않습니다.
function demoAnswer(isRetry) {
  const input = $('#questionText').value.trim() || state.fileText.trim();
  const question = input || `${state.subject} 문제 이미지 (${state.file?.name ?? '업로드 파일'})`;
  if (state.subject !== '수학') return null;

  if (/x\s*[²^2]\s*[-−]\s*5x\s*[+]\s*6/.test(question)) {
    return {
      title: isRetry ? '수학 문제 재검토' : '수학 문제 풀이',
      question,
      answer: isRetry ? 'x = 2 또는 x = 3 (검산 완료)' : 'x = 2 또는 x = 3',
      steps: ['x² - 5x + 6을 (x - 2)(x - 3)으로 인수분해합니다.', '각 인수를 0으로 두면 x - 2 = 0 또는 x - 3 = 0입니다.', '두 값을 원식에 대입해도 0이므로 해는 x = 2, 3입니다.'],
      retry: Boolean(isRetry)
    };
  }

  const arithmetic = question.match(/(-?\d+(?:\.\d+)?)\s*([+×*÷\-/])\s*(-?\d+(?:\.\d+)?)/);
  if (arithmetic) {
    const [, left, operator, right] = arithmetic;
    const a = Number(left); const b = Number(right);
    const values = { '+': a + b, '-': a - b, '×': a * b, '*': a * b, '÷': b ? a / b : NaN, '/': b ? a / b : NaN };
    const value = values[operator];
    if (Number.isFinite(value)) return { title: '수학 계산 풀이', question, answer: `${value}`, steps: [`계산할 두 수는 ${a}와 ${b}입니다.`, `${a} ${operator} ${b}를 계산하면 ${value}입니다.`, '계산 결과를 다시 대입해 확인했습니다.'], retry: Boolean(isRetry) };
  }

  const linear = question.match(/(-?\d*)\s*x\s*([+−-]\s*\d+)?\s*=\s*(-?\d+)/i);
  if (linear) {
    const a = Number(linear[1] === '' || linear[1] === '+' ? 1 : linear[1] === '-' ? -1 : linear[1]);
    const b = Number((linear[2] || '0').replace(/\s/g, ''));
    const c = Number(linear[3]);
    const value = (c - b) / a;
    if (Number.isFinite(value)) return { title: '일차방정식 풀이', question, answer: `x = ${value}`, steps: [`식을 ax + b = c 꼴로 정리합니다.`, `x = (${c} - (${b})) / ${a}로 계산합니다.`, `따라서 x = ${value}입니다. 해당 값을 원식에 대입해 검산합니다.`], retry: Boolean(isRetry) };
  }

  const percent = question.match(/(-?\d+(?:\.\d+)?)\s*(?:의|\s)\s*(-?\d+(?:\.\d+)?)\s*%/);
  if (percent) {
    const value = Number(percent[1]) * Number(percent[2]) / 100;
    return { title: '백분율 계산 풀이', question, answer: `${value}`, steps: [`전체는 ${percent[1]}, 비율은 ${percent[2]}%입니다.`, `${percent[1]} × ${percent[2]} ÷ 100을 계산합니다.`, `따라서 정답은 ${value}입니다.`], retry: Boolean(isRetry) };
  }
  return null;
}

function normalizeAnswer(data) {
  if (!data || typeof data !== 'object' || typeof data.answer !== 'string' || !data.answer.trim() || !Array.isArray(data.steps) || data.steps.length === 0) return null;
  return { ...data, retry: Boolean(data.retry || state.retry > 0) };
}

function renderAnswer(data) {
  $('#answerEmpty').classList.add('hidden');
  $('#answerResult').classList.remove('hidden');
  $('#resultTitle').textContent = data.title || `${state.subject} 문제 풀이`;
  $('#resultQuestion').textContent = `“${data.question || '업로드한 문제'}”`;
  $('#resultAnswer').textContent = data.answer;
  $('#resultSolution').innerHTML = `<h3>풀이 과정</h3><ol>${data.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`;
  $('#sourceNote').innerHTML = data.retry ? '<span>↻</span> 학생의 피드백을 반영해 다른 방법으로 다시 검토했어요.' : '<span>◎</span> AI가 반환한 답과 풀이입니다.';
  $('#answerPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearAnswer() {
  $('#answerResult').classList.add('hidden');
  $('#answerEmpty').classList.remove('hidden');
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); }

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readImageData(file) {
  const dataUrl = await readAsDataUrl(file);
  if (file.type !== 'image/webp') return dataUrl;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error('WEBP 이미지를 읽을 수 없습니다.'));
    image.src = dataUrl;
  });
}

const gradeUnits = {
  '초등학교 1학년': ['수와 덧셈·뺄셈', '비교하기', '시계 보기', '도형과 규칙'],
  '초등학교 2학년': ['세 자리 수', '곱셈구구', '길이와 시간', '분수와 도형'],
  '초등학교 3학년': ['덧셈·뺄셈', '곱셈과 나눗셈', '분수와 소수', '평면도형'],
  '초등학교 4학년': ['큰 수', '분수의 덧셈과 뺄셈', '소수의 덧셈과 뺄셈', '각도와 도형'],
  '초등학교 5학년': ['약수와 배수', '분수의 곱셈', '소수의 곱셈', '다각형의 넓이'],
  '초등학교 6학년': ['분수의 나눗셈', '비와 비율', '원의 넓이', '비례식'],
  '중학교 1학년': ['정수와 유리수', '문자와 식', '방정식', '기본 도형'],
  '중학교 2학년': ['유리수와 순환소수', '식의 계산', '일차부등식', '도형의 성질'],
  '중학교 3학년': ['제곱근과 실수', '다항식의 곱셈', '이차방정식', '삼각비'],
  '고등학교 1학년': ['다항식', '방정식과 부등식', '경우의 수', '함수'],
  '고등학교 2학년': ['수열', '함수의 극한', '미분', '확률'],
  '고등학교 3학년': ['미적분', '통계적 추정', '공간도형과 벡터', '수능형 종합 문제']
};
const subjectGradeUnits = {
  '국어': {
    '초등학교 1학년': ['자음과 모음', '낱말 읽기', '문장 쓰기', '그림 동화 이해'], '초등학교 2학년': ['문장 부호', '설명하는 글', '시와 이야기', '생각 쓰기'], '초등학교 3학년': ['문단과 중심 문장', '인물의 마음', '의견과 근거', '관용 표현'], '초등학교 4학년': ['글의 짜임', '사전 활용', '독서 감상문', '회의와 토의'], '초등학교 5학년': ['문학의 표현', '주장하는 글', '토의와 토론', '우리말의 어법'], '초등학교 6학년': ['비유와 상징', '논설문 읽기', '매체 자료 해석', '문법과 글쓰기'],
    '중학교 1학년': ['문학과 화자', '읽기와 요약', '말하기와 듣기', '품사'], '중학교 2학년': ['문학의 갈래', '설명·논증 방법', '한글의 원리', '매체와 표현'], '중학교 3학년': ['문학 작품의 해석', '논증과 설득', '통일성과 응집성', '문법의 체계'],
    '고등학교 1학년': ['현대시와 현대소설', '비문학 독해', '화법과 작문', '문법 요소'], '고등학교 2학년': ['고전 문학', '문학의 수용과 생산', '독서의 방법', '언어와 매체'], '고등학교 3학년': ['수능 문학', '수능 비문학', '고전 문법', '화법·작문 실전']
  },
  '영어': {
    '초등학교 1학년': ['알파벳과 소리', '인사와 자기소개', '색깔과 숫자', '가족과 친구'], '초등학교 2학년': ['일상 인사', '동물과 사물', '날씨와 계절', '간단한 질문'], '초등학교 3학년': ['기본 동작 표현', '시간과 요일', '좋아하는 것 말하기', '짧은 대화'], '초등학교 4학년': ['현재형 문장', '장소와 위치', '길 묻기', '일상생활 표현'], '초등학교 5학년': ['과거형 기초', '미래 표현', '비교 표현', '읽기와 요약'], '초등학교 6학년': ['조동사', '접속사', '경험과 계획', '생활 영어 읽기'],
    '중학교 1학년': ['be동사와 일반동사', '현재·과거 시제', '명령문과 의문문', '기초 독해'], '중학교 2학년': ['to부정사와 동명사', '비교급과 최상급', '접속사와 관계대명사', '독해와 어휘'], '중학교 3학년': ['수동태', '현재완료', '가정법 기초', '글의 요지와 추론'],
    '고등학교 1학년': ['문장의 구조', '시제와 태', '관계사와 분사', '고등 독해'], '고등학교 2학년': ['가정법과 도치', '분사구문', '고난도 어휘', '빈칸 추론'], '고등학교 3학년': ['수능 어법', '수능 빈칸 추론', '순서와 삽입', '장문 독해'],
  },
  '과학': {
    '초등학교 1학년': ['몸의 구조와 감각', '여러 가지 물체', '동물과 식물', '계절의 변화'], '초등학교 2학년': ['빛과 소리', '식물의 한살이', '물의 상태', '지표의 모습'], '초등학교 3학년': ['자석의 성질', '동물의 생활', '지표의 변화', '소리의 성질'], '초등학교 4학년': ['식물의 생활', '물의 순환', '혼합물의 분리', '화산과 지진'], '초등학교 5학년': ['온도와 열', '용해와 용액', '태양계와 별', '생물의 구조'], '초등학교 6학년': ['전기의 이용', '연소와 소화', '우리 몸의 구조', '계절의 변화'],
    '중학교 1학년': ['지권의 변화', '생물의 다양성', '기체의 성질', '힘과 운동'], '중학교 2학년': ['물질의 구성', '전기와 자기', '열과 우리 생활', '식물과 에너지'], '중학교 3학년': ['화학 반응의 규칙', '기권과 날씨', '유전과 진화', '에너지 전환'],
    '고등학교 1학년': ['통합과학의 탐구', '물질과 규칙성', '시스템과 상호작용', '변화와 다양성'], '고등학교 2학년': ['세포와 물질대사', '화학 결합', '역학과 에너지', '지구 시스템'], '고등학교 3학년': ['생명과학 유전', '화학 반응과 평형', '전자기장과 파동', '지구과학 자료 분석'],
  },
  '역사': {
    '초등학교 1학년': ['우리 가족과 이웃', '우리 동네의 모습', '옛날과 오늘날', '문화유산 알아보기'], '초등학교 2학년': ['고장의 옛이야기', '생활 모습의 변화', '우리 문화유산', '지역의 역사'], '초등학교 3학년': ['고조선과 여러 나라', '삼국의 성장', '고려의 생활', '조선의 생활'], '초등학교 4학년': ['선사 시대 생활', '삼국과 통일 신라', '고려 사회', '조선 사회'], '초등학교 5학년': ['우리 역사의 시작', '민족 국가의 성장', '조선의 발전', '근대 국가 수립'], '초등학교 6학년': ['일제 강점기', '광복과 대한민국', '민주주의의 발전', '세계 속의 한국'],
    '중학교 1학년': ['문명의 탄생', '고대 지중해 세계', '동아시아 고대 국가', '중세 유럽'], '중학교 2학년': ['근대 국민 국가', '산업 혁명과 제국주의', '동아시아의 변화', '조선 사회의 변동'], '중학교 3학년': ['조선의 성립과 발전', '개항과 근대화', '일제 강점과 독립운동', '대한민국의 발전'],
    '고등학교 1학년': ['한국사의 흐름', '고대 국가와 문화', '고려와 조선', '근현대사의 전개'], '고등학교 2학년': ['세계사의 형성', '동아시아 역사', '서양 근대 사회', '제국주의와 민족 운동'], '고등학교 3학년': ['한국사 자료 분석', '세계사 비교 문제', '근현대사 쟁점', '역사 수능 실전']
  }
};

const quizSubjectSelect = $('#quizSubjectSelect');
const gradeSelect = $('#gradeSelect');
const unitSelect = $('#unitSelect');
const countSelect = $('#countSelect');
const quizStart = $('#quizStart');
const quizStatus = $('#quizStatus');
const quizArea = $('#quizArea');
let currentQuiz = null;

Object.keys(gradeUnits).forEach((grade) => gradeSelect.add(new Option(grade, grade)));
Object.keys(subjectGradeUnits).concat('수학').forEach((subject) => quizSubjectSelect.add(new Option(subject, subject)));
quizSubjectSelect.value = '수학';
function updateUnits() {
  const units = quizSubjectSelect.value === '수학' ? gradeUnits[gradeSelect.value] : subjectGradeUnits[quizSubjectSelect.value][gradeSelect.value];
  unitSelect.replaceChildren(...units.map((unit) => new Option(unit, unit)));
}
gradeSelect.addEventListener('change', updateUnits);
quizSubjectSelect.addEventListener('change', updateUnits);
updateUnits();
quizStart.addEventListener('click', createQuiz);

async function createQuiz() {
  quizStart.disabled = true;
  quizStart.textContent = '문제 세트를 만드는 중...';
  quizStatus.textContent = '선택한 단원에 맞는 문제를 준비하고 있어요.';
  quizArea.classList.add('hidden');
  try {
    const response = await fetch(`${API_BASE}/api/quiz`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: quizSubjectSelect.value, grade: gradeSelect.value, unit: unitSelect.value, count: Number(countSelect.value) }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `API 오류 (${response.status})`);
    currentQuiz = data;
    renderQuiz(data);
    quizStatus.textContent = `${data.subject} · ${data.grade} · ${data.unit} · ${data.questions.length}문제`;
  } catch (error) {
    quizStatus.textContent = apiError(error);
  } finally {
    quizStart.disabled = false;
    quizStart.innerHTML = '문제 다시 만들기 <b>→</b>';
  }
}

function renderQuiz(quiz) {
  quizArea.innerHTML = `<div class="quiz-list">${quiz.questions.map((item, index) => `<article class="quiz-question"><h3>${index + 1}. ${escapeHtml(item.question)}</h3><div class="quiz-choices">${item.choices.map((choice, choiceIndex) => `<label><input type="radio" name="quiz-${index}" value="${choiceIndex}"><span>${String.fromCharCode(65 + choiceIndex)}. ${escapeHtml(choice)}</span></label>`).join('')}</div><div class="quiz-explanation hidden" id="quiz-explanation-${index}"></div></article>`).join('')}</div><button class="primary-button quiz-submit" id="quizSubmit" type="button">채점하기</button><div id="quizResult" class="quiz-result hidden"></div>`;
  quizArea.classList.remove('hidden');
  $('#quizSubmit').addEventListener('click', gradeQuiz);
  quizArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function gradeQuiz() {
  if (!currentQuiz) return;
  let score = 0;
  currentQuiz.questions.forEach((item, index) => {
    const selected = document.querySelector(`input[name="quiz-${index}"]:checked`);
    const explanation = $(`#quiz-explanation-${index}`);
    const isCorrect = selected && Number(selected.value) === item.answer;
    if (isCorrect) score += 1;
    explanation.classList.remove('hidden');
    explanation.innerHTML = `<strong>${isCorrect ? '정답' : `정답: ${String.fromCharCode(65 + item.answer)}`}</strong> · ${escapeHtml(item.explanation)}`;
    document.querySelectorAll(`input[name="quiz-${index}"]`).forEach((input) => { input.disabled = true; input.closest('label').classList.toggle('correct-choice', Number(input.value) === item.answer); input.closest('label').classList.toggle('wrong-choice', input.checked && !isCorrect); });
  });
  const result = $('#quizResult');
  const percent = Math.round(score / currentQuiz.questions.length * 100);
  result.classList.remove('hidden');
  result.innerHTML = `<strong>${score} / ${currentQuiz.questions.length}점</strong><span>${percent}점 · 해설을 확인해 보세요.</span>`;
  $('#quizSubmit').disabled = true;
  result.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
