package com.hr.backend.entity;

import lombok.Data;

@Data
public class User {
    private Long id;
    private String username;
    private String password;
    private String name;
    private String role;
    private String dept;
    private Integer status;
}