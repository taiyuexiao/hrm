package com.hr.backend.controller;

import com.hr.backend.entity.Suggestion;
import com.hr.backend.service.SuggestionService;
import com.hr.backend.util.PermissionChecker;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/suggestions")
public class SuggestionController {

    @Autowired
    private SuggestionService suggestionService;

    @PostMapping
    public Map<String, Object> createSuggestion(
            @RequestBody Map<String, String> request,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {

        Map<String, Object> result = new HashMap<>();
        if (currentUser == null) {
            result.put("success", false);
            result.put("message", "未登录");
            return result;
        }

        String content = request.get("content");
        if (content == null || content.trim().isEmpty()) {
            result.put("success", false);
            result.put("message", "建议内容不能为空");
            return result;
        }

        if (content.length() > 5000) {
            result.put("success", false);
            result.put("message", "建议内容不能超过 5000 字");
            return result;
        }

        Suggestion suggestion = suggestionService.createSuggestion(currentUser, content.trim());
        result.put("success", true);
        result.put("message", "建议已提交，感谢反馈");
        result.put("data", suggestion);
        return result;
    }

    @GetMapping
    public Map<String, Object> listSuggestions(
            @RequestParam(required = false, defaultValue = "1") int page,
            @RequestParam(required = false, defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {

        Map<String, Object> result = new HashMap<>();
        if (currentUser == null) {
            result.put("success", false);
            result.put("message", "未登录");
            return result;
        }

        if (!PermissionChecker.isSuperAdmin(currentUser)) {
            result.put("success", false);
            result.put("message", "无权限，仅系统管理员可查看");
            return result;
        }

        if (page < 1) page = 1;
        if (size < 1) size = 20;
        if (size > 100) size = 100;

        List<Suggestion> list = suggestionService.listSuggestions(status, keyword, page, size);
        int total = suggestionService.countSuggestions(status, keyword);

        result.put("success", true);
        result.put("data", list);
        result.put("total", total);
        result.put("page", page);
        result.put("size", size);
        return result;
    }

    @PutMapping("/{id}")
    public Map<String, Object> updateSuggestion(
            @PathVariable Long id,
            @RequestBody Map<String, String> request,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {

        Map<String, Object> result = new HashMap<>();
        if (currentUser == null) {
            result.put("success", false);
            result.put("message", "未登录");
            return result;
        }

        if (!PermissionChecker.isSuperAdmin(currentUser)) {
            result.put("success", false);
            result.put("message", "无权限，仅系统管理员可操作");
            return result;
        }

        String status = request.get("status");
        String adminReply = request.get("adminReply");

        if (status == null || status.trim().isEmpty()) {
            result.put("success", false);
            result.put("message", "状态不能为空");
            return result;
        }

        Suggestion updated = suggestionService.updateStatus(id, status.trim(), adminReply);
        if (updated == null) {
            result.put("success", false);
            result.put("message", "建议不存在");
            return result;
        }

        result.put("success", true);
        result.put("data", updated);
        return result;
    }
}
