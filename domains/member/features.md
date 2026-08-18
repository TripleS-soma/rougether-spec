# 회원 / 온보딩 기능 명세

출처: 전체 [features.md](../../features.md) "회원" 섹션. 데이터는 [erd.md](../../erd.md)를 따른다.

관련 table: `users`, `goals`, `user_goals`, `characters`, `user_characters`, `user_character_accessories`.

## 온보딩 · 목표 선택

| 하위 기능 | 설명 | 관련 table |
| --- | --- | --- |
| 목표 목록 조회 | 운동/공부/수면/독서/정리/취업 준비 등 제공 목표를 노출. `is_active = true`만, `sort_order` 정렬. | `goals` |
| 목표 선택 저장 | 사용자가 고른 목표를 사용자별로 저장. 하나 이상 선택. | `user_goals` (`user_id`, `goal_id`) |
| 대표 목표 지정 | 선택한 목표 중 대표 하나를 표시(초기 추천 우선 기준). | `user_goals.is_primary` |
| 선택 목표 조회 | 사용자가 현재 선택한 목표 목록 조회. | `user_goals`, `goals` |

- `goals`는 운영이 관리하는 마스터(코드/이름). 사용자 선택은 `user_goals`로만 기록한다.
- 선택값은 이후 AI 맞춤 추천·집 탐색 필터의 입력. 추천/필터 로직은 이 도메인 범위 밖(루틴/투두·집 도메인).

## 온보딩 · 캐릭터 선택

| 하위 기능 | 설명 | 관련 table |
| --- | --- | --- |
| 캐릭터 목록 조회 | 제공 캐릭터(8개) 노출. `is_active = true`만, `sort_order` 정렬. 에셋은 `base_asset_key`(key)로 내려줌. | `characters` |
| 기본 캐릭터 무료 선택 | 8개 중 하나를 기본 캐릭터로 **무료** 선택해 대표로 저장. 온보딩에서는 1개만 무료. | `user_characters` (`user_id`, `character_id`) |
| 대표 캐릭터 표시 | 현재 대표 캐릭터를 `is_selected`로 표시. 선택 시 `acquired_at` 기록. | `user_characters.is_selected`, `user_characters.acquired_at` |
| 선택 캐릭터 조회 | 사용자의 대표 캐릭터 조회(개인 방 배치 입력으로 사용). | `user_characters`, `characters` |
| 캐릭터별 악세사리 착장 | 보유 캐릭터마다 슬롯별 마지막 착용을 저장하고 목록·방 응답에 포함. 대표 캐릭터를 바꿔도 각 착장을 유지. | `user_character_accessories`, `user_items`, `items` |

- 선택한 대표 캐릭터는 개인 방에 배치된다. **배치 렌더링은 방 도메인** 담당, 이 도메인은 "어떤 캐릭터를 골랐는지"까지 책임진다.
- 온보딩에서는 8개 중 **기본 1개만 무료**로 획득한다. **나머지 캐릭터는 캐릭터 뽑기로 획득**하며, 뽑기로 얻은 캐릭터도 `user_characters`로 기록된다. (뽑기 머신·환급 로직은 [뽑기 도메인](../gacha/features.md) 담당)
- 캐릭터 에셋은 전체 URL이 아니라 `characters.base_asset_key`(key)로 참조한다.
- 같은 보유 악세사리는 여러 보유 캐릭터의 저장된 착장에 재사용할 수 있다. 한 캐릭터 안에서는 같은 슬롯 1개와 같은 아이템 1개만 허용하며, 적용·해제 상세는 [상점/아이템 기능](../shop/features.md)이 담당한다.

## 회원 기본 정보

