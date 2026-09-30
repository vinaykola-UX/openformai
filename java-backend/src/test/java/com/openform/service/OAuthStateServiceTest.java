package com.openform.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class OAuthStateServiceTest {
    @Test
    void consumesStateOnceAndKeepsUserBindingServerSide() {
        OAuthStateService service = new OAuthStateService(Clock.fixed(Instant.parse("2026-09-30T00:00:00Z"), ZoneOffset.UTC));
        String state = service.create("firebase-user-123", "teacher@example.com");

        var binding = service.consume(state);

        assertEquals("firebase-user-123", binding.uid());
        assertEquals("teacher@example.com", binding.expectedEmail());
        assertThrows(ApiException.class, () -> service.consume(state));
    }

    @Test
    void rejectsExpiredState() {
        AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-09-30T00:00:00Z"));
        Clock clock = new Clock() {
            @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        OAuthStateService service = new OAuthStateService(clock);
        String state = service.create("firebase-user-123", "teacher@example.com");
        now.set(now.get().plus(java.time.Duration.ofMinutes(11)));

        assertThrows(ApiException.class, () -> service.consume(state));
    }
}