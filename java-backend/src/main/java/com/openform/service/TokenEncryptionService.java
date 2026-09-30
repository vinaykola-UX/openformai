package com.openform.service;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class TokenEncryptionService {
    private static final int IV_LENGTH = 12;
    private final byte[] key;
    private final SecureRandom random = new SecureRandom();

    public TokenEncryptionService(@Value("${app.token-encryption-key:}") String encodedKey) {
        byte[] parsed = new byte[0];
        if (!encodedKey.isBlank()) {
            try { parsed = Base64.getDecoder().decode(encodedKey); } catch (IllegalArgumentException ignored) { parsed = encodedKey.getBytes(StandardCharsets.UTF_8); }
        }
        this.key = parsed;
    }

    public String encrypt(String plaintext) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            byte[] iv = new byte[IV_LENGTH];
            random.nextBytes(iv);
            cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array());
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TOKEN_STORAGE_ERROR", "Google import authorization could not be saved.");
        }
    }

    public String decrypt(String ciphertext) {
        try {
            byte[] packed = Base64.getDecoder().decode(ciphertext);
            byte[] iv = java.util.Arrays.copyOfRange(packed, 0, IV_LENGTH);
            byte[] encrypted = java.util.Arrays.copyOfRange(packed, IV_LENGTH, packed.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TOKEN_STORAGE_ERROR", "Google import authorization could not be read.");
        }
    }

    private SecretKeySpec key() {
        if (key.length != 32) throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TOKEN_ENCRYPTION_NOT_CONFIGURED", "Google import token encryption is not configured.");
        return new SecretKeySpec(key, "AES");
    }
}