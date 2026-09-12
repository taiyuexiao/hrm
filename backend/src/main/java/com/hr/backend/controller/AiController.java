package com.hr.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hr.backend.dto.AiGlobalAnalysisRequest;
import com.hr.backend.dto.AiSummaryRequest;
import com.hr.backend.dto.AiSummaryResponse;
import com.hr.backend.service.LlmService;
import com.hr.backend.util.PermissionChecker;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    @Autowired
    private LlmService llmService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 将 Excel 中杂乱的周报文本解析为规范层级序号文本
     */
    @PostMapping("/parse-text")
    public Map<String, Object> parseText(@RequestBody Map<String, Object> request) {
        String thisWeekRoutine = toPlainString(request.get("thisWeekRoutine"));
        String thisWeekKey = toPlainString(request.get("thisWeekKey"));
        String nextWeekRoutine = toPlainString(request.get("nextWeekRoutine"));
        String nextWeekKey = toPlainString(request.get("nextWeekKey"));

        boolean allEmpty = thisWeekRoutine.isEmpty() && thisWeekKey.isEmpty()
                && nextWeekRoutine.isEmpty() && nextWeekKey.isEmpty();
        if (allEmpty) {
            return Map.of(
                    "success", true,
                    "thisWeekRoutine", "",
                    "thisWeekKey", "",
                    "nextWeekRoutine", "",
                    "nextWeekKey", ""
            );
        }

        String system = "你是一位企业周报格式整理专家。你的任务是把用户从 Excel 粘贴来的、格式混乱的周报文本，整理成层级清晰的规范序号列表。";
        String prompt = buildParsePrompt(thisWeekRoutine, thisWeekKey, nextWeekRoutine, nextWeekKey);

        try {
            String rawText = llmService.chatCompletion(system, prompt, 2000);
            String jsonStr = rawText.replaceAll("```json\\s*", "").replaceAll("```\\s*$", "").trim();
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(jsonStr, Map.class);

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("thisWeekRoutine", toPlainString(parsed.get("thisWeekRoutine")));
            result.put("thisWeekKey", toPlainString(parsed.get("thisWeekKey")));
            result.put("nextWeekRoutine", toPlainString(parsed.get("nextWeekRoutine")));
            result.put("nextWeekKey", toPlainString(parsed.get("nextWeekKey")));
            return result;
        } catch (Exception e) {
            return Map.of("success", false, "message", "解析失败: " + e.getMessage());
        }
    }

    private String buildParsePrompt(String thisWeekRoutine, String thisWeekKey,
                                    String nextWeekRoutine, String nextWeekKey) {
        return "请将以下四段周报文本分别整理为规范的层级序号列表。要求：\n" +
                "1. 四段文本必须严格对应下面的四个 key，不要互相混淆或合并；\n" +
                "2. 层级格式统一为：一级用 \"1. \"、二级用 \"（1）\"、三级用 \"①\"，以此类推；\n" +
                "3. 每个条目必须独占一行，下级条目必须另起一行，绝对不要和上级写在同一行；\n" +
                "4. 只保留有效的工作事项，去除空行、重复序号、无意义换行；\n" +
                "5. 每个分类如果原文为空，则输出空字符串；\n" +
                "6. 不要输出任何解释，只输出严格 JSON，且不要 markdown 代码块。\n\n" +
                "输出格式（必须是合法 JSON）：\n" +
                "{\n" +
                "  \"thisWeekRoutine\": \"本周工作内容（日常工作）的规范列表\",\n" +
                "  \"thisWeekKey\": \"重点工作推进情况（本周）的规范列表\",\n" +
                "  \"nextWeekRoutine\": \"下周工作计划（日常工作）的规范列表\",\n" +
                "  \"nextWeekKey\": \"重点工作推进情况（下周）的规范列表\"\n" +
                "}\n\n" +
                "【thisWeekRoutine】\n" + defaultEmpty(thisWeekRoutine) + "\n\n" +
                "【thisWeekKey】\n" + defaultEmpty(thisWeekKey) + "\n\n" +
                "【nextWeekRoutine】\n" + defaultEmpty(nextWeekRoutine) + "\n\n" +
                "【nextWeekKey】\n" + defaultEmpty(nextWeekKey);
    }

    private String toPlainString(Object value) {
        return value == null ? "" : value.toString().trim();
    }

    /**
     * AI 单科室周报总结
     */
    @PostMapping("/summary")
    public Map<String, Object> summarize(@RequestBody AiSummaryRequest request,
                                         @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {
        if (!PermissionChecker.hasPermission(currentUser, "AI_SUMMARY")) {
            return Map.of("success", false, "message", "无 AI 总结权限");
        }

        String contentText = flattenTasks(request.getContent());
        String text = String.join("\n", Arrays.asList(
                request.getPlan(),
                contentText,
                request.getNextPlan()
        )).trim();

        if (text.isEmpty()) {
            return Map.of("success", false, "message", "内容为空，无法分析");
        }

        String prevNextPlan = request.getPrevNextPlan() == null ? "无上周数据" : request.getPrevNextPlan();

        String prompt = buildSummaryPrompt(request, contentText, prevNextPlan);
        String system = "你是数据部门的管理顾问，擅长周报分析。请严格按照要求的 JSON 格式输出，不要添加 markdown 代码块。";

        try {
            String rawText = llmService.chatCompletion(system, prompt, 800);
            AiSummaryResponse result = parseSummaryResponse(rawText);
            return Map.of(
                    "success", true,
                    "summary", result.getSummary(),
                    "aiAnalysis", result
            );
        } catch (Exception e) {
            return Map.of("success", false, "message", "AI 分析失败: " + e.getMessage());
        }
    }

    /**
     * AI 全局分析（支持自选两周对比 + 自定义提示词 + 重点工作起点）
     */
    @PostMapping("/global-analysis")
    public Map<String, Object> globalAnalysis(@RequestBody AiGlobalAnalysisRequest request,
                                              @RequestAttribute(value = "currentUser", required = false) Map<String, Object> currentUser) {
        if (!PermissionChecker.hasPermission(currentUser, "AI_GLOBAL_ANALYSIS")) {
            return Map.of("success", false, "message", "无 AI 全局分析权限");
        }

        List<AiGlobalAnalysisRequest.DeptReport> reports = request.getReports();
        if (reports == null || reports.isEmpty()) {
            return Map.of("success", false, "message", "当前周没有周报数据");
        }

        String weekLabel = request.getWeekLabel();
        String compareWeekLabel = request.getCompareWeekLabel();
        String focusStartWeekLabel = request.getFocusStartWeekLabel();
        String customPrompt = request.getPrompt();

        String prompt = (customPrompt == null || customPrompt.isBlank())
                ? DEFAULT_GLOBAL_ANALYSIS_PROMPT_TEMPLATE
                : customPrompt;
        prompt = fillGlobalAnalysisPrompt(prompt, weekLabel, compareWeekLabel, focusStartWeekLabel, reports);

        String system = "你是数据部门的高级管理顾问，擅长周报全局分析。请严格按照要求的 Markdown 格式输出，不要添加代码块标记。";

        try {
            String result = llmService.chatCompletion(system, prompt, 4000);
            return Map.of("success", true, "result", result);
        } catch (Exception e) {
            return Map.of("success", false, "message", "AI 全局分析失败: " + e.getMessage());
        }
    }

    private String buildSummaryPrompt(AiSummaryRequest request, String contentText, String prevNextPlan) {
        return "你是一位数据部门的管理顾问，擅长周报分析与交叉周对比。\n\n" +
                "请对以下工作周报进行分析，并返回严格的 JSON 格式：\n\n" +
                "【本周数据】\n" +
                "- 本周计划：" + defaultEmpty(request.getPlan()) + "\n" +
                "- 本周内容：" + contentText + "\n" +
                "- 下周计划：" + defaultEmpty(request.getNextPlan()) + "\n\n" +
                "【最近一期计划回顾】\n" +
                prevNextPlan + "\n\n" +
                "请输出以下 JSON 结构（不要添加 markdown 代码块标记）：\n" +
                "{\n" +
                "  \"summary\": \"200字以内的精炼总结\",\n" +
                "  \"completionRate\": 0-100的数字,\n" +
                "  \"completed\": [\"已完成的具体事项1\", \"已完成的具体事项2\"],\n" +
                "  \"delayed\": [\"延迟的具体事项1\"],\n" +
                "  \"risks\": [\"风险预警1\"]\n" +
                "}\n\n" +
                "分析要求：\n" +
                "1. summary: 精炼概括本周工作重点与进展\n" +
                "2. completionRate: 对比最近一期\"下周计划\"与本周\"本周内容\"，估算计划完成百分比\n" +
                "3. completed: 列出本周实际完成的关键事项\n" +
                "4. delayed: 列出计划中有但未完成或延迟的事项\n" +
                "5. risks: 识别潜在风险（如工作负荷不均、关键任务延迟、资源不足等）";
    }

    private static final String DEFAULT_GLOBAL_ANALYSIS_PROMPT_TEMPLATE = """
你是一位数据部门的高级管理顾问，擅长周报全局分析与战略洞察。

请对以下所有科室的周报进行全局分析，输出格式必须严格遵循以下 Markdown 格式（不要添加代码块标记）：

# {baseWeekLabel} 周报全局分析

## 一、各科室完成度与偏离度

| 科室 | 偏离度 | 核心判断 |
|------|--------|----------|
{tableRows}

## 二、{focusStartWeekLabel}→{baseWeekLabel} 重点工作整体推进

[请分析从{focusStartWeekLabel}至今的重点工作推进情况，每个重点工作一段，格式如：**工作名称**：进展描述。]

## 三、{baseWeekLabel}「三句话关键结论」

**本周相对本周计划**：[分析本周实际完成情况与计划的对比]

**{focusStartWeekLabel} 以来阶段主线**：[总结从{focusStartWeekLabel}以来的主要工作主线和变化趋势]

**盯盘清单**：[列出需要重点关注的科室和事项]

---

**分析要求：**

1. **偏离度评判**：根据本周实际工作与"{compareWeekLabel}"下周计划的对比，评判为：绿、绿黄、黄、黄红、红 五档
   - 绿：完全按计划推进，无偏离
   - 绿黄：基本按计划，有轻微偏离
   - 黄：部分偏离，有未完成项
   - 黄红：明显偏离，多项未完成
   - 红：严重偏离，大部分未完成

2. **核心判断**：简要说明评判依据，指出完成的关键事项和未完成/延迟的事项

3. **重点工作推进**：识别跨科室的重点工作主线，分析整体推进情况

4. **三句话结论**：
   - 第一句：本周整体完成情况
   - 第二句：阶段性主线工作总结
   - 第三句：需要重点盯盘的科室和事项

**周报数据：**

{deptDetails}
""";

    private String buildGlobalAnalysisTableRows(List<AiGlobalAnalysisRequest.DeptReport> reports) {
        return reports.stream()
                .map(r -> "| " + r.getDept() + " | [待分析] | [待分析] |")
                .collect(Collectors.joining("\n"));
    }

    private String buildGlobalAnalysisDeptDetails(List<AiGlobalAnalysisRequest.DeptReport> reports) {
        return reports.stream()
                .map(d -> "### " + d.getDept() + "\n" +
                        "**对比周期下周工作计划：**\n" +
                        defaultEmpty(d.getPrevNextPlan()) + "\n\n" +
                        "**本周实际完成：**\n" +
                        defaultEmpty(d.getCurrentContent()) + "\n" +
                        defaultEmpty(d.getCurrentWork()) + "\n\n" +
                        "**本周下周计划：**\n" +
                        defaultEmpty(d.getNextPlan()))
                .collect(Collectors.joining("\n---\n"));
    }

    private String fillGlobalAnalysisPrompt(String prompt, String baseWeekLabel, String compareWeekLabel,
                                            String focusStartWeekLabel, List<AiGlobalAnalysisRequest.DeptReport> reports) {
        return prompt
                .replace("{baseWeekLabel}", defaultEmpty(baseWeekLabel))
                .replace("{compareWeekLabel}", defaultEmpty(compareWeekLabel))
                .replace("{focusStartWeekLabel}", defaultEmpty(focusStartWeekLabel))
                .replace("{tableRows}", buildGlobalAnalysisTableRows(reports))
                .replace("{deptDetails}", buildGlobalAnalysisDeptDetails(reports));
    }

    private AiSummaryResponse parseSummaryResponse(String rawText) {
        AiSummaryResponse resp = new AiSummaryResponse();
        resp.setCompletionRate(70);
        resp.setCompleted(new ArrayList<>());
        resp.setDelayed(new ArrayList<>());
        resp.setRisks(new ArrayList<>());
        resp.setHighlights(new ArrayList<>());

        String jsonStr = rawText.replaceAll("```json\\s*", "").replaceAll("```\\s*$", "").trim();
        try {
            Map<String, Object> parsed = new com.fasterxml.jackson.databind.ObjectMapper().readValue(jsonStr, Map.class);
            resp.setSummary(Objects.toString(parsed.get("summary"), rawText));
            Object rate = parsed.get("completionRate");
            if (rate instanceof Number) {
                int r = ((Number) rate).intValue();
                resp.setCompletionRate(Math.min(100, Math.max(0, r)));
            }
            resp.setCompleted(toStringList(parsed.get("completed")));
            resp.setDelayed(toStringList(parsed.get("delayed")));
            resp.setRisks(toStringList(parsed.get("risks")));
        } catch (Exception e) {
            resp.setSummary(rawText);
        }
        return resp;
    }

    @SuppressWarnings("unchecked")
    private List<String> toStringList(Object obj) {
        if (obj instanceof List) {
            return ((List<Object>) obj).stream()
                    .map(Objects::toString)
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.toList());
        }
        return new ArrayList<>();
    }

    @SuppressWarnings("unchecked")
    private String flattenTasks(List<Map<String, Object>> tasks) {
        if (tasks == null) return "";
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> task : tasks) {
            appendTask(task, sb, "");
        }
        return sb.toString().trim();
    }

    @SuppressWarnings("unchecked")
    private void appendTask(Map<String, Object> task, StringBuilder sb, String indent) {
        Object text = task.get("text");
        if (text != null) {
            sb.append(indent).append(text.toString()).append("\n");
        }
        Object children = task.get("children");
        if (children instanceof List) {
            for (Map<String, Object> child : (List<Map<String, Object>>) children) {
                appendTask(child, sb, indent + "  ");
            }
        }
    }

    private String defaultEmpty(String value) {
        return value == null || value.trim().isEmpty() ? "无" : value;
    }
}
