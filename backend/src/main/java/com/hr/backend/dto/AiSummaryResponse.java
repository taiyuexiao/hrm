package com.hr.backend.dto;

import java.util.List;

public class AiSummaryResponse {

    private String summary;
    private int completionRate;
    private List<String> completed;
    private List<String> delayed;
    private List<String> risks;
    private List<String> highlights;

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public int getCompletionRate() {
        return completionRate;
    }

    public void setCompletionRate(int completionRate) {
        this.completionRate = completionRate;
    }

    public List<String> getCompleted() {
        return completed;
    }

    public void setCompleted(List<String> completed) {
        this.completed = completed;
    }

    public List<String> getDelayed() {
        return delayed;
    }

    public void setDelayed(List<String> delayed) {
        this.delayed = delayed;
    }

    public List<String> getRisks() {
        return risks;
    }

    public void setRisks(List<String> risks) {
        this.risks = risks;
    }

    public List<String> getHighlights() {
        return highlights;
    }

    public void setHighlights(List<String> highlights) {
        this.highlights = highlights;
    }
}
