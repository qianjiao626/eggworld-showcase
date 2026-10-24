#!/usr/bin/env bash
# 蛋蛋世界 · 服务器侧一键发布
#
# 用法（服务器上，普通用户 xiaos，禁止 sudo）：
#   remote-deploy.sh <版本> [选项]
#
# 选项：
#   --skip-sql      本次无 SQL 变更，或 SQL 已手工执行/已备份
#   --db            先备份数据库（即使没有 SQL 文件）
#   --no-frontend   只更新后端 jar
#   --no-backend    只更新前端
#   --timeout N     后端健康检查超时秒数（默认 60）
#   --expect-version V  健康检查期望的 version（默认等于 <版本>；目录名用 ASCII 时传 jar 里的中文上线名）
#   --dry-run       只打印将执行的动作，不做任何改动
#
# 约定：
#   · 上传目录：~/eggworld/incoming/<版本>/
#       - 整个部署包：backend/eggworld.jar + frontend/...
#       - 或只传前端内容：index.html + js/ + rs/ + assets/
#       - 含数据库变更时，把 backend/sql/*.sql 一起传到 backend/sql/ 下
#   · 前端走 publish-frontend.sh 的版本目录 + 软链原子切换
#   · 后端 jar 仍是覆盖 ~/eggworld/eggworld.jar + systemctl restart eggworld
#   · 发现 SQL 且未 --skip-sql：先备份数据库、列出待执行脚本，然后退出（返回码 2），
#     人工执行完 SQL 后加 --skip-sql 重跑
#   · 后端健康检查失败会自动回滚 jar 与前端

set -eEuo pipefail

ROOT="${EGGWORLD_ROOT:-$HOME/eggworld}"
XS="$ROOT/xs"
INCOMING="$ROOT/incoming"
BACKUP_ROOT="$ROOT/backup"
DB_BACKUP="$BACKUP_ROOT/db"
PUBLISH="$ROOT/ops/publish-frontend.sh"

SKIP_SQL=0
BACKUP_DB=0
NO_FRONTEND=0
NO_BACKEND=0
DRY_RUN=0
TIMEOUT=60
EXPECT_VERSION=""

die()  { echo "错误：$*" >&2; exit 1; }
info() { echo "==> $*"; }
warn() { echo "警告：$*" >&2; }

usage() {
  cat <<'EOF'
用法：remote-deploy.sh <版本> [选项]

  --skip-sql            本次无 SQL 变更，或 SQL 已手工执行/已备份
  --db                  先备份数据库（即使没有 SQL 文件）
  --no-frontend         只更新后端 jar
  --no-backend          只更新前端
  --timeout N           后端健康检查超时秒数（默认 60）
  --expect-version V    健康检查期望的 version（默认等于 <版本>）
  --dry-run             只打印将执行的动作，不做任何改动
EOF
}

