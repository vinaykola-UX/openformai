package com.openform.repository;

import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.SetOptions;
import com.openform.service.ApiException;
import com.openform.service.TokenEncryptionService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;

@Repository
public class ImportTokenRepository {
    private final Firestore firestore;
    private final TokenEncryptionService encryption;

    public ImportTokenRepository(Firestore firestore, TokenEncryptionService encryption) {
        this.firestore = firestore;
        this.encryption = encryption;
    }

    public void save(String uid, String refreshToken, String googleEmail) throws Exception {
        firestore.collection("users").document(uid).set(java.util.Map.of(
            "googleImportRefreshToken", encryption.encrypt(refreshToken),
            "googleImportEmail", googleEmail,
            "googleImportConnectedAt", com.google.cloud.Timestamp.now()), SetOptions.merge()).get();
    }

    public String get(String uid) throws Exception {
        DocumentSnapshot user = firestore.collection("users").document(uid).get().get();
        String encrypted = user.getString("googleImportRefreshToken");
        if (encrypted == null || encrypted.isBlank()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "GOOGLE_IMPORT_NOT_CONNECTED", "Connect Google to import your forms.");
        }
        return encryption.decrypt(encrypted);
    }
}