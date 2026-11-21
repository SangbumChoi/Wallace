# Wallace

그래프에서 생각과 문서를 연결하는 맥·윈도우용 지식 워크스페이스입니다. Slack의 시간순 대화와 Notion의 페이지 계층 대신, 페이지 사이의 관계를 탐색의 중심에 둡니다.

Wallace는 기기에 먼저 저장합니다. 설치 후 바로 문서와 그래프를 사용할 수 있으며, 공유 서버에 연결하면 여러 기기에서 같은 워크스페이스를 열고 편집할 수 있습니다.

## 설치해서 사용하기

- macOS Apple Silicon: `release/Wallace-0.10.8-arm64.pkg`를 열면 응용 프로그램 폴더의 Wallace를 설치하거나 업데이트합니다.
- Windows x64: `release/Wallace Setup 0.10.8.exe`로 설치합니다. 이 환경에서는 크로스 빌드로 생성했으며 실제 Windows 실행은 아직 검증하지 않았습니다. Windows에서 `npm run dist:win` 또는 GitHub Actions의 **Desktop builds**로 다시 빌드할 수 있습니다.
- 현재 패키지는 개발용 빌드입니다. Apple Developer 인증서·공증 및 Windows 코드 서명은 아직 설정하지 않았습니다. 일반 사용자에게 공개 배포하기 전 서명 구성이 필요하며, 운영체제가 첫 실행을 차단할 수 있습니다.
- 이 저장소의 workflow는 다운로드 가능한 빌드 아티팩트를 만듭니다. GitHub Release에 자동 공개하거나 업로드하지 않습니다.

## 모바일 프리뷰

Android 테스트 설치 파일은 `release/mobile/Wallace-0.10.2-android-debug.apk`입니다. iPhone 시뮬레이터용 앱은 `release/mobile/Wallace-0.10.2-iOS-Simulator.zip`에 있습니다. 실제 iPhone용 Xcode 프로젝트는 `ios/App/App.xcodeproj`입니다.

- 휴대폰에서도 홈의 입력창에서 바로 AI 대화를 시작합니다. 다른 사람과 실시간 대화를 하려면 **개인 워크스페이스 → 공유 AI 공간**에서 같은 네트워크의 호스트가 만든 초대 주소를 입력합니다.
- **내 대화**에서 제목과 페이지를 편집하고 그래프를 탐색할 수 있습니다. 다른 기기와 연결하려면 **공유 워크스페이스** 설정을 열고, 파일로 옮기려면 JSON으로 내보냅니다.
- 모바일의 AI 질문과 음성 변환에는 연결한 서버를 사용합니다. 공유 공간의 AI 답변은 호스트가 설정한 모델에서 생성됩니다. 로컬 Whisper 모델 다운로드와 공유 공간 열기는 데스크톱에서 지원합니다.
- `npm install` 후 `npm run mobile:sync`로 앱 소스를 준비합니다. Android SDK와 Java 21 환경에서 `cd android && ./gradlew :app:assembleDebug`를 실행합니다. iOS는 `npx cap open ios`로 Xcode에서 열고 시뮬레이터를 선택합니다. 실제 iPhone에 설치할 때는 Xcode에서 서명 팀을 선택합니다.

## 공유 워크스페이스와 노트 그래프

1. Node.js 24 이상이 있는 컴퓨터나 서버에서 `npm run cloud:token`으로 연결 키를 만듭니다. 해당 키를 환경 변수 `WALLACE_CLOUD_TOKEN`에 설정하고 `npm run cloud:start`를 실행합니다.
2. 앱의 **개인 워크스페이스 → 공유 워크스페이스**에서 서버 주소와 키를 입력합니다. 서버와 앱이 같은 컴퓨터에 있으면 `http://127.0.0.1:8787`을 사용합니다. 다른 기기에서 연결하려면 HTTPS를 제공하는 프록시를 서버 앞에 연결합니다. 기본 서버는 `127.0.0.1:8787`에만 바인딩합니다. `PORT`, `WALLACE_CLOUD_HOST`, `WALLACE_CLOUD_DB`로 포트, 바인딩 주소, 저장 위치를 지정할 수 있습니다.
3. 처음 연결한 기기는 **이 기기의 워크스페이스 올리기**, 다른 기기는 **서버에서 열기**를 누릅니다. 기존 내용이 필요한 기기에서는 먼저 JSON으로 백업하세요.
4. 연결 후에는 수정 사항이 기기에 먼저 저장됩니다. 서버는 겹치지 않는 변경을 병합합니다. 같은 필드가 양쪽에서 수정되면 공유 설정에 충돌이 표시되며 각 버전을 JSON으로 내보낼 수 있습니다. 서버는 최근 100개 버전을 보관합니다. 서버 배포에는 SQLite 파일을 유지할 영구 저장 공간이 필요합니다.

