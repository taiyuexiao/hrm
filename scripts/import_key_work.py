#!/usr/bin/env python3
"""
从部门周报 xlsx 中提取「重点工作推进情况」，语义分拆为本周/下周，
追加到系统数据库对应记录的 content（本周重点工作）和 next_plan（下周重点工作）中。
"""

import json
import openpyxl
import os
import random
import re
import sqlite3
import time

DB_PATH = 'backend/data/hr.db'
XLSX_DIR = 'data/周报/部门周报'

# ---------- 文本解析工具（复刻前端 parsePlanToTree） ----------

HEADING_PATTERNS = [
    (re.compile(r'^[一二三四五六七八九十]+、'), 0),
    (re.compile(r'^[（(][一二三四五六七八九十]+[）)]'), 2),
    (re.compile(r'^\d+、'), 1),
    (re.compile(r'^\d+\.'), 1),
    (re.compile(r'^\d+[）)]'), 2),
    (re.compile(r'^[（(]\d+[）)]'), 2),
    (re.compile(r'^[①②③④⑤⑥⑦⑧⑨⑩]'), 1),
]

DOMAIN_LABELS = re.compile(
    r'^(?:对公BP|零售BP|办公领域|对公领域|零售领域|基础板块|风险板块|金市板块|'
    r'AI手机银行(?:二期)?项目|大模型底座建设|平台与架构建设|场景赋能|'
    r'反欺诈智能化建设|反洗钱报送本体应用|运管智能录入和智能审核项目|'
    r'运营风险监控信创改造项目|AI专项人力采购|中试基地项目申报|'
    r'智能研发部牵头项目|商务进展|人员培养|信创项目|风险BP工作|'
    r'支行经营智库建设|非现场监测分析挖掘|风险预警特征挖掘|授信管理看板|'
    r'对公授信全流程智能化项目)[：:]?'
)


def gen_id():
    return f"{int(time.time() * 1000)}-{random.randint(100000, 999999)}"


def detect_heading_level(line):
    stripped = line.strip()
    if not stripped:
        return -1
    if DOMAIN_LABELS.match(stripped):
        return 0
    if re.match(r'^[\u4e00-\u9fa5]{2,8}[:：]$', stripped):
        return 0
    for pat, level in HEADING_PATTERNS:
        if pat.match(stripped):
            return level
    return -1


def split_inline_headings(line):
    if re.search(r'[：:；;]\s*\d+[）\.][、.]?', line):
        parts = re.split(r'(?<=[：:；;])\s*(?=\d+[）\.][、.]?)', line)
        return [p.strip() for p in parts if p.strip()]
    return [line]


def parse_plan_to_tree(plan_text):
    """将纯文本解析为 TaskItem 树形数组（复刻前端 parsePlanToTree）"""
    if not plan_text or not plan_text.strip():
        return []

    lines = plan_text.split('\n')
    root = {'id': 'root', 'text': 'ROOT', 'checked': False, 'children': []}
    stack = [{'node': root, 'level': -1}]

    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped:
            continue

        split_lines = split_inline_headings(raw_line)
        for sl in split_lines:
            level = detect_heading_level(sl)
            text = sl.strip()
            is_leaf = False

            if level == -1:
                parent = stack[-1]['node']
                if parent.get('children') and len(parent['children']) > 0:
                    last = parent['children'][-1]
                    if not last.get('children') or len(last['children']) == 0:
                        last['text'] += ' ' + text
                        continue
                is_leaf = True

            effective_level = 3 if level == -1 else level
            node = {
                'id': gen_id(),
                'text': text,
                'checked': False,
                'children': None if is_leaf else []
            }

            while len(stack) > 1 and stack[-1]['level'] >= effective_level:
                stack.pop()

            parent = stack[-1]['node']
            if 'children' not in parent or parent['children'] is None:
                parent['children'] = []
            parent['children'].append(node)
            if not is_leaf:
                stack.append({'node': node, 'level': effective_level})

    return root.get('children', [])


# ---------- 语义分拆工具 ----------

