package com.openform.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.cloud.FirestoreClient;
import com.google.cloud.firestore.Firestore;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Configuration
public class FirebaseConfiguration {
    @Bean
    FirebaseApp firebaseApp(
            @Value("${app.firebase.project-id:}") String projectId,
            @Value("${app.firebase.client-email:}") String clientEmail,
            @Value("${app.firebase.private-key:}") String privateKey) throws IOException {
        List<FirebaseApp> apps = FirebaseApp.getApps();
        if (!apps.isEmpty()) return apps.getFirst();
        if (!StringUtils.hasText(projectId) || !StringUtils.hasText(clientEmail) || !StringUtils.hasText(privateKey)) {
            throw new IllegalStateException("Firebase Admin credentials are not configured");
        }
        String normalizedKey = privateKey.replace("\\n", "\n");
        String serviceAccount = "{\"type\":\"service_account\",\"project_id\":\"" + escape(projectId)
                + "\",\"client_email\":\"" + escape(clientEmail)
                + "\",\"private_key\":\"" + escape(normalizedKey) + "\"}";
        FirebaseOptions options = FirebaseOptions.builder()
                .setCredentials(GoogleCredentials.fromStream(
                        new ByteArrayInputStream(serviceAccount.getBytes(StandardCharsets.UTF_8))))
                .setProjectId(projectId)
                .build();
        return FirebaseApp.initializeApp(options);
    }

    @Bean
    FirebaseAuth firebaseAuth(FirebaseApp app) {
        return FirebaseAuth.getInstance(app);
    }

    @Bean
    Firestore firestore(FirebaseApp app) {
        return FirestoreClient.getFirestore(app);
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }
}