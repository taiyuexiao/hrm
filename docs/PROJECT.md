# HRM 数据部管理工作台 — 项目主文档

> 本文档是项目级索引：总览、模块索引、变更日志、关键问题、待办。
> 细节下沉到 `docs/modules/<module>.md`（按需读取，勿全量加载）。
> 本项目为存量项目，2026-09-13 起按 module-docs 模式补建文档；历史模块文档尚未补写，**新需求/bug 修复从此时起按模块沉淀**。

## 一、项目是什么

面向银行数据部的内部管理工作台，核心是**多科室周报管理**：各科室按周填报/解析/提交工作进展，支持评论协作、合并冲突处理、AI 总结与全局分析；外围有知识库（历史周报聚合导出）、管理后台（提交管理/行为日志/建议箱/回收站）、用户与权限管理。

## 二、技术栈

- **前端**：React 18 + TS 5 + Vite 5 + Ant Design 5 + react-router v6；产物经 `vite-plugin-singlefile` 打单文件 + legacy 插件兼容旧浏览器（内网部署）；Excel 处理用 xlsx/file-saver/jszip
- **后端**：Spring Boot 3.0 + Java 17，**无 ORM（手写 JDBC）**，SQLite 单文件库（`backend/data/hr.db`），JWT 鉴权（jjwt 0.9.1），Springfox Swagger
- **AI**：LLM 一律由后端 `/api/ai/**` 转发公司内网大模型网关（`LlmService`），前端不直连；`public/llm-config.json` 已废弃
- **部署**：前端静态文件放 Tomcat9（`WEB-INF/web.xml` 做 404→index 回退），后端单 jar + 外部化 `application.yml`（env 可覆盖）；交付物在 `deploy-package/`，运维手册见其 `DEPLOY.md`
- **测试**：`e2e/` Playwright（11 个 spec，需本地前端 5173 + 后端 8080 运行）；`e2e/midscene/` AI 驱动测试；`e2e/ai-exploratory/` 探索式测试知识库

## 三、模块索引

> 状态说明：✅ 已有模块文档 / 📝 文档未建（存量模块，待涉及时再补）

| 模块 | 说明 | 代码位置 | 文档 |
|---|---|---|---|
| 周报管理 v2（核心） | 左中右三栏主界面：任务树、Excel 导入、多人协作合并、评论/@/划词批注、提交流转、AI 总结/解析/全局分析 | `src/components/weekly-report-v2/`；后端 `ReportController` `/api/reports`、`CommentController`、`AiController` | [✅](modules/weekly-report-v2.md) |
| 汇报演示视图 | 周报的演示/汇报模式 | `src/components/weekly-report-v2/PresentationView.tsx`，路由 `/presentation` | 📝 |
| 知识库 | 历史周报树形聚合生成，导出 MD/JSON/ZIP | `src/components/knowledge-base/`，路由 `/knowledge-base` | 📝 |
| 管理后台 | 提交管理、行为日志（可回滚）、建议箱、回收站（软删除恢复） | `src/components/admin/`，路由 `/admin/*`；后端 `UserActionLogController`、`SuggestionController` | 📝 |
| 用户与权限管理 | 账号 CRUD、角色-权限矩阵（superadmin/admin/leader/user + 细粒度权限码） | `src/components/user-management/`、`permission-manager/`；后端 `AuthController` `/api/auth`、`PermissionChecker` | [✅](modules/user-permission-admin.md) |
| 科室管理 | 科室字典表 + 动态清单；超管创建科室、账号分配/改派科室 | 后端 `DeptController` `/api/depts`、`DeptDao`；前端 `src/services/deptStore.ts` | [✅](modules/department-management.md) |
| 新人培养报告（日报） | 新人日报填报/浏览/批注，mentor 带教报告，领导看板；与周报并行的独立应用 | 后端 `DailyReportController` `/api/daily`、`DailyDao`；前端 `src/components/newbie-daily/` | [✅ 第一期](modules/new-employee-daily.md) |
| 认证与安全 | 登录、JWT、首次登录强制改密、无操作自动退出 | `src/pages/`、后端 `SecurityConfig`/`JwtAuthenticationFilter` | 📝 |
| 数据处理脚本 | 周报 Excel 解析/导入 SQLite、AI 预生成总结、员工数据合并打标、任务前缀修复 | `scripts/`（Python + 少量 ts/mjs 自测） | 📝 |
| 部署交付 | 打包、启动/停止脚本、外部化配置、运维手册 | `deploy-config/`、`deploy-package/`、`build.sh` | 📝 |

