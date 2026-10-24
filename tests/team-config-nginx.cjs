/** Real local nginx integration; requires explicit binaries, never contacts production.
 * NGINX_BIN=/path/nginx OPENSSL_BIN=/path/openssl node --test tests/team-config-nginx.cjs
 * Fixtures/logs are retained under TEAM_CONFIG_TMP or the OS temp directory.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const https = require('node:https');
const {spawn, spawnSync} = require('node:child_process');
const {once} = require('node:events');
const root = path.resolve(__dirname, '..');
const slash = value => value.replaceAll('\\', '/');
const read = name => fs.readFileSync(path.join(root, 'backend/deploy', name), 'utf8');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const headers = ['strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'content-security-policy-report-only'];
function checkHeaders(response) {
  for (const header of headers) assert.ok(response.headers[header], `${response.status}: ${header}`);
  assert.equal(response.headers['content-security-policy'], undefined);
}
function request(port, url, {secure = true, host = 'dsxnb.com', method = 'GET', body, headers: extra = {}} = {}) {
  return new Promise((resolve, reject) => {
    const req = (secure ? https : http).request({host: '127.0.0.1', port, path: url, method,
      rejectUnauthorized: false, agent: false, headers: {Host: host, ...extra}}, res => {
      const data = []; res.on('data', chunk => data.push(chunk));
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(data).toString()}));
    });
    req.setTimeout(5000, () => req.destroy(new Error('local request timed out')));
    req.on('error', reject); req.end(body);
  });
}
async function reservePort() {
  const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
function command(binary, args, cwd) {
  const result = spawnSync(binary, args, {cwd, encoding: 'utf8', windowsHide: true});
  assert.equal(result.status, 0, `${binary} ${args.join(' ')}\n${result.error || ''}\n${result.stdout}\n${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

test('real nginx: syntax, headers, regex priority, routing, ACME, size and auth throttling',
  {skip: !process.env.NGINX_BIN || !process.env.OPENSSL_BIN, timeout: 90000}, async t => {
    const base = process.env.TEAM_CONFIG_TMP || os.tmpdir(); fs.mkdirSync(base, {recursive: true});
    const work = fs.mkdtempSync(path.join(base, 'eggworld-nginx-'));
    t.diagnostic(`retained local fixtures: ${work}`);
    fs.mkdirSync(path.join(work, 'logs'));
    fs.mkdirSync(path.join(work, 'temp'));
    const cert = slash(path.join(work, 'test-cert.pem')), key = slash(path.join(work, 'test-key.pem'));
    command(process.env.OPENSSL_BIN, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', key, '-out', cert], work);
    const dh = slash(path.join(work, 'test-dh.pem'));
    command(process.env.OPENSSL_BIN, ['dhparam', '-dsaparam', '-out', dh, '2048'], work);
    fs.writeFileSync(path.join(work, 'ssl-options.conf'), 'ssl_protocols TLSv1.2 TLSv1.3;\n');
    const staticRoot = slash(path.join(work, 'static')), varRoot = slash(path.join(work, 'var-www'));
    for (const [file, value] of Object.entries({
      [`${staticRoot}/index.html`]:'root-index', [`${staticRoot}/.well-known/acme-challenge/probe`]:'challenge',
      [`${varRoot}/MKJ/index.html`]:'mkj-index', [`${varRoot}/dd/growth-school.html`]:'dd-index',
      [`${varRoot}/dd/blind-box/index.html`]:'blind-box-index'
    })) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, value); }
    const upstream = http.createServer((req, res) => {
      req.resume(); req.on('end', () => {
        res.setHeader('Set-Cookie', 'session=test; Path=/api/auth');
        res.statusCode = req.url.includes('/unauthorized') ? 401 : req.url.includes('/fail') ? 500 : 200;
        res.end(`upstream:${req.url}`);
      });
    });
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    t.after(() => new Promise(resolve => upstream.close(resolve)));
    const upstreamPort = upstream.address().port;
    for (const legacy of [false, true]) {
      await t.test(legacy ? 'alternative xs snippet' : 'current root configuration', async () => {
        const httpPort = await reservePort(), tlsPort = await reservePort();
        const stem = legacy ? 'legacy' : 'current';
        let config;
        if (legacy) config = `limit_req_zone $binary_remote_addr zone=eggworld_auth:10m rate=1r/s;\nserver {\nlisten 127.0.0.1:${tlsPort} ssl;\nserver_name dsxnb.com;\nssl_certificate ${cert};\nssl_certificate_key ${key};\n${read('nginx-xs-location.conf')}\n}`;
        else config = read('dsxnb.conf').replaceAll('listen 80;', `listen 127.0.0.1:${httpPort};`)
          .replaceAll('listen 443 ssl', `listen 127.0.0.1:${tlsPort} ssl`)
          .replaceAll('/etc/letsencrypt/live/dsxnb.com/fullchain.pem', cert)
          .replaceAll('/etc/letsencrypt/live/dsxnb.com/privkey.pem', key)
          .replaceAll('/etc/letsencrypt/options-ssl-nginx.conf', slash(path.join(work, 'ssl-options.conf')))
          .replaceAll('/etc/letsencrypt/ssl-dhparams.pem', dh);
        config = config.replaceAll('/home/xiaos/eggworld/xs', staticRoot).replaceAll('/var/www', varRoot)
          .replace(/http:\/\/(?:127\.0\.0\.1:(?:8090|3310)|localhost:3000)/g, `http://127.0.0.1:${upstreamPort}`);
        const configName = `${stem}.conf`;
        fs.writeFileSync(path.join(work, configName), `worker_processes 1;\npid ${stem}.pid;\nerror_log logs/${stem}-error.log info;\nevents { worker_connections 256; }\nhttp {\naccess_log logs/${stem}-access.log;\nmap $uri $dd_static_expires { default off; }\n${config}\n}\n`);
        const args = ['-p', `${slash(work)}/`, '-c', configName];
        const syntax = command(process.env.NGINX_BIN, [...args, '-t'], work);
        fs.writeFileSync(path.join(work, `${stem}-syntax.log`), syntax);
        assert.match(syntax, /syntax is ok/); assert.match(syntax, /test is successful/);
        const nginx = spawn(process.env.NGINX_BIN, args, {cwd:work, windowsHide:true, stdio:'ignore'});
        try {
          let ready = false;
          for (let i=0; i<50; i++) { try { await request(tlsPort, legacy ? '/xs/index.html' : '/index.html'); ready=true; break; } catch { await sleep(100); } }
          assert.ok(ready, 'local nginx listener started');
          const prefix = legacy ? '/xs' : '';
          for (const url of [`${prefix}/index.html`, `${prefix}/api/health`, `${prefix}/api/unauthorized`, `${prefix}/api/fail`]) {
            const response = await request(tlsPort, url); checkHeaders(response);
            assert.equal(response.status, url.endsWith('unauthorized') ? 401 : url.endsWith('fail') ? 500 : 200);
          }
          for (const suffix of ['/.env','/.git/config','/.well-known-evil/token','/config.YAML','/dump.sql','/backup.zip','/key.pem','/x.conf/path','/index.html~','/api/.env','/api/auth/.git/config']) {
            const response = await request(tlsPort, `${prefix}${suffix}`); assert.equal(response.status,403,suffix); checkHeaders(response);
          }
          const challenge = await request(tlsPort, `${prefix}/.well-known/acme-challenge/probe`);
          assert.equal(challenge.status,200); assert.equal(challenge.body,'challenge');
          const small = await request(tlsPort, `${prefix}/api/upload`, {method:'POST',body:Buffer.alloc(2*1024*1024), headers:{'Content-Length':2*1024*1024}});
          assert.equal(small.status,200);
          const large = await request(tlsPort, `${prefix}/api/upload`, {method:'POST',headers:{'Content-Length':2*1024*1024+1}});
          assert.equal(large.status,413); checkHeaders(large);
          const burst = await Promise.all(Array.from({length:12}, () => request(tlsPort, `${prefix}/api/auth/login`, {method:'POST'})));
          assert.ok(burst.some(r=>r.status===200)); assert.ok(burst.some(r=>r.status===429));
          for (const response of burst) { assert.ok([200,429].includes(response.status)); checkHeaders(response); }
          const otherApi = await Promise.all(Array.from({length:8}, () => request(tlsPort, `${prefix}/api/health`)));
          assert.ok(otherApi.every(r=>r.status===200), 'non-auth requests are not throttled');
          await sleep(1150); assert.equal((await request(tlsPort, `${prefix}/api/auth/login`)).status,200);
          if (!legacy) {
            for (const folder of ['/MKJ','/dd','/dd/blind-box','/xs']) {
              assert.equal((await request(tlsPort, folder)).status,301);
              const response = await request(tlsPort, `${folder}/`); assert.equal(response.status,200); checkHeaders(response);
              assert.equal((await request(tlsPort, `${folder}/.env`)).status,403);
            }
            assert.equal((await request(tlsPort,'/dd/api/probe')).body,'upstream:/api/probe');
            assert.equal((await request(tlsPort,'/dd/health')).body,'upstream:/health');
            assert.equal((await request(tlsPort,'/xs/probe')).body,'upstream:/probe');
            assert.match((await request(tlsPort,'/dd/api/probe')).headers['set-cookie'][0], /Path=\/dd\/api\/auth/);
            const redirect = await request(tlsPort,'/probe',{host:'www.dsxnb.com'}); assert.equal(redirect.status,301); checkHeaders(redirect);
            for (const host of ['dsxnb.com','www.dsxnb.com']) {
              const response = await request(httpPort,'/.well-known/acme-challenge/probe',{secure:false,host});
              assert.equal(response.status,301); assert.equal(response.headers.location,'https://dsxnb.com/.well-known/acme-challenge/probe');
            }
          } else {
            assert.equal((await request(tlsPort,'/xs')).status,301);
            assert.equal((await request(tlsPort,'/xs/api/probe')).body,'upstream:/api/probe');
          }
        } finally {
          command(process.env.NGINX_BIN, [...args, '-s', 'quit'], work);
          // Wait for this test's master to stop; never kill other nginx instances.
          for (let i=0; i<50 && fs.existsSync(path.join(work,`${stem}.pid`)); i++) await sleep(100);
          assert.equal(fs.existsSync(path.join(work,`${stem}.pid`)),false,'isolated nginx stopped');
          nginx.unref();
        }
      });
    }
  });
