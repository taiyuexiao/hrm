#!/usr/bin/env python3
"""
基于真实员工信息表分布，生成200人合成数据
包含姓名、工号、完整54个字段
输出: src/data/employee-synthetic.json
"""

import pandas as pd
import numpy as np
import json

np.random.seed(42)

# ========== 1. 读取真实数据，分析分布 ==========
df_real = pd.read_excel('data/员工信息数据.xlsx')
N = 200

# ========== 2. 姓名生成器 ==========
SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '林', '何', '高', '罗',
            '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾', '肖', '田', '董', '袁', '潘', '于', '蒋', '蔡',
            '余', '杜', '叶', '程', '苏', '魏', '吕', '丁', '任', '沈', '姚', '卢', '姜', '崔', '钟', '谭', '陆', '汪', '范', '金',
            '石', '廖', '贾', '夏', '韦', '傅', '方', '白', '邹', '孟', '熊', '秦', '邱', '江', '尹', '薛', '闫', '段', '雷', '侯',
            '龙', '史', '黎', '贺', '顾', '毛', '郝', '龚', '邵', '万', '钱', '严', '覃', '武', '戴', '孔']

NAME_CHARS = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀英', '华', '鹏',
              '飞', '婷', '宇', '浩', '欣', '雨', '晨', '轩', '昊', '瑞', '嘉', '怡', '彤', '琪', '涵', '梓', '辰', '一', '诺', '墨',
              '言', '安', '若', '溪', '沐', '白', '初', '晚', '予', '南', '知', '宜', '念', '时', '岁', '清', '欢', '卿', '洛', '尘',
              '北', '西', '东', '江', '河', '湖', '海', '山', '川', '云', '风', '雪', '月', '星', '阳', '光', '春', '夏', '秋', '冬',
              '青', '绿', '红', '紫', '蓝', '金', '银', '玉', '石', '林', '森', '木', '水', '火', '土', '文', '武', '志', '国', '建',
              '平', '东', '波', '宁', '辉', '刚', '健', '龙', '峰', '锋', '志', '诚', '智', '慧', '思', '远', '博', '学', '达', '凯']

def generate_name():
    surname = np.random.choice(SURNAMES)
    n_chars = np.random.choice([1, 2], p=[0.3, 0.7])
    if n_chars == 1:
        return surname + np.random.choice(NAME_CHARS)
    else:
        return surname + np.random.choice(NAME_CHARS) + np.random.choice(NAME_CHARS)

# ========== 3. 辅助采样函数 ==========
def sample_normal(mean, std, size, min_val=None, max_val=None):
    vals = np.random.normal(mean, std, size)
    if min_val is not None:
        vals = np.maximum(vals, min_val)
    if max_val is not None:
        vals = np.minimum(vals, max_val)
    return vals

def sample_discrete(categories, probs, size):
    return np.random.choice(categories, size=size, p=probs)

def sample_integer(mean, std, size, min_val=0, max_val=None):
    vals = np.round(np.random.normal(mean, std, size)).astype(int)
    vals = np.maximum(vals, min_val)
    if max_val is not None:
        vals = np.minimum(vals, max_val)
    return vals

# ========== 4. 生成分类型字段 ==========
# 性别
gender = sample_discrete(['女', '男'], [0.52, 0.48], N)

# 学历
edu = sample_discrete(['本科', '硕士', '博士'], [0.62, 0.32, 0.06], N)

# 组长/骨干标识 (0/1)
leader_flag = sample_discrete([0, 1], [0.82, 0.18], N)

# 重点项目成员标识
key_project_flag = sample_discrete([0, 1], [0.70, 0.30], N)

# 敏捷角色 (PO/SM) - 很少
agile_flag = sample_discrete([0, 1], [0.95, 0.05], N)

# 内部/外部PM
pm_internal = sample_discrete([0, 1], [0.85, 0.15], N)
pm_external = sample_discrete([0, 1], [0.90, 0.10], N)

# 产品经理标识
pm_product_analysis = sample_discrete([0, 1], [0.88, 0.12], N)
pm_product_design = sample_discrete([0, 1], [0.92, 0.08], N)

# 证书
cert = sample_discrete(['否', '是'], [0.59, 0.41], N)

# 360评价等级
eval_levels = ['A+', 'A', 'A-', 'B+', 'B', 'B-']
eval_superior_probs = [37/223, 47/223, 35/223, 27/223, 37/223, 40/223]
eval_peer_probs = [38/223, 39/223, 42/223, 35/223, 36/223, 33/223]
eval_superior = sample_discrete(eval_levels, eval_superior_probs, N)
eval_peer = sample_discrete(eval_levels, eval_peer_probs, N)
eval_subordinate = sample_discrete(eval_levels, [0.15, 0.20, 0.20, 0.18, 0.15, 0.12], N)

