package com.hr.backend.dao;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.*;

/**
 * 新人培养报告（日报/周报/月报）数据访问。
 * 与科室周报完全独立的 4 张表，互不外键、互不影响。
 * 设计原则：sections 为自由 JSON（栏目结构由前端定义），后端只透传存储。
 */
@Repository
public class DailyDao {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostConstruct
    public void init() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS newbie_groups (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                leader TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT
            )
            """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS newbie_reports (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                report_type TEXT NOT NULL,
                period TEXT NOT NULL,
                sections TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'draft',
                submitted_at TEXT,
                version INTEGER NOT NULL DEFAULT 1,
                deleted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT,
                updated_at TEXT,
                UNIQUE(username, report_type, period)
            )
            """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS newbie_comments (
                id TEXT PRIMARY KEY,
                report_id TEXT NOT NULL,
                parent_id TEXT,
                author_id TEXT,
                author_name TEXT,
                author_role TEXT,
                content TEXT NOT NULL,
                quote TEXT,
                mentions TEXT NOT NULL DEFAULT '[]',
                created_at TEXT
            )
            """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS newbie_report_reads (
                report_id TEXT NOT NULL,
                username TEXT NOT NULL,
                read_at TEXT,
                PRIMARY KEY (report_id, username)
            )
            """);
    }

    // ========== 小组 ==========

    public List<Map<String, Object>> findAllGroups() {
        return jdbcTemplate.queryForList(
                "SELECT id, name, leader, sort_order AS sortOrder, created_at AS createdAt FROM newbie_groups ORDER BY sort_order, created_at");
    }

    public boolean groupExistsByName(String name) {
        Integer c = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM newbie_groups WHERE name = ?", Integer.class, name);
        return c != null && c > 0;
    }

    /** 新增小组，返回小组 id；重名返回 null */
    public String insertGroup(String name, String leader) {
        if (groupExistsByName(name)) return null;
        String id = UUID.randomUUID().toString().replace("-", "");
        Integer max = jdbcTemplate.queryForObject("SELECT COALESCE(MAX(sort_order), -1) FROM newbie_groups", Integer.class);
        jdbcTemplate.update("INSERT INTO newbie_groups (id, name, leader, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
                id, name, leader, (max != null ? max : -1) + 1, Instant.now().toString());
        return id;
    }

    /** 仅供测试清理 */
    public void deleteGroupByName(String name) {
        jdbcTemplate.update("DELETE FROM newbie_groups WHERE name = ?", name);
    }

    // ========== 报告 ==========

    public Map<String, Object> findReport(String username, String reportType, String period) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT * FROM newbie_reports WHERE username = ? AND report_type = ? AND period = ? AND deleted = 0",
                    this::mapReport, username, reportType, period);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }

    public Map<String, Object> findReportById(String id) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT * FROM newbie_reports WHERE id = ? AND deleted = 0",
                    this::mapReport, id);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }

    /** 保存草稿（不存在则插入，存在则更新 sections 并递增 version）。返回报告 id。 */
    public String upsertDraft(String username, String reportType, String period, String sectionsJson) {
        Map<String, Object> existing = findReport(username, reportType, period);
        String now = Instant.now().toString();
        if (existing == null) {
            String id = UUID.randomUUID().toString().replace("-", "");
            jdbcTemplate.update("""
                INSERT INTO newbie_reports (id, username, report_type, period, sections, status, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'draft', 1, ?, ?)
                """, id, username, reportType, period, sectionsJson, now, now);
            return id;
        }
        jdbcTemplate.update(
                "UPDATE newbie_reports SET sections = ?, version = version + 1, updated_at = ? WHERE id = ?",
                sectionsJson, now, existing.get("id"));
        return (String) existing.get("id");
    }

    /** 提交（幂等）：置 submitted 并记录时间 */
    public boolean submit(String id, String username) {
        int n = jdbcTemplate.update(
                "UPDATE newbie_reports SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ? AND username = ? AND deleted = 0",
                Instant.now().toString(), Instant.now().toString(), id, username);
        return n > 0;
    }

    /** 全员某周期报告（含评论数），键为 username */
    public Map<String, Map<String, Object>> findReportsByPeriod(String reportType, String period) {
        List<Map<String, Object>> rows = jdbcTemplate.query("""
            SELECT r.*, (SELECT COUNT(*) FROM newbie_comments c WHERE c.report_id = r.id) AS comment_count
            FROM newbie_reports r WHERE r.report_type = ? AND r.period = ? AND r.deleted = 0
            """, this::mapReport, reportType, period);
        Map<String, Map<String, Object>> byUser = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            byUser.put((String) r.get("username"), r);
        }
        return byUser;
    }

    /** 某用户在周期区间内的全部报告（看板数据源，原始行，状态判定交给前端） */
    public List<Map<String, Object>> findReportsInRange(String reportType, String from, String to) {
        return jdbcTemplate.query(
                "SELECT * FROM newbie_reports WHERE report_type = ? AND period >= ? AND period <= ? AND deleted = 0 ORDER BY period",
                this::mapReport, reportType, from, to);
    }

    /** 某用户已提交报告的 period 集合（补交提醒数据源） */
    public Set<String> findSubmittedPeriods(String username, String reportType) {
        List<String> rows = jdbcTemplate.queryForList(
                "SELECT period FROM newbie_reports WHERE username = ? AND report_type = ? AND status = 'submitted' AND deleted = 0",
                String.class, username, reportType);
        return new HashSet<>(rows);
    }

    // ========== 评论 ==========

    public void insertComment(String id, String reportId, String parentId,
                              String authorId, String authorName, String authorRole,
                              String content, String quote, String mentionsJson) {
        jdbcTemplate.update("""
            INSERT INTO newbie_comments (id, report_id, parent_id, author_id, author_name, author_role, content, quote, mentions, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, id, reportId, parentId, authorId, authorName, authorRole, content, quote,
                mentionsJson != null ? mentionsJson : "[]", Instant.now().toString());
    }

    public List<Map<String, Object>> findComments(String reportId) {
        return jdbcTemplate.query(
                "SELECT * FROM newbie_comments WHERE report_id = ? ORDER BY created_at",
                (rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id"));
                    m.put("reportId", rs.getString("report_id"));
                    m.put("parentId", rs.getString("parent_id"));
                    m.put("authorId", rs.getString("author_id"));
                    m.put("authorName", rs.getString("author_name"));
                    m.put("authorRole", rs.getString("author_role"));
                    m.put("content", rs.getString("content"));
                    m.put("quote", rs.getString("quote"));
                    m.put("mentions", parseJsonArray(rs.getString("mentions")));
                    m.put("createdAt", rs.getString("created_at"));
                    return m;
                }, reportId);
    }

    public Map<String, Object> findCommentById(String id) {
        List<Map<String, Object>> all = jdbcTemplate.query(
                "SELECT * FROM newbie_comments WHERE id = ?",
                (rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id"));
                    m.put("reportId", rs.getString("report_id"));
                    m.put("authorId", rs.getString("author_id"));
                    return m;
                }, id);
        return all.isEmpty() ? null : all.get(0);
    }

    public void deleteComment(String id) {
        jdbcTemplate.update("DELETE FROM newbie_comments WHERE id = ? OR parent_id = ?", id, id);
    }

    // ========== 已读 ==========

    public void markRead(String reportId, String username) {
        jdbcTemplate.update(
                "INSERT OR REPLACE INTO newbie_report_reads (report_id, username, read_at) VALUES (?, ?, ?)",
                reportId, username, Instant.now().toString());
    }

    /** 已读名单（含姓名，由调用方补充） */
    public List<String> findReaders(String reportId) {
        return jdbcTemplate.queryForList(
                "SELECT username FROM newbie_report_reads WHERE report_id = ? ORDER BY read_at",
                String.class, reportId);
    }

    // ========== 内部工具 ==========

    private Map<String, Object> mapReport(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rs.getString("id"));
        m.put("username", rs.getString("username"));
        m.put("reportType", rs.getString("report_type"));
        m.put("period", rs.getString("period"));
        m.put("sections", parseJsonObject(rs.getString("sections")));
        m.put("status", rs.getString("status"));
        m.put("submittedAt", rs.getString("submitted_at"));
        m.put("version", rs.getInt("version"));
        m.put("createdAt", rs.getString("created_at"));
        m.put("updatedAt", rs.getString("updated_at"));
        try {
            m.put("commentCount", rs.getInt("comment_count"));
        } catch (java.sql.SQLException ignored) {
            // 非 feed 查询无此列
        }
        return m;
    }

    private Map<String, Object> parseJsonObject(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private List<String> parseJsonArray(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    public String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return "{}";
        }
    }
}
