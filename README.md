# rougether-spec

Rougether 팀의 **공유 계약(spec)** 저장소입니다. 프론트 · 백엔드가 함께 보고 합의하는 진실 소스를 도메인 중심으로 둡니다.

## 루트 문서

- **프로덕트 개요(PRD)** (비전·문제·타겟·KPI·수익) → [product.md](product.md) · 출처 기획서
- **전체 ERD / 데이터 모델** (25 table) → [erd.md](erd.md) · 출처 [ERDCloud](https://www.erdcloud.com/d/Qn9GqwdWnsqsiQQpi)
- **API 공통 규약** → [api.md](api.md)
- **전체 기능 인덱스** → [features.md](features.md) · 출처 [Notion](https://www.notion.so/MVP-3782b260870e80988962cc129f651b6f)
- **미결정 사항** → [open-questions.md](open-questions.md)

## 도메인

각 도메인은 `domains/<도메인>/` 아래에 **prd.md**(목적·가치) / **features.md**(기능 명세) / **api.md**(엔드포인트 초안)를 둡니다.

| 도메인 | 폴더 | 다루는 것 |
| --- | --- | --- |
| 회원 / 온보딩 | [domains/member/](domains/member/) | 목표·캐릭터 선택, 사용자 기본 |
| 루틴 / 투두 | [domains/routine-todo/](domains/routine-todo/) | 루틴·투두·카테고리, 완료·스트릭, 사진 인증 |
| 개인 방 | [domains/room/](domains/room/) | 방 성장, 아이템 배치, 스냅샷 |
| 상점 / 재화 | [domains/shop/](domains/shop/) | 아이템·인벤토리·구매, 코인/다이아 |
| 뽑기 | [domains/gacha/](domains/gacha/) | 테마별 뽑기, 보상 풀 |
| 공동 집 | [domains/house/](domains/house/) | 집 참여·관리·단체 미션·레벨 |

## 도메인 (MVP)

회원 · 루틴/투두 · 방(개인) · 뽑기 · 상점 · 집(공동). 재화는 **코인**(루틴 실천 보상)과 **다이아**(아이템 구매)로 구분.

## 작성 규칙

- 본문은 한국어. API path, JSON field, table/column 이름은 영어 유지.
- 안 정해진 건 본문에 묻지 말고 [open-questions.md](open-questions.md)에 모읍니다.
- 이미지/에셋은 전체 URL이 아니라 `*_key`(asset_key, cover_image_key, storage_key 등)로 참조합니다.
- 구현 상세(서버/프론트 작업 노트)는 각 구현 저장소의 `docs/`에 두고, 이 저장소는 **양쪽이 맞춰야 하는 계약만** 유지합니다.
