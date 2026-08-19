# 열린 질문

아직 합의 안 된 것들. 정해지면 [features.md](features.md) / [api.md](api.md) / [erd.md](erd.md)에 반영하고 여기서 지운다.

## 착수 전 확정 (P0 — 백/프 시작하면 바로 부딪힘)

- **인증/인가 상세**: (결정됨) 카카오(access token 방식) · 구글·애플(id token/identityToken JWK 검증 방식) 소셜 로그인 · JWT access + refresh 회전 정책 · `oauth_accounts` 스키마 확정 · `users.email`(nullable) 추가. (결정됨) 회원탈퇴 `DELETE /api/v1/me` — soft delete + `oauth_accounts` 삭제 + provider revoke(카카오 admin unlink · 애플 refresh token revoke, 커밋 후 best-effort), 재가입 즉시 허용(재로그인 = 신규 가입). App Store 심사 5.1.1(v)의 앱 내 계정 삭제·revoke 요구 확인됨 → [member/api.md](domains/member/api.md) "회원탈퇴" 반영.
- **탈퇴 후 개인정보 파기 정책**: (결정됨) 유예기간 없이 탈퇴 트랜잭션에서 즉시 익명화 — `users.email`·`nickname`·`bio`·`profile_image_key` null 처리 + 프로필 S3 원본 삭제(커밋 후 best-effort) + 루틴·투두·카테고리 연쇄 soft delete(완료 이력·스트릭·인증 사진은 보존). 잔여 access token 창에서는 내 정보 조회·수정·프로필 업로드를 401 차단 → [member/api.md](domains/member/api.md) "회원탈퇴" 반영. 완료 이력·인증 사진의 완전 파기 여부는 집 통계 의존 확인 후 별도 결정.
- **애플 로그인 authorizationCode 교환 실패 처리**: 애플 토큰 엔드포인트 교환이 실패했을 때 로그인 자체를 실패시킬지(fail-closed) 로그인은 허용하고 refresh token 저장만 포기할지(fail-open) 미정. (시크릿 미설정 환경은 fail-closed로 결정됨)
- **가입 코인 중복 수령**: 소셜 provider가 카카오·구글·애플 3개가 되면서, 동일인이 provider를 바꿔 가입하면 가입 코인(100)을 provider 수만큼 받을 수 있다(친구 초대 redeem과 조합하면 더 커짐). 회원 식별은 (provider, provider_user_id) 기준이고 이메일 기반 계정 병합이 없기 때문. 허용할지, 계정 병합·기기 식별 등으로 막을지 정책 필요. (재화 도메인)
- **dev-login 운영 차단**: `POST /api/v1/auth/dev-login`이 프로파일 가드 없이 모든 환경에서 열려 있다(임의 userId로 토큰 발급 가능). 운영 배포 전 프로파일 가드·설정 스위치 도입 필요. (서버)
- **시각 직렬화 타임존**: 공통 규약은 "ISO-8601 + offset, Asia/Seoul 기준"인데 서버는 `Instant`를 UTC `Z`로 직렬화한다(`lastAccessedAt` 등). 규약을 UTC로 바꿀지 서버에 jackson 타임존을 넣을지 미정.

## 프로덕트 (PRD / 멘토 피드백)

- **킬러 피처 1개 정의**: MVP에서 유저를 Lock-in 시킬 단일 핵심 기능은? (멘토 박영용 — 기능 나열보다 과감한 '덜어내기')
- 루틴 실패 패턴 분석 기반 초개인화를 MVP에서 어디까지 넣을지?
- 그룹 확장(가족·학교·회사)을 데이터 모델에서 미리 고려할지, 지인 '집'만 우선할지?

## 정책 (기능명세 건의사항)

- 루틴 삭제 시 수행 기록 **숨김 처리**의 통계 보존 정책 범위? (과거 캘린더가 로그 단독 소싱으로 바뀌어 삭제 루틴의 `FAILED` 로그 포함 여부도 이 논의에서 함께 결정)
- **탈퇴 회원 알림 사본**: 타 회원의 알림 내역(`notification.title`/`body`)에 탈퇴자 닉네임이 발송 시점 텍스트 사본으로 남는다 — 탈퇴 시 익명화가 소급되지 않는데, 이대로 수용할지 파기(치환)할지 미정.
- **알림 문구의 닉네임 null 폴백**: 응원(`FRIEND_CHEER`)·입주/퇴거 알림 본문이 닉네임을 그대로 연결해, 닉네임이 null(온보딩 전·탈퇴 익명화)이면 "null님"으로 표시된다. 폴백 문구("집 친구" 등) 도입 여부 미정. (서버)

## 루틴 / 투두

