package com.hr.backend.dao;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import jakarta.annotation.PostConstruct;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Repository
public class DeptDao {

    /** 初始科室种子（次序即展示/导出次序，与前端历史 DEPT_ORDER 一致） */
    private static final List<String> SEED_DEPTS = List.of(
            "项目管理", "架构管理", "需求管理",
            "综合管理部", "数据治理部", "信息统计部", "信息管理部", "机构服务团队",
            "数据开发部", "数据平台部", "数据测试部", "研发管理部",
            "智能平台部", "智能应用一部", "智能应用二部"
    );

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void init() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS departments (
                name TEXT PRIMARY KEY,
                sort_order INTEGER NOT NULL,
                created_at TEXT
            )
            """);
        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM departments", Integer.class);
        if (count != null && count == 0) {
            for (int i = 0; i < SEED_DEPTS.size(); i++) {
                jdbcTemplate.update(
                        "INSERT INTO departments (name, sort_order, created_at) VALUES (?, ?, ?)",
                        SEED_DEPTS.get(i), i, LocalDateTime.now().toString());
            }
            System.out.println("✅ 已初始化 " + SEED_DEPTS.size() + " 个科室到 departments 表");
        }
    }

    /** 全部科室，按 sort_order 升序（即展示次序） */
    public List<Map<String, Object>> findAll() {
        return jdbcTemplate.queryForList(
                "SELECT name, sort_order AS sortOrder, created_at AS createdAt FROM departments ORDER BY sort_order");
    }

    public boolean exists(String name) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM departments WHERE name = ?", Integer.class, name);
        return count != null && count > 0;
    }

    /** 新增科室，排在末尾。返回是否插入成功（重名则 false） */
    public boolean insert(String name) {
        if (exists(name)) return false;
        Integer max = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(sort_order), -1) FROM departments", Integer.class);
        jdbcTemplate.update(
                "INSERT INTO departments (name, sort_order, created_at) VALUES (?, ?, ?)",
                name, (max != null ? max : -1) + 1, LocalDateTime.now().toString());
        return true;
    }

    /** 仅用于测试清理等场景 */
    public void deleteByName(String name) {
        jdbcTemplate.update("DELETE FROM departments WHERE name = ?", name);
    }
}
