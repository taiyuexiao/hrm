# 新人培养报告（日报/周报/月报）模块

> 状态：✅ 第三期已完成，功能全部就绪（2026-09-13，e2e 全量回归 29/29 通过）
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
| `mentor_reports` | id(UUID)、mentor、scope(group/person)、target（组 id 或新人工号）、report_type(weekly/monthly)、period、sections(JSON)、status、submitted_at、version、软删除；UNIQUE(mentor, scope, target, report_type, period) |

评论/已读通过 `DailyDao.findAnyReport` 通挂两类报告（UUID 跨表唯一）；新人报告 sections 键跨日/周/月稳定（today/tomorrow/problems/ongoing），标签由前端按类型切换；mentor 报告两套模板（小组 groupTasks/training/overall/nextTasks/issues，个人 traits/progress/improve/guidance/unsolved）均为前端 schema，后端无感。

## 四、API 一览（`/api/daily/**`）

| 端点 | 说明 | 鉴权 |
|---|---|---|
| GET `/meta` | 小组、新人清单（含 mentor）、mentor 清单 | 登录 |
| POST `/groups` | 新增小组 | USER_MANAGE |
| GET `/reports/mine?type=&period=` | 我的报告（无则 null） | 登录 |
| PUT `/reports` | 保存草稿（upsert 自己的，仅 newbie） | 登录+本人 |
| POST `/reports/{id}/submit` | 提交（幂等） | 本人 |
| GET `/feed?type=&period=` | 全员该周期报告（左连接新人表，缺报显示 null） | 登录 |
| GET `/reports/{id}` | 报告 + 评论 + 已读名单（两类报告通用） | 登录 |
| POST `/reports/{id}/comments` | 评论/回复（quote、mentions），触发通知 | 登录 |
| DELETE `/comments/{id}` | 删自己的评论（superadmin 可删任意） | 本人/超管 |
| POST `/reports/{id}/read` | 上报已读 | 登录 |
| GET `/dashboard?from=&to=` | 看板数据源：区间内新人报告 + mentor 周/月报原始行（判定在前端） | mentor/leader/超管 |
| GET `/missing?days=N` | 新人：最近 N 天未交工作日；mentor：缺交的小组周报周期 | newbie/mentor |
| GET `/mentor-reports/mine?scope=&target=&type=&period=` | 我的带教报告（无则 null） | mentor |
| PUT `/mentor-reports` | 带教报告草稿（upsert 自己的；个人报告对象必须是所带新人） | mentor |
| POST `/mentor-reports/{id}/submit` | 提交带教报告（幂等） | mentor 本人 |
| GET `/mentor-reports/feed?type=&period=` | 某周期全部 mentor 报告 | 登录 |
| POST `/reports/{id}/ai-summary` | AI 总结 + 完成度评估（两类报告通用，复用 LlmService） | 登录 |

## 五、前端结构

- `src/services/dailyApi.ts`：API 客户端 + 栏目 schema（NEWBIE/MENTOR_GROUP/MENTOR_PERSON_SECTIONS）+ 周期工具（toPeriod/fridayOf/monthPeriod/formatPeriod）
- `src/components/newbie-daily/`：`DailyApp`（外壳+填报/带教填报/浏览/看板切换）、`FillView`（新人日/周/月报）、`MentorFillView`（小组+个人带教报告）、`BrowseView`（五类报告浏览+划词批注+AI 总结）、`DashboardView`（新人点阵+带教提交区块）、`ParseModal`+`parseFill.ts`（解析填入）、`ChoosePage`（双系统选择页）
- 对接点：`App.tsx` 路由 `/daily`、`/choose`；侧边栏「新人报告」（非 daily 角色可见）；`role='daily'` 根路由重定向；双系统账号登录后跳 `/choose`

## 六、分期

