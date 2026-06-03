# 智能人才管理系统 — 智能问答模块技术文档

> 版本：v1.0  
> 日期：2026-05-17  
> 分支：`release0527`

---

## 1. 项目背景

智能问答模块是「智能人才管理系统」的浮动式 AI 助手，部署在页面右下角，支持：
- **圆形可拖拽 UI**：用户可拖动悬浮按钮到任意位置
- **多轮对话**：基于 DeepSeek `deepseek-chat` 模型的自然语言交互
- **数据驱动回答**：基于项目 `data/` 文件夹内的客观数据（工时、考勤、代码提交、科室周报、员工信息等）生成回答

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                      前端 (React + Vite)                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │  SmartChat  │───▶│  意图解析   │───▶│  数据检索   │ │
│  │  组件       │    │  (关键词)   │    │  (JSON过滤) │ │
│  └─────────────┘    └─────────────┘    └─────────────┘ │
│         │                                            │   │
│         ▼                                            ▼   │
│  ┌─────────────────────────────────────────────────────┐│
│  │              DeepSeek API (deepseek-chat)            ││
│  │  System Prompt = 静态知识库 + 动态检索结果           ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## 3. 数据层设计

### 3.1 数据来源

| 数据类别 | 原始文件位置 | 预处理脚本 | 输出文件 |
|---|---|---|---|
| **工时考勤** | `data/工时/*.xlsx`（4个文件，19个sheet） | `data/process_chat_data.py` | `src/data/chat-knowledge-base.json` |
| **代码提交** | `src/data/code-submission.json` | — | 直接引用 |
| **科室工作** | `data/科室工作/*.xlsx` | `data/process_chat_data.py` | `src/data/chat-knowledge-base.json` |
| **员工信息** | `data/员工信息数据.xlsx` | `data/process_chat_data.py` | `src/data/chat-knowledge-base.json` |
| **部门周报** | `data/周报/部门周报/*.xlsx`（4期） | 内联 Python 脚本 | `src/data/dept-weekly.json` |

### 3.2 部门周报数据结构 (`dept-weekly.json`)

从 4 期「数据部工作周报」中按 `科室/委员会` 列剥离，共 **15 个科室**，每科室 **4 周记录**。

```json
{
  "departmentWeekly": {
    "信息管理部": {
      "records": [
        {
          "weekFile": "数据部工作周报-20260327.xlsx",
          "weekDate": "2026-03-27",
          "plan": "本周工作计划...",
          "workContent": "本周工作内容...",
          "nextPlan": "下周计划...",
          "keyProgress": "重点工作推进情况..."
        }
      ],
      "recordCount": 4
    }
  }
}
```

**字段说明**：
- `weekDate`：从文件名解析的日期（`2026-03-27` 格式）
- `plan`：本周/上周工作计划（列名各期不同，脚本自动匹配）
- `workContent`：本周工作内容（统一存在）
- `nextPlan`：下周计划（统一存在）
- `keyProgress`：重点工作推进情况（优先匹配含"本周"的列）

### 3.3 工时数据结构 (`chat-knowledge-base.json`)

```json
{
  "workHours": {
    "files": [
      {
        "file": "2026年3月行员迟到加班统计-202603.xlsx",
        "sheets": [
          {
            "sheet": "3月考勤",
            "summary": "3月考勤(5127行,26列) | 工号:均值305757...",
            "topRecords": {
              "工作时长": [
                { "姓名": "胡申民", "工作时长": 20.14, "部门": "智能平台部" }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

---

## 4. 组件设计 (`SmartChat.tsx`)

### 4.1 文件位置
`src/components/SmartChat.tsx`

### 4.2 核心功能模块

| 模块 | 说明 |
|---|---|
| **圆形拖拽按钮** | `48×48px` 蓝色圆形，支持鼠标拖拽定位。移动距离 `<5px` 视为点击打开对话框 |
| **聊天对话框** | 固定定位面板，`420×560px`，右上角弹出。支持多轮消息滚动 |
| **Markdown 渲染** | 支持 `#` 标题、`-` 列表、`**加粗**` 的简易渲染 |
| **DeepSeek 调用** | `POST https://api.deepseek.com/chat/completions`，`deepseek-chat` 模型 |

### 4.3 Prompt 设计

**System Prompt 结构**：
```
你是「智能人才管理系统」的智能问答助手...

## 可用数据
[静态知识库：工时考勤 + 代码提交 + 员工信息]

## 部门周报检索结果
[动态注入：根据用户问题匹配的部门周报片段]

## 回答要求
1. 使用中文回答...
```

**上下文管理**：保留最近 6 轮对话历史注入 Prompt。

---

## 5. 检索方案（RAG 轻量实现）

### 5.1 检索逻辑 (`retrieveDeptWeekly`)

三维匹配策略：

