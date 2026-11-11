# 출석 이벤트 API

사용자 API는 JWT, 운영 API는 관리자 세션 인증이다. 날짜와 하루 경계는 `Asia/Seoul`이다.

## 기존 STREAK 이벤트 생성

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

기존 검증은 유지한다: 코드 `[A-Z0-9_]{1,50}`, 제목 1~120자, 목표 2~365일, 코인 0~1,000,000, 보너스 일차 1~목표일, 기간 최소 목표일. 같은 모드 내 활성 기간 중첩·코드 중복은 409다. 기존 관리자 생성 요청은 STREAK로 유지하며 CUMULATIVE 생성용 필드는 추가하지 않는다.

## 기존 STREAK 출석 상태

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

기존 두 legacy API는 활성 `STREAK`만 선택하며 크리스마스 누적 출석을 자동 선택하지 않는다. 상태 응답에는 하위 호환 필드 `mode`, `progressDays`, `active`, `availableToday`가 추가된다. STREAK의 `progressDays`는 `currentStreak`와 같다.

가구 이벤트는 `reward.type=FURNITURE`, `generationCreditAmount=0`이며 기존 item 필드를 유지한다. 생성권 보상에서 item 필드는 null이므로 앱은 보상 타입을 구분해야 한다.

## 기존 STREAK 오늘 출석

`POST /api/v1/events/attendance/check-ins` — body 없음.

응답 필드는 `newCheckIn`, `coinRewardAmount`, `coinBalance`, `rewardGrantedNow`, `status`다. `status`는 위 상태 응답이다. `rewardGrantedNow`는 이번 요청에서 **완료 보상(가구 또는 생성권)**을 새로 지급했는지 뜻한다. 중복 호출·완료 후 호출에서는 false이고 코인 지급량은 0이다.

## 이벤트 ID 지정 조회와 출석 (크리스마스 CUMULATIVE)

| method · path | 목적 | 응답 |
| --- | --- | --- |
| `GET /api/v1/events/attendance/{eventId}` | 본인 이벤트 진행도와 보상 이력 | 기존 상태 + 아래 추가 필드. 시작 전/종료 후/비활성 상태도 조회 허용 |
| `POST /api/v1/events/attendance/{eventId}/check-ins` | 지정 이벤트에 KST 오늘 출석 | body 없음. 기존 `AttendanceCheckInResponse`와 같은 필드 |

크리스마스 실제 `attendanceEventId`는 [크리스마스 metadata](../christmas/api.md)로 받는다. 숫자 ID를 앱에 고정하지 않는다.

| 필드 | 계약 |
| --- | --- |
| `mode` | `STREAK` / `CUMULATIVE` |
| `progressDays` | CUMULATIVE는 `min(targetDays, 서로 다른 출석 날짜 수)`, STREAK는 `currentStreak` |
| `currentStreak` | 실제 연속일수 의미 유지. 누적 횟수로 재해석하지 않음 |
| `active` | 이벤트 활성 플래그, KST 기간, 크리스마스 공개 플래그가 모두 유효한지 |
| `availableToday` | `active && !completed && !checkedInToday` |
| `dailyRewards[].claimed` | CUMULATIVE는 누적 `progressDays`까지 수령, STREAK는 현재 연속 진행 기준 |
| `completed` | 목표 진척 완료 여부. 특별 아이템 지급 여부와 별개 |

크리스마스 운영값은 `code=christmas_2026`, `mode=CUMULATIVE`, `targetDays=30`, **2026-11-09~12-25(KST 양 끝 포함)**다. 일반 출석은 30코인, 누적 **5/10/15/20/25/30회째는 그날 총 60코인**이다. 30회 합계는 `24×30 + 6×60 = 1,080`코인이다. `dailyRewards[].day`는 달력 날짜가 아니라 누적 출석 순번이며 서버 보상표를 화면에 바인딩한다.

완료 특별 보상은 **NONE**이다. `reward`는 `{"itemId":null,"name":null,"assetKey":null,"userItemId":null,"received":false,"type":"NONE","generationCreditAmount":0}`이며, 누적 30회를 달성해도 `rewardGrantedNow=false`다. 코인 지급 성공과 `completed=true`로 완주를 표시한다. 트리 지급, 생성권, 기보유 대체 보상은 없다. 트리는 크리스마스 뽑기 보상에 포함한다.

