package com.hr.backend.controller;

import com.hr.backend.service.UserActionLogService;
import com.hr.backend.util.PermissionChecker;
import org.springframework.beans.factory.annotation.Autowired;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/action-logs")
public class UserActionLogController {

    @Autowired
    private UserActionLogService userActionLogService;

    @PostMapping("/record")
    public Map<String, Object> recordLog(@RequestBody Map<String, Object> payload,
                                         @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser,
                                         HttpServletRequest request) {
        if (currentUser == null) {
            return Map.of("success", false, "message", "未登录");
        }

        String userId = (String) currentUser.get("id");
        String userName = (String) currentUser.get("name");
        String action = (String) payload.get("action");
        String targetType = (String) payload.get("targetType");
        String targetId = (String) payload.get("targetId");
        String targetDesc = (String) payload.get("targetDesc");
        Object details = payload.get("details");

        userActionLogService.log(userId, userName, action, targetType, targetId, targetDesc, details, getClientIp(request));
        return Map.of("success", true);
    }

    @GetMapping
    public Map<String, Object> queryLogs(
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {

        if (!PermissionChecker.hasPermission(currentUser, "VIEW_ACTION_LOGS")) {
            return Map.of("success", false, "message", "无权限查看行为日志");
        }

        List<Map<String, Object>> logs = userActionLogService.queryLogs(userId, action, targetType, startTime, endTime, page, pageSize);
        int total = userActionLogService.countLogs(userId, action, targetType, startTime, endTime);

        return Map.of(
                "success", true,
                "data", logs,
                "total", total,
                "page", page,
                "pageSize", pageSize
        );
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isBlank()) {
            ip = request.getRemoteAddr();
        }
        return ip;
    }
}
