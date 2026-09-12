# 权限与安全审计报告（2026-06-25）

> 说明：本报告由 Kimi Code CLI 只读审计生成，未修改任何代码。  
> 注：关于「服务器数据库角色字段迁移」这一最关键项，未写入本文档，单独向项目负责人说明。

## 审计范围

- 后端：`backend/src/main/java/com/hr/backend/...`
- 前端：`src/...`
- 部署配置：`deploy-config/`、`deploy-package/`、`docs/project-docs/DEPLOY.md`

## 一、严重风险（建议尽快修复）

### 1. `DELETE /api/reports` 可清空全部周报且无权限校验
- **位置**：`ReportController.java:292-296`
- **问题**：该接口不检查登录状态，也不检查任何权限。
- **后果**：任何人（包括未登录者）调用一次即可清空 `weekly_reports` 表全部数据。
- **影响**：数据丢失；系统功能瘫痪。

### 2. `POST /api/reports` 新建周报时不校验权限
- **位置**：`ReportController.java:65-100`
- **问题**：保存周报时，只有「报告已存在」才会调用 `PermissionChecker.canEdit`；若 `weekLabel+dept` 不存在，则直接创建新报告，不校验 `CREATE_NEXT_WEEK` 权限，也不校验当前用户身份。
- **后果**：
  - 普通用户可直接为其他科室、任意历史/未来周次创建报告。
  - 导入功能（`ImportReportsModal.tsx`）也会利用此缺口批量写入。
- **影响**：数据混乱；权限模型被绕过。

### 3. `change-password` 无身份校验
- **位置**：`AuthController.java:60-90`
- **问题**：改密码接口不需要登录，也不要求调用者是被修改的 `username`。
- **后果**：知道旧密码即可修改任意用户密码；未登录者也能尝试调用。
- **影响**：账号被盗用风险。

### 4. Spring Security 全局放行所有请求
- **位置**：`SecurityConfig.java:33-35`
- **问题**：`anyRequest().permitAll()` 导致所有接口默认公开，全靠 Controller 手动判断权限。
- **后果**：多个接口实际上无鉴权（如读取周报、清空周报、AI 解析等）。
- **影响**：整体安全基线缺失。

### 5. JWT 默认密钥为硬编码弱密钥
- **位置**：
  - `backend/src/main/resources/application.yml:15-17`
  - `deploy-config/application.yml:20-23`
  - `deploy-package/config/application.yml:20-23`
- **问题**：fallback 密钥为 `intelligent-hr-system-secret-key` 或 `CHANGE_THIS_IN_PRODUCTION`。
- **后果**：若生产未通过环境变量注入强密钥，任何人可伪造任意用户 Token（包括 33528）。
- **影响**：权限体系完全失效。

## 二、中等级别风险

### 6. 周报读取接口公开
- **位置**：`ReportController.java:33-63`、`45-63`
- **问题**：`GET /api/reports` 和 `GET /api/reports/{weekLabel}/{dept}` 无登录要求。
- **后果**：未登录即可读取全部周报、评论、提交记录。
- **影响**：信息泄露。

### 7. AI 解析接口公开
- **位置**：`AiController.java:27-65`
- **问题**：`POST /api/ai/parse-text` 无登录校验。
- **后果**：任意人均可调用 LLM，消耗配额并可能泄露内部数据。
- **影响**：成本与信息泄露风险。

### 8. 评论/回复可伪造作者
- **位置**：`CommentController.java:34-60`、`62-86`
- **问题**：`addComment`/`addReply` 只要求登录，不校验请求体里的 `authorId`/`authorName` 是否属于当前用户。
- **后果**：可冒充他人发评论；「作者可删自己评论」的逻辑也因此建立在不可信的 `authorId` 上。
- **影响**：数据可信度下降；权限判断不可靠。

### 9. 前端路由级访问控制缺失
- **位置**：`App.tsx:354-362`
- **问题**：所有页面路由无条件渲染，菜单/按钮隐藏只是 UI 层面。
- **后果**：直接输入 URL（如 `/admin/permissions`、`/admin/action-logs`、`/knowledge-base`）即可进入对应页面。
- **影响**：前端门控被轻易绕过。

### 10. 前端权限状态依赖 localStorage 缓存
- **位置**：`App.tsx:180-187`、`data.ts:179-204`
- **问题**：`auth-user` 存在 `localStorage`，服务端改角色/权限后当前会话不会刷新；用户也可手动篡改 localStorage。
- **后果**：菜单/按钮显示可能与真实权限不一致（虽然后端接口多数会拒绝执行）。
- **影响**：用户体验与权限感知不一致。

