# 周报提交、存档与行为日志开发计划

## 一、方案总结

### 1.1 核心设计：草稿与提交快照分离

当前系统的痛点是「自动保存」让「提交」失去了边界感——用户提交后继续修改（自动保存），二次提交时完全不知道自己上次交了什么。

**解决方案**：数据层拆分为「草稿」和「提交快照」两条线。

| 维度 | 草稿 (Draft) | 提交快照 (Submission) |
|------|-------------|---------------------|
| 存储位置 | WeeklyReport 主表现有字段 | `submissions` JSON 数组字段 |
| 更新方式 | 自动保存，实时更新 | 仅在用户点击「提交」时生成 |
| 可见范围 | 仅编辑者自己 | 管理员、其他可见用户 |
| 可变性 | 随时可变 | 不可变（历史快照） |

### 1.2 提交流程

```
用户编辑 → 自动保存到 Draft
  ↓
点击「提交」按钮
  ↓
系统将当前 Draft 完整复制为 Snapshot
  ↓
Snapshot 推入 submissions 数组（version 自增）
  ↓
显示「已提交 vN」标识
```

**关键原则**：
- 提交不是「改状态」，而是「拍快照」。快照一旦生成不可修改。
- 用户提交后可以继续编辑（改的是草稿），但管理员始终看到的是最后一次快照。
- 用户可以随时查看「上次交了什么」，消除版本焦虑。

### 1.3 用户版本感知

- **编辑器顶部**：显示当前提交版本号，如「✓ 已提交 v3，管理员已可见」
- **「查看上次提交」按钮**：以只读弹窗/侧栏展示 `submissions[last-1]` 的完整内容
- **「回退到上次提交」按钮**（可选）：将当前草稿恢复为上次提交的内容
- **差异对比**（可选）：高亮显示当前草稿与上次提交的内容变化

### 1.4 截止时间与锁定机制

**截止时间计算**：
- 给定周次 `YYYY-WNN`，计算该 ISO 周**周五 20:00 (UTC+8)**
- ISO 周定义：周四所在的公历年即为该周年份；周五 = 该周周四 + 1 天，时间设为 20:00:00
- 前端和后端均实时计算，不依赖定时任务

**编辑权限判断**：
```ts
function canEdit(report, user, now) {
  if (user.username === '33528') return true;       // 33528 可编辑任何人的周报
  if (report.authorId === user.id && report.adminUnlock) return true; // 自己被管理员解锁
  if (report.authorId === user.id) {
    return now <= getDeadline(report.weekLabel);    // 普通用户：截止前可编辑自己的
  }
  return false;                                      // 其他人不可编辑
}
```

**截止兜底**：
- 周五 20:00 到达时，如果当前 `draft` 与 `submissions[last]` 存在内容差异，**系统自动将当前草稿追加为一次新提交**（版本号 +1）
- 避免「用户以为交了但最后一段没保存」的惨案

### 1.5 管理员解锁权限

- 管理员（role === 'admin'）在管理后台看到所有人的周报提交状态概览
- 对特定已锁定记录点击「允许继续编辑」→ 设置 `adminUnlock = true`，记录操作人/时间
- 被解锁的用户恢复编辑权限，编辑器显示「🔓 管理员已授权继续编辑」
- 管理员可随时「撤销权限」→ 恢复锁定
- **注意**：管理员只能「解锁/锁定」他人周报，不能直接替他人编辑；只有 33528 拥有直接编辑任何人周报的权限

---

## 二、新增需求：用户行为日志

### 2.1 记录范围

| 行为类型 | 触发时机 | 记录内容 |
|---------|---------|---------|
| `edit` | 自动保存触发时（节流：同一用户同一周报每 60 秒最多记一次） | 周报 ID、周次、编辑字段摘要 |
| `submit` | 点击提交按钮 | 周报 ID、版本号、提交时间 |
| `view` | 打开周报查看 | 周报 ID、查看时间 |
| `login` / `logout` | 登录/登出成功 | IP、时间、方式 |
| `export` | 导出知识库/周报 | 导出格式、范围、文件大小 |
| `admin_unlock` | 管理员解锁某周报 | 被解锁用户、周报 ID、周次 |
| `admin_lock` | 管理员撤销解锁 | 同上 |
| `comment_add` | 发表评论或回复 | 目标周报、评论内容摘要 |

### 2.2 存储设计

