package com.hr.backend.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * SQLite 并发调优：启用 WAL（读写可并发，配合连接池 >1 生效）。
 * journal_mode 持久化在库文件中，启动时执行一次即可；
 * busy_timeout 由 Hikari connection-init-sql 按连接设置（见 application.yml）。
 */
@Component
public class DatabaseTuning {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void init() {
        try {
            String mode = jdbcTemplate.queryForObject("PRAGMA journal_mode=WAL", String.class);
            System.out.println("✅ SQLite journal_mode=" + mode);
        } catch (Exception e) {
            System.err.println("⚠️ 启用 WAL 失败（不影响启动）: " + e.getMessage());
        }
    }
}
