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

    /** 报告详情 + 评论 + 已读名单 */
    @GetMapping("/reports/{id}")
    public Map<String, Object> detail(@PathVariable String id) {
        User current = currentUser();
        if (current == null) return fail("未登录");
        Map<String, Object> report = dailyDao.findReportById(id);
        if (report == null) return fail("报告不存在");

        Map<String, Object> r = ok();
        r.put("report", enrich(report, groupNameMap()));
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
        Map<String, Object> report = dailyDao.findReportById(id);
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
        String authorName = (String) enrich(report, groupNameMap()).get("authorName");
        String period = (String) report.get("period");
        Set<String> targets = new LinkedHashSet<>();
        targets.add((String) report.get("username"));
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
            String title = target.equals(report.get("username"))
                    ? current.getName() + " 批注了 " + authorName + " 的日报（" + period + "）"
                    : current.getName() + " 在日报评论中提到了你（" + period + "）";
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
        if (dailyDao.findReportById(id) == null) return fail("报告不存在");
        dailyDao.markRead(id, current.getUsername());
        return ok();
    }
}
