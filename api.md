# API 계약

프론트·백엔드가 맞춰야 하는 API 합의안이다. 엔드포인트는 [features.md](features.md)의 기능을 기준으로 설계하고, 데이터는 [erd.md](erd.md)를 따른다.

> 아래 엔드포인트는 아직 **설계 중(draft)** 이다. 요청/응답 상세는 구현 시 서버 repo `docs/`에 정리하고, 합의된 계약만 이 문서로 끌어온다.

## 공통 규칙

- prefix: `/api/v1`
- 본문은 JSON, 시각은 ISO-8601 + offset (`2026-06-21T12:00:00+09:00`)
- 이미지/에셋은 전체 URL 대신 `asset_key` / `cover_image_key` / `storage_key` 등 key로 내려준다. (프론트가 CDN base URL과 조합)
- 목록 응답은 `items` 배열로 감싼다.
- 인증/인가는 MVP 초반 유예. 최종 형태에서 `me` path 사용 가능, 초기엔 dev/seed user로 임시 처리. 소유권 식별자(`user_id`, `owner_user_id`, `house_id`, `room_user_id`, `membership_id`)는 유지한다.
- 재화는 `user_wallets.currency_type`로 코인/다이아 구분. 보상 지급·차감은 쓰기 트랜잭션으로 묶는다.

> 합의 필요: **에러 응답 형태**, **응답 envelope 사용 여부**. → [open-questions.md](open-questions.md)

## 도메인별 엔드포인트 (설계 대상)

[features.md](features.md) 기준으로 도출할 엔드포인트 그룹. path는 초안 제안이며 확정 아님.

| 도메인 | 주요 엔드포인트 그룹 (초안) |
| --- | --- |
| 회원/온보딩 | `GET/PUT /api/v1/onboarding` (목표·캐릭터 선택), `GET /api/v1/me` |
| 카테고리 | `GET/POST/PUT/DELETE /api/v1/categories` |
| 루틴 | `GET/POST/PUT/DELETE /api/v1/routines`, `POST /api/v1/routines/{id}/logs`(완료/취소) |
| 사진 인증 | `POST/DELETE /api/v1/routine-logs/{id}/photo`, 공개범위 변경 |
| 투두 | `GET/POST/PUT/DELETE /api/v1/todos`, 완료/취소 |
| 오늘 현황 | `GET /api/v1/today` (루틴·투두·진행률·스트릭) |
| 방 | `GET /api/v1/rooms/me`, `PUT /api/v1/rooms/me/slots`, 스냅샷 |
| 상점/인벤토리 | `GET /api/v1/items`, `GET /api/v1/me/items`, `POST /api/v1/items/{id}/purchase` |
| 뽑기 | `GET /api/v1/gacha`, `POST /api/v1/gacha/{id}/draw` |
| 집 | `GET/POST /api/v1/houses`, `/join`, `/{id}/members`, `/{id}/missions`, `/{id}/guestbooks` |

## 핵심 응답 예시 (내 방 조회, 초안)

```json
{
  "roomUserId": "user_1",
  "growthLevel": 3,
  "slots": [
    { "slotType": "wall", "userItemId": "uitem_9", "assetKey": "assets/items/sage-wall/v1.webp" }
  ],
  "updatedAt": "2026-06-21T12:00:00+09:00"
}
```
