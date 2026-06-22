# 열린 질문

아직 합의 안 된 것들. 정해지면 [features.md](features.md) / [api.md](api.md) / [erd.md](erd.md)에 반영하고 여기서 지운다.

## 정책 (기능명세 건의사항)

- **공개 범위 단위**: 루틴별 공개가 아니라 **카테고리별 공개**로 갈지? (`routines.visibility` vs `categories` 공개 필드)
- 스트릭 보너스의 **일일 보상 한도** 구체값?
- 루틴 삭제 시 수행 기록 **숨김 처리**의 통계 보존 정책 범위?

## 루틴 / 투두

- `repeat_type` / `repeat_days`(JSON) 값 스펙 (매일·매주·주 N회 표현 방식)?
- 완료 취소의 "당일" 기준 타임존(서버 UTC vs KST)?
- 코인 보상 금액 규칙(루틴/투두별 고정 vs 가변)?

## 방 / 상점

- `room_surface_slots.slot_type` 값 집합(바닥·벽·천장 등)과 `items.placement_type`/`surface_slot_type` 매핑?
- 방 스냅샷 생성 시점·저장 위치(어떤 key로 저장할지)?
- 캐릭터 악세사리 `character_slot_type` 값 집합?

## 뽑기 / 재화

- 중복 아이템 → 다이아 전환 비율?
- `gacha_pool_entries.weight` 합/확률 계산 방식, `rarity` 값 집합?
- 코인↔다이아 환전 또는 뽑기 비용 통화(`cost_currency_type`) 기준?

## 집

- `house_missions.mission_type` / `target_value` 값 스펙?
- 집 레벨업 곡선과 레벨별 테마 보상 매핑?
- 구성원 루틴 현황 공개 범위 기본값?

## API 공통

- 에러 응답 형태(code/message 구조)는?
- 응답 envelope를 쓸지, 리소스를 바로 내려줄지?
- 페이지네이션 방식(목록 큰 도메인: 상점·집 탐색)?
