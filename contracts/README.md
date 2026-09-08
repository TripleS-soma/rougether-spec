# contracts — 실행 가능한 계약 예제

문장으로만 적힌 규칙("날짜는 KST 기준")은 양쪽 구현이 각자 맞다고 믿는 채로 경계에서 어긋날 수 있다. 이 폴더는 프론트와 백엔드가 **같은 데이터로 같은 의미를 검증**하도록 고정된 입력과 기대값을 둔다.

## date-boundary-cases.json — 날짜·시각 경계

- 근거 규칙: [api.md](../api.md) 공통 규칙의 "날짜와 시각" 항목.
- 각 case는 고정된 순간(`instant`, UTC)과 단말 시간대(`deviceTimeZone`)에서 클라이언트가 만들어야 하는 `YYYY-MM-DD`(`expectedDate`, Asia/Seoul 달력 날짜)를 적는다.
- `naive.utcTruncated`는 `toISOString().slice(0, 10)` 같은 UTC 절단이, `naive.deviceLocal`은 단말 로컬 날짜가 그 순간에 만들어내는 값과 서버 판정(`TODAY` / `PAST` / `FUTURE`)이다. 사고 재현과 "테스트에 이빨이 있는지" 확인에 쓴다.
- `kstClock`은 사람이 읽기 위한 같은 순간의 KST 표기다(검증기가 `instant`와 같은 순간인지 확인한다).

### 소비하는 쪽

- 모바일(`rougether-mobile`): `contracts/date-boundary-cases.json`에 그대로 복사해 두고, 시계를 `instant`로 고정한 채 실제 요청 생성 코드가 `expectedDate`를 만드는지 검증한다. 단말 시간대는 `TZ` 환경변수로 바꿔 가며 돌린다.
- 서버(`rougether-server`): `user-api/src/test/resources/contracts/`에 복사해 두고, `Clock`을 `instant`로 고정한 채 `expectedDate`가 당일로, `naive.*`가 적힌 verdict대로 판정되는지 검증한다. 모바일이 기록한 실제 요청 본문도 같은 테스트가 재생한다.
- 복사본은 spec 파일과 **바이트 단위로 같아야** 하며, 복사본 옆 `sources.json`(모바일 `contracts/sources.json`, 서버 `user-api/src/test/resources/contracts/sources.json`)에 복사한 spec 커밋 SHA를 적는다. 서버 저장소의 교차 검증 워크플로가 spec 최신 커밋과 복사본을 대조해 어긋나면 실패시킨다.

### 바꿀 때

1. 이 파일을 고친 뒤 `node contracts/validate-date-boundary.js`로 자체 검증한다(CI도 같은 검증을 돌린다).
2. case 추가는 자유롭다. 기존 case의 `expectedDate`를 바꾸는 것은 계약 변경이므로 양쪽 담당과 합의한다.
3. 양쪽 저장소의 복사본과 `sources.json`을 갱신한다.
