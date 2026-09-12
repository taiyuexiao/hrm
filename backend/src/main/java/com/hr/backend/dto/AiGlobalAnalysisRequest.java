package com.hr.backend.dto;

import java.util.List;

public class AiGlobalAnalysisRequest {

    private String weekLabel;
    private String compareWeekLabel;
    private String focusStartWeekLabel;
    private String prompt;
    private List<DeptReport> reports;

    public String getWeekLabel() {
        return weekLabel;
    }

    public void setWeekLabel(String weekLabel) {
        this.weekLabel = weekLabel;
    }

    public String getCompareWeekLabel() {
        return compareWeekLabel;
    }

    public void setCompareWeekLabel(String compareWeekLabel) {
        this.compareWeekLabel = compareWeekLabel;
    }

    public String getFocusStartWeekLabel() {
        return focusStartWeekLabel;
    }

    public void setFocusStartWeekLabel(String focusStartWeekLabel) {
        this.focusStartWeekLabel = focusStartWeekLabel;
    }

    public String getPrompt() {
        return prompt;
    }

    public void setPrompt(String prompt) {
        this.prompt = prompt;
    }

    public List<DeptReport> getReports() {
        return reports;
    }

    public void setReports(List<DeptReport> reports) {
        this.reports = reports;
    }

    public static class DeptReport {
        private String dept;
        private String currentContent;
        private String currentWork;
        private String nextPlan;
        private String prevNextPlan;

        public String getDept() {
            return dept;
        }

        public void setDept(String dept) {
            this.dept = dept;
        }

        public String getCurrentContent() {
            return currentContent;
        }

        public void setCurrentContent(String currentContent) {
            this.currentContent = currentContent;
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

        public String getPrevNextPlan() {
            return prevNextPlan;
        }

        public void setPrevNextPlan(String prevNextPlan) {
            this.prevNextPlan = prevNextPlan;
        }
    }
}
