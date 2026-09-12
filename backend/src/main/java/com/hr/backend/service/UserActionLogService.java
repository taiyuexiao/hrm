package com.hr.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Service
public class UserActionLogService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    private final Map<String, Long> lastEditLogTime = new HashMap<>();
    private static final long EDIT_THROTTLE_MS = 60_000; // 60 seconds

    public void log(String userId, String userName, String action, String targetType,
                    String targetId, String targetDesc, Object details, String ip) {
        // Throttle edit logs
        if ("edit".equals(action)) {
            String key = userId + ":" + targetId;
            long now = System.currentTimeMillis();
            Long last = lastEditLogTime.get(key);
            if (last != null && (now - last) < EDIT_THROTTLE_MS) {
                return;
            }
            lastEditLogTime.put(key, now);
        }

        String detailsJson = null;
        if (details != null) {
            try {
                detailsJson = objectMapper.writeValueAsString(details);
            } catch (Exception e) {
                detailsJson = details.toString();
            }
        }

        jdbcTemplate.update("""
            INSERT INTO user_action_logs
            (user_id, user_name, action, target_type, target_id, target_desc, details, ip, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                userId, userName, action, targetType, targetId, targetDesc, detailsJson, ip, Instant.now().toString()
        );
    }

    public List<Map<String, Object>> queryLogs(String userId, String action, String targetType,
                                                String startTime, String endTime, int page, int pageSize) {
        StringBuilder sql = new StringBuilder("SELECT * FROM user_action_logs WHERE 1=1");
        List<Object> params = new ArrayList<>();

        if (userId != null && !userId.isBlank()) {
            sql.append(" AND user_id = ?");
            params.add(userId);
        }
        if (action != null && !action.isBlank()) {
            sql.append(" AND action = ?");
            params.add(action);
        }
        if (targetType != null && !targetType.isBlank()) {
            sql.append(" AND target_type = ?");
            params.add(targetType);
        }
        if (startTime != null && !startTime.isBlank()) {
            sql.append(" AND created_at >= ?");
            params.add(startTime);
        }
        if (endTime != null && !endTime.isBlank()) {
            sql.append(" AND created_at <= ?");
            params.add(endTime);
        }

        sql.append(" ORDER BY created_at DESC LIMIT ? OFFSET ?");
        params.add(pageSize);
        params.add((page - 1) * pageSize);

        return jdbcTemplate.query(sql.toString(), params.toArray(), (rs, rowNum) -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", rs.getLong("id"));
            map.put("userId", rs.getString("user_id"));
            map.put("userName", rs.getString("user_name"));
            map.put("action", rs.getString("action"));
            map.put("targetType", rs.getString("target_type"));
            map.put("targetId", rs.getString("target_id"));
            map.put("targetDesc", rs.getString("target_desc"));
            map.put("details", rs.getString("details"));
            map.put("ip", rs.getString("ip"));
            map.put("createdAt", rs.getString("created_at"));
            return map;
        });
    }

    public int countLogs(String userId, String action, String targetType,
                         String startTime, String endTime) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(*) FROM user_action_logs WHERE 1=1");
        List<Object> params = new ArrayList<>();

        if (userId != null && !userId.isBlank()) {
            sql.append(" AND user_id = ?");
            params.add(userId);
        }
        if (action != null && !action.isBlank()) {
            sql.append(" AND action = ?");
            params.add(action);
        }
        if (targetType != null && !targetType.isBlank()) {
            sql.append(" AND target_type = ?");
            params.add(targetType);
        }
        if (startTime != null && !startTime.isBlank()) {
            sql.append(" AND created_at >= ?");
            params.add(startTime);
        }
        if (endTime != null && !endTime.isBlank()) {
            sql.append(" AND created_at <= ?");
            params.add(endTime);
        }

        Integer count = jdbcTemplate.queryForObject(sql.toString(), Integer.class, params.toArray());
        return count != null ? count : 0;
    }

    public Map<String, Object> getLogById(long id) {
        List<Map<String, Object>> rows = jdbcTemplate.query("""
                SELECT * FROM user_action_logs WHERE id = ?
                """, new Object[]{id}, (rs, rowNum) -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", rs.getLong("id"));
            map.put("userId", rs.getString("user_id"));
            map.put("userName", rs.getString("user_name"));
            map.put("action", rs.getString("action"));
            map.put("targetType", rs.getString("target_type"));
            map.put("targetId", rs.getString("target_id"));
            map.put("targetDesc", rs.getString("target_desc"));
            map.put("details", rs.getString("details"));
            map.put("ip", rs.getString("ip"));
            map.put("createdAt", rs.getString("created_at"));
            return map;
        });
        return rows.isEmpty() ? null : rows.get(0);
    }
}
