# 회원 / 온보딩 API

공통 규칙은 전체 [api.md](../../api.md) 참조 (prefix `/api/v1`, 목록은 `items` 배열, 이미지/에셋은 `*_key`, 인증된 사용자 기준 소유권 guard 적용).

> 아래는 **설계 중(draft)**. method/path/목적과 핵심 필드만 합의하고, 상세 req/res는 구현 시 서버 repo `docs/`에서 확정한다.

## 인증 / 로그인

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `POST /api/v1/auth/kakao` | 카카오 access token으로 로그인. 최초 로그인이면 회원 자동 생성 | req: `accessToken` / res: `userId`, `accessToken`, `refreshToken`, `isNewUser` | `users`, `oauth_accounts` |
| `POST /api/v1/auth/google` | 구글 id token으로 로그인. 최초 로그인이면 회원 자동 생성 | req: `idToken` / res: `userId`, `accessToken`, `refreshToken`, `isNewUser` | `users`, `oauth_accounts` |
| `POST /api/v1/auth/apple` | 애플 identityToken으로 로그인. 최초 로그인이면 회원 자동 생성 | req: `idToken`, `authorizationCode` / res: `userId`, `accessToken`, `refreshToken`, `isNewUser` | `users`, `oauth_accounts` |
| `POST /api/v1/auth/refresh` | refresh token으로 access/refresh 재발급. **1회용(회전)** — 사용한 refresh는 즉시 폐기되고 새 토큰으로 교체. 정상 회전 성공 시 `users.last_accessed_at` 갱신 | req: `refreshToken` / res: `accessToken`, `refreshToken` | `refresh_tokens` |
| `POST /api/v1/auth/logout` | 전달한 refresh token 폐기. **멱등**(없는/이미 폐기된 토큰도 성공) — access token은 만료까지 유효하므로 클라이언트가 삭제 | req: `refreshToken` / res: 204 | `refresh_tokens` |
| `POST /api/v1/auth/dev-login` | **개발 전용** — userId로 토큰 발급(생략 시 새 회원 생성 — 소셜 가입과 동일하게 지갑 발급 포함). 운영에서는 사용하지 않는 것이 정책이나, **현재 프로파일 가드·설정 스위치가 없어 어느 환경에서도 열려 있다**(운영 차단은 미결 → [open-questions.md](../../open-questions.md)) | req: `userId?` / res: 로그인과 동일 | `users` |

