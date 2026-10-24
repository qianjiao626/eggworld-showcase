// Run with playwright-cli run-code --filename tests/dormitory-upload.browser.js.
// Serve this repository at http://127.0.0.1:4173. All API calls are mocked;
// external requests are blocked. This is a real-browser UI test, not backend E2E.
async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const posts = [], errors = [], results = [];
  let postMode = 'success', releasePost, mineFails = false, mineMode = 'normal';
  const mineReads = [], mineReleases = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.unrouteAll({ behavior: 'wait' });
  await page.addInitScript(() => { window.EGGWORLD_API_BASE = ''; });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      if (url.origin === 'http://127.0.0.1:4173') return route.continue();
      return route.abort();
    }
    const json = (status, code, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code, data }) });
    if (request.method() === 'POST' && /^\/api\/dormitories(?:\/notes)?$/.test(url.pathname)) {
      posts.push({ path: url.pathname, headers: request.headers(), body: request.postDataBuffer().toString('utf8') });
      const mode = postMode;
      if (mode === 'deferred') await new Promise(resolve => { releasePost = resolve; });
      if (mode === 'non-JSON') return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>gateway error</html>' });
      if (mode === 'HTTP401') return json(401, 401, null);
      if (mode === 'HTTP500') return json(500, 200, null);
      if (mode === 'HTTP413') return json(413, 200, null);
      return json(200, 200, null);
    }
    if (url.pathname.startsWith('/api/dormitories/mine')) {
      mineReads.push(request.headers().authorization || '');
      if (mineFails) return json(500, 500, null);
      if (mineMode === 'deferred401') {
        await new Promise(resolve => mineReleases.push(resolve));
        return json(401, 401, null);
      }
      if (mineMode === 'newRecords') return json(200, 200, [{ schoolName: '新账号学校', content: '新账号的文字', status: 'pending' }]);
    }
    const data = url.pathname === '/api/dormitories' ? { facilities: '本地模拟动态资料', images: [] }
      : url.pathname === '/api/dormitories/notes' ? [{ content: '本地模拟：游客能阅读已审核的文字。' }]
      : /\/(posts|tasks|notifications)/.test(url.pathname) ? { records: [], total: 0, unread: 0 } : [];
    return json(200, 200, data);
  });
  await page.goto('http://127.0.0.1:4173/growth-schoolv3.html');
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); go('dormitories'); });
  await page.locator('#dormitorySchoolSearch').fill('北京大学');
  await page.locator('.dormitory-school-card[data-school="北京大学"]').click();
  await page.locator('.dormitory-source-content').waitFor();
  await page.waitForFunction(() => document.querySelector('.dormitory-notes')?.textContent.includes('游客能阅读'));
  assert(await page.locator('.dormitory-source-content').isVisible(), 'inline source content hidden');
  assert((await page.locator('.dormitory-source-content').innerText()).includes('四人一间'), 'PKU source account missing');
  assert(!await page.locator('.dormitory-source-details').evaluate(el => el.open), 'provenance must be optional/collapsed');
  assert(!await page.locator('.dormitory-source-details a').isVisible(), 'reading source content should not require opening an external link');
  results.push('guest source and approved text readable without navigation');

  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    const layout = await page.evaluate(() => ({
      width: innerWidth, documentWidth: document.documentElement.scrollWidth,
      clipped: [...document.querySelectorAll('#page-dormitories *')].filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
      }).map(el => el.id || el.className)
    }));
    assert(layout.documentWidth <= width + 1 && layout.clipped.length === 0, 'clipped layout at ' + width + ': ' + JSON.stringify(layout));
    await page.locator('.dormitory-source-content').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/playwright/dormitory-source-' + width + '.png' });
    results.push('layout ' + width + 'px');
  }

  const note = page.locator('#dormitoryNoteContent'), noteStatus = page.locator('#dormitoryNoteStatus');
  const photo = page.locator('#dormitoryPhotoInput'), photoStatus = page.locator('#dormitoryUploadStatus');
  const file = { name: 'room.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDykAAAAASUVORK5CYII=', 'base64') };
  await note.fill('游客草稿');
  await photo.setInputFiles(file);
  await page.locator('#dormitoryNoteSubmit').click();
  await page.locator('#dormitoryUploadButton').click();
  assert(posts.length === 0, 'guest write reached API');
  assert((await noteStatus.innerText()).includes('登录') && (await photoStatus.innerText()).includes('登录'), 'guest prompt missing');
  await page.evaluate(() => { USER.registered = true; USER.role = 'student'; sessionStorage.setItem('token', 'mock-token'); });

  for (const mode of ['non-JSON', 'HTTP500']) {
    postMode = mode;
    await note.fill('失败后应该保留的文字');
    await page.locator('#dormitoryNoteSubmit').click();
    await page.waitForFunction(() => !document.getElementById('dormitoryNoteSubmit').disabled);
    assert(await note.inputValue() === '失败后应该保留的文字', mode + ' cleared text draft');
    assert((await noteStatus.innerText()).includes('未确认成功'), mode + ' falsely reported success');
    results.push('note ' + mode + ' preserves draft');
  }
  postMode = 'HTTP413';
  await photo.setInputFiles([file, { ...file, name: 'room2.png' }]);
  await page.locator('#dormitoryUploadButton').click();
  await page.waitForFunction(() => !document.getElementById('dormitoryUploadButton').disabled);
  assert(await photo.evaluate(el => el.files.length) === 2, 'failed upload cleared native FileList');
  assert((await photoStatus.innerText()).includes('未确认成功'), '413 falsely reported success');
  const multipart = posts[posts.length - 1];
  assert(multipart.headers['content-type'].includes('multipart/form-data; boundary='), 'browser multipart boundary missing');
  assert(multipart.body.includes('room.png') && multipart.body.includes('room2.png'), 'multipart dropped files');
  await photoStatus.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/dormitory-upload-retained.png' });
  results.push('413 preserves both native selected files');

  for (const kind of ['note', 'photo']) {
    postMode = 'deferred'; releasePost = null;
    const buttonId = kind === 'note' ? 'dormitoryNoteSubmit' : 'dormitoryUploadButton';
    const status = kind === 'note' ? noteStatus : photoStatus;
    const before = posts.length;
    await page.locator('#' + buttonId).click();
    await page.waitForFunction(id => document.getElementById(id).disabled, buttonId);
    await page.locator('#' + buttonId).dispatchEvent('click');
    await page.evaluate(() => { loadDormitoryProfile('兰州大学'); loadDormitoryProfile('北京大学'); });
    // Release only after the intercepted POST is waiting, not merely after disabled=true.
    for (let i = 0; !releasePost && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert(typeof releasePost === 'function', 'POST did not reach the local mock');
    releasePost();
    await page.waitForFunction(id => !document.getElementById(id).disabled, buttonId);
    assert(posts.length === before + 1, kind + ' double-click sent another write');
    assert((await status.innerText()).includes('北京大学') && (await status.innerText()).includes('已提交'), 'submission lost original school');
    if (kind === 'note') assert(await note.inputValue() === '失败后应该保留的文字', 'A-B-A cleared text');
    else assert(await photo.evaluate(el => el.files.length) === 2, 'A-B-A cleared files');
    results.push(kind + ' duplicate suppression and A-B-A draft protection');
  }
  postMode = 'success';
  await page.locator('#dormitoryNoteSubmit').click();
  await page.waitForFunction(() => !document.getElementById('dormitoryNoteSubmit').disabled);
  assert(await note.inputValue() === '', 'successful current note did not clear');
  assert((await noteStatus.innerText()).includes('审核通过') && (await noteStatus.innerText()).includes('5 个蛋蛋币'), 'approval reward wording changed');
  await page.locator('#dormitoryUploadButton').click();
  await page.waitForFunction(() => !document.getElementById('dormitoryUploadButton').disabled);
  assert(await photo.evaluate(el => el.files.length) === 0, 'successful current upload did not clear');
  assert(posts.filter(p => p.path.endsWith('/notes')).every(p => p.headers.authorization === 'Bearer mock-token'), 'text lost authorization');
  results.push('manual success clears only current draft; existing reward unchanged');

  mineFails = true;
  await page.evaluate(() => renderDormitoryMine());
  await page.waitForFunction(() => document.getElementById('dormitoryMyUploads').textContent.includes('读取失败') && document.getElementById('dormitoryMyNotes').textContent.includes('读取失败'));
  results.push('history read errors are not presented as empty records');
  mineFails = false;
  for (const kind of ['note', 'photo']) {
    postMode = 'HTTP401';
    mineReads.length = 0;
    await page.evaluate(() => { USER.registered = true; sessionStorage.setItem('token', 'expired-token'); });
    if (kind === 'note') await note.fill('会话失效后保留的文字');
    else await photo.setInputFiles(file);
    const buttonId = kind === 'note' ? 'dormitoryNoteSubmit' : 'dormitoryUploadButton';
    await page.locator('#' + buttonId).click();
    await page.waitForFunction(id => !document.getElementById(id).disabled && !sessionStorage.getItem('token') && document.getElementById('dormitoryMyUploads').textContent.includes('请先登录'), buttonId);
    await page.evaluate(() => sessionStorage.setItem('token', 'new-login-token'));
    assert(mineReads.length === 0, kind + ' 401 started unauthenticated history requests');
    assert(await page.evaluate(() => sessionStorage.getItem('token')) === 'new-login-token', kind + ' invalidated the new login');
    if (kind === 'note') assert(await note.inputValue() === '会话失效后保留的文字', '401 cleared text');
    else assert(await photo.evaluate(el => el.files.length) === 1, '401 cleared selected photo');
    results.push(kind + ' 401 keeps drafts and does not request anonymous history');
  }
  mineMode = 'deferred401';
  await page.evaluate(() => { sessionStorage.setItem('token', 'old-account-token'); renderDormitoryMine(); });
  for (let i = 0; mineReleases.length < 2 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert(mineReleases.length === 2, 'old account history did not reach the local mock');
  mineMode = 'newRecords';
  await page.evaluate(() => { sessionStorage.setItem('token', 'new-account-token'); renderDormitoryMine(); });
  await page.waitForFunction(() => ['dormitoryMyUploads', 'dormitoryMyNotes'].every(id => document.getElementById(id).textContent.includes('新账号学校')));
  const finished401 = page.waitForResponse(response => response.url().includes('/api/dormitories/mine') && response.status() === 401);
  mineReleases.forEach(resolve => resolve());
  await finished401;
  // Wait for both response handlers, not just the network response event.
  await page.waitForLoadState('networkidle');
  assert(await page.evaluate(() => sessionStorage.getItem('token')) === 'new-account-token', 'old history 401 cleared new account token');
  for (const id of ['dormitoryMyUploads', 'dormitoryMyNotes']) assert((await page.locator('#' + id).innerText()).includes('新账号学校'), 'old history 401 overwrote new account records');
  results.push('late history 401 cannot log out the new account or replace its records');
  assert(errors.length === 0, 'page errors: ' + errors.join('; '));
  console.log(JSON.stringify({ passed: results.length, results, pageErrors: errors, boundary: 'local browser with mocked API; no production or database calls' }, null, 2));
}