- 빠진 날이 있어도 누적 진행은 초기화하지 않으며 하루 한 번, 당일만 출석한다. 소급/미래 날짜 입력은 받지 않는다.
- 활성 기간 안의 같은 날/완료 후 재요청은 `newCheckIn=false`, `coinRewardAmount=0`, `rewardGrantedNow=false`인 멱등 성공이다. 사용자 잠금과 unique `(event_id,user_id,attendance_date)` 아래 출석, 코인, 원장, 완료 표식을 같은 트랜잭션으로 처리한다. 지급 실패면 모두 롤백한다.
- 기간 밖/비활성/크리스마스 플래그 OFF POST는 기존 중복 출석이라도 **409 `ATTENDANCE_EVENT_NOT_ACTIVE`**다. 종료 뒤 응답 유실 복구는 GET으로 진행도와 지갑을 재조회한다. 없는 ID는 404 `ATTENDANCE_EVENT_NOT_FOUND`다.
- 기존 STREAK와 CUMULATIVE는 병행할 수 있다. legacy 조회/체크인은 STREAK만 선택하고 신규 앱의 크리스마스 화면은 반드시 ID 지정 API를 쓴다. 기존 루틴/투두 완료 후 STREAK 자동 출석 동작은 보존하며 크리스마스를 대신 자동 체크하지 않는다.
- 출석 코인은 루틴/투두 일일 원금 100코인 한도 밖이며 크리스마스 가구 배치 10% 보너스 적용 대상도 아니다.

## 크리스마스 누적 3일차 여우 (2026-11-11)

누적 **3회째** 출석에 기존 30코인과 여우 캐릭터를 함께 지급한다. 코인 보상표와 30회 최종 완료 보상 `NONE`은 유지한다. 여우는 출석 보상 전용이며 온보딩 무료 선택, 캐릭터 뽑기, 봇 기본 캐릭터 지급에서 제외한다.

상태 응답에는 다음 additive 필드를 추가한다. 캐릭터 보상 설정이 없거나 캐릭터가 비활성이면 `characterReward=null`이다.

```json
"characterReward": {
  "day": 3,
  "characterId": 11,
  "name": "여루",
  "assetKey": "characters/fox/base-v1.webp",
  "received": false,
  "claimable": true
}
```

ID 11은 예시다. 실제 ID는 응답을 사용한다. `received`는 이 이벤트의 코인 수령 여부와 다르게, 해당 캐릭터를 한 번이라도 보유한 이력이다. 삭제된 보유 이력도 다시 지급하지 않는다. `claimable`은 이벤트 기간/활성 플래그, 크리스마스 공개 플래그, 캐릭터 활성, 누적 3일 이상, 미보유 이력을 모두 만족할 때만 true다.

출석 POST는 누적 3회 이상이고 미보유일 때 캐릭터를 자동 지급한다. 응답에 `characterGrantedNow`를 추가하며 기존 `rewardGrantedNow`는 최종 가구/생성권 보상 의미를 유지한다. 코인, 출석, 캐릭터와 원장을 같은 트랜잭션에서 처리하고 실패 시 모두 롤백한다. 비활성 캐릭터는 코인 출석을 막지 않고 지급을 보류한다.

`POST /api/v1/events/attendance/{eventId}/character-reward`는 body 없이 본인의 이미 달성한 캐릭터 보상을 수령한다. 응답은 `{ "grantedNow": true, "status": <출석 상태> }`다. 이미 3일차를 받은 사용자도 이 경로로 받을 수 있으며 오늘 출석이나 코인을 추가하지 않는다. 계정별 user 행 잠금 안에서 보유 이력을 검사하므로 출석, 별도 수령, 관리자 지급, 온보딩과 뽑기가 경합해도 중복 보유를 만들지 않는다. 이미 보유한 캐릭터는 재화로 환산하지 않으며 `grantedNow=false`다. 선택 중인 기존 대표 캐릭터는 보존한다.

