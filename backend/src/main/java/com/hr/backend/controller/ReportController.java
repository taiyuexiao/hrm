package com.hr.backend.controller;

import com.hr.backend.service.ReportService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/reports")
public class ReportController {

    @Autowired
    private ReportService reportService;

    @GetMapping
    public List<Map<String, Object>> getAllReports() {
        return reportService.getAllReports();
    }

    @GetMapping("/{weekLabel}/{dept}")
    public Map<String, Object> getReport(
            @PathVariable String weekLabel,
            @PathVariable String dept) {
        return reportService.getReport(weekLabel, dept);
    }

    @PostMapping
    public Map<String, Object> saveReport(@RequestBody Map<String, Object> report) throws IOException {
        reportService.saveReport(report);
        return Map.of("success", true, "message", "保存成功");
    }

    @DeleteMapping
    public Map<String, Object> clearAll() throws IOException {
        reportService.clearAll();
        return Map.of("success", true, "message", "已清空");
    }
}
