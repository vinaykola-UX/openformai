package com.openform.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class GoogleImportOAuthServiceTest {
    @Test
    void rejectsGoogleAccountDifferentFromFirebaseEmail() {
        ApiException exception = assertThrows(ApiException.class,
                () -> GoogleImportOAuthService.verifyGoogleAccount("owner@example.com", "different@example.com"));

        assertEquals(HttpStatus.FORBIDDEN, exception.status());
        assertEquals("The Google account selected for import does not match your OpenForm account.", exception.getMessage());
    }

    @Test
    void acceptsCaseInsensitiveEmailMatch() {
        GoogleImportOAuthService.verifyGoogleAccount("Owner@example.com", "owner@EXAMPLE.com");
    }
}