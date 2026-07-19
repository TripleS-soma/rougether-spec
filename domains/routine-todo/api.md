# 루틴 / 투두 — API (초안)

상위 공통 규약: [api.md](../../api.md) · 기능: [features.md](features.md) · 데이터: [erd.md](../../erd.md)

> path·필드는 서버 구현 기준으로 확정(photo_verifications만 미구현). 공통 규칙(prefix `/api/v1`, ISO-8601 + offset, 이미지/에셋 `*_key`, 목록은 `items` 배열, 보상은 쓰기 트랜잭션, 인증된 사용자 기준 소유권 guard 적용)은 상위 [api.md](../../api.md)를 따른다. 상세 req/res·에러코드는 서버 repo `docs/work/routine-todo/`에서 관리한다.

## 카테고리 (`categories`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `GET /api/v1/categories` | 내 카테고리 목록 | filter: `includeDeleted?`(기본 `false`) | `items[]`: `id`, `name`, `colorHex`, `iconKey`, `sortOrder`, `visibility`, `deleted` |
| `POST /api/v1/categories` | 카테고리 등록 | `name`, `colorHex?`, `iconKey?`, `sortOrder?`, `visibility?`(기본 `PRIVATE`) | 생성된 category |
| `PUT /api/v1/categories/{id}` | 수정 | `name?`, `colorHex?`, `iconKey?`, `sortOrder?`, `visibility?` | 수정된 category |
| `DELETE /api/v1/categories/{id}` | 삭제(soft) | — | 결과. 살아있는 루틴이 있으면 `CATEGORY_IN_USE`(409)로 차단. 소속 routines/todos `categoryId`는 유지 |

> 삭제 차단은 **루틴만** 검사하며 루틴 상태와 무관하다(루틴은 `ACTIVE`만 존재) — 살아있는 루틴이 하나라도 참조하면 차단하고, 투두는 상태(`PENDING` 포함)와 무관하게 삭제를 막지 않는다. 삭제 후에도 루틴·투두의 `categoryId`는 NULL로 밀지 않고 유지한다. 기본 목록에는 삭제분이 노출되지 않으며, `includeDeleted=true`이면 삭제분까지 반환하고 각 항목의 `deleted` 플래그로 구분한다 — 이름·색상은 여기서 resolve하고 삭제된 카테고리 이름도 이 경로로 조회한다.

## 루틴 (`routines`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `GET /api/v1/routines` | 내 루틴 목록 | filter: `categoryId?`, `status?` | `items[]`: `id`, `title`, `categoryId`(미분류면 null), `authType`, `repeatType`, `repeatDays`, `scheduledTime`, `startsOn`, `endsOn`, `status`, `originRoutineId`(버전 계보 루트 id — 스케줄 수정으로 `id`가 바뀌어도 불변, 프론트 목록 key로 사용) |
| `POST /api/v1/routines` | 루틴 등록 | `title`, `categoryId?`, `authType`(`CHECK`/`PHOTO`), `repeatType`(`DAILY`/`WEEKLY`), `repeatDays?`, `scheduledTime?`, `startsOn?`, `endsOn?` | 생성된 routine. `status`는 서버가 `ACTIVE`로 주입 |
| `GET /api/v1/routines/{id}` | 단건 조회 | — | routine 상세(목록과 동일 필드). 카테고리는 `categoryId`만 담고, 이름·색상은 `GET /api/v1/categories`에서 resolve |
| `PUT /api/v1/routines/{id}` | 수정 | 위 등록 필드 | 수정된 routine. 반복 스케줄을 바꾸고 이미 경과한 날이 있는 루틴이면 새 버전으로 분기해 응답의 `id`가 바뀐다(아래 시간버전 참고) |
| `DELETE /api/v1/routines/{id}` | 삭제(soft) | — | 결과. 기존 `routine_logs`는 숨김 처리 |

## 루틴 완료/취소 (`routine_logs`, `streaks`, → `user_wallets`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `POST /api/v1/routines/{id}/logs` | 완료 체크(과거 허용·미래 불가) | `routineDate`(기본 오늘) | 생성된 log: `id`, `routineDate`, `status`, `completedAt`, `rewardCurrencyType`, `rewardAmount` + streak 요약 |
| `DELETE /api/v1/routines/{id}/logs` | 완료 취소(과거 허용·미래 불가) | `date`(취소할 완료 날짜, query) | 롤백 결과(반영된 streak 요약). 트랜잭션 처리 |