| 하위 기능 | 설명 | 관련 table |
| --- | --- | --- |
| 내 정보 조회 | 닉네임·프로필 사진 key·마지막 접속 등 기본 정보 + 온보딩 완료 여부(목표·캐릭터 선택 존재) 조회. | `users`, `user_goals`, `user_characters` |
| 닉네임·소개글 수정 | `PUT /api/v1/me`(JSON) — `nickname`(필수, 30자)·`bio`(선택, 100자) 수정. 금칙어 검사(`MEMBER_NICKNAME_BANNED`/`MEMBER_BIO_BANNED`). | `users.nickname`, `users.bio` |
| 프로필 사진 등록·삭제 | multipart 파일을 서버가 S3에 직접 업로드하고 key(`profile/{uuid}.{ext}`)를 저장. 삭제 시 key를 null로 되돌림(null = 기본 이미지). png/jpeg/webp, 최대 10MB. | `users.profile_image_key` |
| 친구 초대 보상 | 내 초대코드 발급·조회, 피초대자 redeem 시 초대자·피초대자 각 50코인(초대자 한도 10건, 피초대자 평생 1회). | `user_invite_codes`, `invite_rewards` |
| 회원탈퇴 | soft delete(`deleted_at`) + 개인정보(email·nickname·bio·profile_image_key) 즉시 익명화 + refresh token 전량 폐기 + oauth 연동 삭제 + FCM 토큰 삭제 + 루틴·투두·카테고리 연쇄 soft delete(완료 이력·스트릭 보존) + 집 정리(모든 ACTIVE 멤버십 LEFT·정원 감소·pending 입주 신청 철회, 소유 집은 가입일 최선임 멤버에게 승계 — 멤버 없으면 집 해체)를 단일 트랜잭션으로, provider 연동 해제(카카오 unlink·애플 revoke)와 프로필 S3 원본 삭제는 커밋 후 best-effort. 재가입은 즉시 허용 — 재로그인 = 신규 가입(새 user, 옛 데이터 미복원). | `users.deleted_at`, `refresh_tokens`, `oauth_accounts`, `user_device_token`, `routines`, `todos`, `categories`, `house_members`, `house`, `house_join_requests` |

- `users`: `nickname`, `bio`, `profile_image_key`, `last_accessed_at`, `created_at`, `updated_at`, `deleted_at`(soft delete).
- 인증/인가 MVP 포함(소셜 로그인 카카오·구글·애플). `me`는 인증된 사용자를 가리킨다. 로그인/회원가입은 회원 도메인 담당.
- 탈퇴 상세 계약(익명화 범위·S3 삭제·연쇄 soft delete·revoke 방식·잔여 토큰 차단·타 도메인 dependency)은 [api.md](api.md) "회원탈퇴" 참고.

## 동거 봇 계정

초기 진입자가 빈 집이 아니라 "함께 루틴을 수행하는 동거인"과 시작할 수 있도록, 서버가 규칙 기반 봇 계정을 만들어 둔다. 봇은 로그인하지 않는 `users` 행이며(LLM 없음), 별도 테이블 없이 `users.is_bot`·`users.bot_key`로 일반 회원과 구분한다.

| 하위 기능 | 설명 | 관련 table |
| --- | --- | --- |
| 봇 계정 시드 | 서버 기동 시 코드 프로필 카탈로그(**6명 고정**)를 `bot_key` 기준으로 멱등 동기화. 없으면 유저·지갑(초기 코인 100, 일반 가입과 동일 경로)·목표 1~2개·대표 캐릭터·카테고리 1개·루틴 4개(반복 DAILY, 알림 없음)·가구 6~8개 지급·개인 방 배치까지 한 트랜잭션(봇 1명 = 트랜잭션 1개)으로 생성. 이미 있으면 닉네임·bio 변경분만 갱신. | `users`, `user_wallets`, `wallet_histories`, `user_goals`, `user_characters`, `categories`, `routines`, `user_items`, `personal_rooms`, `room_item_placements` |
| 로그인 불가 | 봇은 `oauth_accounts`가 없어 소셜 로그인·refresh 경로가 원천 차단되고, dev-login으로 봇 `userId`를 지정해도 401 `AUTH_BOT_LOGIN_NOT_ALLOWED`. | `users`, `oauth_accounts` |
| KPI·보상·알림·배치 격리 | 관리자 유저 관측(요약 카운트·목록·온보딩 완료 카운트)·AI 주간 회고 대상·리마인더 배치·거미줄 배치에서 제외, 친구 초대 보상 참여 불가, 봇 수신자 알림은 저장·push 모두 생략. 상세는 아래 참고. | `users.is_bot` |