- 프론트(RN)가 네이티브 카카오 SDK로 얻은 **access token**을 보낸다(authorization code·redirect URI 미사용). 서버는 카카오로 토큰을 검증(앱 `app_id` 대조로 타 앱 토큰 치환 차단)하고 회원번호·이메일을 조회한다.
- 최초 로그인은 자동 가입: `oauth_accounts`에 (provider, provider_user_id)가 없으면 `users`와 통화별 지갑을 생성해 연동하고 `isNewUser=true`. 지갑 초기 잔액은 코인 100·다이아 0(정책은 재화 도메인 소유 → [shop/api.md](../shop/api.md)). 닉네임은 가입 시 비우고 온보딩에서 채운다. 이메일은 카카오가 제공/동의한 경우 가입 시에만 저장(미제공 시 null, 재로그인 시 갱신 안 함).
- 구글은 카카오와 달리 프론트가 **id token(JWT)** 을 보낸다(provider별 정석 자격증명 차이). 서버는 구글 공개키(JWK, RS256)로 서명·`iss`·`aud`·만료를 검증하고 `sub`(회원번호)·이메일을 추출한다. `aud`는 허용 client_id 목록과 대조해 타 앱 토큰 치환을 차단하며, 목록 미설정 시 전부 거부(fail-closed). 최초 자동 가입·이메일 저장 정책은 카카오와 동일.
- 애플도 구글과 동일하게 프론트가 **identityToken(JWT)** 을 보낸다(Sign in with Apple). 서버는 애플 공개키(JWK, RS256)로 서명·만료를 검증하고 `iss`가 `https://appleid.apple.com`인지, `aud`가 허용 client_id(App ID/Service ID) 목록에 있는지 대조한 뒤 `sub`(회원번호)·이메일을 추출한다. 목록 미설정 시 전부 거부(fail-closed). 애플은 **최초 로그인에만 이메일을 제공**하고 이메일 가리기를 선택하면 private relay 주소(`@privaterelay.appleid.com`)를 주므로, 이메일은 없을 수도 relay 주소일 수도 있다 — 받은 값을 그대로 가입 시에만 저장한다. 요청에는 identityToken과 함께 **`authorizationCode`(필수)** 를 보낸다 — native Sign in with Apple이 identityToken과 함께 반환하는 값이라 추가 UX는 없지만 **기존 계약 변경이므로 프론트 동시 배포가 필요**하다. 서버는 로그인 성공 시 `authorizationCode`를 애플 토큰 엔드포인트(`https://appleid.apple.com/auth/token`)로 교환해 refresh token을 받고, 암호화해 `oauth_accounts.apple_refresh_token_encrypted`에 저장한다(재로그인 시 갱신) — 회원탈퇴 시 연동 해제(revoke)에 사용한다. 교환·암호화에 필요한 시크릿 미설정 환경에서는 조용히 건너뛰지 않고 애플 로그인이 실패한다(fail-closed).
- 인증 토큰은 JWT(stateless) access + 불투명 refresh(회전·재사용 감지) 기반. access 유효기간 30분, refresh 14일. refresh는 원문이 아닌 해시만 `refresh_tokens`에 저장. 소셜 provider는 카카오·구글·애플을 지원한다.
- `users.last_accessed_at`은 **마지막 토큰 발급 시각**이다. 소셜/dev 로그인과 refresh 정상 회전 성공 시 갱신하고, 재사용 감지→전체 폐기 경로에서는 갱신하지 않는다. 갱신은 **역행 무시 조건부 UPDATE**다 — 기존 값이 null이거나 새 값보다 과거일 때만 갱신해, 다기기 동시 회전이 최신값을 되돌리지 않는다. access 유효기간(30분)만큼의 오차를 허용한다(알림·휴면 판별 용도로 충분).

## 마스터 조회 (목표 · 캐릭터)

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/goals` | 선택 가능한 목표 목록 | res: `items[]` = `{ id, code, name, sortOrder }` (`isActive=true`만) | `goals` |
| `GET /api/v1/characters` | 선택 가능한 캐릭터 목록 | res: `items[]` = `{ id, code, name, baseAssetKey, animations{ idle, poseCycle, wave }, poses[], sortOrder }` (`isActive=true`만) | `characters`, `character_poses` |

## 온보딩 (목표 · 캐릭터 선택)

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/onboarding` | 현재 온보딩 상태(선택한 목표·대표 캐릭터, 완료 여부) 조회 | res: `goals[]` = `{ goalId, code, name }`(마스터 `sortOrder` ASC), `primaryGoalId`, `selectedCharacterId`, `completed` | `user_goals`, `user_characters` |
| `PUT /api/v1/onboarding/goals` | 목표 선택 저장(하나 이상) | req: `goalIds[]`, `primaryGoalId?` → `user_goals` 전체 교체, `is_primary` 설정 | `user_goals` |
| `PUT /api/v1/onboarding/character` | 대표 캐릭터 선택 저장 | req: `characterId` → res: `selectedCharacterId` | `user_characters` |