> 완료/취소는 코인 지급·차감과 스트릭 갱신을 한 트랜잭션으로 묶는다. 날짜 판정은 모두 **KST(`Asia/Seoul`)** 기준이며 과거 날짜의 완료·취소를 허용하고 미래 날짜는 거부한다. 완료 보상은 **당일(`routineDate` = 오늘) 완료만 COIN 10** — 과거 날짜 완료는 `rewardAmount=0`이고, 당일이라도 루틴+투두 합산 일일 상한 4건 초과 시 완료는 정상 성공하되 `rewardAmount=0`(지갑 불변, 클라이언트는 `rewardAmount > 0`으로 지급 여부 판별). 스트릭 갱신·롤백도 당일 완료/취소에만 반응한다(과거 완료·취소는 기존 스트릭 요약을 그대로 반환). 완료 취소는 log row를 **hard delete**하고 기록된 `rewardAmount`만큼 코인을 회수한다(취소 상태로 남기지 않음).
> 응답 `status` 허용값은 `PENDING`/`COMPLETED`/`FAILED`(하루 마감 배치가 전날 미수행 루틴에 기록). 과거 날짜 완료 시 그 날짜에 `FAILED` 로그가 있으면 새 row를 만들지 않고 그 row를 `COMPLETED`로 **전이(UPDATE)** 한다 — 응답 `id`는 기존 row의 id이고, 보상 0·스트릭 미반영은 과거 완료 규칙 그대로. 전이된 완료의 취소도 동일하게 hard delete되며 배치는 지나간 날짜의 로그를 재생성하지 않는다.

## 사진 인증 (`photo_verifications`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `POST /api/v1/routine-logs/{logId}/photo` | 인증 사진 등록 | `storageKey`(업로드 후 key), `privacyScope?`(카테고리 `visibility`와 같은 값 집합, 기본 `PRIVATE`) | 생성된 verification: `id`, `storageKey`, `privacyScope`, `uploadedAt` |
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
| `POST /api/v1/todos/{id}/complete` | 완료 체크(미래 `dueDate` 불가) | — | `status`, `completedAt`, `rewardCurrencyType`, `rewardAmount` (코인 지급, 트랜잭션) |
| `DELETE /api/v1/todos/{id}/complete` | 완료 취소(당일 내) | — | 롤백 결과(코인 롤백) |

> 완료/취소는 `/complete`(POST/DELETE)로 확정. `dueDate`가 미래(KST)인 투두는 완료 불가. 완료 보상은 **`dueDate` = 오늘인 완료만 COIN 5**(루틴 10과 별도) — 마감일이 지났거나 없는(`dueDate` null) 완료는 `rewardAmount=0`이고, 당일이라도 루틴+투두 합산 일일 상한 4건 초과 시 `rewardAmount=0`(완료는 정상 성공, 지갑 불변). 완료/취소는 코인 지급·차감을 한 트랜잭션으로 묶는다. 완료 취소는 `completed_at`이 오늘(KST)일 때만, 환불은 기록된 `rewardAmount`. 투두는 스트릭에 포함하지 않는다.

## 오늘 현황 · 캘린더 (`routines`, `routine_logs`, `todos`, `streaks`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `GET /api/v1/today` | 오늘 루틴·투두·진행률·스트릭 | `date?`(기본 오늘) | 카테고리별 routine/todo 목록(루틴 `scheduledTime` 시간순), `completedCount`, `remainingCount`, `progressRate`, `streak`(`currentCount` 등) |
| `GET /api/v1/calendar` | 캘린더에서 특정 날짜의 루틴·투두·진행률 | `date`(필수) | 카테고리별 routine/todo 목록, `completedCount`, `remainingCount`, `progressRate` |

