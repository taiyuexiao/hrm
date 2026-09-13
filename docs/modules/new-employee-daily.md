# 新人培养报告（日报/周报/月报）模块

> 状态：✅ 第一期已完成（2026-09-13，e2e 全量回归 24/24 通过）
> UI 原型：`docs/modules/new-employee-daily/prototype.html`（6 屏，浏览器直接打开）

## 一、模块是什么

与科室周报**完全并行**的独立应用：新人按工作日填日报（后续周/月报），mentor 填小组+个人带教周/月报，领导查阅批注。与周报系统共享登录入口、账号库、JWT、通知通道，数据表与页面完全独立。

## 二、关键设计决策（why）

### 账号模型（2026-09-13 定稿）

- `users.role` 新增取值 `daily`：**纯日报账号**（新人、mentor），与周报系统互不可见
- `users.daily_role`：`NULL`（无日报身份）/ `newbie` / `mentor` / `leader`
- 双系统用户 = 传统角色 + `daily_role` 非空（如四位领导），登录后出选择页
- **不落任何人名进代码**：领导/mentor 全部通过账号管理页配置（33528 教训）
- mentor 的"带教关系"记在**新人账号**的 `mentor` 字段上

### 权限规则（一句话）

**读全开，写归己，评论人人可发**：所有登录用户可查看全部日报与评论；新人只能写自己的报告；点阵看板仅 mentor/leader。

### 后端解耦原则（应用户要求）

- `sections` 为**自由 JSON**（键由前端定义），后端不感知栏目结构 → 前端调栏目不用改后端
- `report_type`（daily/weekly/monthly）与 `period` 格式后端只做透传存储，第一版前端只开日报
- API 返回结构化原始数据，不为具体页面定制

### 对接周报系统的原则（慎重，加而不改）

- 只做：登录响应加 3 个字段、菜单加 1 项、`/daily` 路由加 1 条、`role='daily'` 根路由重定向
- 不改：周报任何既有接口行为；`role='daily'` 账号无周报权限码（默认空列表）
- 通知复用 `notifications` 表，日报通知 type 以 `DAILY_` 前缀区分，点击路由到 `/daily`

## 三、数据模型

| 表 | 说明 |
|---|---|
| `newbie_groups` | id、name、leader（组长）、sort_order、created_at |
| `newbie_reports` | id(UUID)、username、report_type、period、sections(JSON)、status(draft/submitted)、submitted_at、version、软删除；UNIQUE(username, report_type, period) |
| `newbie_comments` | id、report_id、parent_id（回复）、author_id/name/role、content、quote（划词批注引用）、mentions(JSON)、created_at |
| `newbie_report_reads` | (report_id, username) 主键、read_at —— 已读状态 |

`mentor_reports`（小组/个人带教报告）留待第三期，结构预留：scope(group/person) + target + content JSON。

## 四、API 一览（`/api/daily/**`）

| 端点 | 说明 | 鉴权 |
|---|---|---|
| GET `/meta` | 小组、新人清单（含 mentor）、mentor 清单 | 登录 |
| POST `/groups` | 新增小组 | USER_MANAGE |
| GET `/reports/mine?type=&period=` | 我的报告（无则 null） | 登录 |
| PUT `/reports` | 保存草稿（upsert 自己的，仅 newbie） | 登录+本人 |
| POST `/reports/{id}/submit` | 提交（幂等） | 本人 |
| GET `/feed?type=&period=` | 全员该周期报告（左连接新人表，缺报显示 null） | 登录 |
| GET `/reports/{id}` | 报告 + 评论 + 已读名单 | 登录 |
| POST `/reports/{id}/comments` | 评论/回复（quote、mentions），触发通知 | 登录 |
| DELETE `/comments/{id}` | 删自己的评论（superadmin 可删任意） | 本人/超管 |
| POST `/reports/{id}/read` | 上报已读 | 登录 |

## 五、前端结构

- `src/services/dailyApi.ts`：API 客户端
- `src/components/newbie-daily/`：`DailyApp`（外壳+填报/浏览切换）、`FillView`（五段式+解析填入+自动保存+提交）、`BrowseView`（小组树+报告+评论区）、`ChoosePage`（双系统选择页）
- 对接点：`App.tsx` 路由 `/daily`、`/choose`；侧边栏「新人报告」（非 daily 角色可见）；`role='daily'` 根路由重定向；双系统账号登录后跳 `/choose`

## 六、分期

- **第一期（本次）**：账号模型 + 登录分流/选择页 + 日报填报（解析填入）+ 浏览/批注/回复/已读/通知 + 账号管理支持 daily 账号与小组管理 + e2e 13
- **第二期**：点阵看板 + 补交提醒
- **第三期**：新人周/月报 + mentor 小组/个人报告 + AI 总结/完成度

## 七、已知限制

- 报告 version 字段只做递增，未做乐观锁校验（单作者场景，冲突概率低）
- @提醒仅匹配 meta 中的新人与 mentor（领导账号不在 meta 内，@领导暂不触发通知）
- 法定节假日未处理，工作日=周一至周五

## 八、Bug 与问题记录

### BUG-001 老员工评论日报 500（2026-09-13 已解决）

- **错误行为**：无日报身份的老员工调用 `POST /daily/reports/{id}/comments` 返回 HTTP 500（NPE），新员工评论正常
- **期望行为**：任何登录用户均可评论
- **不可破坏的行为（回归保护区）**：评论作者身份标签（newbie/mentor/leader/staff）正确；通知仍发给报告作者/被回复者/@提及人
- **根因**：`Set.of(...)` 创建的不可变集合 `contains(null)` 会抛 NPE，老员工 `dailyRole` 为 null 触发
- **解决**：判空后再 contains（`DailyReportController.addComment`）。教训：`Set.of`/`List.of` 的 contains/indexOf 对 null 不友好，成员可能为 null 时先判空
