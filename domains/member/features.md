# 회원 / 온보딩 기능 명세

출처: 전체 [features.md](../../features.md) "회원" 섹션. 데이터는 [erd.md](../../erd.md)를 따른다.

관련 table: `users`, `goals`, `user_goals`, `characters`, `user_characters`.

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
| 캐릭터 목록 조회 | 제공 캐릭터(6개) 노출. `is_active = true`만, `sort_order` 정렬. 에셋은 `base_asset_key`(key)로 내려줌. | `characters` |
| 기본 캐릭터 무료 선택 | 6개 중 하나를 기본 캐릭터로 **무료** 선택해 대표로 저장. 온보딩에서는 1개만 무료. | `user_characters` (`user_id`, `character_id`) |
| 대표 캐릭터 표시 | 현재 대표 캐릭터를 `is_selected`로 표시. 선택 시 `acquired_at` 기록. | `user_characters.is_selected`, `user_characters.acquired_at` |
| 선택 캐릭터 조회 | 사용자의 대표 캐릭터 조회(개인 방 배치 입력으로 사용). | `user_characters`, `characters` |

- 선택한 대표 캐릭터는 개인 방에 배치된다. **배치 렌더링은 방 도메인** 담당, 이 도메인은 "어떤 캐릭터를 골랐는지"까지 책임진다.
- 온보딩에서는 6개 중 **기본 1개만 무료**로 획득한다. **나머지 캐릭터는 캐릭터 뽑기로 획득**하며, 뽑기로 얻은 캐릭터도 `user_characters`로 기록된다. (뽑기 머신·환급 로직은 [뽑기 도메인](../gacha/features.md) 담당)
- 캐릭터 에셋은 전체 URL이 아니라 `characters.base_asset_key`(key)로 참조한다.

## 회원 기본 정보

| 하위 기능 | 설명 | 관련 table |
| --- | --- | --- |
| 내 정보 조회 | 닉네임·마지막 접속 등 기본 정보 + 온보딩 완료 여부(목표·캐릭터 선택 존재) 조회. | `users`, `user_goals`, `user_characters` |

- `users`: `nickname`, `last_accessed_at`, `created_at`, `updated_at`, `deleted_at`(soft delete).
- 인증/인가 MVP 포함(소셜 로그인 카카오·구글·애플). `me`는 인증된 사용자를 가리킨다. 로그인/회원가입은 회원 도메인 담당.

## 의존성 / 미정

- 재화/지갑(`user_wallets`), 루틴 추천, 방 배치, 집 탐색은 **다른 도메인**. 여기서는 다루지 않는다.
- 닉네임 입력 단계 위치, 목표 선택 개수 상한, 캐릭터 변경 허용 여부 — **미정** ([prd.md](prd.md) 참고).