## 四、关键架构事实（新会话必读）

- 前端 API 基址由 `public/app-config.json` 启动时加载（默认 `/api`），部署后改 dist 下该文件即可指向任意后端，**无需重新构建**
- 权限模型：角色 superadmin/admin/leader/user + 权限码，**前后端均按角色/权限码判断**（2026-09-13 起不再绑定工号 33528；33528 账号已删，当前超管为 308193）
- 通知：评论 @/同部门评论触发，30 秒轮询 `/notifications`
- SQLite 备份 = 复制 `hr.db`；`backend/data/weekly-reports.json` 是历史遗留兜底数据
- e2e 用共享本地 SQLite，必须 `workers=1` 串行跑

## 五、已知问题 / 风险

- CLI 构建后端无全局 mvn：用 IntelliJ 捆绑 Maven + JDK17，命令：`cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@17 "/Applications/IntelliJ IDEA.app/Contents/plugins/maven-plugin/lib/maven3/bin/mvn" clean package -DskipTests`（勿用 JBR 25：Lombok 1.18.24 不兼容；pom 已显式声明 annotationProcessorPaths，JDK 23+ 需配合 `-Dlombok.version=1.18.42`）
- `src/services/api.ts` 内有旧 HR Dashboard 残留的 mockData 与 employeeApi 等**死代码**（无页面引用）；`src/utils/sqlEngine.ts` 同样无引用；package.json 的 `echarts` 已无引用
- `scripts/llm_config.py` **硬编码真实内网 API Key**（后端 Java 侧已改为配置注入，Python 脚本侧仍是明文）
- jjwt 0.9.1 为老版本，留意安全与升级问题
- 后端数据访问大量散在 service 层 Map/JSON 操作，仅 `UserDao`、`DeptDao` 两个 DAO
- e2e ~~07/11 存在与代码无关的既有失败~~（2026-09-13 已修复：全部 spec 的测试周期均为动态未来周）

## 六、变更日志

| 日期 | 类型 | 摘要 | 涉及模块 |
|---|---|---|---|
| 2026-09-13 | 新增 | 新人培养报告模块第一期：daily 角色 + daily_role/group_id/mentor 账号字段、`/api/daily/**`（4 张新表）、日报填报（解析填入/自动保存/提交）、浏览批注/回复/已读/通知、双系统登录选择页与侧边栏入口、账号管理支持 daily 账号与小组管理；e2e 13 新增，全量 24/24（[文档](modules/new-employee-daily.md)） | 新人培养报告、用户与权限管理 |
| 2026-09-13 | 修复 | 授权去工号硬编码：isSuperAdmin 改角色判断、管理端点按 USER_MANAGE/PERMISSION_MANAGE 权限码；e2e 超管账号改环境变量（[BUG-002](modules/user-permission-admin.md#bug-002-superadmin-角色账号被拒于管理功能之外2026-09-13已解决)） | 用户与权限管理、科室管理 |
| 2026-09-13 | 修复 | e2e 07/11 测试周期改动态未来周（与 06 一致），消除写死 `20260904` 过期的既有失败；全量回归 22/22 通过 | 数据处理脚本（e2e） |
| 2026-09-13 | 新增 | 科室管理：departments 字典表 + `/api/depts` + 前端 deptStore 动态化（替换全部 DEPTS 引用点）+ 账号管理页新增科室/改派科室；e2e 12 新增（[文档](modules/department-management.md)） | 科室管理、周报管理 v2 |
| 2026-09-13 | 修复 | 周期下拉卡顿：自定义 dropdownRender 改原生虚拟滚动 + optionRender + showSearch；e2e 02/06 适配，06 测试周期改动态未来周（[BUG-001](modules/weekly-report-v2.md#bug-001-周期下拉全量渲染导致卡顿2026-09-13已解决)） | 周报管理 v2 |
| 2026-09-12 | 里程碑 | 功能大版本合入：权限体系、AI 迁移后端、周报协作模块等 6–9 月开发内容（git `11d31dc`） | 全局 |
| 2026-06-03 | 整理 | 代码整理与 LLM 配置提取（git `fc06cf7`） | AI、脚本 |

## 七、待办 / 后续方向

- [ ] 存量模块文档按需补写（涉及哪个补哪个，不一次性全补）
- [ ] 清理死代码（旧 Dashboard API、sqlEngine、echarts 依赖）
- [ ] `scripts/llm_config.py` 密钥改为环境变量注入