| 维度 | 匹配规则 | 示例 |
|---|---|---|
| **部门匹配** | 精确匹配 + 短名模糊匹配（去除 `"智能研发部-"` 前缀） | `"智能应用一部"` → 匹配 `"智能研发部-智能应用一部"` |
| **时间匹配** | `"3月"/"三月"` → `-03-`；`"4月"/"四月"` → `-04-`；`"5月"/"五月"` → `-05-`；`"最近"` → 最新 2 周 | `"最近"` → 取 2026-04-17、2026-05-15 |
| **内容类型** | `"重点工作"/"推进"/"进展"` → `keyProgress`；`"计划"/"安排"/"下周"` → `nextPlan`；`"工作内容"/"在做什么"` → `workContent` | 未指定时输出 `workContent + keyProgress` |

**多部门查询优化**：当匹配到多个部门时，每个部门只输出 `keyProgress`（较短），控制 Token 总量。

### 5.2 数据规模与 Token 估算

| 数据范围 | 字符数 | 约 Token |
|---|---|---|
| 全量 15 部门 × 4 周 | 56,949 | ~28,500 |
| 最近 1 周全部内容 | 11,835 | ~5,900 |
| 最近 1 周仅重点工作 | 3,534 | ~1,800 |
| 最近 2 周全部内容 | ~24,000 | ~12,000 |

---

## 6. 部署与运行

### 6.1 环境要求
- Node.js ≥ 18
- Vite v5.4.21
- React 18 + TypeScript
- Ant Design 5.x

### 6.2 启动命令
```bash
cd /Users/spl/PycharmProjects/HRM/git_-ehr
npm run dev
# 访问 http://localhost:5173/
```

### 6.3 API Key 配置
DeepSeek API Key 已硬编码于组件内（生产环境建议迁移至环境变量）：
- `src/components/SmartChat.tsx`
- `src/components/EmployeeProfile.tsx`
- `src/components/LLMAnalysis.tsx`

---

## 7. 已知问题与后续优化方向

### 7.1 当前局限
1. **检索精度**：前端仅支持关键词匹配，无法处理语义层面的多样性（如别名、口语化表达）
2. **Token 控制**：多轮对话后上下文膨胀，未做主动截断
3. **数据源隔离**：工时、代码、周报等数据尚未做「按需加载」，每次提问均注入全量静态知识库
4. **无后端 Embedding**：纯前端运行，无法使用向量检索做语义匹配

### 7.2 优化方向

| 优先级 | 方向 | 说明 |
|---|---|---|
| P1 | **意图路由 + 按需注入** | 用轻量规则判断问题类型，只加载对应数据源，降低 Token 消耗 |
| P2 | **预生成摘要** | 用脚本为每份周报生成 50 字一句话摘要，全量注入仅需 ~1,500 Token |
| P3 | **前端 Embedding** | 引入 `transformers.js` 或调用外部 Embedding API，实现真语义检索 |
| P4 | **纯前端结构化回答** | 明确的排名/统计类问题（如"谁的加班最多"）前端直接计算返回，零 LLM 成本 |
| P5 | **对话状态管理** | 记录用户上一轮的意图，追问时自动沿用数据源，减少重复检索 |

---

## 8. 附录：数据预处理脚本

### 8.1 工时与综合知识库
```bash
python3 data/process_chat_data.py
# 输出：src/data/chat-knowledge-base.json
```

### 8.2 部门周报剥离
```bash
cd /Users/spl/PycharmProjects/HRM/git_-ehr
python3 -c "
import pandas as pd, os, json, re
from collections import defaultdict

folder = 'data/周报/部门周报'
files = sorted([f for f in os.listdir(folder) if f.endswith('.xlsx')])

def extract_date(fn):
    m = re.search(r'(\d{4})(\d{2})(\d{2})', fn)
    return f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m else fn

def find_col(cols, cond):
    for c in cols:
        if cond(str(c)): return c
    return None

dept_records = defaultdict(list)
for f in files:
    df = pd.read_excel(os.path.join(folder, f))
    cols = list(df.columns)
    plan = find_col(cols, lambda s: '计划' in s and '下周' not in s and '推进' not in s)
    work = find_col(cols, lambda s: '工作内容' in s)
    nxt = find_col(cols, lambda s: s.startswith('下周'))
    prog = find_col(cols, lambda s: '重点工作' in s and '推进' in s and '上周' not in s)
    if not prog: prog = find_col(cols, lambda s: '重点工作' in s and '推进' in s)
    for _, row in df.iterrows():
        dept = str(row.get('科室/委员会', '')).strip()
        if not dept or pd.isna(dept): continue
        dept_records[dept].append({
            'weekFile': f, 'weekDate': extract_date(f),
            'plan': str(row.get(plan, '')).strip() if plan else '',
            'workContent': str(row.get(work, '')).strip() if work else '',
            'nextPlan': str(row.get(nxt, '')).strip() if nxt else '',
            'keyProgress': str(row.get(prog, '')).strip() if prog else ''
        })

json.dump({'departmentWeekly': {d: {'records': r, 'recordCount': len(r)} for d, r in sorted(dept_records.items())}},
          open('src/data/dept-weekly.json', 'w'), ensure_ascii=False, indent=2)
"
```

---

*文档维护：如需更新数据或调整检索策略，修改对应预处理脚本后重新运行即可。*
