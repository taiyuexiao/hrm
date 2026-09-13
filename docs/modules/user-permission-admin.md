# 模块：用户与权限管理（user-permission-admin）

> 状态：✅ 稳定
> 最近更新：2026-09-13

## 摘要

账号 CRUD、改密/重置密码、角色-权限矩阵管理。角色四级：superadmin（系统管理员）/admin（管理员）/leader（总经理室）/user（普通用户）；权限码细粒度控制（USER_MANAGE、PERMISSION_MANAGE、AI_SUMMARY 等），前端菜单与后端端点均以角色/权限码为门槛。

## 关键接口与运行时信息

- 后端 `AuthController` `/api/auth`：login、change-password、users CRUD、reset-password、`/users/{username}/permissions`、`/permissions/default`
- 后端 `PermissionChecker`（`backend/.../util/PermissionChecker.java`）：`isSuperAdmin`/`isAdmin`/`isLeader`/`hasPermission`/`checkEdit`/`checkSubmit`——**全部按 currentUser 的 role/permissions 判断**（role 与 permissions 由 `JwtAuthenticationFilter` 从库里读出放进 request attribute，不依赖 JWT 内的声明，改角色即时生效）
- 前端：`UserManagement.tsx`（头像菜单「账号管理」，含科室管理）、`PermissionManager.tsx`（`/admin/permissions`）、`data.ts isSuperAdmin/isAdmin/isLeader`
- 权限默认值：前后端各持一份 `getDefaultPermissions(role)`，建号/切换角色时由后端分配

## 设计决策与假设

- **授权一律按角色/权限码，不绑定工号**（2026-09-13 起）：原先「仅 33528」的硬编码已全部移除；superadmin 角色即系统管理员
- **保留的 33528 特例**（根账号保护，不是授权门槛）：`AuthController` 中不能修改 33528 的角色、不能剥夺其 USER_MANAGE/PERMISSION_MANAGE 权限；`PermissionManager` 前端禁用其开关。注意 33528 账号本体已于 2026-09-13 从库中删除，这些保护目前无对象，属防御性保留
- 前端 `types.ts SYSTEM_USERS` 与 `users.json` 种子仍含 33528——仅在空库初始化时生效，存量库无影响

## Bug 与问题记录

### BUG-002 superadmin 角色账号被拒于管理功能之外（2026-09-13，已解决）
- 错误行为：WHEN 308193（role=superadmin，权限全满）打开账号管理 THEN 后端返回「无权限，仅系统管理员可操作」
- 期望行为：WHEN 任意 superadmin 角色（或持 USER_MANAGE/PERMISSION_MANAGE 权限）的账号访问管理功能 THEN 系统 SHALL 放行
- 不可破坏的行为：WHEN 普通用户/leader/admin 访问管理端点 THEN 系统 SHALL CONTINUE TO 拒绝（admin 角色默认权限表刻意不含 USER_MANAGE/PERMISSION_MANAGE）；33528 根账号保护 SHALL CONTINUE TO 生效
- 根因：前后端门槛不一致——前端按权限码显示入口，后端 `AuthController.checkSuperAdmin` 与 `PermissionChecker.isSuperAdmin` 写死 `username == "33528"`
- 解决方式：`PermissionChecker.isSuperAdmin` 改判 `role == "superadmin"`；`AuthController` 新增 `checkManagePermission(permCode)`（superadmin 角色或持对应权限码放行），账号管理端点用 USER_MANAGE、权限管理端点用 PERMISSION_MANAGE；`DeptController` 同步；前端 `data.ts isSuperAdmin`、`App.tsx` 建议箱/回收站菜单、PermissionManager 文案同步去硬编码；e2e 超管账号改为 `E2E_SUPER_USERNAME`/`E2E_SUPER_PASSWORD` 环境变量
- 验证方式：308193 实测通过（users 列表、创建科室、重名拒绝）；e2e_test（普通角色）仍被拒；全套 e2e 20 通过

## 已知限制与待办

- [ ] users 表存 `password_plain` 明文列（管理员界面「显示密码」用），生产前需评估合规性
- [ ] 「不能修改 superadmin 角色」目前只保护 33528，未来可考虑泛化为「不能剥夺最后一个 superadmin」

## 变更历史

| 日期 | 变更 | 关联需求 / bug |
|---|---|---|
| 2026-09-13 | 授权去工号硬编码，全链路按角色/权限码 | BUG-002 |
| 2026-09-13 | 建号/改号 dept 校验 + 编辑账号开放改派科室（见 [department-management](department-management.md)） | 科室管理需求 |
