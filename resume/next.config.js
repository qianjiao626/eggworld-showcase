/** @type {import('next').NextConfig} */
const nextConfig = {
  /* 随蛋蛋世界一起发布：静态导出到 out/，产物拷进前端根目录的 rs/，
     由 nginx 当普通静态文件服务（和 growth-schoolv3.html、js/ 同等待遇）。
     → 没有自己的服务端进程，也不需要单独启动，重启 eggworld 就是全部启动。 */
  output: "export",

  /* 站点对外地址 = 同域 /rs/：页面、静态资源都落在这个前缀下，
     不会再和蛋蛋世界根目录的 try_files 回退打架（线上无样式事故的根因）。
     ⚠️ 与 src/lib/site.ts 的 BASE_PATH 必须保持一致。 */
  basePath: "/rs",

  /* 保留末尾斜杠：对外固定地址是 https://dsxnb.com/rs/，目录形式也方便 nginx
     用 try_files $uri $uri/ 直接命中 index.html。 */
  trailingSlash: true,
};

module.exports = nextConfig;
