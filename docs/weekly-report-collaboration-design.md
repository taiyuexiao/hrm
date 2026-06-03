# 周报管理协作系统设计方案

> 基于飞书云文档功能调研，设计周报管理页面的多人实时协作、AI 总结、时间序列分析方案。
>
> 版本：v1.0  
> 日期：2026-05-21

---

## 一、飞书云文档功能调研

### 1.1 核心功能清单

| 功能 | 飞书实现 | 技术方案 |
|------|---------|---------|
| 多人实时在线编辑 | 200人同时编辑，5000人同时阅读 | CRDT / OT 算法 + WebSocket |
| 实时光标 + 头像 | 不同颜色区分用户，显示编辑位置 | WebSocket 广播 cursor 位置 |
| 批注评论 | 选中文字添加评论，@人通知 | 独立于文档的 comment 数据模型 |
| 评论回复 | 支持 threaded reply | 树形评论结构 |
| 已读状态 | 消息级已读追踪 | 服务端记录 read_timestamp |
| 权限控制 | 所有者/编辑者/评论者/查看者 | RBAC 角色权限模型 |
| 版本历史 | 自动生成快照，支持回滚 | 定时保存 + diff 存储 |
| 建议模式 | 修改显示为"建议"，可接受/拒绝 | 操作 transform 记录 |

### 1.2 飞书开放平台能力

飞书开放平台提供以下可用于集成的 API：

- **云文档组件**：可在企业应用中集成飞书文档的编辑、评论、权限管理
- **消息已读状态查询**：`POST /open-apis/message/v4/read_info/`（需 tenant_access_token）
- **@人通知**：飞书 IM 消息卡片，自动通知被 @ 用户
- **权限管理**：通过开放平台设置文档可见范围

**限制**：飞书云文档数据存储在飞书服务器，银行/金融机构通常有数据本地化要求，**不建议直接集成**。

---

## 二、三种实现方案对比

| 维度 | 方案A：集成飞书API | 方案B：完全自研 | 方案C：半自研（推荐） |
|------|------------------|--------------|-------------------|
| **数据安全** | ❌ 数据上飞书服务器 | ✅ 完全本地 | ✅ 完全本地 |
| **开发周期** | 1-2周 | 2-3个月 | 4-6周 |
| **功能完整度** | 100%（飞书原生） | 按需实现 | 核心功能完整 |
| **实时协作** | 飞书提供 | 需自研 OT/CRDT | Yjs 开源库提供 |
| **维护成本** | 低（飞书维护） | 高 | 中 |
| **适合场景** | 非敏感数据 | 大型产品 | **课题/Demo 项目** |

**推荐方案C**：使用成熟开源组件（Yjs + Tiptap）实现核心协作能力，数据完全本地可控，开发周期适中。

---

## 三、推荐方案：半自研架构

### 3.1 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│  前端（React + Tiptap + Yjs）                               │
│  - Tiptap 富文本编辑器                                       │
│  - Yjs CRDT 实时协作                                         │
│  - WebSocket 客户端                                          │
│  - 评论/批注 UI 组件                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket / HTTP
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  后端（Spring Boot）                                        │
│  - WebSocket 服务端（Yjs 的 y-websocket provider）          │
│  - REST API（评论、已读、AI 总结）                          │
│  - 定时任务（周报快照、版本历史）                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  数据层                                                     │
│  - PostgreSQL：员工数据、评论、已读状态、操作日志            │
│  - 文件存储：周报文档 CRDT 二进制（yjs 格式）               │
│  - 或 MongoDB：非结构化周报内容、评论树                     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 技术栈选型

| 模块 | 技术选型 | 理由 |
|------|---------|------|
| 富文本编辑器 | **Tiptap** (基于 ProseMirror) | 成熟、扩展性强、原生支持 Yjs 协作 |
| 实时协作算法 | **Yjs** (CRDT) | 无需中央服务器协调，离线可用，冲突自动解决 |
| 实时通信 | **WebSocket** (Spring Boot + STOMP) | 兼容性好，Spring 生态成熟 |
| 评论系统 | 自研 + Tiptap Comment 扩展 | 灵活可控 |
| 数据库 | **PostgreSQL** + **MongoDB** | PG 存结构化数据，Mongo 存文档/评论 |
| AI 总结 | **DeepSeek API** | 已有接入，中文能力强 |
| 时间序列分析 | **LLM + 规则引擎** | NLP 解析计划/完成情况，规则判断进度 |

### 3.3 关键功能实现

#### 3.3.1 多人实时协作编辑

