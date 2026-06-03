package com.hr.backend.service;

import com.hr.backend.dao.UserDao;
import com.hr.backend.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class UserService {
    @Autowired
    private UserDao userDao;
    
    private BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    
    public User findByUsername(String username) {
        return userDao.findByUsername(username);
    }
    
    public User createUser(User user) {
        user.setPassword(encoder.encode(user.getPassword()));
        // 这里需要添加保存用户的逻辑
        return user;
    }
}