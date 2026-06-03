#!/usr/bin/env python3
"""
为200人合成数据添加工作任务、项目信息、工作饱和度、科室周报联动等增强字段
基于真实数据源：个人周报、报工数据、人员画像、部门周报
"""

import json
import numpy as np
import pandas as pd

np.random.seed(2024)

# ========== 0. 加载已有合成数据 ==========
with open('src/data/employee-synthetic.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
employees = data['employees']
N = len(employees)

# ========== 1. 数据源模板提取 ==========

# --- 科室到组名的映射 ---
DEPT_GROUP_MAP = {
    '信息管理部': ['服务管理组', '服务支持组', '管理信息组'],
    '信息统计部': ['监管统计组', '管理信息组'],
    '数据平台部': ['数据服务组', '工具开发组', '运维支持组', '架构安全组'],
    '数据开发部': ['需求接入组', '模型设计组', '应用开发组', '数仓开发组'],
    '数据治理部': ['标准质量组', '监管数据治理', '数据安全组'],
    '数据测试部': ['测试管理组', '标准质量组'],
    '智能研发部-智能平台部': ['AI基础研发组', '风险模型组', '架构安全组'],
    '智能研发部-智能应用一部': ['对公应用组', '零售应用组', 'AI产品运营组'],
    '智能研发部-智能应用二部': ['对公应用组', '零售应用组', 'AI产品运营组'],
    '智能研发部-研发管理部': ['项目管理团队', '标准质量组'],
    '机构服务团队': ['分行BP', '零售BP', '非零BP'],
    '架构管理': ['架构安全组', '工具开发组'],
    '综合管理部': ['项目管理团队', '服务支持组'],
    '需求管理': ['需求接入组', '服务管理组'],
    '项目管理': ['项目管理团队', '服务支持组'],
}

# --- 岗位到工作类型的映射 ---
POS_WORK_TYPE = {
    '数据研发': ['开发（含模型、应用、数仓等）', '数据治理', '测试'],
    '数据分析': ['数据分析', '需求分析', '开发（含模型、应用、数仓等）'],
    '应用研发': ['开发（含模型、应用、数仓等）', '生产运维', '测试'],
    '算法工程': ['开发（含模型、应用、数仓等）', '数据分析', '项目管理（含外包管理）'],
    '架构管理': ['架构设计', '技术评审', '项目管理（含外包管理）'],
    '需求分析': ['需求分析', '项目管理（含外包管理）', '数据分析'],
    '测试': ['测试', '生产运维', '开发（含模型、应用、数仓等）'],
    '项目管理': ['项目管理（含外包管理）', '需求分析', '其他'],
    '负责人': ['项目管理（含外包管理）', '需求分析', '其他'],
}

# --- 岗位到任务描述模板池 ---
TASK_TEMPLATES = {
    '数据研发': [
        "{系统}数据模型设计与开发，完成{模块}的ETL流程优化",
        "{系统}数仓分层建设，完成{模块}的数据接入与清洗",
        "{系统}SQL性能调优，解决{模块}慢查询问题",
        "{系统}实时数据链路开发，完成{模块}的流式计算任务",
        "{系统}数据质量检核规则配置，修复{模块}数据异常",
        "{系统}数据接口开发，完成{模块}的API联调与测试",
        "参与{项目}数据架构评审，输出{模块}技术方案",
        "{系统}历史数据迁移，完成{模块}的数据校验与比对",
    ],
    '数据分析': [
        "{系统}客户经营分析报告撰写，完成{模块}的数据洞察",
        "{系统}业务指标体系建设，完成{模块}的报表开发",
        "{系统}数据挖掘模型训练，完成{模块}的预测分析",
        "{系统}A/B测试方案设计，完成{模块}的效果评估",
        "{系统}数据可视化看板搭建，完成{模块}的实时监测",
        "{项目}数据需求调研，输出{模块}分析结论",
        "{系统}用户行为分析，完成{模块}的客群画像",
        "参与{项目}数据分析专项，完成{模块}的深度挖掘",
    ],
    '应用研发': [
        "{系统}后端服务开发，完成{模块}的接口设计与实现",
        "{系统}前端页面开发，完成{模块}的交互逻辑优化",
        "{系统}微服务架构升级，完成{模块}的服务拆分与治理",
        "{系统}性能优化，完成{模块}的并发处理能力提升",
        "{系统}安全漏洞修复，完成{模块}的代码审计与加固",
        "{项目}技术方案设计，输出{模块}的详细设计文档",
        "{系统}容器化部署，完成{模块}的CI/CD流程配置",
        "参与{项目}代码评审，完成{模块}的技术债务清理",
    ],
    '算法工程': [
        "{系统}大模型微调训练，完成{模块}的Prompt工程优化",
        "{系统}RAG检索链路开发，完成{模块}的向量数据库接入",
        "{系统}机器学习模型训练，完成{模块}的特征工程与调参",
        "{系统}NLP模型部署，完成{模块}的推理性能优化",
        "{系统}智能体开发，完成{模块}的Agent工作流设计",
        "{项目}算法方案评审，输出{模块}的技术可行性分析",
        "{系统}模型效果评估，完成{模块}的A/B测试与迭代",
        "参与{项目}大模型应用POC，完成{模块}的场景验证",
    ],
    '架构管理': [
        "{系统}技术架构设计，完成{模块}的方案评审与优化",
        "{系统}技术选型评估，完成{模块}的POC验证与决策",
        "{项目}架构治理，输出{模块}的架构规范与标准",
        "{系统}性能压测方案设计，完成{模块}的容量规划",
        "{系统}安全架构评审，完成{模块}的合规性检查",
        "参与{项目}技术债务清理，输出{模块}的重构方案",
        "{系统}云原生架构规划，完成{模块}的容器化改造方案",
        "组织{项目}技术分享，完成{模块}的知识沉淀",
    ],
    '需求分析': [
        "{系统}业务需求调研，完成{模块}的需求文档编写",
        "{系统}用户访谈与痛点分析，输出{模块}的需求规格说明书",
        "{项目}需求评审会议组织，完成{模块}的需求澄清与确认",
        "{系统}竞品分析，完成{模块}的功能对标与差距分析",
        "{系统}业务流程梳理，完成{模块}的原型设计与验证",
        "参与{项目}需求变更管理，完成{模块}的影响评估",
        "{系统}用户体验优化，完成{模块}的交互流程改进",
        "组织{项目}业务培训，完成{模块}的操作手册编写",
    ],
    '测试': [
        "{系统}功能测试用例设计，完成{模块}的测试执行与缺陷跟踪",
        "{系统}自动化测试脚本开发，完成{模块}的回归测试覆盖",
        "{系统}性能测试方案设计，完成{模块}的压测执行与分析",
        "{系统}安全测试，完成{模块}的渗透测试与漏洞修复验证",
        "{项目}测试评审会议，完成{模块}的测试报告输出",
        "{系统}生产环境监控，完成{模块}的线上问题排查",
        "参与{项目}灰度发布验证，完成{模块}的上线 checklist",
        "{系统}测试环境搭建，完成{模块}的测试数据准备",
    ],
    '项目管理': [
        "{项目}项目计划制定，完成{模块}的里程碑梳理与排期",
        "{项目}进度跟踪与风险预警，完成{模块}的周报汇总",
        "{项目}资源协调，完成{模块}的跨部门沟通与对齐",
        "{项目}外包管理，完成{模块}的供应商评估与验收",
        "{项目}项目复盘，输出{模块}的经验教训与改进措施",
        "组织{项目}项目例会，完成{模块}的会议纪要跟踪",
        "{项目}预算管理，完成{模块}的费用核算与控制",
        "参与{项目}立项评审，完成{模块}的可行性分析报告",
    ],
    '负责人': [
        "{项目}团队管理与目标分解，完成{模块}的OKR制定与跟踪",
        "{项目}科室重点工作推进，完成{模块}的月度汇报材料",
        "{项目}跨部门协调，完成{模块}的资源争取与冲突解决",
        "{项目}人才梯队建设，完成{模块}的骨干培养计划",
        "{项目}科室技术规划，输出{模块}的年度技术路线图",
        "组织{项目}科室例会，完成{模块}的议题收集与督办",
        "{项目}绩效考核，完成{模块}的评优与改进面谈",
        "参与{项目}战略对接，完成{模块}的高层汇报材料",
    ],
}

# --- 应用领域/系统池 ---
APP_SYSTEMS = [
    "尽调报告助手", "会话式人工智能服务", "大模型智能体", "智能问数助手",
    "公共智能体工作站", "Hadoop集群", "Kafka消息集群", "实时数据集群",
    "联机服务集群", "DWS数据集群", "数据采集工具", "实时开发平台",
    "离线数据开发", "数据测试平台", "数据运维平台", "统一调度平台",
    "冷热分离工具", "数据脱敏工具", "数据安全脱敏网关系统",
    "智能数据血缘分析工具", "零售客户关系管理", "长文本智能分析",
    "Hadoop数据仓库", "信用风险监测预警", "综合监管报送",
    "AI手机银行", "智能尽调助手", "客服助手", "金牌催收员",
    "反电诈管理系统", "信贷场景MVP", "流水鉴真系统",
    "绿色金融业务管理", "智能外呼分析", "客户经理超级工作台",
    "East数据质量分析", "知识库问答系统", "授信政策管理系统",
]

# --- 项目/需求名称池 ---
PROJECT_NAMES = [
    "智能问数二期", "尽调报告智能体", "信贷场景MVP", "反诈机器学习模型",
    "流水鉴真场景", "AI客户经营", "智能外呼分析", "客服辅助项目",
    "大模型客服技改", "绿色金融智能体", "East数据质量AI分析",
    "授信政策知识体系", "对公信贷智能化", "零售客户分群",
    "知识库问答体系建设", "中试基地项目", "极客大赛",
    "长文本智能分析", "智能工单场景", "NL2SQL产品POC",
    "Openclaw框架调研", "火山引擎POC", "信雅达POC",
    "DataFun论坛项目", "AI创意比赛", "新行员培训项目",
    "司库系统建设", "信用卡智能后督", "超级工作台MVP",
    "JSON转代码验证", "外搜接口采购", "零小海信义贷技改",
    "通用办公助手", "A模式POC验证",
]

# --- 模块名称池 ---
MODULE_NAMES = [
    "数据接入层", "模型训练层", "推理服务层", "前端展示层",
    "特征工程模块", "向量检索模块", "知识图谱模块", "Prompt管理模块",
    "用户权限模块", "日志审计模块", "报表生成模块", "API网关模块",
    "缓存层", "消息队列模块", "任务调度模块", "监控告警模块",
    "数据清洗模块", "指标计算模块", "可视化组件", "测试框架",
]

# --- 从部门周报加载内容（用于联动） ---
with open('src/data/dept-weekly.json', 'r', encoding='utf-8') as f:
    dept_weekly = json.load(f)

# --- 从个人周报提取更多任务关键词 ---
PERSONAL_WEEKLY_KEYWORDS = [
    "大模型基本概念学习", "RAG&向量知识库开发", "知识库同步",
    "Prompt工程", "记忆管理模块", "知识图谱", "GraphRAG",
    "智能体开发", "AI辅助编程工具", "极客大赛",
    "Springboot框架学习", "Flask框架学习", "Langchain框架学习",
    "SQL考试准备", "人工智能训练师考试", "导师见面会",
    "科室例会", "需求评审", "代码评审", "技术分享",
    "模型调优", "效果评估", "POC验证", "上线评审",
]

# ========== 2. 增强函数 ==========

def get_groups_by_dept(dept: str) -> list:
    """根据科室获取可能的组名"""
    for key, groups in DEPT_GROUP_MAP.items():
        if key in dept or dept in key:
            return groups
    # 默认分组
    return ['应用开发组', '数据服务组', '项目管理团队']

def generate_tasks(position: str, dept: str, n: int = 3) -> list:
    """为指定岗位生成工作任务列表"""
    templates = TASK_TEMPLATES.get(position, TASK_TEMPLATES['应用研发'])
    tasks = []
    used = set()
    while len(tasks) < n and len(used) < len(templates) * 3:
        tpl = np.random.choice(templates)
        system = np.random.choice(APP_SYSTEMS)
        module = np.random.choice(MODULE_NAMES)
        project = np.random.choice(PROJECT_NAMES)
        task = tpl.format(系统=system, 模块=module, 项目=project)
        if task not in used:
            used.add(task)
            tasks.append(task)
    # 补充个人周报关键词
    if np.random.random() < 0.3:
        kw = np.random.choice(PERSONAL_WEEKLY_KEYWORDS)
        tasks.append(f"{kw}：阅读相关文档并完成实践练习")
    return tasks[:n]

def generate_projects(position: str, dept: str, n: int = 2) -> list:
    """生成手头项目/需求列表"""
    projects = []
    # 根据科室特征选择项目
    dept_projects = []
    if '智能' in dept or 'AI' in dept:
        dept_projects = [p for p in PROJECT_NAMES if any(k in p for k in ['智能', 'AI', '大模型', '知识库', '客服'])]
    elif '数据' in dept:
        dept_projects = [p for p in PROJECT_NAMES if any(k in p for k in ['数据', 'East', '质量', '治理'])]
    elif '风险' in dept or '信贷' in dept:
        dept_projects = [p for p in PROJECT_NAMES if any(k in p for k in ['信贷', '风险', '反诈', '授信'])]
    else:
        dept_projects = PROJECT_NAMES
    
    if not dept_projects:
        dept_projects = PROJECT_NAMES
    
    n_proj = min(n, len(dept_projects))
    projects = np.random.choice(dept_projects, size=n_proj, replace=False).tolist()
    
    # 添加应用系统
    app = np.random.choice(APP_SYSTEMS)
    projects.append(f"{app}日常运维与功能迭代")
    
    return projects[:n+1]

def generate_work_types(position: str) -> list:
    """生成工作类型分布"""
    types = POS_WORK_TYPE.get(position, ['开发（含模型、应用、数仓等）', '测试', '其他'])
    # 主工作类型 + 辅助类型
    main = types[0]
    secondary = np.random.choice(types[1:], size=min(2, len(types)-1), replace=False).tolist()
    return [main] + secondary

def generate_saturation(daily_hours: float, projects: int, is_leader: bool) -> dict:
    """生成工作饱和度量化指标"""
    # 基于日均工时和项目数计算
    base = min(100, daily_hours / 8.0 * 80 + np.random.normal(0, 5))
    base += projects * 3  # 每个项目+3%
    if is_leader:
        base += 10  # 领导+10%
    base = max(50, min(110, base))
    
    # 分解到各维度
    dev_ratio = np.random.uniform(40, 70)
    meeting_ratio = np.random.uniform(10, 25)
    doc_ratio = np.random.uniform(5, 15)
    study_ratio = 100 - dev_ratio - meeting_ratio - doc_ratio
    
    return {
        '总体饱和度': round(base, 1),
        '开发/实施占比': round(dev_ratio, 1),
        '会议沟通占比': round(meeting_ratio, 1),
        '文档撰写占比': round(doc_ratio, 1),
        '学习提升占比': round(max(0, study_ratio), 1),
        '负荷等级': '高负荷' if base >= 95 else '饱和' if base >= 85 else '正常' if base >= 70 else '偏低',
    }

def get_dept_weekly_summary(dept: str) -> str:
    """获取科室最近2周的周报摘要"""
    # 匹配科室名称
    matched_key = None
    for key in dept_weekly.keys():
        if key in dept or dept in key:
            matched_key = key
            break
    
    if not matched_key:
        return ''
    
    records = dept_weekly[matched_key]['records']
    if not records:
        return ''
    
    # 最近2条
    recent = records[-2:]
    parts = [f"【{matched_key}最近周报】"]
    for r in recent:
        parts.append(f"时间：{r['weekDate']}")
        if r.get('keyProgress'):
            parts.append(f"重点工作：{r['keyProgress'][:80]}")
        if r.get('workContent'):
            parts.append(f"工作内容：{r['workContent'][:80]}")
    return '\n'.join(parts)

# ========== 3. 为每个人增强数据 ==========
for emp in employees:
    dept = emp['所属科室']
    pos = emp['拟岗位']
    is_leader = emp['组长/骨干标识'] == 1
    
    # 1. 所属分组
    groups = get_groups_by_dept(dept)
    emp['所属分组'] = np.random.choice(groups)
    
    # 2. 近期工作任务（3-5条）
    n_tasks = np.random.randint(3, 6)
    emp['近期工作任务'] = generate_tasks(pos, dept, n_tasks)
    
    # 3. 手头项目/需求
    n_proj = np.random.randint(1, 4)
    emp['手头项目'] = generate_projects(pos, dept, n_proj)
    
    # 4. 工作类型
    emp['工作类型'] = generate_work_types(pos)
    
    # 5. 应用领域/系统（1-2个）
    n_app = np.random.randint(1, 3)
    # 根据科室偏好选择应用
    if '智能' in dept:
        pref_apps = [a for a in APP_SYSTEMS if any(k in a for k in ['智能', 'AI', '大模型', '助手', '客服'])]
    elif '数据' in dept:
        pref_apps = [a for a in APP_SYSTEMS if any(k in a for k in ['数据', 'Hadoop', 'Kafka', '集群', '平台'])]
    else:
        pref_apps = APP_SYSTEMS
    if len(pref_apps) < n_app:
        pref_apps = APP_SYSTEMS
    emp['应用领域'] = np.random.choice(pref_apps, size=n_app, replace=False).tolist()
    
    # 6. 工作饱和度
    emp['工作饱和度'] = generate_saturation(emp['近2年日均工时'], emp['近2年牵头项目个数'], is_leader)
    
    # 7. 科室周报联动
    emp['科室周报联动'] = get_dept_weekly_summary(dept)
    
    # 8. 更新摘要，加入工作任务信息
    summary_parts = [emp['_summary']]
    summary_parts.append(f"分组：{emp['所属分组']}")
    summary_parts.append(f"工作类型：{'/'.join(emp['工作类型'])}")
    summary_parts.append(f"饱和度：{emp['工作饱和度']['总体饱和度']}%({emp['工作饱和度']['负荷等级']})")
    summary_parts.append(f"手头项目：{'、'.join(emp['手头项目'])}")
    emp['_summary'] = ' | '.join(summary_parts)

# ========== 4. 保存 ==========
data['meta']['fields'] = list(employees[0].keys())
data['meta']['enhanced'] = True

with open('src/data/employee-synthetic.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# 更新CSV
df_out = pd.DataFrame(employees)
# 将列表字段转为字符串
df_out['近期工作任务'] = df_out['近期工作任务'].apply(lambda x: '；'.join(x))
df_out['手头项目'] = df_out['手头项目'].apply(lambda x: '；'.join(x))
df_out['工作类型'] = df_out['工作类型'].apply(lambda x: '/'.join(x))
df_out['应用领域'] = df_out['应用领域'].apply(lambda x: '、'.join(x))
df_out['工作饱和度'] = df_out['工作饱和度'].apply(lambda x: f"总体{x['总体饱和度']}%|开发{x['开发/实施占比']}%|会议{x['会议沟通占比']}%|文档{x['文档撰写占比']}%|学习{x['学习提升占比']}%|{x['负荷等级']}")
df_out.to_csv('src/data/employee-synthetic.csv', index=False, encoding='utf-8-sig')

print(f"增强完成！")
print(f"员工数: {N}")
print(f"字段数: {len(employees[0].keys())}")

# 打印样例
for emp in employees[:2]:
    print(f"\n=== {emp['姓名']} (ID:{emp['员工ID']}) ===")
    print(f"科室/分组: {emp['所属科室']}/{emp['所属分组']}")
    print(f"岗位/工作类型: {emp['拟岗位']}/{'/'.join(emp['工作类型'])}")
    print(f"近期任务({len(emp['近期工作任务'])}条):")
    for t in emp['近期工作任务']:
        print(f"  - {t}")
    print(f"手头项目: {'、'.join(emp['手头项目'])}")
    print(f"应用领域: {'、'.join(emp['应用领域'])}")
    print(f"饱和度: {emp['工作饱和度']['总体饱和度']}% ({emp['工作饱和度']['负荷等级']})")
    print(f"科室周报: {emp['科室周报联动'][:100]}...")
    print(f"摘要: {emp['_summary'][:200]}...")

# 统计
sat_levels = {'高负荷': 0, '饱和': 0, '正常': 0, '偏低': 0}
for emp in employees:
    sat_levels[emp['工作饱和度']['负荷等级']] += 1
print(f"\n=== 工作饱和度分布 ===")
for k, v in sat_levels.items():
    print(f"  {k}: {v}人 ({v/N*100:.1f}%)")
