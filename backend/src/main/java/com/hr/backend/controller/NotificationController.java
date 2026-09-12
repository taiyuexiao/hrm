package com.hr.backend.controller;

import com.hr.backend.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    @Autowired
    private NotificationService notificationService;

    @GetMapping
    public List<Map<String, Object>> getNotifications(
            @RequestParam String userId,
            @RequestParam(required = false, defaultValue = "false") boolean unreadOnly) {
        return notificationService.getNotifications(userId, unreadOnly);
    }

    @PostMapping("/{id}/read")
    public Map<String, Object> markRead(@PathVariable String id) {
        notificationService.markRead(id);
        return Map.of("success", true);
    }

    @PostMapping("/mark-all-read")
    public Map<String, Object> markAllRead(@RequestParam String userId) {
        notificationService.markAllRead(userId);
        return Map.of("success", true);
    }
}
