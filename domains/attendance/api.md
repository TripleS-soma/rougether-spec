# 연속 출석 이벤트 API

사용자 API는 JWT, 운영 API는 관리자 세션 인증이다. 날짜와 하루 경계는 `Asia/Seoul`이다.

## 이벤트 생성

`POST /admin/attendance-events`

```json
{
  "code": "ATTENDANCE_AI_7D_2026",
  "title": "7일 출석 · 나만의 가구",
  "startsOn": "2026-09-10",
  "endsOn": "2026-10-09",
  "targetDays": 7,
  "dailyCoinAmount": 30,
  "bonusDay": 5,
  "bonusCoinAmount": 50,
  "rewardItemId": null
}
```

날짜는 예시이며 운영 확정값이 아니다. `rewardItemId`를 생략하거나 null로 보내면 생성권 1회 보상이다. 생성권 이벤트는 `targetDays=7`만 허용하며 다른 값은 400 `ATTENDANCE_GENERATION_TARGET_INVALID`다. 성공 201 응답은 `id`, 요청 설정, `generationCreditAmount=1`을 포함한다.

기존 가구 이벤트 요청도 지원한다. `rewardItemId`가 있으면 가구 보상이고 `generationCreditAmount=0`이다. `rewardItemId`는 양수이며 존재하는 활성 `positioned` 가구여야 한다.

기존 검증은 유지한다: 코드 `[A-Z0-9_]{1,50}`, 제목 1~120자, 목표 2~365일, 코인 0~1,000,000, 보너스 일차 1~목표일, 기간 최소 목표일. 기간 중첩·코드 중복은 409다.

## 출석 상태

`GET /api/v1/events/attendance`

```json
{
  "eventId": 8,
  "code": "ATTENDANCE_AI_7D_2026",
  "title": "7일 출석 · 나만의 가구",
  "startsOn": "2026-09-10",
  "endsOn": "2026-10-09",
  "targetDays": 7,
  "currentStreak": 0,
  "checkedInToday": false,
  "completed": false,
  "checkInDates": [],
  "dailyRewards": [
    {"day":1,"coinAmount":30,"furnitureReward":false,"claimed":false,"generationCreditAmount":0},
    {"day":2,"coinAmount":30,"furnitureReward":false,"claimed":false,"generationCreditAmount":0},
    {"day":3,"coinAmount":30,"furnitureReward":false,"claimed":false,"generationCreditAmount":0},
    {"day":4,"coinAmount":30,"furnitureReward":false,"claimed":false,"generationCreditAmount":0},
    {"day":5,"coinAmount":50,"furnitureReward":false,"claimed":false,"generationCreditAmount":0},
    {"day":6,"coinAmount":30,"furnitureReward":false,"claimed":false,"generationCreditAmount":0},
    {"day":7,"coinAmount":30,"furnitureReward":false,"claimed":false,"generationCreditAmount":1}
  ],
  "reward": {
    "type":"GENERATION_CREDIT",
    "generationCreditAmount":1,
    "itemId":null,
    "name":"AI 가구 생성권",
    "assetKey":null,
    "userItemId":null,
    "received":false
  }
}
```

가구 이벤트는 `reward.type=FURNITURE`, `generationCreditAmount=0`이며 기존 item 필드를 유지한다. 생성권 보상에서 item 필드는 null이므로 앱은 보상 타입을 구분해야 한다.

## 오늘 출석

`POST /api/v1/events/attendance/check-ins` — body 없음.

응답 필드는 `newCheckIn`, `coinRewardAmount`, `coinBalance`, `rewardGrantedNow`, `status`다. `status`는 위 상태 응답이다. `rewardGrantedNow`는 이번 요청에서 **완료 보상(가구 또는 생성권)**을 새로 지급했는지 뜻한다. 중복 호출·완료 후 호출에서는 false이고 코인 지급량은 0이다.

## 생성권 및 가구 생성

- `GET /api/v1/me/furniture-credits`: `available`, `reserved`, `purchaseAdjustmentPending`, `accountToken`. 사진 생성 UI는 잔액 두 필드를 사용한다.
- `POST /api/v1/me/furniture-generations`: multipart의 `requestId`(UUID), `photo`(JPEG/PNG, 10MB 이하), 선택 `targetHint`(120자 이하). 202와 작업 상태를 반환한다.
- `GET /api/v1/me/furniture-generations`: `{ "items": [...] }`, 본인 최근 작업 20개.
- `GET /api/v1/me/furniture-generations/{id}`: 본인 작업 상세.
- 작업 상태는 `UPLOADING`, `QUEUED`, `PROCESSING`, `SUCCEEDED`, `FAILED`. 공개 필드에는 `id`, `assetKey`, `userItemId`, `failureCode`가 포함된다. 검수 전 이미지와 원본 key는 노출하지 않는다.
- 생성권 부족은 `FURNITURE_CREDITS_REQUIRED`, 진행 중 작업은 `FURNITURE_JOB_IN_PROGRESS`, 일일 한도는 `FURNITURE_DAILY_LIMIT`, 사용 불가는 `FURNITURE_GENERATION_UNAVAILABLE`다.

## 출석 에러

| status | code | 의미 |
| --- | --- | --- |
| 404 | ATTENDANCE_EVENT_NOT_FOUND | 오늘 유효한 이벤트 없음 |
| 500 | ATTENDANCE_EVENT_CONFIGURATION_INVALID | 활성 이벤트 중복 |
| 400 | ATTENDANCE_EVENT_PERIOD_TOO_SHORT | 기간 부족 |
| 400 | ATTENDANCE_EVENT_BONUS_DAY_INVALID | 보너스 일차 초과 |
| 400 | ATTENDANCE_GENERATION_TARGET_INVALID | 생성권 이벤트 목표가 7일이 아님 |
| 409 | ATTENDANCE_EVENT_CODE_DUPLICATED | 코드 중복 |
| 409 | ATTENDANCE_EVENT_PERIOD_OVERLAPPED | 활성 기간 중첩 |
| 404 | ATTENDANCE_REWARD_ITEM_NOT_FOUND | 기존 방식 보상 아이템 없음 |
| 400 | ATTENDANCE_REWARD_ITEM_INVALID | 기존 방식 보상 가구가 비활성 또는 배치 불가 |
