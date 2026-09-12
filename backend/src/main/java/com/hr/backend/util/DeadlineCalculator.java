package com.hr.backend.util;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

public class DeadlineCalculator {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter ISO_FMT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    /**
     * Parse week label like "20260327" and return the deadline (that day 20:00).
     * If a custom deadline is provided, use it instead.
     */
    public static LocalDateTime getDeadline(String weekLabel, String deadline) {
        if (deadline != null && !deadline.isBlank()) {
            try {
                return LocalDateTime.parse(deadline, ISO_FMT);
            } catch (DateTimeParseException e) {
                // fallback to default logic
            }
        }
        return getDefaultDeadline(weekLabel);
    }

    public static LocalDateTime getDeadline(String weekLabel) {
        return getDeadline(weekLabel, null);
    }

    private static LocalDateTime getDefaultDeadline(String weekLabel) {
        if (weekLabel == null || weekLabel.isBlank()) {
            return LocalDateTime.of(2099, 12, 31, 23, 59);
        }
        try {
            LocalDate date = LocalDate.parse(weekLabel, DATE_FMT);
            return date.atTime(20, 0, 0);
        } catch (DateTimeParseException e) {
            return LocalDateTime.of(2099, 12, 31, 23, 59);
        }
    }

    public static boolean isDeadlinePassed(String weekLabel, String deadline) {
        return LocalDateTime.now(ZONE).isAfter(getDeadline(weekLabel, deadline));
    }

    public static boolean isDeadlinePassed(String weekLabel) {
        return isDeadlinePassed(weekLabel, null);
    }

    public static long getRemainingSeconds(String weekLabel, String deadline) {
        LocalDateTime deadlineTime = getDeadline(weekLabel, deadline);
        LocalDateTime now = LocalDateTime.now(ZONE);
        if (now.isAfter(deadlineTime)) {
            return -1;
        }
        return java.time.Duration.between(now, deadlineTime).getSeconds();
    }

    public static long getRemainingSeconds(String weekLabel) {
        return getRemainingSeconds(weekLabel, null);
    }

    /**
     * Get current week label (Friday of current week; Sat/Sun rolls to next Friday).
     */
    public static String getCurrentWeekLabel() {
        java.time.LocalDate now = java.time.LocalDate.now(ZONE);
        int dayOfWeek = now.getDayOfWeek().getValue(); // Mon=1 ... Fri=5, Sat=6, Sun=7
        int offset = (5 - dayOfWeek + 7) % 7;
        return now.plusDays(offset).format(DATE_FMT);
    }

    public static java.time.ZoneId getZone() {
        return ZONE;
    }
}
