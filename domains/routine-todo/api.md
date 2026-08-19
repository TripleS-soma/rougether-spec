# 루틴 / 투두 — API (초안)

상위 공통 규약: [api.md](../../api.md) · 기능: [features.md](features.md) · 데이터: [erd.md](../../erd.md)

> path·필드는 서버 구현 기준으로 확정(photo_verifications만 미구현). 시각 입력(루틴 `scheduledTime`, 투두 `dueTime`)은 **5분 단위**(분이 5의 배수, 초·나노초는 0)만 허용하며 위반 시 400 `VALIDATION_FAILED` — `07:05:30`처럼 초가 붙어도 거부된다. 공통 규칙(prefix `/api/v1`, ISO-8601 + offset, 이미지/에셋 `*_key`, 목록은 `items` 배열, 보상은 쓰기 트랜잭션, 인증된 사용자 기준 소유권 guard 적용)은 상위 [api.md](../../api.md)를 따른다. 상세 req/res·에러코드는 서버 repo `docs/work/routine-todo/`에서 관리한다.

## 카테고리 (`categories`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `GET /api/v1/categories` | 내 카테고리 목록 | filter: `includeDeleted?`(기본 `false`) | `items[]`: `id`, `name`, `colorHex`, `iconKey`, `sortOrder`, `visibility`, `deleted`, `houseId`(연동 집 id — 미연동 null) |
| `POST /api/v1/categories` | 카테고리 등록 | `name`, `colorHex?`, `iconKey?`, `sortOrder?`, `visibility?`(기본 `PRIVATE`), `houseId?`(집 연동 — 해당 집 ACTIVE 구성원만) | 생성된 category |
| `PUT /api/v1/categories/{id}` | 수정 | `name?`, `colorHex?`, `iconKey?`, `sortOrder?`, `visibility?`, `houseId?`(**null=기존 연동 유지** — 해제 아님) | 수정된 category |
| `DELETE /api/v1/categories/{id}/house-link` | 집 연동 해제(멱등) | — | 204. 카테고리·소속 루틴/투두는 유지 |
| `DELETE /api/v1/categories/{id}` | 삭제(soft) | query: `mode`(필수) — `UNASSIGN`/`PURGE` | 204. 살아있는 루틴이 있으면 `CATEGORY_IN_USE`(409)로 차단 |

> 삭제 차단은 **루틴만** 검사하며 루틴 상태와 무관하다(루틴은 `ACTIVE`만 존재) — 살아있는 루틴이 하나라도 참조하면 **두 모드 모두** 차단하고, 투두는 상태(`PENDING` 포함)와 무관하게 삭제를 막지 않는다. 카테고리 자체는 어느 모드든 soft delete다. `mode`는 필수이며 미지정·허용값 외에는 400 `VALIDATION_FAILED`.
>
> - `UNASSIGN`(미분류 전환): 이 카테고리를 참조하던 옛 버전 루틴과 **살아있는** 투두의 `categoryId`를 NULL로 민다. 이미 삭제된 투두는 과거 기록이라 참조를 유지한다.
> - `PURGE`(완전 삭제): 이 카테고리 루틴의 수행 기록(`routine_logs`)과 사진 인증(`photo_verifications`)을 hard delete하고, 살아있는 투두를 soft delete한다. 루틴 row 자체(이미 삭제 상태)와 스트릭은 건드리지 않고, 루틴·삭제된 투두의 `categoryId`도 그대로 둔다. 단 두 종류의 기록은 남긴다 — 계보(`origin_routine_id`)에 살아있는 버전이 있는 루틴의 기록은 지금도 쓰는 루틴의 기록이라 지우지 않고, 삭제 당일에 완료돼 보상이 지급된 기록은 일일 보상 상한의 집계 기준이라 남긴다(지우면 지급 슬롯이 부당 복구돼 재지급된다). 남은 기록은 이후에도 삭제되지 않고 캘린더에서 계속 조회된다.
>
> 전 과정은 단일 쓰기 트랜잭션이다. 기본 목록에는 삭제분이 노출되지 않으며, `includeDeleted=true`이면 삭제분까지 반환하고 각 항목의 `deleted` 플래그로 구분한다 — 이름·색상은 여기서 resolve하고 삭제된 카테고리 이름도 이 경로로 조회한다.
> 집 연동(`houseId`) 검증 에러코드: 집이 없거나 삭제됐으면 404 `HOUSE_NOT_FOUND`, 그 집의 ACTIVE 구성원이 아니면 403 `HOUSE_NOT_MEMBER`.