# 荣誉名称池
honor_pool = ['创新奖', '优秀员工', '技术标兵', '年度之星', '卓越贡献奖', '最佳团队奖', '银雁奖', '金雁奖', '优秀导师', '质量之星']

# 特长池
specialty_pool = ['编程', '数据分析', '演讲', '写作', '设计', '项目管理', '培训', '英语', '数学', '沟通', '无']

# 兴趣池
hobby_pool = ['阅读', '旅游', '运动', '音乐', '电影', '摄影', '游戏', '烹饪', '绘画', '跑步', '羽毛球', '游泳', '无']

# ========== 5. 生成数值型字段 ==========
age = sample_normal(30.51, 4.84, N, 22, 50)
tenure = sample_normal(3.19, 2.03, N, 0.2, 12)  # 行龄
company_tenure = sample_normal(3.71, 1.91, N, 0.5, 11)  # 司龄
performance = sample_normal(3.51, 0.49, N, 2.2, 4.8)
sick_leave = sample_integer(2.19, 1.48, N, 0, 9)
personal_leave = sample_integer(0.87, 1.00, N, 0, 5)
projects = sample_integer(1.35, 1.26, N, 0, 6)
daily_hours = sample_normal(8.09, 1.01, N, 6.0, 11.0)
knowledge_views = sample_integer(20.69, 4.43, N, 8, 37)

# 绩效相关计数
b_minus_count = sample_integer(0.8, 0.9, N, 0, 4)
a_plus_count = sample_integer(0.3, 0.6, N, 0, 3)
a_above_count = sample_integer(0.8, 1.0, N, 0, 4)

# 论文/荣誉/培训
papers = sample_integer(0.3, 0.6, N, 0, 3)
honor_count = sample_integer(0.4, 0.7, N, 0, 3)

# 培训次数
training_internal = sample_integer(1.0, 1.2, N, 0, 5)
training_external = sample_integer(0.3, 0.6, N, 0, 3)
training_external_student = sample_integer(0.5, 0.8, N, 0, 3)
training_internal_student = sample_integer(2.0, 1.5, N, 0, 8)

# 带教
mentee_intern = sample_integer(0.8, 0.9, N, 0, 4)
mentee_new = sample_integer(0.8, 0.8, N, 0, 3)
mentee_intern转正 = sample_integer(0.2, 0.5, N, 0, 2)
mentee_new_a = sample_integer(0.3, 0.5, N, 0, 2)

# ========== 6. 生成技能评分（1-5分，与真实分布一致） ==========
def sample_skill(mean, size):
    # 使用真实数据的均值，生成1-5的整数，偏向中间值
    probs = [0.05, 0.15, 0.35, 0.30, 0.15]  # 1,2,3,4,5的近似分布
    # 根据均值调整分布
    if mean < 2.5:
        probs = [0.10, 0.25, 0.35, 0.20, 0.10]
    elif mean > 3.5:
        probs = [0.03, 0.10, 0.25, 0.40, 0.22]
    else:
        probs = [0.05, 0.15, 0.35, 0.30, 0.15]
    vals = np.random.choice([1, 2, 3, 4, 5], size=size, p=probs)
    # 微调使均值接近目标
    diff = mean - vals.mean()
    if diff > 0.2:
        vals[np.random.choice(size, int(size*0.15), replace=False)] = np.minimum(vals[np.random.choice(size, int(size*0.15), replace=False)] + 1, 5)
    elif diff < -0.2:
        vals[np.random.choice(size, int(size*0.15), replace=False)] = np.maximum(vals[np.random.choice(size, int(size*0.15), replace=False)] - 1, 1)
    return vals

skill_means = {
    '数据分析师-数据分析工具运用能力': 2.98,
    '数据分析师-算法模型开发能力': 3.13,
    '数据分析师-营销运营能力': 2.99,
    '数据研发师-SQL开发': 3.01,
    '数据研发师-数据模型设计': 3.04,
    '数据研发师-业务理解': 3.09,
    '应用研发-技术架构设计': 2.88,
    '应用研发-应用开发能力': 2.77,
    'AI算法工程师-数学与建模理论基础': 3.22,
    'AI算法工程师-编程与工程实现': 2.98,
    '学习能力': 2.98,
    '创新思维': 3.06,
    '任务拆解能力': 2.89,
    '领导力': 2.96,
    '团队合作': 2.95,
}

