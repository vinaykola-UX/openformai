package com.openform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QuerySnapshot;
import com.google.cloud.firestore.SetOptions;
import com.openform.repository.ImportTokenRepository;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class GoogleImportService {
    private static final String DRIVE_API = "https://www.googleapis.com/drive/v3/files";
    private static final String FORMS_API = "https://forms.googleapis.com/v1/forms/";
    private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE = new ParameterizedTypeReference<>() {};
    private final ImportTokenRepository tokenRepository;
    private final Firestore firestore;
    private final RestClient rest;
    private final ObjectMapper mapper;
    private final String clientId;
    private final String clientSecret;

    public GoogleImportService(ImportTokenRepository tokenRepository, Firestore firestore, RestClient.Builder builder,
            ObjectMapper mapper,
            @org.springframework.beans.factory.annotation.Value("${app.google.client-id}") String clientId,
            @org.springframework.beans.factory.annotation.Value("${app.google.client-secret}") String clientSecret) {
        this.tokenRepository = tokenRepository;
        this.firestore = firestore;
        this.rest = builder.build();
        this.mapper = mapper;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    public Map<String, Object> listForms(String uid, String pageToken) {
        String accessToken = accessToken(uid);
        Map<String, Object> response;
        try {
            response = rest.get().uri(uri -> {
                var builder = uri.scheme("https").host("www.googleapis.com").path("drive/v3/files")
                        .queryParam("q", "mimeType='application/vnd.google-apps.form' and trashed=false")
                        .queryParam("pageSize", 50)
                        .queryParam("orderBy", "modifiedTime desc")
                        .queryParam("fields", "nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink)");
                if (pageToken != null && !pageToken.isBlank()) builder.queryParam("pageToken", pageToken);
                return builder.build();
            }).header("Authorization", "Bearer " + accessToken).retrieve().body(MAP_TYPE);
        } catch (Exception exception) {
            throw mapGoogleError(exception, "Google Forms could not be listed. Reconnect Google and try again.");
        }
        List<Map<String, Object>> forms = objectList(response == null ? null : response.get("files")).stream()
                .map(file -> {
                    Map<String, Object> result = new HashMap<>();
                    result.put("googleFormId", file.get("id"));
                    result.put("title", file.getOrDefault("name", "Untitled form"));
                    result.put("modifiedTime", file.get("modifiedTime"));
                    result.put("createdTime", file.get("createdTime"));
                    result.put("webViewLink", file.get("webViewLink"));
                    return result;
                }).toList();
        Map<String, Object> result = new HashMap<>();
        result.put("forms", forms);
        if (response != null && response.get("nextPageToken") != null) result.put("nextPageToken", response.get("nextPageToken"));
        return result;
    }

    public Map<String, Object> importForms(String uid, List<String> formIds) {
        if (formIds == null || formIds.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "FORM_IDS_REQUIRED", "Select at least one Google Form to import.");
        if (formIds.size() > 20) throw new ApiException(HttpStatus.BAD_REQUEST, "IMPORT_LIMIT_EXCEEDED", "You can import up to 20 forms at a time.");
        if (formIds.stream().anyMatch(id -> id == null || !id.matches("[A-Za-z0-9_-]{10,256}"))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FORM_ID", "One or more Google Form IDs are invalid.");
        }
        String accessToken = accessToken(uid);
        List<Map<String, Object>> imported = new ArrayList<>();
        int importedCount = 0;
        int alreadyImportedCount = 0;
        for (String formId : formIds.stream().distinct().toList()) {
            try {
                    Map<String, Object> driveFile = rest.get().uri(uri -> uri.scheme("https").host("www.googleapis.com")
                            .path("drive/v3/files/" + formId)
                            .queryParam("fields", "id,name,mimeType,createdTime,modifiedTime,webViewLink,trashed")
                            .build())
                        .header("Authorization", "Bearer " + accessToken).retrieve().body(MAP_TYPE);
                    if (driveFile == null || !"application/vnd.google-apps.form".equals(driveFile.get("mimeType"))
                        || Boolean.TRUE.equals(driveFile.get("trashed"))) {
                        throw new ApiException(HttpStatus.FORBIDDEN, "GOOGLE_FORM_UNAVAILABLE", "A selected Google Form is unavailable or you no longer have access.");
                    }
                Map<String, Object> form = rest.get().uri(FORMS_API + formId)
                        .header("Authorization", "Bearer " + accessToken).retrieve().body(MAP_TYPE);
                if (form == null) throw new ApiException(HttpStatus.BAD_GATEWAY, "GOOGLE_FORM_UNAVAILABLE", "A selected Google Form could not be read.");

                QuerySnapshot matches = firestore.collection("forms").whereEqualTo("uid", uid)
                    .whereEqualTo("googleFormId", formId).limit(1).get().get();
                if (!matches.isEmpty()) {
                    imported.add(importResult(formId, true, matches.getDocuments().getFirst().getId(), List.of()));
                    alreadyImportedCount++;
                    continue;
                }

                    Map<String, Object> stored = toFormDocument(uid, formId, form, driveFile);
                String documentId = importDocumentId(uid, formId);
                DocumentReference reference = firestore.collection("forms").document(documentId);
                try {
                    reference.create(stored).get();
                    imported.add(importResult(formId, false, documentId, objectList(stored.get("warnings"))));
                    importedCount++;
                } catch (ExecutionException exception) {
                    DocumentSnapshot existing = reference.get().get();
                    if (existing.exists()) {
                        imported.add(importResult(formId, true, existing.getId(), List.of()));
                        alreadyImportedCount++;
                    } else {
                        throw exception;
                    }
                }
            } catch (ApiException exception) {
                throw exception;
            } catch (Exception exception) {
                throw mapGoogleError(exception, "A selected Google Form could not be imported. Check access and try again.");
            }
        }
        return Map.of("imported", imported, "importedCount", importedCount, "alreadyImportedCount", alreadyImportedCount);
    }

    private String accessToken(String uid) {
        try {
            String refreshToken = tokenRepository.get(uid);
            String body = "client_id=" + enc(clientId) + "&client_secret=" + enc(clientSecret)
                    + "&refresh_token=" + enc(refreshToken) + "&grant_type=refresh_token";
            Map<String, Object> response = rest.post().uri(URI.create("https://oauth2.googleapis.com/token"))
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(body).retrieve().body(MAP_TYPE);
            Object accessToken = response == null ? null : response.get("access_token");
            if (accessToken == null) throw new ApiException(HttpStatus.FORBIDDEN, "GOOGLE_AUTH_REVOKED", "Google authorization expired or was revoked. Reconnect Google to continue.");
            return accessToken.toString();
        } catch (ApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.FORBIDDEN, "GOOGLE_AUTH_REVOKED", "Google authorization expired or was revoked. Reconnect Google to continue.");
        }
    }

    private Map<String, Object> toFormDocument(String uid, String googleFormId, Map<String, Object> source, Map<String, Object> driveFile) {
        Map<String, Object> info = objectMap(source.get("info"));
        List<Map<String, Object>> items = objectList(source.get("items"));
        List<Map<String, Object>> warnings = new ArrayList<>();
        List<Map<String, Object>> questions = new ArrayList<>();
        for (int index = 0; index < items.size(); index++) {
            Map<String, Object> item = items.get(index);
            Map<String, Object> converted = convertItem(item);
            questions.add(converted);
            if ("UNSUPPORTED".equals(converted.get("type"))) {
                warnings.add(Map.of("index", index, "title", converted.get("title"), "reason", converted.get("unsupportedReason")));
            }
        }
        String title = info.get("title") == null ? "Untitled form" : info.get("title").toString();
        String responderUri = source.get("responderUri") == null
                ? "https://docs.google.com/forms/d/" + googleFormId + "/viewform" : source.get("responderUri").toString();
        Map<String, Object> data = new HashMap<>();
        data.put("uid", uid);
        data.put("title", title);
        data.put("googleFormId", googleFormId);
        data.put("responderUri", responderUri);
        data.put("editUri", "https://docs.google.com/forms/d/" + googleFormId + "/edit");
        data.put("questionCount", questions.size());
        data.put("questions", questions);
        data.put("isQuiz", false);
        data.put("expectedStudents", List.of());
        data.put("expiresAt", null);
        data.put("createdAt", Timestamp.now());
        data.put("source", "google_import");
        data.put("importedAt", Timestamp.now());
        data.put("warnings", warnings);
        if (driveFile.get("modifiedTime") != null) data.put("googleModifiedTime", driveFile.get("modifiedTime"));
        return data;
    }

    private Map<String, Object> convertItem(Map<String, Object> item) {
        Map<String, Object> result = new HashMap<>();
        Map<String, Object> questionItem = objectMap(item.get("questionItem"));
        Map<String, Object> question = objectMap(questionItem.get("question"));
        String title = item.get("title") == null ? "Untitled question" : item.get("title").toString();
        result.put("title", title);
        result.put("required", question.getOrDefault("required", false));
        if (item.get("description") != null) result.put("description", item.get("description"));

        if (question.containsKey("textQuestion")) {
            boolean paragraph = Boolean.TRUE.equals(objectMap(question.get("textQuestion")).get("paragraph"));
            result.put("type", paragraph ? "PARAGRAPH" : "SHORT");
        } else if (question.containsKey("choiceQuestion")) {
            Map<String, Object> choices = objectMap(question.get("choiceQuestion"));
            String kind = String.valueOf(choices.get("type"));
            result.put("type", switch (kind) { case "CHECKBOX" -> "CHECKBOX"; case "DROP_DOWN" -> "DROPDOWN"; default -> "MCQ"; });
            result.put("options", objectList(choices.get("options")).stream().map(option -> String.valueOf(option.getOrDefault("value", ""))).toList());
        } else if (question.containsKey("scaleQuestion")) {
            Map<String, Object> scale = objectMap(question.get("scaleQuestion"));
            result.put("type", "LINEAR_SCALE");
            result.put("scaleMin", scale.getOrDefault("low", 1));
            result.put("scaleMax", scale.getOrDefault("high", 5));
            result.put("scaleMinLabel", scale.get("lowLabel"));
            result.put("scaleMaxLabel", scale.get("highLabel"));
        } else if (question.containsKey("dateQuestion")) {
            Map<String, Object> date = objectMap(question.get("dateQuestion"));
            result.put("type", "DATE");
            result.put("includeYear", date.getOrDefault("includeYear", true));
            result.put("includeTime", date.getOrDefault("includeTime", false));
        } else if (question.containsKey("timeQuestion")) {
            result.put("type", "TIME");
        } else {
            result.put("type", "UNSUPPORTED");
            result.put("unsupportedReason", "This Google Forms item type is not supported by OpenForm yet.");
        }
        return result;
    }

    private static Map<String, Object> importResult(String id, boolean duplicate, String documentId, List<Map<String, Object>> warnings) {
        return Map.of("googleFormId", id, "alreadyImported", duplicate, "documentId", documentId, "warnings", warnings);
    }

    private static String importDocumentId(String uid, String formId) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest((uid + ":" + formId).getBytes(StandardCharsets.UTF_8));
            return "google_import_" + Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (Exception exception) { throw new IllegalStateException("Secure hashing is unavailable", exception); }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> objectMap(Object value) { return value instanceof Map<?, ?> ? (Map<String, Object>) value : Map.of(); }
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> objectList(Object value) { return value instanceof List<?> list ? (List<Map<String, Object>>) (List<?>) list : List.of(); }
    private static String enc(String value) { return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8); }

    private static ApiException mapGoogleError(Exception exception, String fallback) {
        if (exception instanceof org.springframework.web.client.HttpClientErrorException httpError) {
            if (httpError.getStatusCode().value() == 429) return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "GOOGLE_RATE_LIMIT", "Google is temporarily limiting requests. Try again shortly.");
            if (httpError.getStatusCode().value() == 404 || httpError.getStatusCode().value() == 403) return new ApiException(HttpStatus.FORBIDDEN, "GOOGLE_FORM_UNAVAILABLE", "A selected Google Form is unavailable or you no longer have access.");
        }
        return new ApiException(HttpStatus.BAD_GATEWAY, "GOOGLE_API_ERROR", fallback);
    }
}