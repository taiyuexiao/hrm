#!/usr/bin/env python3
"""
基于合成数据+星形模型周报，为200人生成完整的员工画像标签体系
输出: src/data/employee-portrait.json
"""

import json
import numpy as np

np.random.seed(2026)

# ========== 0. 加载数据 ==========
with open('src/data/employee-synthetic.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
employees = data['employees']

with open('src/data/employee-weekly-star-schema.json', 'r', encoding='utf-8') as f:
    star = json.load(f)

facts = star['fact_table']['records']

# 构建 employee_id -> 周报事实记录 映射
emp_weekly: dict = {}
for f in facts:
    eid = f['employee_id']
    if eid not in emp_weekly:
        emp_weekly[eid] = []
    emp_weekly[eid].append(f)

# ========== 1. 标签生成辅助函数 ==========

def score_to_label(score: int) -> str:
    if score >= 5: return '精通'
    if score >= 4: return '熟练'
    if score >= 3: return '掌握'
    if score >= 2: return '了解'
    return '入门'

def perf_level(avg: float) -> str:
    if avg >= 4.0: return '高绩效'
    if avg >= 3.5: return '中上绩效'
    if avg >= 3.0: return '中等绩效'
    if avg >= 2.5: return '中下绩效'
    return '低绩效'

def perf_stability(b_minus: int, a_plus: int) -> str:
    if b_minus >= 2: return '波动大'
    if a_plus >= 2: return '高波动（向上）'
    if b_minus == 0 and a_plus == 0: return '稳定'
    return '轻度波动'

def calc_saturation_trend(weeklies: list) -> str:
    if len(weeklies) < 2: return '稳定'
    scores = [w['saturation_score'] for w in weeklies]
    # 简单线性趋势
    trend = scores[-1] - scores[0]
    if trend > 5: return '逐周上升'
    if trend < -5: return '逐周下降'
    # 检查波动
    std = np.std(scores)
    if std > 8: return '波动较大'
    return '基本稳定'

def calc_completion_trend(weeklies: list) -> str:
    if len(weeklies) < 2: return '稳定'
    rates = [w['task_completion_rate'] for w in weeklies]
    trend = rates[-1] - rates[0]
    if trend > 0.1: return '提升'
    if trend < -0.1: return '下降'
    return '稳定'

def calc_problem_freq(weeklies: list) -> str:
    problems = [w for w in weeklies if w.get('problems') and w['problems'] != '无']
    ratio = len(problems) / len(weeklies) if weeklies else 0
    if ratio >= 0.5: return '高'
    if ratio >= 0.25: return '中'
    return '低'

def project_focus(weeklies: list) -> str:
    if not weeklies: return '未知'
    projects = [w['primary_project_id'] for w in weeklies]
    unique = len(set(projects))
    if unique >= 3: return '多项目并行'
    if unique == 2: return '双项目切换'
    return '单项目专注'

def calc_risk_mismatch(emp: dict) -> str:
    pos = emp['拟岗位']
    # 获取相关技能均分
    relevant = []
    if '数据研发' in pos:
        relevant = [emp['数据研发师-SQL开发'], emp['数据研发师-数据模型设计'], emp['数据研发师-业务理解']]
    elif '数据分析' in pos:
        relevant = [emp['数据分析师-数据分析工具运用能力'], emp['数据分析师-算法模型开发能力'], emp['数据分析师-营销运营能力']]
    elif '应用研发' in pos or '架构' in pos:
        relevant = [emp['应用研发-技术架构设计'], emp['应用研发-应用开发能力']]
    elif '算法' in pos or '智能' in pos:
        relevant = [emp['AI算法工程师-数学与建模理论基础'], emp['AI算法工程师-编程与工程实现']]
    
    if not relevant:
        return '未知'
    avg = np.mean(relevant)
    if avg >= 4.0: return '低风险-高度匹配'
    if avg >= 3.0: return '中风险-基本匹配'
    if avg >= 2.5: return '高风险-轻度错配'
    return '极高风险-严重错配'

def calc_risk_burnout(emp: dict, weeklies: list) -> str:
    if not weeklies: return '未知'
    high_load_weeks = sum(1 for w in weeklies if w['load_level'] == '高负荷')
    avg_completion = np.mean([w['task_completion_rate'] for w in weeklies])
    
    if high_load_weeks >= 3 and avg_completion < 0.7:
        return '高风险-持续高负荷且完成率低'
    if high_load_weeks >= 3:
        return '中风险-持续高负荷'
    if high_load_weeks >= 2 and avg_completion < 0.65:
        return '中风险-高负荷+低完成率'
    return '低风险'

def calc_risk_turnover(emp: dict, weeklies: list) -> str:
    score = 0
    # 低绩效
    if emp['近2年绩效平均分'] < 3.0: score += 2
    elif emp['近2年绩效平均分'] < 3.5: score += 1
    # 低360评价
    eval_scores = {'A+': 5, 'A': 4, 'A-': 3, 'B+': 3, 'B': 2, 'B-': 1}
    sup = eval_scores.get(emp['综合评价（A+、A、A-、B、B-）-直属上级'], 3)
    peer = eval_scores.get(emp['综合评价（A+、A、A-、B、B-）-同级同事'], 3)
    if sup <= 2: score += 2
    if peer <= 2: score += 1
    # 高请假
    if emp['近1年病假天数'] + emp['近1年事假天数'] > 5: score += 1
    # 高工时但低完成率
    if weeklies:
        avg_hours = np.mean([w['work_hours'] for w in weeklies])
        avg_comp = np.mean([w['task_completion_rate'] for w in weeklies])
        if avg_hours > 45 and avg_comp < 0.6: score += 2
    # 无项目
    if emp['近2年牵头项目个数'] == 0 and not emp['重点项目成员标识']: score += 1
    
    if score >= 5: return '高风险'
    if score >= 3: return '中风险'
    return '低风险'

def calc_potential(emp: dict, weeklies: list) -> str:
    score = 0
    # 高绩效
    if emp['近2年绩效平均分'] >= 4.0: score += 3
    elif emp['近2年绩效平均分'] >= 3.5: score += 2
    elif emp['近2年绩效平均分'] >= 3.0: score += 1
    # 高技能
    skill_scores = [emp[k] for k in emp if '能力' in k or '设计' in k or '开发' in k or '理论基础' in k or '实现' in k]
    skill_scores = [s for s in skill_scores if isinstance(s, int)]
    if np.mean(skill_scores) >= 4.0: score += 2
    elif np.mean(skill_scores) >= 3.5: score += 1
    # 高360评价
    if emp['综合评价（A+、A、A-、B、B-）-直属上级'] in ['A+', 'A']: score += 1
    if emp['综合评价（A+、A、A-、B、B-）-同级同事'] in ['A+', 'A']: score += 1
    # 学习成长
    if emp['学习能力'] >= 4: score += 1
    if emp['创新思维'] >= 4: score += 1
    # 项目经验
    if emp['近2年牵头项目个数'] >= 2: score += 1
    if emp['组长/骨干标识']: score += 1
    # 周报趋势
    if weeklies:
        comp_trend = calc_completion_trend(weeklies)
        sat_trend = calc_saturation_trend(weeklies)
        if comp_trend == '提升': score += 1
        if sat_trend == '逐周上升': score += 1
    # 知识贡献
    if emp['年度部门内分享/培训次数（作为培训者）'] > 0: score += 1
    if emp['近2年带教的实习生数量'] > 0 or emp['近2年带教的校招新行员的数量'] > 0: score += 1
    
    if score >= 8: return '高潜人才-重点培养'
    if score >= 5: return '成长型-持续关注'
    if score >= 3: return '稳定型-维持现状'
    return '待观察-需干预'

def collaboration_style(emp: dict) -> str:
    leadership = emp['领导力']
    teamwork = emp['团队合作']
    sup = emp['综合评价（A+、A、A-、B、B-）-直属上级']
    
    if leadership >= 4 and sup in ['A+', 'A']:
        return '领导力型-善于带团队'
    if teamwork >= 4 and sup in ['A+', 'A', 'A-']:
        return '团队合作型-协作能力强'
    if leadership <= 2 and teamwork <= 2:
        return '独立型-偏好独自工作'
    if emp['近2年带教的实习生数量'] > 0 or emp['近2年带教的校招新行员的数量'] > 0:
        return '导师型-乐于培养新人'
    return '均衡型-无明显偏向'

def calc_role_tags(emp: dict) -> list:
    roles = []
    if emp['组长/骨干标识']: roles.append('组长/骨干')
    if emp['重点项目成员标识']: roles.append('重点项目成员')
    if emp['内部项目支持（担任PM）'] or emp['外部项目支持（担任PM）']: roles.append('项目经理')
    if emp['敏捷角色（PO/SM）']: roles.append('敏捷角色')
    if emp['产品经理-业务分析'] or emp['产品经理-产品设计']: roles.append('产品经理')
    
    # 技术角色
    pos = emp['拟岗位']
    if '架构' in pos: roles.append('架构师')
    elif '算法' in pos: roles.append('算法专家')
    elif '数据研发' in pos: roles.append('数据工程师')
    elif '数据分析' in pos: roles.append('数据分析师')
    elif '应用研发' in pos: roles.append('开发工程师')
    elif '测试' in pos: roles.append('测试工程师')
    elif '需求' in pos: roles.append('需求分析师')
    
    # 知识贡献
    if emp['年度部门内分享/培训次数（作为培训者）'] >= 2: roles.append('培训讲师')
    if emp['近2年带教的实习生数量'] > 0 or emp['近2年带教的校招新行员的数量'] > 0: roles.append('导师')
    if emp['近2年行外发表的论文、杂志的数量'] > 0: roles.append('技术布道者')
    
    return roles

def calc_overall_score(emp: dict, weeklies: list) -> dict:
    # 能力分 (0-100)
    skill_scores = [emp[k] for k in emp if '能力' in k or '设计' in k or '开发' in k or '理论基础' in k or '实现' in k]
    skill_scores = [s for s in skill_scores if isinstance(s, int)]
    capability = min(100, round(np.mean(skill_scores) / 5 * 100))
    
    # 绩效分 (0-100)
    perf = emp['近2年绩效平均分']
    performance = min(100, round(perf / 5 * 100))
    
    # 协作分 (0-100)
    eval_scores = {'A+': 100, 'A': 90, 'A-': 80, 'B+': 70, 'B': 60, 'B-': 50}
    sup = eval_scores.get(emp['综合评价（A+、A、A-、B、B-）-直属上级'], 70)
    peer = eval_scores.get(emp['综合评价（A+、A、A-、B、B-）-同级同事'], 70)
    sub = eval_scores.get(emp['综合评价（A+、A、A-、B、B-）-下级（如有）'], 70)
    collaboration = round((sup + peer + sub) / 3)
    
    # 潜力分 (0-100)
    potential_score = 50
    if emp['学习能力'] >= 4: potential_score += 10
    if emp['创新思维'] >= 4: potential_score += 10
    if emp['近2年牵头项目个数'] >= 2: potential_score += 10
    if emp['年度部门内分享/培训次数（作为培训者）'] > 0: potential_score += 5
    if weeklies:
        avg_comp = np.mean([w['task_completion_rate'] for w in weeklies])
        potential_score += round(avg_comp * 20)
    potential = min(100, potential_score)
    
    # 工作投入分 (0-100)
    work = 60
    if emp['近2年日均工时'] >= 9: work += 15
    elif emp['近2年日均工时'] >= 8: work += 10
    if emp['近3个月查看知识库会议纪要次数'] >= 20: work += 10
    if weeklies:
        avg_sat = np.mean([w['saturation_score'] for w in weeklies])
        work += round((avg_sat - 70) / 30 * 20)
    work = min(100, max(0, work))
    
    # 综合分
    overall = round((capability + performance + collaboration + potential + work) / 5)
    
    return {
        '能力分': capability,
        '绩效分': performance,
        '协作分': collaboration,
        '潜力分': potential,
        '工作投入分': work,
        '综合分': overall,
    }

# ========== 2. 为每个人生成画像 ==========
portraits = {}

for emp in employees:
    eid = emp['员工ID']
    weeklies = emp_weekly.get(eid, [])
    
    # 能力标签
    capability = {
        '数据研发': score_to_label(emp['数据研发师-SQL开发']),
        '数据分析': score_to_label(emp['数据分析师-数据分析工具运用能力']),
        'AI算法': score_to_label(emp['AI算法工程师-数学与建模理论基础']),
        '应用研发': score_to_label(emp['应用研发-应用开发能力']),
        '架构设计': score_to_label(emp['应用研发-技术架构设计']),
        '学习能力': score_to_label(emp['学习能力']),
        '创新思维': score_to_label(emp['创新思维']),
        '领导力': score_to_label(emp['领导力']),
        '团队合作': score_to_label(emp['团队合作']),
    }
    
    # 能力长短板
    skill_items = [(k.replace('数据分析师-', '').replace('数据研发师-', '').replace('应用研发-', '').replace('AI算法工程师-', ''), v) 
                   for k, v in emp.items() if any(x in k for x in ['能力', '设计', '开发', '理论基础', '实现', '学习', '创新', '领导', '团队'])]
    skill_items = [(k, v) for k, v in skill_items if isinstance(v, int)]
    skill_items.sort(key=lambda x: x[1], reverse=True)
    strengths = [k for k, v in skill_items if v >= 4][:3]
    weaknesses = [k for k, v in skill_items if v <= 2][:3]
    
    # 绩效标签
    performance = {
        '绩效等级': perf_level(emp['近2年绩效平均分']),
        '绩效稳定性': perf_stability(emp['近2年内绩效为B-及以下的次数'], emp['近2年内获得A+的次数']),
        'A+频次': emp['近2年内获得A+的次数'],
        'B-频次': emp['近2年内绩效为B-及以下的次数'],
    }
    
    # 工作模式标签
    work_pattern = {
        '饱和度趋势': calc_saturation_trend(weeklies) if weeklies else '未知',
        '任务完成率趋势': calc_completion_trend(weeklies) if weeklies else '未知',
        '项目专注度': project_focus(weeklies) if weeklies else '未知',
        '问题暴露频率': calc_problem_freq(weeklies) if weeklies else '未知',
        '平均周工时': round(np.mean([w['work_hours'] for w in weeklies]), 1) if weeklies else 0,
        '平均饱和度': round(np.mean([w['saturation_score'] for w in weeklies]), 1) if weeklies else 0,
        '平均任务完成率': round(np.mean([w['task_completion_rate'] for w in weeklies]), 2) if weeklies else 0,
    }
    
    # 角色标签
    roles = calc_role_tags(emp)
    
    # 发展潜力
    potential = calc_potential(emp, weeklies)
    
    # 风险标签
    risk = {
        '岗位错配风险': calc_risk_mismatch(emp),
        '倦怠风险': calc_risk_burnout(emp, weeklies),
        '离职风险': calc_risk_turnover(emp, weeklies),
    }
    
    # 协作标签
    collaboration = {
        '直属上级评价': emp['综合评价（A+、A、A-、B、B-）-直属上级'],
        '同级同事评价': emp['综合评价（A+、A、A-、B、B-）-同级同事'],
        '下级评价': emp['综合评价（A+、A、A-、B、B-）-下级（如有）'],
        '协作风格': collaboration_style(emp),
    }
    
    # 项目标签
    projects = emp.get('手头项目', [])
    
    # 综合评分
    scores = calc_overall_score(emp, weeklies)
    
    # 一句话画像摘要
    summary = f"{emp['姓名']}（{emp['所属科室']}/{emp['拟岗位']}/{emp['所属分组']}）"
    summary += f" | {emp['性别']}，{emp['年龄']}岁，{emp['最高学历']}"
    summary += f" | 绩效{emp['近2年绩效平均分']}分({performance['绩效等级']})"
    summary += f" | 角色：{'、'.join(roles[:3])}"
    summary += f" | 潜力：{potential}"
    summary += f" | 风险：错配{risk['岗位错配风险'].split('-')[0]}/倦怠{risk['倦怠风险'].split('-')[0]}/离职{risk['离职风险'].split('-')[0]}"
    summary += f" | 综合分：{scores['综合分']}"
    
    portraits[emp['姓名']] = {
        'basic': {
            '员工ID': eid,
            '姓名': emp['姓名'],
            '科室': emp['所属科室'],
            '分组': emp['所属分组'],
            '岗位': emp['拟岗位'],
            '性别': emp['性别'],
            '年龄': emp['年龄'],
            '学历': emp['最高学历'],
            '行龄': emp['行龄'],
            '司龄': emp['司龄'],
        },
        'capability': {
            '能力标签': capability,
            '能力长板': strengths,
            '能力短板': weaknesses,
        },
        'performance': performance,
        'workPattern': work_pattern,
        'role': roles,
        'potential': potential,
        'risk': risk,
        'collaboration': collaboration,
        'projects': projects,
        'scores': scores,
        '_summary': summary,
    }

# ========== 3. 保存 ==========
output = {
    'meta': {
        'total': len(portraits),
        'generated_at': '2026-05-18',
        'dimensions': ['basic', 'capability', 'performance', 'workPattern', 'role', 'potential', 'risk', 'collaboration', 'projects', 'scores'],
    },
    'employees': portraits,
}

with open('src/data/employee-portrait.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"员工画像生成完成！共 {len(portraits)} 人")

# 统计
potential_dist = {}
risk_dist = {'低风险': 0, '中风险': 0, '高风险': 0}
for p in portraits.values():
    pot = p['potential']
    potential_dist[pot] = potential_dist.get(pot, 0) + 1
    for k, v in p['risk'].items():
        level = v.split('-')[0]
        risk_dist[level] = risk_dist.get(level, 0) + 1

print(f"\n=== 潜力分布 ===")
for k, v in sorted(potential_dist.items()):
    print(f"  {k}: {v}人")

print(f"\n=== 风险标签统计 ===")
for k, v in sorted(risk_dist.items()):
    print(f"  {k}: {v}次")

# 样例
sample = list(portraits.values())[0]
print(f"\n=== 样例：{sample['basic']['姓名']} ===")
print(f"摘要: {sample['_summary']}")
print(f"能力: {sample['capability']['能力标签']}")
print(f"长板: {sample['capability']['能力长板']}")
print(f"短板: {sample['capability']['能力短板']}")
print(f"绩效: {sample['performance']}")
print(f"工作模式: {sample['workPattern']}")
print(f"角色: {sample['role']}")
print(f"潜力: {sample['potential']}")
print(f"风险: {sample['risk']}")
print(f"协作: {sample['collaboration']}")
print(f"评分: {sample['scores']}")
