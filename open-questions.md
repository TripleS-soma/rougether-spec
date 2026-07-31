# 열린 질문

아직 합의 안 된 것들. 정해지면 [features.md](features.md) / [api.md](api.md) / [erd.md](erd.md)에 반영하고 여기서 지운다.

## 착수 전 확정 (P0 — 백/프 시작하면 바로 부딪힘)

- **인증/인가 상세**: (결정됨) 카카오(access token 방식) · 구글·애플(id token/identityToken JWK 검증 방식) 소셜 로그인 · JWT access + refresh 회전 정책 · `oauth_accounts` 스키마 확정 · `users.email`(nullable) 추가. (미결) 회원 탈퇴 시 oauth 연결 처리 및 애플 토큰 revoke(authorizationCode + client secret JWT). Sign in with Apple 도입에 따라 App Store 심사 5.1.1(v)가 앱 내 계정 삭제를 요구하는지 확인 필요.
- **가입 코인 중복 수령**: 소셜 provider가 카카오·구글·애플 3개가 되면서, 동일인이 provider를 바꿔 가입하면 가입 코인(750)을 provider 수만큼 받을 수 있다. 회원 식별은 (provider, provider_user_id) 기준이고 이메일 기반 계정 병합이 없기 때문. 허용할지, 계정 병합·기기 식별 등으로 막을지 정책 필요. (재화 도메인 — 장진형)

## 프로덕트 (PRD / 멘토 피드백)

- **킬러 피처 1개 정의**: MVP에서 유저를 Lock-in 시킬 단일 핵심 기능은? (멘토 박영용 — 기능 나열보다 과감한 '덜어내기')
- 루틴 실패 패턴 분석 기반 초개인화를 MVP에서 어디까지 넣을지?
- 그룹 확장(가족·학교·회사)을 데이터 모델에서 미리 고려할지, 지인 '집'만 우선할지?

## 정책 (기능명세 건의사항)

- 루틴 삭제 시 수행 기록 **숨김 처리**의 통계 보존 정책 범위? (과거 캘린더가 로그 단독 소싱으로 바뀌어 삭제 루틴의 `FAILED` 로그 포함 여부도 이 논의에서 함께 결정)

## 루틴 / 투두

- (착수 전 미결정 없음 — 코인 보상은 루틴 10 / 투두 5, 일일 지급 상한은 루틴+투두 합산 4건으로 결정, features/api 반영)
- **일일 보상 상한 방식 불일치**: spec은 루틴+투두 합산 **4건**(건수 기준) 상한인데, 서버 구현은 하루 코인 **금액 상한 50** 기준으로 동작 중. 어느 쪽으로 확정할지? (루틴/투두 도메인 — 임채영)
- **투두 완료 보상 금액 불일치**: spec은 투두 **+5**인데, 서버 구현은 **+10**으로 지급 중. 어느 쪽으로 확정할지? (루틴/투두 도메인 — 임채영)
- (결정됨) 과거 날짜 완료: 루틴·투두 모두 **과거 완료 허용, 미래 거부**. 코인·스트릭은 **당일 완료에만** 반영(과거 완료 소급 없음), features/api 반영
- **`categories.visibility` 값 집합**: spec은 `PRIVATE`/`HOUSE` 2종, 서버 enum은 `FRIENDS`/`PUBLIC` 포함 4종 허용(집 멤버 활동 열람은 `HOUSE`/`PUBLIC`만 노출로 동작 중). 2종으로 좁힐지 4종으로 확정할지?

## 방 / 상점

- ~~`room_surface_slots.slot_type` 값 집합과 `items.placement_type`/`surface_slot_type` 매핑?~~ → **확정**: surface 3종(wallpaper/floor/background) + positioned 8종(topLeft/topCenter/topRight/midLeft/midRight/bottomLeft/bottomCenter/bottomRight - 방 한가운데 midCenter 는 캐릭터 자리라 없음). 프론트 FurnitureSlot 과 동일 표기.
- 방 스냅샷 생성 시점·저장 위치(어떤 key로 저장할지)?
- 캐릭터 악세사리 `character_slot_type` 값 집합?

## 뽑기 / 재화

- ~~중복 **아이템** → 다이아 전환 비율?~~ → **확정: 다이아 3** (캐릭터 중복은 코인 100 환급). 환급값은 뽑기 단가에 연동한다 — 단가만 낮추면 중복 전환이 소모 비용을 넘어서 뽑기가 재화 환전 수단이 된다.
- 방 꾸미기 가구의 `gacha_pool_entries.weight` 합/확률 계산 방식, `rarity` 값 집합? (캐릭터 악세사리와 캐릭터 뽑기는 등급 없이 균등이라 해당 없음)
- 코인↔다이아 환전 또는 아이템 뽑기 비용 통화(`cost_currency_type`) 기준? (캐릭터 뽑기는 코인 500으로 확정)
- **친구 초대 보상 도메인 미문서화**: 서버에는 초대코드 발급·등록과 코인 보상 지급(재화 원장 `INVITE_REWARD` 기록 포함)이 구현돼 있으나, spec에 초대(invite) 도메인 문서(기능·API·보상 수치)가 없다. 계약 문서화 필요. (재화 도메인 — 장진형)
- **admin 재화 지급의 원장 미기록**: 어드민 재화 지급 경로는 `wallet_histories`에 기록되지 않는다. 원장에 기록할지, 기록한다면 별도 `reason` 값을 추가할지? (재화 도메인 — 장진형)

### 확정됨

- **초기 재화**: 가입 시 지갑 발급 잔액 **코인 100·다이아 0**. 온보딩(튜토리얼)에서 가구 뽑기 단챠(코인 25) 1회를 소모시키고 75(단챠 3회분)를 남기는 값(멘토링 피드백 "처음 기본 재화 제공" 반영). → [shop/api.md](domains/shop/api.md) · [member/api.md](domains/member/api.md) 반영.
- **캐릭터 추가 획득 경로**: 온보딩 기본 1개 무료 선택 외 나머지 캐릭터는 **캐릭터 뽑기로 확정**. 테마 무관 전용 머신, 비용 **코인 500**, 6개 **전체 균등** 추첨, 이미 보유한 캐릭터가 나오면 **코인 100 환급**. 스키마는 `gacha_pool_entries.character_id`(FK `characters`) + `reward_type = CHARACTER`, `gacha.theme_id` NULL 허용. → [erd.md](erd.md) · [gacha/features.md](domains/gacha/features.md) · [gacha/api.md](domains/gacha/api.md) 반영.
- **캐릭터 악세사리 뽑기**: `items.placement_type = character`, 직접 구매 불가, 풀 엔트리 `reward_type = ITEM`·`rarity = NULL`·`weight = 1`로 전체 균등 추첨. 중복은 다른 아이템과 동일하게 **다이아 3 환급**. → [shop/features.md](domains/shop/features.md) · [gacha/features.md](domains/gacha/features.md) · [gacha/api.md](domains/gacha/api.md) 반영.

## 집

- (착수 전 미결정 없음 — 세부 밸런스는 운영 단계에서)
