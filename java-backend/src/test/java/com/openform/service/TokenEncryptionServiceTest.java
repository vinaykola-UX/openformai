package com.openform.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Base64;
import org.junit.jupiter.api.Test;

class TokenEncryptionServiceTest {
    @Test
    void encryptsAndDecryptsWithoutStoringPlaintext() {
        String key = Base64.getEncoder().encodeToString(new byte[32]);
        TokenEncryptionService service = new TokenEncryptionService(key);

        String encrypted = service.encrypt("refresh-token-value");

        assertEquals("refresh-token-value", service.decrypt(encrypted));
        org.junit.jupiter.api.Assertions.assertFalse(encrypted.contains("refresh-token-value"));
    }
}