## 루틴 (`routines`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `GET /api/v1/routines` | 내 루틴 목록 | filter: `categoryId?`, `status?` | `items[]`: `id`, `title`, `categoryId`(미분류면 null), `authType`, `repeatType`, `repeatDays`, `scheduledTime`, `startsOn`, `endsOn`, `status`, `originRoutineId`(버전 계보 루트 id — 스케줄 수정으로 `id`가 바뀌어도 불변, 프론트 목록 key로 사용), `houseMissionId`(연동 단체미션 id — 미연동 null) |
| `POST /api/v1/routines` | 루틴 등록 | `title`, `categoryId?`, `authType`(`CHECK`/`PHOTO`), `repeatType`(`DAILY`/`WEEKLY`/`BIWEEKLY`/`MONTHLY`/`YEARLY`), `repeatDays?`, `scheduledTime?`(5분 단위), `startsOn?`, `endsOn?`, `houseMissionId?`(단체미션 연동 — 그 미션이 있는 집의 ACTIVE 구성원만), `externalSource?`·`externalId?`(기기 캘린더 반복 일정 임포트 — 아래 참고) | 생성된 routine. `status`는 서버가 `ACTIVE`로 주입 |
| `GET /api/v1/routines/{id}` | 단건 조회 | — | routine 상세(목록과 동일 필드). 카테고리는 `categoryId`만 담고, 이름·색상은 `GET /api/v1/categories`에서 resolve |
| `PUT /api/v1/routines/{id}` | 수정 | 위 등록 필드. null 처리 규칙: `categoryId`·`scheduledTime`·`endsOn`은 **null이면 해제**, `title`·`authType`·`repeatType`·`repeatDays`·`startsOn`은 null이면 기존 값 유지, `houseMissionId?`는 **null=기존 연동 유지**(해제 아님) | 수정된 routine. 반복 스케줄을 바꾸고 이미 경과한 날이 있는 루틴이면 새 버전으로 분기해 응답의 `id`가 바뀐다(아래 시간버전 참고, 연동은 새 버전으로 승계) |
| `DELETE /api/v1/routines/{id}/house-mission-link` | 단체미션 연동 해제(멱등) | — | 204. 루틴은 유지, 과거 자동 기여는 미회수 |
| `DELETE /api/v1/routines/{id}` | 삭제(soft) | — | 204. 루틴 row에 `deleted_at`만 세팅 — 기존 `routine_logs`는 건드리지 않으며 과거 캘린더에 계속 노출된다(로그 보존 정책은 [features.md](features.md) 참고) |
| `POST /api/v1/routines/similarity` | 날짜·제목별 유사 루틴·투두 힌트(캘린더 임포트 미리보기) | → 아래 "유사 루틴·투두 비교" 절 | 〃 |

> 단체미션 연동(`houseMissionId`) 검증 에러코드: 미션이 없거나 삭제됐으면 404 `HOUSE_MISSION_NOT_FOUND`, 그 미션이 있는 집의 ACTIVE 구성원이 아니면 403 `HOUSE_NOT_MEMBER`.
>
> 루틴 `startsOn`/`endsOn` 검증(KST 기준):
> - `startsOn` 미지정이면 생성일(오늘)로 기본 지정한다. 등록 시 `startsOn`을 오늘 이전 과거로 보내면 거부한다(`ROUTINE_STARTS_ON_BEFORE_TODAY`, 400). 수정 시에는 `startsOn`을 실제로 바꿀 때만 검사해 과거로 옮기는 경우만 거부하고, 기존값을 그대로 재전송하는 것은 통과한다(멱등).
> - `startsOn`은 `endsOn`보다 늦을 수 없다(`ROUTINE_STARTS_ON_AFTER_ENDS_ON`, 400). 등록은 기본 지정된 `startsOn` 기준으로, 수정은 적용될 `startsOn`과 새 `endsOn` 조합으로 검사한다.

## 루틴 완료/취소 (`routine_logs`, `streaks`, → `user_wallets`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `POST /api/v1/routines/{id}/logs` | 완료 체크(과거 허용·미래 불가) | `routineDate`(기본 오늘) | 생성된 log: `id`, `routineDate`, `status`, `completedAt`, `rewardCurrencyType`, `rewardAmount` + streak 요약 + `houseMissionContribution?`(연동 단체미션 자동 기여 결과 — 미연동·기여 건너뜀이면 null. 규칙은 [house api.md](../house/api.md) contribute 참고) |
| `DELETE /api/v1/routines/{id}/logs` | 완료 취소(과거 허용·미래 불가) | `date`(취소할 완료 날짜, query) | 롤백 결과(반영된 streak 요약). 트랜잭션 처리 |

