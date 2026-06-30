# 루틴 / 투두 — API (초안)

상위 공통 규약: [api.md](../../api.md) · 기능: [features.md](features.md) · 데이터: [erd.md](../../erd.md)

> path·필드는 서버 구현 기준으로 확정(photo_verifications만 미구현). 공통 규칙(prefix `/api/v1`, ISO-8601 + offset, 이미지/에셋 `*_key`, 목록은 `items` 배열, 보상은 쓰기 트랜잭션, 인증된 사용자 기준 소유권 guard 적용)은 상위 [api.md](../../api.md)를 따른다. 상세 req/res·에러코드는 서버 repo `docs/work/routine-todo/`에서 관리한다.

## 카테고리 (`categories`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `GET /api/v1/categories` | 내 카테고리 목록 | — | `items[]`: `id`, `name`, `colorHex`, `iconKey`, `sortOrder`, `visibility` |
| `POST /api/v1/categories` | 카테고리 등록 | `name`, `colorHex?`, `iconKey?`, `sortOrder?`, `visibility?`(기본 `PRIVATE`) | 생성된 category |
| `PUT /api/v1/categories/{id}` | 수정 | `name?`, `colorHex?`, `iconKey?`, `sortOrder?`, `visibility?` | 수정된 category |
| `DELETE /api/v1/categories/{id}` | 삭제(soft) | — | 결과. 소속 routines/todos `categoryId` → NULL(미분류) |

## 루틴 (`routines`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `GET /api/v1/routines` | 내 루틴 목록 | filter: `categoryId?`, `status?` | `items[]`: `id`, `title`, `categoryId`, `authType`, `repeatType`, `repeatDays`, `scheduledTime`, `startsOn`, `endsOn`, `status` |
| `POST /api/v1/routines` | 루틴 등록 | `title`, `categoryId?`, `authType`(`CHECK`/`PHOTO`), `repeatType`(`DAILY`/`WEEKLY`), `repeatDays?`, `scheduledTime?`, `startsOn?`, `endsOn?` | 생성된 routine. `status`는 서버가 `ACTIVE`로 주입 |
| `GET /api/v1/routines/{id}` | 단건 조회 | — | routine 상세 |
| `PUT /api/v1/routines/{id}` | 수정 | 위 등록 필드 | 수정된 routine |
| `DELETE /api/v1/routines/{id}` | 삭제(soft) | — | 결과. 기존 `routine_logs`는 숨김 처리 |

## 루틴 완료/취소 (`routine_logs`, `streaks`, → `user_wallets`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `POST /api/v1/routines/{id}/logs` | 당일 완료 체크 | `routineDate`(기본 오늘) | 생성된 log: `id`, `routineDate`, `status`, `completedAt`, `rewardCurrencyType`, `rewardAmount` + 갱신된 streak 요약 |
| `DELETE /api/v1/routines/{id}/logs/{logId}` | 완료 취소(당일 내) | — | 롤백 결과(코인·스트릭 롤백). 트랜잭션 처리 |

> 완료/취소는 코인 지급·차감과 스트릭 갱신을 한 트랜잭션으로 묶는다. 완료 보상은 **COIN 10 고정**. 완료 취소는 log row를 **hard delete**하고 코인·스트릭을 롤백한다(취소 상태로 남기지 않음). "당일"·완료 가능 범위는 모두 **KST(`Asia/Seoul`)** 기준, 완료는 오늘만 허용.

## 사진 인증 (`photo_verifications`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `POST /api/v1/routine-logs/{logId}/photo` | 인증 사진 등록 | `storageKey`(업로드 후 key), `privacyScope?`(`PRIVATE`/`HOUSE`, 기본 `PRIVATE`) | 생성된 verification: `id`, `storageKey`, `privacyScope`, `uploadedAt` |
| `PUT /api/v1/routine-logs/{logId}/photo/{photoId}` | 공개 범위 변경 | `privacyScope` | 수정된 verification |
| `DELETE /api/v1/routine-logs/{logId}/photo/{photoId}` | 사진 삭제(soft) | — | 결과. routine_log 완료 상태는 유지 |

> 이미지는 전체 URL 대신 `storageKey`로 주고받는다. **AI 분석은 범위에서 제외** — 사진 업로드 = 인증 완료로 간주하고 `ai_review_status`는 노출하지 않는다(스키마는 유지). 업로드 경로(presigned 등)·"집 구성원 공개" 노출 대상(집 도메인 의존)은 구현 시 확정.

## 투두 (`todos`, → `user_wallets`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `GET /api/v1/todos` | 내 투두 목록 | filter: `categoryId?`, `status?`, `dueDate?` (미정) | `items[]`: `id`, `title`, `description`, `categoryId`, `dueDate`, `status`, `completedAt` |
| `POST /api/v1/todos` | 투두 등록 | `title`, `description?`, `categoryId?`, `dueDate?` | 생성된 todo |
| `PUT /api/v1/todos/{id}` | 수정 | 위 필드 | 수정된 todo |
| `DELETE /api/v1/todos/{id}` | 삭제(soft) | — | 결과. 완료 기록 함께 정리 |
| `POST /api/v1/todos/{id}/complete` | 완료 체크 | — | `status`, `completedAt`, `rewardCurrencyType`, `rewardAmount` (코인 지급, 트랜잭션) |
| `DELETE /api/v1/todos/{id}/complete` | 완료 취소(당일 내) | — | 롤백 결과(코인 롤백) |

> 완료/취소는 `/complete`(POST/DELETE)로 확정. 완료 보상은 **COIN 5 고정**(루틴 10과 별도), 완료/취소는 코인 지급·차감을 한 트랜잭션으로 묶는다. 완료 취소는 `completed_at`이 오늘(KST)일 때만. 투두는 스트릭에 포함하지 않는다.

## 오늘 현황 (`routines`, `routine_logs`, `todos`, `streaks`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `GET /api/v1/today` | 오늘 루틴·투두·진행률·스트릭 | `date?`(기본 오늘) | 카테고리별 routine/todo 목록(루틴 `scheduledTime` 시간순), `completedCount`, `remainingCount`, `progressRate`, `streak`(`currentCount` 등) |

> `/api/v1/today`는 상위 [api.md](../../api.md)의 오늘 현황 엔드포인트와 동일. 방 도메인의 스트릭 표시와 `streaks` 데이터를 공유한다.

## 확정된 허용값

- `repeatType`: `DAILY`/`WEEKLY` (`repeatDays`는 `WEEKLY`일 때 `{"daysOfWeek":["MON",...]}`)
- `routine.status`: `ACTIVE`/`PAUSED`/`ARCHIVED` (등록 시 `ACTIVE`)
- `authType`: `CHECK`/`PHOTO`
- `todo.status`: `PENDING`/`COMPLETED`
- `visibility`(카테고리)·`privacyScope`(사진): `PRIVATE`/`HOUSE`
- 완료/취소 타임존: KST(`Asia/Seoul`), 코인 보상: 루틴 10 / 투두 5 고정

## 미정

- 에러 응답 형태·응답 envelope·페이지네이션은 [open-questions.md](../../open-questions.md) 참고(임의 확정 금지).
