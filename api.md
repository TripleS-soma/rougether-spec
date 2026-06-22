# API 공통 규약

모든 도메인 API가 공유하는 규약이다. 도메인별 엔드포인트는 각 `domains/<도메인>/api.md`를 참조한다.

## 공통 규칙

- prefix: `/api/v1`
- 본문은 JSON, 시각은 ISO-8601 + offset (`2026-06-21T12:00:00+09:00`)
- 이미지/에셋은 전체 URL 대신 key로 주고받는다 (`asset_key` / `cover_image_key` / `storage_key`). 프론트가 CDN base URL과 조합.
- 목록 응답은 `items` 배열로 감싼다.
- 인증/인가는 MVP 초반 유예. 최종 형태에서 `me` path 사용 가능, 초기엔 dev/seed user로 임시 처리. 소유권 식별자(`user_id`, `owner_user_id`, `house_id`, `room_user_id`, `membership_id`)는 유지한다.
- 재화는 `user_wallets.currency_type`로 코인/다이아 구분. 보상 지급·차감은 쓰기 트랜잭션으로 묶는다.

## 도메인 API 인덱스

| 도메인 | 문서 |
| --- | --- |
| 회원 / 온보딩 | [domains/member/api.md](domains/member/api.md) |
| 루틴 / 투두 | [domains/routine-todo/api.md](domains/routine-todo/api.md) |
| 개인 방 | [domains/room/api.md](domains/room/api.md) |
| 상점 / 재화 | [domains/shop/api.md](domains/shop/api.md) |
| 뽑기 | [domains/gacha/api.md](domains/gacha/api.md) |
| 공동 집 | [domains/house/api.md](domains/house/api.md) |

## 합의 필요

에러 응답 형태 · 응답 envelope 사용 여부 · 페이지네이션 방식 → [open-questions.md](open-questions.md).
