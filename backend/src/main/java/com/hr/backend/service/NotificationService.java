package com.hr.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * 用户通知服务：持久化存储内容覆盖、@提及等通知。
 */
@Service
public class NotificationService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @PostConstruct
    public void init() {
        createNotificationTableIfNotExists();
    }

    private void createNotificationTableIfNotExists() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                type TEXT,
                title TEXT,
                content TEXT,
                week_label TEXT,
                dept TEXT,
                read INTEGER DEFAULT 0,
                created_at TEXT
            )
            """);
    }

    public void createNotification(String userId, String type, String title, String content,
                                   String weekLabel, String dept) {
        if (userId == null || userId.isBlank()) return;
        String id = UUID.randomUUID().toString().replace("-", "");
        jdbcTemplate.update("""
            INSERT INTO notifications (id, user_id, type, title, content, week_label, dept, read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
                id, userId, type, title, content, weekLabel, dept, Instant.now().toString());
    }

    public List<Map<String, Object>> getNotifications(String userId, boolean unreadOnly) {
        String sql = "SELECT * FROM notifications WHERE user_id = ?";
        if (unreadOnly) {
            sql += " AND read = 0";
        }
        sql += " ORDER BY created_at DESC";
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", rs.getString("id"));
            map.put("userId", rs.getString("user_id"));
            map.put("type", rs.getString("type"));
            map.put("title", rs.getString("title"));
            map.put("content", rs.getString("content"));
            map.put("weekLabel", rs.getString("week_label"));
            map.put("dept", rs.getString("dept"));
            map.put("read", rs.getInt("read") == 1);
            map.put("createdAt", rs.getString("created_at"));
            return map;
        }, userId);
    }

    public void markRead(String notificationId) {
        jdbcTemplate.update("UPDATE notifications SET read = 1 WHERE id = ?", notificationId);
    }

    public void markAllRead(String userId) {
        jdbcTemplate.update("UPDATE notifications SET read = 1 WHERE user_id = ?", userId);
    }
}
