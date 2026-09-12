package com.hr.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hr.backend.entity.Suggestion;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class SuggestionService {

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${app.data-dir:./data}")
    private String dataDir;

    private static final String FILE_NAME = "suggestions.json";
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final Object lock = new Object();

    @PostConstruct
    public void init() {
        ensureFileExists();
    }

    private File getDataFile() {
        return new File(dataDir, FILE_NAME);
    }

    private void ensureFileExists() {
        try {
            File dir = new File(dataDir);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            File file = getDataFile();
            if (!file.exists()) {
                writeAll(new ArrayList<>());
            }
        } catch (Exception e) {
            throw new RuntimeException("无法初始化建议箱数据文件", e);
        }
    }

    private List<Suggestion> readAll() {
        File file = getDataFile();
        if (!file.exists()) {
            return new ArrayList<>();
        }
        try {
            List<Suggestion> list = objectMapper.readValue(file, new TypeReference<List<Suggestion>>() {});
            return list != null ? new ArrayList<>(list) : new ArrayList<>();
        } catch (IOException e) {
            throw new RuntimeException("读取建议箱数据失败", e);
        }
    }

    private void writeAll(List<Suggestion> list) {
        File file = getDataFile();
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, list);
        } catch (IOException e) {
            throw new RuntimeException("写入建议箱数据失败", e);
        }
    }

    public Suggestion createSuggestion(Map<String, Object> currentUser, String content) {
        String now = LocalDateTime.now().format(FORMATTER);
        String userId = currentUser.get("id") != null ? String.valueOf(currentUser.get("id")) : "";
        String username = (String) currentUser.get("username");
        String name = (String) currentUser.get("name");
        String dept = (String) currentUser.get("dept");

        synchronized (lock) {
            List<Suggestion> list = readAll();
            long maxId = list.stream().mapToLong(s -> s.getId() != null ? s.getId() : 0).max().orElse(0);

            Suggestion s = new Suggestion();
            s.setId(maxId + 1);
            s.setUserId(userId);
            s.setUsername(username);
            s.setName(name);
            s.setDept(dept);
            s.setContent(content);
            s.setStatus("pending");
            s.setAdminReply(null);
            s.setCreatedAt(now);
            s.setUpdatedAt(now);

            list.add(s);
            writeAll(list);
            return s;
        }
    }

    public Suggestion getSuggestionById(Long id) {
        synchronized (lock) {
            return readAll().stream()
                    .filter(s -> id.equals(s.getId()))
                    .findFirst()
                    .orElse(null);
        }
    }

    public List<Suggestion> listSuggestions(String status, String keyword, int page, int size) {
        synchronized (lock) {
            List<Suggestion> filtered = filterSuggestions(readAll(), status, keyword);
            filtered.sort(Comparator.comparing(Suggestion::getCreatedAt).reversed());

            int from = (page - 1) * size;
            if (from >= filtered.size()) {
                return new ArrayList<>();
            }
            int to = Math.min(from + size, filtered.size());
            return new ArrayList<>(filtered.subList(from, to));
        }
    }

    public int countSuggestions(String status, String keyword) {
        synchronized (lock) {
            return filterSuggestions(readAll(), status, keyword).size();
        }
    }

    private List<Suggestion> filterSuggestions(List<Suggestion> list, String status, String keyword) {
        return list.stream().filter(s -> {
            boolean matchStatus = status == null || status.isEmpty() || status.equals(s.getStatus());
            boolean matchKeyword = true;
            if (keyword != null && !keyword.isEmpty()) {
                String kw = keyword.toLowerCase();
                String content = s.getContent() != null ? s.getContent().toLowerCase() : "";
                String name = s.getName() != null ? s.getName().toLowerCase() : "";
                String dept = s.getDept() != null ? s.getDept().toLowerCase() : "";
                matchKeyword = content.contains(kw) || name.contains(kw) || dept.contains(kw);
            }
            return matchStatus && matchKeyword;
        }).collect(Collectors.toList());
    }

    public Suggestion updateStatus(Long id, String status, String adminReply) {
        String now = LocalDateTime.now().format(FORMATTER);
        synchronized (lock) {
            List<Suggestion> list = readAll();
            Optional<Suggestion> opt = list.stream().filter(s -> id.equals(s.getId())).findFirst();
            if (opt.isEmpty()) {
                return null;
            }
            Suggestion s = opt.get();
            s.setStatus(status);
            s.setAdminReply(adminReply);
            s.setUpdatedAt(now);
            writeAll(list);
            return s;
        }
    }
}
