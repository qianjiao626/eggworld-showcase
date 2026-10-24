#!/usr/bin/env node
/**
 * 本地前端静态服务器（零依赖，只要装了 Node）
 *
 * 用法（在仓库根目录执行）：
 *   node start-frontend.cjs                 # 默认 http://127.0.0.1:5500/growth-schoolv3.html
 *   node start-frontend.cjs 5600            # 换端口
 *   node start-frontend.cjs 5600 --open     # 起完顺手打开浏览器
 *
 * 为什么这样起：
 * - 静态根 = 本文件所在目录（仓库根），所以 HTML 里对 js/、assets/ 的相对引用都能解析
 * - 页面跑在 localhost / 127.0.0.1 下时，前端的 API_BASE 会自动指向 http://localhost:8080
 *   （见 growth-schoolv3.html 的 API 层注释），所以后端要另行启动；后端 CORS 已允许本地任意端口
 * - 一律 no-store：改完 js/CSS 刷新即生效，避免浏览器拿着旧缓存排查半天
 * - 只绑 127.0.0.1：不触发 Windows 防火墙弹窗，也不对局域网暴露本地开发页
 * - 只放行前端文件（根下的 *.html + js/ + assets/ + 简历子模块 /rs/）：本地密钥文件
 *   （backend/application-local.yml 等）不会因为这个开发服务器被读出来
 * - 简历子模块（学生工坊 → 大师兄简历）是 resume/ 静态导出的产物，这里把 /rs/** 直接映射到
 *   resume/out/**（目录按 index.html 解析），不用先拷一份到仓库根，也不额外起进程
 * 启动：node start-frontend.cjs 5600 --open
 * 停止：Ctrl+C
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
const ENTRY = 'growth-schoolv3.html';
/* 简历子模块的静态导出目录：/rs/** → resume/out/** */
const RESUME_OUT = path.join(ROOT, 'resume', 'out');

const args = process.argv.slice(2);
const openBrowser = args.includes('--open');
const portArg = args.find((a) => /^\d+$/.test(a));
const PORT = portArg ? Number(portArg) : 5500;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Cache-Control': 'no-store' }, headers));
  res.end(body);
}

/** 只放行前端产物：根目录下的 *.html、js/**、assets/**、简历子模块 /rs/**（其余一律 404，避免把仓库里的配置/密钥读出去） */
function isFrontendPath(urlPath) {
  if (/^\/[^/]+\.html$/.test(urlPath)) return true;
  return urlPath.startsWith('/js/') || urlPath.startsWith('/assets/')
      || urlPath === '/rs' || urlPath.startsWith('/rs/');
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    return send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  // 反斜杠按分隔符处理并归一化，再判白名单：否则 /js/..\backend\application-local.yml 这类
  // 写法能绕过 isFrontendPath（Windows 上 \ 也是路径分隔符）
  urlPath = path.posix.normalize(urlPath.replace(/\\/g, '/'));
  if (urlPath === '/' || urlPath === '.') urlPath = `/${ENTRY}`;
  if (!isFrontendPath(urlPath)) {
    console.log(`${req.method} ${urlPath} -> 404 (非前端文件，本服务器不放行)`);
    return send(res, 404, `404 Not Found: ${urlPath}`, { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  /* /rs/** 映射到简历子模块的静态导出目录（resume/out），其余仍以仓库根为准 */
  const isResume = urlPath === '/rs' || urlPath.startsWith('/rs/');
  const baseDir = isResume ? RESUME_OUT : ROOT;
  const relPath = isResume ? (urlPath.slice(3) || '/') : urlPath;

  // 目录穿越防护：解析后的绝对路径必须仍在对应根内
  const filePath = path.resolve(baseDir, `.${relPath}`);
  if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
    return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  function serveFile(target) {
    fs.stat(target, (err, stat) => {
      if (err || !stat.isFile()) {
        console.log(`${req.method} ${urlPath} -> 404`);
        if (isResume && !fs.existsSync(RESUME_OUT)) {
          console.log('  提示：简历子模块还没构建，先在 resume/ 里执行 npm run build');
        }
        return send(res, 404, `404 Not Found: ${urlPath}`, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(target).pipe(res);
      console.log(`${req.method} ${urlPath} -> 200 (${type})`);
    });
  }

  fs.stat(filePath, (err, stat) => {
    /* 静态导出是目录路由（/rs/、/rs/resume/create/），按 index.html 解析 */
    if (!err && stat.isDirectory()) return serveFile(path.join(filePath, 'index.html'));
    serveFile(filePath);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，换一个：node start-frontend.cjs ${PORT + 1}`);
  } else {
    console.error(`启动失败：${err.message}`);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/${ENTRY}`;
  console.log('前端静态服务器已启动（Ctrl+C 停止）');
  console.log(`  页面入口: ${url}`);
  console.log(`  静态根  : ${ROOT}`);
  console.log(`  接口地址: http://localhost:8080（前端在 localhost 下自动指向它，记得另行启动后端）`);
  if (openBrowser) {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  }
});
