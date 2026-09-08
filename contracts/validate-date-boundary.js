#!/usr/bin/env node
// contracts/date-boundary-cases.json 자체 검증기 (의존성 없음, Node 18+).
// 각 case의 expectedDate / naive.* 값을 instant + 시간대에서 다시 계산해 손으로 적은 값과 어긋나면 실패한다.
// 용법: node contracts/validate-date-boundary.js
const fs = require('node:fs');
const path = require('node:path');

const FIXTURE = path.join(__dirname, 'date-boundary-cases.json');
const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

function dateIn(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function verdict(date, expected) {
  return date === expected ? 'TODAY' : date < expected ? 'PAST' : 'FUTURE';
}

const errors = [];
const ids = new Set();
for (const c of fixture.cases) {
  const where = `case ${c.id}`;
  if (ids.has(c.id)) errors.push(`${where}: id 중복`);
  ids.add(c.id);
  if (Number.isNaN(Date.parse(c.instant))) errors.push(`${where}: instant 파싱 실패`);
  const expected = dateIn(c.instant, fixture.zone);
  if (c.expectedDate !== expected) errors.push(`${where}: expectedDate ${c.expectedDate} ≠ 계산값 ${expected}`);
  if (new Date(c.kstClock).getTime() !== new Date(c.instant).getTime())
    errors.push(`${where}: kstClock 이 instant 와 다른 순간을 가리킴`);
  const utc = dateIn(c.instant, 'UTC');
  if (c.naive.utcTruncated.date !== utc) errors.push(`${where}: naive.utcTruncated.date ${c.naive.utcTruncated.date} ≠ ${utc}`);
  if (c.naive.utcTruncated.verdict !== verdict(utc, expected))
    errors.push(`${where}: naive.utcTruncated.verdict 불일치`);
  const device = dateIn(c.instant, c.deviceTimeZone);
  if (c.naive.deviceLocal.date !== device) errors.push(`${where}: naive.deviceLocal.date ${c.naive.deviceLocal.date} ≠ ${device}`);
  if (c.naive.deviceLocal.verdict !== verdict(device, expected))
    errors.push(`${where}: naive.deviceLocal.verdict 불일치`);
}

// fixture가 실제로 경계를 밟는지(대조군만 있으면 테스트에 이빨이 없다)
const hasUtcDrift = fixture.cases.some((c) => c.naive.utcTruncated.verdict !== 'TODAY');
const hasDevicePast = fixture.cases.some((c) => c.naive.deviceLocal.verdict === 'PAST');
const hasDeviceFuture = fixture.cases.some((c) => c.naive.deviceLocal.verdict === 'FUTURE');
if (!hasUtcDrift) errors.push('UTC 절단이 전날을 만드는 case가 없음');
if (!hasDevicePast) errors.push('단말 로컬 날짜가 과거가 되는 case가 없음');
if (!hasDeviceFuture) errors.push('단말 로컬 날짜가 미래가 되는 case가 없음');

if (errors.length > 0) {
  console.error(`date-boundary-cases.json 검증 실패 (${errors.length}건)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`date-boundary-cases.json OK — ${fixture.cases.length} cases, zone ${fixture.zone}`);
