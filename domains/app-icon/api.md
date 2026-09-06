# 고양이 앱 아이콘 API

공통 규칙은 [전체 API](../../api.md)를 따른다. JWT 인증이 필요하며 항상 본인 상태를 반환한다.

| method · path | 목적 | 응답 |
| --- | --- | --- |
| `GET /api/v1/me/app-icon` | 현재 상태 조회. foreground 시각은 갱신하지 않음 | 200 `AppIconResponse` |
| `POST /api/v1/me/app-activity` | 실제 foreground 활동을 서버 시각으로 기록하고 미접속 알림 회차 초기화 | 200 `AppIconResponse` |

POST 요청 본문은 없다. `userId`, `lastForegroundAt` 등의 입력을 받아 상태를 변경하지 않는다. 두 응답 모두 `Cache-Control: no-store`이다.

```json
{
  "state": "MISSING_YOU",
  "message": "요즘 좀 뜸하다냥…",
  "evaluatedAt": "2026-09-06T03:00:00Z",
  "lastForegroundAt": "2026-09-04T03:00:00Z",
  "nextEvaluationAt": "2026-09-08T03:00:00Z",
  "currentStreak": 0,
  "completedToday": false
}
```

| 필드 | 의미 |
| --- | --- |
| `state` | [상태 명세](features.md)의 6가지 enum 중 하나. 앱의 로컬 아이콘 리소스 식별에 사용 |
| `message` | 상태별 고양이 말투. 문구 비교로 상태를 판정하지 않음 |
| `evaluatedAt` | 서버 판정 시각, UTC ISO 8601 |
| `lastForegroundAt` | 마지막 실제 foreground 기록 시각. 기록 없으면 null |
| `nextEvaluationAt` | 현재 상태에서 시간이 지나면 재조회할 후보 시각. 성공·왕관은 다음 KST 자정, 기본·기다림·눈물은 다음 미접속 경계. 울음 또는 활동 기록 없는 기본 상태는 null |
| `currentStreak` | 오늘 기준 유효 루틴 스트릭 |
| `completedToday` | 오늘 루틴 완료 또는 실제 오늘 완료한 투두 존재 여부 |

`nextEvaluationAt`은 OS 아이콘 교체 예약이나 상태 유지 보장이 아니다. 사용자 행동으로 그전에 상태가 바뀔 수 있으므로 foreground 진입·완료·취소 후 재조회한다.

- 인증 없음·만료/잘못된 토큰: 기존 인증 계약의 401.
- 사용자 없음·탈퇴 사용자·봇: 404 `USER_NOT_FOUND`.
- FCM 발송을 요청하는 클라이언트 API는 없다. 배치가 [미접속 정책](features.md)에 따라 발송한다. 알림 목록·설정은 [기존 알림 API](../notification/api.md)를 사용하며 `type = APP_INACTIVITY_REMINDER`, `refId`는 내부적으로 수신 사용자 ID이다.

## 푸시 데이터

미접속 FCM 알림은 제목·본문 외에 문자열 `data` 필드 `type=APP_INACTIVITY_REMINDER`, `screen=myRoom`, `notificationId`를 포함한다. 모바일은 `type`을 확인해 알림 탭 시 내 방으로 이동한다.