- `PUT /api/v1/onboarding/goals`: 전체 교체(기존 `user_goals` 삭제 후 재구성, 단일 트랜잭션). `goalIds`가 빈 배열이면 거부(최소 1개, `GOAL_REQUIRED`), 상한 없음. 중복 `goalId`는 dedupe. 모든 `goalId`는 존재 + `isActive=true`여야 함(아니면 `INVALID_GOAL`). `primaryGoalId`는 선택(생략 시 대표 없음), 지정 시 `goalIds`에 포함돼야 함(아니면 `PRIMARY_GOAL_NOT_IN_SELECTION`).
- `PUT /api/v1/onboarding/character`: 대상 `characterId`는 존재 + `isActive=true` 마스터여야 함(아니면 `CHARACTER_NOT_FOUND`). 보유(`deleted_at` null) 중이면 이전 대표 `is_selected=false`·대상 `is_selected=true`로 무료 교체. 미보유 + 보유 0개(최초)면 대상을 보유 등록(`acquired_at` 기록)+선택(스타터 지급). 미보유 + 보유 1개 이상이면 거부(`CHARACTER_NOT_OWNED`) — 신규 획득은 뽑기/상점 도메인 소관. 이전 대표 해제 + 신규 선택/등록은 단일 트랜잭션이며 `is_selected` 유일성을 보장(대상 유저 행 비관적 락으로 동시 요청 직렬화). 이미 선택된 캐릭터 재선택은 무해(idempotent). 온보딩 이후의 착용 교체는 `PUT /api/v1/me/characters/select`(보유 캐릭터 전용) 사용을 권장한다 — 이 경로의 교체 동작은 하위호환으로 유지.
- `completed`는 (선택 목표 ≥1개) && (대표 캐릭터 존재)로 계산. `primaryGoalId`는 optional이라 완료 기준에서 제외. 온보딩 요약(`completed`·`primaryGoalId`·`selectedCharacterId`)은 `GET /api/v1/onboarding`과 `GET /api/v1/me`가 동일 read model을 공유.
- 선택값은 모두 `user_id`(소유권 식별자)에 귀속. 인증된 사용자 기준.

## 보유 캐릭터 / 착용

