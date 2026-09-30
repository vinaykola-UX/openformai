package com.openform.service;

import com.openform.model.OAuthState;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.Clock;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class OAuthStateService {
    private final SecureRandom random = new SecureRandom();
    private final ConcurrentHashMap<String, OAuthState> states = new ConcurrentHashMap<>();
    private final Clock clock;

    public OAuthStateService() { this(Clock.systemUTC()); }
    OAuthStateService(Clock clock) { this.clock = clock; }

    public String create(String uid, String email) {
        if (states.size() > 10000) {
            Instant now = clock.instant();
            states.entrySet().removeIf(entry -> !entry.getValue().expiresAt().isAfter(now));
        }
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        states.put(hash(state), new OAuthState(uid, email, clock.instant().plus(Duration.ofMinutes(10))));
        return state;
    }

    public OAuthState consume(String state) {
        if (state == null || state.length() > 256) throw invalidState();
        OAuthState stored = states.remove(hash(state));
        if (stored == null || !stored.expiresAt().isAfter(clock.instant())) throw invalidState();
        return stored;
    }

    private static String hash(String input) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception exception) {
            throw new IllegalStateException("Secure hashing is unavailable", exception);
        }
    }

    private static ApiException invalidState() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_OAUTH_STATE", "Import authorization expired or was already used. Start again.");
    }
}