- **第一期（2026-09-13 完成）**：账号模型 + 登录分流/选择页 + 日报填报（解析填入）+ 浏览/批注/回复/已读/通知 + 账号管理支持 daily 账号与小组管理 + e2e 13
- **第二期（2026-09-13 完成）**：点阵看板（月视图、绿=已交/黄=补交/灰=缺交、点击圆点跳浏览定位）+ 补交提醒横幅（点击跳最早缺交日）+ e2e 14
- **第三期（2026-09-13 完成）**：新人周/月报（结构与日报相同，键稳定标签随类型切换）+ mentor 小组/个人带教报告（`mentor_reports` 表、两套五段模板、个人报告对象后端强校验）+ AI 总结/完成度（`/reports/{id}/ai-summary` 复用 LlmService，网关未配置时友好报错）+ 看板带教提交区块（周/月报圆点 + 个人报告 x/y）+ 划词批注（正文划选文字生成引用批注）+ mentor 补交提醒（小组周报缺交）+ e2e 15

### 第三期补充决策

- **新人周/月报复用同表同键**：reportType + period 区分（周报=当周五 YYYYMMDD，月报=YYYYMM），sections 键不变，后端零改动
- **mentor 报告独立表**：两套模板字段差异大，sections JSON 承载；scope=person 时后端校验 target 必须是当前 mentor 所带新人（防越权写评估）
- **AI 只做单份报告级**：`/reports/{id}/ai-summary` 一次调用产出「总结+完成度评估」两节；小组/全员聚合分析留作后续方向
- **解析填入规则参数化**：`parseFill.ts` 一套算法三套规则（新人/mentor 小组/mentor 个人），标题同义词覆盖「本周/这周/本月」等
- **mentor 小组自动识别**：所带新人同组则自动带出，跨组（极端情况）手工选组

### 第二期补充决策

- **补交提醒只做登录横幅，不做通知表推送**：横幅由 `/missing` 实时计算，天然去重；推送需要定时任务+已提醒记账，复杂度不值
- **看板对超管开放**（`role=superadmin` 即使无 daily_role）：便于运维与验收，不破坏"mentor/leader 专属"的业务口径
- **补交判定规则在前端**（`DashboardView.cellOf`）：`submitted_at` 日期晚于 period 即补交（黄点）；后端只返回原始行，展示规则后续可改不动后端

## 七、已知限制

- 报告 version 字段只做递增，未做乐观锁校验（单作者场景，冲突概率低）
- @提醒仅匹配 meta 中的新人与 mentor（领导账号不在 meta 内，@领导暂不触发通知）
- 法定节假日未处理，工作日=周一至周五
- 补交提醒无法识别新人入职日期（users 表无创建时间），新账号会把过去 30 天工作日全部计为缺交；入职较早则无影响

## 八、Bug 与问题记录

### BUG-001 老员工评论日报 500（2026-09-13 已解决）

- **错误行为**：无日报身份的老员工调用 `POST /daily/reports/{id}/comments` 返回 HTTP 500（NPE），新员工评论正常
- **期望行为**：任何登录用户均可评论
- **不可破坏的行为（回归保护区）**：评论作者身份标签（newbie/mentor/leader/staff）正确；通知仍发给报告作者/被回复者/@提及人
- **根因**：`Set.of(...)` 创建的不可变集合 `contains(null)` 会抛 NPE，老员工 `dailyRole` 为 null 触发
- **解决**：判空后再 contains（`DailyReportController.addComment`）。教训：`Set.of`/`List.of` 的 contains/indexOf 对 null 不友好，成员可能为 null 时先判空

### BUG-002 看板跳浏览显示"尚未填写"（2026-09-13 已解决）

- **错误行为**：看板点击历史日期的补交圆点，浏览页定位到该新人该日后显示"尚未填写"，左侧树却显示"已交"
- **期望行为**：跳转后显示当天日报内容
- **不可破坏的行为（回归保护区）**：看板→浏览跳转定位功能；浏览页正常的日期切换与新人选择
- **根因**：竞态——`setDate` 切换周期后 `period` 立即变化，但 `entries` 仍是旧周期数据，跳转定位 effect 在目标周期 feed 返回前就用旧 entries 选中（report 为 null）并消费了 target
- **解决**：BrowseView 增加 `loadedPeriod` 状态（feed 成功时记录），定位 effect 必须等 `loadedPeriod === period` 才执行选择。教训：异步数据驱动的联动定位，必须确认数据与目标状态同源后再消费跳转参数
