# 미니게임 API

모든 엔드포인트는 사용자 JWT 인증을 요구한다. 성공 응답은 별도 envelope 없이 반환하며 에러는 [공통 규약](../../api.md)을 따른다. 사용자 ID는 요청 본문에서 받지 않고 인증 주체로 결정한다.

## 규칙 버전 선택

게임 코드는 `room-runner`, `cat-stairs`, `cat-merge`를 유지한다. 목록·시작은 선택 쿼리 `rulesVersion`을 받으며 지원 값은 1과 2다. 생략하면 기존 앱과 같은 규칙 1을 사용하고, 새 앱은 난이도를 높인 규칙 2를 명시한다. 지원하지 않는 버전은 오류이며 다른 버전으로 자동 대체하지 않는다.

완료 API는 버전 쿼리를 받지 않는다. 서버에 저장된 `runId`의 규칙 버전으로 입력과 점수를 검증하므로 클라이언트가 완료 시점에 버전을 바꿀 수 없다. 최고점과 순위는 규칙 버전을 구분하지 않고 게임별로 계산한다.

## 게임 목록

`GET /api/v1/minigames?rulesVersion=2` → 200

```json
{
  "items": [
    {
      "gameCode": "room-runner",
      "name": "루틴 러너",
      "description": "탭해서 장애물을 넘고, 최고 기록에 도전해요.",
      "rulesVersion": 2
    },
    {
      "gameCode": "cat-stairs",
      "name": "고양이 계단",
      "description": "왼쪽, 오른쪽! 고양이와 더 높이 올라가요.",
      "rulesVersion": 2
    },
    {
      "gameCode": "cat-merge",
      "name": "고양이 합치기",
      "description": "같은 숫자의 고양이를 합쳐 더 큰 숫자를 만들어요.",
      "rulesVersion": 2
    }
  ]
}
```

목록의 `description`은 게임 설명이며 모든 화면에 반복 노출할 필요는 없다. 지원 코드와 요청한 규칙 버전이 응답과 일치하는 게임만 랭킹용으로 실행한다. 쿼리를 생략하거나 1을 보내면 같은 응답 구조의 규칙 1 목록을 반환한다.

## 게임 시작

`POST /api/v1/minigames/{gameCode}/runs?rulesVersion=2` — body 없음 → 201

```json
{
  "runId": "12345678-1234-4234-9234-123456789abc",
  "gameCode": "room-runner",
  "rulesVersion": 2,
  "seed": 20260912,
  "maxTicks": 18000,
  "expiresAt": "2026-09-12T03:30:00Z"
}
```

- `runId`: UUID 문자열. 인증된 회원과 요청한 게임에 귀속된다.
- `seed`: 서버가 발급한 1~2,147,483,647 정수. 보드·장애물·계단 방향은 이 값으로 재현한다.
- `rulesVersion`: 해당 세션에서 적용할 규칙 버전. 요청에서 생략하면 1이다. 앱은 자신이 요청한 버전과 일치하는지 확인한 후 시작한다.
- `maxTicks`: 게임별 상한. 러너·합치기 18,000, 계단 7,200이다.
- `expiresAt`: 생성 시각 + 30분인 절대 시각(ISO-8601, `Z`는 UTC). 일시정지나 재시도로 늘어나지 않는다.
- 시작 요청은 매번 새 세션을 만든다. 완료 응답 유실 시에는 새 세션을 만들지 않고 기존 완료 요청을 재전송한다.

## 플레이 기록 제출

`POST /api/v1/minigames/{gameCode}/runs/{runId}/finish` → 200

러너 요청 형식 예시:

```json
{"ticks": 301, "jumpTicks": [180]}
```

계단·합치기 요청 형식 예시:

```json
{
  "ticks": 187,
  "actions": [
    {"tick": 1, "direction": "LEFT"},
    {"tick": 7, "direction": "LEFT"}
  ]
}
```

위 입력 예시는 형식만 보여 준다. 실제 수락 여부와 점수는 세션의 시드 및 게임·규칙 버전에 따라 달라진다.

| 필드 | 공통 검증 | 게임별 검증 |
| --- | --- | --- |
| `ticks` | 필수 정수, 1~18,000 | 해당 게임의 `maxTicks` 이하, 일시정지 제외 60 Hz 진행 시간 |
| `jumpTicks` | 정수 배열, 최대 600개, 각 값 1~18,000 | 러너에서만 사용, 각 값은 `ticks` 이하이며 중복 없는 오름차순 |
| `actions` | 객체 배열, 최대 2,000개, 각 `tick`은 필수 정수 1~18,000, `direction` 필수 | 계단 최대 1,200개 / 합치기 최대 2,000개, `tick <= ticks`, 중복 없는 오름차순 |
| `actions[].direction` | `LEFT`, `RIGHT`, `UP`, `DOWN` 중 하나 | 계단은 `LEFT`, `RIGHT`만 허용, 연속 입력 간격 최소 6 tick |