- (착수 전 미결정 없음 — 코인 보상은 루틴 10 / 투두 10, 일일 지급 상한은 루틴+투두 합산 50코인으로 결정. 잔여가 정가보다 적으면 잔여만큼만 부분 지급, features/api 반영)
- (결정됨) 과거 날짜 완료: 루틴·투두 모두 **과거 완료 허용, 미래 거부**. 코인·스트릭은 **당일 완료에만** 반영(과거 완료 소급 없음), features/api 반영
- **`categories.visibility` 값 집합**: spec은 `PRIVATE`/`HOUSE` 2종, 서버 enum은 `FRIENDS`/`PUBLIC` 포함 4종 허용(집 멤버 활동 열람은 `HOUSE`/`PUBLIC`만 노출로 동작 중). 2종으로 좁힐지 4종으로 확정할지?
- **`todos.external_id`·`routines.external_id` collation**: 현재 utf8mb4 기본 collation이라 unique 중복 판정의 대소문자 무시·PAD 동작이 DB 설정에 따라 다르다. Google 이벤트·시리즈 id는 소문자라 실사용 문제는 없지만, 대소문자를 구분하는 id 체계(MS Graph 등)를 출처로 받으려면 두 테이블의 `external_id`를 함께 `utf8mb4_bin`으로 바꿔야 한다(루틴 임포트도 같은 컬럼 설계라 같은 문제). 앞뒤 공백은 서버가 trim해서 PAD 차이에는 기대지 않는다. (서버)
- **루틴 버전 분기 모델 정규화**: 스케줄 수정 시 row를 복제하고 옛 row를 soft delete 하는 현재 모델(`origin_routine_id` 계보)은 row 단위 속성이 늘수록 우회가 쌓인다 — 외부 참조는 옛 row에만 남아 응답을 계보 원본에서 해석해야 하고, unique는 계보 단위로 표현할 수 없다. `routines`(정체성) + `routine_schedules`(`effective_from`/`effective_to` 이력)로 정규화해 `originRoutineId`를 없애는 리팩터 후보. 응답은 `originRoutineId = id`로 유지해 API 버저닝은 불필요하며, 착수 시점은 미정. (서버 #316)
- **카테고리 PURGE로 지워진 임포트 투두의 재임포트**: 카테고리 삭제(PURGE)로 함께 soft delete 된 임포트 투두도 unique에 남아 같은 일정이 다시 임포트되지 않는다(사용자가 직접 지운 경우와 동일 동작). 카테고리를 통째로 지운 사용자가 그 일정을 다시 가져오길 기대할 수 있어, 이 동작이 의도인지 프론트 확인 필요. (모바일 #844)
- **유사 루틴·투두 비교의 약어·동의어 쌍**: `POST /routines/similarity`는 text-embedding-3-large/1024 + 임계값 0.50(한글 제목 쌍 30개 실측 — 놓침 2·오탐 0)으로 확정했으나, "헬스/PT"(0.29)·"러닝/조깅"(0.39)처럼 무관 쌍(최고 0.44)보다 낮은 약어·외래어 동의어는 어떤 임계값으로도 못 잡는다. 프론트가 이 케이스의 힌트 누락을 문제 삼으면 경계 구간 LLM 판정을, 지연·비용이 문제 되면 제목 임베딩 캐시를 후속으로 검토한다. 표본이 작아 운영 데이터(hasSimilar 비율·무시율)로 재검증 예정. (서버 #303)

## 방 / 상점

- ~~`room_surface_slots.slot_type` 값 집합과 `items.placement_type`/`surface_slot_type` 매핑?~~ → **확정**: surface 3종(wallpaper/floor/background) + positioned 8종(topLeft/topCenter/topRight/midLeft/midRight/bottomLeft/bottomCenter/bottomRight - 방 한가운데 midCenter 는 캐릭터 자리라 없음). 프론트 FurnitureSlot 과 동일 표기.
- 방 스냅샷 생성 시점·저장 위치(어떤 key로 저장할지)?
- 캐릭터 악세사리 `character_slot_type` 값 집합?

## 뽑기 / 재화

- ~~중복 **아이템** → 다이아 전환 비율?~~ → **확정: 다이아 3** (캐릭터 중복은 코인 100 환급). 환급값은 뽑기 단가에 연동한다 — 단가만 낮추면 중복 전환이 소모 비용을 넘어서 뽑기가 재화 환전 수단이 된다.
- ~~`gacha_pool_entries.weight` 합/확률 계산 방식, `rarity` 값 집합?~~ → **확정(서버 구현)**: `weight` 미사용(잔존 컬럼). 아이템 뽑기는 rarity 티어 롤 — `일반` 70% / `희귀` 25% / `전설` 5%, 티어 내 균등. `rarity`는 한글 3종. → [gacha/api.md](domains/gacha/api.md) 반영.
- 코인↔다이아 환전 또는 아이템 뽑기 비용 통화(`cost_currency_type`) 기준? (캐릭터 뽑기는 코인 500으로 확정)
- **admin 재화 지급의 원장 미기록**: 어드민 재화 지급 경로는 `wallet_histories`에 기록되지 않는다. 원장에 기록할지, 기록한다면 별도 `reason` 값을 추가할지? (재화 도메인)
- ~~**뽑기 운영 기간 검증 도입**~~ → **구현됨**: 목록 필터·보상 목록·draw에서 `starts_at`/`ends_at`을 검사한다(기간 밖 `GACHA_INACTIVE`). 상세(GET /{id}) 응답의 기간 노출은 여전히 없음 — 노출 여부만 미정. (서버)
- ~~**회수 캐릭터 배출 차단**~~ → **구현됨(코드 차단)**: 풀 필터가 엔트리 활성에 더해 보상 참조 활성(`characters.is_active`, `items.is_active`+`themes.is_active`)을 검사한다. admin 카탈로그 사용/미사용 토글로 회수하면 엔트리 조작 없이 추첨·미리보기에서 즉시 빠진다. → [gacha/api.md](domains/gacha/api.md) · [gacha/features.md](domains/gacha/features.md) · [shop/api.md](domains/shop/api.md) 반영.
- **등급 공백 시 뽑기 확률 처리**: 아이템 비활성화(또는 미등록)로 특정 rarity 등급이 통째로 비면 현재는 전체 활성 풀 균등 fallback으로 추첨한다 — 잔여 등급의 실효 배출률이 공시 확률(70/25/5)과 달라질 수 있다. 잔여 등급으로 재정규화/재롤할지, fallback을 유지할지 미정. (서버)

### 확정됨

- **초기 재화**: 가입 시 지갑 발급 잔액 **코인 100·다이아 0**. 온보딩(튜토리얼)에서 가구 뽑기 단챠(코인 25) 1회를 소모시키고 75(단챠 3회분)를 남기는 값(멘토링 피드백 "처음 기본 재화 제공" 반영). → [shop/api.md](domains/shop/api.md) · [member/api.md](domains/member/api.md) 반영.
- **캐릭터 추가 획득 경로**: 온보딩 기본 1개 무료 선택 외 나머지 캐릭터는 **캐릭터 뽑기로 확정**. 테마 무관 전용 머신, 비용 **코인 500**, 8개 **전체 균등** 추첨, 이미 보유한 캐릭터가 나오면 **코인 100 환급**. 스키마는 `gacha_pool_entries.character_id`(FK `characters`) + `reward_type = CHARACTER`, `gacha.theme_id` NULL 허용. → [erd.md](erd.md) · [gacha/features.md](domains/gacha/features.md) · [gacha/api.md](domains/gacha/api.md) 반영.
- **캐릭터 악세사리 뽑기**: `items.placement_type = character`, 직접 구매 불가, 풀 엔트리 `reward_type = ITEM`·`rarity = NULL`·`weight = 1`로 전체 균등 추첨. 중복은 다른 아이템과 동일하게 **다이아 3 환급**. → [shop/features.md](domains/shop/features.md) · [gacha/features.md](domains/gacha/features.md) · [gacha/api.md](domains/gacha/api.md) 반영.

## 집

- (착수 전 미결정 없음 — 세부 밸런스는 운영 단계에서)
- **기본 집 생성 시점**: (결정됨) 기본 집(`나의 집`)은 회원가입 트랜잭션에서 생성하고, 집 목표는 온보딩 목표 저장(`PUT /onboarding/goals`) 시 1회 채운다. 나간·해체된 뒤 재생성 없음, 기존 계정 백필 없음. 집 목표 변경 API는 없음 → [house/features.md](domains/house/features.md)·[member/api.md](domains/member/api.md) 반영.
- **탈퇴 회원 처리**(회원 도메인 dependency): (일부 결정됨) 탈퇴 시 집 정리는 확정 — 모든 ACTIVE 멤버십 LEFT + 정원 감소 + pending 입주 신청 철회, 소유 집은 가입일 최선임 ACTIVE 멤버에게 자동 승계(동률 시 membership id 오름차순), 남은 멤버 없으면 집 해체(soft delete) → [member/api.md](domains/member/api.md)·[house/api.md](domains/house/api.md) 반영. 미확정 잔여: 단체미션 `house_mission_participants` 정산·분모 처리, house 미리보기·길드북 등에서 탈퇴 회원 `nickname`이 null로 내려갈 때의 표시 문구("탈퇴한 회원" 등 — 프론트 협의), `user_characters`/`user_items`/`user_wallets` 잔여 데이터 처리.
- **탈퇴 회원의 집 완료 내역 노출**(회원 도메인 dependency): 탈퇴 시 카테고리가 연쇄 soft delete되므로, 카테고리 visibility 기반의 집 멤버 완료 내역 조회에서 탈퇴자 이력이 빈 결과가 된다(`routine_logs` 자체는 보존되지만 노출 경로가 끊김). 이대로 수용할지, 집 통계·표시에서 별도 처리가 필요할지 미정.