> 완료/취소는 코인 지급·차감과 스트릭 갱신을 한 트랜잭션으로 묶는다. 날짜 판정은 모두 **KST(`Asia/Seoul`)** 기준이며 과거 날짜의 완료·취소를 허용하고 미래 날짜는 거부한다. 완료 보상은 **당일(`routineDate` = 오늘) 완료만 COIN 10** — 과거 날짜 완료는 `rewardAmount=0`이고, 당일이라도 루틴+투두 합산 일일 상한 **50코인**의 잔여가 정가보다 적으면 잔여만큼만 지급한다(`rewardAmount = min(10, 50 − 오늘 누적 지급액)`). 잔여가 0이면 완료는 정상 성공하되 `rewardAmount=0`(지갑 불변). 클라이언트는 `rewardAmount > 0`으로 지급 여부를, 값 자체로 실제 지급액을 판별한다. 스트릭 갱신·롤백도 당일 완료/취소에만 반응한다(과거 완료·취소는 기존 스트릭 요약을 그대로 반환). 완료 취소는 기록된 `rewardAmount`만큼 코인을 회수하고, log row 처리는 날짜·수행 대상 여부에 따라 갈린다 — **과거 날짜(`date < 오늘 KST`)이고 그날 수행 대상이었던 완료는 `FAILED`로 복원**한다(status 전이 + `completedAt` null + 보상 필드 초기화, row 유지). 당일 취소와 그날 수행 대상이 아니었던 과거 완료(유효기간 밖 완료)는 기존대로 **hard delete** 한다(복원할 `FAILED` 상태가 성립하지 않음). 수행 대상 판정은 day-end 배치와 같은 기준이다(그날 유효했던 버전 + 반복 규칙, 계보 단위).
> 응답 `status` 허용값은 `PENDING`/`COMPLETED`/`FAILED`(하루 마감 배치가 전날 미수행 루틴에 기록). 과거 날짜 완료 시 그 날짜에 `FAILED` 로그가 있으면 새 row를 만들지 않고 그 row를 `COMPLETED`로 **전이(UPDATE)** 한다 — 응답 `id`는 기존 row의 id이고, 보상 0·스트릭 미반영은 과거 완료 규칙 그대로. 전이된 완료의 취소는 위 취소 규칙에 따라 다시 `FAILED`로 복원된다. 배치는 지나간 날짜의 로그를 재생성하지 않는다.
> 과거 날짜의 완료·취소는 과거 캘린더가 내려주는 **닫힌(soft-deleted) 버전 id로도 호출할 수 있다**(소유권 검증은 동일 — 내 계보의 닫힌 버전만). 당일 완료·취소는 살아있는 현재 버전 id만 허용한다(삭제된 루틴의 당일 완료로 보상을 받는 경로 차단).

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
| `GET /api/v1/todos` | 내 투두 목록 | filter: `categoryId?`, `status?`, `dueDate?`(정확 일치) | `items[]`: `id`, `title`, `description`, `categoryId`, `dueDate`, `dueTime`, `status`, `completedAt`, `externalSource`·`externalId`(기기 캘린더 임포트 참조 — 일반 투두는 둘 다 null). 정렬 `dueDate asc, id asc` |
| `GET /api/v1/todos/{id}` | 단건 조회 | — | todo 상세(목록과 동일 필드) |
| `POST /api/v1/todos` | 투두 등록 | `title`, `description?`, `categoryId?`, `dueDate?`, `dueTime?`(마감 시각, 5분 단위), `externalSource?`·`externalId?`(기기 캘린더 임포트 — 아래 참고) | 생성된 todo |
| `PUT /api/v1/todos/{id}` | 수정 | 위 필드 — null이면 기존 값 유지, 단 **`categoryId`·`dueTime`은 null이면 해제**. `externalSource`·`externalId`는 받지 않는다(생성 후 불변) | 수정된 todo |
| `DELETE /api/v1/todos/{id}` | 삭제(soft) | — | 204. `deleted_at`만 세팅 — 완료 상태·보상 기록(`reward_amount`)은 그대로 보존된다(일일 상한 집계에 계속 포함, features.md 참고) |
| `POST /api/v1/todos/{id}/complete` | 완료 체크(미래 `dueDate` 불가) | — | 201. `status`, `completedAt`, `rewardCurrencyType`, `rewardAmount` (코인 지급, 트랜잭션) |
| `DELETE /api/v1/todos/{id}/complete` | 완료 취소(완료 시점 제한 없음) | — | 200. 롤백 반영된 todo 전체(코인 롤백) |

