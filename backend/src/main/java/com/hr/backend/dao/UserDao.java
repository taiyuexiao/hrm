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
        migrateFromJsonIfNeeded();
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
                status INTEGER DEFAULT 1
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
        jdbcTemplate.update("""
            INSERT INTO users (username, password, name, role, dept, status)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
                user.getUsername(),
                user.getPassword(),
                user.getName(),
                user.getRole(),
                user.getDept(),
                user.getStatus()
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
        jdbcTemplate.update("""
            INSERT INTO users (username, password, name, role, dept, status)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
                user.getUsername(),
                user.getPassword(),
                user.getName(),
                user.getRole(),
                user.getDept(),
                user.getStatus() != null ? user.getStatus() : 1
        );
    }

    public void updatePassword(String username, String newPassword) {
        jdbcTemplate.update(
                "UPDATE users SET password = ? WHERE username = ?",
                newPassword, username);
    }

    public void updateUser(User user) {
        jdbcTemplate.update("""
            UPDATE users SET name = ?, role = ?, dept = ?, status = ?
            WHERE username = ?
            """,
                user.getName(),
                user.getRole(),
                user.getDept(),
                user.getStatus(),
                user.getUsername()
        );
    }

    public List<User> findAll() {
        return jdbcTemplate.query("SELECT * FROM users", this::mapRow);
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
        return user;
    }
}
