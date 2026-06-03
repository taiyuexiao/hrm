package com.hr.backend.controller;

import com.hr.backend.dao.UserDao;
import com.hr.backend.entity.User;
import com.hr.backend.utils.JwtUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/auth")
public class AuthController {
    @Autowired
    private UserDao userDao;

    @Autowired
    private JwtUtils jwtUtils;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody User user) {
        Map<String, Object> result = new HashMap<>();

        User existingUser = userDao.findByUsername(user.getUsername());
        if (existingUser == null) {
            result.put("success", false);
            result.put("message", "用户不存在");
            return result;
        }

        if (!passwordEncoder.matches(user.getPassword(), existingUser.getPassword())) {
            result.put("success", false);
            result.put("message", "密码错误");
            return result;
        }

        String token = jwtUtils.generateToken(user.getUsername());

        // 过滤密码后返回用户信息
        Map<String, Object> userMap = new HashMap<>();
        userMap.put("id", existingUser.getId());
        userMap.put("username", existingUser.getUsername());
        userMap.put("name", existingUser.getName());
        userMap.put("role", existingUser.getRole());
        userMap.put("dept", existingUser.getDept());
        userMap.put("status", existingUser.getStatus());

        result.put("success", true);
        result.put("token", token);
        result.put("user", userMap);

        return result;
    }

    @PostMapping("/change-password")
    public Map<String, Object> changePassword(@RequestBody Map<String, String> request) {
        Map<String, Object> result = new HashMap<>();
        String username = request.get("username");
        String oldPassword = request.get("oldPassword");
        String newPassword = request.get("newPassword");

        if (username == null || oldPassword == null || newPassword == null) {
            result.put("success", false);
            result.put("message", "参数不完整");
            return result;
        }

        User existingUser = userDao.findByUsername(username);
        if (existingUser == null) {
            result.put("success", false);
            result.put("message", "用户不存在");
            return result;
        }

        if (!passwordEncoder.matches(oldPassword, existingUser.getPassword())) {
            result.put("success", false);
            result.put("message", "旧密码错误");
            return result;
        }

        userDao.updatePassword(username, passwordEncoder.encode(newPassword));
        result.put("success", true);
        result.put("message", "密码修改成功");
        return result;
    }
}
