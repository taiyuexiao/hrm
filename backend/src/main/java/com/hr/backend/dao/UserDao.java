package com.hr.backend.dao;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hr.backend.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

@Repository
public class UserDao {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostConstruct
    public void init() throws IOException {
        createTableIfNotExists();
        migrateAddPasswordPlainColumn();
        migrateAddDailyColumns();
        migrateFromJsonIfNeeded();
    }

    /** 为已有数据库补充日报系统相关列（不存在时）：daily_role / group_id / mentor */
    private void migrateAddDailyColumns() {
        for (String col : new String[]{"daily_role TEXT", "group_id TEXT", "mentor TEXT"}) {
            try {
                jdbcTemplate.execute("ALTER TABLE users ADD COLUMN " + col);
                System.out.println("✅ users 表新增列 " + col);
            } catch (Exception ignored) {
                // 列已存在，忽略
            }
        }
    }

    /** 为已有数据库补充 password_plain 列（不存在时） */
    private void migrateAddPasswordPlainColumn() {
        try {
            jdbcTemplate.execute("ALTER TABLE users ADD COLUMN password_plain TEXT");
            System.out.println("✅ users 表新增 password_plain 列");
        } catch (Exception ignored) {
            // 列已存在，忽略
        }
    }

    private void createTableIfNotExists() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name TEXT,
                role TEXT,
                dept TEXT,
                status INTEGER DEFAULT 1,
                permissions TEXT DEFAULT '[]',
                password_plain TEXT
            )
            """);
    }

    private void migrateFromJsonIfNeeded() throws IOException {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users", Integer.class);
        if (count != null && count > 0) {
            return;
        }

        ClassPathResource resource = new ClassPathResource("users.json");
        if (!resource.exists()) {
            return;
        }

        try (InputStream is = resource.getInputStream()) {
            List<User> users = objectMapper.readValue(is, new TypeReference<List<User>>() {});
            for (User user : users) {
                insertUser(user);
            }
            System.out.println("✅ 已从 JSON 迁移 " + users.size() + " 个用户到 SQLite");
        }
    }

    private void insertUser(User user) {
        String permsJson = "[]";
        try {
            permsJson = objectMapper.writeValueAsString(user.getPermissions() != null ? user.getPermissions() : List.of());
        } catch (Exception ignored) {}

        jdbcTemplate.update("""
            INSERT INTO users (username, password, name, role, dept, status, permissions)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
                user.getUsername(),
                user.getPassword(),
                user.getName(),
                user.getRole(),
                user.getDept(),
                user.getStatus(),
                permsJson
        );
    }

    public User findByUsername(String username) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT * FROM users WHERE username = ?",
                    this::mapRow, username);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }

    public User findById(Long id) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT * FROM users WHERE id = ?",
                    this::mapRow, id);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }

    public void save(User user) {
        String permsJson = "[]";
        try {
            permsJson = objectMapper.writeValueAsString(user.getPermissions() != null ? user.getPermissions() : List.of());
        } catch (Exception ignored) {}

        jdbcTemplate.update("""
            INSERT INTO users (username, password, name, role, dept, status, permissions, password_plain, daily_role, group_id, mentor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                user.getUsername(),
                user.getPassword(),
                user.getName(),
                user.getRole(),
                user.getDept(),
                user.getStatus() != null ? user.getStatus() : 1,
                permsJson,
                user.getPasswordPlain(),
                user.getDailyRole(),
                user.getGroupId(),
                user.getMentor()
        );
    }

    public void updatePassword(String username, String newPassword) {
        updatePassword(username, newPassword, null);
    }

    public void updatePassword(String username, String newPassword, String passwordPlain) {
        jdbcTemplate.update(
                "UPDATE users SET password = ?, password_plain = ? WHERE username = ?",
                newPassword, passwordPlain, username);
    }

    public void updatePasswordPlain(String username, String passwordPlain) {
        jdbcTemplate.update(
                "UPDATE users SET password_plain = ? WHERE username = ?",
                passwordPlain, username);
    }

    public void updateUser(User user) {
        String permsJson = "[]";
        try {
            permsJson = objectMapper.writeValueAsString(user.getPermissions() != null ? user.getPermissions() : List.of());
        } catch (Exception ignored) {}

        jdbcTemplate.update("""
            UPDATE users SET name = ?, role = ?, dept = ?, status = ?, permissions = ?, daily_role = ?, group_id = ?, mentor = ?
            WHERE username = ?
            """,
                user.getName(),
                user.getRole(),
                user.getDept(),
                user.getStatus(),
                permsJson,
                user.getDailyRole(),
                user.getGroupId(),
                user.getMentor(),
                user.getUsername()
        );
    }

    public void updatePermissions(String username, List<String> permissions) {
        String permsJson = "[]";
        try {
            permsJson = objectMapper.writeValueAsString(permissions != null ? permissions : List.of());
        } catch (Exception ignored) {}

        jdbcTemplate.update(
                "UPDATE users SET permissions = ? WHERE username = ?",
                permsJson, username);
    }

    public List<User> findAll() {
        return jdbcTemplate.query("SELECT * FROM users", this::mapRow);
    }

    public void updateUsername(String oldUsername, String newUsername) {
        jdbcTemplate.update(
                "UPDATE users SET username = ? WHERE username = ?",
                newUsername, oldUsername);
    }

    public void deleteByUsername(String username) {
        jdbcTemplate.update("DELETE FROM users WHERE username = ?", username);
    }

    private User mapRow(ResultSet rs, int rowNum) throws SQLException {
        User user = new User();
        user.setId(rs.getLong("id"));
        user.setUsername(rs.getString("username"));
        user.setPassword(rs.getString("password"));
        user.setName(rs.getString("name"));
        user.setRole(rs.getString("role"));
        user.setDept(rs.getString("dept"));
        user.setStatus(rs.getInt("status"));
        try {
            user.setPasswordPlain(rs.getString("password_plain"));
        } catch (SQLException ignored) {
            // 老库无此列
        }
        try {
            user.setDailyRole(rs.getString("daily_role"));
            user.setGroupId(rs.getString("group_id"));
            user.setMentor(rs.getString("mentor"));
        } catch (SQLException ignored) {
            // 老库无日报相关列
        }

        String permsJson = rs.getString("permissions");
        if (permsJson != null && !permsJson.isEmpty()) {
            try {
                List<String> perms = objectMapper.readValue(permsJson, new TypeReference<List<String>>() {});
                user.setPermissions(perms);
            } catch (Exception e) {
                user.setPermissions(List.of());
            }
        } else {
            user.setPermissions(List.of());
        }
        return user;
    }
}
