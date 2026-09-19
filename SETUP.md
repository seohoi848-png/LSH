# SearchMate AI 서버 설정

정적 `index.html`만 열면 `/api/solve`가 없으므로 AI에 문제가 전송되지 않습니다. 아래처럼 서버를 실행해야 합니다.

1. Node.js 18 이상을 설치합니다.
2. `.env.example`을 복사해 `.env`를 만들고 `OPENAI_API_KEY`를 입력합니다. API 키는 절대 `app.js`에 넣지 않습니다.
3. PowerShell에서 실행합니다.

```powershell
$env:OPENAI_API_KEY="여기에_API_키"
$env:OPENAI_MODEL="gpt-5"
$env:SEARCH_WEB="0"
npm start
```

그 다음 `http://localhost:5501`을 열면 문제 텍스트와 이미지/PDF가 `/api/solve`를 통해 AI로 전송됩니다. VS Code Live Server로 5500에서 열어도 API는 5501로 연결됩니다. 최신 정보가 필요한 문제에 웹 검색을 사용하려면 `SEARCH_WEB`을 `1`로 설정하세요.

OpenAI API가 연결되지 않으면 앱은 임의의 정답을 만들지 않고 안내만 표시합니다. 이미지와 파일 입력은 서버에서 Responses API의 이미지/파일 입력으로 전달됩니다.
