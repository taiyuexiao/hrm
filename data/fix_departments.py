#!/usr/bin/env python3
import json
import numpy as np
import pandas as pd

np.random.seed(2024)

CORRECT_DEPTS = [
    '信息管理部', '信息统计部', '数据开发部', '数据平台部',
    '数据治理部', '综合管理部', '研发管理部', '智能平台部',
    '智能应用一部', '智能应用二部', '机构服务团队', '测试管理部'
]

DEPT_QUOTAS = {
    '信息管理部': 25, '信息统计部': 25, '数据开发部': 40, '数据平台部': 22,
    '数据治理部': 10, '综合管理部': 10, '研发管理部': 8, '智能平台部': 11,
    '智能应用一部': 16, '智能应用二部': 18, '机构服务团队': 10, '测试管理部': 5,
}

DEPT_GROUP_MAP = {
    '信息管理部': ['服务管理组', '服务支持组', '管理信息组'],
    '信息统计部': ['监管统计组', '管理信息组'],
    '数据平台部': ['数据服务组', '工具开发组', '运维支持组', '架构安全组'],
    '数据开发部': ['需求接入组', '模型设计组', '应用开发组', '数仓开发组'],
    '数据治理部': ['标准质量组', '监管数据治理', '数据安全组'],
    '综合管理部': ['行政事务组', '人力资源组', '财务管控组'],
    '研发管理部': ['项目管理团队', '标准质量组', '技术规划组'],
    '智能平台部': ['AI基础研发组', '风险模型组', '架构安全组'],
    '智能应用一部': ['对公应用组', '零售应用组', 'AI产品运营组'],
    '智能应用二部': ['对公应用组', '零售应用组', 'AI产品运营组'],
    '机构服务团队': ['分行BP', '零售BP', '非零BP'],
    '测试管理部': ['测试管理组', '自动化测试组', '性能测试组'],
}

with open('src/data/employee-synthetic.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
employees = data['employees']
N = len(employees)

print(f"加载完成: {N} 人")

quota_list = []
for dept, count in DEPT_QUOTAS.items():
    quota_list.extend([dept] * count)
np.random.shuffle(quota_list)

for i, emp in enumerate(employees):
    old_dept = emp['所属科室']
    new_dept = quota_list[i]
    emp['所属科室'] = new_dept
    groups = DEPT_GROUP_MAP.get(new_dept, ['综合组'])
    emp['所属分组'] = np.random.choice(groups)
    if old_dept in emp.get('_summary', ''):
        emp['_summary'] = emp['_summary'].replace(old_dept, new_dept, 1)
    if '科室周报联动' in emp and emp['科室周报联动'] and old_dept in emp['科室周报联动']:
        emp['科室周报联动'] = emp['科室周报联动'].replace(old_dept, new_dept)

print(f"新科室分布:")
from collections import Counter
for d in CORRECT_DEPTS:
    print(f"  {d}: {sum(1 for e in employees if e['所属科室']==d)}人")

data['meta']['fields'] = list(employees[0].keys())
data['meta']['departments'] = CORRECT_DEPTS

with open('src/data/employee-synthetic.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# CSV: skip complex nested fields
df_out = pd.DataFrame(employees)
for col in df_out.columns:
    if col in ['weeklyReports']:
        df_out = df_out.drop(columns=[col])
        continue
    if df_out[col].apply(lambda x: isinstance(x, (list, dict))).any():
        df_out[col] = df_out[col].apply(lambda x: json.dumps(x, ensure_ascii=False) if isinstance(x, (list, dict)) else str(x))

df_out.to_csv('src/data/employee-synthetic.csv', index=False, encoding='utf-8-sig')

print(f"\n修复完成！字段数: {len(employees[0].keys())}")
