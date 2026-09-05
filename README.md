# 온라인 연수등록부 (직접 배포용)

cnesign.kr을 참고해 만든 간단 버전입니다. **연수자료 링크 등록**과 **만족도 조사**
기능은 요청대로 제외했고, 다음 기능만 들어있습니다.

- 관리자 로그인 / 회원가입
- 새 연수등록부 생성·수정·삭제, 검색
- 사전 명단(소속/직위/성명) 붙여넣기 입력
- QR 코드 / 링크로 서명 페이지 공유
- 참석자가 스마트폰으로 소속·직위·성명 입력 + 손가락 전자서명
- 사전 명단과 자동 매칭 표시
- 참석자 명단 확인 및 등록부 인쇄(브라우저 인쇄 → PDF로 저장)

파일 구조는 순수 HTML/CSS/JS라 **GitHub Pages**에 그대로 올리면 프론트엔드는 끝입니다.
다만 로그인 계정 정보, 등록부, 참석자 서명 같은 **데이터는 저장할 서버가 필요**해서
무료인 **Firebase(Authentication + Firestore)**를 붙였습니다. GitHub는 정적 파일만
서빙할 뿐 DB 기능이 없기 때문입니다.

---

## 1. Firebase 프로젝트 만들기 (10분)

1. https://console.firebase.google.com 접속 → 구글 계정으로 로그인 → **프로젝트 추가**
2. 프로젝트 이름 입력(예: `my-register-app`) → 애널리틱스는 꺼도 무방 → 만들기
3. 왼쪽 메뉴 **빌드 > Authentication** → **시작하기** → **로그인 방법** 탭에서
   **이메일/비밀번호** 사용 설정
4. 왼쪽 메뉴 **빌드 > Firestore Database** → **데이터베이스 만들기** →
   위치는 `asia-northeast3(서울)` 선택 → 처음엔 **테스트 모드**로 시작해도 되지만,
   실제 운영 전에는 아래 3번 단계의 보안 규칙으로 반드시 교체하세요.
5. 왼쪽 위 ⚙️(프로젝트 설정) → 일반 탭 맨 아래 **내 앱** → `</>` (웹 앱 추가) 클릭
   → 앱 닉네임 아무거나 입력 → **Firebase Hosting은 체크 안 해도 됩니다** → 앱 등록
6. 화면에 나오는 `firebaseConfig` 객체를 통째로 복사해서
   `js/firebase-config.js` 파일의 값과 바꿔치기 하세요.

```js
export const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "my-register-app.firebaseapp.com",
  projectId: "my-register-app",
  storageBucket: "my-register-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};
```

## 2. Firestore 보안 규칙 설정 (중요)

Firestore Database > **규칙** 탭에서 아래 내용으로 바꾸고 **게시**를 누르세요.
관리자(로그인한 사람)만 자기 등록부를 수정할 수 있고, 참석자는 로그인 없이도
서명을 등록할 수 있게 하는 최소한의 규칙입니다.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /registers/{registerId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null
        && request.auth.uid == resource.data.ownerUid;

      match /preList/{docId} {
        allow read: if true;
        allow write: if request.auth != null
          && request.auth.uid == get(/databases/$(database)/documents/registers/$(registerId)).data.ownerUid;
      }

      match /attendees/{docId} {
        allow read: if request.auth != null
          && request.auth.uid == get(/databases/$(database)/documents/registers/$(registerId)).data.ownerUid;
        allow create: if true;
        allow update, delete: if false;
      }
    }
  }
}
```

> 참고: 서명 페이지는 참석자가 로그인하지 않은 상태에서 접근하므로,
> `attendees` 문서는 누구나 **생성**은 할 수 있게 열려 있습니다(원본 사이트와 동일한 구조).
> 열람은 담당 관리자만 가능하도록 막아뒀습니다.

## 3. Authorized domain 등록

Authentication > Settings > **승인된 도메인**에 배포할 GitHub Pages 주소
(예: `your-id.github.io`)를 추가해야 로그인이 정상 동작합니다.

## 4. GitHub Pages로 배포하기

1. GitHub에 새 저장소 생성 (예: `register-app`)
2. 이 폴더(`index.html`, `sign.html`, `css/`, `js/`, `README.md`) 전체를 그대로 업로드/푸시
3. 저장소 **Settings > Pages** → Source를 `main` 브랜치, `/ (root)`로 설정 → Save
4. 몇 분 뒤 `https://아이디.github.io/register-app/` 주소로 접속 가능
5. 관리자 페이지: `.../register-app/index.html`
   서명 페이지는 QR 모달에서 자동 생성되는 링크(`sign.html?id=등록부ID`)를 사용하면 됩니다.

## 5. 로컬에서 미리 테스트하기

브라우저는 `file://`로 열면 모듈(import) 로드가 막힐 수 있어, 간단한 로컬 서버로 열어보세요.

```bash
# 이 폴더 안에서 실행
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080 접속
```

---

## 데이터 구조 (Firestore)

```
registers (컬렉션)
  └ {registerId}
       org, title, dateTime, location, borderColor, ownerUid, createdAt
       └ preList (하위 컬렉션)
            org, position, name, matched
       └ attendees (하위 컬렉션)
            org, position, name, signature(base64 이미지), matched, preListId, signedAt
```

## 알아두면 좋은 점 / 한계

- 서명은 이미지(PNG base64)로 Firestore 문서에 그대로 저장합니다. 문서당 1MB 제한이 있지만
  서명 한 장은 보통 수십 KB 수준이라 문제없습니다.
- 명단 매칭은 **성명이 정확히 일치**할 때만 동작하는 단순 매칭입니다. 동명이인이 있는
  경우 첫 번째로 검색된 사람과 매칭되니, 소속까지 함께 확인하는 습관을 들이면 좋습니다.
- PDF 출력은 별도 라이브러리 없이 브라우저 **인쇄 → PDF로 저장** 기능을 사용합니다.
  크롬 기준으로 안정적으로 동작합니다.
- 무료 Firebase Spark 요금제로도 학교/부서 단위 사용량은 충분히 커버됩니다.
