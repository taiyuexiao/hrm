package com.hr.backend.service;

import com.hr.backend.config.LlmProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@Service
public class LlmService {

    @Autowired
    private LlmProperties llmProperties;

    private RestTemplate restTemplate;

    private synchronized RestTemplate getRestTemplate() {
        if (restTemplate == null) {
            ClientHttpRequestFactory factory = requestFactory();
            restTemplate = new RestTemplate(factory);
        }
        return restTemplate;
    }

    private ClientHttpRequestFactory requestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(llmProperties.getConnectTimeout());
        factory.setReadTimeout(llmProperties.getReadTimeout());
        return factory;
    }

    /**
     * 调用大模型 chat/completions 接口（OpenAI 兼容格式）
     *
     * @param systemPrompt system 角色提示词
     * @param userPrompt   user 角色提示词
     * @param maxTokens    最大 token 数
     * @return 模型返回的文本内容
     */
    public String chatCompletion(String systemPrompt, String userPrompt, int maxTokens) {
        if (llmProperties.getBaseUrl() == null || llmProperties.getBaseUrl().trim().isEmpty()) {
            throw new RuntimeException("LLM base-url 未配置，请在 application.yml 或环境变量中设置 llm.base-url / LLM_BASE_URL");
        }
        if (llmProperties.getApiKey() == null || llmProperties.getApiKey().trim().isEmpty()) {
            throw new RuntimeException("LLM api-key 未配置，请在 application.yml 或环境变量中设置 llm.api-key / LLM_API_KEY");
        }
        if (llmProperties.getModel() == null || llmProperties.getModel().trim().isEmpty()) {
            throw new RuntimeException("LLM model 未配置，请在 application.yml 或环境变量中设置 llm.model / LLM_MODEL");
        }

        String url = llmProperties.getChatCompletionUrl();

        Map<String, Object> requestBody = Map.of(
                "model", llmProperties.getModel(),
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)
                ),
                "stream", false,
                "temperature", 0.3,
                "max_tokens", maxTokens
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(llmProperties.getApiKey());

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        try {
            ResponseEntity<Map> response = getRestTemplate().exchange(
                    url,
                    HttpMethod.POST,
                    entity,
                    Map.class
            );

            if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) {
                throw new RuntimeException("LLM 返回异常状态: " + response.getStatusCode());
            }

            return extractContent(response.getBody());
        } catch (RestClientException e) {
            throw new RuntimeException("调用大模型失败: " + e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private String extractContent(Map<String, Object> body) {
        Object choices = body.get("choices");
        if (!(choices instanceof List)) {
            throw new RuntimeException("LLM 返回格式异常，缺少 choices");
        }
        List<Map<String, Object>> choiceList = (List<Map<String, Object>>) choices;
        if (choiceList.isEmpty()) {
            throw new RuntimeException("LLM 返回 choices 为空");
        }
        Map<String, Object> first = choiceList.get(0);
        Object message = first.get("message");
        if (!(message instanceof Map)) {
            throw new RuntimeException("LLM 返回格式异常，缺少 message");
        }
        Object content = ((Map<String, Object>) message).get("content");
        return content == null ? "" : content.toString().trim();
    }
}
