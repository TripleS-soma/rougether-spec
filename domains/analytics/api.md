# 제품 지표 API

관리자 세션과 `ADMIN` 또는 `SUPER_ADMIN` 권한이 필요하다. 사용자 JWT로는 접근할 수 없다.

## 리텐션·북극성·행동 지표 조회

### `GET /admin/retention/metrics?cohortDays=35`

- `cohortDays`: 반환할 최근 가입 코호트 날짜 수. 기본 35, 허용 범위 1~90. 범위를 벗어나면 서버가 경계값으로 제한한다.
- 성공: `200 OK`
- 미인증: 로그인 화면으로 redirect
- 권한 없음: `403 Forbidden`

응답은 다음 정보를 직접 반환한다.

- `asOfDate`: 계산 기준 KST 날짜
- `generatedAt`: 생성 시각
- `cohortPeriod`: 조회에 포함한 KST 가입 코호트 기간
- `retention`: 인증 user-api 요청을 활동으로 삼은 exact-day D1/D7/D30 전체 요약. 각 항목은 반환 사용자 수, 성숙 코호트의 대상 사용자 수와 비율을 포함
- `northStar`: 최근 7일 기간, 전체 실사용자 수, 3일 이상 실제 완료 사용자 수와 비율
- `retentionCohorts[]`: 가입일, 코호트 사용자 수, D1/D7/D30 재방문 사용자 수와 비율. 미성숙 지표는 `null`
- `segments[]`: `OVERALL`·`PERSONAL`·`SHARED`별 사용자 수, 완료/전체 로그 수와 완료율, 평균 현재 스트릭, 재시작 대상/재시작 사용자 수와 재시작률
  - `completionRate.period`: 오늘을 제외한 종료된 최근 30일
  - `restartRate.period`: 조회일을 포함한 최근 30일

비율 필드는 0~100 범위이고 소수 첫째 자리로 반올림한다. 분모가 0이면 `0.0`이다.
