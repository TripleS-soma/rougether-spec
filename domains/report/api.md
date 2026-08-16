# AI 주간 회고 API

공통 규칙은 전체 [api.md](../../api.md) 참조 (prefix `/api/v1`, 목록은 `items` 배열, ISO-8601 + offset, 인증된 사용자 기준 소유권 guard 적용). 기능 명세는 [features.md](features.md), 데이터는 [erd.md](../../erd.md) `weekly_reports`.

## 회고 조회 (**예정 — 이슈 #287**)

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/reports/weekly` | 내 주간 회고 목록 조회 | 예정 — 본인 회고만, `week_start_date` 내림차순. 응답 필드는 #287에서 확정 | `weekly_reports` |
| `GET /api/v1/reports/weekly/{reportId}` | 주간 회고 상세 조회 | 예정 — 본인 소유(`user_id`) guard. 응답 필드는 #287에서 확정 | `weekly_reports` |

- **서버 미구현** — path만 확정된 상태이며 요청/응답 필드·에러코드는 #287에서 채운다. 클라이언트 구현 대상 아님.
- 응답에 실리는 통계·섹션은 배치가 저장한 `stats_json`·`sections_json`을 그대로 역직렬화한 것이라, 아래 스키마가 곧 조회 계약이다.

## 저장 데이터 스키마 (배치 ↔ 조회 API 공유 계약)

`weekly_reports` 1행 = 사용자·주(일~토, KST)당 1건. `status`는 `GENERATED`(LLM 회고 포함) / `FALLBACK`(LLM 실패 — 통계 + 고정 요약, 섹션 빈 배열, `model` null).

`stats_json` (서버 집계):

```json
{
  "scheduledCount": 12, "completedCount": 9, "failedCount": 3, "completionRate": 0.75,
  "byWeekday": [ { "dayOfWeek": "SUNDAY", "completed": 1, "failed": 0 }, "… 월~토 순으로 7개 고정" ],
  "byRoutine": [ { "lineageId": 41, "title": "아침 스트레칭", "categoryName": "운동", "completed": 4, "failed": 1 } ],
  "streak": { "currentCount": 5, "longestCount": 12 }
}
```

- `scheduledCount` = 그 주 `COMPLETED` + `FAILED` 로그 수(삭제 루틴 제외), `completionRate`는 0~1 소수 둘째 자리.
- `byWeekday`는 일~토 순 7개 고정. `byRoutine`은 루틴 계보(`origin_routine_id`) 단위로 병합하며 `title`·`categoryName`은 그 주 로그에서 본 가장 새 버전 값(`categoryName`은 미분류이거나 카테고리가 삭제됐으면 null).
- `streak`은 생성 시점 `streaks` 스냅샷.

`sections_json` (LLM 생성 섹션):

```json
{ "highlights": ["…"], "failurePatterns": ["…"], "suggestions": ["…"] }
```

- 각 배열 최대 3개, `summary`(별도 컬럼)는 최대 300자 목표(저장 컬럼은 600자). `FALLBACK`이면 세 배열 모두 빈 배열이고 `summary`는 고정 문구 `"이번 주 루틴 {scheduledCount}회 중 {completedCount}회를 완료했어요."`.

## 생성 배치 (`weeklyReportJob`, 내부, 신규 엔드포인트 없음)

매주 **일요일 00:30 KST**에 직전 일~토 주의 회고를 생성한다. 트리거는 매일 매시 30분 + 앱 기동 1회이며 대상 주가 "가장 최근에 끝난 일~토"로 수렴해 주당 1회만 실제 실행된다. 그 주 토요일 day-end 배치(`routineDayEndJob`)가 완료되지 않았거나 LLM API 키가 없는 환경(stub)이면 job을 시작하지 않는다. 대상은 그 주 로그가 있는 미탈퇴 사용자, 사용자 1명 = 트랜잭션 1개, 실패 사용자만 skip(상한 50). 상세는 [features.md](features.md) "생성 배치".

## 연동 (다른 도메인)

- 집계 원천 `routine_logs`·`routines`·`streaks`와 day-end 배치 → 루틴/투두 도메인.
- 프롬프트 입력 `users.nickname`·`bio`·`user_goals` → 회원 도메인. 탈퇴 잔여 데이터 하드 파기 시 `weekly_reports`도 삭제된다.
- 회고 완성 알림 → 알림 도메인(후속, `NotificationType` 추가 협의).
