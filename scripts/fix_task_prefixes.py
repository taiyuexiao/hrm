#!/usr/bin/env python3
"""
批量去除数据库中所有 TaskItem 的文本序号前缀，解决"多重序号"问题。
"""

import json
import re
import sqlite3

DB_PATH = 'backend/data/hr.db'

# 与前端 stripTaskPrefix 保持一致的序号前缀匹配规则
_STRIP_PATTERNS = [
    re.compile(r'^(?:\d{1,2}(?:\.\d{1,2})*[\.、\s)）]+)'),  # 1. / 1、 / 1.1、 / 1）/ 1.1. 
    re.compile(r'^(?:（\d{1,2}(?:\.\d{1,2})*）)'),           # （1）/（1.1）
    re.compile(r'^(?:[一二三四五六七八九十]+[、）])'),       # 一、/ 一）
    re.compile(r'^(?:（[一二三四五六七八九十]+）[）]?)'),    # （一）/（一
    re.compile(r'^(?:[①②③④⑤⑥⑦⑧⑨⑩]+)'),               # ①
    re.compile(r'^(?:[\(\（][①②③④⑤⑥⑦⑧⑨⑩]+[\)\）])'),   # （①）
]


def strip_task_prefix(text: str) -> str:
    """去除文本开头的序号前缀"""
    for pat in _STRIP_PATTERNS:
        m = pat.match(text)
        if m:
            return text[m.end():].strip()
    return text


def fix_tasks(tasks):
    """递归修复 TaskItem 数组中的序号前缀"""
    for task in tasks:
        task['text'] = strip_task_prefix(task.get('text', ''))
        if task.get('children'):
            fix_tasks(task['children'])
    return tasks


def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT week_label, dept, content, next_plan FROM weekly_reports")
    updated = 0
    changed_tasks = 0

    for row in cursor.fetchall():
        week, dept, content, next_plan = row
        has_change = False

        # 修复 content
        if content:
            try:
                tasks = json.loads(content)
                if isinstance(tasks, list):
                    original = json.dumps(tasks, ensure_ascii=False)
                    fix_tasks(tasks)
                    fixed = json.dumps(tasks, ensure_ascii=False)
                    if fixed != original:
                        content = fixed
                        has_change = True
                        changed_tasks += 1
            except json.JSONDecodeError:
                pass

        # 修复 next_plan
        if next_plan:
            try:
                tasks = json.loads(next_plan)
                if isinstance(tasks, list):
                    original = json.dumps(tasks, ensure_ascii=False)
                    fix_tasks(tasks)
                    fixed = json.dumps(tasks, ensure_ascii=False)
                    if fixed != original:
                        next_plan = fixed
                        has_change = True
                        changed_tasks += 1
            except json.JSONDecodeError:
                pass

        if has_change:
            cursor.execute(
                "UPDATE weekly_reports SET content = ?, next_plan = ? WHERE week_label = ? AND dept = ?",
                (content, next_plan, week, dept)
            )
            updated += 1

    conn.commit()
    conn.close()

    print(f"✅ 修复完成")
    print(f"   更新了 {updated} 条记录")
    print(f"   涉及 {changed_tasks} 个字段变更")


if __name__ == '__main__':
    main()
