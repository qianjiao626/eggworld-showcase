const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const csv = fs.readFileSync('tasks/2026-09-25_宿舍平台检索队列.csv', 'utf8').replace(/^\uFEFF/, '');
const lines = csv.trim().split(/\r?\n/);
const header = lines.shift();
const rows = lines.map((line) => line.split(','));

test('full directory platform queue covers every unique school and platform', () => {
  assert.match(header, /^学校,平台,检索词,搜索入口,证据状态,处理规则$/);
  assert.equal(rows.length, 2321 * 8);
  assert.equal(new Set(rows.map((row) => row[0])).size, 2321);
  assert.equal(new Set(rows.map((row) => row[1])).size, 8);
  assert.ok(rows.every((row) => /^https?:\/\//.test(row[3])));
  assert.ok(rows.every((row) => row[4] === '待人工核验'));
  assert.ok(rows.every((row) => row[5].includes('不得直接当作校方事实')));
});
