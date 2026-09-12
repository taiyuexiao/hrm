package com.hr.backend.entity;

import lombok.Data;
import java.util.List;

@Data
public class User {
    private Long id;
    private String username;
    private String password;
    private String name;
    private String role;
    private String dept;
    private Integer status;
    private List<String> permissions;
    /** 明文密码，仅供超级管理员在账号管理界面查看；登录校验仍使用 password（BCrypt 哈希） */
    private String passwordPlain;
}