- **활성화 스위치**: `rougether.bots.enabled`(기본 **false**). 꺼져 있으면 시드가 돌지 않는다(테스트 컨텍스트도 false). 봇 격리·활동 규칙이 갖춰진 배포 환경에서만 켠다.
- **프로필 카탈로그**: 봇마다 `bot_key`·닉네임·bio·목표 code 1~2개·대표 캐릭터 code·루틴 4개(이름·카테고리명)·활동 프로필(MORNING 06–09/12–13 · EVENING 18–23 · SPREAD 08–22, 각 2명)·방 프리셋 3개를 코드 상수로 둔다. 목표 code가 활성 마스터에 없으면 첫 활성 목표, 캐릭터 code가 없으면 순번으로 대체한다. 닉네임 금칙어는 시드 시 warn 로그만(차단하지 않음).
- **가구 시드**: 게시(published) 카탈로그의 positioned 가구·소품 6~8개를 보유로 지급하고, 개인 방은 `FREE_V1` 프리셋 1번 좌표로 배치한다(프리셋 2·3은 후속 활동 규칙에서 순환).
- **반쪽 봇 금지**: 활성 목표·활성 캐릭터·게시 positioned 가구(6개 미만) 중 하나라도 비면 그 봇은 **생성 자체를 건너뛴다**(항목만 빼고 만들지 않음 — 다음 기동에서 온전히 생성). soft delete 된 봇은 되살리지 않고 건너뛴다.
- **온보딩 완료 판정**: 시드가 목표 1개 + 대표 캐릭터 선택을 채우므로 봇도 온보딩 완료로 판정된다. 그래서 온보딩 완료 카운트 등 관측 지표는 `is_bot=false` 조건으로 봇을 뺀다.
- **봇 자신의 기록은 정상**: 봇의 지갑·스트릭·완료 로그는 일반 회원과 같이 기록된다(봇 방·데이 뷰에 보여야 함). 코인은 쌓이기만 하고 사용 경로가 없다.
- **격리 범위(전부 적용, 예외 없음)**:
  - 관리자 유저 관측 — 요약 카운트·목록 검색·온보딩 완료 카운트에서 `is_bot=false`. 목록은 계정 상태 필터값 `BOT`으로만 봇을 따로 본다(기본 ACTIVE는 봇 제외).
  - AI 주간 회고 — 생성 대상·관측 count에서 봇 제외(봇 로그로 LLM 호출 금지).
  - 친구 초대 보상 — 봇은 초대코드 발급 불가, 초대자·피초대자 어느 쪽이 봇이어도 redeem 거부(403 `INVITE_BOT_NOT_ALLOWED`) → [api.md](api.md) "친구 초대 보상".
  - 알림 — 수신자가 봇이면 알림 내역 저장·push 모두 생략 → [notification/api.md](../notification/api.md).
  - 리마인더 배치(루틴·투두)·거미줄 배치 — 대상에서 `is_bot=false`(봇은 로그인하지 않아 `last_accessed_at`이 오르지 않으므로 거미줄은 제외 필수) → [room/features.md](../room/features.md).
  - 집 탐색 — ACTIVE 멤버가 봇뿐인 집은 노출하지 않음 → [house/api.md](../house/api.md).
  - 탈퇴 정리 배치 — 봇은 탈퇴 경로가 없어 영향 없음. 클라이언트 애널리틱스(GA4·PostHog)는 모바일 이벤트라 봇이 발생시키지 않음(서버 조치 없음).
- **표시 정책**: 봇 닉네임에 "(봇)" 같은 접미를 붙이지 않는다. 봇 여부 표시는 후속(집 구성원·방명록 응답의 `bot` 필드 + 모바일 배지, 서버 #309)에서 확정한다.
- 봇의 기본 집 자동 입주·자리 양보·해체 규칙(서버 #309), 활동 스케줄러(루틴 완료·미션 기여·응원·방명록·거미줄 청소·레이아웃 순환, 서버 #310)는 **구현 예정** — 이 문서에는 아직 계약이 없다 → [open-questions.md](../../open-questions.md) "동거 봇".

## 의존성 / 미정

- 재화/지갑(`user_wallets`), 루틴 추천, 방 배치, 집 탐색은 **다른 도메인**. 여기서는 다루지 않는다.
- 닉네임 입력 단계 위치, 목표 선택 개수 상한, 캐릭터 변경 허용 여부 — **미정** ([prd.md](prd.md) 참고).