> today·calendar의 카테고리 그룹은 `categoryId`만 담고 카테고리 이름·색상은 embed하지 않는다(루틴·투두 응답과 동일 규칙 — `GET /api/v1/categories`에서 resolve). 미분류 그룹은 `categoryId=null`.
> `/api/v1/today`는 상위 [api.md](../../api.md)의 오늘 현황 엔드포인트와 동일. 방 도메인의 스트릭 표시와 `streaks` 데이터를 공유한다.
> today·calendar 모두 **투두는 마감일(`dueDate`)이 기준일과 정확히 같은 것만** 포함한다(지난 마감·미래 마감을 누적하지 않으며, 마감일 없는 투두는 제외). 두 엔드포인트의 투두 소싱 규칙은 동일하다.
> `/api/v1/calendar`는 달력에서 날짜를 클릭해 그날의 현황을 보는 용도다. `/today`와 달리 응답에 `streak`을 포함하지 않고, 과거·미래 날짜 모두 조회할 수 있다.
> 루틴 소싱은 조회 날짜가 오늘(KST) 기준 과거인지에 따라 갈린다.
> - **오늘·미래(`date >= 오늘 KST`)**: 그 날짜의 반복 대상 루틴을 live 재계산해 노출하고, 완료 여부는 그 날짜 `routine_logs`(`routine_date`)로 판정한다.
> - **과거(`date < 오늘 KST`)**: 그날 **유효했던 루틴 버전을 재구성**해 소싱한다. 그날 반복 대상인 유효 버전이면 완료 로그가 없어도(=미완료) 노출하고, 완료 여부는 그날 완료(`COMPLETED`) `routine_logs`로 판정한다. 여기에 그날 완료 로그가 가리키는 루틴을 합쳐(`id`로 dedup) 노출한다(유효기간 밖에서 완료한 루틴도 포함). 투두는 동일하게 마감일이 그날인 것만 포함한다. 과거 진행률·총계는 노출 루틴 + 그날 투두 기준으로 계산한다.
>
> **루틴 시간버전(temporal versioning)**: 반복 스케줄(`repeatType`·`repeatDays`·`startsOn`·`endsOn`)을 바꾸고 이미 경과한 날이 있는 버전이면, 옛 버전을 그대로 닫고(`deleted_at`) 새 버전 row를 만든다(응답 `id`가 바뀐다). 버전 유효기간은 `created_at`~`deleted_at`(KST)로 판정한다 — "그날 유효한 버전" = `created_at(KST) ≤ date` 이고 (`deleted_at` 없음 또는 `deleted_at(KST) > date`). 분기 경계에서 옛/새 버전의 유효기간은 겹치거나 비지 않는다. 같은 버전 계보는 `originRoutineId`(계보 루트 id)로 잇고, 목록·정렬은 `originRoutineId` 기준이라 버전이 바뀌어도 위치가 유지된다. `startsOn`/`endsOn`은 사용자 스케줄 값으로 그대로 노출·복사하며 버전 경계로 쓰지 않는다.
>
> 과거 노출 루틴의 `title`·`categoryId`·`scheduledTime`은 스냅숏이 아니라 그날 유효한 **버전 row**에서 읽는다. 스케줄을 바꾸지 않는 수정(제목·카테고리·시각·인증 변경, 또는 오늘 생성분)은 제자리 수정이라 과거 조회에도 최신값이 반영되지만, 스케줄 변경으로 버전이 분기된 뒤에는 그 이전 날짜가 옛 버전 값으로 동결된다. 완료 로그가 이후 삭제(soft-delete)된 루틴·카테고리를 가리킬 수 있다. 응답은 `categoryId`만 담고, 삭제된 카테고리 라벨은 프론트가 `includeDeleted`로 resolve한다.

## 확정된 허용값

- `repeatType`: `DAILY`/`WEEKLY` (`repeatDays`는 `WEEKLY`일 때 `{"daysOfWeek":["MON",...]}`)
- `routine.status`: `ACTIVE` (등록 시 `ACTIVE`. `status` 필드·필터 파라미터는 유지하되 현재 유효값은 `ACTIVE`만)
- `authType`: `CHECK`/`PHOTO`
- `todo.status`: `PENDING`/`COMPLETED`
- `visibility`(카테고리)·`privacyScope`(사진): `PRIVATE`(비공개)/`FRIENDS`(친한친구)/`HOUSE`(집)/`PUBLIC`(공개)
- 완료/취소 타임존: KST(`Asia/Seoul`), 코인 보상: 루틴 10 / 투두 5 고정
- 완료 허용 범위: 과거 허용·미래 거부(루틴 `routineDate`, 투두 `dueDate` 기준). 코인·스트릭은 당일 완료에만 반영(과거 완료는 `rewardAmount=0`)

## 미정

- 에러 응답 형태·응답 envelope·페이지네이션은 [open-questions.md](../../open-questions.md) 참고(임의 확정 금지).
