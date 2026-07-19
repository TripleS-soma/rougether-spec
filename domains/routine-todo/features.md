# 루틴 / 투두 — 기능 명세

상위: [features.md](../../features.md) · 데이터: [erd.md](../../erd.md) · API: [api.md](api.md)

표기: 기능 > 하위기능 > 설명. 각 기능에 관련 table을 명시한다. ERD에 없는 필드는 만들지 않으며, 확정 안 된 값은 "미정"으로 둔다.

## 카테고리 관리 (`categories`)

- **등록**: 이름(`name`)·색상(`color_hex`)·아이콘(`icon_key`)·정렬 순서(`sort_order`)·**공개 범위(`visibility`)**로 카테고리를 만든다. **공개 범위는 카테고리 단위로 적용**(루틴별 아님). 소유자는 `user_id`.
- **수정**: 이름·색상·아이콘·정렬 순서를 변경한다.
- **삭제**: soft delete(`deleted_at`). 해당 카테고리를 참조하는 **살아있는 루틴이 있으면 삭제를 차단**한다(루틴 상태와 무관 — 루틴은 `ACTIVE`만 존재, 투두는 상태와 무관하게 차단하지 않음). 삭제해도 루틴·투두의 `category_id`는 **NULL로 밀지 않고 유지**한다. 루틴 조회 응답은 카테고리를 `category_id`로만 담고 요약을 embed하지 않으며, 이름·색상은 카테고리 목록 조회에서 resolve한다. 삭제된 카테고리는 기본 목록(picker)에는 노출되지 않고, `includeDeleted=true`로 조회하면 `deleted` 플래그와 함께 반환돼 과거 루틴·투두의 카테고리 이름을 조회할 수 있다.

## 루틴 관리 (`routines`)

- **등록**: 이름(`title`)·카테고리(`category_id`, 선택)·인증 방식(`auth_type`)·반복 조건·수행 시간(`scheduled_time`)·지속 기간(`starts_on`/`ends_on`)을 입력한다. **공개 범위는 카테고리를 따른다**(루틴 개별 설정 없음, `routines`에 `visibility` 없음). 소유자는 `user_id`. 상태(`status`)는 `ACTIVE`만 유효(등록 시 `ACTIVE`. 필드·필터는 유지).
- **인증 방식 선택** (`auth_type`): **체크형(`CHECK`)** / **사진 인증형(`PHOTO`)** 중 선택. (사진 인증형의 AI 분석은 현재 범위에서 제외 — 사진 인증 항목 참고)
- **반복 조건** (`repeat_type`, `repeat_days` JSON):
  - `repeat_type`: `DAILY`(매일) / `WEEKLY`(매주 특정 요일) / `BIWEEKLY`(격주 특정 요일) / `MONTHLY`(매월 특정 일) / `YEARLY`(매년 특정 월일).
  - `repeat_days`(JSON 객체): `DAILY` → `null`, `WEEKLY`/`BIWEEKLY` → `{ "daysOfWeek": ["MON","WED","FRI"] }`(요일은 `MON`~`SUN`), `MONTHLY` → `{ "dayOfMonth": 15 }`, `YEARLY` → `{ "month": 7, "day": 12 }`.
  - `BIWEEKLY`는 `starts_on`이 속한 주(월요일 시작)를 1주차로 삼아 2주 간격으로 `daysOfWeek`에 반복한다 — 기준일이 필요하므로 `starts_on`이 필수다.
  - `MONTHLY`/`YEARLY`는 지정한 날짜가 해당 월/해에 없으면(예: `dayOfMonth=31`인 2월, `month=2,day=29`인 평년) 그 기간엔 대상에서 자연히 제외된다(별도 보정 없음).
  - `scheduled_time`(수행 시간)·`starts_on`/`ends_on`(지속 기간)은 별도 컬럼.
