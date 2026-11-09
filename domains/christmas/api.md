# 크리스마스 이벤트 API

사용자 JWT principal 기준이며 prefix `/api/v1`다. 사용자 ID를 body로 받지 않는다. 기간은 2026-11-09~12-25 KST(양 끝 날짜 포함)다.

## GET /api/v1/events/christmas

```json
{
  "code": "christmas_2026",
  "title": "크리스마스",
  "active": false,
  "startsOn": "2026-11-09",
  "endsOn": "2026-12-25",
  "gachaId": null,
  "attendanceEventId": null,
  "popupDismissed": false
}
```

- HTTP 200 metadata다. 플래그 OFF/기간 밖에도 조회하고 `active=false`로 안전하게 자동 노출을 생략한다. `gachaId`/`attendanceEventId`는 실제 서버 데이터가 있으면 반환하고 없으면 null이다. 숫자 ID를 클라이언트에 고정하지 않는다.
- `active`는 `CHRISTMAS_EVENT_ENABLED`, KST 기간, 활성 CUMULATIVE 출석 데이터, 뽑기 머신/테마 활성과 기간, 크리스마스/일반 **양 그룹의 모든 양수 확률 티어 준비**를 함께 검사하는 all-ready gate다. 구성 오류나 미준비 상태이면 false로 자동 노출을 생략한다. 실제 draw 시에도 같은 구성 검증을 다시 수행한다.
- `popupDismissed`는 해당 계정과 안정적인 코드 `christmas_2026`에 저장된 영구 숨김 여부다. 이는 출석판/뽑기 접근 권한이 아니라 안내 팝업 자동 노출 상태다.

## POST /api/v1/events/christmas/popup-dismissal

body 없음, 성공 204. 사용자 행 잠금과 unique `(user_id,event_code)` 아래 멱등 저장한다. 이미 숨긴 요청도 성공하고 문구/이미지 수정으로 초기화하지 않는다. 계정 단위로 재로그인/재설치/다른 기기에도 유지하며 회원탈퇴 soft delete 트랜잭션에서도 즉시 파기한다. 기간/공개 플래그와 무관하게 본인 숨김 상태 저장만 수행하며 보상이나 알림 발송은 없다.

클라이언트는 204 뒤에만 영구 숨김 성공을 표시한다. 실패하면 재시도하고 자동 노출 전에 서버 상태와 맞춘다. 직접 이벤트 진입, 다음 날 출석판에는 영향을 주지 않는다.

## 연결 API

- 누적 출석: `GET /api/v1/events/attendance/{attendanceEventId}`, `POST /api/v1/events/attendance/{attendanceEventId}/check-ins` — [출석 API](../attendance/api.md).
- 뽑기: **기존** `GET /api/v1/gacha/{gachaId}/rewards`, `POST /api/v1/gacha/{gachaId}/draw` — [뽑기 API](../gacha/api.md). 전용 새로운 draw endpoint는 없다.
- 출석 상태는 종료 후 GET 가능, 종료 뒤 POST 출석/뽑기는 거절한다. 실제 지급 결과는 서버 응답과 지갑/보유함 재조회로 확인한다.

## 운영 게이트

`christmas.event.enabled=${CHRISTMAS_EVENT_ENABLED:false}`는 기본 OFF다. 가구 배치 보너스는 이 플래그와 별도 `CHRISTMAS_COIN_BONUS_ENABLED`가 **모두 true**여야 적용된다. 공통 이벤트 플래그 OFF로 팝업 자동 노출, 신규 출석, 전용 뽑기와 배치 보너스를 함께 중단한다. 이벤트 ON만으로 보너스가 켜지지는 않으며 일일 원금 100코인 한도는 플래그와 무관하게 유지한다. 서버 전체 버전 전환, 데이터/풀/기간 확인, 새 iOS 빌드 검증 후 승인된 운영 공개 절차에서 활성화한다. migration/문서 추가는 오픈 증거가 아니다. 실제 사용자 알림 발송은 하지 않는다.