서버 인스턴스 하나는 워크스페이스 하나를 제공합니다. 연결 키를 가진 사람은 공유 워크스페이스 전체를 읽고 편집할 수 있습니다. 기기별 프로필과 AI·STT 연결 키는 기기에 보관됩니다. 공유 데이터에는 노트, 링크, 대화 내용, 요약, 프로젝트 단계가 포함됩니다. 공유 AI 공간의 라이브 대화는 호스트에서 관리하며 개인 워크스페이스로 가져온 기록은 해당 워크스페이스와 함께 동기화됩니다.

왼쪽의 **워크스페이스 그래프**에서 모든 대화의 노트를 제목·본문·유형으로 검색합니다. 노드를 선택하면 연결된 노트와 이 노트를 참조하는 노트가 표시됩니다. 노트 상세 화면의 **기존 페이지 연결**로 다른 대화의 노트에도 연결할 수 있습니다.

## 워크스페이스 관리

왼쪽 아래 워크스페이스 이름을 눌러 새 공간을 만들거나 저장된 공간을 전환하세요. 새 공간은 빈 상태로 열립니다. 이름을 바꾸면 메뉴, 그래프, 공유 설정, 가져오기 화면에 반영됩니다. 공간마다 대화, 노트, 프로필, 공유 서버 연결을 따로 저장하며, 마지막으로 사용한 공간이 다시 열립니다.

**내 프로필**에서 JPG, PNG, WebP 사진을 올리거나 이니셜·별·반짝임·책 아이콘을 고를 수 있습니다. 사진은 정사각형으로 잘라 저장하며, 제거하면 선택한 아이콘으로 돌아갑니다.

## Notion과 Slack에서 가져오기

Mac 또는 Windows의 **개인 워크스페이스 → Notion·Slack에서 가져오기**에서 방식을 선택합니다. 미리보기에서 가져올 항목을 확인하고 추가를 누르면, 기존 워크스페이스에 노트와 연결이 추가됩니다.