- **수행 시간 / 기간**: `scheduled_time`(TIME), `starts_on`·`ends_on`(DATE)으로 시간순 정렬 및 노출 기간을 정한다. `scheduled_time`은 **5분 단위만 허용**한다(서버 검증 — 위반 시 400) — 리마인드 배치가 5분 주기 + 분 정확 일치 매칭이라 그 외 시각은 리마인드가 발송되지 않는다(notification 도메인 참고). `starts_on`은 **미지정 시 생성일(오늘, KST)로 기본 지정**하며, **오늘 이전 과거로는 설정할 수 없다**(루틴은 생성일부터 존재하는 스냅숏 구조). `starts_on`은 `ends_on`보다 늦을 수 없다.
- **시간버전(temporal versioning)** (`origin_routine_id`): 루틴은 버전 계보로 관리한다. `origin_routine_id`는 계보 루트 row의 id로, 생성 시 자기 id, 버전 분기 시 부모의 값을 승계한다. 버전 유효기간은 `created_at`~`deleted_at`으로 판정하며, day-end 배치의 수행 대상 판정과 완료 취소의 복원 판정이 이 기준을 쓴다. 과거 캘린더는 버전을 재구성하지 않고 그날 로그가 가리키는 버전 row의 표시값으로 노출한다(자세한 규칙은 [api.md](./api.md) 캘린더 참고).
- **수정**: 위 필드 변경. 반복 스케줄 필드(`repeat_type`·`repeat_days`·`starts_on`·`ends_on`)를 바꾸고 **이미 경과한 날이 있는(`created_at`이 오늘 이전) 버전**이면, 옛 버전을 닫고(`deleted_at`) 새 버전 row로 **분기**한다(응답 `id`가 바뀜, `origin_routine_id` 승계). 그 외(제목·카테고리·시각·인증 변경, 또는 오늘 생성분의 스케줄 변경)는 **제자리 수정**이라 과거 표시에도 반영된다. 분기된 뒤에는 그 이전 날짜가 옛 버전 값으로 동결된다.
- **삭제**: soft delete(`deleted_at`). 기존 수행 기록(`routine_logs`)은 통계 보존 정책에 따라 **숨김 처리**(보존 범위 미정 — open-questions). 삭제해도 수행 로그(`COMPLETED`/`FAILED`)가 있는 과거 날짜에는 그 로그가 가리키는 버전의 표시값으로 남아 보인다(로그 없는 날짜에는 노출되지 않음).

## 투두 관리 (`todos`)

- **등록**: 이름(`title`)·설명(`description`)·카테고리(`category_id`, 선택)·마감일(`due_date`)을 입력한다. 소유자는 `user_id`. 상태는 `status`.
- **수정**: 위 필드 변경.
- **삭제**: soft delete(`deleted_at`). 투두 삭제 시 **완료 기록도 함께 제거**(투두는 별도 log table 없이 자체 `status`/`completed_at`으로 완료를 표현하므로 레코드 단위로 정리).

## 오늘 현황 (`routines`, `routine_logs`, `todos`, `streaks`)

- **목록**: 오늘 수행 대상 루틴(반복 조건으로 산출)과 마감 도래 투두를 **카테고리별**로 묶어 보여준다.
- **진행 요약**: 완료 수·남은 수·전체 진행률. 루틴 완료 여부는 당일 `routine_logs`(`routine_date` = 오늘)로 판정, 투두는 `status`/`completed_at`으로 판정.
- **정렬**: 루틴은 `scheduled_time` 기준 시간순.
- **스트릭 노출**: 현재 연속 성공일(`streaks.current_count`)을 함께 표시(스트릭 상세는 방 도메인의 표시 기능과 공유).

## 루틴 완료 처리 (`routine_logs`, `streaks`, → `user_wallets`)