캐릭터(마스터·보유·착용) 계약은 방·뽑기 도메인과 함께 관리한다. 문서 위치는 온보딩 흐름과의 연속성을 위해 유지한다.

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/me/characters` | 내 보유 캐릭터 목록 | res: `items[]` = `{ userCharacterId, characterId, code, name, baseAssetKey, animations{ idle, poseCycle, wave }, poses[], selected, accessories[], acquiredAt }` (마스터 `sortOrder` ASC). `accessories[]` = `{ userItemId, itemId, name, assetKey, characterSlotType, equippedAt }` | `user_characters`, `characters`, `character_poses`, `user_character_accessories`, `user_items`, `items` |
| `PUT /api/v1/me/characters/select` | 착용(대표) 캐릭터 교체 | req: `characterId` → res: `selectedCharacterId` | `user_characters` |
| `PUT /api/v1/me/characters/{userCharacterId}/accessories` | 보유 캐릭터에 악세사리 적용·같은 슬롯 교체 | req: `userItemId` → res: `userCharacterId`, 갱신 후 `items[]` | `user_character_accessories`, `user_characters`, `user_items`, `items` |
| `DELETE /api/v1/me/characters/{userCharacterId}/accessories/{characterSlotType}` | 보유 캐릭터의 지정 악세사리 슬롯 해제 | res: `userCharacterId`, 갱신 후 `items[]` | `user_character_accessories`, `user_characters` |

- 착용 교체는 **보유 캐릭터만** 가능(미보유 `CHARACTER_NOT_OWNED`). 보유 중이어도 회수(`isActive=false`)된 캐릭터는 착용 불가(`CHARACTER_NOT_FOUND`). 이전 대표 해제 + 신규 착용은 단일 트랜잭션이며, 온보딩 선택·뽑기 지급과 동일한 유저 행 비관적 락으로 직렬화해 `is_selected` 유일성과 중복 보유 방지를 보장한다. 이미 착용 중 재선택은 무해(idempotent).
- 악세사리 착용 상태는 `userCharacterId`별로 유지한다. 같은 보유 악세사리를 여러 보유 캐릭터의 저장된 착장에 재사용할 수 있으며, 한 캐릭터 안에서는 같은 슬롯 1개와 같은 아이템 1개만 허용한다. 대표 캐릭터를 바꿔도 다른 캐릭터의 저장된 착장은 지우지 않는다.
- 악세사리 적용·해제의 소유권·종류 검증, 오류와 응답 정렬의 상세 계약은 [상점/아이템 API](../shop/api.md)를 따른다.
- 회수(`isActive=false`)된 캐릭터는 보유 중이어도 **목록에서 제외**한다. 보유 레코드 자체는 유지되며 뽑기 중복 환급 판정에는 계속 사용된다.
- `poses[]`는 관리자가 등록한 **활성 포즈만** `{ id, code, assetKey, sortOrder }` 형태로 `sortOrder` 오름차순(동순위 id 오름차순) 정렬해 내려간다. 마스터 목록(`GET /api/v1/characters`)과 보유 목록이 같은 계약을 쓴다. 등록된 포즈가 없으면 빈 배열.
- `animations`는 asset key 묶음 — `characters/{code}/animations/{idle|pose-cycle|wave}.webp` (무손실 애니메이션 WebP, 프레임 지연 보존). key는 `code`에서 파생되므로 **새 캐릭터를 마스터에 등록하기 전에 애니메이션 3종 적재가 전제 조건**이다. 클라이언트는 key를 유추하지 않고 응답 필드를 그대로 사용한다.
- `name`은 한국어 표기(예: 고양이, 호랑이). `code`는 영문 식별자로 불변.

## 어드민: 캐릭터 포즈 관리

`admin-api`의 세션 인증을 사용한다. 추가 포즈 카탈로그(`character_poses`)를 관리한다.

- `GET /admin/character-poses` — 전체 포즈 목록(캐릭터 `sortOrder` → 포즈 `sortOrder` → id 오름차순).
- `POST /admin/character-poses` — `(characterCode, code)` 기준 upsert(없으면 생성, 있으면 에셋·정렬·활성 갱신). asset key는 `characters/` 하위 이미지 패턴을 검증하고 S3 실존 확인 후 저장한다.
- `DELETE /admin/character-poses/{poseId}` — 포즈 row 삭제(S3 에셋 파일은 유지).
- `DELETE /admin/assets?key=` — `characters/` 하위 S3 에셋 삭제. DB에서 참조 중인 key(`characters.base_asset_key`·`character_poses.asset_key`)는 409로 거부하고, 삭제 전 `archive/admin-deleted/{timestamp}/`에 복구용 사본을 남긴다.

## 회원 기본 정보

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/me` | 내 기본 정보 + 온보딩 완료 여부 | res: `userId`, `nickname`, `bio`(nullable), `profileImageKey`(nullable), `lastAccessedAt`, `onboarding: { completed, primaryGoalId, selectedCharacterId }` | `users`, `user_goals`, `user_characters` |
| `PUT /api/v1/me` | 닉네임·소개글 수정 (JSON) | req: `nickname`(필수, 최대 30자), `bio?`(최대 100자) / res: `GET /api/v1/me`와 동일 형태 | `users` |
| `PUT /api/v1/me/profile-image` | 내 프로필 사진 등록·교체 (multipart 서버 직접 업로드) | req: multipart `file` / res: `profileImageKey` | `users` |
| `DELETE /api/v1/me/profile-image` | 내 프로필 사진 삭제 | res: 204 — `profile_image_key`를 null로 되돌림 | `users` |