新建表 `user_action_logs`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `user_id` | TEXT | 操作用户 ID |
| `user_name` | TEXT | 操作用户姓名 |
| `action` | TEXT | 行为类型枚举 |
| `target_type` | TEXT | 对象类型：report / knowledge_base / user / system |
| `target_id` | TEXT | 对象 ID（如 report id） |
| `target_desc` | TEXT | 对象描述（如「2026-W23 项目管理」） |
| `details` | TEXT | JSON 字符串，记录变更摘要或扩展信息 |
| `ip` | TEXT | 操作者 IP |
| `created_at` | TEXT | 操作时间（ISO 8601） |

### 2.3 前端展示

- 在管理员界面新增「用户行为日志」Tab/菜单项
- 表格列：时间 | 用户 | 行为 | 对象 | 详情
- 筛选条件：按用户下拉框、按行为类型多选、按时间范围（今天/本周/本月/自定义）
- 分页展示，默认按时间倒序

---

## 三、时间提醒机制详解

### 3.1 什么是时间提醒？

时间提醒是贯穿整个周报编辑周期的**倒计时提示系统**，目的是降低用户因忘记而错过提交截止的概率。它是一个纯前端展示层功能，不需要后端定时任务。

### 3.2 分级提醒策略

| 阶段 | 距截止时间 | 视觉表现 | 交互表现 |
|------|-----------|---------|---------|
| **常态** | > 24h | 编辑器顶部蓝色横幅 | 「提交截止：周五 20:00，还剩 2 天 5 小时」 |
| **临近** | ≤ 24h 且 > 4h | 横幅变黄 + 提交按钮脉冲动画 | 文案变红加粗，增加紧迫感 |
| **紧急** | ≤ 4h 且 > 0 | 横幅变红 + 弹窗提醒 | 首次进入编辑器时弹窗：「距离提交仅剩 X 小时，请尽快完成」 |
| **周五未提交** | 周五当天且无提交记录 | 页面级红色横幅固定置顶 | 文案：「⚠️ 今日截止！您尚未提交本周周报」 |
| **截止后** | < 0（已过期） | 灰色锁定横幅 | 文案：「已截止（周五 20:00），如需编辑请联系管理员」 |

### 3.3 技术实现

- **计算逻辑**：前端基于 `new Date()` 和 `getDeadline(weekLabel)` 实时计算剩余时间
- **更新频率**：使用 `setInterval` 每 60 秒更新一次倒计时文案
- **节流存储**：提醒状态（如「今日已弹过窗」）存入 `localStorage`，避免重复打扰
- **无后端依赖**：纯前端实现，降低架构复杂度

---

## 四、数据模型变更

### 4.1 WeeklyReport 实体扩展

```ts
interface WeeklyReport {
  // ===== 现有字段保持不变 =====
  id: string;
  weekLabel: string;
  dept: string;
  authorId: string;
  authorName: string;
  plan: string;
  content: TaskItem[];
  currentWork: string;
  nextPlan: string;
  thoughts: string;
  other: string;
  comments: Comment[];
  updatedAt: string;
  createdAt: string;

  // ===== 新增字段 =====
  submissions: Submission[];   // 提交快照数组
  adminUnlock: boolean;        // 管理员是否解锁
  adminUnlockBy?: string;      // 解锁人
  adminUnlockAt?: string;      // 解锁时间
}

interface Submission {
  version: number;             // v1, v2, v3...
  submittedAt: string;         // ISO 8601
  content: ReportSnapshot;     // 提交时的完整内容副本
}

interface ReportSnapshot {
  plan: string;
  content: TaskItem[];
  currentWork: string;
  nextPlan: string;
  thoughts: string;
  other: string;
  updatedAt: string;
}
```

### 4.2 UserActionLog 实体（新建）

```ts
interface UserActionLog {
  id: number;
  userId: string;
  userName: string;
  action: 'edit' | 'submit' | 'view' | 'login' | 'logout' | 'export' | 'admin_unlock' | 'admin_lock' | 'comment_add';
  targetType: 'report' | 'knowledge_base' | 'user' | 'system';
  targetId?: string;
  targetDesc?: string;
  details?: string;   // JSON
  ip?: string;
  createdAt: string;
}
```

---

## 五、API 接口变更

### 5.1 新增接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/reports/:id/submit` | 提交当前草稿为快照 | 报告所有者 / 33528 |
| GET | `/reports/:id/submissions` | 获取该报告的提交历史 | 报告所有者 / admin |
| POST | `/reports/:id/unlock` | 管理员解锁某报告 | admin only（33528 也可） |
| POST | `/reports/:id/lock` | 管理员撤销解锁 | admin only（33528 也可） |
| GET | `/admin/action-logs` | 查询行为日志（支持筛选分页） | admin only |
| POST | `/action-logs` | 记录行为（内部调用或前端代理） | 需认证 |

### 5.2 修改接口