skill_scores = {k: sample_skill(v, N) for k, v in skill_means.items()}

# ========== 7. 分配岗位和科室 ==========
DEPARTMENTS = ['信息管理部', '信息统计部', '数据平台部', '数据开发部', '数据治理部', '数据测试部',
               '智能研发部-智能平台部', '智能研发部-智能应用一部', '智能研发部-智能应用二部', '智能研发部-研发管理部',
               '机构服务团队', '架构管理', '综合管理部', '需求管理', '项目管理']

POSITIONS = ['数据研发', '数据分析', '应用研发', '算法工程', '架构管理', '需求分析', '测试', '项目管理', '负责人']

dept_assignment = sample_discrete(DEPARTMENTS, [1/len(DEPARTMENTS)]*len(DEPARTMENTS), N)
pos_assignment = sample_discrete(POSITIONS, [0.18, 0.15, 0.18, 0.15, 0.08, 0.10, 0.08, 0.05, 0.03], N)

# ========== 8. 组装数据 ==========
employees = []
for i in range(N):
    emp = {
        '员工ID': i + 1,
        '工号': 300000 + i + 1,
        '姓名': generate_name(),
        '所属科室': dept_assignment[i],
        '拟岗位': pos_assignment[i],
        '年龄': round(age[i], 1),
        '性别': gender[i],
        '最高学历': edu[i],
        '行龄': round(tenure[i], 1),
        '司龄': round(company_tenure[i], 1),
        '近2年绩效平均分': round(performance[i], 2),
        '近2年内绩效为B-及以下的次数': int(b_minus_count[i]),
        '近2年内获得A+的次数': int(a_plus_count[i]),
        '近2年内绩效为A及以上的次数': int(a_above_count[i]),
        '近1年病假天数': int(sick_leave[i]),
        '近1年事假天数': int(personal_leave[i]),
        '近2年牵头项目个数': int(projects[i]),
        '近2年日均工时': round(daily_hours[i], 1),
        '组长/骨干标识': int(leader_flag[i]),
        '重点项目成员标识': int(key_project_flag[i]),
        '敏捷角色（PO/SM）': int(agile_flag[i]),
        '内部项目支持（担任PM）': int(pm_internal[i]),
        '外部项目支持（担任PM）': int(pm_external[i]),
        '产品经理-业务分析': int(pm_product_analysis[i]),
        '产品经理-产品设计': int(pm_product_design[i]),
        '近2年行外发表的论文、杂志的数量': int(papers[i]),
        '近2年获得的部门级以上奖励、荣誉数量': int(honor_count[i]),
        '近2年获得的部门级以上的最高荣誉名称': np.random.choice(honor_pool) if honor_count[i] > 0 else '无',
        '年度部门内分享/培训次数（作为培训者）': int(training_internal[i]),
        '年度部门外培训次数（作为培训者）': int(training_external[i]),
        '年度部门外培训次数（作为被培训者）': int(training_external_student[i]),
        '年度部门内分享/培训次数（作为被培训者）': int(training_internal_student[i]),
        '近2年带教的实习生数量': int(mentee_intern[i]),
        '近2年带教的校招新行员的数量': int(mentee_new[i]),
        '近2年带教的实习生转正数量': int(mentee_intern转正[i]),
        '近2年带教的校招新行员转正成绩为A的数量': int(mentee_new_a[i]),
        '近3个月查看知识库会议纪要次数': int(knowledge_views[i]),
        '当年资质证书获取情况': cert[i],
    }
    
    # 添加技能评分
    for k, v in skill_scores.items():
        emp[k] = int(v[i])
    
    # 360评价
    emp['综合评价（A+、A、A-、B、B-）-直属上级'] = eval_superior[i]
    emp['综合评价（A+、A、A-、B、B-）-同级同事'] = eval_peer[i]
    emp['综合评价（A+、A、A-、B、B-）-下级（如有）'] = eval_subordinate[i]
    
    # 特长/兴趣
    emp['特长'] = np.random.choice(specialty_pool)
    emp['兴趣爱好'] = np.random.choice(hobby_pool)
    
    employees.append(emp)