- `PUT /api/v1/me`는 `nickname`이 항상 필수다(bio만 단독 수정 불가). `bio`는 null이면 **변경 없음**으로 처리해 bio를 null로 비울 수단이 없다 — 비우려면 빈 문자열을 보낸다. 닉네임·소개글은 금칙어 검사를 거친다 — 위반 시 각각 400 `MEMBER_NICKNAME_BANNED` / `MEMBER_BIO_BANNED`.
- 프로필 사진은 **서버 직접 업로드** — 클라이언트가 multipart `file`로 보내면 서버가 S3에 저장하고 asset key를 발급한다. key 규칙은 `profile/{uuid}.{ext}`(`image/jpeg`는 `.jpg`로 고정 매핑)이며, DB에는 전체 URL이 아닌 key(`users.profile_image_key`)만 저장한다. 클라이언트는 key를 유추하지 않고 응답 필드를 CDN base URL과 조합해 이미지 URL로 사용한다.
- 허용 포맷 `image/png|jpeg|webp`, 최대 10MB. 위반 시 `MEMBER_PROFILE_IMAGE_INVALID`(400). 단 multipart 자체 상한(12MB)을 넘는 요청은 컨트롤러 진입 전에 400 `FILE_TOO_LARGE`로 거부된다 — 10MB 초과~12MB 이하만 `MEMBER_PROFILE_IMAGE_INVALID`.
- `profileImageKey`가 null이면 프론트가 기본 이미지를 표시한다(미등록·삭제 후 상태).
- 프로필 사진은 `PUT /api/v1/me`(JSON)와 분리된 별도 엔드포인트다. 소유권은 인증된 본인(`user_id`) guard, 별도 파라미터 없음.
- 교체·삭제 시 기존 S3 객체는 지우지 않는다(orphan 객체 정리 정책은 후속 미정).

## 회원탈퇴

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `DELETE /api/v1/me` | 회원탈퇴 — soft delete + 개인정보 즉시 익명화 + 소셜 로그인 연동 해제(revoke) + 집 멤버십 정리·소유권 승계 | res: 204. 이미 탈퇴한 사용자는 404 `USER_NOT_FOUND` | `users`, `oauth_accounts`, `refresh_tokens`, `user_device_token`, `routines`, `todos`, `categories`, `house_members`, `house`, `house_join_requests` |

- 탈퇴는 단일 트랜잭션으로 처리한다: `users.deleted_at` 세팅(soft delete — hard delete 아님) + **개인정보 즉시 익명화**(`users.email`·`nickname`·`bio`·`profile_image_key`를 null 처리 — 유예기간 없음, 배치 없음) + 보유 중인 active `refresh_tokens` 전량 폐기(`revoked_at`) + `oauth_accounts` row 삭제 + FCM 토큰(`user_device_token`) 전량 삭제(탈퇴자에게 push가 가지 않도록) + 해당 회원의 루틴·투두·카테고리 연쇄 soft delete(아래 참고) + 집 멤버십·입주 신청 정리와 소유권 승계(아래 참고). 소유권은 인증된 본인(`user_id`) guard, 별도 파라미터 없음.
- **프로필 이미지는 S3 원본까지 삭제**한다 — `profile_image_key`를 익명화 전에 스냅샷해 두고, 트랜잭션 커밋 이후 best-effort로 삭제한다(provider revoke와 동일 경로). 삭제 실패는 로그만 남기고 탈퇴·익명화는 유지되며, key가 없는 회원은 호출하지 않는다.
- **루틴·투두·카테고리는 연쇄 soft delete한다** — 탈퇴 트랜잭션에서 해당 회원의 `routines`·`todos`·`categories`에 `deleted_at`을 일괄 세팅한다(이미 삭제된 row의 원래 삭제 시각은 보존). 완료 이력(`routine_logs`)·스트릭(`streaks`)·인증 사진은 보존한다 — 집 통계·방 성장 의존 가능성이 있어 완전 파기는 집 도메인 확인 후 별도 결정. 리마인더 배치는 루틴 soft delete로 탈퇴자가 자연 제외된다(별도 탈퇴 조건 없음).
- **집 도메인도 같은 트랜잭션에서 정리한다** (외부 API 호출이 없어 전부 트랜잭션 안):
  - **대기 중 입주 신청 철회** — 탈퇴자의 `PENDING` 입주 신청(`house_join_requests`)을 전부 `REJECTED`로 전환한다(철회 전용 상태 없이 기존 상태값 재사용).
  - **모든 ACTIVE 멤버십 LEFT 처리** — 참여 중인 모든 집에서 status=LEFT + `left_at` 기록, 각 집의 `current_member_count` 감소. 집 나가기·강퇴와 동일한 부수 정리로 그 집의 단체미션 루틴 연동(`routines.house_mission_id`)·카테고리 집 연동(`categories.house_id`)도 해제한다.
  - **소유 집은 자동 승계** — 남은 ACTIVE 멤버 중 **가입일(`house_members` 가입 시각)이 가장 오래된 멤버**에게 소유권을 이전한다(동률 시 membership id 오름차순 — 결정적 규칙). 집 나가기 API와 달리 양도 선행(`HOUSE_OWNER_MUST_TRANSFER`) 없이 진행된다.
  - **남은 멤버가 없으면 집 해체** — 집 soft delete(`deleted_at`). 해체된 집은 탐색에서 빠지고 그 집 초대코드(`house.invite_code`)로의 신규 가입도 불가.
  - 승인 경로의 동시성 방어(탈퇴자 신청 승인 시도 가드)는 [house/api.md](../house/api.md) "입주 신청 수락" 참고.