- 아직 3회 미달: 409 `ATTENDANCE_CHARACTER_REWARD_LOCKED`.
- 캐릭터 보상 미설정/비활성: 409 `ATTENDANCE_CHARACTER_REWARD_NOT_AVAILABLE`.
- 이벤트 기간 밖/비활성/공개 플래그 OFF: 409 `ATTENDANCE_EVENT_NOT_ACTIVE`.
- 인증되지 않은 요청은 기존 JWT 인증 정책에 따라 거부한다. 사용자 ID를 body/query에서 받지 않는다.
- GET은 지급하지 않는다. 앱이 상태의 `claimable`을 보고 별도 수령 POST를 요청하며, 같은 세션에서 실패한 POST를 자동 반복하지 않는다. 응답 유실은 GET 재조회로 복구하고 보유 캐릭터 캐시를 갱신한다. 수동 재시도는 가능하다.
- 앱은 기존에 3회 이상 달성한 계정도 홈 진입 시 수령을 한 번 시도한다. 이 요청은 오늘 출석을 대신하지 않는다. 실패 시 출석 화면에서 수동으로 수령할 수 있다.
- 캐릭터 교체는 모든 보유 활성 캐릭터에 대해 레벨 제한이 없다. 캐릭터 뽑기는 레벨 10 해금을 유지한다.

## 생성권 및 가구 생성

- `GET /api/v1/me/furniture-credits`: `available`, `reserved`, `purchaseAdjustmentPending`, `accountToken`. 사진 생성 UI는 생성권 잔액과 `GET /api/v1/me/wallets`의 `COIN` 잔액을 사용한다. 생성권 1회를 우선 사용하며, 없으면 100코인으로 접수할 수 있다.
- `POST /api/v1/me/furniture-generations`: multipart의 `requestId`(UUID), `photo`(JPEG/PNG, 10MB 이하), 선택 `targetHint`(120자 이하). 202와 작업 상태를 반환한다.
- `GET /api/v1/me/furniture-generations`: `{ "items": [...] }`, 본인 최근 작업 20개.
- `GET /api/v1/me/furniture-generations/{id}`: 본인 작업 상세.
- 작업 상태는 `UPLOADING`, `QUEUED`, `PROCESSING`, `SUCCEEDED`, `FAILED`. 공개 필드에는 `id`, `assetKey`, `userItemId`, `failureCode`가 포함된다. 검수 전 이미지와 원본 key는 노출하지 않는다.
- 가구 피드백 재검수(`POST /api/v1/me/furniture-generations/{id}/feedback`)는 그 가구가 거래소에 상장돼 있으면 `FURNITURE_MARKET_LISTED`(409)로 거절한다.
- 생성권과 100코인이 모두 없으면 402 `FURNITURE_CREDITS_REQUIRED`다. 진행 중 작업은 `FURNITURE_JOB_IN_PROGRESS`, 사용 불가는 `FURNITURE_GENERATION_UNAVAILABLE`다. 일일 접수 한도는 없다.
- 실패나 만료 시 접수에서 사용한 수단으로 한 번만 환급한다. 코인 차감은 지갑 원장 `reason=FURNITURE_GENERATION`, 실패 환급은 `reason=FURNITURE_GENERATION_REFUND`로 기록한다. 같은 `requestId` 재전송과 내부 재시도는 추가 차감하지 않는다.

## 출석 에러

| status | code | 의미 |
| --- | --- | --- |
| 404 | ATTENDANCE_EVENT_NOT_FOUND | legacy의 오늘 유효한 STREAK 없음 또는 지정 ID 없음 |
| 409 | ATTENDANCE_EVENT_NOT_ACTIVE | 지정 이벤트 기간 밖/비활성 또는 크리스마스 공개 플래그 OFF |
| 500 | ATTENDANCE_EVENT_CONFIGURATION_INVALID | 활성 이벤트 중복 |
| 400 | ATTENDANCE_EVENT_PERIOD_TOO_SHORT | 기간 부족 |
| 400 | ATTENDANCE_EVENT_BONUS_DAY_INVALID | 보너스 일차 초과 |
| 400 | ATTENDANCE_GENERATION_TARGET_INVALID | 생성권 이벤트 목표가 7일이 아님 |
| 409 | ATTENDANCE_EVENT_CODE_DUPLICATED | 코드 중복 |
| 409 | ATTENDANCE_EVENT_PERIOD_OVERLAPPED | 활성 기간 중첩 |
| 404 | ATTENDANCE_REWARD_ITEM_NOT_FOUND | 기존 방식 보상 아이템 없음 |
| 400 | ATTENDANCE_REWARD_ITEM_INVALID | 기존 방식 보상 가구가 비활성 또는 배치 불가 |

이미 크리스마스 출석을 누른 계정도 누적 3회 이상이면 여루 수령 대상이다. 오늘 출석 완료 여부나 30회 완주 여부는 캐릭터 소급 수령을 막지 않는다. 이벤트가 활성 상태인 다음 접속에서 캐릭터만 수령하며 기존 코인과 출석 기록은 변경하지 않는다.