- **완료 체크**: `routine_logs` 생성 — `routine_date`, `status`(완료), `completed_at` 기록(해당 날짜에 `FAILED` 로그가 있으면 생성 대신 `COMPLETED` 전이 — 아래 하루 마감 실패 기록 참고). **과거 날짜 완료를 허용**하고 미래 날짜는 거부한다(KST 기준). 보상은 **당일(`routine_date` = 오늘) 완료만 COIN 10**(일일 보상 상한 적용 — 아래 섹션), 과거 날짜 완료는 0 지급 — `reward_amount`에는 **실제 지급액**을 기록한다(취소 시 정확 환불 근거). 지갑(`user_wallets`) 반영을 같은 트랜잭션으로 묶는다. 스트릭(`streaks`)의 `current_count`·`longest_count`·`last_success_date` 갱신도 **당일 완료에만** 반응한다(과거 완료는 스트릭 미반영). 같은 날짜 중복 완료는 거부.
- **완료 취소**: 오늘 이전 날짜(**과거 포함, 미래 제외**, KST 기준)의 완료를 취소할 수 있다. 기록된 `reward_amount`만큼 코인을 회수하고(과거 완료는 0 환불), row 처리는 갈린다 — **과거 날짜이고 그날 수행 대상이었던 완료는 `FAILED`로 복원**(status 전이 + `completed_at` null + 보상 필드 초기화, 과거 캘린더에 미수행으로 남음), 당일 취소·수행 대상이 아니었던 과거 완료(유효기간 밖)는 기존대로 **hard delete**. 수행 대상 판정은 day-end 배치와 같은 기준(그날 유효했던 버전 + 반복 규칙, 계보 단위). 스트릭 **롤백은 당일 완료 취소에만** 적용한다.

## 하루 마감 실패 기록 (day-end 배치, `routine_logs`)

- **실패 판정**: 매일 00:00(KST) 배치가 전날 수행 대상이었는데 완료 로그가 없는 루틴에 `FAILED` 로그를 생성한다(`completed_at` null, 보상 없음). 수행 대상 판정은 그날 마감 시점(다음날 00:00 KST)에 유효했던 버전 기준 — 반복 규칙(DAILY/WEEKLY 요일)·starts_on/ends_on·soft delete 여부를 반영하고, 완료 로그 존재는 루틴 계보(`origin_routine_id`) 단위로 본다(완료 후 버전 분기해도 실패 아님).
- **멱등성**: 날짜당 job instance 1개(`targetDate` 파라미터) + unique(`routine_id`, `routine_date`) 충돌 skip으로 재실행·중복 실행에도 중복 로그가 생기지 않는다.
- **늦은 완료·취소**: `FAILED` 로그가 있는 날짜의 완료는 새 row 생성 대신 그 로그를 `COMPLETED`로 전이한다(과거 완료 규칙 그대로 보상 0·스트릭 미반영). 전이된 완료의 취소는 그 로그를 다시 `FAILED`로 **복원**한다(위 완료 취소 규칙과 동일 — 과거 캘린더의 그날 기록이 유지됨). 배치는 지나간 날짜의 로그를 재생성하지 않는다.
- **catch-up**: 서버 중단 등으로 빠진 날짜는 자동으로 따라잡는다 — Spring Batch 실행 메타데이터에서 마지막 성공 `targetDate`를 찾아 그 다음 날부터 어제(KST)까지 오래된 순으로 순차 실행한다(신규 테이블 없음, 소급 한도 없음). 실행 기록이 전혀 없으면(최초 도입) 어제만 처리하고 소급하지 않는다. 트리거는 매일 00:00 KST + 앱 기동 시 1회. 특정 날짜 실행이 실패하면 거기서 중단하고 다음 트리거에서 그 날짜부터 재시도한다.
- **모니터링**: 외부 알림 채널 없이 구조화 로그만 — 날짜 실행 실패 시 ERROR(targetDate·사유), 2일 이상 밀림을 따라잡을 때 WARN(gap 일수). 다중 인스턴스 중복 실행 방지는 리마인드 스케줄러와 공통 후속 과제.

## 투두 완료 처리 (`todos`, → `user_wallets`)

