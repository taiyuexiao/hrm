package com.hr.backend.config;

import com.hr.backend.dao.UserDao;
import com.hr.backend.entity.User;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

@Component
public class InitialPasswordResetRunner {

    public static final String INITIAL_PASSWORD = "B@s95594!";
    private static final String RESET_FLAG_FILE = ".initial-password-reset-v1";

    @Autowired
    private UserDao userDao;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Value("${app.data-dir:./data}")
    private String dataDir;

    @PostConstruct
    public void resetInitialPasswords() {
        Path dataPath = Paths.get(dataDir);
        Path flagPath = dataPath.resolve(RESET_FLAG_FILE);
        if (!Files.exists(flagPath)) {
            try {
                Files.createDirectories(dataPath);
            } catch (IOException e) {
                throw new RuntimeException("无法创建数据目录: " + dataPath, e);
            }

            List<User> users = userDao.findAll();
            for (User user : users) {
                // 逐用户 encode，确保每个用户拥有独立的 bcrypt salt
                String encoded = passwordEncoder.encode(INITIAL_PASSWORD);
                userDao.updatePassword(user.getUsername(), encoded);
            }

            try {
                Files.createFile(flagPath);
            } catch (IOException e) {
                throw new RuntimeException("无法创建初始密码重置标记文件: " + flagPath, e);
            }
        }

        backfillPasswordPlain();
    }

    /** 回填明文密码：哈希与初始密码匹配的用户，明文即为初始密码；其余保持 NULL（前端显示「未知」）。幂等，每次启动检查。 */
    private void backfillPasswordPlain() {
        int filled = 0;
        for (User u : userDao.findAll()) {
            if (u.getPasswordPlain() == null
                    && u.getPassword() != null
                    && passwordEncoder.matches(INITIAL_PASSWORD, u.getPassword())) {
                userDao.updatePasswordPlain(u.getUsername(), INITIAL_PASSWORD);
                filled++;
            }
        }
        if (filled > 0) {
            System.out.println("✅ 已回填 " + filled + " 个用户的明文密码（初始密码）");
        }
    }
}
