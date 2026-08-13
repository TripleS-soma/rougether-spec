# 운영 지원 (Support) — API

공통 규약은 [상위 api.md](../../api.md)를 따른다(prefix `/api/v1`, JSON, 이미지/에셋은 `*_key`, 목록은 `items` 배열, 인증된 사용자 기준 소유권 guard 적용).

## 버그 제보

유저가 앱에서 발견한 버그를 제출하고, 어드민이 처리 상태를 관리한다. 유저 답변·알림·페이지네이션은 후속. 제보 텍스트는 금칙어 검사를 하지 않는다(운영자만 보는 텍스트 — 차단으로 정보를 잃지 않기 위함).

### POST /api/v1/bug-reports
버그 제보 제출. multipart. → 201
- req: `title`(1~100자), `content`(1~2000자), `appVersion?`(최대 30자), `deviceInfo?`(최대 100자), `images`(선택, **최대 3장**, png/jpeg/webp·각 10MB — 요청 전체는 서버 multipart 상한 내)
- 스크린샷은 S3 `bug-reports/` prefix 로 서버가 업로드하고 storage_key 만 저장
- res: `bugReportId`, `title`, `content`, `status`(`RECEIVED` 로 시작), `screenshotKeys[]`, `createdAt`
- 예외: 이미지 4장 이상/비허용 형식/10MB 초과 → 400 `BUG_REPORT_IMAGE_INVALID`
- table: `bug_reports`, `bug_report_images`

### GET /api/v1/me/bug-reports
내 제보 목록. 본인 것만, 최신순, 페이지네이션 없음.
- res(items[]): 제출 응답과 동일 형식 — `status` 로 처리 현황(`RECEIVED` 접수 / `IN_PROGRESS` 확인 중 / `RESOLVED` 완료) 확인
- table: `bug_reports`, `bug_report_images`

### 어드민 (admin-api, 세션 인증)
- `GET /admin/bug-reports` — 전체 목록(최신순), `status?` 필터. 제보자 `userId`·`nickname` 포함
- `PATCH /admin/bug-reports/{id}/status` — 상태 변경(어드민만, 순서 강제 없음). 잘못된 상태 400 `BUG_REPORT_STATUS_INVALID`, 없는 제보 404 `BUG_REPORT_NOT_FOUND`

## 관련 table 요약

- **bug_reports**: id* | user_id→users | title VARCHAR(100) | content VARCHAR(2000) | app_version? | device_info? | status VARCHAR(30) | created_at | updated_at
- **bug_report_images**: id* | bug_report_id→bug_reports | storage_key VARCHAR(255) | sort_order INT
