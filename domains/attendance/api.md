# 연속 출석 이벤트 API

인증된 사용자 API는 JWT, 운영 API는 별도 관리자 세션 인증을 사용한다. 날짜·하루 경계는 모두 `Asia/Seoul` 기준이다.

## 사용자 API

### `GET /api/v1/events/attendance`

KST 오늘 진행 중인 출석 이벤트와 로그인 사용자의 상태를 반환한다.

```json
{
  "eventId": 7,
  "code": "ATTENDANCE_10D_2026",
  "title": "10일 연속 출석",
  "startsOn": "2026-08-16",
  "endsOn": "2026-09-14",
  "targetDays": 10,
  "currentStreak": 3,
  "checkedInToday": true,
  "completed": false,
  "checkInDates": ["2026-08-16", "2026-08-17", "2026-08-18"],
  "dailyRewards": [
    {"day": 1, "coinAmount": 30, "furnitureReward": false, "claimed": true},
    {"day": 2, "coinAmount": 30, "furnitureReward": false, "claimed": true},
    {"day": 3, "coinAmount": 30, "furnitureReward": false, "claimed": true},
    {"day": 4, "coinAmount": 30, "furnitureReward": false, "claimed": false},
    {"day": 5, "coinAmount": 50, "furnitureReward": false, "claimed": false},
    {"day": 6, "coinAmount": 30, "furnitureReward": false, "claimed": false},
    {"day": 7, "coinAmount": 30, "furnitureReward": false, "claimed": false},
    {"day": 8, "coinAmount": 30, "furnitureReward": false, "claimed": false},
    {"day": 9, "coinAmount": 30, "furnitureReward": false, "claimed": false},
    {"day": 10, "coinAmount": 30, "furnitureReward": true, "claimed": false}
  ],
  "reward": {
    "itemId": 42,
    "name": "10일 출석 기념 트로피",
    "assetKey": "items/events/attendance-10-day-trophy.png",
    "userItemId": null,
    "received": false
  }
}
```

### `POST /api/v1/events/attendance/check-ins`

요청 body 없이 KST 오늘 출석을 기록한다. 같은 날 재호출과 완료 후 재호출은 멱등 성공한다.

```json
{
  "newCheckIn": true,
  "coinRewardAmount": 30,
  "coinBalance": 190,
  "rewardGrantedNow": false,
  "status": {
    "eventId": 7,
    "code": "ATTENDANCE_10D_2026",
    "title": "10일 연속 출석",
    "startsOn": "2026-08-16",
    "endsOn": "2026-09-14",
    "targetDays": 10,
    "currentStreak": 3,
    "checkedInToday": true,
    "completed": false,
    "checkInDates": ["2026-08-16", "2026-08-17", "2026-08-18"],
    "dailyRewards": [
      {"day": 1, "coinAmount": 30, "furnitureReward": false, "claimed": true},
      {"day": 2, "coinAmount": 30, "furnitureReward": false, "claimed": true},
      {"day": 3, "coinAmount": 30, "furnitureReward": false, "claimed": true},
      {"day": 4, "coinAmount": 30, "furnitureReward": false, "claimed": false},
      {"day": 5, "coinAmount": 50, "furnitureReward": false, "claimed": false},
      {"day": 6, "coinAmount": 30, "furnitureReward": false, "claimed": false},
      {"day": 7, "coinAmount": 30, "furnitureReward": false, "claimed": false},
      {"day": 8, "coinAmount": 30, "furnitureReward": false, "claimed": false},
      {"day": 9, "coinAmount": 30, "furnitureReward": false, "claimed": false},
      {"day": 10, "coinAmount": 30, "furnitureReward": true, "claimed": false}
    ],
    "reward": {
      "itemId": 42,
      "name": "10일 출석 기념 트로피",
      "assetKey": "items/events/attendance-10-day-trophy.png",
      "userItemId": null,
      "received": false
    }
  }
}
```

- `newCheckIn`: 이번 호출에서 오늘 출석 row를 새로 만들었는지.
- `coinRewardAmount`: 이번 호출에서 실제 적립한 코인. 멱등 재호출과 완료 후 호출은 0이다.
- `coinBalance`: 처리 후 현재 코인 잔액.
- `rewardGrantedNow`: 이번 호출에서 새 `user_items` row를 지급했는지. 10일차라도 이미 가구를 보유했다면 false다.
- `status.reward.received`: 목표 완료와 보상 처리가 끝났는지. 기존 가구로 완료한 경우도 true다.

## 운영 API

### `POST /admin/attendance-events`

관리자 세션 인증이 필요하다. 운영 스크립트 호출 경로라 CSRF 검사는 제외하지만 origin 검증과 인증은 유지한다.

```json
{
  "code": "ATTENDANCE_10D_2026",
  "title": "10일 연속 출석",
  "startsOn": "2026-08-16",
  "endsOn": "2026-09-14",
  "targetDays": 10,
  "dailyCoinAmount": 30,
  "bonusDay": 5,
  "bonusCoinAmount": 50,
  "rewardItemId": 42
}
```

성공 시 201과 생성된 `id`를 포함해 요청 설정을 그대로 반환한다.

validation:

- `code`: 대문자 영문·숫자·밑줄, 1~50자, 전체 이벤트에서 unique.
- `title`: 1~120자.
- `targetDays`: 2~365. 첫 이벤트는 10.
- `dailyCoinAmount`, `bonusCoinAmount`: 0~1,000,000. `bonusCoinAmount`는 추가분이 아니라 해당 일차 총 지급량.
- `bonusDay`: 1~`targetDays`. 첫 이벤트는 5.
- 이벤트 기간: `startsOn`부터 `endsOn`까지가 `targetDays` 이상.
- `rewardItemId`: 존재하고 활성 상태인 `placementType=positioned` 아이템.
- 활성 이벤트 기간 중첩 불가.

## 에러 코드

| status | code | 상황 |
| --- | --- | --- |
| 404 | `ATTENDANCE_EVENT_NOT_FOUND` | KST 오늘 진행 중인 이벤트 없음 |
| 500 | `ATTENDANCE_EVENT_CONFIGURATION_INVALID` | 활성 이벤트가 같은 날짜에 2개 이상 존재 |
| 400 | `ATTENDANCE_EVENT_PERIOD_TOO_SHORT` | 운영 생성 기간이 목표 일수보다 짧음 |
| 400 | `ATTENDANCE_EVENT_BONUS_DAY_INVALID` | 보너스 일차가 목표 일차보다 큼 |
| 409 | `ATTENDANCE_EVENT_CODE_DUPLICATED` | 이벤트 코드 중복 |
| 409 | `ATTENDANCE_EVENT_PERIOD_OVERLAPPED` | 활성 이벤트 기간 중첩 |
| 404 | `ATTENDANCE_REWARD_ITEM_NOT_FOUND` | 보상 아이템 없음 |
| 400 | `ATTENDANCE_REWARD_ITEM_INVALID` | 보상 아이템이 비활성이거나 배치형 가구가 아님 |
