package com.hr.backend.controller;

import com.hr.backend.dao.DailyDao;
import com.hr.backend.dao.UserDao;
import com.hr.backend.entity.User;
import com.hr.backend.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 新人培养报告（日报/周报/月报）接口。
 * 与科室周报完全并行，仅共享登录态与通知表（日报通知 type 以 DAILY_ 前缀区分）。
 * 权限规则：读全开（任何登录用户可看全部报告与评论）；写归己（新人只能写自己的报告）；评论人人可发。
 */
@RestController
@RequestMapping("/api/daily")
public class DailyReportController {

    @Autowired
    private DailyDao dailyDao;

    @Autowired
    private UserDao userDao;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private com.hr.backend.service.LlmService llmService;

    private static final Set<String> REPORT_TYPES = Set.of("daily", "weekly", "monthly");
    private static final Set<String> DAILY_ROLES = Set.of("newbie", "mentor", "leader");

    // ========== 内部工具 ==========

    private User currentUser() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getName())) {
            return null;
        }
        return userDao.findByUsername(auth.getName());
    }

    private Map<String, Object> fail(String message) {
        Map<String, Object> r = new HashMap<>();
        r.put("success", false);
        r.put("message", message);
        return r;
    }

    private Map<String, Object> ok() {
        Map<String, Object> r = new HashMap<>();
        r.put("success", true);
        return r;
    }

    /** 报告归属与标题的通用解析（新人报告 / mentor 报告），供评论通知与 AI 使用 */
    private Map<String, String> resolveReportMeta(Map<String, Object> report) {
        Map<String, String> meta = new HashMap<>();
        String period = (String) report.get("period");
        meta.put("period", period);
        if (report.containsKey("username")) {
            User author = userDao.findByUsername((String) report.get("username"));
            String name = author != null ? author.getName() : (String) report.get("username");
            meta.put("owner", (String) report.get("username"));
            meta.put("title", name + " 的日报（" + period + "）");
        } else {
            User mentor = userDao.findByUsername((String) report.get("mentor"));
            String name = mentor != null ? mentor.getName() : (String) report.get("mentor");
            String scopeLabel = "group".equals(report.get("scope")) ? "小组" : "个人";
            String typeLabel = "weekly".equals(report.get("reportType")) ? "周报" : "月报";
            meta.put("owner", (String) report.get("mentor"));
            meta.put("title", name + " 的" + scopeLabel + "带教" + typeLabel + "（" + period + "）");
        }
        return meta;
    }

    /** 补充报告的作者/小组/带教展示信息（不改原表数据） */
    private Map<String, Object> enrich(Map<String, Object> report, Map<String, String> groupNames) {
        if (report == null) return null;
        Map<String, Object> r = new LinkedHashMap<>(report);
        User author = userDao.findByUsername((String) r.get("username"));
        if (author != null) {
            r.put("authorName", author.getName());
            r.put("groupId", author.getGroupId());
            r.put("groupName", author.getGroupId() != null ? groupNames.get(author.getGroupId()) : null);
            r.put("mentor", author.getMentor());
            if (author.getMentor() != null) {
                User mentor = userDao.findByUsername(author.getMentor());
                r.put("mentorName", mentor != null ? mentor.getName() : author.getMentor());
            }
        }
        return r;
    }

    /** 补充 mentor 报告的带教/对象展示信息 */
    private Map<String, Object> enrichMentor(Map<String, Object> report) {
        if (report == null) return null;
        Map<String, Object> r = new LinkedHashMap<>(report);
        User mentor = userDao.findByUsername((String) r.get("mentor"));
        r.put("mentorName", mentor != null ? mentor.getName() : r.get("mentor"));
        if ("group".equals(r.get("scope"))) {
            r.put("targetName", groupNameMap().get((String) r.get("target")));
        } else {
            User nb = userDao.findByUsername((String) r.get("target"));
            r.put("targetName", nb != null ? nb.getName() : r.get("target"));
        }
        return r;
    }

    private Map<String, String> groupNameMap() {
        Map<String, String> m = new HashMap<>();
        for (Map<String, Object> g : dailyDao.findAllGroups()) {
            m.put((String) g.get("id"), (String) g.get("name"));
        }
        return m;
    }

    // ========== 元数据 ==========

    /** 小组 / 新人清单 / mentor 清单：浏览页小组树与账号管理页的数据源 */
    @GetMapping("/meta")
    public Map<String, Object> meta() {
        Map<String, Object> r = ok();
        List<Map<String, Object>> newbies = new ArrayList<>();
        List<Map<String, Object>> mentors = new ArrayList<>();
        for (User u : userDao.findAll()) {
            if ("newbie".equals(u.getDailyRole())) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("username", u.getUsername());
                m.put("name", u.getName());
                m.put("groupId", u.getGroupId());
                m.put("mentor", u.getMentor());
                newbies.add(m);
            } else if ("mentor".equals(u.getDailyRole())) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("username", u.getUsername());
                m.put("name", u.getName());
                mentors.add(m);
            }
        }
        r.put("groups", dailyDao.findAllGroups());
        r.put("newbies", newbies);
        r.put("mentors", mentors);
        return r;
    }

    /** 新增小组（账号管理页「小组管理」） */
    @PostMapping("/groups")
    public Map<String, Object> createGroup(@RequestBody Map<String, String> body) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        boolean canManage = "superadmin".equals(current.getRole())
                || (current.getPermissions() != null && current.getPermissions().contains("USER_MANAGE"));
        if (!canManage) return fail("无权限");

        String name = body.get("name");
        if (name == null || name.isBlank()) return fail("小组名称不能为空");
        name = name.trim();
        String id = dailyDao.insertGroup(name, body.get("leader"));
        if (id == null) return fail("小组已存在");
        Map<String, Object> r = ok();
        r.put("id", id);
        r.put("message", "小组创建成功");
        return r;
    }

    // ========== 报告填报 ==========

    /** 我的报告（按类型+周期），无则 report 为 null */
    @GetMapping("/reports/mine")
    public Map<String, Object> mine(@RequestParam String type, @RequestParam String period) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        Map<String, Object> r = ok();
        r.put("report", enrich(dailyDao.findReport(current.getUsername(), type, period), groupNameMap()));
        return r;
    }

    /** 保存草稿（upsert 自己的报告；仅新人身份可填） */
    @PutMapping("/reports")
    public Map<String, Object> saveDraft(@RequestBody Map<String, Object> body) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        if (!"newbie".equals(current.getDailyRole())) {
            return fail("仅新人账号可填写日报");
        }
        String type = (String) body.get("reportType");
        String period = (String) body.get("period");
        if (!REPORT_TYPES.contains(type) || period == null || period.isBlank()) {
            return fail("参数不合法（reportType / period）");
        }
        Object sections = body.get("sections");
        String id = dailyDao.upsertDraft(current.getUsername(), type, period.trim(),
                dailyDao.toJson(sections != null ? sections : Map.of()));
        Map<String, Object> r = ok();
        r.put("id", id);
        r.put("report", enrich(dailyDao.findReportById(id), groupNameMap()));
        return r;
    }

    /** 提交（幂等） */
    @PostMapping("/reports/{id}/submit")
    public Map<String, Object> submit(@PathVariable String id) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        if (!dailyDao.submit(id, current.getUsername())) {
            return fail("提交失败：报告不存在或无权限");
        }
        Map<String, Object> r = ok();
        r.put("report", enrich(dailyDao.findReportById(id), groupNameMap()));
        return r;
    }

    // ========== 浏览 ==========

    /** 全员某周期报告：新人左连接报告，未填写的也列出（report 为 null），供浏览与看板使用 */
    @GetMapping("/feed")
    public Map<String, Object> feed(@RequestParam String type, @RequestParam String period) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        Map<String, Map<String, Object>> reports = dailyDao.findReportsByPeriod(type, period);
        Map<String, String> groupNames = groupNameMap();
        Map<String, String> groupIdToName = new HashMap<>(groupNames);

        List<Map<String, Object>> entries = new ArrayList<>();
        for (User u : userDao.findAll()) {
            if (!"newbie".equals(u.getDailyRole())) continue;
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("username", u.getUsername());
            e.put("name", u.getName());
            e.put("groupId", u.getGroupId());
            e.put("groupName", u.getGroupId() != null ? groupIdToName.get(u.getGroupId()) : null);
            e.put("mentor", u.getMentor());
            if (u.getMentor() != null) {
                User mentor = userDao.findByUsername(u.getMentor());
                e.put("mentorName", mentor != null ? mentor.getName() : u.getMentor());
            }
            e.put("report", reports.get(u.getUsername()));
            entries.add(e);
        }
        Map<String, Object> r = ok();
        r.put("entries", entries);
        return r;
    }

    /** 报告详情 + 评论 + 已读名单（新人报告与 mentor 报告通用） */
    @GetMapping("/reports/{id}")
    public Map<String, Object> detail(@PathVariable String id) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        Map<String, Object> report = dailyDao.findAnyReport(id);
        if (report == null) return fail("报告不存在");

        Map<String, Object> r = ok();
        r.put("report", report.containsKey("username") ? enrich(report, groupNameMap()) : enrichMentor(report));
        r.put("comments", dailyDao.findComments(id));
        List<Map<String, Object>> readers = new ArrayList<>();
        for (String username : dailyDao.findReaders(id)) {
            User u = userDao.findByUsername(username);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("username", username);
            m.put("name", u != null ? u.getName() : username);
            m.put("dailyRole", u != null ? u.getDailyRole() : null);
            readers.add(m);
        }
        r.put("readers", readers);
        return r;
    }

    // ========== 评论 / 回复 ==========

    @PostMapping("/reports/{id}/comments")
    public Map<String, Object> addComment(@PathVariable String id, @RequestBody Map<String, Object> body) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        Map<String, Object> report = dailyDao.findAnyReport(id);
        if (report == null) return fail("报告不存在");

        String content = (String) body.get("content");
        if (content == null || content.isBlank()) return fail("评论内容不能为空");
        String parentId = (String) body.get("parentId");
        String quote = (String) body.get("quote");
        Object mentions = body.get("mentions");

        String commentId = UUID.randomUUID().toString().replace("-", "");
        String roleLabel = current.getDailyRole() != null && DAILY_ROLES.contains(current.getDailyRole())
                ? current.getDailyRole() : "staff";
        dailyDao.insertComment(commentId, id, parentId,
                current.getUsername(), current.getName(), roleLabel,
                content.trim(), quote, dailyDao.toJson(mentions != null ? mentions : List.of()));

        // 通知：报告作者 + 被回复的评论作者 + @提及的人（去重、排除自己）
        Map<String, String> meta = resolveReportMeta(report);
        String period = meta.get("period");
        Set<String> targets = new LinkedHashSet<>();
        targets.add(meta.get("owner"));
        if (parentId != null && !parentId.isBlank()) {
            Map<String, Object> parent = dailyDao.findCommentById(parentId);
            if (parent != null) targets.add((String) parent.get("authorId"));
        }
        if (mentions instanceof List<?> list) {
            for (Object m : list) targets.add(String.valueOf(m));
        }
        targets.remove(current.getUsername());
        for (String target : targets) {
            User tu = userDao.findByUsername(target);
            if (tu == null) continue;
            String title = target.equals(meta.get("owner"))
                    ? current.getName() + " 批注了 " + meta.get("title")
                    : current.getName() + " 在报告评论中提到了你（" + period + "）";
            notificationService.createNotification(
                    String.valueOf(tu.getId()), "DAILY_COMMENT", title,
                    content.length() > 80 ? content.substring(0, 80) + "…" : content,
                    period, "");
        }

        Map<String, Object> r = ok();
        r.put("comments", dailyDao.findComments(id));
        return r;
    }

    @DeleteMapping("/comments/{id}")
    public Map<String, Object> deleteComment(@PathVariable String id) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        Map<String, Object> comment = dailyDao.findCommentById(id);
        if (comment == null) return fail("评论不存在");
        boolean own = current.getUsername().equals(comment.get("authorId"));
        if (!own && !"superadmin".equals(current.getRole())) {
            return fail("只能删除自己的评论");
        }
        dailyDao.deleteComment(id);
        return ok();
    }

    // ========== 已读 ==========

    @PostMapping("/reports/{id}/read")
    public Map<String, Object> markRead(@PathVariable String id) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        if (dailyDao.findAnyReport(id) == null) return fail("报告不存在");
        dailyDao.markRead(id, current.getUsername());
        return ok();
    }

    // ========== mentor 带教报告填报 ==========

    /** 我的带教报告（按 scope/target/类型/周期），无则 report 为 null */
    @GetMapping("/mentor-reports/mine")
    public Map<String, Object> mentorMine(@RequestParam String scope, @RequestParam String target,
                                          @RequestParam String type, @RequestParam String period) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        if (!"mentor".equals(current.getDailyRole())) return fail("仅带教老师可填写带教报告");
        Map<String, Object> r = ok();
        r.put("report", enrichMentor(dailyDao.findMentorReport(current.getUsername(), scope, target, type, period)));
        return r;
    }

    /** 保存带教报告草稿（upsert 自己的；个人报告的对象必须是自己所带的新人） */
    @PutMapping("/mentor-reports")
    public Map<String, Object> saveMentorDraft(@RequestBody Map<String, Object> body) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        if (!"mentor".equals(current.getDailyRole())) return fail("仅带教老师可填写带教报告");

        String scope = (String) body.get("scope");
        String target = (String) body.get("target");
        String type = (String) body.get("reportType");
        String period = (String) body.get("period");
        if (!Set.of("group", "person").contains(scope) || target == null || target.isBlank()
                || !Set.of("weekly", "monthly").contains(type) || period == null || period.isBlank()) {
            return fail("参数不合法（scope / target / reportType / period）");
        }
        if ("person".equals(scope)) {
            User newbie = userDao.findByUsername(target);
            if (newbie == null || !"newbie".equals(newbie.getDailyRole())
                    || !current.getUsername().equals(newbie.getMentor())) {
                return fail("个人报告对象必须是你所带教的新人");
            }
        }
        Object sections = body.get("sections");
        String id = dailyDao.upsertMentorDraft(current.getUsername(), scope, target, type, period.trim(),
                dailyDao.toJson(sections != null ? sections : Map.of()));
        Map<String, Object> r = ok();
        r.put("id", id);
        r.put("report", enrichMentor(dailyDao.findMentorReportById(id)));
        return r;
    }

    /** 提交带教报告（幂等） */
    @PostMapping("/mentor-reports/{id}/submit")
    public Map<String, Object> submitMentorReport(@PathVariable String id) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        if (!dailyDao.submitMentorReport(id, current.getUsername())) {
            return fail("提交失败：报告不存在或无权限");
        }
        Map<String, Object> r = ok();
        r.put("report", enrichMentor(dailyDao.findMentorReportById(id)));
        return r;
    }

    /** 某周期全部 mentor 报告（读全开：浏览页数据源） */
    @GetMapping("/mentor-reports/feed")
    public Map<String, Object> mentorFeed(@RequestParam String type, @RequestParam String period) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        List<Map<String, Object>> reports = new ArrayList<>();
        for (Map<String, Object> report : dailyDao.findMentorReportsByPeriod(type, period)) {
            reports.add(enrichMentor(report));
        }
        Map<String, Object> r = ok();
        r.put("reports", reports);
        return r;
    }

    // ========== AI 总结 / 完成度评估（复用内网大模型网关 LlmService） ==========

    /** 对单份报告（新人/mentor 通用）生成总结 + 完成度评估 */
    @PostMapping("/reports/{id}/ai-summary")
    public Map<String, Object> aiSummary(@PathVariable String id) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        Map<String, Object> report = dailyDao.findAnyReport(id);
        if (report == null) return fail("报告不存在");

        Map<String, String> meta = resolveReportMeta(report);
        Object sectionsObj = report.get("sections");
        StringBuilder sb = new StringBuilder();
        if (sectionsObj instanceof Map<?, ?> sections) {
            for (Map.Entry<?, ?> e : sections.entrySet()) {
                if (e.getValue() != null && !e.getValue().toString().isBlank()) {
                    sb.append("【").append(e.getKey()).append("】\n").append(e.getValue()).append("\n\n");
                }
            }
        }
        if (sb.isEmpty()) return fail("报告内容为空，无法总结");

        String system = "你是银行数据部的新人培养助手。请对以下" + meta.get("title") + "做两件事："
                + "1) 用 3-5 句话总结主要内容；"
                + "2) 评估完成度：计划与实际的匹配度、存在的风险点、下一步建议。"
                + "输出简洁中文，分「总结」「完成度评估」两节。";
        try {
            String summary = llmService.chatCompletion(system, sb.toString(), 1200);
            Map<String, Object> r = ok();
            r.put("summary", summary);
            return r;
        } catch (Exception e) {
            return fail("AI 服务异常：" + e.getMessage());
        }
    }

    // ========== 提交看板（mentor / 日报领导 / 超管） ==========

    /**
     * 看板数据源：区间内全部新人的报告原始行。
     * 已交/补交/缺交/未到的状态判定由前端完成（便于前端调整展示规则，后端不改）。
     */
    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(@RequestParam String from, @RequestParam String to) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        String dr = current.getDailyRole();
        boolean canView = "mentor".equals(dr) || "leader".equals(dr) || "superadmin".equals(current.getRole());
        if (!canView) return fail("无权限：看板仅带教老师与领导可见");
        if (!from.matches("\\d{8}") || !to.matches("\\d{8}")) return fail("参数不合法（from/to 应为 YYYYMMDD）");

        Map<String, List<Map<String, Object>>> byUser = new LinkedHashMap<>();
        for (Map<String, Object> r : dailyDao.findReportsInRange("daily", from, to)) {
            byUser.computeIfAbsent((String) r.get("username"), k -> new ArrayList<>()).add(r);
        }
        Map<String, String> groupNames = groupNameMap();

        List<Map<String, Object>> entries = new ArrayList<>();
        for (User u : userDao.findAll()) {
            if (!"newbie".equals(u.getDailyRole())) continue;
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("username", u.getUsername());
            e.put("name", u.getName());
            e.put("groupId", u.getGroupId());
            e.put("groupName", u.getGroupId() != null ? groupNames.get(u.getGroupId()) : null);
            if (u.getMentor() != null) {
                User mentor = userDao.findByUsername(u.getMentor());
                e.put("mentorName", mentor != null ? mentor.getName() : u.getMentor());
            }
            List<Map<String, Object>> reports = new ArrayList<>();
            for (Map<String, Object> r : byUser.getOrDefault(u.getUsername(), List.of())) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", r.get("id"));
                item.put("period", r.get("period"));
                item.put("status", r.get("status"));
                item.put("submittedAt", r.get("submittedAt"));
                reports.add(item);
            }
            e.put("reports", reports);
            entries.add(e);
        }
        Map<String, Object> r = ok();
        r.put("entries", entries);

        // mentor 提交区块数据：区间内周报 + 覆盖月份的月报（原始行，判定在前端）
        List<Map<String, Object>> mentorRows = new ArrayList<>();
        for (Map<String, Object> m : dailyDao.findMentorReportsInRange("weekly", from, to)) {
            mentorRows.add(enrichMentor(m));
        }
        for (Map<String, Object> m : dailyDao.findMentorReportsInRange("monthly", from.substring(0, 6), to.substring(0, 6))) {
            mentorRows.add(enrichMentor(m));
        }
        r.put("mentorReports", mentorRows);
        return r;
    }

    // ========== 补交提醒（新人） ==========

    /** 最近 N 天内（不含今天）未提交日报的工作日清单，旧的在前；mentor 返回缺交的小组周报周期 */
    @GetMapping("/missing")
    public Map<String, Object> missing(@RequestParam(defaultValue = "30") int days) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        days = Math.min(Math.max(days, 1), 90);

        Map<String, Object> r = ok();
        if ("mentor".equals(current.getDailyRole())) {
            // mentor：过去若干周（不含本周未到期周五）的小组带教周报缺交清单
            int weeks = Math.max(1, days / 7);
            Set<String> submitted = dailyDao.findSubmittedMentorPeriods(current.getUsername(), "group", "weekly");
            List<String> missing = new ArrayList<>();
            java.time.LocalDate today = java.time.LocalDate.now();
            java.time.LocalDate friday = today.with(java.time.DayOfWeek.FRIDAY);
            if (!today.isBefore(friday)) {
                // 今天就是周五或已过了本周五：本周五仍属"本周"，从上周五开始检查
                friday = friday.minusWeeks(1);
            }
            for (int i = 0; i < weeks; i++) {
                String p = friday.format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE);
                if (!submitted.contains(p)) missing.add(p);
                friday = friday.minusWeeks(1);
            }
            Collections.reverse(missing);
            r.put("missing", missing);
            return r;
        }
        if (!"newbie".equals(current.getDailyRole())) return fail("仅新人账号有此数据");

        Set<String> submitted = dailyDao.findSubmittedPeriods(current.getUsername(), "daily");
        List<String> missing = new ArrayList<>();
        java.time.LocalDate d = java.time.LocalDate.now().minusDays(1);
        for (int i = 0; i < days; i++) {
            java.time.DayOfWeek w = d.getDayOfWeek();
            if (w != java.time.DayOfWeek.SATURDAY && w != java.time.DayOfWeek.SUNDAY) {
                String p = d.format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE);
                if (!submitted.contains(p)) missing.add(p);
            }
            d = d.minusDays(1);
        }
        Collections.reverse(missing);
        r.put("missing", missing);
        return r;
    }
}
