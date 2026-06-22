# rougether-spec

Rougether 팀의 **공유 계약(spec)** 저장소입니다. 프론트 · 백엔드가 함께 보고 합의하는 최소한의 진실 소스만 둡니다.

- **기능 명세** (도메인별 기능) → [features.md](features.md) · 출처 [Notion](https://www.notion.so/MVP-3782b260870e80988962cc129f651b6f)
- **ERD / 데이터 모델** (25 table) → [erd.md](erd.md) · 출처 [ERDCloud](https://www.erdcloud.com/d/Qn9GqwdWnsqsiQQpi)
- **API 계약** (공통 규약 + 도메인 엔드포인트) → [api.md](api.md)
- 아직 안 정해진 것들 → [open-questions.md](open-questions.md)

> 구현 상세(서버 작업 지침, 프론트 연동 노트)는 각 구현 저장소의 `docs/`에 둡니다. 이 저장소는 **양쪽이 맞춰야 하는 계약만** 가볍게 유지합니다.

## 도메인 (MVP)

회원 · 루틴/투두 · 방(개인) · 뽑기 · 상점 · 집(공동). 재화는 **코인**(루틴 실천 보상)과 **다이아**(아이템 구매)로 구분.

## 작성 규칙

- 본문은 한국어. API path, JSON field, table/column 이름은 영어 유지.
- 안 정해진 건 본문에 묻지 말고 [open-questions.md](open-questions.md)에 모읍니다.
- 이미지/에셋은 전체 URL이 아니라 `*_key`(asset_key, cover_image_key, storage_key 등)로 참조합니다.
