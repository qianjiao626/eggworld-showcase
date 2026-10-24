const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
test('all work-order ignore patterns are effective, including nested files', () => {
  const names = ['a.pem','a.key','a.p12','a.pfx','a.jks','a.keystore','id_rsa.pub','id_ed25519.pub','.env','.env.test','credentials.json','my-secret.txt','.playwright-cli/a.txt','output/a.txt'];
  for (const name of names) {
    assert.doesNotThrow(() => execFileSync('git', ['check-ignore', '--no-index', '--quiet', `probe/${name}`], {cwd:root, windowsHide:true}), name);
  }
});
test('legacy plaintext config is archived, never suggested for deployment', () => {
  assert.equal(fs.existsSync(path.join(root, 'backend/deploy/nginx.conf')), false);
  assert.ok(read('backend/deploy/nginx.conf.deprecated').includes('listen 80;'));
  assert.match(read('backend/build-deploy.ps1'), /\$p -notlike '\*\.deprecated'/);
});
test('nginx auth zone is HTTP scoped, security regex cannot be bypassed by MKJ prefix', () => {
  const config = read('backend/deploy/dsxnb.conf').replace(/^\s*#.*$/gm, '');
  assert.match(config.slice(0, config.indexOf('server {')), /limit_req_zone.*rate=1r\/s;/);
  assert.doesNotMatch(config, /location\s+\^~\s+\/MKJ\//);
  assert.match(config, /location \/api\/auth\//);
  assert.match(config, /client_max_body_size 2m;/);
  assert.doesNotMatch(config, /add_header Content-Security-Policy\s/);
  for (const directive of ['Strict-Transport-Security','X-Frame-Options','X-Content-Type-Options','Referrer-Policy','Permissions-Policy','Content-Security-Policy-Report-Only']) assert.ok(config.includes(`add_header ${directive} `), directive);
});
test('service sandbox and stable Java path retain working directory and JVM flag', () => {
  const config = read('backend/deploy/eggworld.service');
  for (const line of ['NoNewPrivileges=true','PrivateTmp=true','ProtectSystem=strict','ProtectHome=read-only','ReadWritePaths=/home/xiaos/eggworld','RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX','ExecStart=/usr/bin/java -Djava.net.preferIPv4Stack=true','WorkingDirectory=/home/xiaos/eggworld']) assert.ok(config.includes(line), line);
});

test('dormitory upload alone allows up to 26 MB through the reverse proxy', () => {
  const rootConfig = read('backend/deploy/dsxnb.conf');
  const xsConfig = read('backend/deploy/nginx-xs-location.conf');
  assert.match(rootConfig, /location = \/api\/dormitories \{[\s\S]*?client_max_body_size 26m;/);
  assert.match(xsConfig, /location = \/xs\/api\/dormitories \{[\s\S]*?client_max_body_size 26m;/);
  assert.match(rootConfig, /location \/api\/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:8090\/api\//);
});

test('both deployment variants retain conservative timeout and rate-limit settings', () => {
  for (const file of ['backend/deploy/dsxnb.conf', 'backend/deploy/nginx-xs-location.conf']) {
    const config = read(file);
    for (const directive of ['client_max_body_size 2m;', 'proxy_connect_timeout 10s;',
      'proxy_send_timeout 60s;', 'proxy_read_timeout 60s;', 'limit_req_status 429;',
      'limit_req zone=eggworld_auth burst=5 nodelay;']) assert.ok(config.includes(directive), `${file}: ${directive}`);
  }
});