# 회원 / 온보딩 API

공통 규칙은 전체 [api.md](../../api.md) 참조 (prefix `/api/v1`, 목록은 `items` 배열, 이미지/에셋은 `*_key`, 인증된 사용자 기준 소유권 guard 적용).

> 아래는 **설계 중(draft)**. method/path/목적과 핵심 필드만 합의하고, 상세 req/res는 구현 시 서버 repo `docs/`에서 확정한다.

## 마스터 조회 (목표 · 캐릭터)

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/goals` | 선택 가능한 목표 목록 | res: `items[]` = `{ id, code, name, sortOrder }` (`isActive=true`만) | `goals` |
| `GET /api/v1/characters` | 선택 가능한 캐릭터 목록 | res: `items[]` = `{ id, code, name, baseAssetKey, sortOrder }` (`isActive=true`만) | `characters` |

## 온보딩 (목표 · 캐릭터 선택)

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/onboarding` | 현재 온보딩 상태(선택한 목표·대표 캐릭터, 완료 여부) 조회 | res: `goals[]`, `primaryGoalId`, `selectedCharacterId`, `completed` | `user_goals`, `user_characters` |
| `PUT /api/v1/onboarding/goals` | 목표 선택 저장(하나 이상) | req: `goalIds[]`, `primaryGoalId?` → `user_goals` upsert, `is_primary` 설정 | `user_goals` |
| `PUT /api/v1/onboarding/character` | 대표 캐릭터 선택 저장 | req: `characterId` → `user_characters` `is_selected=true`, `acquired_at` 기록 | `user_characters` |

- `PUT /api/v1/onboarding/goals`: `goalIds`가 빈 배열이면 거부(최소 1개). `primaryGoalId`는 `goalIds`에 포함돼야 함.
- `PUT /api/v1/onboarding/character`: 이전 대표 캐릭터의 `is_selected`는 false로, 새 캐릭터만 true로 묶어서 쓰기 트랜잭션 처리.
- 선택값은 모두 `user_id`(소유권 식별자)에 귀속. 인증된 사용자 기준.

## 회원 기본 정보

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/me` | 내 기본 정보 + 온보딩 완료 여부 | res: `userId`, `nickname`, `lastLoginAt`, `onboarding: { completed, primaryGoalId, selectedCharacterId }` | `users`, `user_goals`, `user_characters` |

## 연동 (다른 도메인)

- 선택한 대표 캐릭터 → 개인 방 배치는 **방 도메인** (`GET /api/v1/rooms/me`).
- 선택한 목표 → 초기 루틴 추천은 **루틴/투두 도메인**, 집 탐색 필터는 **집 도메인**.
- 재화/지갑(`user_wallets`)은 이 도메인 비범위.

## 미정

- `PUT /api/v1/onboarding`을 목표·캐릭터 통합 1콜로 둘지, 위처럼 분리할지.
- 닉네임 설정 엔드포인트(`PUT /api/v1/me`) 포함 여부와 위치.
- 에러 응답 형태·응답 envelope 사용 여부는 공통 미결정 ([open-questions.md](../../open-questions.md)).