- **보존하는 것**: `last_accessed_at`(접속기록), revoked `refresh_tokens` row(해시만 저장, 비개인정보), 알림 내역(`notification`)·설정, `routine_logs`·`streaks`·인증 사진, `created_at`/`deleted_at`.
- **provider 연동 해제(revoke)는 트랜잭션 커밋 이후 best-effort**로 호출한다 — 외부 API 실패가 탈퇴를 롤백하지 않고, 실패는 로그만 남기며 재시도 없음. App Store 심사 가이드라인 5.1.1(v)의 소셜 자격증명 revoke 요구를 충족한다.
  - 카카오: Admin key 서버-투-서버 unlink — `POST https://kapi.kakao.com/v1/user/unlink`(`target_id_type=user_id`).
  - 애플: 로그인 시 저장해 둔 refresh token(암호화)으로 `https://appleid.apple.com/auth/revoke` 호출. 저장된 토큰이 없는 구(舊) 연동(authorizationCode 교환 도입 전 가입)은 revoke를 생략하고 warn 로그만 남긴다.
  - 구글: revoke 없음 — id token만 사용하고 서버가 access/refresh token을 보유하지 않아 revoke 대상이 없다. `oauth_accounts` row 삭제로 충족.
- **재가입은 즉시 허용**(유예기간 없음). `oauth_accounts` 삭제로 (provider, provider_user_id) unique 제약이 풀리므로, 재로그인하면 기존 신규 가입 플로우가 그대로 동작해 **새 user가 생성**된다. 옛 계정의 루틴·투두·재화·캐릭터는 soft delete된 옛 user에 남고 복원되지 않는다. 재로그인 차단이나 탈퇴 전용 에러코드는 없다.
- 탈퇴 계정의 잔여 토큰 차단: refresh 회전과 dev-login에서 `users.deleted_at`을 확인해 거부한다(응답 `code`는 각각 **`AUTH_REFRESH_TOKEN_INVALID`**, **`AUTH_USER_NOT_FOUND`** — auth 도메인 코드는 `AUTH_` prefix가 붙는다. 탈퇴 API 자체의 404는 prefix 없는 `USER_NOT_FOUND`로 별개 코드). 이미 발급된 access token의 잔여 창(만료 전 최대 30분)에서는 **내 정보 조회·수정·프로필 업로드·삭제를 미탈퇴 조건 조회로 401 차단**해, 잔여 토큰 재기입으로 익명화가 되돌려지지 않게 한다. **집 참여(초대코드 참여 등 가입 확정 경로)와 친구 초대코드 redeem도 같은 이유로 401 `AUTH_INVALID_TOKEN` 차단** — 잔여 토큰의 집 참여로 탈퇴 트랜잭션의 멤버십 정리(LEFT·정원 감소)가 되돌아가거나, 탈퇴 계정 지갑에 보상이 지급되는 것을 막는다. 그 외 쓰기 API(루틴 생성 등)의 30분 창은 stateless JWT의 수용한 한계다(logout과 동일 — 필터 레벨 차단은 블랙리스트 도입 논의와 함께 별도 결정).
- 익명화 후 길드북·방명록·집 미리보기 등 타 도메인에는 탈퇴 회원의 `nickname`이 null로 내려간다. 표시 문구("탈퇴한 회원" 등)는 프론트·집 도메인에서 확정한다(dependency → [open-questions.md](../../open-questions.md)).
- 탈퇴 회원 처리 중 이 도메인에서 확정하지 않는 잔여 dependency: 단체미션 `house_mission_participants` 정산·분모 처리, 길드북·방명록 등 탈퇴 회원 표시 문구(프론트 협의), `user_characters`/`user_items`/`user_wallets` 잔여 데이터 파기 (해당 도메인 dependency → [open-questions.md](../../open-questions.md)).

