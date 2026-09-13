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
    /** 日报系统身份：NULL=无日报身份；newbie=新人；mentor=带教老师；leader=领导（详见 docs/modules/new-employee-daily.md） */
    private String dailyRole;
    /** 新人所属小组 ID（newbie_groups.id），仅新人使用 */
    private String groupId;
    /** 带教老师工号，仅新人使用 */
    private String mentor;
}
