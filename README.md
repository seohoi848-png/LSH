# SearchMate

사진, PDF, 텍스트로 입력한 학습 문제를 AI가 풀이하고, 과목·학년·단원에 맞는 객관식 문제 세트를 생성해 주는 학습 도우미입니다.

## 주요 기능

- 국어, 영어, 수학, 과학, 사회 등 과목별 문제 풀이
- 텍스트 직접 입력 및 이미지·PDF·TXT 파일 업로드
- 풀이 과정과 최종 답을 단계별로 표시
- 답변이 만족스럽지 않을 때 다른 풀이 요청
- 학년·과목·단원을 선택해 10~50개의 객관식 문제 생성
- 생성된 문제 채점 및 문항별 해설 제공
- 밝은/어두운 테마와 강조 색상 설정
- OpenAI Responses API를 이용한 텍스트·이미지·PDF 분석

## 실행 방법

### 1. 준비

- Node.js 18 이상
- OpenAI API 키

### 2. 환경변수 설정

프로젝트 루트의 `.env.example`을 참고해 상위 폴더의 `.env` 파일을 작성합니다.

```env
OPENAI_API_KEY=여기에_API_키
OPENAI_MODEL=gpt-4o-mini
SEARCH_WEB=0
PORT=5501
```

`.env` 파일은 `.gitignore`에 등록되어 있으므로 API 키를 GitHub에 올리지 않습니다.

### 3. 서버 실행

```powershell
npm start
```

브라우저에서 [http://localhost:5501](http://localhost:5501)을 엽니다.

VS Code Live Server로 프론트를 `5500` 포트에서 열어도 API는 `5501` 포트로 연결됩니다.

## 프로젝트 구조

| 파일 | 설명 |
| --- | --- |
| `index.html` | SearchMate 화면 구조 |
| `styles.css` | 화면 디자인 및 반응형 스타일 |
| `app.js` | 입력, 파일 업로드, 문제 풀이·퀴즈 UI 로직 |
| `server.mjs` | 정적 파일 서버 및 OpenAI API 백엔드 |
| `api/solve.mjs` | Vercel용 문제 풀이 API 함수 |
| `api/quiz.mjs` | Vercel용 문제 생성 API 함수 |
| `api/_shared.mjs` | Vercel API 공통 유틸리티 |
| `.env.example` | 환경변수 설정 예시 |
| `SETUP.md` | AI 서버 설정 안내 |
| `SearchMate.ino` | Arduino 관련 프로젝트 파일 |

## API 엔드포인트

### `POST /api/solve`

문제 풀이를 요청합니다. 텍스트 문제는 `question`으로, 이미지와 PDF는 Base64 데이터로 전달합니다.

### `POST /api/quiz`

선택한 과목·학년·단원에 맞는 객관식 문제 세트를 생성합니다. 문제 수는 10, 20, 30, 40, 50개 중 하나입니다.

## 보안 및 주의사항

- OpenAI API 키를 `app.js`에 직접 입력하지 마세요.
- 실제 `.env` 파일은 커밋하거나 공개 저장소에 업로드하지 마세요.
- 이미지와 PDF 업로드에는 파일 크기 제한이 적용됩니다.
- `SEARCH_WEB=1`로 설정하면 모델이 웹 검색 도구를 사용할 수 있습니다.

## 기술 스택

- HTML, CSS, Vanilla JavaScript
- Node.js 내장 HTTP 서버
- OpenAI Responses API
