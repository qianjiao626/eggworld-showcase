'use strict';
/*
 * 回归（2026-10-06 实测缺陷）：chatroom.js / chatroom.css 内容改了，但 index.html 里的 ?v= 仍是旧日期，
 * 而线上 /js/* 是 Cache-Control: max-age=604800（7 天）、index.html 是 no-cache ——
 * 回过站的浏览器会出现「新 HTML + 旧 JS/CSS」混用，正是 !22 要修的那类错位。
 * 这里钉住：内容变更的模块必须同时升版本号，且同一模块的 js/css 版本号要一致。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'growth-schoolv3.html'), 'utf8');

function versionOf(file) {
  const m = html.match(new RegExp('js/' + file.replace('.', '\\.') + '\\?v=(\\d+)'));
  return m ? m[1] : null;
}

test('chatroom.js / chatroom.css 必须带且同步 ?v= 版本号，且不能再停在 20260927', () => {
  const js = versionOf('chatroom.js');
  const css = versionOf('chatroom.css');
  assert.ok(js, 'chatroom.js 必须带 ?v= 版本号');
  assert.ok(css, 'chatroom.css 必须带 ?v= 版本号');
  assert.notStrictEqual(js, '20260927', 'chatroom.js 内容已变，?v= 不能还是 20260927');
  assert.notStrictEqual(css, '20260927', 'chatroom.css 内容已变，?v= 不能还是 20260927');
  assert.strictEqual(js, css, '同一模块的 js 与 css 版本号必须一致');
});

test('本批新增模块的外联资源都带 ?v= 版本号', () => {
  const files = [
    'announcements.js', 'announcements.css',
    'gossip-reports.js', 'gossip-reports.css',
    'career-test.js', 'pet-system.js', 'cat-system.js',
    'admin-task-manage.js',
  ];
  for (const file of files) {
    assert.ok(versionOf(file), file + ' 必须带 ?v= 版本号');
  }
});
