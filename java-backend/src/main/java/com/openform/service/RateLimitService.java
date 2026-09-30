package com.openform.service;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class RateLimitService {
    private record Counter(Instant expiresAt, AtomicInteger count) {}
    private final ConcurrentHashMap<String, Counter> counters = new ConcurrentHashMap<>();

    public void check(String uid, String operation, int limit) {
        Instant now = Instant.now();
        String key = uid + ":" + operation;
        Counter counter = counters.compute(key, (ignored, current) -> {
            if (current == null || !current.expiresAt().isAfter(now)) {
                return new Counter(now.plus(Duration.ofMinutes(1)), new AtomicInteger());
            }
            return current;
        });
        if (counter.count().incrementAndGet() > limit) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "Too many requests. Please try again shortly.");
        }
        if (counters.size() > 10000) counters.entrySet().removeIf(entry -> !entry.getValue().expiresAt().isAfter(now));
    }
}