[ $# -gt 0 ] || { usage; exit 1; }
case "$1" in -h|--help) usage; exit 0 ;; esac
VER="$1"; shift
case "$VER" in */*|*..*) die "版本名非法：$VER" ;; esac

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-sql)    SKIP_SQL=1 ;;
    --db)          BACKUP_DB=1 ;;
    --no-frontend) NO_FRONTEND=1 ;;
    --no-backend)  NO_BACKEND=1 ;;
    --dry-run)     DRY_RUN=1 ;;
    --timeout)     shift; TIMEOUT="${1:-60}" ;;
    --expect-version) shift; EXPECT_VERSION="${1:-}" ;;
    *)             die "未知参数：$1" ;;
  esac
  shift
done

[ -d "$ROOT" ] || die "找不到 $ROOT"
[ -x "$PUBLISH" ] || die "找不到可执行脚本：$PUBLISH"
[ -n "$EXPECT_VERSION" ] || EXPECT_VERSION="$VER"

SRC="$INCOMING/$VER"
[ -d "$SRC" ] || die "找不到上传目录：$SRC"

# 归一化：兼容「整个部署包」与「只传 frontend 内容」两种上传方式
FRONTEND_SRC=""
if [ "$NO_FRONTEND" -eq 0 ]; then
  if [ -d "$SRC/frontend" ]; then
    FRONTEND_SRC="$SRC/frontend"
  elif [ -f "$SRC/index.html" ]; then
    FRONTEND_SRC="$SRC"
  fi
fi

JAR_SRC=""
if [ "$NO_BACKEND" -eq 0 ]; then
  if [ -f "$SRC/backend/eggworld.jar" ]; then
    JAR_SRC="$SRC/backend/eggworld.jar"
  elif [ -f "$SRC/eggworld.jar" ]; then
    JAR_SRC="$SRC/eggworld.jar"
  fi
fi

if [ -z "$FRONTEND_SRC" ] && [ -z "$JAR_SRC" ]; then
  die "上传目录里没有可发布内容（frontend/ 或 backend/eggworld.jar）"
fi

SQL_FILES="$(find "$SRC" -maxdepth 3 -type f -name '*.sql' 2>/dev/null | sort || true)"

DB_BACKED=0
backup_db() {
  mkdir -p "$DB_BACKUP"
  [ -f "$HOME/.my.cnf" ] || die "缺少 ~/.my.cnf，无法免交互备份数据库；请先配置或改用 --skip-sql"
  local dump="$DB_BACKUP/eggworld_$(date +%Y%m%d_%H%M%S).sql"
  info "备份数据库：$dump"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] mysqldump ... eggworld > $dump"
    return 0
  fi
  mysqldump --defaults-extra-file="$HOME/.my.cnf" --single-transaction \
    --default-character-set=utf8mb4 --set-charset eggworld > "$dump"
  chmod 600 "$dump"
  [ -s "$dump" ] || die "数据库备份为空：$dump"
  DB_BACKED=1
}

# 1) 数据库：只备份 + 列出 SQL，然后停下等人工执行
if [ -n "$SQL_FILES" ] && [ "$SKIP_SQL" -eq 0 ]; then
  backup_db
  echo
  echo "本次待执行的 SQL（按文件名顺序）："
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    echo "  - ${f#"$SRC"/}"
  done <<< "$SQL_FILES"
  echo
  echo "请先手工执行，例如："
  echo "  mysql --defaults-extra-file=\"$HOME/.my.cnf\" eggworld < $SRC/backend/sql/xxx.sql"
  echo
  echo "执行完成后重新运行："
  echo "  $(basename "$0") $VER --skip-sql"
  exit 2
fi

if [ "$BACKUP_DB" -eq 1 ] && [ "$DB_BACKED" -eq 0 ]; then
  backup_db
fi

# 2) 备份旧 jar
BACKUP_DIR="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)-$VER"
if [ -n "$JAR_SRC" ] && [ -f "$ROOT/eggworld.jar" ]; then
  mkdir -p "$BACKUP_DIR"
  info "备份旧 jar：$BACKUP_DIR/eggworld.jar"
  [ "$DRY_RUN" -eq 1 ] || cp -a "$ROOT/eggworld.jar" "$BACKUP_DIR"/
fi

PREV_FRONTEND=""
[ -L "$XS" ] && PREV_FRONTEND="$(basename "$(readlink -f "$XS")")"
FRONTEND_SWITCHED=0
JAR_REPLACED=0

rollback() {
  local code="${1:-1}"
  trap - ERR
  set +e
  warn "发布失败，开始回滚"
  if [ "$FRONTEND_SWITCHED" -eq 1 ] && [ -n "$PREV_FRONTEND" ]; then
    warn "前端回滚到 $PREV_FRONTEND"
    "$PUBLISH" rollback "$PREV_FRONTEND" || warn "前端回滚失败，请手工执行：$PUBLISH rollback $PREV_FRONTEND"
  fi
  if [ "$JAR_REPLACED" -eq 1 ] && [ -f "$BACKUP_DIR/eggworld.jar" ]; then
    warn "后端 jar 回滚"
    cp -a "$BACKUP_DIR/eggworld.jar" "$ROOT/eggworld.jar" || warn "jar 回滚失败，请手工从 $BACKUP_DIR 恢复"
    systemctl restart eggworld || warn "重启失败，请手工检查 systemctl status eggworld"
  fi
  warn "回滚完成，请复核线上"
  exit "$code"
}
trap 'rollback $?' ERR
fail() { echo "错误：$*" >&2; rollback 1; }

# 3) 前端：版本目录 + 原子切换
if [ -n "$FRONTEND_SRC" ]; then
  [ -L "$XS" ] || die "$XS 不是软链：请先执行 $PUBLISH init（首次迁移需人工确认）"
  info "前端发布：$FRONTEND_SRC"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] $PUBLISH publish $VER $FRONTEND_SRC"
  else
    "$PUBLISH" publish "$VER" "$FRONTEND_SRC"
    FRONTEND_SWITCHED=1
  fi
fi

# 4) 后端：覆盖 jar + 重启
if [ -n "$JAR_SRC" ]; then
  info "更新后端 jar：$JAR_SRC"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] cp $JAR_SRC $ROOT/eggworld.jar && systemctl restart eggworld"
  else
    cp -a "$JAR_SRC" "$ROOT/eggworld.jar"
    JAR_REPLACED=1
    systemctl restart eggworld
  fi
fi

if [ "$DRY_RUN" -eq 1 ]; then
  info "dry-run 完成，未做任何改动"
  exit 0
fi

# 5) 验证
if [ -n "$JAR_SRC" ]; then
  info "等待后端健康检查（最多 ${TIMEOUT}s，期望 version=$EXPECT_VERSION）"
  ok=0
  i=0
  while [ "$i" -lt "$TIMEOUT" ]; do
    body="$(curl -fsS http://127.0.0.1:8080/api/health 2>/dev/null || true)"
    case "$body" in
      *"\"version\":\"$EXPECT_VERSION\""*) ok=1; break ;;
    esac
    i=$((i + 1))
    sleep 1
  done
  [ "$ok" -eq 1 ] || fail "后端健康检查失败：${TIMEOUT}s 内未返回 version=$EXPECT_VERSION"
fi

CODE="$(curl -s -o /dev/null -w '%{http_code}' https://dsxnb.com/ 2>/dev/null || true)"
[ "$CODE" = "200" ] || fail "首页返回 $CODE（期望 200）"

trap - ERR
echo
info "发布成功：$VER"
if [ "$FRONTEND_SWITCHED" -eq 1 ]; then
  info "前端当前版本：$VER"
  [ -n "$PREV_FRONTEND" ] && info "前端回滚命令：$PUBLISH rollback $PREV_FRONTEND"
fi
if [ -n "$JAR_SRC" ]; then
  info "旧 jar 备份：$BACKUP_DIR"
  info "后端回滚：cp $BACKUP_DIR/eggworld.jar $ROOT/eggworld.jar && systemctl restart eggworld"
fi
info "确认无误后可清理上传目录：rm -rf $SRC"