> **기기 캘린더 일정 임포트** (모바일 #844): 앱이 기기 캘린더(구글 캘린더 등)의 **오늘 이후** 일정을 읽어 투두로 만든다. 서버는 OAuth를 하지 않는다 — 읽기는 전적으로 앱이 OS 권한으로 하고, 서버는 만들어진 투두를 받을 뿐이다.
> - `POST /todos`에 `externalSource`(`GOOGLE_CALENDAR` 등)·`externalId`(그 캘린더의 이벤트 id)를 함께 받아 `todos`에 저장한다. **`unique (user_id, external_source, external_id)`가 중복 임포트의 유일한 방어선**이다 — 동기화는 앱을 열 때마다 돌므로 이 값이 없으면 같은 일정이 계속 복제된다.
> - 요청 형식: `externalSource`는 대문자 영숫자·언더스코어 1~30자(`^[A-Z][A-Z0-9_]{0,29}$`)이며 서버는 값을 해석하지 않는다(enum 없음 — 새 출처를 붙일 때 서버 변경 불필요). `externalId`는 1~255자, 공백만은 불가, 앞뒤 공백은 trim해서 저장·비교한다. 형식 위반은 validation 400(`VALIDATION_FAILED`). 둘은 **반드시 함께** 보낸다 — 한쪽만 오면 400 `TODO_EXTERNAL_REF_INCOMPLETE`, 둘 다 없으면 일반 투두.
> - 같은 쌍이 이미 있으면 **409 `TODO_EXTERNAL_DUPLICATE`**로 거절한다(앱이 이미 가져온 것으로 판정해 건너뛴다). 사용자 단위 "연동함" 플래그로는 이걸 대신할 수 없다 — 어느 이벤트를 가져왔는지는 항목마다 알아야 한다. 동시 요청이 unique를 깨는 경우도 같은 409다.
> - **soft delete 된 임포트 투두도 중복 판정에 포함**한다(unique가 `deleted_at`을 보지 않음) — 사용자가 지운 일정은 다음 동기화에서 되살아나지 않는다. 다른 회원의 같은 `externalId`는 서로 무관하다.
> - 응답(`GET` 목록·단건, `POST`, `PUT` 공통)에 `externalSource`·`externalId`를 그대로 노출한다 — 일반 투두는 둘 다 null. `PUT /todos/{id}`는 이 두 필드를 받지 않는다(생성 후 불변).
> - 임포트된 투두는 그 뒤로 **일반 투두와 완전히 동일**하다. 사용자가 카테고리를 옮기고 제목을 고치고 지울 수 있으며, 원본 일정이 바뀌거나 지워져도 서버는 이 투두를 건드리지 않는다(사용자가 이미 손댔을 수 있다).
> - 보상 규칙도 그대로다 — `dueDate`가 오늘인 완료만 코인 10, 일일 상한 50코인 합산. 미래 마감은 완료 불가라 미리 체크할 수 없다.
> - 가져오기 전 미리보기에서 "비슷한 루틴·투두가 이미 있어요" 힌트를 보여주려면 `POST /api/v1/routines/similarity`(아래 유사 루틴·투두 비교 절)를 쓴다. 이 힌트는 안내용이며 중복 방지의 정본은 위 `externalId` unique다.

> **반복 일정은 루틴으로** (모바일 #844): 같은 임포트에서 **반복 일정은 루틴**, 일회성은 투두로 들어간다.
> - `POST /routines`도 `externalSource`·`externalId`를 받아 `routines`에 저장하고, **`unique (user_id, external_source, external_id)`로 중복을 막는다.** 같은 쌍이 이미 있으면 투두와 같이 **409**. 이게 없으면 앱을 열 때마다 같은 반복 일정이 새 루틴으로 복제된다.
> - 루틴은 **시리즈 하나당 한 행**이므로 `externalId`는 **시리즈 id**다(회차 id가 아니다). 회차 단위로 들어가는 투두는 `시리즈 id + 날짜`를 쓴다 — 둘의 id 체계가 다르므로 서버는 값의 형식을 강제하지 않는다.
> - **반복 규칙 판정은 앱이 한다.** 서버는 완성된 `repeatType`·`repeatDays`를 받을 뿐이다. 앱은 캘린더의 반복 규칙을 번역하지 않고 조회 창의 **실제 발생 날짜에서 역산**한다(`daysOfTheWeek`가 iOS 전용이라 규칙 번역은 플랫폼이 갈린다). 확신이 서지 않는 패턴(예: 매월 셋째 화요일, 불규칙, 연 1회)은 루틴으로 만들지 않고 발생분을 투두로 넣는다.
> - 임포트된 루틴도 그 뒤로 **일반 루틴과 완전히 동일**하다. 완료 시 코인·스트릭·주간 회고·집 미션 기여에 그대로 반영된다 — 회의 같은 의무가 습관 통계에 섞이는 건 인지된 트레이드오프다(모바일 #844 논의). 원본 일정이 바뀌거나 지워져도 서버는 이 루틴을 건드리지 않는다.

> 완료/취소는 `/complete`(POST/DELETE)로 확정. `dueDate`가 미래(KST)인 투두는 완료 불가. 완료 보상은 **`dueDate` = 오늘인 완료만 COIN 10**(루틴과 동일 금액) — 마감일이 지났거나 없는(`dueDate` null) 완료는 `rewardAmount=0`이고, 당일이라도 루틴+투두 합산 일일 상한 **50코인**의 잔여가 정가보다 적으면 잔여만큼만 지급한다(`rewardAmount = min(10, 50 − 오늘 누적 지급액)`, 잔여 0이면 `rewardAmount=0` — 완료는 정상 성공, 지갑 불변). 완료/취소는 코인 지급·차감을 한 트랜잭션으로 묶는다. 완료 취소는 완료 시점 제한 없이 허용(과거에 완료한 투두 포함), 환불은 완료 시 기록된 `rewardAmount`. 투두는 스트릭에 포함하지 않는다.

## 유사 루틴·투두 비교 (`routines`, `todos` — 기기 캘린더 임포트 힌트)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `POST /api/v1/routines/similarity` | 날짜·제목 목록마다 그 날짜의 내 루틴·투두 중 제목이 유사한 것을 찾는다(캘린더 임포트 미리보기 힌트, 저장 없음) | `items[]`(1~200개): `date`(필수, `YYYY-MM-DD`), `title`(trim 후 1~160자) | `embeddingApplied`, `items[]`(요청 순서 유지): `date`, `title`(trim 적용), `hasSimilar`, `similar[]`(score 내림차순 최대 3개, 없으면 빈 배열): `kind`(`ROUTINE`/`TODO`), `id`, `title`, `score`(0~1), `matchType`(`EXACT`/`EMBEDDING`) |

> 기기 캘린더 임포트(모바일 #844) 미리보기에서 "비슷한 게 이미 있어요"를 보여주기 위한 **읽기 전용 힌트 API**다. 아무것도 저장하지 않으며, 중복 임포트를 막는 정본은 투두 `externalId` unique(위 임포트 블록)이고 이 결과는 안내에만 쓴다. 인증된 사용자 본인의 루틴·투두만 후보로 본다.
> - **후보(날짜별, live 소싱)**: 그 날짜에 반복 대상인 `ACTIVE`·미삭제 루틴 + 그 날짜가 마감(`dueDate`)인 미삭제 투두(`status` 무관 — 완료 투두도 포함). 과거 날짜도 같은 규칙으로 **현재 활성 항목 기준**이며 `routine_logs`로 그날을 재구성하지 않는다(캘린더 조회의 과거 3갈래 소싱과 다르다 — 임포트 힌트라 "지금 있는 것"이 기준). 마감일 없는 투두는 후보가 아니다.
> - **판정**: 1차 `EXACT` — 요청 제목과 후보 제목의 정규화 결과가 같으면 `score` 1.0. 정규화는 NFKC(전각→반각) → 소문자 → 공백 전부 제거이며 구두점·이모지는 남긴다("물 마시기" = "물마시기", "PT!" ≠ "PT"). 2차 `EMBEDDING` — EXACT가 아닌 쌍만 임베딩(text-embedding-3-large, 1024차원) 코사인 유사도로 보고 **임계값 이상만** 채택한다. 임계값은 서버 설정 `routine.similarity.threshold`(env `ROUTINE_SIMILARITY_THRESHOLD`, 기본 **0.50** — 한글 제목 쌍 30개 실측값: 무관 쌍 최고 0.44, 유사 쌍은 0.57 이상에 몰림. 약어·동의어 "헬스/PT"·"러닝/조깅"류는 어떤 임계값으로도 못 잡는다 → [open-questions.md](../../open-questions.md)). 후보가 없거나 전부 EXACT면 임베딩을 호출하지 않는다.
> - **정렬·개수**: `similar`는 `score` 내림차순, 동점이면 `ROUTINE` → `TODO`, 그다음 `id` 오름차순으로 최대 3개. `hasSimilar`는 `similar`가 비어 있지 않은지와 같다.
> - **fail-open**: 임베딩을 쓸 수 없는 환경(LLM 키 미설정 stub·외부 API 장애)에서는 HTTP 200으로 **EXACT 결과만** 돌려주고 `embeddingApplied=false`로 알린다 — 임포트 흐름을 막지 않는다(힌트가 덜 잡힐 수 있음). `embeddingApplied`는 "임베딩을 쓸 수 있었는지"(stub 아님 + 호출 실패 없음)의 의미라, 후보가 없거나 전부 EXACT여서 호출이 필요 없던 경우도 `true`다.
> - **검증**: `items` 누락·0개·201개 이상, `date` 누락·형식 오류, `title` 공백만·trim 후 161자 이상은 모두 400 `VALIDATION_FAILED`(공통). 도메인 에러코드는 없다. `date`는 과거·미래 제한이 없다. 요율 제한은 두지 않는다.

## 오늘 현황 · 캘린더 (`routines`, `routine_logs`, `todos`, `streaks`)

| method · path | 목적 | 요청 핵심 | 응답 핵심 |
| --- | --- | --- | --- |
| `GET /api/v1/today` | 오늘 루틴·투두·진행률·스트릭 | — (파라미터 없음, 항상 KST 오늘 고정. 임의 날짜는 `/calendar` 사용) | `date`(조회 기준일 에코), 카테고리별 routine/todo 목록, `summary`(`completedCount`·`remainingCount`·`progressRate`), `streak`(`currentCount` 등) |
| `GET /api/v1/calendar` | 캘린더에서 특정 날짜의 루틴·투두·진행률 | `date`(필수) | `date`, 카테고리별 routine/todo 목록, `summary`(`completedCount`·`remainingCount`·`progressRate`) |
| `GET /api/v1/calendar/month` | 달력 월 뷰의 날짜별 루틴·투두 개수 표시 | `yearMonth`(필수, `YYYY-MM`) | `yearMonth`(에코), `days[]`: `date`, `routineCount`, `todoCount` — 그 달 1일~말일 전부 |

> today·calendar의 카테고리 그룹은 `categoryId`만 담고 카테고리 이름·색상은 embed하지 않는다(루틴·투두 응답과 동일 규칙 — `GET /api/v1/categories`에서 resolve). 미분류 그룹은 `categoryId=null`. 진행률 필드는 최상위가 아니라 `summary` 객체 안에 중첩된다.
> 정렬: 카테고리 그룹은 `categoryId` 오름차순(미분류 null 그룹은 맨 뒤), 그룹 안에서 루틴은 `scheduledTime` 오름차순(null 뒤) → `id`, 투두는 `dueTime` 오름차순(null 뒤) → `id`.
> `/api/v1/today`는 상위 [api.md](../../api.md)의 오늘 현황 엔드포인트와 동일. 방 도메인의 스트릭 표시와 `streaks` 데이터를 공유한다.
> today·calendar 모두 **투두는 마감일(`dueDate`)이 기준일과 정확히 같은 것만** 포함한다(지난 마감·미래 마감을 누적하지 않으며, 마감일 없는 투두는 제외). 두 엔드포인트의 투두 소싱 규칙은 동일하다.
> `/api/v1/calendar/month`는 **월 뷰의 날짜별 표시 전용**이다 (모바일 #838). 날짜를 눌러보기 전에 각 날에 뭐가 얼마나 있는지 알려주는 게 목적이라 목록·완료 여부가 아니라 개수만 준다. 내용은 눌러서 `/calendar`로 본다.
> - 응답은 그 달 **1일~말일 모든 날짜**를 순서대로 담고, 대상이 없는 날도 `routineCount`·`todoCount`를 0으로 포함한다(클라이언트가 날짜별로 채울 필요 없음).
> - `routineCount`는 그날 대상 루틴 개수, `todoCount`는 그날 마감 투두 개수이며 둘 다 **완료·미완료 합산**이다(완료 개수는 내려주지 않음).
> - **날짜별 소싱 규칙은 `/calendar`와 동일하다.** 루틴은 아래 3갈래 규칙(오늘·미래는 현재 ACTIVE 버전의 반복 대상, 어제는 그날 유효했던 버전으로 재계산, 그제 이전은 그날 `routine_logs`(`COMPLETED`+`FAILED`) 건수 — 로그 없는 날은 0), 투두는 `dueDate`가 그날인 것만(마감일 없는 투두 제외). 따라서 어떤 날짜의 개수는 그 날짜를 `/calendar`로 조회했을 때의 루틴·투두 건수와 항상 같다.
> - `yearMonth` 누락·형식 오류(`2026-8`, `2026-08-01` 등)는 400. 월 경계는 KST 기준이며 과거·미래 월 모두 조회할 수 있다.

> `/api/v1/calendar`는 달력에서 날짜를 클릭해 그날의 현황을 보는 용도다. `/today`와 달리 응답에 `streak`을 포함하지 않고, 과거·미래 날짜 모두 조회할 수 있다.
> 루틴 소싱은 조회 날짜가 오늘(KST) 기준 어디에 있는지에 따라 세 갈래로 갈린다.
> - **오늘·미래(`date >= 오늘 KST`)**: 그 날짜의 반복 대상 루틴을 현재 ACTIVE 버전으로 live 재계산해 노출하고, 완료 여부는 그 날짜 `routine_logs`(`routine_date`)로 판정한다.
> - **어제(`date = 오늘 − 1일`, KST)**: day-end 배치의 `FAILED` 기록 완료를 전제할 수 없는 구간이다(자정~배치 완료 사이에 로그 단독 조회를 하면 미완료 루틴이 비는 공백이 생긴다). **그날 유효했던 버전**(아래 시간버전 유효기간 경계) 기준으로 반복 대상 여부를 **재계산**해 노출하고, 그날 `COMPLETED` 로그를 병합해 완료 여부를 판정한다(`FAILED` 로그는 재계산 결과와 중복이라 소싱하지 않음). 대상 판정 기준이 day-end 배치와 동일하므로, 배치가 정상 완료된 뒤에는 아래 로그 단독 조회와 결과가 일치한다 — 사용자 관점에서 경계 전환은 비가시적이다. 재계산분과 로그의 합집합은 버전 row id가 아니라 **계보 키**(`coalesce(origin_routine_id, id)`) 기준으로 묶는다 — 완료 로그가 있는 계보는 로그가 가리키는 버전 row를 표시값으로 쓰고, 완료 로그가 없는 계보만 재계산 결과로 채운다. 어제 완료한 뒤 같은 날 중에 버전이 분기돼도(로그는 옛 버전, 재계산은 새 버전) 한 루틴이 완료본·미완료본 2건으로 갈라지지 않으며 진행률·총계도 왜곡되지 않는다.
> - **그제 이전(`date <= 오늘 − 2일`, KST)**: 그날 `routine_logs`(`COMPLETED`+`FAILED`)를 **단독 조회**해 소싱한다(버전 재계산 없음). 완료 여부는 로그 `status`로 판정하고, 로그가 없는 루틴은 그날 수행 대상이었더라도 노출하지 않는다 — 미수행 판정·기록은 day-end 배치의 책임이다. 로그가 없는 날은 빈 응답이며, day-end 배치 도입 이전 날짜도 로그가 없어 빈 응답이다(소급 backfill 없음). **알려진 한계** — 배치가 2일 이상 밀리면 그 구간은 재계산 보완 대상이 아니라 여전히 빈 응답이 될 수 있다. 배치 실행 메타데이터로 커버 범위를 판단하는 방식은 조회 API와 배치가 결합되므로 채택하지 않았고, 이 장애는 배치 실패 알림·로그로 대응한다. 유효기간 밖에서 완료한 루틴도 완료 로그가 있으므로 노출된다. 투두는 동일하게 마감일이 그날인 것만 포함한다. 과거 진행률·총계는 노출 로그의 루틴 + 그날 투두 기준으로 계산한다.
>
> **루틴 시간버전(temporal versioning)**: 반복 스케줄(`repeatType`·`repeatDays`·`startsOn`·`endsOn`)을 바꾸고 이미 경과한 날이 있는 버전이면, 옛 버전을 그대로 닫고(`deleted_at`) 새 버전 row를 만든다(응답 `id`가 바뀐다). 버전 유효기간은 `created_at`~`deleted_at`(KST)로 판정한다 — "그날 유효한 버전" = `created_at(KST) ≤ date` 이고 (`deleted_at` 없음 또는 `deleted_at(KST) > date`). 분기 경계에서 옛/새 버전의 유효기간은 겹치거나 비지 않는다. 같은 버전 계보는 `originRoutineId`(계보 루트 id)로 잇고, 목록 정렬은 `scheduledTime asc → originRoutineId asc`라 버전이 바뀌어도 위치가 유지된다. `startsOn`/`endsOn`은 사용자 스케줄 값으로 그대로 노출·복사하며 버전 경계로 쓰지 않는다.
>
> 과거 노출 루틴의 `title`·`categoryId`·`scheduledTime`은 스냅숏이 아니라 **로그가 가리키는 버전 row**에서 읽는다(루틴은 soft delete라 버전 row가 남는다). 어제(D-1) 재계산으로 로그 없이 노출되는 루틴은 그날 유효했던 버전 row에서 읽는다(배치가 기록할 로그가 가리키게 될 버전과 동일). 스케줄을 바꾸지 않는 수정(제목·카테고리·시각·인증 변경, 또는 오늘 생성분)은 제자리 수정이라 과거 조회에도 최신값이 반영되지만, 스케줄 변경으로 버전이 분기된 뒤에는 그 이전 날짜가 옛 버전 값으로 동결된다. 로그가 이후 삭제(soft-delete)된 루틴·카테고리를 가리킬 수 있다. 응답은 `categoryId`만 담고, 삭제된 카테고리 라벨은 프론트가 `includeDeleted`로 resolve한다.
> 과거 응답의 루틴 `id`는 그날의 버전 id다(로그가 가리키는 버전, D-1 재계산분은 그날 유효했던 버전) — 버전 분기 전 날짜에는 닫힌 옛 버전 id가 내려간다. 이 id로 그 날짜의 완료·취소를 그대로 호출할 수 있다(루틴 완료/취소의 닫힌 버전 id 허용 규칙 참고).

## 확정된 허용값

- `repeatType`: `DAILY`/`WEEKLY`/`BIWEEKLY`/`MONTHLY`/`YEARLY`. `repeatDays`는 `WEEKLY`/`BIWEEKLY`일 때 `{"daysOfWeek":["MON",...]}`, `MONTHLY`일 때 `{"dayOfMonth":15}`, `YEARLY`일 때 `{"month":7,"day":12}`. `BIWEEKLY`는 `startsOn`이 속한 주(월요일 시작)를 1주차로 삼아 2주 간격으로 반복하므로 `startsOn`이 필수다. `MONTHLY`/`YEARLY`는 지정한 날짜가 해당 월/해에 없으면(31일 지정인 2월, 2/29 지정인 평년) 그 기간엔 자연히 제외된다.
- 반복 유형별 `repeatDays` 필수 검증(전부 400): `BIWEEKLY`는 `startsOn` 누락 시 `BIWEEKLY_REQUIRES_STARTS_ON`, `daysOfWeek` 누락·빈 배열·`MON~SUN` 외 토큰이면 `BIWEEKLY_REQUIRES_WEEKDAYS`. `MONTHLY`는 `dayOfMonth`(1~31) 누락·범위 밖이면 `MONTHLY_REQUIRES_DAY_OF_MONTH`. `YEARLY`는 `month`/`day`가 실존 조합이 아니면 `YEARLY_REQUIRES_MONTH_AND_DAY`(2/29는 허용). **주의 — `WEEKLY`는 `daysOfWeek` 검증이 없다**: 누락해도 등록은 통과하지만 어떤 날짜에도 매칭되지 않는 루틴이 된다(서버 검증 비대칭, 프론트에서 필수 처리 권장).
- `routine.status`: `ACTIVE` (등록 시 `ACTIVE`. `status` 필드·필터 파라미터는 유지하되 현재 유효값은 `ACTIVE`만)
- `authType`: `CHECK`/`PHOTO`
- `todo.status`: `PENDING`/`COMPLETED`
- 유사 비교(`POST /routines/similarity`) `similar[].kind`: `ROUTINE`/`TODO`, `similar[].matchType`: `EXACT`(정규화 제목 일치, `score` 1.0)/`EMBEDDING`(임베딩 코사인 ≥ 임계값)
- `visibility`(카테고리)·`privacyScope`(사진): `PRIVATE`(비공개)/`FRIENDS`(친한친구)/`HOUSE`(집)/`PUBLIC`(공개)
- 완료/취소 타임존: KST(`Asia/Seoul`), 코인 보상: 루틴 10 / 투두 10 정가. 일일 지급 상한은 루틴+투두 합산 50코인이며, 잔여가 정가보다 적으면 잔여만큼만 지급(`rewardAmount`에 실지급액 기록, 취소 환불도 그 금액)
- 완료 허용 범위: 과거 허용·미래 거부(루틴 `routineDate`, 투두 `dueDate` 기준). 코인·스트릭은 당일 완료에만 반영(과거 완료는 `rewardAmount=0`)

## 미정

- 에러 응답 형태·응답 envelope·페이지네이션은 [open-questions.md](../../open-questions.md) 참고(임의 확정 금지).