- **완료 체크**: `todos.status`(완료)·`completed_at` 기록. 마감일(`due_date`)이 **미래(KST 기준)인 투두는 완료 불가**, 마감일이 지난 투두는 완료 가능. 코인은 **`due_date` = 오늘인 완료만 COIN 5**(일일 보상 상한 적용 — 아래 섹션, 지갑 반영), 마감일이 지났거나 없는(`due_date` null) 완료는 0 지급 — `reward_amount`에 실제 지급액을 기록한다. 투두는 스트릭에 포함하지 않는다(스트릭은 루틴 기준).
- **완료 취소**: 완료가 **오늘(KST)** 인 경우만 가능. `status`(PENDING)/`completed_at`을 되돌리고 지급 코인을 롤백한다.

## 일일 보상 상한 (루틴+투두 합산, → `user_wallets`)

- **상한**: 루틴 완료와 투두 완료를 합쳐 하루(KST) **4건**까지만 코인을 지급한다. 단위는 건수(코인 총량 아님) — 완료 순서 선착순 지급이라 하루 최대 코인은 조합에 따라 20~40.
- **초과 완료**: 5번째 이후도 완료 자체는 정상 성공하되 `reward_amount=0`으로 기록하고 지갑은 불변. 완료를 거부하지 않는다.
- **카운트 기준**: 오늘 실제 지급된(`reward_amount > 0`) 완료 건수 합산 — 루틴은 `routine_date`, 투두는 `completed_at`의 KST 날짜 기준.
- **취소와 상한**: 취소하면 지급 슬롯이 복구된다(카운트가 실지급 건수 기준이라 자동). 0 지급 완료의 취소는 지갑 불변.
- **삭제와 상한**: 지급된 완료 투두를 삭제해도 코인은 회수하지 않으므로 상한 집계에 그대로 포함한다 — 삭제로 지급 슬롯이 복구되지 않는다.
- **스트릭**: 상한과 무관 — 상한 초과로 코인 미지급된 **당일** 완료도 스트릭에는 정상 반영된다(과거 날짜 완료는 상한과 별개로 스트릭 미반영 — 루틴 완료 처리 참고).

## 사진 인증 (`photo_verifications`)

- **등록**: 사진 인증형 루틴 완료 시 카메라/앨범에서 업로드 → 해당 `routine_logs`에 연결된 `photo_verifications` 레코드 생성. 저장 키는 `storage_key`(전체 URL 아님), 업로드 시각 `uploaded_at`. **AI 분석은 현재 범위에서 제외** — 사진 업로드 자체를 인증 완료로 간주하고 `ai_review_status`는 노출하지 않는다(컬럼은 유지, AI 재도입 시 의미만 복원).
- **공개 범위** (`privacy_scope`): 카테고리 `visibility`와 같은 값 집합 — **비공개(`PRIVATE`)** / **친한친구(`FRIENDS`)** / **집(`HOUSE`)** / **공개(`PUBLIC`)**, 기본 `PRIVATE`. 사진 인증은 미구현이며 공개 범위는 카테고리 스코프를 따르는 방향으로 검토 중. `HOUSE`의 노출 대상은 집 도메인(`house_members`)에 의존.
- **공개 범위 변경**: `privacy_scope` 갱신.
- **삭제**: soft delete(`deleted_at`). **사진만 제거**하고 루틴 완료 상태(`routine_logs`)는 **유지**한다.

## 도메인 경계 메모

- 코인 보상의 실제 잔액 변경은 `user_wallets`(회원/재화 도메인) 소관 — 이 도메인은 보상 사실 기록 + 트랜잭션 묶음만 책임.
- 코인·스트릭을 입력으로 한 방/집 성장 반영은 방·집 도메인 소관.
- 루틴 패턴/실패 분석, 인증 사진 비전 판단은 AI(순차 고도화) 영역 — 이 도메인은 원천 데이터와 동의 상태만 보관.
