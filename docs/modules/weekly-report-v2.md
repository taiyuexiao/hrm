# 模块：周报管理 v2（weekly-report-v2）

> 状态：✅ 稳定
> 最近更新：2026-09-13

## 摘要

系统核心模块。多科室按周填报工作进展：左中右三栏主界面（科室切换 / 任务树编辑 / 批注与 AI 总结），支持 Excel 导入、多人协作合并、评论 @ / 划词批注、提交流转（submit/unlock/lock）、周期新建与删除（软删除进回收站可恢复）、AI 总结 / 文本解析 / 全局分析，另有汇报演示视图。

## 范围与非范围

- 范围内：周报的创建、编辑、协作、提交、周期管理、AI 辅助
- 明确不做：知识库聚合导出（属 knowledge-base 模块）、提交管理/回收站页面（属 admin 模块，本模块只提供入口）

## 上下游依赖

- 上游：后端 `ReportController` `/api/reports/**`、`CommentController` `/api/reports/{week}/{dept}/comments`、`AiController` `/api/ai/**`
- 下游：knowledge-base（读取历史周报聚合）、PresentationView（同源数据演示）

## 关键接口与运行时信息

- 关键文件：
  - `src/components/weekly-report-v2/WeeklyReportV2.tsx` — 主界面（3500+ 行，路由 `/` 和 `/weekly-report-v2`）
  - `src/components/weekly-report-v2/data.ts` — 数据层，**所有 API 调用集中在此**（`_reports` 内存缓存 + REST）
  - `src/components/weekly-report-v2/types.ts` — 角色/权限/部门/用户定义
  - `PresentationView.tsx` — 演示视图（路由 `/presentation`）
- 周期下拉框：选项来自 `getDynamicWeekOptions()`（`_reports` 的 weekLabel ∪ 当前周五 − 回收站），倒序排列；顶栏 Select 用**原生虚拟滚动 + `optionRender` 定制行内容**（日期 + 删除图标），`showSearch` + `filterWeekOption` 同时匹配 `YYYY-MM-DD` 和 `YYYYMMDD`
- 周期删除规则（`canDeleteWeek`）：固化历史周不可删；超管任意删；其他管理员仅能删**当前周之后**的未来周（需 `DELETE_WEEK` 权限）
- 如何验证：本地前端 5173 + 后端 8080 起服务后，`cd e2e && npx playwright test`（必须 workers=1 串行，共享本地 SQLite）

## 设计决策与假设

- 2026-09-13 起，顶栏周期下拉从自定义 `dropdownRender` 改回 antd 原生渲染 + `optionRender`：自定义 `dropdownRender` 会使 rc-virtual-list 虚拟滚动失效（全量渲染所有周期 DOM），原生模式只渲染可视区约 10 行，滚动时按需创建。删除按钮、选中态等定制内容经 `optionRender` 注入，行为不变。
- e2e 中定位周期选项一律走**搜索过滤**（`fixtures.ts selectWeek`），不依赖 DOM 全量存在——虚拟列表未渲染的项无法直接点击。

## Bug 与问题记录

### 科室清单动态化（2026-09-13，配合新模块 department-management）
- 周报模块不再直接读 `types.ts` 的 `DEPTS`/`SORTED_DEPTS`（保留为 fallback），统一走 `src/services/deptStore.ts`：组件用 `useDepts()`，非组件代码（`createNextWeekGlobally`、导入科室匹配）用 `getDeptsSnapshot()`
- 关键坑：URL `dept` 深链接校验必须等动态清单加载完成（见 department-management 模块文档「首屏时序」）

### BUG-001 周期下拉全量渲染导致卡顿（2026-09-13，已解决）
- 错误行为：WHEN 周报周期增多后点开顶栏「周报周期」下拉 THEN 页面卡顿（所有周期一次性渲染为 DOM）
- 期望行为：WHEN 点开周期下拉 THEN 系统 SHALL 只渲染可视区选项，滚动流畅，且支持输入过滤定位周期
- 不可破坏的行为：WHEN 删除/恢复周期 THEN 系统 SHALL CONTINUE TO 走既有回收站联动（`handleDeleteWeekClick`/`canDeleteWeek`/回收站恢复后周期回到下拉框）；删除入口 ✕ 图标 SHALL CONTINUE TO 只对可删周期显示
- 根因：顶栏 Select 用自定义 `dropdownRender` 手写 `weekOptions.map` 全量渲染，绕过了 antd 原生选项列表的 rc-virtual-list 虚拟滚动
- 解决方式：`WeeklyReportV2.tsx` 顶栏 Select 删除 `dropdownRender`，改用原生 `options` + `optionRender` 渲染行内容，加 `showSearch` + `filterWeekOption`（同时匹配 `2026-07-02` 和 `20260702`）；options 数组 `useMemo` 缓存；`styles.css` 中 `.custom-week-dropdown/.custom-week-option` 样式删除，新增 `.week-option-row/.week-option-delete`；e2e 的 `selectWeek` 与 02/06 用例改为搜索过滤定位
- 验证方式：`npx tsc --noEmit`、`vite build` 通过；`e2e` 02（周下拉）与 06（周期管理与回收站）全绿；全量 e2e 中所有 `selectWeek` 调用方（03/04/05/09/10）通过

