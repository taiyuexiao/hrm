package com.hr.backend.controller;

import com.hr.backend.dao.UserDao;
import com.hr.backend.entity.User;
import com.hr.backend.service.UserActionLogService;
import com.hr.backend.utils.JwtUtils;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    @Autowired
    private UserDao userDao;

    @Autowired
    private com.hr.backend.dao.DeptDao deptDao;

    @Autowired
    private JwtUtils jwtUtils;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private UserActionLogService userActionLogService;

    public static final String INITIAL_PASSWORD = "B@s95594!";

    // 密码策略（NIST SP 800-63B 风格）：接受任意字符（含全角/中文），仅限制长度 8~64 位，拒绝常见弱口令
    private static final int PASSWORD_MIN_LENGTH = 8;
    private static final int PASSWORD_MAX_LENGTH = 64;
    private static final Set<String> WEAK_PASSWORDS = Set.of(
            "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000",
            "password", "password1", "qwerty123", "abc12345", "admin123", "admin1234",
            "qwer1234", "iloveyou", "12312312", "1qaz2wsx", "qazwsx12", "aaaaaaaa");

    /** 校验密码，返回错误信息；合法时返回 null */
    private static String validatePassword(String password) {
        if (password == null || password.length() < PASSWORD_MIN_LENGTH) {
            return "密码长度至少" + PASSWORD_MIN_LENGTH + "位";
        }
        if (password.length() > PASSWORD_MAX_LENGTH) {
            return "密码长度不能超过" + PASSWORD_MAX_LENGTH + "位";
        }
        if (WEAK_PASSWORDS.contains(password.toLowerCase())) {
            return "密码过于简单，请避免使用常见弱口令（如 12345678、password 等）";
        }
        return null;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody User user) {
        Map<String, Object> result = new HashMap<>();

        User existingUser = userDao.findByUsername(user.getUsername());
        if (existingUser == null) {
            result.put("success", false);
            result.put("message", "用户不存在");
            return result;
        }

        if (!passwordEncoder.matches(user.getPassword(), existingUser.getPassword())) {
            result.put("success", false);
            result.put("message", "密码错误");
            return result;
        }

        boolean needChangePassword = passwordEncoder.matches(INITIAL_PASSWORD, existingUser.getPassword());
        String token = jwtUtils.generateToken(user.getUsername(), needChangePassword);

        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", existingUser.getId());
        userMap.put("username", existingUser.getUsername());
        userMap.put("name", existingUser.getName());
        userMap.put("role", existingUser.getRole());
        userMap.put("dept", existingUser.getDept());
        userMap.put("status", existingUser.getStatus());
        userMap.put("permissions", existingUser.getPermissions() != null ? existingUser.getPermissions() : List.of());
        userMap.put("dailyRole", existingUser.getDailyRole());
        userMap.put("groupId", existingUser.getGroupId());
        userMap.put("mentor", existingUser.getMentor());

        result.put("success", true);
        result.put("token", token);
        result.put("user", userMap);
        result.put("needChangePassword", needChangePassword);

        return result;
    }

    @PostMapping("/change-password")
    public Map<String, Object> changePassword(
            @RequestBody Map<String, String> request,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser,
            HttpServletRequest httpRequest) {
        Map<String, Object> result = new HashMap<>();

        if (currentUser == null) {
            result.put("success", false);
            result.put("code", "UNAUTHORIZED");
            result.put("message", "未登录");
            return result;
        }

        String username = (String) currentUser.get("username");
        String oldPassword = request.get("oldPassword");
        String newPassword = request.get("newPassword");

        if (username == null || oldPassword == null || newPassword == null) {
            result.put("success", false);
            result.put("message", "参数不完整");
            return result;
        }

        String pwdError = validatePassword(newPassword);
        if (pwdError != null) {
            result.put("success", false);
            result.put("message", pwdError);
            return result;
        }

        if (INITIAL_PASSWORD.equals(newPassword)) {
            result.put("success", false);
            result.put("message", "新密码不能与初始密码相同");
            return result;
        }

        User existingUser = userDao.findByUsername(username);
        if (existingUser == null) {
            result.put("success", false);
            result.put("message", "用户不存在");
            return result;
        }

        if (!passwordEncoder.matches(oldPassword, existingUser.getPassword())) {
            result.put("success", false);
            result.put("message", "旧密码错误");
            return result;
        }

        userDao.updatePassword(username, passwordEncoder.encode(newPassword), newPassword);

        // 记录行为日志（不记录任何密码内容）
        userActionLogService.log(
                (String) currentUser.get("id"),
                (String) currentUser.get("name"),
                "change_password", "user", username, "修改自己的密码",
                null, getClientIp(httpRequest));

        String newToken = jwtUtils.generateToken(username, false);
        result.put("success", true);
        result.put("message", "密码修改成功");
        result.put("token", newToken);
        return result;
    }

    // ========== 账号/权限管理（superadmin 角色或对应管理权限码） ==========

    // 根账号保护：33528 的角色与核心管理权限不可被修改，防止系统失去最后一个管理员
    private static final String SUPER_ADMIN = "33528";

    /**
     * 管理端点鉴权：superadmin 角色直接放行，其他角色需持有对应权限码
     *（USER_MANAGE / PERMISSION_MANAGE），与前端菜单的 USER_MANAGE 门槛一致。
     */
    private Map<String, Object> checkManagePermission(String permCode) {
        Map<String, Object> result = new HashMap<>();
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || "anonymousUser".equals(authentication.getName())) {
            result.put("success", false);
            result.put("code", "UNAUTHORIZED");
            result.put("message", "未登录");
            return result;
        }
        User current = userDao.findByUsername(authentication.getName());
        boolean ok = current != null && ("superadmin".equals(current.getRole())
                || (current.getPermissions() != null && current.getPermissions().contains(permCode)));
        if (!ok) {
            result.put("success", false);
            result.put("message", "无权限，仅系统管理员可操作");
            return result;
        }
        result.put("success", true);
        return result;
    }

    @GetMapping("/users")
    public Map<String, Object> listUsers() {
        Map<String, Object> check = checkManagePermission("USER_MANAGE");
        if (!(Boolean) check.get("success")) return check;

        Map<String, Object> result = new HashMap<>();
        List<User> users = userDao.findAll();
        List<Map<String, Object>> list = new ArrayList<>();
        for (User u : users) {
            Map<String, Object> map = new HashMap<>();
            map.put("id", u.getId());
            map.put("username", u.getUsername());
            map.put("name", u.getName());
            map.put("role", u.getRole());
            map.put("dept", u.getDept());
            map.put("status", u.getStatus());
            map.put("permissions", u.getPermissions() != null ? u.getPermissions() : List.of());
            map.put("passwordPlain", u.getPasswordPlain());
            map.put("dailyRole", u.getDailyRole());
            map.put("groupId", u.getGroupId());
            map.put("mentor", u.getMentor());
            list.add(map);
        }
        result.put("success", true);
        result.put("users", list);
        return result;
    }

    @PostMapping("/users")
    public Map<String, Object> createUser(@RequestBody User user) {
        Map<String, Object> check = checkManagePermission("USER_MANAGE");
        if (!(Boolean) check.get("success")) return check;

        Map<String, Object> result = new HashMap<>();
        if (user.getUsername() == null || user.getPassword() == null || user.getName() == null) {
            result.put("success", false);
            result.put("message", "用户名、密码、姓名不能为空");
            return result;
        }

        String createPwdError = validatePassword(user.getPassword());
        if (createPwdError != null) {
            result.put("success", false);
            result.put("message", createPwdError);
            return result;
        }

        if (userDao.findByUsername(user.getUsername()) != null) {
            result.put("success", false);
            result.put("message", "用户名已存在");
            return result;
        }

        user.setPasswordPlain(user.getPassword());
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        if (user.getRole() == null) user.setRole("user");
        if (user.getDept() == null) user.setDept("");
        user.setStatus(1);

        // 校验角色（daily = 新人日报系统纯日报账号，详见 docs/modules/new-employee-daily.md）
        if (!Set.of("user", "leader", "admin", "daily").contains(user.getRole())) {
            result.put("success", false);
            result.put("message", "无效的角色，仅支持 user/leader/admin/daily");
            return result;
        }

        // daily 账号必须指定日报身份（新人/带教老师），不需要科室
        if ("daily".equals(user.getRole())) {
            if (!Set.of("newbie", "mentor").contains(user.getDailyRole())) {
                result.put("success", false);
                result.put("message", "日报账号必须指定日报身份（newbie 新人 / mentor 带教老师）");
                return result;
            }
            if ("newbie".equals(user.getDailyRole()) && (user.getGroupId() == null || user.getGroupId().isBlank())) {
                result.put("success", false);
                result.put("message", "新人必须分配小组");
                return result;
            }
        } else if (user.getDailyRole() != null && !user.getDailyRole().isBlank()
                && !Set.of("newbie", "mentor", "leader").contains(user.getDailyRole())) {
            result.put("success", false);
            result.put("message", "无效的日报身份，仅支持 newbie/mentor/leader");
            return result;
        }

        // 普通用户的科室必须是已登记的科室（leader/admin 的归属如「总经理室」「系统管理员」不在科室表内）
        if ("user".equals(user.getRole()) && user.getDept() != null && !user.getDept().isEmpty()
                && !deptDao.exists(user.getDept())) {
            result.put("success", false);
            result.put("message", "科室不存在，请先在科室管理中创建");
            return result;
        }

        // 新用户分配默认权限
        if (user.getPermissions() == null) {
            user.setPermissions(getDefaultPermissions(user.getRole()));
        }
        userDao.save(user);

        result.put("success", true);
        result.put("message", "用户创建成功");
        return result;
    }

    @PutMapping("/users/{username}")
    public Map<String, Object> updateUserInfo(@PathVariable String username, @RequestBody Map<String, String> body) {
        Map<String, Object> check = checkManagePermission("USER_MANAGE");
        if (!(Boolean) check.get("success")) return check;

        Map<String, Object> result = new HashMap<>();
        String newUsername = body.get("newUsername");
        String newName = body.get("name");
        String newRole = body.get("role");
        String newDept = body.get("dept");
        // 日报系统字段：null=不修改，空字符串=清除
        String newDailyRole = body.get("dailyRole");
        String newGroupId = body.get("groupId");
        String newMentor = body.get("mentor");

        User user = userDao.findByUsername(username);
        if (user == null) {
            result.put("success", false);
            result.put("message", "用户不存在");
            return result;
        }

        // 不能修改 33528 的角色
        if (SUPER_ADMIN.equals(username) && newRole != null && !newRole.isEmpty() && !newRole.equals(user.getRole())) {
            result.put("success", false);
            result.put("message", "不能修改系统管理员的角色");
            return result;
        }

        String targetUsername = username;
        if (newUsername != null && !newUsername.isEmpty() && !newUsername.equals(username)) {
            if (userDao.findByUsername(newUsername) != null) {
                result.put("success", false);
                result.put("message", "新用户名已存在");
                return result;
            }
            userDao.updateUsername(username, newUsername);
            user.setUsername(newUsername);
            targetUsername = newUsername;
        }

        boolean changed = false;
        if (newName != null && !newName.isEmpty() && !newName.equals(user.getName())) {
            user.setName(newName);
            changed = true;
        }

        if (newRole != null && !newRole.isEmpty() && !newRole.equals(user.getRole())) {
            if (!Set.of("user", "leader", "admin").contains(newRole)) {
                result.put("success", false);
                result.put("message", "无效的角色，仅支持 user/leader/admin");
                return result;
            }
            user.setRole(newRole);
            // 切换角色时同步重置为默认权限，避免旧权限残留造成角色能力混乱
            user.setPermissions(getDefaultPermissions(newRole));
            changed = true;
        }

        // 改派科室（普通用户的科室必须在科室表内）
        if (newDept != null && !newDept.equals(user.getDept())) {
            String effectiveRole = user.getRole();
            if ("user".equals(effectiveRole) && !newDept.isEmpty() && !deptDao.exists(newDept)) {
                result.put("success", false);
                result.put("message", "科室不存在，请先在科室管理中创建");
                return result;
            }
            user.setDept(newDept);
            changed = true;
        }

        // 日报系统身份调整（newbie/mentor/leader，空字符串表示清除）
        if (newDailyRole != null && !newDailyRole.equals(user.getDailyRole() != null ? user.getDailyRole() : "")) {
            if (!newDailyRole.isEmpty() && !Set.of("newbie", "mentor", "leader").contains(newDailyRole)) {
                result.put("success", false);
                result.put("message", "无效的日报身份，仅支持 newbie/mentor/leader");
                return result;
            }
            user.setDailyRole(newDailyRole.isEmpty() ? null : newDailyRole);
            changed = true;
        }
        if (newGroupId != null && !newGroupId.equals(user.getGroupId() != null ? user.getGroupId() : "")) {
            user.setGroupId(newGroupId.isEmpty() ? null : newGroupId);
            changed = true;
        }
        if (newMentor != null && !newMentor.equals(user.getMentor() != null ? user.getMentor() : "")) {
            user.setMentor(newMentor.isEmpty() ? null : newMentor);
            changed = true;
        }

        if (changed) {
            userDao.updateUser(user);
        }

        result.put("success", true);
        result.put("message", "用户信息更新成功");
        return result;
    }

    @DeleteMapping("/users/{username}")
    public Map<String, Object> deleteUser(@PathVariable String username) {
        Map<String, Object> check = checkManagePermission("USER_MANAGE");
        if (!(Boolean) check.get("success")) return check;

        Map<String, Object> result = new HashMap<>();
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            result.put("success", false);
            result.put("message", "未登录");
            return result;
        }
        String currentUsername = authentication.getName();

        if (currentUsername.equals(username)) {
            result.put("success", false);
            result.put("message", "不能删除当前登录账号");
            return result;
        }

        User target = userDao.findByUsername(username);
        if (target == null) {
            result.put("success", false);
            result.put("message", "用户不存在");
            return result;
        }

        // 不能删最后一个有 USER_MANAGE 权限的用户
        if (target.getPermissions() != null && target.getPermissions().contains("USER_MANAGE")) {
            long superAdminCount = userDao.findAll().stream()
                    .filter(u -> u.getPermissions() != null && u.getPermissions().contains("USER_MANAGE"))
                    .count();
            if (superAdminCount <= 1) {
                result.put("success", false);
                result.put("message", "不能删除最后一个系统管理员");
                return result;
            }
        }

        userDao.deleteByUsername(username);
        result.put("success", true);
        result.put("message", "用户已删除");
        return result;
    }

    @PostMapping("/users/{username}/reset-password")
    public Map<String, Object> resetPassword(@PathVariable String username, @RequestBody Map<String, String> request,
                                             HttpServletRequest httpRequest) {
        Map<String, Object> check = checkManagePermission("USER_MANAGE");
        if (!(Boolean) check.get("success")) return check;

        Map<String, Object> result = new HashMap<>();
        String newPassword = request.get("newPassword");
        String resetPwdError = validatePassword(newPassword);
        if (newPassword == null || resetPwdError != null) {
            result.put("success", false);
            result.put("message", resetPwdError != null ? resetPwdError : "参数不完整");
            return result;
        }
        if (INITIAL_PASSWORD.equals(newPassword)) {
            result.put("success", false);
            result.put("message", "重置密码不能与初始密码相同");
            return result;
        }

        User target = userDao.findByUsername(username);
        if (target == null) {
            result.put("success", false);
            result.put("message", "用户不存在");
            return result;
        }

        userDao.updatePassword(username, passwordEncoder.encode(newPassword), newPassword);

        // 记录行为日志：操作人为当前管理员（不记录任何密码内容）
        String adminUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        User admin = userDao.findByUsername(adminUsername);
        userActionLogService.log(
                admin != null ? String.valueOf(admin.getId()) : adminUsername,
                admin != null ? admin.getName() : adminUsername,
                "reset_password", "user", username,
                "管理员重置「" + target.getName() + "」的密码",
                null, getClientIp(httpRequest));

        result.put("success", true);
        result.put("message", "密码已重置");
        return result;
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isBlank()) {
            ip = request.getRemoteAddr();
        }
        return ip;
    }

    // ========== 权限管理（superadmin 角色或 PERMISSION_MANAGE 权限） ==========

    @PostMapping("/users/{username}/permissions")
    public Map<String, Object> updatePermissions(
            @PathVariable String username,
            @RequestBody Map<String, Object> body) {
        Map<String, Object> check = checkManagePermission("PERMISSION_MANAGE");
        if (!(Boolean) check.get("success")) return check;

        Map<String, Object> result = new HashMap<>();
        @SuppressWarnings("unchecked")
        List<String> permissions = (List<String>) body.get("permissions");

        if (permissions == null) {
            result.put("success", false);
            result.put("message", "permissions 不能为空");
            return result;
        }

        User target = userDao.findByUsername(username);
        if (target == null) {
            result.put("success", false);
            result.put("message", "用户不存在");
            return result;
        }

        // 不能剥夺 33528 的 USER_MANAGE 和 PERMISSION_MANAGE 权限
        if (SUPER_ADMIN.equals(username)) {
            if (!permissions.contains("USER_MANAGE") || !permissions.contains("PERMISSION_MANAGE")) {
                result.put("success", false);
                result.put("message", "不能剥夺系统管理员的核心权限");
                return result;
            }
        }

        userDao.updatePermissions(username, permissions);
        result.put("success", true);
        result.put("message", "权限已更新");
        return result;
    }

    @GetMapping("/permissions/default")
    public Map<String, Object> getDefaultPermissionsByRole(@RequestParam String role) {
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("permissions", getDefaultPermissions(role));
        return result;
    }

    // ========== 辅助方法 ==========

    private static List<String> getDefaultPermissions(String role) {
        // 所有登录用户默认拥有的公共权限
        List<String> common = List.of("VIEW_REPORT", "VIEW_COMMENTS", "ADD_COMMENT", "REPLY_COMMENT");
        // 普通用户默认还能编辑/提交自己科室本周周报
        List<String> userBase = new ArrayList<>(common);
        userBase.addAll(List.of("EDIT_REPORT", "SUBMIT_REPORT"));

        if ("superadmin".equals(role)) {
            List<String> all = new ArrayList<>(userBase);
            all.addAll(List.of(
                    "EDIT_HISTORY", "EDIT_AFTER_DEADLINE",
                    "ADD_COMMENT_UNLIMITED",
                    "DELETE_COMMENT", "DELETE_REPLY", "RESOLVE_COMMENT",
                    "AI_SUMMARY", "AI_GLOBAL_ANALYSIS",
                    "ADMIN_UNLOCK", "VIEW_ACTION_LOGS",
                    "CREATE_NEXT_WEEK", "DELETE_WEEK",
                    "VIEW_SUBMISSIONS", "KNOWLEDGE_BASE",
                    "USER_MANAGE", "PERMISSION_MANAGE"
            ));
            return all;
        }

        if ("admin".equals(role)) {
            List<String> admin = new ArrayList<>(userBase);
            admin.addAll(List.of(
                    "EDIT_HISTORY", "EDIT_AFTER_DEADLINE",
                    "ADD_COMMENT_UNLIMITED",
                    "DELETE_COMMENT", "DELETE_REPLY", "RESOLVE_COMMENT",
                    "AI_SUMMARY", "AI_GLOBAL_ANALYSIS",
                    "ADMIN_UNLOCK", "VIEW_ACTION_LOGS",
                    "CREATE_NEXT_WEEK", "DELETE_WEEK",
                    "VIEW_SUBMISSIONS", "KNOWLEDGE_BASE"
            ));
            return admin;
        }

        if ("leader".equals(role)) {
            List<String> leader = new ArrayList<>(common);
            leader.addAll(List.of(
                    "AI_SUMMARY", "AI_GLOBAL_ANALYSIS",
                    "VIEW_ACTION_LOGS", "VIEW_SUBMISSIONS", "KNOWLEDGE_BASE"
            ));
            return leader;
        }

        // daily（新人日报系统纯日报账号）：不授予任何周报系统权限
        if ("daily".equals(role)) {
            return new ArrayList<>();
        }

        return new ArrayList<>(userBase);
    }
}