### 11. 角色切换会清空自定义特殊权限
- **位置**：`AuthController.java:214-224`
- **问题**：`PUT /users/{username}` 改角色时执行 `user.setPermissions(getDefaultPermissions(newRole))`。
- **后果**：如果管理员曾给用户单独授予 `EDIT_HISTORY`、`EDIT_AFTER_DEADLINE` 等，改角色后会被全部抹掉。
- **影响**：特殊授权丢失。

### 12. 给 `leader` 角色授予额外特殊权限无效
- **位置**：`PermissionChecker.java:70-77`、`PermissionManager.tsx`
- **问题**：后端 `hasPermission` 对 `leader` 直接返回固定权限集合，不读取数据库中的额外权限。
- **后果**：前端权限管理界面给领导开启 `EDIT_HISTORY` 等开关后，前端以为生效，后端仍拒绝执行。
- **影响**：界面与行为不一致。

### 13. 硬编码 fallback 工号可能带来意外提升/无法降级
- **位置**：
  - `PermissionChecker.java:16-23`
  - `src/components/weekly-report-v2/data.ts:207-209`
- **问题**：`LEGACY_ADMIN_IDS`（404423/319915/303423）和 `LEGACY_LEADER_IDS`（306852/314043/301953/306776）。
- **后果**：
  - 若生产 DB 误将 319915 改为 `user`，代码仍将其视为管理员。
  - 若有人注册/重命名为 404423，会被静默提升为管理员。
  - 若需要真正撤销某领导/管理员权限，fallback 会强制恢复。
- **影响**：权限调整不生效或意外提权。

### 14. 行为日志写入接口可被任意登录用户滥用
- **位置**：`UserActionLogController.java:19-37`
- **问题**：`POST /api/admin/action-logs/record` 只要带 Token 即可写入任意审计记录。
- **后果**：可伪造审计日志。
- **影响**：审计不可信。

### 15. 产物包中包含旧 DB 备份
- **位置**：`deploy-package/data/hr.db.bak.20260625202004`
- **问题**：该备份是角色未迁移的脏状态快照。
- **后果**：若运维误将其重命名为 `hr.db` 或用于恢复，会直接上线错误权限。
- **影响**：权限体系被破坏。

### 16. `app-config.json` 需按实际部署方式修改
- **位置**：`deploy-package/dist/app-config.json`
- **问题**：当前是 `{"apiBaseUrl":"/api"}`，只适用于同域或反向代理场景。
- **后果**：前后端分离部署时前端会 404/CORS。
- **影响**：系统无法正常使用。

### 17. LLM API Key 明文写入部署配置和文档
- **位置**：
  - `deploy-config/application.yml:31-32`
  - `deploy-package/config/application.yml:31-32`
  - `docs/project-docs/DEPLOY.md:274-275,321-322`
- **问题**：API Key 以明文形式存在。
- **后果**：`deploy-package.zip` 外传即泄露 Key。
- **影响**：密钥泄露。

### 18. 新建 DB 时前端菜单会缺失
- **位置**：`backend/src/main/resources/users.json`、`App.tsx:217-228,267-287`
- **问题**：`users.json` 没有 `permissions` 字段，新 DB 初始化后所有用户 `permissions=[]`；前端菜单直接读 `permissions` 判断显示。
- **后果**：即使是 33528 或 admin，侧边栏也可能缺少「账号管理」「权限管理」「知识库」等入口（功能仍可访问，只是菜单不显示）。
- **影响**：界面不完整。

## 三、低风险/提示

19. **`ReportController.unlockReport/lockReport`** 不校验目标报告是否存在，对不存在的资源也返回成功。
20. **`CommentController.toggleResolved`** 不校验评论是否属于 URL 中的 `{weekLabel}/{dept}`。
21. **`AuthController.checkSuperAdmin()`** 未对 `SecurityContextHolder.getAuthentication()` 做空检查。
22. **CORS 配置为 `*`**：`SecurityConfig` 和 `WebConfig` 允许任意来源 + credentials，扩大了 CSRF 攻击面。
23. **历史周锁定列表不一致**：`PermissionChecker.HISTORICAL_WEEKS`（5 周）与 `ReportService` 中的锁定逻辑（9 周）不一致。
24. **`AuthController` 不检查 `status`**：禁用/删除的用户，其旧 Token 仍可继续使用至过期。

## 四、建议修复优先级

1. **P0（上线前必须）**：修复 `DELETE /api/reports`、`POST /api/reports` 新建权限、`change-password` 身份校验、JWT 强密钥、服务器 DB 角色迁移（单独说明）。
2. **P1（上线后尽快）**：补齐 `GET /api/reports` 登录校验、`AI parse-text` 登录校验、评论作者绑定、Spring Security 默认拒绝策略。
3. **P2（优化）**：前端路由守卫、localStorage 刷新机制、清理 `deploy-package` 中的旧备份、环境变量化 LLM Key。
