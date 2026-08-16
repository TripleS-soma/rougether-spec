# AI 주간 회고 API

공통 규칙은 전체 [api.md](../../api.md) 참조 (prefix `/api/v1`, 목록은 `items` 배열, ISO-8601 + offset, 인증된 사용자 기준 소유권 guard 적용). 기능 명세는 [features.md](features.md), 데이터는 [erd.md](../../erd.md) `weekly_reports`.

## 회고 조회

읽기 전용(재화·쓰기 없음). 회고 생성·재생성 API는 없다(배치 전용).

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/reports/weekly` | 내 주간 회고 목록 조회 | resp: `items[]`(`reportId`, `weekStartDate`, `weekEndDate`, `status`, `completionRate`, `completedCount`, `scheduledCount`, `summary`, `generatedAt`). 최신 주 우선(`weekStartDate` 내림차순), 페이지 없이 전체. 회고가 없으면 빈 `items`(200) | `weekly_reports` |
| `GET /api/v1/reports/weekly/{reportId}` | 주간 회고 상세 조회 | resp: 목록 항목과 같은 머리 필드 + `stats`(`scheduledCount`, `completedCount`, `failedCount`, `completionRate`, `byWeekday[7]`, `byRoutine[]`, `streak`) + `highlights[]`, `failurePatterns[]`, `suggestions[]` | `weekly_reports` |

- 인증 필수. **본인 회고만** 조회할 수 있다(소유권 guard: `user_id`). 없는 id·타인 회고 모두 404 `WEEKLY_REPORT_NOT_FOUND`로 통일한다(존재 여부 노출 회피).
- 목록 항목(상세와 공통인 머리 부분): `reportId` — 상세 조회의 path 값 · `weekStartDate`/`weekEndDate` — 회고 대상 주의 일요일/토요일(`YYYY-MM-DD`, KST) · `status` — `GENERATED`(AI 회고 문장 포함) / `FALLBACK`(AI 생성 실패 — 통계와 고정 요약 문구만) · `completionRate`(0~1, 소수 둘째 자리) · `completedCount` · `scheduledCount`(완료+실패) · `summary`(최대 300자, FALLBACK이면 고정 문구) · `generatedAt`(회고 생성 시각, ISO-8601 UTC `Z`).
- 상세의 `stats`는 아래 `stats_json` 스키마와 동일한 형태(`byWeekday`는 일~토 순 7개 고정, `byRoutine`은 그 주 기록이 있는 루틴만·`categoryName`은 null 가능, `streak`은 생성 시점 스냅샷). `highlights`·`failurePatterns`·`suggestions`는 `sections_json`의 세 배열(각 최대 3개, 각 80자 이내)이며 `status = FALLBACK`이면 모두 빈 배열이다. `byRoutine[].lineageId`는 루틴 목록(`GET /api/v1/routines`)의 `originRoutineId`(없으면 `id`)와 대응한다.
- 응답에 실리는 통계·섹션은 배치가 저장한 `stats_json`·`sections_json`을 그대로 역직렬화한 것이라(서버 재계산 없음), 아래 스키마가 곧 조회 계약이다.
- 목록은 매주 일요일 00:30 KST 배치가 만든 회고만 담긴다 — 그 주 루틴 완료/실패 기록이 없는 주는 회고 자체가 없으므로 목록에서 빠진다.

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
