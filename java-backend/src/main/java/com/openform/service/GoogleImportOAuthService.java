package com.openform.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.openform.model.OAuthState;
import com.openform.repository.ImportTokenRepository;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class GoogleImportOAuthService {
    private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE = new ParameterizedTypeReference<>() {};
    private static final String[] SCOPES = {
            "openid", "email", "profile",
            "https://www.googleapis.com/auth/drive.metadata.readonly",
            "https://www.googleapis.com/auth/forms.body.readonly"
    };
    private final OAuthStateService states;
    private final ImportTokenRepository tokens;
    private final RestClient rest;
    private final ObjectMapper mapper;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;

    public GoogleImportOAuthService(OAuthStateService states, ImportTokenRepository tokens, RestClient.Builder builder,
            ObjectMapper mapper, @Value("${app.google.client-id}") String clientId,
            @Value("${app.google.client-secret}") String clientSecret,
            @Value("${app.google.redirect-uri}") String redirectUri) {
        this.states = states;
        this.tokens = tokens;
        this.rest = builder.build();
        this.mapper = mapper;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    public String authorizationUrl(String uid, String email) {
        if (email == null || email.isBlank()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "GOOGLE_EMAIL_REQUIRED", "Your OpenForm account must have an email address to connect Google.");
        }
        String state = states.create(uid, email);
        String scope = URLEncoder.encode(String.join(" ", SCOPES), StandardCharsets.UTF_8);
        return "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&access_type=offline&prompt=consent"
                + "&client_id=" + encode(clientId) + "&redirect_uri=" + encode(redirectUri)
                + "&scope=" + scope + "&state=" + encode(state) + "&login_hint=" + encode(email);
    }

    public void complete(String code, String state) {
        OAuthState binding = states.consume(state);
        Map<String, Object> tokenResponse = postForm("https://oauth2.googleapis.com/token", Map.of(
                "code", code, "client_id", clientId, "client_secret", clientSecret,
                "redirect_uri", redirectUri, "grant_type", "authorization_code"));
        String idToken = text(tokenResponse, "id_token");
        String refreshToken = text(tokenResponse, "refresh_token");
        if (idToken == null || refreshToken == null) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GOOGLE_AUTH_FAILED", "Google did not provide the authorization needed for import. Please try connecting again.");
        }
        Map<String, Object> identity = rest.get().uri(uri -> uri.scheme("https").host("oauth2.googleapis.com").path("tokeninfo").queryParam("id_token", idToken).build())
            .retrieve().body(MAP_TYPE);
        if (identity == null || !clientId.equals(text(identity, "aud")) || !Boolean.parseBoolean(text(identity, "email_verified"))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "GOOGLE_IDENTITY_INVALID", "Google could not verify the selected account. Please try again.");
        }
        String googleEmail = text(identity, "email");
        verifyGoogleAccount(binding.expectedEmail(), googleEmail);
        try {
            tokens.save(binding.uid(), refreshToken, googleEmail);
        } catch (ApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TOKEN_STORAGE_ERROR", "Google import authorization could not be saved.");
        }
    }

    private Map<String, Object> postForm(String url, Map<String, String> values) {
        try {
            String body = values.entrySet().stream().map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue())).collect(java.util.stream.Collectors.joining("&"));
            return rest.post().uri(URI.create(url)).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(body).retrieve().body(MAP_TYPE);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GOOGLE_AUTH_FAILED", "Google authorization could not be completed. Please try again.");
        }
    }

    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    static void verifyGoogleAccount(String expectedEmail, String actualEmail) {
        if (expectedEmail == null || actualEmail == null || !actualEmail.trim().equalsIgnoreCase(expectedEmail.trim())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "GOOGLE_ACCOUNT_MISMATCH", "The Google account selected for import does not match your OpenForm account.");
        }
    }
    static String text(Map<String, Object> value, String key) {
        Object result = value == null ? null : value.get(key);
        return result == null ? null : result.toString();
    }
}