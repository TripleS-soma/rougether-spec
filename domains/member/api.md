# 회원 / 온보딩 API

공통 규칙은 전체 [api.md](../../api.md) 참조 (prefix `/api/v1`, 목록은 `items` 배열, 이미지/에셋은 `*_key`, 인증된 사용자 기준 소유권 guard 적용).

> 아래는 **설계 중(draft)**. method/path/목적과 핵심 필드만 합의하고, 상세 req/res는 구현 시 서버 repo `docs/`에서 확정한다.

## 인증 / 로그인

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `POST /api/v1/auth/kakao` | 카카오 access token으로 로그인. 최초 로그인이면 회원 자동 생성 | req: `accessToken` / res: `userId`, `accessToken`, `refreshToken`, `isNewUser` | `users`, `oauth_accounts` |
| `POST /api/v1/auth/google` | 구글 id token으로 로그인. 최초 로그인이면 회원 자동 생성 | req: `idToken` / res: `userId`, `accessToken`, `refreshToken`, `isNewUser` | `users`, `oauth_accounts` |

- 프론트(RN)가 네이티브 카카오 SDK로 얻은 **access token**을 보낸다(authorization code·redirect URI 미사용). 서버는 카카오로 토큰을 검증(앱 `app_id` 대조로 타 앱 토큰 치환 차단)하고 회원번호·이메일을 조회한다.
- 최초 로그인은 자동 가입: `oauth_accounts`에 (provider, provider_user_id)가 없으면 `users`와 통화별 지갑을 생성해 연동하고 `isNewUser=true`. 닉네임은 가입 시 비우고 온보딩에서 채운다. 이메일은 카카오가 제공/동의한 경우 가입 시에만 저장(미제공 시 null, 재로그인 시 갱신 안 함).
- 구글은 카카오와 달리 프론트가 **id token(JWT)** 을 보낸다(provider별 정석 자격증명 차이). 서버는 구글 공개키(JWK, RS256)로 서명·`iss`·`aud`·만료를 검증하고 `sub`(회원번호)·이메일을 추출한다. `aud`는 허용 client_id 목록과 대조해 타 앱 토큰 치환을 차단하며, 목록 미설정 시 전부 거부(fail-closed). 최초 자동 가입·이메일 저장 정책은 카카오와 동일.
- 인증 토큰은 JWT(stateless) access + 불투명 refresh(회전·재사용 감지) 기반. 소셜 provider는 카카오·구글 지원, 애플은 구글과 동일한 id token(JWK) 검증 방식으로 후속.

## 마스터 조회 (목표 · 캐릭터)

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/goals` | 선택 가능한 목표 목록 | res: `items[]` = `{ id, code, name, sortOrder }` (`isActive=true`만) | `goals` |
| `GET /api/v1/characters` | 선택 가능한 캐릭터 목록 | res: `items[]` = `{ id, code, name, baseAssetKey, sortOrder }` (`isActive=true`만) | `characters` |

## 온보딩 (목표 · 캐릭터 선택)

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/onboarding` | 현재 온보딩 상태(선택한 목표·대표 캐릭터, 완료 여부) 조회 | res: `goals[]` = `{ goalId, code, name }`(마스터 `sortOrder` ASC), `primaryGoalId`, `selectedCharacterId`, `completed` | `user_goals`, `user_characters` |
| `PUT /api/v1/onboarding/goals` | 목표 선택 저장(하나 이상) | req: `goalIds[]`, `primaryGoalId?` → `user_goals` 전체 교체, `is_primary` 설정 | `user_goals` |
| `PUT /api/v1/onboarding/character` | 대표 캐릭터 선택 저장 | req: `characterId` → res: `selectedCharacterId` | `user_characters` |

- `PUT /api/v1/onboarding/goals`: 전체 교체(기존 `user_goals` 삭제 후 재구성, 단일 트랜잭션). `goalIds`가 빈 배열이면 거부(최소 1개, `GOAL_REQUIRED`), 상한 없음. 중복 `goalId`는 dedupe. 모든 `goalId`는 존재 + `isActive=true`여야 함(아니면 `INVALID_GOAL`). `primaryGoalId`는 선택(생략 시 대표 없음), 지정 시 `goalIds`에 포함돼야 함(아니면 `PRIMARY_GOAL_NOT_IN_SELECTION`).
- `PUT /api/v1/onboarding/character`: 대상 `characterId`는 존재 + `isActive=true` 마스터여야 함(아니면 `CHARACTER_NOT_FOUND`). 보유(`deleted_at` null) 중이면 이전 대표 `is_selected=false`·대상 `is_selected=true`로 무료 교체. 미보유 + 보유 0개(최초)면 대상을 보유 등록(`acquired_at` 기록)+선택(스타터 지급). 미보유 + 보유 1개 이상이면 거부(`CHARACTER_NOT_OWNED`) — 신규 획득은 뽑기/상점 도메인 소관. 이전 대표 해제 + 신규 선택/등록은 단일 트랜잭션이며 `is_selected` 유일성을 보장(대상 유저 행 비관적 락으로 동시 요청 직렬화). 이미 선택된 캐릭터 재선택은 무해(idempotent).
- `completed`는 (선택 목표 ≥1개) && (대표 캐릭터 존재)로 계산. `primaryGoalId`는 optional이라 완료 기준에서 제외. 온보딩 요약(`completed`·`primaryGoalId`·`selectedCharacterId`)은 `GET /api/v1/onboarding`과 `GET /api/v1/me`가 동일 read model을 공유.
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

- 닉네임 설정 엔드포인트(`PUT /api/v1/me`) 포함 여부와 위치.
- 에러 응답 형태·응답 envelope 사용 여부는 공통 미결정 ([open-questions.md](../../open-questions.md)).
