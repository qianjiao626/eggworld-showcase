#!/usr/bin/env bash
# 蛋蛋世界 · 前端版本目录发布（原子切换）
#
# 用法（服务器上，普通用户 xiaos，禁止 sudo）：
#   publish-frontend.sh init                首次把 xs 目录迁成版本目录 + 软链
#   publish-frontend.sh publish <版本> [源目录]  用源目录（默认 incoming/<版本>/）叠加为新版本并原子切换
#   publish-frontend.sh rollback <版本>     切回指定版本
#   publish-frontend.sh list                列出可用版本与当前指向
#   publish-frontend.sh status              显示当前软链与磁盘占用
#
# 约定：
#   · ~/eggworld/xs 始终是软链，指向 ~/eggworld/releases/frontend/<版本>
#   · nginx root 不变（/home/xiaos/eggworld/xs），软链由 nginx 默认跟随，无需改配置、无需 reload
#   · 每次发布以「当前版本」为底复制，再叠加 incoming/<版本>/ 里的增量文件
#   · 保留最近 KEEP 个版本（默认 2：当前 + 上一版），旧版本可随时 rollback
#   · 发布前检查剩余磁盘，空间不足直接拒绝，不冒险复制
#   · 发布后不要再 scp 直传 xs/：那会写进当前版本目录，破坏不可变
#
# 环境变量：
#   EGGWORLD_ROOT   默认 ~/eggworld
#   KEEP_RELEASES   保留版本数，默认 2

set -euo pipefail

ROOT="${EGGWORLD_ROOT:-$HOME/eggworld}"
XS="$ROOT/xs"
RELEASES="$ROOT/releases/frontend"
INCOMING="$ROOT/incoming"
KEEP="${KEEP_RELEASES:-2}"

die()  { echo "错误：$*" >&2; exit 1; }
info() { echo "==> $*"; }

# 只允许删除 releases/frontend 与 incoming 下的路径，防止误删业务数据
safe_rm() {
  local p="$1"
  case "$p" in
    "$RELEASES"/*|"$INCOMING"/*) rm -rf -- "$p" ;;
    *) die "拒绝删除目录外路径：$p" ;;
  esac
}

# 复制目标版本前检查剩余空间，至少留 200MB 余量
ensure_space() {
  local src="$1" need avail
  need=$(du -sk "$src" | cut -f1)
  avail=$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')
  [ -n "$avail" ] || die "无法读取 $ROOT 的剩余空间"
  if [ "$avail" -le $((need + 204800)) ]; then
    die "磁盘空间不足：复制需要约 $((need / 1024))MB，可用 $((avail / 1024))MB（需保留 200MB 余量）"
  fi
}

[ -d "$ROOT" ] || die "找不到 $ROOT"
case "$ROOT" in
  '/'|'/home'|'/home/xiaos'|'') die "EGGWORLD_ROOT 非法：$ROOT" ;;
esac
mkdir -p "$RELEASES" "$INCOMING"

current_target() { readlink -f "$XS" 2>/dev/null || true; }

current_ver() {
  local t
  t="$(current_target)"
  case "$t" in
    "$RELEASES"/*) basename "$t" ;;
    *) echo "" ;;
  esac
}

check_ver() {
  case "${1:-}" in
    '')        die "缺少版本名" ;;
    */*|*..*)  die "版本名非法：$1（不能含 / 或 ..）" ;;
  esac
}

# 原子切换：先建临时软链，再用 rename(2) 覆盖 xs
do_switch() {
  local target="$1"
  [ -d "$target" ] || die "目标不存在：$target"
  [ -f "$target/index.html" ] || die "目标缺少 index.html：$target"
  local tmp="$XS.new.$$"
  rm -f "$tmp"
  ln -s "$target" "$tmp"
  mv -T "$tmp" "$XS"
  info "已切换：$XS -> $(readlink "$XS")"
}

