package com.hr.backend.exception;

/**
 * 乐观锁冲突：服务端数据在读取后被其他请求更新。
 */
public class OptimisticLockException extends RuntimeException {
    public OptimisticLockException(String message) {
        super(message);
    }
}
