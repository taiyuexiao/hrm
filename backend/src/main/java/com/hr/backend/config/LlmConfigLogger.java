package com.hr.backend.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
public class LlmConfigLogger implements CommandLineRunner {

    @Autowired
    private LlmProperties llmProperties;

    @Override
    public void run(String... args) {
        String baseUrl = llmProperties.getBaseUrl();
        String model = llmProperties.getModel();

        if (baseUrl == null || baseUrl.trim().isEmpty()) {
            System.out.println("[LLM] 警告：llm.base-url 未配置，AI 功能将无法使用");
        } else {
            System.out.println("[LLM] 已配置 base-url: " + baseUrl);
            System.out.println("[LLM] 已配置 model: " + (model == null || model.isEmpty() ? "未配置" : model));
            System.out.println("[LLM] 完整请求地址: " + llmProperties.getChatCompletionUrl());
        }
    }
}