# ========== 9. 预计算标签摘要 ==========
# 为每个人生成一句话摘要，方便LLM快速检索
def build_summary(emp):
    parts = []
    parts.append(f"{emp['姓名']}（{emp['所属科室']}/{emp['拟岗位']}）")
    parts.append(f"{emp['性别']}，{emp['年龄']}岁，{emp['最高学历']}，行龄{emp['行龄']}年")
    parts.append(f"绩效{emp['近2年绩效平均分']}分，日均工时{emp['近2年日均工时']}h，牵头项目{emp['近2年牵头项目个数']}个")
    
    # 领导标识
    roles = []
    if emp['组长/骨干标识']: roles.append('组长/骨干')
    if emp['重点项目成员标识']: roles.append('重点项目成员')
    if emp['内部项目支持（担任PM）']: roles.append('内部PM')
    if emp['外部项目支持（担任PM）']: roles.append('外部PM')
    if roles:
        parts.append(f"角色：{'、'.join(roles)}")
    
    # 技能亮点（取最高分3项）
    skill_vals = []
    for k, v in emp.items():
        if '-' in k and any(x in k for x in ['能力', '设计', '开发', '理论基础', '实现']):
            if isinstance(v, (int, float)):
                skill_vals.append((k.split('-', 1)[1], v))
    skill_vals.sort(key=lambda x: x[1], reverse=True)
    if len(skill_vals) >= 3:
        parts.append(f"最强技能：{skill_vals[0][0]}({skill_vals[0][1]}分)、{skill_vals[1][0]}({skill_vals[1][1]}分)、{skill_vals[2][0]}({skill_vals[2][1]}分)")
    
    # 软技能
    soft = [(k, v) for k, v in emp.items() if k in ['学习能力', '创新思维', '任务拆解能力', '领导力', '团队合作']]
    soft.sort(key=lambda x: x[1], reverse=True)
    parts.append(f"软技能：{soft[0][0]}{soft[0][1]}分/{soft[1][0]}{soft[1][1]}分/{soft[2][0]}{soft[2][1]}分")
    
    # 360评价
    parts.append(f"360评价：上级{emp['综合评价（A+、A、A-、B、B-）-直属上级']}/同级{emp['综合评价（A+、A、A-、B、B-）-同级同事']}")
    
    # 错配风险评估
    # 根据岗位和技能评分判断
    pos = emp['拟岗位']
    relevant_skills = []
    if '数据研发' in pos:
        relevant_skills = ['数据研发师-SQL开发', '数据研发师-数据模型设计', '数据研发师-业务理解']
    elif '数据分析' in pos:
        relevant_skills = ['数据分析师-数据分析工具运用能力', '数据分析师-算法模型开发能力', '数据分析师-营销运营能力']
    elif '应用研发' in pos or '架构' in pos:
        relevant_skills = ['应用研发-技术架构设计', '应用研发-应用开发能力']
    elif '算法' in pos or '智能' in pos:
        relevant_skills = ['AI算法工程师-数学与建模理论基础', 'AI算法工程师-编程与工程实现']
    
    if relevant_skills:
        avg_skill = np.mean([emp[s] for s in relevant_skills])
        if avg_skill >= 4:
            parts.append(f"岗位匹配：高(技能均分{avg_skill:.1f})")
        elif avg_skill >= 3:
            parts.append(f"岗位匹配：中(技能均分{avg_skill:.1f})")
        else:
            parts.append(f"岗位匹配：低-错配风险(技能均分{avg_skill:.1f})")
    
    return ' | '.join(parts)

for emp in employees:
    emp['_summary'] = build_summary(emp)

# ========== 10. 保存 ==========
output = {
    'meta': {
        'total': N,
        'source': '基于真实225人员工信息表分布生成的合成数据',
        'fields': list(employees[0].keys()),
    },
    'employees': employees,
}

with open('src/data/employee-synthetic.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

# 同时保存CSV方便查看
df_out = pd.DataFrame(employees)
df_out.to_csv('src/data/employee-synthetic.csv', index=False, encoding='utf-8-sig')

print(f"生成完成: {N} 人合成数据")
print(f"输出: src/data/employee-synthetic.json / .csv")
print(f"字段数: {len(employees[0])}")

# 打印样例
for emp in employees[:3]:
    print(f"\n=== {emp['姓名']} (ID:{emp['员工ID']}) ===")
    print(emp['_summary'])

# 打印统计校验
print(f"\n=== 统计校验 ===")
print(f"平均年龄: {np.mean([e['年龄'] for e in employees]):.1f} (目标30.5)")
print(f"平均绩效: {np.mean([e['近2年绩效平均分'] for e in employees]):.2f} (目标3.51)")
print(f"平均日均工时: {np.mean([e['近2年日均工时'] for e in employees]):.2f} (目标8.09)")
print(f"组长比例: {np.mean([e['组长/骨干标识'] for e in employees]):.2%} (目标17%)")
print(f"本科比例: {sum(1 for e in employees if e['最高学历']=='本科')/N:.2%} (目标62%)")