## 친구 초대 보상 (`user_invite_codes`, `invite_rewards`, → `user_wallets`)

| method · path | 목적 | 핵심 필드 | 관련 table |
| --- | --- | --- | --- |
| `GET /api/v1/invites/me` | 내 초대코드 조회(없으면 발급) | res: `inviteCode` | `user_invite_codes` |
| `POST /api/v1/invites/redeem` | 초대코드 입력(피초대자) — 양쪽 코인 지급 | req: `inviteCode` / res: 지급 결과 | `invite_rewards`, `user_wallets` |

- 보상은 **초대자 50 / 피초대자 50 코인**(50 = 가구 뽑기 단챠 2회분이자 루틴·투두 일일 보상 상한 하루치). 초대자 보상은 **10건 한도** — 초과하면 redeem 자체는 성공하되 초대자 몫만 0.
- redeem은 계정당 **평생 1회**(`invite_rewards` unique — 피초대자 기준). 에러코드: 없는 코드 404 `INVITE_CODE_NOT_FOUND`, 자기 코드 입력 400 `INVITE_SELF_NOT_ALLOWED`, 이미 사용 409 `INVITE_ALREADY_REDEEMED`.
- **탈퇴 계정 차단(양방향)**: 초대자가 탈퇴한 코드는 무효 코드와 동일하게 404 `INVITE_CODE_NOT_FOUND`, 본인이 탈퇴한 뒤 잔여 access token으로 redeem하면 401 `AUTH_INVALID_TOKEN` — 탈퇴 계정 지갑에 보상이 지급되는 경로를 양쪽 다 막는다. 탈퇴 시 코드 row 자체를 비활성화하지는 않는다(redeem 시점 가드로 충분).
- 집 초대코드(`house.invite_code`)와는 별개 체계다(그쪽은 집 도메인).

## 연동 (다른 도메인)

- 선택한 대표 캐릭터 → 개인 방 배치는 **방 도메인** (`GET /api/v1/rooms/me`).
- 선택한 목표 → 초기 루틴 추천은 **루틴/투두 도메인**, 집 탐색 필터는 **집 도메인**.
- 재화/지갑(`user_wallets`)은 이 도메인 비범위.

## 미정

- 에러 응답 형태·응답 envelope 사용 여부는 공통 미결정 ([open-questions.md](../../open-questions.md)).
- 시각 필드(`lastAccessedAt` 등) 직렬화가 현재 UTC `Z` 표기다 — 공통 규약("ISO-8601 + offset, Asia/Seoul 기준")과의 정합은 공통 미결정 ([open-questions.md](../../open-questions.md)).