### BUG-003 周末自动创建下周周报且「本周工作内容」乱码（2026-09-14，已解决）
- 错误行为：WHEN 周末打开系统（或打开一个无数据的未来周期）THEN 系统自动创建下周周报，且继承来的「本周工作内容」是 `[{"id":"...","text":"...","checked":false,...}]` 式 JSON 原文乱码任务
- 期望行为：WHEN 打开无数据的周期 THEN 系统 SHALL 把上周「下周工作计划」继承为干净的任务树（含层级/子任务），且 SHALL NOT 在用户真实编辑前自动落库
- 不可破坏的行为：WHEN 手动点「新建下周报」/ 提交本周周报 THEN 系统 SHALL CONTINUE TO 走 `createNextWeekGlobally` / `syncNextWeek` 继承逻辑；WHEN 用户真实编辑 THEN 自动保存 SHALL CONTINUE TO 1 秒内落库
- 根因（三缺陷叠加）：
  1. 乱码：懒创建路径（`WeeklyReportV2.tsx` 无报告时初始化）用纯文本解析器 `parsePlanToTasks` 解析 JSON 序列化的 `nextPlan`（按钮路径用的是 JSON 感知的 `parseNextPlan`，所以手动创建不出问题——这也是此前排查未复现的原因）
  2. 周末自动创建：`getCurrentFridayWeekLabel` 周六日返回下周五 → 默认选中无数据的下周 → 懒创建；且「nextPlan 任务树同步效应」无守卫，加载时把 `''` 与 `'[]'` 判为不一致 → 误触发 `handleChange` → `isUserEditingRef=true` → 自动保存落库
  3. 次生污染：懒创建/`createNextWeekGlobally`/`syncNextWeek` 三处把 `currentWork`/`plan` 文本字段赋值为原始 JSON 字符串，导致导出/AI 总结/提交详情出现乱码片段
- 解决方式：①懒创建改 `parseNextPlan`；②三处 `currentWork`/`plan` 改存 `formatTasksForExport(tasks)` 格式化文本（与 ImportReportsModal 的 `tasksToText` 口径一致）；③nextPlan 同步效应加 `isUserEditingRef` 守卫；④存量数据：`scripts/repair_inherited_garble.py` 扫出乱码行并从 `current_work` 的原始 JSON 重建任务树（本库 246 行中 1 行乱码已修复，执行前已备份 hr.db）
- 验证方式：`npx tsc --noEmit` 通过；新增 `e2e/tests/16-week-inherit.spec.ts`（打开无数据未来周 → 继承干净任务树且无 JSON 碎片 → 3 秒后确认后端未自动落库）；全量回归 30/30 通过
- **复发与追加防线（2026-09-14 下午）**：上午修复后乱码于 13:40 复发——旧浏览器的 localStorage 里存着修复前的乱码草稿（任务 id 时间戳 9/12），用户打开页面触发草稿恢复/自动保存把乱码写回。追加两道措施：①`ReportService.saveReport` 增加**服务端保存自愈**：任务文本若能完整解析为任务数组则自动还原为任务树，`currentWork`/`plan` 若为 JSON 任务数组则改写为格式化文本（任何旧客户端/旧草稿/脚本提交乱码都会被服务端兜底，已用模拟旧客户端请求验证）；②再次执行 `repair_inherited_garble.py` 修复复发行。**注意：旧浏览器标签页需硬刷新（Cmd+Shift+R）加载新前端，草稿恢复弹窗若内容是乱码应选「不恢复」**
- **空数组垃圾任务（2026-09-14 傍晚）**：历史遗留另一种形态——任务文本为 `"[]"`（20260814、20260918 项目管理，页面显示「1.[]」）。修复脚本与后端自愈同步扩展：识别并删除此类垃圾节点（子任务上提），已清理并验证页面干净

## 已知限制与待办

- [ ] ~~e2e 07/11 写死周期过期~~（2026-09-13 已修复为动态未来周）
- [ ] 主界面单文件 3500+ 行，后续可拆分子组件
- [ ] 「下周计划→本周内容」的继承目前是全量覆盖式同步（`syncNextWeek`），若下一周已被人工改动会被覆盖，后续可考虑增量合并

| 2026-09-13 | 科室清单动态化：DEPTS 改走 deptStore（[见 department-management](department-management.md)） | — |

## 变更历史

| 日期 | 变更 | 关联需求 / bug |
|---|---|---|
| 2026-09-13 | 科室清单动态化，URL dept 深链接等清单加载 | 新需求：科室管理 |
| 2026-09-13 | 周期下拉改原生虚拟滚动 + optionRender + 搜索；e2e 02/06/fixtures 适配 | BUG-001 |
| 2026-09-14 | 懒创建继承改用 JSON 感知解析 + currentWork/plan 存格式化文本 + nextPlan 同步效应加编辑守卫 + 存量乱码数据修复脚本 | BUG-003 |
