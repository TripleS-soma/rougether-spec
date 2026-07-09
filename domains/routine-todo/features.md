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
  - `repeat_type`: `DAILY`(매일) / `WEEKLY`(매주 특정 요일).
  - `repeat_days`(JSON 객체): `DAILY` → `null`, `WEEKLY` → `{ "daysOfWeek": ["MON","WED","FRI"] }`. 요일은 `MON`~`SUN`.
  - `scheduled_time`(수행 시간)·`starts_on`/`ends_on`(지속 기간)은 별도 컬럼.
- **수행 시간 / 기간**: `scheduled_time`(TIME), `starts_on`·`ends_on`(DATE)으로 시간순 정렬 및 노출 기간을 정한다.
- **시간버전(temporal versioning)** (`origin_routine_id`): 루틴은 버전 계보로 관리한다. `origin_routine_id`는 계보 루트 row의 id로, 생성 시 자기 id, 버전 분기 시 부모의 값을 승계한다. 버전 유효기간은 `created_at`~`deleted_at`으로 판정하며, 과거 캘린더는 그날 유효했던 버전으로 재구성된다(자세한 규칙은 [api.md](./api.md) 캘린더 참고).
- **수정**: 위 필드 변경. 반복 스케줄 필드(`repeat_type`·`repeat_days`·`starts_on`·`ends_on`)를 바꾸고 **이미 경과한 날이 있는(`created_at`이 오늘 이전) 버전**이면, 옛 버전을 닫고(`deleted_at`) 새 버전 row로 **분기**한다(응답 `id`가 바뀜, `origin_routine_id` 승계). 그 외(제목·카테고리·시각·인증 변경, 또는 오늘 생성분의 스케줄 변경)는 **제자리 수정**이라 과거 표시에도 반영된다. 분기된 뒤에는 그 이전 날짜가 옛 버전 값으로 동결된다.
- **삭제**: soft delete(`deleted_at`). 기존 수행 기록(`routine_logs`)은 통계 보존 정책에 따라 **숨김 처리**(보존 범위 미정 — open-questions). 삭제해도 그 버전은 자기 유효기간 안의 과거 조회에는 남아 보인다.

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

- **완료 체크**: 당일 `routine_logs` 생성 — `routine_date`, `status`(완료), `completed_at` 기록. 보상은 **COIN 10**(`reward_currency_type`/`reward_amount` 기록, 일일 보상 상한 적용 — 아래 섹션), 지갑(`user_wallets`) 반영을 같은 트랜잭션으로 묶는다. 스트릭(`streaks`)의 `current_count`·`longest_count`·`last_success_date`를 갱신한다. 완료는 오늘(KST)만 허용, 같은 날 중복 완료는 거부.
- **완료 취소**: **당일(KST) 내**만 가능. `routine_logs` row를 **hard delete**하고(취소 상태로 남기지 않음) 지급 코인과 스트릭을 **롤백**한다.

## 투두 완료 처리 (`todos`, → `user_wallets`)

- **완료 체크**: `todos.status`(완료)·`completed_at` 기록 + 코인 지급(**COIN 5**, 일일 보상 상한 적용 — 아래 섹션, 지갑 반영). 투두는 스트릭에 포함하지 않는다(스트릭은 루틴 기준).
- **완료 취소**: 완료가 **오늘(KST)** 인 경우만 가능. `status`(PENDING)/`completed_at`을 되돌리고 지급 코인을 롤백한다.

## 일일 보상 상한 (루틴+투두 합산, → `user_wallets`)

- **상한**: 루틴 완료와 투두 완료를 합쳐 하루(KST) **4건**까지만 코인을 지급한다. 단위는 건수(코인 총량 아님) — 완료 순서 선착순 지급이라 하루 최대 코인은 조합에 따라 20~40.
- **초과 완료**: 5번째 이후도 완료 자체는 정상 성공하되 `reward_amount=0`으로 기록하고 지갑은 불변. 완료를 거부하지 않는다.
- **카운트 기준**: 오늘 실제 지급된(`reward_amount > 0`) 완료 건수 합산 — 루틴은 `routine_date`, 투두는 `completed_at`의 KST 날짜 기준.
- **취소와 상한**: 취소하면 지급 슬롯이 복구된다(카운트가 실지급 건수 기준이라 자동). 0 지급 완료의 취소는 지갑 불변.
- **삭제와 상한**: 지급된 완료 투두를 삭제해도 코인은 회수하지 않으므로 상한 집계에 그대로 포함한다 — 삭제로 지급 슬롯이 복구되지 않는다.
- **스트릭**: 상한과 무관 — 코인 미지급 완료도 스트릭에는 정상 반영된다.

## 사진 인증 (`photo_verifications`)

- **등록**: 사진 인증형 루틴 완료 시 카메라/앨범에서 업로드 → 해당 `routine_logs`에 연결된 `photo_verifications` 레코드 생성. 저장 키는 `storage_key`(전체 URL 아님), 업로드 시각 `uploaded_at`. **AI 분석은 현재 범위에서 제외** — 사진 업로드 자체를 인증 완료로 간주하고 `ai_review_status`는 노출하지 않는다(컬럼은 유지, AI 재도입 시 의미만 복원).
- **공개 범위** (`privacy_scope`): **나만 보기(`PRIVATE`)** / **집 구성원 공개(`HOUSE`)**, 기본 `PRIVATE`. "집 구성원 공개"의 노출 대상은 집 도메인(`house_members`)에 의존.
- **공개 범위 변경**: `privacy_scope` 갱신.
- **삭제**: soft delete(`deleted_at`). **사진만 제거**하고 루틴 완료 상태(`routine_logs`)는 **유지**한다.

## 도메인 경계 메모

- 코인 보상의 실제 잔액 변경은 `user_wallets`(회원/재화 도메인) 소관 — 이 도메인은 보상 사실 기록 + 트랜잭션 묶음만 책임.
- 코인·스트릭을 입력으로 한 방/집 성장 반영은 방·집 도메인 소관.
- 루틴 패턴/실패 분석, 인증 사진 비전 판단은 AI(순차 고도화) 영역 — 이 도메인은 원천 데이터와 동의 상태만 보관.