- `jumpTicks`와 `actions` 중 정확히 하나만 non-null이어야 한다. 사용하지 않는 필드는 생략하거나 null로 보낸다. 선택한 배열은 비어 있을 수 있다.
- `score`, `seed`, `rulesVersion`, `userId`는 완료 요청 필드가 아니다. 점수는 서버가 세션 정보와 입력으로 계산한다. 규칙 1 세션에는 기존 규칙 1의 입력 제한과 점수 계산을 그대로 적용한다.
- 게임에 맞지 않는 입력 종류, 종료 후 입력, 공중 재점프, 변화 없는 합치기 이동 등은 거부한다. 고양이 합치기의 변화 없는 이동은 클라이언트가 입력 기록에서 제외한다.
- 본인 세션이 아니거나 path의 게임이 해당 세션의 게임과 다르면 404다.
- 아직 완료되지 않은 세션의 최초 제출은 `현재 시각 < expiresAt`이어야 한다. `(서버 경과 밀리초 + 2,000) × 60 >= ticks × 1,000` 조건을 만족해야 한다.

응답 예시:

```json
{
  "runId": "12345678-1234-4234-9234-123456789abc",
  "score": 50,
  "bestScore": 120,
  "personalBest": false,
  "rank": 12
}
```

| 필드 | 의미 |
| --- | --- |
| `score` | 이번 세션의 서버 검증 점수 |
| `bestScore` | 이번 결과까지 반영한 해당 게임의 본인 최고점. 이전 규칙에서 얻은 최고점도 포함한다. |
| `personalBest` | 해당 게임의 최초 기록이거나 기존 최고점보다 높은지 여부 |
| `rank` | 해당 게임의 `bestScore`를 기준으로 한 최초 완료 당시의 순위 |

같은 완료 입력의 재전송은 만료 이후에도 위 최초 응답을 그대로 반환한다. 최고점·현재 순위가 필요하면 해당 게임의 랭킹 API를 다시 조회한다. 유효한 다른 입력을 같은 세션에 제출하면 409 `MINIGAME_RUN_ALREADY_FINISHED`다.

## 전체 회원 랭킹

`GET /api/v1/minigames/{gameCode}/leaderboard` → 200. 규칙 버전·페이지·기간·집 필터 없음.

```json
{
  "items": [
    {"rank": 1, "userId": 101, "nickname": "고양이 이웃", "score": 300},
    {"rank": 1, "userId": 202, "nickname": "루틴 이웃", "score": 300},
    {"rank": 3, "userId": 303, "nickname": "우리집 고양이", "score": 250}
  ],
  "myEntry": {"rank": 3, "userId": 303, "nickname": "우리집 고양이", "score": 250},
  "totalPlayers": 3
}
```

- `items`: 해당 게임의 개인 최고점 상위 50명. 공동 순위여도 최대 50명이다.
- `myEntry`: 본인 최고점과 현재 순위. `items` 포함 여부와 무관하며, 완료 기록이 없으면 null이다.
- `totalPlayers`: 해당 게임에 최고점이 있는 미탈퇴 일반 회원 수. 봇은 제외한다.
- 참가자가 없으면 `{"items":[],"myEntry":null,"totalPlayers":0}`이다. 규칙 1과 2의 기록은 같은 게임의 개인 최고점과 랭킹에 반영한다.
- 닉네임은 현재 회원 정보를 사용한다. 빈 닉네임은 `이름 없는 이웃`이다. 상세 정렬·동점 규칙은 [features.md](features.md)를 따른다.

## 에러

| status | code | 의미 |
| --- | --- | --- |
| 401 | 공통 인증 에러 | 유효한 사용자 인증 없음 |
| 404 | `MINIGAME_NOT_FOUND` | 지원하지 않는 `gameCode` |
| 404 | `MINIGAME_RUN_NOT_FOUND` | 세션 없음, 다른 회원 소유, 세션과 path의 게임 불일치 |
| 410 | `MINIGAME_RUN_EXPIRED` | 미완료 세션의 최초 제출 기한 경과 |
| 400 | `MINIGAME_RULES_VERSION_NOT_SUPPORTED` | 목록·시작에서 지원하지 않는 규칙 버전 요청 |
| 400 | `MINIGAME_INVALID_REPLAY` | 입력 종류·순서·범위·게임 규칙·상태 전이 위반 |
| 400 | `MINIGAME_RUN_NOT_FINISHED` | 러너·계단이 종료 조건에 도달하지 않음 |
| 400 | `MINIGAME_RUN_TOO_EARLY` | 서버가 관측한 경과 시간에 비해 진행 tick이 너무 큼 |
| 409 | `MINIGAME_RUN_ALREADY_FINISHED` | 완료 세션에 다른 유효 입력을 제출함 |

필수 필드·타입·DTO 기본 범위·배열 크기 위반은 공통 요청 검증 오류를 따른다. 봇과 탈퇴 회원은 플레이 및 랭킹 이용 대상으로 인정하지 않으며 사용자 확인 단계에서 공통 404 `AUTH_USER_NOT_FOUND`로 거부한다.