cmd_init() {
  if [ -L "$XS" ]; then
    info "已是软链，无需初始化：$XS -> $(readlink "$XS")"
    return 0
  fi
  [ -d "$XS" ] || die "找不到 $XS"

  local ver="baseline-$(date +%Y%m%d-%H%M%S)"
  local dst="$RELEASES/$ver"
  [ -e "$dst" ] && die "版本目录已存在：$dst"

  info "复制现有站点到 $dst"
  ensure_space "$XS"
  cp -a "$XS" "$dst"

  local a b
  a=$(find "$XS" -type f | wc -l)
  b=$(find "$dst" -type f | wc -l)
  [ "$a" -eq "$b" ] || die "复制文件数不一致：源 $a / 目标 $b，停止切换"

  local old="$ROOT/xs.before-atomic-$(date +%Y%m%d-%H%M%S)"
  info "原目录改名为：$old"
  mv "$XS" "$old"

  if ! do_switch "$dst"; then
    info "切换失败，恢复原目录"
    rm -f "$XS"
    mv "$old" "$XS"
    exit 1
  fi

  chmod 755 "$RELEASES"
  info "版本大小：$(du -sh "$dst" | cut -f1)"
  info "初始化完成。旧目录确认线上正常后可删除：$old"
}

cmd_publish() {
  local ver="${1:-}"
  check_ver "$ver"
  [ -L "$XS" ] || die "$XS 不是软链，请先执行 init"

  local src="${2:-$INCOMING/$ver}"
  [ -d "$src" ] || die "找不到上传目录：$src（先把部署包的 frontend/ 内容传到这里）"
  [ -f "$src/index.html" ] || info "提示：上传目录没有 index.html，将沿用当前版本的入口"

  local base dst
  base="$(current_target)"
  [ -d "$base" ] || die "当前 xs 未指向有效目录：$XS"
  dst="$RELEASES/$ver"
  [ -e "$dst" ] && die "版本目录已存在：$dst（换一个版本名，或先 rollback 后删除）"

  info "以当前版本为底：$(basename "$base")"
  ensure_space "$base"
  cp -a "$base" "$dst"
  info "叠加增量：$src"
  cp -a "$src/." "$dst/"
  [ -f "$dst/index.html" ] || die "合并后缺少 index.html，停止切换"

  do_switch "$dst"
  info "版本大小：$(du -sh "$dst" | cut -f1)"
  prune
  info "上传目录可清理：rm -rf $INCOMING/$ver"
}

cmd_rollback() {
  local ver="${1:-}"
  check_ver "$ver"
  [ -L "$XS" ] || die "$XS 不是软链，请先执行 init"
  do_switch "$RELEASES/$ver"
  info "已回滚前端。注意：后端 jar 与数据库不会随之回滚"
}

prune() {
  local cur n d
  cur="$(current_ver)"
  n=0
  while IFS= read -r d; do
    [ -z "$d" ] && continue
    n=$((n + 1))
    [ "$n" -le "$KEEP" ] && continue
    [ "$(basename "$d")" = "$cur" ] && continue
    info "清理旧版本：$d"
    safe_rm "$d"
  done < <(ls -1dt "$RELEASES"/*/ 2>/dev/null || true)
}

cmd_list() {
  local cur d v mark
  cur="$(current_ver)"
  for d in "$RELEASES"/*/; do
    [ -d "$d" ] || continue
    v="$(basename "$d")"
    mark=' '
    [ "$v" = "$cur" ] && mark='*'
    printf '%s %-32s %s\n' "$mark" "$v" "$(du -sh "$d" 2>/dev/null | cut -f1)"
  done
}

cmd_status() {
  [ -L "$XS" ] || die "$XS 不是软链（先执行 init）"
  info "当前指向：$(readlink "$XS")"
  info "生效目录：$(readlink -f "$XS")"
  info "版本占用：$(du -sh "$RELEASES" 2>/dev/null | cut -f1)"
}

case "${1:-}" in
  init)             cmd_init ;;
  publish)          cmd_publish "${2:-}" "${3:-}" ;;
  rollback)         cmd_rollback "${2:-}" ;;
  list)             cmd_list ;;
  status)           cmd_status ;;
  *)
    cat <<'EOF'
用法：
  publish-frontend.sh init                首次迁移（把 xs 目录变成软链）
  publish-frontend.sh publish <版本> [源目录]  用源目录（默认 incoming/<版本>/）发布并原子切换
  publish-frontend.sh rollback <版本>     回滚到指定版本
  publish-frontend.sh list                列出可用版本
  publish-frontend.sh status              查看当前版本与占用
EOF
    exit 1
    ;;
esac
