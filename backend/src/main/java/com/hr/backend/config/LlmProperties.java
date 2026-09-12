package com.hr.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "llm")
public class LlmProperties {

    private String baseUrl = "http://10.202.32.20:8180/lm/v2";
    private String apiKey = "";
    private String model = "qwen35-35b-a3b-nothink";
    private String chatCompletionPath = "/chat/completions";
    private int connectTimeout = 10000;
    private int readTimeout = 120000;

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getChatCompletionPath() {
        return chatCompletionPath;
    }

    public void setChatCompletionPath(String chatCompletionPath) {
        this.chatCompletionPath = chatCompletionPath;
    }

    public int getConnectTimeout() {
        return connectTimeout;
    }

    public void setConnectTimeout(int connectTimeout) {
        this.connectTimeout = connectTimeout;
    }

    public int getReadTimeout() {
        return readTimeout;
    }

    public void setReadTimeout(int readTimeout) {
        this.readTimeout = readTimeout;
    }

    public String getChatCompletionUrl() {
        String base = baseUrl == null ? "" : baseUrl.trim();
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        String path = chatCompletionPath == null ? "/chat/completions" : chatCompletionPath.trim();
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        return base + path;
    }
}
