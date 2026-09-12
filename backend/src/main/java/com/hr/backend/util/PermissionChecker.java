package com.hr.backend.util;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class PermissionChecker {

    // 历史周报日期列表（已固定，除有 EDIT_HISTORY 权限外不可编辑）
    private static final List<String> HISTORICAL_WEEKS = List.of(
            "20260327", "20260410", "20260417", "20260515", "20260522"
    );

    // 系统管理员（超级管理员）：仅 33528，作为最后的兜底保护
    public static boolean isSuperAdmin(Map<String, Object> currentUser) {
        if (currentUser == null) return false;
        String username = (String) currentUser.get("username");
        return "33528".equals(username);
    }

    // 管理员：可编辑任意部门任意周期周报，但不能管理用户/权限（除 33528 外）
    public static boolean isAdmin(Map<String, Object> currentUser) {
        if (currentUser == null) return false;
        String role = (String) currentUser.get("role");
        return "admin".equals(role) || "superadmin".equals(role);
    }

    // 总经理室领导：只能查看、评论、AI 分析，不能编辑/提交/新建周报
    public static boolean isLeader(Map<String, Object> currentUser) {
        if (currentUser == null) return false;
        String role = (String) currentUser.get("role");
        return "leader".equals(role);
    }

    @SuppressWarnings("unchecked")
    public static boolean hasPermission(Map<String, Object> currentUser, String permission) {
        if (currentUser == null) return false;
        // 33528 始终拥有全部权限
        if (isSuperAdmin(currentUser)) return true;

        // 所有人（登录后）都可以：查看任意周报、查看评论、添加评论、回复评论
        Set<String> commonPerms = Set.of("VIEW_REPORT", "VIEW_COMMENTS", "ADD_COMMENT", "REPLY_COMMENT");
        if (commonPerms.contains(permission)) {
            return true;
        }

        // 管理员：除 USER_MANAGE / PERMISSION_MANAGE 外全部权限
        if (isAdmin(currentUser)) {
            return !"USER_MANAGE".equals(permission) && !"PERMISSION_MANAGE".equals(permission);
        }

        // 总经理室领导：查看/评论/AI分析/行为日志/知识库/提交记录等，但不能编辑/提交/新建/删除评论/解决/解锁
        if (isLeader(currentUser)) {
            Set<String> leaderPerms = Set.of(
                    "VIEW_REPORT", "VIEW_COMMENTS", "ADD_COMMENT", "REPLY_COMMENT",
                    "AI_SUMMARY", "AI_GLOBAL_ANALYSIS", "VIEW_ACTION_LOGS",
                    "VIEW_SUBMISSIONS", "KNOWLEDGE_BASE"
            );
            return leaderPerms.contains(permission);
        }

        // 普通用户默认拥有的权限
        Set<String> userBasePerms = Set.of("EDIT_REPORT", "SUBMIT_REPORT");
        if (userBasePerms.contains(permission)) {
            return true;
        }

        // 其他权限走数据库权限列表（支持特殊授予）
        List<String> permissions = (List<String>) currentUser.get("permissions");
        if (permissions == null) return false;
        if (permissions.contains(permission)) return true;

        // 兼容旧权限名：EDIT_AFTER_DEADLINE 与原 SUBMIT_AFTER_DEADLINE 等价
        if ("EDIT_AFTER_DEADLINE".equals(permission) && permissions.contains("SUBMIT_AFTER_DEADLINE")) {
            return true;
        }
        return false;
    }

    private static void logDeny(String action, Map<String, Object> currentUser, String weekLabel, String reason) {
        String username = currentUser != null ? (String) currentUser.get("username") : "null";
        System.err.println("[PermissionChecker] DENY " + action + " user=" + username + " week=" + weekLabel + " reason=" + reason);
    }

    public static boolean canEdit(Map<String, Object> report, Map<String, Object> currentUser) {
        return checkEdit(report, currentUser).isAllowed();
    }

    public static PermissionCheckResult checkEdit(Map<String, Object> report, Map<String, Object> currentUser) {
        if (currentUser == null) {
            logDeny("canEdit", null, null, "currentUser null");
            return PermissionCheckResult.deny("currentUser null");
        }
        if (isSuperAdmin(currentUser)) return PermissionCheckResult.allow();
        // 管理员可以编辑所有部门所有时间的周报
        if (isAdmin(currentUser)) return PermissionCheckResult.allow();
        // 总经理室领导不能编辑任意周报
        if (isLeader(currentUser)) {
            logDeny("canEdit", currentUser, (String) report.get("weekLabel"), "leader cannot edit");
            return PermissionCheckResult.deny(buildReason(currentUser, report, "role=leader cannot edit"));
        }
        if (!hasPermission(currentUser, "EDIT_REPORT")) {
            logDeny("canEdit", currentUser, (String) report.get("weekLabel"), "missing EDIT_REPORT");
            return PermissionCheckResult.deny(buildReason(currentUser, report, "missing EDIT_REPORT permission"));
        }

        String weekLabel = (String) report.get("weekLabel");
        Boolean locked = (Boolean) report.getOrDefault("locked", Boolean.FALSE);

        // 历史周报锁定（除非有 EDIT_HISTORY 权限）
        if (locked != null && locked && !hasPermission(currentUser, "EDIT_HISTORY")) {
            logDeny("canEdit", currentUser, weekLabel, "report locked and no EDIT_HISTORY");
            return PermissionCheckResult.deny(buildReason(currentUser, report, "report locked and no EDIT_HISTORY"));
        }
        if (weekLabel != null && HISTORICAL_WEEKS.contains(weekLabel) && !hasPermission(currentUser, "EDIT_HISTORY")) {
            logDeny("canEdit", currentUser, weekLabel, "historical week and no EDIT_HISTORY");
            return PermissionCheckResult.deny(buildReason(currentUser, report, "historical week and no EDIT_HISTORY"));
        }

        // 管理员已解锁，允许有编辑权限的人编辑
        Boolean adminUnlock = (Boolean) report.getOrDefault("adminUnlock", Boolean.FALSE);
        if (adminUnlock != null && adminUnlock) {
            return PermissionCheckResult.allow();
        }

        // 同部门且在截止前可编辑
        String userDept = (String) currentUser.get("dept");
        String reportDept = (String) report.get("dept");
        boolean isSameDept = userDept != null && userDept.equals(reportDept);
        if (isSameDept) {
            if (hasPermission(currentUser, "EDIT_AFTER_DEADLINE")) {
                return PermissionCheckResult.allow();
            }
            String deadline = (String) report.get("deadline");
            LocalDateTime deadlineTime = DeadlineCalculator.getDeadline(weekLabel, deadline);
            LocalDateTime now = LocalDateTime.now(DeadlineCalculator.getZone());
            if (now.isAfter(deadlineTime)) {
                logDeny("canEdit", currentUser, weekLabel, "deadline passed: now=" + now + " deadline=" + deadlineTime);
                return PermissionCheckResult.deny(buildReason(currentUser, report,
                        "deadline passed: now=" + now + " deadline=" + deadlineTime));
            }
            return PermissionCheckResult.allow();
        }

        logDeny("canEdit", currentUser, weekLabel, "dept mismatch: userDept=" + userDept + " reportDept=" + reportDept);
        return PermissionCheckResult.deny(buildReason(currentUser, report,
                "dept mismatch: userDept=" + userDept + " reportDept=" + reportDept));
    }

    public static boolean canSubmit(Map<String, Object> report, Map<String, Object> currentUser) {
        return checkSubmit(report, currentUser).isAllowed();
    }

    public static PermissionCheckResult checkSubmit(Map<String, Object> report, Map<String, Object> currentUser) {
        if (currentUser == null) {
            logDeny("canSubmit", null, null, "currentUser null");
            return PermissionCheckResult.deny("currentUser null");
        }
        if (isSuperAdmin(currentUser)) return PermissionCheckResult.allow();
        // 管理员可以提交任意部门的周报
        if (isAdmin(currentUser)) return PermissionCheckResult.allow();
        // 总经理室领导不能提交任意周报
        if (isLeader(currentUser)) {
            logDeny("canSubmit", currentUser, (String) report.get("weekLabel"), "leader cannot submit");
            return PermissionCheckResult.deny(buildReason(currentUser, report, "role=leader cannot submit"));
        }
        if (!hasPermission(currentUser, "SUBMIT_REPORT")) {
            logDeny("canSubmit", currentUser, (String) report.get("weekLabel"), "missing SUBMIT_REPORT");
            return PermissionCheckResult.deny(buildReason(currentUser, report, "missing SUBMIT_REPORT permission"));
        }

        String weekLabel = (String) report.get("weekLabel");

        // 管理员已解锁，允许有提交权限的人提交
        Boolean adminUnlock = (Boolean) report.getOrDefault("adminUnlock", Boolean.FALSE);
        if (adminUnlock != null && adminUnlock) {
            return PermissionCheckResult.allow();
        }

        // 同部门且在截止前可提交
        String userDept = (String) currentUser.get("dept");
        String reportDept = (String) report.get("dept");
        boolean isSameDept = userDept != null && userDept.equals(reportDept);
        if (!isSameDept) {
            logDeny("canSubmit", currentUser, weekLabel, "dept mismatch: userDept=" + userDept + " reportDept=" + reportDept);
            return PermissionCheckResult.deny(buildReason(currentUser, report,
                    "dept mismatch: userDept=" + userDept + " reportDept=" + reportDept));
        }

        if (hasPermission(currentUser, "EDIT_AFTER_DEADLINE")) {
            return PermissionCheckResult.allow();
        }

        String deadline = (String) report.get("deadline");
        LocalDateTime deadlineTime = DeadlineCalculator.getDeadline(weekLabel, deadline);
        LocalDateTime now = LocalDateTime.now(DeadlineCalculator.getZone());
        if (now.isAfter(deadlineTime)) {
            logDeny("canSubmit", currentUser, weekLabel, "deadline passed: now=" + now + " deadline=" + deadlineTime);
            return PermissionCheckResult.deny(buildReason(currentUser, report,
                    "deadline passed: now=" + now + " deadline=" + deadlineTime));
        }
        return PermissionCheckResult.allow();
    }

    /**
     * 构造供前端展示的诊断原因字符串，带上当前用户和报告的关键快照，
     * 方便生产环境快速定位是 dept、role、permission 还是 deadline 导致。
     */
    private static String buildReason(Map<String, Object> currentUser, Map<String, Object> report, String detail) {
        String username = currentUser != null ? (String) currentUser.get("username") : "null";
        String name = currentUser != null ? (String) currentUser.get("name") : "null";
        String role = currentUser != null ? (String) currentUser.get("role") : "null";
        String userDept = currentUser != null ? (String) currentUser.get("dept") : "null";
        Object permissions = currentUser != null ? currentUser.get("permissions") : null;
        String weekLabel = report != null ? (String) report.get("weekLabel") : "null";
        String reportDept = report != null ? (String) report.get("dept") : "null";
        Object locked = report != null ? report.get("locked") : null;
        Object adminUnlock = report != null ? report.get("adminUnlock") : null;
        return String.format(
                "%s | user=%s(%s) role=%s userDept=%s perms=%s | report=%s/%s locked=%s adminUnlock=%s",
                detail, username, name, role, userDept,
                permissions != null ? permissions.toString() : "null",
                weekLabel, reportDept, locked, adminUnlock);
    }

    public static boolean canUnlock(Map<String, Object> currentUser) {
        return hasPermission(currentUser, "ADMIN_UNLOCK");
    }

    // 所有人都可以添加批注（登录即可）
    public static boolean canAddComment(Map<String, Object> currentUser) {
        return currentUser != null;
    }

    public static boolean canAddCommentUnlimited(Map<String, Object> currentUser) {
        return hasPermission(currentUser, "ADD_COMMENT_UNLIMITED");
    }

    public static boolean canDeleteComment(Map<String, Object> currentUser) {
        return hasPermission(currentUser, "DELETE_COMMENT");
    }

    public static boolean canDeleteReply(Map<String, Object> currentUser) {
        return hasPermission(currentUser, "DELETE_REPLY");
    }

    public static boolean canResolveComment(Map<String, Object> currentUser) {
        return hasPermission(currentUser, "RESOLVE_COMMENT");
    }
}
