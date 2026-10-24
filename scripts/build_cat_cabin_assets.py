# -*- coding: utf-8 -*-
"""猫咪小屋素材提取:按 pet-renderer.js / pet-ui.js 实际加载路径,从交接包
01-猫咪小屋/cats/ 挑出所需帧,离线缩图(NEAREST,模拟运行时 smoothing=false)后
复制到 assets/cat-cabin/cats/。只复制、不修改源目录。

用法: python scripts/build_cat_cabin_assets.py
"""
import os
import shutil
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "local-only", "宠物模块交接包", "01-猫咪小屋", "cats")
DST = os.path.join(ROOT, "assets", "cat-cabin", "cats")

WALK = [f"walk_{i}" for i in range(1, 7)]
ACTION5 = ["sleep", "eat", "play", "groom", "stretch"]
# 橘猫独立补充帧(ORANGE_EXTRA_FRAME_EXT, 从 basePath=orange_unified 加载, 显示尺寸)
ORANGE_EXTRA_JPG = ["blink", "tilt", "sit", "belly", "loaf"]
# 重着色源帧(loadRecolorBaseImages, 160px)
RECOLOR_SRC = [("orange_unified", "idle", "jpg")]
RECOLOR_SRC += [("orange_pixel_walk", f, "jpg") for f in WALK]
RECOLOR_SRC += [("orange_pixel_actions", f, "jpg") for f in ACTION5]

DISPLAY = 256
RECOLOR = 160

# (目录, 文件名, 扩展名) 清单 —— 全部相对 cats/
plan = []

def add(path_dir, name, ext, size):
    plan.append((path_dir, f"{name}.{ext}", size))

# --- 橘猫显示帧 ---
add("orange_unified", "idle", "png", DISPLAY)
for f in WALK:
    add("orange_pixel_walk", f, "png", DISPLAY)
for f in ACTION5:
    add("orange_pixel_actions", f, "png", DISPLAY)
for f in ORANGE_EXTRA_JPG:
    add("orange_unified", f, "jpg", DISPLAY)

# --- 其余品种: idlePath + actionPath + walkPath ---
BREEDS = {
    "calico":      ("png/calico/idle.png", "calico_actions", "calico_walk", "png", "png"),
    "black":       (None, "png/black/actions", "png/black/walk_png", "png", "png"),
    "white":       (None, "png/white/actions", "png/white/walk", "png", "png"),
    "tuxedo":      (None, "png/tuxedo/actions", "png/tuxedo/walk", "png", "png"),
    "russianblue": (None, "png/russianblue/actions", "png/russianblue/walk", "png", "png"),
    "tabby":       (None, "png/tabby/actions", "png/tabby/walk", "png", "png"),
    "ragdoll":     (None, "png/ragdoll/actions", "png/ragdoll/walk", "png", "png"),
    "munchkin":    ("png/munchkin_v7/idle.png", "png/munchkin_v7/actions", "png/munchkin_v7/walk", "png", "png"),
    "maine":       (None, "png/maine/actions", "png/maine/walk", "png", "png"),
    "devon":       (None, "png/devon/actions", "png/devon/walk", "png", "jpg"),
    "sphynx":      (None, "png/sphynx/actions", "png/sphynx/walk", "png", "png"),
    "lion":        (None, "png/lion/actions", "png/lion/walk_png", "png", "png"),
    "bengal":      (None, "png/bengal/actions", "png/bengal/walk", "png", "png"),
}
BREED_IDLE_DIR = {}
for breed, (idle_direct, act_dir, walk_dir, act_ext, walk_ext) in BREEDS.items():
    idle_dir = os.path.dirname(idle_direct).replace("\\", "/") if idle_direct else f"png/{breed}"
    BREED_IDLE_DIR[breed] = idle_dir
    add(idle_dir, "idle", "png", DISPLAY)
    for f in ACTION5:
        add(act_dir, f, act_ext, DISPLAY)
    for f in WALK:
        add(walk_dir, f, walk_ext, DISPLAY)

# --- 重着色源帧 160px ---
for d, n, e in RECOLOR_SRC:
    add(d, n, e, RECOLOR)

# --- pet-ui 图鉴/领养网格用的静态图 cats/cat_<id>.png ---
CAT_IDS = list(BREEDS.keys()) + ["orange"]

def resize(src_path, dst_path, size):
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    with Image.open(src_path) as im:
        w, h = im.size
        ratio = min(size / w, size / h)
        if ratio >= 1:
            out = im.copy()
        else:
            nw, nh = max(1, round(w * ratio)), max(1, round(h * ratio))
            out = im.resize((nw, nh), Image.NEAREST)
        if dst_path.lower().endswith((".jpg", ".jpeg")):
            if out.mode not in ("RGB", "L"):
                out = out.convert("RGB")
            out.save(dst_path, "JPEG", quality=90, optimize=True)
        else:
            if out.mode != "RGBA":
                out = out.convert("RGBA")
            out.save(dst_path, "PNG", optimize=True)

missing, copied = [], 0
for d, fn, size in plan:
    sp = os.path.join(SRC, d.replace("/", os.sep), fn)
    if not os.path.isfile(sp):
        missing.append(os.path.join(d, fn))
        continue
    resize(sp, os.path.join(DST, d.replace("/", os.sep), fn), size)
    copied += 1

# cat_<id>.png: 优先用交接包现成文件,缺失则用该品种 idle 帧生成
for cid in CAT_IDS:
    dst_png = os.path.join(DST, f"cat_{cid}.png")
    if os.path.isfile(dst_png):
        continue
    sp = os.path.join(SRC, f"cat_{cid}.png")
    if os.path.isfile(sp):
        resize(sp, dst_png, DISPLAY)
        copied += 1
        continue
    # 从已提取的 idle 生成
    if cid == "orange":
        idle_src = os.path.join(DST, "orange_unified", "idle.png")
    else:
        idle_dir = BREED_IDLE_DIR.get(cid, f"png/{cid}")
        idle_src = os.path.join(DST, idle_dir.replace("/", os.sep), "idle.png")
    if os.path.isfile(idle_src):
        resize(idle_src, dst_png, DISPLAY)
        copied += 1
    else:
        missing.append(f"cat_{cid}.png")

total_mb = sum(
    os.path.getsize(os.path.join(r, f))
    for r, _, fs in os.walk(DST) for f in fs
) / 1048576
print(f"copied={copied} missing={len(missing)} total={total_mb:.1f}MB")
for m in missing:
    print("MISSING:", m)
if missing:
    sys.exit(1)
