package com.hr.backend.dto;

import java.util.List;
import java.util.Map;

public class AiSummaryRequest {

    private String weekLabel;
    private String dept;
    private String plan;
    private String currentWork;
    private String nextPlan;
    private String thoughts;
    private String other;
    private List<Map<String, Object>> content;
    private String prevNextPlan;

    public String getWeekLabel() {
        return weekLabel;
    }

    public void setWeekLabel(String weekLabel) {
        this.weekLabel = weekLabel;
    }

    public String getDept() {
        return dept;
    }

    public void setDept(String dept) {
        this.dept = dept;
    }

    public String getPlan() {
        return plan;
    }

    public void setPlan(String plan) {
        this.plan = plan;
    }

    public String getCurrentWork() {
        return currentWork;
    }

    public void setCurrentWork(String currentWork) {
        this.currentWork = currentWork;
    }

    public String getNextPlan() {
        return nextPlan;
    }

    public void setNextPlan(String nextPlan) {
        this.nextPlan = nextPlan;
    }

    public String getThoughts() {
        return thoughts;
    }

    public void setThoughts(String thoughts) {
        this.thoughts = thoughts;
    }

    public String getOther() {
        return other;
    }

    public void setOther(String other) {
        this.other = other;
    }

    public List<Map<String, Object>> getContent() {
        return content;
    }

    public void setContent(List<Map<String, Object>> content) {
        this.content = content;
    }

    public String getPrevNextPlan() {
        return prevNextPlan;
    }

    public void setPrevNextPlan(String prevNextPlan) {
        this.prevNextPlan = prevNextPlan;
    }
}
