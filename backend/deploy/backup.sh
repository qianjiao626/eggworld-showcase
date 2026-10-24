#!/usr/bin/env bash
# 蛋蛋世界 · 发布前备份（只读线上，只写 backup/，不做任何删除）
#
# 用法（服务器上，普通用户 xiaos，禁止 sudo）：
#   backup.sh <版本> [--no-db]
#
# 做三件事：
#   1. 备份 ~/eggworld/eggworld.jar
#   2. 前端：未启用版本目录时复制整个 xs/；已启用时只记录当前版本名（版本目录本身即备份）
#   3. 默认备份数据库到 ~/eggworld/backup/db/（--no-db 跳过）
#
# 需要一次性配置 ~/.my.cnf（权限 600）才能免交互 mysqldump：
#   [client]
#   user=eggworld
#   password=你的密码

set -eEuo pipefail

ROOT="${EGGWORLD_ROOT:-$HOME/eggworld}"
XS="$ROOT/xs"
BACKUP_ROOT="$ROOT/backup"
DB_BACKUP="$BACKUP_ROOT/db"

DO_DB=1

die()  { echo "错误：$*" >&2; exit 1; }
info() { echo "==> $*"; }
warn() { echo "警告：$*" >&2; }

usage() {
  cat <<'EOF'
用法：backup.sh <版本> [--no-db]

  备份 jar、前端目录与数据库到 ~/eggworld/backup/
  --no-db   跳过数据库备份
EOF
}

[ $# -gt 0 ] || { usage; exit 1; }
case "$1" in -h|--help) usage; exit 0 ;; esac
VER="$1"; shift
case "$VER" in ''|*/*|*..*) die "版本名非法：$VER" ;; esac

while [ $# -gt 0 ]; do
  case "$1" in
    --no-db) DO_DB=0 ;;
    *)       die "未知参数：$1" ;;
  esac
  shift
done

[ -d "$ROOT" ] || die "找不到 $ROOT"
case "$ROOT" in
  '/'|'/home'|'/home/xiaos'|'') die "EGGWORLD_ROOT 非法：$ROOT" ;;
esac

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP-$VER"
mkdir -p "$DEST"

# 空间检查：jar + 未启用版本目录时的整站副本，另留 100MB 余量
need=0
[ -f "$ROOT/eggworld.jar" ] && need=$((need + $(du -sk "$ROOT/eggworld.jar" | cut -f1)))
if [ -d "$XS" ] && [ ! -L "$XS" ]; then
  need=$((need + $(du -sk "$XS" | cut -f1)))
fi
avail=$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')
[ -n "$avail" ] || die "无法读取 $ROOT 的剩余空间"
[ "$avail" -gt $((need + 102400)) ] || die "备份空间不足：需要约 $((need / 1024))MB，可用 $((avail / 1024))MB（需保留 100MB 余量）"

# 1) 后端 jar
if [ -f "$ROOT/eggworld.jar" ]; then
  info "备份 jar：$DEST/eggworld.jar"
  cp -a "$ROOT/eggworld.jar" "$DEST"/
fi

# 2) 前端
if [ -L "$XS" ]; then
  CUR="$(readlink -f "$XS")"
  echo "$CUR" > "$DEST/frontend-current.txt"
  info "前端已是版本目录：$(basename "$CUR")（版本目录即备份，不重复复制）"
elif [ -d "$XS" ]; then
  info "备份前端目录 xs/ → $DEST/xs-before"
  cp -a "$XS" "$DEST/xs-before"
else
  warn "未找到 $XS，跳过前端备份"
fi

# 3) 数据库
if [ "$DO_DB" -eq 1 ]; then
  [ -f "$HOME/.my.cnf" ] || die "缺少 ~/.my.cnf，无法免交互备份数据库；配置好或加 --no-db"
  mkdir -p "$DB_BACKUP"
  DUMP="$DB_BACKUP/eggworld_$(date +%Y%m%d_%H%M%S).sql"
  info "备份数据库：$DUMP"
  mysqldump --defaults-extra-file="$HOME/.my.cnf" --single-transaction \
    --default-character-set=utf8mb4 --set-charset eggworld > "$DUMP"
  chmod 600 "$DUMP"
  [ -s "$DUMP" ] || die "数据库备份为空：$DUMP"
fi

# 校验
echo
info "备份完成：$DEST"
ls -l "$DEST"
[ -f "$DEST/eggworld.jar" ] && [ -r "$DEST/eggworld.jar" ] && info "jar 已备份且可读"
echo
echo "恢复命令："
echo "  jar:  cp $DEST/eggworld.jar $ROOT/eggworld.jar && systemctl restart eggworld"
[ -d "$DEST/xs-before" ] && echo "  前端: rm -f $XS && mv $DEST/xs-before $XS"
[ -f "$DEST/frontend-current.txt" ] && echo "  前端: $(cat "$DEST/frontend-current.txt")（用 publish-frontend.sh rollback）"