- **Notion 링크**는 웹에 게시한 `notion.site` 또는 `notion.so` 주소를 붙여넣어 본문, 표, 접근 가능한 하위 페이지와 페이지 간 연결을 가져옵니다. 한 번에 최대 25개 페이지를 읽고 각 노트에 원본 링크를 남깁니다. 첨부 파일 원본과 데이터베이스 보기는 제외됩니다. [Notion 웹 게시 안내](https://www.notion.com/help/public-pages-and-web-publishing)
- **비공개 Notion 링크**는 콘텐츠 읽기 권한이 있는 Notion 내부 연결을 페이지에 추가한 뒤, Wallace에서 **비공개 페이지를 위한 Notion 연결 사용**을 켭니다. Notion 페이지 메뉴에서 복사한 링크와 연결 토큰을 입력하면 미리보기를 읽습니다. 성공 후 토큰은 이 기기의 OS 보안 저장소로 암호화하고, 다음부터는 링크만 붙여넣을 수 있습니다. [Notion 연결 안내](https://developers.notion.com/guides/connections-and-tokens/internal-connections)
- **Notion**은 **Markdown 및 CSV** 또는 **HTML** 내보내기를 지원합니다. 내보낼 때 하위 페이지를 포함하면 페이지 간 링크와 상하위 관계가 노트 그래프에 연결됩니다. CSV는 읽을 수 있는 표로 가져옵니다. 첨부 파일 원본과 데이터베이스 보기·수식은 이전되지 않습니다. [Notion 내보내기 안내](https://www.notion.com/help/export-your-content)
- **Slack**은 **JSON** 내보내기를 지원합니다. 채널별 대화 안에서 일반 메시지는 날짜별 노트로, 답글이 포함된 스레드는 별도 노트로 묶습니다. 작성자, UTC 시각, 메시지와 파일 링크를 보존합니다. 비공개 채널, DM, 공개 여부를 확인할 수 없는 항목은 미리보기에서 직접 선택합니다. 첨부 원본, 삭제 이력, 반응과 캔버스는 이전되지 않습니다. [Slack 내보내기 안내](https://slack.com/help/articles/201658943-Export-your-workspace-data)

같은 내보내기를 다시 읽으면 기존 노트와 연결을 건너뜁니다. Notion에서 편집된 기존 페이지는 Wallace에서 덮어쓰지 않습니다. 변경된 Slack 날짜·스레드 묶음은 추가 노트로 들어갈 수 있습니다. 공유 워크스페이스에 연결되어 있으면 가져온 내용도 동기화됩니다. 가져오기 후 합친 워크스페이스는 최대 25MB입니다.

## 대화 공간 사용법

대화 상단의 연필로 제목을 수정하고, 별로 즐겨찾기를 추가하거나 해제할 수 있습니다. 휴지통으로 대화를 삭제하면 AI 기록과 그 대화에만 연결된 노트가 삭제됩니다. 다른 대화에서도 사용하는 노트는 보존됩니다.

대화를 열고 **⌘R**로 이름을 바꾸거나 **⌘D**로 삭제 확인을 열 수 있습니다. Windows에서는 **Ctrl+R**과 **Ctrl+D**를 사용합니다. **워크스페이스 메뉴 → 키보드 단축키**에서 이 기기의 키를 바꾸거나 기본값을 복원할 수 있습니다. 입력창과 편집기에 포커스가 있을 때는 대화 단축키가 동작하지 않습니다.

1. 왼쪽 목록에서 대화나 즐겨찾기를 엽니다. **내 대화**와 **즐겨찾기**에서는 항목 옆 연필을 눌러 이름을 바꿀 수 있습니다. 내 목록에서 뺀 대화는 검색으로 다시 찾을 수 있습니다.
2. 중앙에서 기록을 위에서 아래로 읽습니다. 기록을 클릭하면 본문과 연결을 편집할 수 있습니다. 대화 제목 옆의 그래프 버튼으로 전체 관계를 열고, 노드의 점을 드래그해 연결을 추가합니다.
3. 대화 아래 **대화 스펙**에서 목적, 결정, 열린 질문을 정리합니다. 스펙 제목을 수정하면 대화 이름도 바뀝니다.
4. 홈이나 대화 입력창에서 Enter를 누르면 AI에게 질문합니다. 일반 텍스트를 노트로 저장하려면 **기록 남기기**를 선택하고 입력한 뒤 저장합니다. 홈에서 기록을 저장하면 새 대화에 노트가 추가됩니다. 마이크 버튼은 두 방식 모두에서 사용할 수 있으며, Shift+Enter로 줄을 바꿉니다.
5. 왼쪽 아래 **개인 워크스페이스** 메뉴에서 설정 및 AI 연결, JSON 가져오기·내보내기를 엽니다. 가져오기는 현재 데이터를 교체하므로 먼저 내보내기로 백업하세요.

각 대화는 독립된 스펙과 노드 참조 목록을 저장합니다. 같은 노드가 여러 대화에 포함되면 본문과 관계를 공유합니다. 기존 v0.1 데이터는 모든 페이지와 연결을 유지한 채 **기존 워크스페이스**라는 하나의 대화로 자동 변환합니다. 즐겨찾기·목록 분류·대화 스펙도 재실행과 내보내기/가져오기에서 유지됩니다.

수정과 노드 위치는 자동 저장하며, 창을 닫을 때 저장 완료를 기다립니다. 저장 실패 시 알림을 표시하고 창을 유지합니다. 데이터 파일을 읽지 못하면 기존 파일을 덮어쓰지 않습니다.

## 목적 중심 대화와 프로젝트

**대화 흐름**은 대화 목적과 사용자가 보낸 메시지를 순서대로 보여줍니다. 노드를 선택해 원문과 답변으로 이동하고, 질문 구체화·조건 추가·방향 전환·근거 확인·결정을 표시할 수 있습니다. 앞선 메시지와의 연결은 직접 선택할 수 있습니다. 넓은 화면에서는 가로로, 좁은 화면에서는 세로로 표시됩니다.

홈에서 첫 메시지를 보내면 AI 대화가 시작됩니다. 첫 메시지가 목적이 되며, 대화 상단의 목적을 열어 문장과 유형을 수정할 수 있습니다. AI는 목적, 연결된 페이지, 최근 대화를 참고합니다.

1. **세션 노트 초안 만들기**를 눌러 결과와 다음 단계를 정리합니다. 초안을 원본 대화와 대조해 수정하고 저장하면 상단에 요약이 생기고 그래프에 노트가 추가됩니다.
2. **목적 완료 및 프로젝트 만들기**로 검토한 결과를 프로젝트 페이지로 남깁니다. 상단에서 후속 단계를 추가하고 완료 여부를 기록할 수 있습니다.
3. 연결 그래프에서 노드를 끌어 위치를 조정합니다. 노드 편집 화면에서 기존 페이지를 연결하고 **관련됨**, **문제를 해결함**, **근거를 제공함** 중 연결 유형을 지정할 수 있습니다.

**개인 워크스페이스 → 내 프로필**에서 이름과 아이콘을 설정합니다. **워크스페이스 내보내기**는 다시 가져올 수 있는 JSON을 저장합니다. **슬라이드로 다운로드**는 프로필, 대화, 요약, 프로젝트 단계, 페이지와 연결을 브라우저에서 열거나 PDF로 인쇄할 수 있는 HTML로 저장합니다.

## 공유 AI 공간

Wallace를 열면 **홈**에서 바로 AI에게 질문할 수 있습니다. 첫 질문을 보내면 별도 대화가 시작되고 왼쪽 **내 대화**에 추가됩니다. 실시간 공유 대화는 **개인 워크스페이스 → 공유 AI 공간**에서 열 수 있습니다.

[Figma 디자인](https://www.figma.com/design/xS4J9SGrTe6GJ282AZl6Hv?node-id=2-93)에서 공간 열기, 초대로 참가, 공유 대화 화면을 확인할 수 있습니다.

1. 호스트의 **개인 워크스페이스 → 공유 AI 공간**에서 이름을 입력하고 공간을 엽니다.
2. **초대 주소**를 복사합니다. 참가자는 같은 네트워크에서 Wallace의 **개인 워크스페이스 → 공유 AI 공간 → 초대로 참가**를 열고 주소와 표시 이름을 입력합니다.
3. 질문과 AI 답변은 질문이 들어온 순서대로 모든 참가자에게 표시됩니다. AI는 호스트가 연결한 모델을 사용하며 최근 답변이 완료된 대화 6개를 참고합니다.
4. 대화는 호스트 기기에 저장됩니다. 호스트가 같은 이름으로 공간을 다시 열면 이전 대화가 나타납니다. 새 초대 주소를 공유해 다시 참가할 수 있습니다.
5. 호스트는 **대화 목적 설정**을 사용하거나 첫 질문을 목적으로 삼을 수 있습니다. **내 대화에서 검토하기**로 답변이 완료된 공유 대화를 개인 워크스페이스에 가져와 요약하고 프로젝트로 만들 수 있습니다. 이 프로젝트는 호스트의 워크스페이스에 저장됩니다.

공간에 참가하려면 호스트 앱이 실행 중이어야 합니다. 이 기능은 암호화되지 않는 로컬 네트워크 연결을 사용하므로 신뢰하는 네트워크와 참가자에게만 초대 주소를 공유하세요. 호스트가 클라우드 모델을 연결하면 공유 질문과 최근 대화는 해당 제공업체로 전송됩니다. 개인 워크스페이스의 노드와 AI 키는 참가자에게 제공되지 않습니다.

## LLM과 STT 연결

**개인 워크스페이스 → 설정 및 AI 연결**에서 제공업체를 선택하고, 필요한 경우 API 키를 입력합니다. **모델 목록 불러오기**로 해당 서버의 모델 ID를 확인하고, **연결 테스트**로 선택 모델이 응답하는지 확인한 뒤 저장합니다.

| 제공업체 | 시작 방법 |
| --- | --- |
| OpenAI | OpenAI API 키로 GPT 경량 또는 상위 모델 선택 |
| Google Gemini | Gemini API 키로 Flash 또는 Pro 모델 선택 |
| Hugging Face | Inference Providers 권한을 가진 토큰과 지원 모델 ID 사용. 속도 또는 비용 우선 라우팅 선택 가능 |
| OpenRouter | OpenRouter API 키를 입력하고 **Ling 3.2 Flash · 무료**를 선택. 다른 OpenRouter 모델 ID는 고급 설정에서 입력 가능. [모델과 API 안내](https://openrouter.ai/inclusionai/ling-3.2-flash:free?view=api) |
| Ollama, llama.cpp, SGLang | 원하는 Llama, Gemma, Qwen 등의 모델을 서버에서 먼저 실행한 뒤, 주소와 모델 ID 선택 |
| 직접 연결 | Chat Completions 호환 서버 주소와 모델 ID 입력 |

### LiquidAI LFM3-1.7B 연결

LFM3-1.7B는 Ollama에서 로컬로 실행할 수 있습니다. 지원 버전의 Ollama에서 `ollama serve`를 실행하고, 다른 터미널에서 `ollama pull lfm3:1.7b`로 모델을 받습니다. Wallace의 **설정 및 AI 연결 → Ollama**에서 모델 `lfm3:1.7b`와 주소 `http://127.0.0.1:11434/v1`가 채워집니다. API 키 없이 **연결 테스트** 후 저장합니다. 모델은 텍스트 대화용입니다.

[LiquidAI 모델 카드](https://huggingface.co/LiquidAI/LFM3-1.7B) · [Ollama 모델 페이지](https://ollama.com/library/lfm3)

### 로컬 음성 변환

**개인 워크스페이스 → 음성 변환 및 마이크**에서 **로컬 Whisper**를 선택합니다. 다국어 Tiny(약 78 MB), Base(약 148 MB), Small(약 486 MB) 중 하나를 다운로드하세요. 처음 설치할 때는 Python 3.9–3.14와 인터넷 연결이 필요하며 음성 엔진에도 추가 저장 공간이 필요합니다. 설치 후 선택한 모델은 API 키 없이 기기에서 실행됩니다. 모델과 엔진은 Wallace 앱 데이터 폴더의 `local-stt`에 저장합니다.

**테스트 녹음**을 누르고 최대 10초 동안 말하세요. 입력 점의 움직임을 확인하고 녹음을 재생할 수 있습니다. **음성 변환 테스트**로 현재 선택한 모델의 결과를 확인한 뒤 **음성 설정 저장**을 누르세요. 서버 방식을 선택한 경우 음성 변환 테스트를 누를 때만 테스트 녹음이 표시된 서버로 전송됩니다. 입력 장치 선택은 일반 음성 기록에도 적용됩니다.

음성 변환에는 대화 서버 또는 별도 `audio/transcriptions` 호환 서버를 지정할 수 있습니다. HTTPS 원격 서버와 HTTP localhost를 지원합니다. API 키는 주소별로 운영체제의 보안 저장소를 사용해 암호화합니다.

- **AI 어시스턴트**: 선택 페이지, 직접 연결된 페이지, 질문의 단어 일치를 순위에 반영하여 최대 8개 페이지(각 본문 최대 6,000자)를 전달합니다. 임베딩이나 의미 기반 벡터 검색은 아직 없습니다. 전달한 페이지 목록에서 원문으로 이동할 수 있고, 답변을 연결된 새 페이지로 저장할 수 있습니다.
- **음성 입력**: 운영체제 마이크 권한 승인 후 최대 2분 녹음합니다. 녹음을 끝내면 선택한 방식으로 변환하고, 텍스트를 개인 또는 공유 대화의 입력창에 추가합니다. 내용을 수정한 뒤 직접 보내거나 기록으로 추가할 수 있습니다.
- API 키는 Electron main에서만 복호화합니다. macOS Keychain/Windows의 OS 보안 저장소를 이용한 `safeStorage` 암호화로 보관하고, UI에는 저장 여부만 반환합니다. 보안 저장소가 없으면 키를 저장하지 않습니다.
- 모델 목록 조회와 연결 테스트는 명시적으로 실행할 때 서버에 요청합니다. 테스트에는 고정된 짧은 메시지만 보냅니다. 질문·참고 페이지·해당 녹음이 설정한 서버로 전송되며 API 비용은 사용자 계정에 청구됩니다. API 키 없이도 그래프와 페이지 편집은 동작합니다.

공식 연결 문서는 [OpenAI](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Gemini](https://ai.google.dev/gemini-api/docs/openai), [Hugging Face](https://huggingface.co/docs/inference-providers/en/index), [Ollama](https://docs.ollama.com/api/openai-compatibility), [llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [SGLang](https://docs.sglang.io/docs/basic_usage/openai_api_completions)을 참고하세요.

## 개발 및 빌드

Node.js 24 이상과 npm이 필요합니다.

```sh
npm ci
npm run dev
```

npm이 Electron 설치 스크립트를 차단했다면 `node node_modules/electron/install.js`로 런타임을 설치합니다. `npm run dev:web`은 브라우저 미리보기이며, 데스크톱 전용 AI·STT·설정·가져오기 기능은 사용할 수 없습니다. 미리보기 데이터는 브라우저 localStorage에 별도로 저장됩니다.

```sh
npm test                 # 데이터 유효성, 저장, 검색, API 요청 테스트
npm run build            # TypeScript 검사와 UI 빌드
npm run test:ui          # 실행 중인 dev:web 및 Google Chrome 필요
npm run test:desktop     # 빌드된 dist와 Electron 필요
npm run pack             # Mac에서는 ZIP, 그 외에는 앱 디렉터리
npm run dist:mac         # 현재 Mac 아키텍처의 PKG 및 ZIP
npm run install:mac      # 이 Mac의 /Applications/Wallace.app 한 곳에 설치 및 업데이트
npm run dist:win         # Windows NSIS (Windows 환경 권장)
```

맥 Intel 빌드: `npm run dist:mac -- --x64 --publish never`. Windows와 Mac 빌드는 각 운영체제의 GitHub Actions runner에 구성되어 있습니다. CI는 단위 테스트와 설치 패키지 빌드를 수행합니다. UI 및 native 통합 테스트는 로컬 검증용입니다.

Mac 배포 빌드는 임시 폴더에서 패키징하고 `release/`에 배포 파일만 남깁니다. 이 Mac에서 계속 개발 버전을 사용하려면 `npm run install:mac`으로 같은 앱을 교체하세요. 대화, 모델 및 연결 설정은 앱 데이터 폴더에 저장됩니다. 앱의 **업데이트 확인**에서는 받은 설치 파일을 찾아 열 수 있습니다.

macOS 권한을 다음 업데이트에서도 유지하려면 같은 Developer ID Application 인증서로 서명하세요. `npm run install:mac`은 설치된 Developer ID가 하나일 때 자동으로 사용합니다. 인증서가 여러 개면 `WALLACE_MAC_SIGNING_IDENTITY`로 기존 Wallace에 사용한 인증서를 지정하세요. 서명된 앱은 설치된 앱의 코드 서명 요구 사항을 충족하는 빌드로만 교체됩니다. 기존 ad hoc 빌드에서 Developer ID 서명으로 전환한 뒤 macOS가 권한을 한 번 다시 요청할 수 있습니다.

## 구조와 데이터

- `src/`: React/TypeScript 화면, React Flow 그래프, HTML 편집·미리보기.
- `electron/main.cjs`: 로컬 파일, 창 수명주기, 키 보관, AI/STT 통신.
- `electron/preload.cjs`: 제한된 IPC 인터페이스. renderer에 Node나 임의 파일·네트워크 권한을 노출하지 않습니다.
- `electron/core.cjs`: 워크스페이스 검증, 원자적 파일 교체, 검색 문맥 선정, API 호출.
- `tests/`: 단위 테스트, 실제 Electron 통합 테스트, 브라우저 동작 검사.

워크스페이스는 `app.getPath('userData')/workspace.json`에 저장합니다. macOS의 일반적인 위치는 `~/Library/Application Support/Wallace/`이며 개발 실행에서는 앱 이름이 소문자로 표시될 수 있습니다. Windows는 `%APPDATA%/Wallace/`입니다. 별도 `settings.json`에 API 설정과 암호화된 키를 저장합니다. 내보낸 워크스페이스에는 키가 포함되지 않습니다. **페이지 본문 자체는 암호화하지 않습니다.** 저장 형식은 version 1이며 JSON 파일 교체 시 데이터 검증을 수행합니다.

페이지의 HTML은 DOMPurify로 정리하고 CSP와 Electron 격리를 적용합니다. 스크립트·인라인 스타일·임의 위젯 실행·외부 미디어 로딩은 지원하지 않습니다. HTML은 콘텐츠 구조 커스텀을 위한 기능입니다. 편집 가능한 실행형 플러그인 영역은 후속 범위입니다.

## 현재 범위와 다음 단계

구현됨: 그래프 탐색·이동·연결, 대화 생성·검색·전환, 그래프/노드 즐겨찾기, 대화별 스펙, 페이지 생성·편집·삭제, HTML 본문, 자동 저장, 백업과 복원, LLM 연결, 음성 녹음과 STT, 데스크톱 패키징.

후속 범위: 팀 계정·인터넷을 통한 공유·권한, 동기화·실시간 협업, 버전 복구/실행 취소, 임베딩 검색, 실시간 음성 전사, 플러그인 블록, 자동 업데이트, 배포 서명·공증. 현 버전은 Slack/Notion의 전체 기능 대체를 의미하지 않습니다.

### AI connections and MCP

Open **AI connections** from the workspace menu. Choose a service, save its API key, then select and save a model. Saved keys are reused for their API URL; **Change** lets you replace or delete a key independently of the selected model. The model shortcut is configurable in **Keyboard shortcuts** (default: Cmd+Shift+M on Mac, Ctrl+Shift+M on Windows).

**Run on this device** connects to a running Ollama, vLLM, llama.cpp, or SGLang server. Choose a runtime, use **Load models**, and test the selected model. Use **Server URL and model** to enter a different port or a server API key. The server and its model are started separately.

The desktop **Tools & MCP** tab supports Streamable HTTP MCP servers with optional bearer tokens using the MCP TypeScript SDK v1 client. Add the server URL, connect to discover its tools, enter tool inputs, and choose **Run tool**. **Use in conversation** adds the result to the current draft for review before sending. Tool calls are explicit; models do not automatically execute connected tools. OAuth login and stdio/local command servers are not supported in this version.

AI credentials and MCP tokens are encrypted using Electron secure storage in application settings, outside workspace data and exports. A server URL change does not carry its MCP token to the new URL. Remote MCP endpoints require HTTPS; localhost HTTP is supported for local servers.

Connection verification: `node --test tests/mcp.test.cjs` and, after building, `node tests/connections-desktop.cjs`. These tests use isolated settings and a local fixture server, not personal credentials.

### Embedding models and search indexes

Desktop **AI connections → Embeddings & index** offers local literal keyword search (grep-style, without shell execution or regex) and hybrid keyword/embedding retrieval. Configure an OpenAI-compatible embedding endpoint, load server models, test the selected embedding model, and save. Embedding API keys are encrypted separately from chat credentials.

**Update index** creates a workspace-specific passage index with an inverted word index. In hybrid mode it also embeds note titles and passage text; this sends data to the configured service. Unchanged passage vectors are reused, edited passages are re-embedded, and a changed endpoint/model invalidates previous vectors. Indexing is explicit, not automatic. Live keyword searches see edits immediately; stale/deleted passages are never returned from the cached vectors. **Clear index** removes the index without deleting notes.

The search test covers all workspace notes. Desktop AI replies retrieve only from the current conversation's supplied notes, combining retrieved passages with graph context. When embeddings fail or are not built, retrieval falls back to local keyword search and shows a notice. Shared-room hosts and mobile builds retain their existing basic retrieval. Indexes are local, excluded from workspace export, and limited to 20,000 passages per workspace.

Validation: `node --test tests/retrieval.test.cjs` and `node tests/search-desktop.cjs` use an isolated fixture embedding service to check incremental indexing, model invalidation, scope isolation, encrypted credentials, fallback, and responsive UI.
