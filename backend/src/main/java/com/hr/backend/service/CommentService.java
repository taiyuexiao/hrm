package com.hr.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;

@Service
public class CommentService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @PostConstruct
    public void init() {
        try {
            createCommentTableIfNotExists();
            addCommentColumnIfNotExists("target_start", "INTEGER");
            addCommentColumnIfNotExists("target_end", "INTEGER");
            addCommentColumnIfNotExists("target_task_id", "TEXT");
            migrateCommentsFromReportTable();
        } catch (Exception e) {
            System.err.println("❌ CommentService 初始化失败: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void createCommentTableIfNotExists() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                report_id TEXT NOT NULL,
                parent_id TEXT,
                author_id TEXT NOT NULL,
                author_name TEXT,
                author_avatar TEXT,
                author_color TEXT,
                content TEXT NOT NULL,
                target_text TEXT,
                target_block TEXT,
                target_start INTEGER,
                target_end INTEGER,
                target_task_id TEXT,
                mention_ids TEXT,
                read_by TEXT,
                resolved INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
            """);
    }

    private void addCommentColumnIfNotExists(String column, String type) {
        List<String> columns = jdbcTemplate.query(
                "PRAGMA table_info(comments)",
                (rs, rowNum) -> rs.getString("name")
        );
        if (columns == null || columns.contains(column)) {
            return;
        }
        jdbcTemplate.execute("ALTER TABLE comments ADD COLUMN " + column + " " + type);
    }

    /**
     * 将 weekly_reports 表中 JSON 格式的 comments 迁移到独立表
     * 只执行一次：如果 comments 表已有数据则跳过
     */
    private void migrateCommentsFromReportTable() {
        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM comments", Integer.class);
        if (count != null && count > 0) {
            return; // 已迁移过
        }

        List<Map<String, Object>> reports = jdbcTemplate.query(
                "SELECT id, comments FROM weekly_reports WHERE comments IS NOT NULL AND comments != 'null' AND comments != '[]'",
                (rs, rowNum) -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("id", rs.getString("id"));
                    map.put("comments", rs.getString("comments"));
                    return map;
                }
        );

        int migratedCount = 0;
        for (Map<String, Object> report : reports) {
            String reportId = (String) report.get("id");
            String commentsJson = (String) report.get("comments");
            if (commentsJson == null || commentsJson.isBlank()) continue;

            try {
                List<Map<String, Object>> comments = objectMapper.readValue(commentsJson, new TypeReference<>() {});
                for (Map<String, Object> comment : comments) {
                    insertCommentFromMap(reportId, comment);
                    migratedCount++;
                }
            } catch (Exception e) {
                System.err.println("迁移批注失败 reportId=" + reportId + ": " + e.getMessage());
            }
        }

        if (migratedCount > 0) {
            System.out.println("✅ 已从 weekly_reports 迁移 " + migratedCount + " 条批注到独立表");
        }
    }

    @SuppressWarnings("unchecked")
    private void insertCommentFromMap(String reportId, Map<String, Object> comment) throws JsonProcessingException {
        String id = (String) comment.getOrDefault("id", UUID.randomUUID().toString());
        String authorId = (String) comment.get("authorId");
        String authorName = (String) comment.get("authorName");
        String authorAvatar = (String) comment.get("authorAvatar");
        String authorColor = (String) comment.get("authorColor");
        String content = (String) comment.get("content");
        String targetText = (String) comment.get("targetText");
        String targetBlock = (String) comment.get("targetBlock");
        Integer targetStart = (Integer) comment.get("targetStart");
        Integer targetEnd = (Integer) comment.get("targetEnd");
        String targetTaskId = (String) comment.get("targetTaskId");
        List<String> mentionIds = (List<String>) comment.get("mentionIds");
        List<String> readBy = (List<String>) comment.get("readBy");
        Boolean resolved = (Boolean) comment.getOrDefault("resolved", false);
        String createdAt = (String) comment.getOrDefault("createdAt", Instant.now().toString());
        String updatedAt = (String) comment.getOrDefault("updatedAt", createdAt);

        // 先插入顶层评论
        jdbcTemplate.update("""
            INSERT INTO comments (id, report_id, parent_id, author_id, author_name, author_avatar, author_color,
                content, target_text, target_block, target_start, target_end, target_task_id, mention_ids, read_by, resolved, created_at, updated_at)
            VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                id, reportId, authorId, authorName, authorAvatar, authorColor,
                content, targetText, targetBlock, targetStart, targetEnd, targetTaskId,
                toJson(mentionIds), toJson(readBy),
                resolved != null && resolved ? 1 : 0,
                createdAt, updatedAt
        );

        // 插入回复
        List<Map<String, Object>> replies = (List<Map<String, Object>>) comment.get("replies");
        if (replies != null) {
            for (Map<String, Object> reply : replies) {
                String replyId = (String) reply.getOrDefault("id", UUID.randomUUID().toString());
                String replyAuthorId = (String) reply.get("authorId");
                String replyAuthorName = (String) reply.get("authorName");
                String replyAuthorAvatar = (String) reply.get("authorAvatar");
                String replyAuthorColor = (String) reply.get("authorColor");
                String replyContent = (String) reply.get("content");
                List<String> replyMentionIds = (List<String>) reply.get("mentionIds");
                List<String> replyReadBy = (List<String>) reply.get("readBy");
                Boolean replyResolved = (Boolean) reply.getOrDefault("resolved", false);
                String replyCreatedAt = (String) reply.getOrDefault("createdAt", Instant.now().toString());

                jdbcTemplate.update("""
                    INSERT INTO comments (id, report_id, parent_id, author_id, author_name, author_avatar, author_color,
                        content, target_text, target_block, mention_ids, read_by, resolved, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)
                    """,
                        replyId, reportId, id, replyAuthorId, replyAuthorName, replyAuthorAvatar, replyAuthorColor,
                        replyContent,
                        toJson(replyMentionIds), toJson(replyReadBy),
                        replyResolved != null && replyResolved ? 1 : 0,
                        replyCreatedAt, replyCreatedAt
                );
            }
        }
    }

    /**
     * 全量评论轻量列表（通知派生用）：仅评论字段 + 所属周/科室，
     * 替代前端每 30 秒拉取 1.8MB 全量周报的做法（性能优化 2026-09-15）。
     */
    public List<Map<String, Object>> getCommentFeed() {
        return jdbcTemplate.query("""
                SELECT c.id, c.report_id, c.parent_id, c.author_id, c.author_name,
                       c.content, c.mention_ids, c.created_at, w.week_label, w.dept
                FROM comments c
                JOIN weekly_reports w ON c.report_id = w.id
                WHERE w.deleted_at IS NULL
                ORDER BY c.created_at DESC
                """,
                (rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id"));
                    m.put("reportId", rs.getString("report_id"));
                    m.put("parentId", rs.getString("parent_id"));
                    m.put("authorId", rs.getString("author_id"));
                    m.put("authorName", rs.getString("author_name"));
                    m.put("content", rs.getString("content"));
                    m.put("mentionIds", parseJsonArray(rs.getString("mention_ids")));
                    m.put("createdAt", rs.getString("created_at"));
                    m.put("weekLabel", rs.getString("week_label"));
                    m.put("dept", rs.getString("dept"));
                    return m;
                });
    }

    private List<String> parseJsonArray(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    public List<Map<String, Object>> getCommentsByReportId(String reportId) {
        // 查询所有属于该报告的评论（含回复）
        List<Map<String, Object>> all = jdbcTemplate.query(
                "SELECT * FROM comments WHERE report_id = ? ORDER BY created_at ASC",
                (rs, rowNum) -> mapCommentRow(rs),
                reportId
        );

        // 先收集所有顶层评论，建立 id -> replies 列表的映射
        List<Map<String, Object>> topLevel = new ArrayList<>();
        Map<String, List<Map<String, Object>>> replyMap = new LinkedHashMap<>();

        for (Map<String, Object> c : all) {
            String parentId = (String) c.get("parentId");
            if (parentId == null || parentId.isBlank()) {
                List<Map<String, Object>> replies = new ArrayList<>();
                c.put("replies", replies);
                topLevel.add(c);
                replyMap.put((String) c.get("id"), replies);
            }
        }

        // 再次遍历，把回复挂到对应的父评论下
        for (Map<String, Object> c : all) {
            String parentId = (String) c.get("parentId");
            if (parentId != null && !parentId.isBlank()) {
                List<Map<String, Object>> parentReplies = replyMap.get(parentId);
                if (parentReplies != null) {
                    parentReplies.add(c);
                }
            }
        }

        return topLevel;
    }

    public void addComment(String reportId, Map<String, Object> comment) throws JsonProcessingException {
        String id = (String) comment.getOrDefault("id", UUID.randomUUID().toString());
        String authorId = (String) comment.get("authorId");
        String authorName = (String) comment.get("authorName");
        String authorAvatar = (String) comment.get("authorAvatar");
        String authorColor = (String) comment.get("authorColor");
        String content = (String) comment.get("content");
        String targetText = (String) comment.get("targetText");
        String targetBlock = (String) comment.get("targetBlock");
        Integer targetStart = (Integer) comment.get("targetStart");
        Integer targetEnd = (Integer) comment.get("targetEnd");
        String targetTaskId = (String) comment.get("targetTaskId");
        Object mentionIds = comment.get("mentionIds");
        Object readBy = comment.get("readBy");
        Boolean resolved = (Boolean) comment.getOrDefault("resolved", false);
        String createdAt = (String) comment.getOrDefault("createdAt", Instant.now().toString());

        jdbcTemplate.update("""
            INSERT INTO comments (id, report_id, parent_id, author_id, author_name, author_avatar, author_color,
                content, target_text, target_block, target_start, target_end, target_task_id, mention_ids, read_by, resolved, created_at, updated_at)
            VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                id, reportId, authorId, authorName, authorAvatar, authorColor,
                content, targetText, targetBlock, targetStart, targetEnd, targetTaskId,
                toJson(mentionIds), toJson(readBy),
                resolved != null && resolved ? 1 : 0,
                createdAt, createdAt
        );
    }

    public void addReply(String reportId, String parentId, Map<String, Object> reply) throws JsonProcessingException {
        String id = (String) reply.getOrDefault("id", UUID.randomUUID().toString());
        String authorId = (String) reply.get("authorId");
        String authorName = (String) reply.get("authorName");
        String authorAvatar = (String) reply.get("authorAvatar");
        String authorColor = (String) reply.get("authorColor");
        String content = (String) reply.get("content");
        Object mentionIds = reply.get("mentionIds");
        Object readBy = reply.get("readBy");
        Boolean resolved = (Boolean) reply.getOrDefault("resolved", false);
        String createdAt = (String) reply.getOrDefault("createdAt", Instant.now().toString());

        jdbcTemplate.update("""
            INSERT INTO comments (id, report_id, parent_id, author_id, author_name, author_avatar, author_color,
                content, target_text, target_block, mention_ids, read_by, resolved, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)
            """,
                id, reportId, parentId, authorId, authorName, authorAvatar, authorColor,
                content,
                toJson(mentionIds), toJson(readBy),
                resolved != null && resolved ? 1 : 0,
                createdAt, createdAt
        );
    }

    public void deleteComment(String commentId) {
        // 先删除所有回复，再删除顶层评论
        jdbcTemplate.update("DELETE FROM comments WHERE parent_id = ?", commentId);
        jdbcTemplate.update("DELETE FROM comments WHERE id = ?", commentId);
    }

    public void deleteReply(String replyId) {
        jdbcTemplate.update("DELETE FROM comments WHERE id = ?", replyId);
    }

    public void toggleResolved(String commentId, boolean resolved) {
        jdbcTemplate.update(
                "UPDATE comments SET resolved = ?, updated_at = ? WHERE id = ?",
                resolved ? 1 : 0, Instant.now().toString(), commentId
        );
    }

    public String getReportIdByCommentId(String commentId) {
        List<String> results = jdbcTemplate.query(
                "SELECT report_id FROM comments WHERE id = ?",
                (rs, rowNum) -> rs.getString("report_id"),
                commentId
        );
        return results.isEmpty() ? null : results.get(0);
    }

    public String getCommentAuthorId(String commentId) {
        List<String> results = jdbcTemplate.query(
                "SELECT author_id FROM comments WHERE id = ?",
                (rs, rowNum) -> rs.getString("author_id"),
                commentId
        );
        return results.isEmpty() ? null : results.get(0);
    }

    private Map<String, Object> mapCommentRow(ResultSet rs) throws SQLException {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", rs.getString("id"));
        map.put("reportId", rs.getString("report_id"));
        map.put("parentId", rs.getString("parent_id"));
        map.put("authorId", rs.getString("author_id"));
        map.put("authorName", rs.getString("author_name"));
        map.put("authorAvatar", rs.getString("author_avatar"));
        map.put("authorColor", rs.getString("author_color"));
        map.put("content", rs.getString("content"));
        map.put("targetText", rs.getString("target_text"));
        map.put("targetBlock", rs.getString("target_block"));
        int targetStart = rs.getInt("target_start");
        if (!rs.wasNull()) map.put("targetStart", targetStart);
        int targetEnd = rs.getInt("target_end");
        if (!rs.wasNull()) map.put("targetEnd", targetEnd);
        map.put("targetTaskId", rs.getString("target_task_id"));
        map.put("mentionIds", fromJson(rs.getString("mention_ids"), new TypeReference<List<String>>() {}));
        map.put("readBy", fromJson(rs.getString("read_by"), new TypeReference<List<String>>() {}));
        map.put("resolved", rs.getInt("resolved") == 1);
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
