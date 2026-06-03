package com.hr.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.*;

@Service
public class ReportService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${report.legacy-data-file:backend/data/weekly-reports.json}")
    private String legacyDataFilePath;

    @PostConstruct
    public synchronized void init() throws IOException {
        createTableIfNotExists();
        migrateFromJsonIfNeeded();
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
                created_at TEXT,
                updated_at TEXT,
                UNIQUE(week_label, dept)
            )
            """);
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
        return jdbcTemplate.query("SELECT * FROM weekly_reports", (rs, rowNum) -> mapRow(rs));
    }

    public synchronized Map<String, Object> getReport(String weekLabel, String dept) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT * FROM weekly_reports WHERE week_label = ? AND dept = ?",
                    (rs, rowNum) -> mapRow(rs), weekLabel, dept);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }

    public synchronized void saveReport(Map<String, Object> report) throws IOException {
        String weekLabel = (String) report.get("weekLabel");
        String dept = (String) report.get("dept");
        if (weekLabel == null || dept == null) return;

        String id = (String) report.getOrDefault("id", weekLabel + "-" + dept);
        report.put("id", id);
        report.put("updatedAt", java.time.Instant.now().toString());

        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM weekly_reports WHERE week_label = ? AND dept = ?",
                Integer.class, weekLabel, dept);

        if (count != null && count > 0) {
            updateReport(report);
        } else {
            insertReport(report);
        }
    }

    private void insertReport(Map<String, Object> report) throws JsonProcessingException {
        jdbcTemplate.update("""
            INSERT INTO weekly_reports
            (id, week_label, dept, author_id, author_name, plan, content, current_work,
             next_plan, thoughts, other, comments, ai_summary, ai_analysis, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                toJson(report.get("comments")),
                report.get("aiSummary"),
                toJson(report.get("aiAnalysis")),
                report.getOrDefault("createdAt", report.get("updatedAt")),
                report.get("updatedAt")
        );
    }

    private void updateReport(Map<String, Object> report) throws JsonProcessingException {
        jdbcTemplate.update("""
            UPDATE weekly_reports SET
                author_id = ?, author_name = ?, plan = ?, content = ?,
                current_work = ?, next_plan = ?, thoughts = ?, other = ?,
                comments = ?, ai_summary = ?, ai_analysis = ?, updated_at = ?
            WHERE week_label = ? AND dept = ?
            """,
                report.get("authorId"),
                report.get("authorName"),
                report.get("plan"),
                toJson(report.get("content")),
                report.get("currentWork"),
                report.get("nextPlan"),
                report.get("thoughts"),
                report.get("other"),
                toJson(report.get("comments")),
                report.get("aiSummary"),
                toJson(report.get("aiAnalysis")),
                report.get("updatedAt"),
                report.get("weekLabel"),
                report.get("dept")
        );
    }

    public synchronized void clearAll() {
        jdbcTemplate.update("DELETE FROM weekly_reports");
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
        map.put("comments", fromJson(rs.getString("comments"), new TypeReference<List<Map<String, Object>>>() {}));
        map.put("aiSummary", rs.getString("ai_summary"));
        map.put("aiAnalysis", fromJson(rs.getString("ai_analysis"), new TypeReference<Map<String, Object>>() {}));
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
}