| 方法 | 路径 | 变更内容 |
|------|------|---------|
| PUT/POST | `/reports/:id` | 保存草稿前增加 `canEdit()` 校验；记录 edit 日志 |
| GET | `/reports/:id` | 返回数据中包含 `submissions`、`adminUnlock` 字段 |
| GET | `/reports` | 列表中增加每个报告的最新提交状态和截止时间 |

**权限补充说明**：
- `canEdit()` 校验顺序：33528 > 本人 + 截止前 > 本人 + adminUnlock > 拒绝
- 管理员（role === 'admin'）查看他人周报、操作解锁/锁定，但保存接口会拒绝其直接修改他人内容

---

## 六、前端界面变更

### 6.1 周报编辑器（WeeklyReportV2）

1. **顶部提醒横幅**：根据截止时间动态显示蓝/黄/红/灰四级状态
2. **工具栏**：
   - 新增「提交周报」按钮（主按钮，醒目位置）
   - 已提交时显示版本号标签（如「v3」）
   - 新增「查看上次提交」按钮（弹出只读对比抽屉）
3. **编辑器区域**：
   - 无权限时置灰/只读，显示锁定原因
   - 管理员解锁后恢复正常，显示解锁提示
4. **弹窗交互**：
   - 提交前确认弹窗：「提交后管理员将看到此版本，是否确认？」
   - 紧急阶段弹窗提醒（见时间提醒机制）

### 6.2 管理员界面

1. **周报权限管理**：
   - 在现有用户管理旁新增「周报提交管理」面板
   - 表格展示：用户 | 周次 | 提交状态 | 截止时间 | 操作（解锁/撤销）
2. **用户行为日志**：
   - 新增独立页面/Tab
   - 表格 + 筛选器 + 分页
   - 支持导出日志为 Excel/CSV

---

## 七、实施计划（按优先级排序）

### Phase 1：数据层与后端基础（预计 1 天）

1. 数据库迁移：为 `weekly_reports` 表新增 `submissions` JSON 字段、`admin_unlock` 等字段
2. 新建 `user_action_logs` 表
3. 后端实体类改造：`WeeklyReport` 加字段、`UserActionLog` 新建实体
4. 编写 `DeadlineCalculator` 工具类（ISO 周 → 周五 20:00）
5. 编写 `PermissionChecker` 工具类（统一 `canEdit()` 逻辑）
6. 数据兼容：现有无 `submissions` 的数据，首次访问时自动将当前内容初始化为 v1

### Phase 2：后端 API 开发（预计 1 天）

7. 实现 `POST /reports/:id/submit` 接口（快照复制逻辑）
8. 实现解锁/锁定接口（admin only）
9. 修改现有保存接口，增加编辑权限校验
10. 实现行为日志记录切面（AOP 或拦截器，在关键操作后自动落库）
11. 实现 `GET /admin/action-logs` 查询接口（支持分页、筛选）

### Phase 3：前端编辑器改造（预计 1 天）

12. 编辑器顶部增加截止时间倒计时横幅（四级颜色状态）
13. 工具栏增加「提交」按钮和「查看上次提交」按钮
14. 实现提交确认弹窗和提交成功提示
15. 根据权限状态切换编辑器只读/可编辑
16. 实现「上次提交」只读预览抽屉

### Phase 4：管理员功能前端（预计 0.5 天）

17. 新增「用户行为日志」页面（表格、筛选、分页）
18. 在管理员面板增加「周报提交管理」解锁功能
19. 管理员界面增加用户提交状态概览

### Phase 5：联调与边界处理（预计 0.5 天）

20. 测试多版本提交流程（v1 → v2 → v3）
21. 测试截止前/截止后/解锁后的编辑权限流转
22. 测试行为日志记录准确性和节流效果
23. 测试现有数据兼容性（无 submissions 字段的旧数据）
24. 时间提醒弹窗的防重复打扰验证

**总计预计工期：4 天**

---

## 八、风险与注意事项

1. **数据迁移**：现有数据无 `submissions`，首次加载时需要自动将当前内容初始化为 `v1` 快照，避免管理员看到空提交记录
2. **日志量控制**：`edit` 类型日志需要节流（建议 60 秒/用户/周报最多 1 条），否则自动保存会产生海量日志
3. **并发编辑**：多端同时编辑时仍采用 last-write-wins，快照以提交时为准
4. **时区统一**：所有时间计算统一使用服务器时区 Asia/Shanghai（UTC+8），避免跨时区混乱
5. **SQLite JSON 支持**：SQLite 3.38+ 支持 JSON 函数，确认当前版本兼容性；如不支持则用 TEXT 字段存储 JSON 字符串，由 Java 层序列化/反序列化
