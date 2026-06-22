# 열린 질문

아직 합의 안 된 것들. 정해지면 [features.md](features.md) / [api.md](api.md) / [erd.md](erd.md)에 반영하고 여기서 지운다.

## 착수 전 확정 (P0 — 백/프 시작하면 바로 부딪힘)

- **에러 응답 형태**: `code`/`message`/`fieldErrors` 구조?
- **응답 envelope**: 리소스를 바로 내려줄지, `{ success, data, error }`로 감쌀지?
- **페이지네이션**: cursor vs offset, 적용 도메인(상점·집 탐색)?

## 프로덕트 (PRD / 멘토 피드백)

- **킬러 피처 1개 정의**: MVP에서 유저를 Lock-in 시킬 단일 핵심 기능은? (멘토 박영용 — 기능 나열보다 과감한 '덜어내기')
- 루틴 실패 패턴 분석 기반 초개인화를 MVP에서 어디까지 넣을지?
- 그룹 확장(가족·학교·회사)을 데이터 모델에서 미리 고려할지, 지인 '집'만 우선할지?

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