def split_key_work(text):
    """将重点工作推进情况拆分为本周和下周两部分"""
    if not text or not str(text).strip():
        return "", ""

    text = str(text).strip()

    # 步骤1: 识别明确的分区标记
    next_markers = ['下周计划：', '下周计划:', '下周计划', '下一步工作：', '下一步工作:', '下一步工作',
                    '下周工作：', '下周工作:', '下周工作', '下周\n']
    this_markers = ['本周进展：', '本周进展:', '本周进展', '本周进度：', '本周进度:', '本周进度',
                    '当前进展：', '当前进展:', '当前进展', '本周工作：', '本周工作:', '本周工作',
                    '本周：', '本周:', '本周\n']

    next_pos = -1
    for marker in next_markers:
        idx = text.find(marker)
        if idx != -1 and (next_pos == -1 or idx < next_pos):
            next_pos = idx

    this_pos = -1
    for marker in this_markers:
        idx = text.find(marker)
        if idx != -1 and (this_pos == -1 or idx < this_pos):
            this_pos = idx

    if this_pos != -1 and next_pos != -1:
        if this_pos < next_pos:
            return text[this_pos:next_pos].strip(), text[next_pos:].strip()
        else:
            return text[this_pos:].strip(), text[next_pos:this_pos].strip()

    if next_pos != -1 and this_pos == -1:
        before = text[:next_pos].strip()
        after = text[next_pos:].strip()
        if len(before) < 30:
            return "", after
        return before, after

    # 步骤2: 没有明确分区标记，按句子级分析
    sentences = re.split(r'(?<=[。；!！\n])\s*', text)
    this_parts = []
    next_parts = []

    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue

        has_next_week = '下周' in sent
        has_next_step = '下一步' in sent and any(w in sent for w in ['工作', '计划', '推进', '行动'])
        has_this_week = any(w in sent for w in ['本周', '已完成', '当前', '已确认', '已投产', '已上线',
                                                  '已解决', '已发布', '已分配', '已制定'])

        if (has_next_week or has_next_step) and not has_this_week:
            next_parts.append(sent)
        else:
            this_parts.append(sent)

    return '\n'.join(this_parts), '\n'.join(next_parts)


def normalize_dept(dept_name):
    dept = str(dept_name).strip()
    if dept.startswith('智能研发部-'):
        return dept[len('智能研发部-'):]
    return dept


def add_highlighted(tasks):
    """给 TaskItem 数组添加 highlighted=true"""
    for task in tasks:
        task['highlighted'] = True
        if task.get('children'):
            add_highlighted(task['children'])
    return tasks


# ---------- 主流程 ----------

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    files = sorted([f for f in os.listdir(XLSX_DIR)
                    if f.endswith('.xlsx') and not f.startswith('.~')])

    total_records = 0
    updated_records = 0
    stats = {'this_week': 0, 'next_week': 0}

    for fname in files:
        week_label = fname.replace('数据部工作周报-', '').replace('.xlsx', '')
        wb = openpyxl.load_workbook(f'{XLSX_DIR}/{fname}', data_only=True, read_only=True)
        sheet = wb.active

        for row in sheet.iter_rows(min_row=2, values_only=True):
            if not row or not row[0]:
                continue

            dept = normalize_dept(row[0])
            key_work = row[5] if len(row) > 5 and row[5] else ''
            if not key_work:
                continue

            total_records += 1
            tw_text, nw_text = split_key_work(str(key_work))

            # 查询现有记录
            cursor.execute(
                "SELECT content, next_plan FROM weekly_reports WHERE week_label = ? AND dept = ?",
                (week_label, dept)
            )
            result = cursor.fetchone()
            if not result:
                print(f"⚠️ 未找到记录: {week_label} / {dept}")
                continue

            content_json, next_plan_val = result

            # ---------- 处理本周重点工作 (content) ----------
            if tw_text.strip():
                try:
                    content_tasks = json.loads(content_json) if content_json else []
                except json.JSONDecodeError:
                    content_tasks = []

                new_this_tasks = parse_plan_to_tree(tw_text)
                if new_this_tasks:
                    add_highlighted(new_this_tasks)
                    content_tasks.extend(new_this_tasks)
                    stats['this_week'] += 1

                    cursor.execute(
                        "UPDATE weekly_reports SET content = ?, updated_at = ? WHERE week_label = ? AND dept = ?",
                        (json.dumps(content_tasks, ensure_ascii=False),
                         time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()),
                         week_label, dept)
                    )

            # ---------- 处理下周重点工作 (next_plan) ----------
            if nw_text.strip():
                # next_plan 可能是 JSON 数组或纯文本
                if next_plan_val and next_plan_val.strip().startswith('['):
                    try:
                        next_plan_tasks = json.loads(next_plan_val)
                    except json.JSONDecodeError:
                        next_plan_tasks = parse_plan_to_tree(next_plan_val)
                elif next_plan_val:
                    next_plan_tasks = parse_plan_to_tree(next_plan_val)
                else:
                    next_plan_tasks = []

                new_next_tasks = parse_plan_to_tree(nw_text)
                if new_next_tasks:
                    add_highlighted(new_next_tasks)
                    next_plan_tasks.extend(new_next_tasks)
                    stats['next_week'] += 1

                    cursor.execute(
                        "UPDATE weekly_reports SET next_plan = ?, updated_at = ? WHERE week_label = ? AND dept = ?",
                        (json.dumps(next_plan_tasks, ensure_ascii=False),
                         time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()),
                         week_label, dept)
                    )

            updated_records += 1

        wb.close()

    conn.commit()
    conn.close()

    print(f"\n✅ 处理完成")
    print(f"   总记录数: {total_records}")
    print(f"   更新记录数: {updated_records}")
    print(f"   追加本周重点工作的记录: {stats['this_week']}")
    print(f"   追加下周重点工作的记录: {stats['next_week']}")


if __name__ == '__main__':
    main()