```
用户A 编辑段落1
    │
    ▼ Yjs CRDT 本地更新
    │
    ▼ WebSocket 广播 update 二进制
    │
    ├──→ 用户B 收到 update → Yjs 合并 → 段落1 实时更新
    ├──→ 用户C 收到 update → Yjs 合并 → 段落1 实时更新
    └──→ 服务端持久化 CRDT 状态
```

**Yjs 核心优势**：
- 不需要中央服务器做冲突仲裁（ unlike OT）
- 用户离线编辑后重连，自动合并
- 支持版本历史（Yjs UndoManager）

#### 3.3.2 实时光标 + 头像

```typescript
// Yjs Awareness Protocol（内置）
provider.awareness.setLocalStateField('user', {
  name: '张三',
  color: '#ff6b6b',
  avatar: 'https://.../avatar1.png'
});

// 其他用户通过 awareness 监听光标位置
provider.awareness.on('change', () => {
  const states = provider.awareness.getStates();
  // 渲染远程光标
});
```

#### 3.3.3 批注评论系统

**数据模型**：
```
comment: {
  id: UUID,
  weeklyReportId: string,        // 所属周报
  range: { from: number, to: number },  // 文档中选中的文本范围
  authorId: string,              // 评论人
  content: string,               // 评论内容
  mentions: string[],            // @的人 ID 列表
  parentId: string | null,       // 父评论 ID（threaded reply）
  createdAt: timestamp,
  resolved: boolean,             // 是否已解决
  readBy: Map<userId, timestamp> // 已读状态
}
```

**@人通知流程**：
```
用户选中文字 → 添加评论 → 内容包含 @李四
    │
    ▼ 前端解析 @mentions
    │
    ▼ POST /api/comments (content, mentions, range)
    │
    ▼ 服务端：
        1. 保存评论到 PostgreSQL
        2. 对 mentions 列表中的用户发送 WebSocket 通知
        3. 推送 unread badge 到被 @ 用户的客户端
    │
    ▼ 被 @ 用户收到实时通知（红点 + 消息提示）
```

**已读状态追踪**：
```
用户打开周报页面
    │
    ▼ 前端批量上报已读：POST /api/comments/read
    │
    ▼ 服务端更新 readBy 字段
    │
    ▼ WebSocket 广播给评论作者："XXX 已阅读你的评论"
```

#### 3.3.4 LLM 周报总结

**触发时机**：
- 手动触发：管理者点击"生成总结"按钮
- 自动触发：每周日晚上定时生成

**Prompt 设计**：
```
你是一位人力资源分析专家。请对以下科室周报进行总结分析。

【周报内容】
科室：{deptName}
周期：{weekRange}
本周工作计划：{plan}
本周工作内容：{actualWork}
下周工作计划：{nextPlan}

【评论互动】
{comments}

请输出：
1. 本周工作完成情况综述（200字）
2. 下周计划与本周实际的衔接度评价
3. 评论中提到的问题和风险点汇总
4. 建议关注的事项（如有）
```

**实现**：前端点击"AI总结"→ 调后端 `/api/weekly-report/{id}/summarize` → 后端拼接 prompt → 调 DeepSeek API → 结果存入周报 summary 字段 → 返回前端展示。

#### 3.3.5 时间序列分析（核心难点）

**问题定义**：对比"上周的下周工作计划"与"本周的实际工作内容"，判断完成情况。

**技术方案**：

| 子问题 | 方案 |
|--------|------|
| 从文本中提取计划项 | DeepSeek API 做 NLP 信息抽取 → 结构化计划列表 |
| 从文本中提取完成项 | 同上 |
| 计划项 vs 完成项匹配 | 向量语义相似度（判断"完成了哪条计划"） |
| 完成度量化 | 匹配数 / 计划总数 = 完成率 |
| 进度判断 | 超额（完成率 > 100%）、正常（80-100%）、拖欠（<80%） |

**Prompt 示例（信息抽取）**：
```
请从以下周报文本中提取结构化信息，输出 JSON：

文本："本周完成：1. 反诈模型优化，准确率提升到95%；2. 数据治理规范文档编写"

输出格式：
{
  "completedItems": [
    {"id": 1, "title": "反诈模型优化", "details": "准确率提升到95%", "category": "模型开发"},
    {"id": 2, "title": "数据治理规范文档编写", "details": "", "category": "文档"}
  ]
}
```

