# -*- coding: utf-8 -*-
# ============================================================================
# field-source.yaml 一致性校验（实现方案 D1 红线的机器执行者，CI 强制）
#
# 校验三件事：
#   1. 提交的 字段草案-v3.xlsx 与「由 field-source.yaml 重新渲染」逐格一致（防手改 xlsx / 防漂移）
#   2. YAML 结构约束：必填级别词表封闭、条件必填必须带条件表达式、pending 字段必须有说明
#   3. 计数断言：字段数 / R0 数（防误删）
# 用法：python3 docs/standard/check_field_source.py
# ============================================================================
import os
import subprocess
import sys
import tempfile

import openpyxl
import yaml

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "field-source.yaml")
COMMITTED = os.path.join(BASE, "字段草案-v3.xlsx")
RENDERER = os.path.join(BASE, "build_field_tables.py")

KNOWN_LEVELS = {
    "required", "recommended", "optional", "definition", "none", "mixed",
    "conditional_required", "conditional_recommended",
}
EXPECTED_FIELDS = 77
EXPECTED_ENTITY_FIELDS = 46
EXPECTED_R0 = 16

errors: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


# ---- 1. YAML 结构约束 ----
with open(SRC, encoding="utf-8") as fh:
    doc = yaml.safe_load(fh)

def iter_fields(part):
    for sec in doc[part]["sections"]:
        for f in sec["fields"]:
            yield f

n_fields = sum(1 for _ in iter_fields("experiment_record"))
n_entity = sum(1 for _ in iter_fields("entities"))
n_r0 = sum(1 for f in iter_fields("experiment_record") if f.get("r0"))

if n_fields != EXPECTED_FIELDS:
    err(f"实验记录字段数 {n_fields} ≠ 预期 {EXPECTED_FIELDS}（若为有意增删，请同步更新本脚本预期值并在 changelog 记录）")
if n_entity != EXPECTED_ENTITY_FIELDS:
    err(f"一等实体字段数 {n_entity} ≠ 预期 {EXPECTED_ENTITY_FIELDS}（同上）")
if n_r0 != EXPECTED_R0:
    err(f"R0 标记数 {n_r0} ≠ 预期 {EXPECTED_R0}（R0 集合改动须导师/组会确认，见实现方案 §5）")

import re

KEY_RE = re.compile(r"^[a-z][a-zA-Z0-9_]*$")  # 单位后缀允许大写（_C 等，沿 v1 风格）
modules_map = doc.get("modules", {})
entity_keys = doc.get("entity_keys", {})
stage_types = doc.get("stage_types", {})
group_names = set((stage_types.get("groups") or {}).keys())

seen_keys: dict[str, set] = {}
for part, scope_of in (("experiment_record", lambda f: modules_map.get(f["module"])),
                       ("entities", lambda f: entity_keys.get(f["module"]))):
    for f in iter_fields(part):
        where = f"{f['module']}/{f['label']}"
        req = f.get("requirement") or {}
        level = req.get("level")
        if level not in KNOWN_LEVELS:
            err(f"{where}: 未知必填级别 level={level!r}")
        if level in ("conditional_required", "conditional_recommended") and not req.get("condition"):
            err(f"{where}: 条件级别缺少 condition 表达式")
        if req.get("condition") and not {"field", "op", "value"} <= set(req["condition"]):
            err(f"{where}: condition 缺少 field/op/value")
        if f.get("status") == "pending-alignment" and not f.get("pending"):
            err(f"{where}: pending-alignment 缺少 pending 说明")
        # D10: 机器字段键——必有、合法、模块/实体内唯一
        scope = scope_of(f)
        if scope is None:
            err(f"{where}: 模块 {f['module']!r} 未在 modules/entity_keys 映射中登记")
        key = f.get("key")
        if not key or not KEY_RE.match(str(key)):
            err(f"{where}: key 缺失或不合法: {key!r}")
        elif scope:
            if key in seen_keys.setdefault(scope, set()):
                err(f"{where}: key {key!r} 在 {scope} 内重复")
            seen_keys[scope].add(key)
        # D11: §5 字段必须有参数组
        if part == "experiment_record" and scope == "process_steps":
            if f.get("group") not in group_names:
                err(f"{where}: process_steps 字段缺少合法 group（现值 {f.get('group')!r}）")

# D11: stage_types 自洽——shows ⊆ 组名；required_extra ⊆ §5 字段键
ps_keys = {f["key"] for f in iter_fields("experiment_record") if modules_map.get(f["module"]) == "process_steps"}
for t in stage_types.get("types", []):
    bad = set(t.get("shows", [])) - group_names
    if bad:
        err(f"stage_types[{t.get('name')}]: 未知参数组 {sorted(bad)}")
    bad = set(t.get("required_extra", [])) - ps_keys
    if bad:
        err(f"stage_types[{t.get('name')}]: required_extra 引用不存在的字段键 {sorted(bad)}")
if not stage_types.get("types"):
    err("缺少 stage_types.types（§5 动态表单权威映射，D11）")

# ---- 2. xlsx 逐格一致 ----
if not os.path.exists(COMMITTED):
    err(f"缺少提交的 xlsx: {COMMITTED}")
else:
    with tempfile.TemporaryDirectory() as td:
        regen = os.path.join(td, "regen.xlsx")
        proc = subprocess.run(
            [sys.executable, RENDERER, regen], capture_output=True, text=True
        )
        if proc.returncode != 0:
            err(f"渲染器运行失败：{proc.stderr.strip()[:500]}")
        else:
            wa = openpyxl.load_workbook(COMMITTED)
            wb = openpyxl.load_workbook(regen)
            if wa.sheetnames != wb.sheetnames:
                err(f"sheet 列表不一致：{wa.sheetnames} vs {wb.sheetnames}")
            for name in wa.sheetnames:
                if name not in wb.sheetnames:
                    continue
                sa, sb = wa[name], wb[name]
                max_r = max(sa.max_row, sb.max_row)
                max_c = max(sa.max_column, sb.max_column)
                for r in range(1, max_r + 1):
                    for c in range(1, max_c + 1):
                        va, vb = sa.cell(r, c).value, sb.cell(r, c).value
                        if (va or "") != (vb or ""):
                            err(f"[{name}] r{r}c{c}: 提交版={va!r} ≠ 重新生成={vb!r}")
                            if len(errors) > 40:
                                err("……diff 过多，截断")
                                break
                    if len(errors) > 40:
                        break

if errors:
    print("❌ field-source 校验失败：")
    for e in errors:
        print("  -", e)
    print("修复方式：改 field-source.yaml → python3 docs/standard/build_field_tables.py → 重新提交 xlsx。")
    sys.exit(1)

print(f"✅ field-source 校验通过：字段 {n_fields} · 实体字段 {n_entity} · R0 {n_r0} · xlsx 与 YAML 渲染逐格一致")
