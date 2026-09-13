package com.hr.backend.controller;

import com.hr.backend.dao.DeptDao;
import com.hr.backend.dao.UserDao;
import com.hr.backend.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 科室管理：清单查询（登录即可）+ 新增（superadmin 角色或 USER_MANAGE 权限，与账号管理同级）
 * 不支持删除/改名——历史周报、通知、建议中的科室名会成为孤儿数据
 */
@RestController
@RequestMapping("/api/depts")
public class DeptController {

    @Autowired
    private DeptDao deptDao;

    @Autowired
    private UserDao userDao;

    @GetMapping
    public Map<String, Object> list() {
        Map<String, Object> result = new HashMap<>();
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getName())) {
            result.put("success", false);
            result.put("code", "UNAUTHORIZED");
            result.put("message", "未登录");
            return result;
        }
        result.put("success", true);
        result.put("depts", deptDao.findAll());
        return result;
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, String> body) {
        Map<String, Object> result = new HashMap<>();
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getName())) {
            result.put("success", false);
            result.put("code", "UNAUTHORIZED");
            result.put("message", "未登录");
            return result;
        }
        User current = userDao.findByUsername(authentication.getName());
        boolean ok = current != null && ("superadmin".equals(current.getRole())
                || (current.getPermissions() != null && current.getPermissions().contains("USER_MANAGE")));
        if (!ok) {
            result.put("success", false);
            result.put("message", "无权限，仅系统管理员可操作");
            return result;
        }

        String name = body.get("name") != null ? body.get("name").trim() : "";
        if (name.isEmpty()) {
            result.put("success", false);
            result.put("message", "科室名称不能为空");
            return result;
        }
        if (name.length() > 30) {
            result.put("success", false);
            result.put("message", "科室名称过长（最多 30 字）");
            return result;
        }
        if (!deptDao.insert(name)) {
            result.put("success", false);
            result.put("message", "科室已存在");
            return result;
        }

        result.put("success", true);
        result.put("message", "科室创建成功");
        return result;
    }
}
