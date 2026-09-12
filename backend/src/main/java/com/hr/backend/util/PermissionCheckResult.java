package com.hr.backend.util;

/**
 * 权限校验结果，包含是否通过以及拒绝时的具体原因。
 * 用于把底层权限失败原因透传给前端，方便生产环境定位问题。
 */
public class PermissionCheckResult {

    private final boolean allowed;
    private final String reason;

    public static final PermissionCheckResult ALLOW = new PermissionCheckResult(true, null);

    private PermissionCheckResult(boolean allowed, String reason) {
        this.allowed = allowed;
        this.reason = reason;
    }

    public static PermissionCheckResult allow() {
        return ALLOW;
    }

    public static PermissionCheckResult deny(String reason) {
        return new PermissionCheckResult(false, reason);
    }

    public boolean isAllowed() {
        return allowed;
    }

    public String getReason() {
        return reason;
    }
}
