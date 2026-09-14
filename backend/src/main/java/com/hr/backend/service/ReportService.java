package com.hr.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hr.backend.exception.OptimisticLockException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.File;
import java.io.IOException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;

@Service
public class ReportService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${report.legacy-data-file:${app.data-dir:./data}/weekly-reports.json}")
    private String legacyDataFilePath;

    @PostConstruct
    public synchronized void init() throws IOException {
        createTableIfNotExists();
        migrateAddColumnsIfNeeded();
        migrateFromJsonIfNeeded();
        migrateSubmissionsIfNeeded();
        migrateLockHistoricalReports();
        createActionLogTableIfNotExists();
    }

    private void createTableIfNotExists() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS weekly_reports (
                id TEXT PRIMARY KEY,
                week_label TEXT NOT NULL,
                dept TEXT NOT NULL,
                author_id TEXT,
                author_name TEXT,
                plan TEXT,
                content TEXT,
                current_work TEXT,
                next_plan TEXT,
                thoughts TEXT,
                other TEXT,
                comments TEXT,
                ai_summary TEXT,
                ai_analysis TEXT,
                submissions TEXT,
                admin_unlock INTEGER DEFAULT 0,
                admin_unlock_by TEXT,
                admin_unlock_at TEXT,
                locked INTEGER DEFAULT 0,
                deadline TEXT,
                created_at TEXT,
                updated_at TEXT,
                UNIQUE(week_label, dept)
            )
            """);
    }

    private void migrateAddColumnsIfNeeded() {
        // SQLite ALTER TABLE ADD COLUMN is safe if column doesn't exist
        // We try to add each new column; if it already exists, SQLite will throw but we can ignore
        addColumnIfNotExists("weekly_reports", "submissions", "TEXT");
        addColumnIfNotExists("weekly_reports", "admin_unlock", "INTEGER DEFAULT 0");
        addColumnIfNotExists("weekly_reports", "admin_unlock_by", "TEXT");
        addColumnIfNotExists("weekly_reports", "admin_unlock_at", "TEXT");
        addColumnIfNotExists("weekly_reports", "locked", "INTEGER DEFAULT 0");
        addColumnIfNotExists("weekly_reports", "deadline", "TEXT");
        // 软删除（回收站）：deleted_at 非空表示该周报所在周期已被删除，数据保留可恢复
        addColumnIfNotExists("weekly_reports", "deleted_at", "TEXT");
        addColumnIfNotExists("weekly_reports", "deleted_by", "TEXT");
    }

    private void addColumnIfNotExists(String table, String column, String type) {
        try {
            jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + type);
        } catch (org.springframework.dao.DataAccessException e) {
            // Column likely already exists; SQLite throws various exceptions for this
            if (e.getMessage() == null || !e.getMessage().contains("duplicate column name")) {
                System.err.println("Warning: failed to add column " + column + ": " + e.getMessage());
            }
        }
    }

    private void migrateSubmissionsIfNeeded() {
        // For existing reports without submissions, auto-initialize v1 snapshot from current content
        List<Map<String, Object>> reports = jdbcTemplate.query(
                "SELECT * FROM weekly_reports WHERE submissions IS NULL",
                (rs, rowNum) -> mapRow(rs));

        for (Map<String, Object> report : reports) {
            try {
                Map<String, Object> snapshot = createSnapshot(report);
                Map<String, Object> submission = new LinkedHashMap<>();
                submission.put("version", 1);
                submission.put("submittedAt", report.get("updatedAt") != null ? report.get("updatedAt") : Instant.now().toString());
                submission.put("content", snapshot);

                List<Map<String, Object>> submissions = new ArrayList<>();
                submissions.add(submission);

                jdbcTemplate.update(
                        "UPDATE weekly_reports SET submissions = ? WHERE id = ?",
                        objectMapper.writeValueAsString(submissions),
                        report.get("id")
                );
            } catch (Exception e) {
                System.err.println("Failed to migrate submissions for report " + report.get("id") + ": " + e.getMessage());
            }
        }

        if (!reports.isEmpty()) {
            System.out.println("✅ 已为 " + reports.size() + " 条旧周报初始化 submissions v1");
        }
    }

    private void migrateLockHistoricalReports() {
        // 历史周报日期：20260327, 20260410, 20260417, 20260515, 20260522
        List<String> historicalWeeks = List.of("20260327", "20260410", "20260417", "20260424", "20260515", "20260518", "20260522", "20260525", "20260529");
        for (String week : historicalWeeks) {
            jdbcTemplate.update(
                    "UPDATE weekly_reports SET locked = 1 WHERE week_label = ? AND locked = 0",
                    week
            );
        }
    }

    private Map<String, Object> createSnapshot(Map<String, Object> report) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("plan", report.get("plan"));
        snapshot.put("content", report.get("content"));
        snapshot.put("currentWork", report.get("currentWork"));
        snapshot.put("nextPlan", report.get("nextPlan"));
        snapshot.put("thoughts", report.get("thoughts"));
        snapshot.put("other", report.get("other"));
        snapshot.put("updatedAt", report.get("updatedAt"));
        return snapshot;
    }

    private void migrateFromJsonIfNeeded() throws IOException {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM weekly_reports", Integer.class);
        if (count != null && count > 0) {
            return; // 已有数据，跳过迁移
        }

        File legacyFile = resolveLegacyFile();
        if (!legacyFile.exists()) {
            return;
        }

        List<Map<String, Object>> reports = objectMapper.readValue(legacyFile,
                new TypeReference<List<Map<String, Object>>>() {});

        for (Map<String, Object> report : reports) {
            insertReport(report);
        }

        System.out.println("✅ 已从 JSON 迁移 " + reports.size() + " 条周报数据到 SQLite");
    }

    private File resolveLegacyFile() {
        File candidate = new File(legacyDataFilePath);
        if (!candidate.isAbsolute()) {
            candidate = new File(System.getProperty("user.dir"), legacyDataFilePath);
        }
        return candidate;
    }

    public synchronized List<Map<String, Object>> getAllReports() {
        // 软删除的周报（回收站中的周期）不在正常查询中返回
        return jdbcTemplate.query("SELECT * FROM weekly_reports WHERE deleted_at IS NULL", (rs, rowNum) -> mapRow(rs));
    }

    public synchronized Map<String, Object> getReport(String weekLabel, String dept) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT * FROM weekly_reports WHERE week_label = ? AND dept = ? AND deleted_at IS NULL",
                    (rs, rowNum) -> mapRow(rs), weekLabel, dept);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }

    /** 该周报是否处于软删除状态（所在周期在回收站中） */
    public synchronized boolean isSoftDeleted(String weekLabel, String dept) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM weekly_reports WHERE week_label = ? AND dept = ? AND deleted_at IS NOT NULL",
                Integer.class, weekLabel, dept);
        return count != null && count > 0;
    }

    // ========== BUG-003 保存自愈：乱码任务还原 ==========

    /** content 任务树自愈：任务文本若能完整解析为任务数组，用解析结果替换该节点 */
    private void sanitizeContent(Object contentObj) {
        if (contentObj instanceof List) {
            sanitizeTaskList(castTaskList(contentObj));
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> castTaskList(Object obj) {
        return (List<Map<String, Object>>) obj;
    }

    private void sanitizeTaskList(List<Map<String, Object>> tasks) {
        for (int i = 0; i < tasks.size(); i++) {
            Map<String, Object> task = tasks.get(i);
            Object text = task.get("text");
            if (text instanceof String) {
                String trimmed = ((String) text).trim();
                // 空数组残留垃圾任务（'[]'）：删除节点，子任务上提
                if ("[]".equals(trimmed) || "[ ]".equals(trimmed)) {
                    tasks.remove(i);
                    Object children = task.get("children");
                    if (children instanceof List) {
                        tasks.addAll(i, castTaskList(children));
                    }
                    i--;
                    continue;
                }
                List<Map<String, Object>> parsed = tryParseTaskArray((String) text);
                if (parsed != null) {
                    tasks.remove(i);
                    tasks.addAll(i, parsed);
                    i--;
                    continue;
                }
            }
            Object children = task.get("children");
            if (children instanceof List) {
                sanitizeTaskList(castTaskList(children));
            }
        }
    }

    /** currentWork/plan 文本字段自愈：若内容是 JSON 任务数组，改写为格式化纯文本 */
    private void sanitizeTextField(Map<String, Object> report, String field) {
        Object v = report.get(field);
        if (!(v instanceof String)) return;
        List<Map<String, Object>> parsed = tryParseTaskArray((String) v);
        if (parsed != null) {
            report.put(field, formatTasksForExport(parsed));
        }
    }

    /** 文本可完整解析为「元素均含 text 键的对象数组」时返回该数组，否则 null（不误伤正常文本） */
    private List<Map<String, Object>> tryParseTaskArray(String text) {
        String trimmed = text.trim();
        if (!trimmed.startsWith("[") || trimmed.length() < 10) return null;
        try {
            Object v = objectMapper.readValue(trimmed, Object.class);
            if (!(v instanceof List)) return null;
            List<?> list = (List<?>) v;
            if (list.isEmpty()) return null;
            for (Object o : list) {
                if (!(o instanceof Map) || !((Map<?, ?>) o).containsKey("text")) return null;
            }
            return castTaskList(list);
        } catch (Exception e) {
            return null;
        }
    }

    /** 与前端 formatTasksForExport 等效的简易格式化（自愈时给文本字段一个可读版本） */
    private String formatTasksForExport(List<Map<String, Object>> tasks) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < tasks.size(); i++) {
            formatTaskNode(tasks.get(i), 0, i, sb);
        }
        return sb.toString().trim();
    }

    private void formatTaskNode(Map<String, Object> node, int depth, int index, StringBuilder sb) {
        String prefix = depth == 0 ? (index + 1) + ". " : (depth == 1 ? "（" + (index + 1) + "）" : (index + 1) + "）");
        sb.append("  ".repeat(depth)).append(prefix).append(String.valueOf(node.getOrDefault("text", ""))).append('\n');
        Object children = node.get("children");
        if (children instanceof List) {
            List<Map<String, Object>> list = castTaskList(children);
            for (int i = 0; i < list.size(); i++) {
                formatTaskNode(list.get(i), depth + 1, i, sb);
            }
        }
    }

    public synchronized void saveReport(Map<String, Object> report) throws IOException {
        String weekLabel = (String) report.get("weekLabel");
        String dept = (String) report.get("dept");
        if (weekLabel == null || dept == null) return;

        // 保存前自愈（BUG-003 防线）：旧浏览器缓存/旧 localStorage 草稿仍可能把
        // nextPlan 的 JSON 原文作为任务文本提交，这里识别并还原为任务树
        sanitizeContent(report.get("content"));
        sanitizeTextField(report, "currentWork");
        sanitizeTextField(report, "plan");

        String id = (String) report.getOrDefault("id", weekLabel + "-" + dept);
        report.put("id", id);

        // 前端基于这个 updatedAt 做乐观锁校验；保存前记录期望值
        String expectedUpdatedAt = (String) report.get("updatedAt");
        report.put("updatedAt", Instant.now().toString());

        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM weekly_reports WHERE week_label = ? AND dept = ?",
                Integer.class, weekLabel, dept);

        if (count != null && count > 0) {
            int updated = updateReport(report, expectedUpdatedAt);
            if (updated == 0) {
                throw new OptimisticLockException("周报已被其他用户更新");
            }
        } else {
            insertReport(report);
        }
    }

    public synchronized void submitReport(String weekLabel, String dept, String submittedBy) throws IOException {
        Map<String, Object> report = getReport(weekLabel, dept);
        if (report == null) return;

        List<Map<String, Object>> submissions = (List<Map<String, Object>>) report.get("submissions");
        if (submissions == null) {
            submissions = new ArrayList<>();
        }

        int nextVersion = submissions.size() + 1;
        Map<String, Object> snapshot = createSnapshot(report);
        Map<String, Object> submission = new LinkedHashMap<>();
        submission.put("version", nextVersion);
        submission.put("submittedAt", Instant.now().toString());
        submission.put("submittedBy", submittedBy != null ? submittedBy : report.get("authorName"));
        submission.put("content", snapshot);
        submissions.add(submission);

        jdbcTemplate.update(
                "UPDATE weekly_reports SET submissions = ?, updated_at = ? WHERE week_label = ? AND dept = ?",
                objectMapper.writeValueAsString(submissions),
                Instant.now().toString(),
                weekLabel,
                dept
        );
    }

    public synchronized void autoSubmitIfNeeded(String weekLabel, String dept) throws IOException {
        Map<String, Object> report = getReport(weekLabel, dept);
        if (report == null) return;

        List<Map<String, Object>> submissions = (List<Map<String, Object>>) report.get("submissions");
        if (submissions == null || submissions.isEmpty()) {
            submitReport(weekLabel, dept, (String) report.get("authorName"));
            return;
        }

        // Check if current draft differs from last submission
        Map<String, Object> lastSnapshot = (Map<String, Object>) submissions.get(submissions.size() - 1).get("content");
        Map<String, Object> currentSnapshot = createSnapshot(report);

        if (!currentSnapshot.equals(lastSnapshot)) {
            submitReport(weekLabel, dept, (String) report.get("authorName"));
        }
    }

    public synchronized void setUnlock(String weekLabel, String dept, boolean unlock, String adminUsername) throws IOException {
        if (unlock) {
            jdbcTemplate.update(
                    "UPDATE weekly_reports SET admin_unlock = 1, admin_unlock_by = ?, admin_unlock_at = ? WHERE week_label = ? AND dept = ?",
                    adminUsername, Instant.now().toString(), weekLabel, dept
            );
        } else {
            jdbcTemplate.update(
                    "UPDATE weekly_reports SET admin_unlock = 0, admin_unlock_by = NULL, admin_unlock_at = NULL WHERE week_label = ? AND dept = ?",
                    weekLabel, dept
            );
        }
    }

    private void insertReport(Map<String, Object> report) throws JsonProcessingException {
        jdbcTemplate.update("""
            INSERT INTO weekly_reports
            (id, week_label, dept, author_id, author_name, plan, content, current_work,
             next_plan, thoughts, other, ai_summary, ai_analysis, submissions,
             admin_unlock, admin_unlock_by, admin_unlock_at, locked, deadline, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                report.get("id"),
                report.get("weekLabel"),
                report.get("dept"),
                report.get("authorId"),
                report.get("authorName"),
                report.get("plan"),
                toJson(report.get("content")),
                report.get("currentWork"),
                report.get("nextPlan"),
                report.get("thoughts"),
                report.get("other"),
                report.get("aiSummary"),
                toJson(report.get("aiAnalysis")),
                toJson(report.get("submissions")),
                report.getOrDefault("adminUnlock", 0),
                report.get("adminUnlockBy"),
                report.get("adminUnlockAt"),
                report.getOrDefault("locked", 0),
                report.get("deadline"),
                report.getOrDefault("createdAt", report.get("updatedAt")),
                report.get("updatedAt")
        );
    }

    private int updateReport(Map<String, Object> report, String expectedUpdatedAt) throws JsonProcessingException {
        return jdbcTemplate.update("""
            UPDATE weekly_reports SET
                author_id = ?, author_name = ?, plan = ?, content = ?,
                current_work = ?, next_plan = ?, thoughts = ?, other = ?,
                ai_summary = ?, ai_analysis = ?, submissions = ?,
                admin_unlock = ?, admin_unlock_by = ?, admin_unlock_at = ?, locked = ?, deadline = ?, updated_at = ?
            WHERE week_label = ? AND dept = ? AND updated_at = ?
            """,
                report.get("authorId"),
                report.get("authorName"),
                report.get("plan"),
                toJson(report.get("content")),
                report.get("currentWork"),
                report.get("nextPlan"),
                report.get("thoughts"),
                report.get("other"),
                report.get("aiSummary"),
                toJson(report.get("aiAnalysis")),
                toJson(report.get("submissions")),
                report.getOrDefault("adminUnlock", 0),
                report.get("adminUnlockBy"),
                report.get("adminUnlockAt"),
                report.getOrDefault("locked", 0),
                report.get("deadline"),
                report.get("updatedAt"),
                report.get("weekLabel"),
                report.get("dept"),
                expectedUpdatedAt
        );
    }

    public synchronized void clearAll() {
        jdbcTemplate.update("DELETE FROM weekly_reports");
    }

    /** 软删除：仅标记 deleted_at/deleted_by，数据全部保留，可在回收站一键恢复 */
    public synchronized int softDeleteByWeekLabel(String weekLabel, String deletedBy) {
        return jdbcTemplate.update(
                "UPDATE weekly_reports SET deleted_at = ?, deleted_by = ? WHERE week_label = ? AND deleted_at IS NULL",
                Instant.now().toString(), deletedBy, weekLabel);
    }

    /** 从回收站恢复：清除软删除标记，周报原封不动回到正常列表 */
    public synchronized int restoreByWeekLabel(String weekLabel) {
        return jdbcTemplate.update(
                "UPDATE weekly_reports SET deleted_at = NULL, deleted_by = NULL WHERE week_label = ? AND deleted_at IS NOT NULL",
                weekLabel);
    }

    /** 回收站列表：按周期聚合 */
    public synchronized List<Map<String, Object>> getRecycleBin() {
        return jdbcTemplate.query("""
                SELECT week_label, COUNT(*) AS report_count,
                       MAX(deleted_at) AS deleted_at, MAX(deleted_by) AS deleted_by
                FROM weekly_reports
                WHERE deleted_at IS NOT NULL
                GROUP BY week_label
                ORDER BY week_label DESC
                """, (rs, rowNum) -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("weekLabel", rs.getString("week_label"));
            map.put("reportCount", rs.getInt("report_count"));
            map.put("deletedAt", rs.getString("deleted_at"));
            map.put("deletedBy", rs.getString("deleted_by"));
            return map;
        });
    }

    /** 所有处于软删除状态的周期标签（供前端从下拉框中排除，包括当前周） */
    public synchronized List<String> getDeletedWeekLabels() {
        return jdbcTemplate.queryForList(
                "SELECT DISTINCT week_label FROM weekly_reports WHERE deleted_at IS NOT NULL",
                String.class);
    }

    private Map<String, Object> mapRow(ResultSet rs) throws SQLException {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", rs.getString("id"));
        map.put("weekLabel", rs.getString("week_label"));
        map.put("dept", rs.getString("dept"));
        map.put("authorId", rs.getString("author_id"));
        map.put("authorName", rs.getString("author_name"));
        map.put("plan", rs.getString("plan"));
        map.put("content", fromJson(rs.getString("content"), new TypeReference<List<Map<String, Object>>>() {}));
        map.put("currentWork", rs.getString("current_work"));
        map.put("nextPlan", rs.getString("next_plan"));
        map.put("thoughts", rs.getString("thoughts"));
        map.put("other", rs.getString("other"));
        map.put("comments", List.of()); // 批注已从独立表读取
        map.put("aiSummary", rs.getString("ai_summary"));
        map.put("aiAnalysis", fromJson(rs.getString("ai_analysis"), new TypeReference<Map<String, Object>>() {}));
        map.put("submissions", fromJson(rs.getString("submissions"), new TypeReference<List<Map<String, Object>>>() {}));
        map.put("adminUnlock", rs.getInt("admin_unlock") == 1);
        map.put("adminUnlockBy", rs.getString("admin_unlock_by"));
        map.put("adminUnlockAt", rs.getString("admin_unlock_at"));
        map.put("locked", rs.getInt("locked") == 1);
        map.put("deadline", rs.getString("deadline"));
        map.put("createdAt", rs.getString("created_at"));
        map.put("updatedAt", rs.getString("updated_at"));
        return map;
    }

    private String toJson(Object value) throws JsonProcessingException {
        if (value == null) return null;
        return objectMapper.writeValueAsString(value);
    }

    private <T> T fromJson(String json, TypeReference<T> typeRef) {
        if (json == null) return null;
        try {
            return objectMapper.readValue(json, typeRef);
        } catch (Exception e) {
            return null;
        }
    }

    // ========== Action Log Table ==========

    private void createActionLogTableIfNotExists() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS user_action_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                user_name TEXT,
                action TEXT,
                target_type TEXT,
                target_id TEXT,
                target_desc TEXT,
                details TEXT,
                ip TEXT,
                created_at TEXT
            )
            """);
    }
}
