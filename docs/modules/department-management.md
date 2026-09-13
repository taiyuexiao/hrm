# 模块：科室管理（department-management）

> 状态：✅ 稳定
> 最近更新：2026-09-13

## 摘要

科室从「前端硬编码常量」升级为「后端字典表 + 管理界面」：超管在账号管理弹窗内创建新科室，并在创建/编辑账号时把账号分配到任意科室。新科室立即出现在周报科室 Tab 栏、科室下拉、提交统计与「新建下周报」范围中。

## 动机

科室（项目管理、架构管理、各数据部等）原本写死在前端 `types.ts` 的 `DEPTS` 常量，组织调整必须改代码发版。需求：管理员自助创建科室并分配账号。

## 范围与非范围

- 范围内：新增科室、账号创建/改派时选择科室、全前端科室清单动态化
- 明确不做：**科室删除与改名**——`weekly_reports`/`notifications`/`suggestions` 中的科室名是字符串引用，删改会产生孤儿数据，需单独立项（清理策略/级联方案）；科室排序调整 UI（新科室固定排末尾）

## 上下游依赖

- 上游：无（字典源）
- 下游：周报管理 v2（Tab 栏/科室下拉/新周期创建/导入匹配/URL 白名单）、汇报演示视图、提交管理统计、账号管理

## 关键接口与运行时信息

- 后端：
  - `backend/.../dao/DeptDao.java` — `departments(name PK, sort_order, created_at)` 表，启动时若为空则种子 15 个历史科室（次序 = 旧 `DEPT_ORDER`）；新科室 `sort_order = max+1`
  - `backend/.../controller/DeptController.java` — `GET /api/depts`（登录即可读）、`POST /api/depts {name}`（仅超管 33528，与账号管理同级；重名/超长拒绝）
  - `AuthController` 建号/改号：role=user 且 dept 非空时校验科室必须已登记（防自由文本脏数据）；leader/admin 的归属（总经理室/系统管理员）不在科室表，不受校验
- 前端：
  - `src/services/deptStore.ts` — 唯一入口：`loadDepts()`（App 启动时调用）、`useDepts()/useDeptItems()`（组件）、`getDeptsSnapshot()`（非组件代码）、`createDept()`；失败静默回落到 `types.ts` 的 `DEPTS`（保留为 fallback，勿删）
  - 入口 UI：`UserManagement.tsx`（头像菜单 → 账号管理）：「科室管理」按钮 + 创建账号部门下拉 + **部门列可点击改派**（本次新开放，编辑账号原来不能改 dept）
- 如何验证：e2e `tests/12-dept-management.spec.ts`（需 `E2E_SUPER_PASSWORD` 环境变量，超管用例）

## 设计决策与假设

- **字典表而非配置文件**：需求是管理员界面自助管理，且要驱动前后端校验，配置文件方案否掉
- **排序数据化**：`sort_order` 列承接旧 `DEPT_ORDER` 的展示/导出次序语义；前端 `sortByDeptOrder`（导出/全局分析排序）仍用静态 `DEPT_ORDER`，新科室自然排末尾，与后端行为一致
- **首屏时序**：WeeklyReportV2 的 URL `dept` 白名单校验在清单加载完成前不清除 dept 参数（`useEffect` 依赖 `deptList`），否则指向新科室的深链接会在 `loadDepts` 完成前被误判非法丢弃——这是本次实测抓到的坑
- **新科室不补建当前周周报**：Tab 栏按清单渲染，首次编辑保存时按既有逻辑落库

## Bug 与问题记录

暂无。

## 已知限制与待办

- [ ] 科室无删除/改名（见「非范围」）
- [ ] 仅超管可创建科室；若未来下放给普通管理员，改 `DeptController` 的鉴权即可
- [ ] e2e 清理测试科室靠 sqlite3 直接清库（无删除端点）

## 变更历史

| 日期 | 变更 | 关联需求 / bug |
|---|---|---|
| 2026-09-13 | 新建模块：departments 表 + /api/depts + deptStore 动态化 + 账号管理页科室管理与改派 | 管理员创建科室并分配账号 |
