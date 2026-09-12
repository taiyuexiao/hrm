package com.hr.backend.controller;

import com.hr.backend.exception.OptimisticLockException;
import com.hr.backend.service.CommentService;
import com.hr.backend.service.NotificationService;
import com.hr.backend.service.ReportService;
import com.hr.backend.service.UserActionLogService;
import com.hr.backend.util.DeadlineCalculator;
import com.hr.backend.util.PermissionCheckResult;
import com.hr.backend.util.PermissionChecker;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    @Autowired
    private ReportService reportService;

    @Autowired
    private CommentService commentService;

    @Autowired
    private UserActionLogService userActionLogService;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private ObjectMapper objectMapper;

    @GetMapping
    public List<Map<String, Object>> getAllReports() {
        List<Map<String, Object>> reports = reportService.getAllReports();
        for (Map<String, Object> report : reports) {
            String reportId = (String) report.get("id");
            if (reportId != null) {
                report.put("comments", commentService.getCommentsByReportId(reportId));
            }
        }
        return reports;
    }

    @GetMapping("/{weekLabel}/{dept}")
    public Map<String, Object> getReport(
            @PathVariable String weekLabel,
            @PathVariable String dept) {
        Map<String, Object> report = reportService.getReport(weekLabel, dept);
        if (report != null) {
            // Enrich with deadline info
            String deadline = (String) report.get("deadline");
            long remaining = DeadlineCalculator.getRemainingSeconds(weekLabel, deadline);
            report.put("deadlineRemaining", remaining);
            report.put("deadlinePassed", remaining < 0);
            // 实际截止时间（自定义或默认周五20:00），供前端直接展示
            report.put("deadlineTime", DeadlineCalculator.getDeadline(weekLabel, deadline).toString());
            // Enrich with comments from independent table
            String reportId = (String) report.get("id");
            if (reportId != null) {
                report.put("comments", commentService.getCommentsByReportId(reportId));
            }
        }
        return report;
    }

    @PostMapping
    public Map<String, Object> saveReport(@RequestBody Map<String, Object> report,
                                          @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser,
                                          HttpServletRequest request) throws IOException {
        String weekLabel = (String) report.get("weekLabel");
        String dept = (String) report.get("dept");

        // Check permission for existing reports
        Map<String, Object> existing = reportService.getReport(weekLabel, dept);
        if (existing == null && weekLabel != null && dept != null
                && reportService.isSoftDeleted(weekLabel, dept)) {
            // 周期在回收站中：不允许直接写入，需先在回收站恢复，避免数据静默进入隐藏周期
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", false);
            result.put("code", "WEEK_IN_RECYCLE_BIN");
            result.put("message", "该周报周期已被管理员删除（在回收站中），如需填写请先恢复该周期");
            return result;
        }
        if (existing != null) {
            PermissionCheckResult editResult = PermissionChecker.checkEdit(existing, currentUser);
            if (!editResult.isAllowed()) {
                logPermissionDeny("edit", currentUser, existing, editResult.getReason());
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("success", false);
                result.put("code", "PERMISSION_DENIED");
                result.put("message", "无编辑权限（已截止或不是本人）");
                result.put("reason", editResult.getReason());
                return result;
            }

            // 乐观锁：防止多人同时保存互相覆盖
            Object requestUpdatedAt = report.get("updatedAt");
            Object serverUpdatedAt = existing.get("updatedAt");
            if (requestUpdatedAt != null && serverUpdatedAt != null
                    && !requestUpdatedAt.toString().equals(serverUpdatedAt.toString())) {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("success", false);
                result.put("code", "CONFLICT");
                result.put("message", "该周报已被其他用户更新，请刷新后合并");
                result.put("report", existing);
                return result;
            }
        } else {
            // 新建周报：普通用户只能创建本部门报告，管理员/超管可创建任意部门
            if (currentUser == null) {
                return Map.of("success", false, "message", "未登录或登录已过期，请重新登录");
            }
            if (!PermissionChecker.isAdmin(currentUser) && !PermissionChecker.isSuperAdmin(currentUser)) {
                if (PermissionChecker.isLeader(currentUser)) {
                    return Map.of("success", false, "message", "总经理室领导无权限新建/导入周报");
                }
                String userDept = (String) currentUser.get("dept");
                if (userDept == null || !userDept.equals(dept)) {
                    return Map.of("success", false, "message", "只能导入本部门周报");
                }
                if (!PermissionChecker.hasPermission(currentUser, "EDIT_REPORT")) {
                    return Map.of("success", false, "message", "无编辑权限");
                }
            }
        }

        // 校验 nextPlan 格式：如果以 [ 开头，必须是合法 JSON 数组，防止污染数据流入数据库
        Object nextPlanObj = report.get("nextPlan");
        if (nextPlanObj instanceof String nextPlanStr && !nextPlanStr.isBlank()) {
            String trimmed = nextPlanStr.trim();
            if (trimmed.startsWith("[")) {
                try {
                    objectMapper.readValue(trimmed, new TypeReference<List<?>>() {});
                } catch (Exception e) {
                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("success", false);
                    result.put("code", "INVALID_NEXT_PLAN");
                    result.put("message", "下周工作计划格式异常，无法保存：" + e.getMessage());
                    return result;
                }
            }
        }

        // 批注已从独立接口管理，保存周报时忽略 comments 字段
        report.remove("comments");
        // 提交历史由 /submit 接口维护，保存周报时禁止前端覆盖，始终沿用服务端已有记录
        report.remove("submissions");
        if (existing != null) {
            report.put("submissions", existing.get("submissions"));
        }
        try {
            reportService.saveReport(report);
        } catch (OptimisticLockException e) {
            // 乐观锁冲突：返回服务端最新版本，供前端合并
            Map<String, Object> latestReport = reportService.getReport(weekLabel, dept);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", false);
            result.put("code", "CONFLICT");
            result.put("message", "该周报已被其他用户更新，请刷新后合并");
            result.put("report", latestReport);
            return result;
        }

        // Log edit action with change details
        if (currentUser != null) {
            String userId = (String) currentUser.get("id");
            String userName = (String) currentUser.get("name");

            Map<String, Object> changeDetails = new LinkedHashMap<>();
            if (existing != null) {
                // 文本字段变更
                String[] textFields = {"currentWork", "nextPlan", "thoughts", "other"};
                for (String field : textFields) {
                    Object oldVal = existing.get(field);
                    Object newVal = report.get(field);
                    if (!Objects.equals(oldVal, newVal)) {
                        changeDetails.put(field + "Changed", true);
                    }
                }

                // content 任务树变更（新增/删除/修改）
                List<Map<String, Object>> oldTasks = flattenTaskTreeWithSection(existing.get("content"), "content");
                List<Map<String, Object>> newTasks = flattenTaskTreeWithSection(report.get("content"), "content");

                Map<String, Map<String, Object>> oldTaskMap = oldTasks.stream()
                        .collect(Collectors.toMap(t -> (String) t.get("id"), t -> t, (a, b) -> a));
                Map<String, Map<String, Object>> newTaskMap = newTasks.stream()
                        .collect(Collectors.toMap(t -> (String) t.get("id"), t -> t, (a, b) -> a));

                List<String> added = new ArrayList<>();
                List<Map<String, Object>> removed = new ArrayList<>();
                List<String> modified = new ArrayList<>();

                for (Map<String, Object> newTask : newTasks) {
                    String id = (String) newTask.get("id");
                    Map<String, Object> oldTask = oldTaskMap.get(id);
                    if (oldTask == null) {
                        added.add((String) newTask.get("text"));
                    } else {
                        boolean textChanged = !Objects.equals(oldTask.get("text"), newTask.get("text"));
                        boolean checkedChanged = !Objects.equals(oldTask.get("checked"), newTask.get("checked"));
                        if (textChanged || checkedChanged) {
                            modified.add((String) newTask.get("text"));
                        }
                    }
                }

                for (Map<String, Object> oldTask : oldTasks) {
                    String id = (String) oldTask.get("id");
                    if (!newTaskMap.containsKey(id)) {
                        Map<String, Object> removedTask = new LinkedHashMap<>();
                        removedTask.put("id", oldTask.get("id"));
                        removedTask.put("text", oldTask.get("text"));
                        removedTask.put("checked", oldTask.get("checked"));
                        removedTask.put("section", oldTask.get("section"));
                        removedTask.put("children", oldTask.get("children"));
                        removed.add(removedTask);
                    }
                }

                if (!added.isEmpty()) changeDetails.put("addedTasks", added);
                if (!removed.isEmpty()) changeDetails.put("removedTasks", removed);
                if (!modified.isEmpty()) changeDetails.put("modifiedTasks", modified);
                changeDetails.put("taskCountBefore", oldTasks.size());
                changeDetails.put("taskCountAfter", newTasks.size());
            }

            userActionLogService.log(userId, userName, "edit", "report",
                    weekLabel + "-" + dept, weekLabel + " " + dept,
                    changeDetails.isEmpty() ? null : changeDetails, getClientIp(request));
        }

        // 如果本次保存覆盖/删除了他人创建的任务，给原作者发通知
        if (existing != null && currentUser != null) {
            notifyOverwrittenTaskAuthors(existing, report, currentUser);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("message", "保存成功");
        result.put("report", report);
        return result;
    }

    @PostMapping("/{weekLabel}/{dept}/submit")
    public Map<String, Object> submitReport(@PathVariable String weekLabel,
                                            @PathVariable String dept,
                                            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser,
                                            HttpServletRequest request) throws IOException {
        Map<String, Object> report = reportService.getReport(weekLabel, dept);
        if (report == null) {
            return Map.of("success", false, "message", "周报不存在");
        }

        PermissionCheckResult submitResult = PermissionChecker.checkSubmit(report, currentUser);
        if (!submitResult.isAllowed()) {
            logPermissionDeny("submit", currentUser, report, submitResult.getReason());
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", false);
            result.put("code", "PERMISSION_DENIED");
            result.put("message", "无提交权限（已截止或不是本人）");
            result.put("reason", submitResult.getReason());
            return result;
        }

        String submittedBy = currentUser != null ? (String) currentUser.get("name") : null;
        reportService.submitReport(weekLabel, dept, submittedBy);

        // Log submit action with content snapshot
        if (currentUser != null) {
            String userId = (String) currentUser.get("id");
            String userName = (String) currentUser.get("name");
            List<Map<String, Object>> submissions = (List<Map<String, Object>>) report.get("submissions");
            int version = submissions != null ? submissions.size() + 1 : 1;

            Map<String, Object> submitDetails = new LinkedHashMap<>();
            submitDetails.put("version", version);
            submitDetails.put("currentWork", report.get("currentWork"));
            submitDetails.put("nextPlan", report.get("nextPlan"));
            submitDetails.put("thoughts", report.get("thoughts"));
            submitDetails.put("other", report.get("other"));

            List<Map<String, Object>> tasks = flattenTaskTree(report.get("content"));
            submitDetails.put("taskCount", tasks.size());
            submitDetails.put("taskSummary", tasks.stream()
                    .map(t -> (String) t.get("text"))
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList()));

            userActionLogService.log(userId, userName, "submit", "report",
                    weekLabel + "-" + dept, weekLabel + " " + dept,
                    submitDetails, getClientIp(request));
        }

        return Map.of("success", true, "message", "提交成功");
    }

    @PostMapping("/{weekLabel}/{dept}/unlock")
    public Map<String, Object> unlockReport(@PathVariable String weekLabel,
                                            @PathVariable String dept,
                                            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser,
                                            HttpServletRequest request) throws IOException {
        if (!PermissionChecker.canUnlock(currentUser)) {
            return Map.of("success", false, "message", "无权限");
        }

        String adminUsername = currentUser != null ? (String) currentUser.get("username") : "unknown";
        reportService.setUnlock(weekLabel, dept, true, adminUsername);

        // Log admin action
        if (currentUser != null) {
            String userId = (String) currentUser.get("id");
            String userName = (String) currentUser.get("name");
            userActionLogService.log(userId, userName, "admin_unlock", "report",
                    weekLabel + "-" + dept, weekLabel + " " + dept, null, getClientIp(request));
        }

        return Map.of("success", true, "message", "已解锁");
    }

    @PostMapping("/{weekLabel}/{dept}/lock")
    public Map<String, Object> lockReport(@PathVariable String weekLabel,
                                          @PathVariable String dept,
                                          @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser,
                                          HttpServletRequest request) throws IOException {
        if (!PermissionChecker.canUnlock(currentUser)) {
            return Map.of("success", false, "message", "无权限");
        }

        reportService.setUnlock(weekLabel, dept, false, null);

        // Log admin action
        if (currentUser != null) {
            String userId = (String) currentUser.get("id");
            String userName = (String) currentUser.get("name");
            userActionLogService.log(userId, userName, "admin_lock", "report",
                    weekLabel + "-" + dept, weekLabel + " " + dept, null, getClientIp(request));
        }

        return Map.of("success", true, "message", "已锁定");
    }

    @DeleteMapping("/{weekLabel}")
    public Map<String, Object> deleteWeek(
            @PathVariable String weekLabel,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser,
            HttpServletRequest request) {
        // Only users with DELETE_WEEK permission can delete a week
        if (!PermissionChecker.hasPermission(currentUser, "DELETE_WEEK")) {
            return Map.of("success", false, "message", "没有删除周报周期的权限");
        }

        // 超级管理员可删除任意周期；其他管理员只能删除当前周之后的周期
        if (!PermissionChecker.isSuperAdmin(currentUser)) {
            String currentWeek = DeadlineCalculator.getCurrentWeekLabel();
            if (weekLabel.compareTo(currentWeek) <= 0) {
                return Map.of("success", false, "message", "只能删除当前周之后的周报周期");
            }
        }

        // 软删除：仅将周期移入回收站，数据完整保留
        String deletedBy = currentUser != null ? (String) currentUser.get("name") : null;
        int deleted = reportService.softDeleteByWeekLabel(weekLabel, deletedBy);

        // Log admin action
        if (currentUser != null) {
            String userId = (String) currentUser.get("id");
            String userName = (String) currentUser.get("name");
            userActionLogService.log(userId, userName, "delete_week", "week",
                    weekLabel, weekLabel, "moved_to_recycle_bin, affected=" + deleted, getClientIp(request));
        }

        return Map.of("success", true, "message", "已移入回收站（" + deleted + " 条周报），可在回收站中一键恢复");
    }

    /** 回收站列表（仅超级管理员） */
    @GetMapping("/recycle-bin")
    public Object getRecycleBin(
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {
        if (!PermissionChecker.isSuperAdmin(currentUser)) {
            return Map.of("success", false, "message", "仅超级管理员可查看回收站");
        }
        return reportService.getRecycleBin();
    }

    /** 所有软删除状态的周期标签（登录用户可读，供前端从周期下拉框中排除） */
    @GetMapping("/deleted-weeks")
    public List<String> getDeletedWeeks() {
        return reportService.getDeletedWeekLabels();
    }

    /** 一键恢复：将周期从回收站还原到周报周期下拉框（仅超级管理员） */
    @PostMapping("/{weekLabel}/restore")
    public Map<String, Object> restoreWeek(
            @PathVariable String weekLabel,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser,
            HttpServletRequest request) {
        if (!PermissionChecker.isSuperAdmin(currentUser)) {
            return Map.of("success", false, "message", "仅超级管理员可恢复周报周期");
        }

        int restored = reportService.restoreByWeekLabel(weekLabel);

        if (currentUser != null) {
            String userId = (String) currentUser.get("id");
            String userName = (String) currentUser.get("name");
            userActionLogService.log(userId, userName, "restore_week", "week",
                    weekLabel, weekLabel, "restored=" + restored, getClientIp(request));
        }

        if (restored == 0) {
            return Map.of("success", false, "message", "回收站中未找到该周期");
        }
        return Map.of("success", true, "message", "已恢复 " + restored + " 条周报");
    }

    @DeleteMapping
    public Map<String, Object> clearAll() throws IOException {
        reportService.clearAll();
        return Map.of("success", true, "message", "已清空");
    }

    /**
     * 从行为日志恢复被误删的周报内容。
     * 仅当某次编辑导致 content 任务树从有到无（taskCountBefore > 0 && taskCountAfter == 0）
     * 且当前周报 content 为空时才允许恢复，避免覆盖用户新填写的内容。
     */
    @PostMapping("/{weekLabel}/{dept}/restore-from-log/{logId}")
    public Map<String, Object> restoreFromLog(
            @PathVariable String weekLabel,
            @PathVariable String dept,
            @PathVariable long logId,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser,
            HttpServletRequest request) throws IOException {

        if (currentUser == null) {
            return Map.of("success", false, "message", "未登录");
        }

        Map<String, Object> log = userActionLogService.getLogById(logId);
        if (log == null) {
            return Map.of("success", false, "message", "日志不存在");
        }

        if (!"edit".equals(log.get("action"))) {
            return Map.of("success", false, "message", "仅支持恢复编辑操作产生的删除");
        }

        String expectedTargetId = weekLabel + "-" + dept;
        if (!expectedTargetId.equals(log.get("targetId"))) {
            return Map.of("success", false, "message", "日志目标与当前周报不匹配");
        }

        Map<String, Object> details;
        Object detailsObj = log.get("details");
        if (detailsObj instanceof String) {
            details = objectMapper.readValue((String) detailsObj, new TypeReference<>() {});
        } else if (detailsObj instanceof Map) {
            details = (Map<String, Object>) detailsObj;
        } else {
            return Map.of("success", false, "message", "日志详情格式异常");
        }

        Number taskCountBefore = (Number) details.get("taskCountBefore");
        Number taskCountAfter = (Number) details.get("taskCountAfter");
        if (taskCountBefore == null || taskCountAfter == null
                || taskCountBefore.intValue() <= 0 || taskCountAfter.intValue() != 0) {
            return Map.of("success", false, "message", "该日志不满足全部删除的恢复条件");
        }

        Object removedTasksObj = details.get("removedTasks");
        if (!(removedTasksObj instanceof List) || ((List<?>) removedTasksObj).isEmpty()) {
            return Map.of("success", false, "message", "日志中未记录被删除的任务");
        }

        Map<String, Object> existing = reportService.getReport(weekLabel, dept);
        if (existing == null) {
            return Map.of("success", false, "message", "当前周报不存在");
        }

        PermissionCheckResult restoreEditResult = PermissionChecker.checkEdit(existing, currentUser);
        if (!restoreEditResult.isAllowed()) {
            logPermissionDeny("restore", currentUser, existing, restoreEditResult.getReason());
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", false);
            result.put("code", "PERMISSION_DENIED");
            result.put("message", "没有编辑该周报的权限");
            result.put("reason", restoreEditResult.getReason());
            return result;
        }

        List<Map<String, Object>> currentContent = parseTaskTree(existing.get("content"));
        if (currentContent != null && !currentContent.isEmpty()) {
            return Map.of("success", false, "message", "当前周报内容不为空，无法恢复以避免覆盖现有内容");
        }

        List<Map<String, Object>> restoredTasks = new ArrayList<>();
        for (Object item : (List<?>) removedTasksObj) {
            if (!(item instanceof Map)) continue;
            Map<String, Object> task = (Map<String, Object>) item;
            Map<String, Object> cleanTask = new LinkedHashMap<>();
            cleanTask.put("id", task.get("id"));
            cleanTask.put("text", task.get("text"));
            cleanTask.put("checked", task.getOrDefault("checked", Boolean.FALSE));
            cleanTask.put("children", task.get("children"));
            restoredTasks.add(cleanTask);
        }

        existing.put("content", restoredTasks);
        reportService.saveReport(existing);

        String userId = (String) currentUser.get("id");
        String userName = (String) currentUser.get("name");
        userActionLogService.log(userId, userName, "restore", "report",
                expectedTargetId, weekLabel + " " + dept + " 从日志恢复被删除内容",
                Map.of("restoredTaskCount", restoredTasks.size(), "sourceLogId", logId),
                getClientIp(request));

        return Map.of("success", true, "message", "已恢复 " + restoredTasks.size() + " 条任务");
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isBlank()) {
            ip = request.getRemoteAddr();
        }
        return ip;
    }

    /**
     * 记录权限拒绝日志到行为日志表，便于线上排查个别用户的无权限问题。
     */
    private void logPermissionDeny(String action, Map<String, Object> currentUser,
                                     Map<String, Object> report, String reason) {
        if (currentUser == null) {
            return;
        }
        try {
            String userId = (String) currentUser.get("id");
            String userName = (String) currentUser.get("name");
            String weekLabel = report != null ? (String) report.get("weekLabel") : null;
            String dept = report != null ? (String) report.get("dept") : null;
            String targetId = (weekLabel != null && dept != null) ? weekLabel + "-" + dept : "unknown";
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("deniedAction", action);
            details.put("reason", reason);
            details.put("userDept", currentUser.get("dept"));
            details.put("userRole", currentUser.get("role"));
            details.put("userPermissions", currentUser.get("permissions"));
            userActionLogService.log(userId, userName, "permission_deny", "report",
                    targetId, weekLabel + " " + dept + " 权限被拒绝",
                    details, null);
        } catch (Exception e) {
            // 诊断日志记录失败不应影响主流程
            System.err.println("[ReportController] failed to log permission deny: " + e.getMessage());
        }
    }

    /**
     * 检测本次保存是否覆盖或删除了他人创建的任务，并给原作者发送通知。
     */
    private void notifyOverwrittenTaskAuthors(Map<String, Object> existing,
                                              Map<String, Object> report,
                                              Map<String, Object> currentUser) {
        String currentUserId = (String) currentUser.get("id");
        String currentUserName = (String) currentUser.get("name");
        String weekLabel = (String) report.get("weekLabel");
        String dept = (String) report.get("dept");

        Map<String, Map<String, Object>> oldTasks = collectAllTasks(existing);
        Map<String, Map<String, Object>> newTasks = collectAllTasks(report);

        for (Map.Entry<String, Map<String, Object>> entry : oldTasks.entrySet()) {
            String taskId = entry.getKey();
            Map<String, Object> oldTask = entry.getValue();
            String authorId = (String) oldTask.get("authorId");
            if (authorId == null || authorId.equals(currentUserId)) {
                continue; // 公共任务或自己创建的任务不通知
            }

            Map<String, Object> newTask = newTasks.get(taskId);
            String oldText = (String) oldTask.get("text");
            if (newTask == null) {
                // 他人创建的任务被当前用户删除
                notificationService.createNotification(
                        authorId,
                        "TASK_DELETED",
                        currentUserName + " 删除了你在 " + dept + " 周报中创建的任务",
                        oldText != null ? oldText : "",
                        weekLabel,
                        dept
                );
            } else {
                String newText = (String) newTask.get("text");
                if (!Objects.equals(oldText, newText)) {
                    notificationService.createNotification(
                            authorId,
                            "TASK_OVERWRITTEN",
                            currentUserName + " 修改了你在 " + dept + " 周报中创建的任务",
                            "原内容：" + (oldText != null ? oldText : "") + "\n新内容：" + (newText != null ? newText : ""),
                            weekLabel,
                            dept
                    );
                }
            }
        }
    }

    /**
     * 从一份报告中收集 content 和 nextPlan 里的所有任务（按 id），包括子任务。
     */
    @SuppressWarnings("unchecked")
    private Map<String, Map<String, Object>> collectAllTasks(Map<String, Object> report) {
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        collectTasks(report.get("content"), result);
        collectTasks(report.get("nextPlan"), result);
        return result;
    }

    @SuppressWarnings("unchecked")
    private void collectTasks(Object tree, Map<String, Map<String, Object>> result) {
        List<Map<String, Object>> tasks = parseTaskTree(tree);
        if (tasks == null) return;
        for (Map<String, Object> task : tasks) {
            String id = (String) task.get("id");
            if (id != null) {
                result.put(id, task);
            }
            Object children = task.get("children");
            if (children instanceof List) {
                collectTasks(children, result);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseTaskTree(Object tree) {
        if (tree == null) return null;
        if (tree instanceof List) return (List<Map<String, Object>>) tree;
        if (tree instanceof String) {
            String s = (String) tree;
            if (s.isBlank()) return null;
            try {
                return objectMapper.readValue(s, new TypeReference<List<Map<String, Object>>>() {});
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> flattenTaskTree(Object contentObj) {
        return flattenTaskTreeWithSection(contentObj, null);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> flattenTaskTreeWithSection(Object contentObj, String section) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (!(contentObj instanceof List)) return result;
        for (Object item : (List<?>) contentObj) {
            if (!(item instanceof Map)) continue;
            Map<String, Object> task = new LinkedHashMap<>((Map<String, Object>) item);
            if (section != null) {
                task.put("section", section);
            }
            result.add(task);
            Object children = task.get("children");
            if (children instanceof List) {
                result.addAll(flattenTaskTreeWithSection(children, section));
            }
        }
        return result;
    }
}
