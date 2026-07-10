# 열린 질문

아직 합의 안 된 것들. 정해지면 [features.md](features.md) / [api.md](api.md) / [erd.md](erd.md)에 반영하고 여기서 지운다.

## 착수 전 확정 (P0 — 백/프 시작하면 바로 부딪힘)

- **인증/인가 상세**: (결정됨) 카카오(access token 방식) · 구글(id token JWK 검증 방식) 소셜 로그인 · JWT access + refresh 회전 정책 · `oauth_accounts` 스키마 확정 · `users.email`(nullable) 추가. (미결) 애플 연동(구글과 동일 id token 방식 예정), 회원 탈퇴 시 oauth 연결 처리.

## 프로덕트 (PRD / 멘토 피드백)

- **킬러 피처 1개 정의**: MVP에서 유저를 Lock-in 시킬 단일 핵심 기능은? (멘토 박영용 — 기능 나열보다 과감한 '덜어내기')
- 루틴 실패 패턴 분석 기반 초개인화를 MVP에서 어디까지 넣을지?
- 그룹 확장(가족·학교·회사)을 데이터 모델에서 미리 고려할지, 지인 '집'만 우선할지?

## 정책 (기능명세 건의사항)

- 루틴 삭제 시 수행 기록 **숨김 처리**의 통계 보존 정책 범위?

## 루틴 / 투두

- (착수 전 미결정 없음 — 코인 보상은 루틴 10 / 투두 5, 일일 지급 상한은 루틴+투두 합산 4건으로 결정, features/api 반영)
- (결정됨) 과거 날짜 완료: 루틴·투두 모두 **과거 완료 허용, 미래 거부**. 코인·스트릭은 **당일 완료에만** 반영(과거 완료 소급 없음), features/api 반영
- **`categories.visibility` 값 집합**: spec은 `PRIVATE`/`HOUSE` 2종, 서버 enum은 `FRIENDS`/`PUBLIC` 포함 4종 허용(집 멤버 활동 열람은 `HOUSE`/`PUBLIC`만 노출로 동작 중). 2종으로 좁힐지 4종으로 확정할지?

## 방 / 상점

- ~~`room_surface_slots.slot_type` 값 집합과 `items.placement_type`/`surface_slot_type` 매핑?~~ → **확정**: surface 3종(wallpaper/floor/background) + positioned 8종(topLeft/topCenter/topRight/midLeft/midRight/bottomLeft/bottomCenter/bottomRight - 방 한가운데 midCenter 는 캐릭터 자리라 없음). 프론트 FurnitureSlot 과 동일 표기.
- 방 스냅샷 생성 시점·저장 위치(어떤 key로 저장할지)?
- 캐릭터 악세사리 `character_slot_type` 값 집합?

## 뽑기 / 재화

- ~~중복 **아이템** → 다이아 전환 비율?~~ → **확정: 다이아 30** (캐릭터 중복은 코인 200 환급).
- `gacha_pool_entries.weight` 합/확률 계산 방식, `rarity` 값 집합? (캐릭터 뽑기는 균등이라 해당 없음, 아이템 뽑기만 미정)
- 코인↔다이아 환전 또는 아이템 뽑기 비용 통화(`cost_currency_type`) 기준? (캐릭터 뽑기는 코인 1000으로 확정)

### 확정됨

- **캐릭터 추가 획득 경로**: 온보딩 기본 1개 무료 선택 외 나머지 캐릭터는 **캐릭터 뽑기로 확정**. 테마 무관 전용 머신, 비용 **코인 1000**, 6개 **전체 균등** 추첨, 이미 보유한 캐릭터가 나오면 **코인 200 환급**. 스키마는 `gacha_pool_entries.character_id`(FK `characters`) + `reward_type = CHARACTER`, `gacha.theme_id` NULL 허용. → [erd.md](erd.md) · [gacha/features.md](domains/gacha/features.md) · [gacha/api.md](domains/gacha/api.md) 반영.

## 집

- (착수 전 미결정 없음 — 세부 밸런스는 운영 단계에서)