**计划-完成匹配算法**：
```python
# 伪代码
plans = extract_from_last_week("下周工作计划")  # LLM 抽取
completions = extract_from_this_week("本周工作内容")  # LLM 抽取

matched = []
unmatched_plans = []

for plan in plans:
    best_match = None
    best_score = 0
    for comp in completions:
        # 用向量相似度匹配
        score = cosine_similarity(
            embedding(plan['title'] + plan['details']),
            embedding(comp['title'] + comp['details'])
        )
        if score > 0.7 and score > best_score:
            best_match = comp
            best_score = score
    
    if best_match:
        matched.append((plan, best_match, best_score))
    else:
        unmatched_plans.append(plan)

completion_rate = len(matched) / len(plans)
status = "超额" if completion_rate > 1.0 else "正常" if completion_rate >= 0.8 else "拖欠"
```

**全周期分析（4周）**：
```
周1计划 → 周2完成度 → 周2计划 → 周3完成度 → 周3计划 → 周4完成度
    │
    ▼ 形成连续的时间序列数据
    │
    ▼ 可视化：折线图展示各周完成率趋势
    ▼ 异常检测：某周完成率突降 → 自动预警
```

---

## 四、数据库设计

### 4.1 核心表结构

```sql
-- 周报表（每科室每周一条）
CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_name VARCHAR(50) NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  plan_text TEXT,              -- 本周工作计划（富文本）
  work_text TEXT,              -- 本周工作内容（富文本）
  next_plan_text TEXT,         -- 下周工作计划（富文本）
  yjs_state BYTEA,             -- Yjs CRDT 二进制状态
  ai_summary TEXT,             -- AI 总结
  completion_rate DECIMAL(5,2), -- 完成率（时间序列分析结果）
  status VARCHAR(20),          -- 超额/正常/拖欠
  created_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(dept_name, week_start)
);

-- 评论表
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES weekly_reports(id),
  author_id VARCHAR(50) NOT NULL,
  author_name VARCHAR(50),
  content TEXT NOT NULL,
  mentions TEXT[],             -- @的人 ID 数组
  range_from INT,              -- 选中文本起始位置
  range_to INT,                -- 选中文本结束位置
  parent_id UUID REFERENCES comments(id), -- 回复的父评论
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 已读状态表
CREATE TABLE comment_reads (
  comment_id UUID REFERENCES comments(id),
  user_id VARCHAR(50) NOT NULL,
  read_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

-- 操作日志（版本历史）
CREATE TABLE report_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES weekly_reports(id),
  yjs_state BYTEA,             -- 该版本的完整 CRDT 状态
  changed_by VARCHAR(50),
  changed_at TIMESTAMP DEFAULT NOW()
);

-- 时间序列分析结果缓存
CREATE TABLE weekly_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES weekly_reports(id),
  prev_report_id UUID REFERENCES weekly_reports(id),
  extracted_plans JSONB,       -- 结构化计划列表
  extracted_completions JSONB, -- 结构化完成列表
  matched_pairs JSONB,         -- 匹配结果
  completion_rate DECIMAL(5,2),
  status VARCHAR(20),
  analyzed_at TIMESTAMP DEFAULT NOW()
);
```

---

## 五、开发排期估算

| 模块 | 工作量 | 依赖 |
|------|--------|------|
| Tiptap + Yjs 编辑器集成 | 3天 | 无 |
| WebSocket 实时协作后端 | 2天 | Yjs provider |
| 评论系统（CRUD + @人 + 已读） | 4天 | 编辑器 |
| LLM 周报总结 API | 2天 | DeepSeek |
| 时间序列分析（LLM 抽取 + 匹配） | 5天 | LLM |
| 全周期分析可视化 | 3天 | 时间序列分析 |
| 权限控制 + 版本历史 | 3天 | 评论系统 |
| **总计** | **~22天（1个月）** | |

---

## 六、风险与建议

| 风险 | 缓解措施 |
|------|---------|
| Yjs 学习曲线陡峭 | 先用官方 demo 跑通，再集成到项目 |
| LLM 抽取准确率不稳定 | 抽取结果人工校验 + 置信度阈值过滤 |
| 时间序列分析计算量大 | 异步执行 + 结果缓存 |
| 银行数据安全限制 | 所有数据本地化，不调用外部文档服务 |

---

## 七、下一步行动

1. **确认方案**：选择方案A/B/C
2. **搭建 Yjs 原型**：先用官方 demo 验证技术可行性（半天）
3. **设计数据库表**：按 4.1 节创建表结构
4. **开发评论系统**：不依赖协作编辑器，先独立实现评论 CRUD
5. **集成 LLM 总结**：在现有 SmartChat 中复用 DeepSeek 调用逻辑
