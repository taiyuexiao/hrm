package com.hr.backend.controller;

import com.hr.backend.service.CommentService;
import com.hr.backend.service.ReportService;
import com.hr.backend.util.PermissionChecker;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class CommentController {

    @Autowired
    private CommentService commentService;

    @Autowired
    private ReportService reportService;

    @GetMapping("/reports/{weekLabel}/{dept}/comments")
    public List<Map<String, Object>> getComments(
            @PathVariable String weekLabel,
            @PathVariable String dept) {
        Map<String, Object> report = reportService.getReport(weekLabel, dept);
        if (report == null) {
            return List.of();
        }
        String reportId = (String) report.get("id");
        return commentService.getCommentsByReportId(reportId);
    }

    @PostMapping("/reports/{weekLabel}/{dept}/comments")
    public Map<String, Object> addComment(
            @PathVariable String weekLabel,
            @PathVariable String dept,
            @RequestBody Map<String, Object> comment,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {
        if (currentUser == null) {
            return Map.of("success", false, "message", "未登录");
        }

        if (!PermissionChecker.canAddComment(currentUser)) {
            return Map.of("success", false, "message", "无权限添加批注");
        }

        Map<String, Object> report = reportService.getReport(weekLabel, dept);
        if (report == null) {
            return Map.of("success", false, "message", "周报不存在");
        }

        String reportId = (String) report.get("id");
        try {
            commentService.addComment(reportId, comment);
            return Map.of("success", true, "message", "批注已添加");
        } catch (Exception e) {
            return Map.of("success", false, "message", "添加失败: " + e.getMessage());
        }
    }

    @PostMapping("/reports/{weekLabel}/{dept}/comments/{parentId}/replies")
    public Map<String, Object> addReply(
            @PathVariable String weekLabel,
            @PathVariable String dept,
            @PathVariable String parentId,
            @RequestBody Map<String, Object> reply,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {
        if (currentUser == null) {
            return Map.of("success", false, "message", "未登录");
        }

        // 所有人都可以回复批注（登录即可）
        Map<String, Object> report = reportService.getReport(weekLabel, dept);
        if (report == null) {
            return Map.of("success", false, "message", "周报不存在");
        }

        String reportId = (String) report.get("id");
        try {
            commentService.addReply(reportId, parentId, reply);
            return Map.of("success", true, "message", "回复已添加");
        } catch (Exception e) {
            return Map.of("success", false, "message", "添加失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/reports/{weekLabel}/{dept}/comments/{commentId}")
    public Map<String, Object> deleteComment(
            @PathVariable String weekLabel,
            @PathVariable String dept,
            @PathVariable String commentId,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {
        if (currentUser == null) {
            return Map.of("success", false, "message", "未登录");
        }

        // 作者可以删除自己发起的评论；否则需要 DELETE_COMMENT 权限
        String commentAuthorId = commentService.getCommentAuthorId(commentId);
        String currentUserId = (String) currentUser.get("username");
        boolean isAuthor = commentAuthorId != null && commentAuthorId.equals(currentUserId);
        if (!isAuthor && !PermissionChecker.canDeleteComment(currentUser)) {
            return Map.of("success", false, "message", "无权限删除批注");
        }

        try {
            commentService.deleteComment(commentId);
            return Map.of("success", true, "message", "评论已删除");
        } catch (Exception e) {
            return Map.of("success", false, "message", "删除失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/reports/{weekLabel}/{dept}/comments/{commentId}/replies/{replyId}")
    public Map<String, Object> deleteReply(
            @PathVariable String weekLabel,
            @PathVariable String dept,
            @PathVariable String commentId,
            @PathVariable String replyId,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {
        if (currentUser == null) {
            return Map.of("success", false, "message", "未登录");
        }

        // 作者可以删除自己发起的回复；否则需要 DELETE_REPLY 权限
        String replyAuthorId = commentService.getCommentAuthorId(replyId);
        String currentUserId = (String) currentUser.get("username");
        boolean isAuthor = replyAuthorId != null && replyAuthorId.equals(currentUserId);
        if (!isAuthor && !PermissionChecker.canDeleteReply(currentUser)) {
            return Map.of("success", false, "message", "无权限删除回复");
        }

        try {
            commentService.deleteReply(replyId);
            return Map.of("success", true, "message", "回复已删除");
        } catch (Exception e) {
            return Map.of("success", false, "message", "删除失败: " + e.getMessage());
        }
    }

    @PutMapping("/reports/{weekLabel}/{dept}/comments/{commentId}/resolve")
    public Map<String, Object> toggleResolved(
            @PathVariable String weekLabel,
            @PathVariable String dept,
            @PathVariable String commentId,
            @RequestBody Map<String, Object> body,
            @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {
        if (currentUser == null) {
            return Map.of("success", false, "message", "未登录");
        }

        if (!PermissionChecker.canResolveComment(currentUser)) {
            return Map.of("success", false, "message", "无权限标记批注状态");
        }

        Boolean resolved = (Boolean) body.getOrDefault("resolved", false);
        try {
            commentService.toggleResolved(commentId, resolved);
            return Map.of("success", true, "message", "状态已更新");
        } catch (Exception e) {
            return Map.of("success", false, "message", "更新失败: " + e.getMessage());
        }
    }
}
