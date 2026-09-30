package com.openform.controller;

import com.openform.security.FirebasePrincipal;
import com.openform.service.GoogleImportOAuthService;
import com.openform.service.GoogleImportService;
import com.openform.service.RateLimitService;
import com.openform.service.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.view.RedirectView;

@RestController
public class GoogleImportController {
    private final GoogleImportOAuthService oauth;
    private final GoogleImportService imports;
    private final RateLimitService rateLimit;
    private final RateLimitService authRateLimit;
    private final String successUri;
    private final String errorUri;

    public GoogleImportController(GoogleImportOAuthService oauth, GoogleImportService imports, RateLimitService rateLimit,
            @Value("${app.google.success-uri}") String successUri,
            @Value("${app.google.error-uri}") String errorUri) {
        this.oauth = oauth;
        this.imports = imports;
        this.rateLimit = rateLimit;
        this.authRateLimit = rateLimit;
        this.successUri = successUri;
        this.errorUri = errorUri;
    }

    @GetMapping("/api/v1/google/import/auth-url")
    public Map<String, String> authUrl(@AuthenticationPrincipal FirebasePrincipal user) {
        authRateLimit.check(user.uid(), "oauth", 10);
        return Map.of("url", oauth.authorizationUrl(user.uid(), user.email()));
    }

    @GetMapping("/api/v1/google/import/callback")
    public RedirectView callback(@RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error) {
        try {
            if (error != null || code == null || state == null) return redirect(errorUri);
            oauth.complete(code, state);
            return redirect(successUri);
        } catch (ApiException exception) {
            String reason = "GOOGLE_ACCOUNT_MISMATCH".equals(exception.code()) ? "account_mismatch" : "authorization_failed";
            return redirect(errorUri + (errorUri.contains("?") ? "&" : "?") + "reason=" + reason);
        } catch (Exception exception) {
            return redirect(errorUri);
        }
    }

    @GetMapping("/api/v1/google/import/forms")
    public Map<String, Object> listForms(@AuthenticationPrincipal FirebasePrincipal user,
            @RequestParam(required = false) String pageToken) {
        rateLimit.check(user.uid(), "discovery", 10);
        return imports.listForms(user.uid(), pageToken);
    }

    @PostMapping("/api/v1/google/import/forms")
    public Map<String, Object> importForms(@AuthenticationPrincipal FirebasePrincipal user,
            @Valid @RequestBody ImportRequest request) {
        rateLimit.check(user.uid(), "import", 5);
        return imports.importForms(user.uid(), request.formIds());
    }

    private static RedirectView redirect(String value) {
        RedirectView redirect = new RedirectView();
        redirect.setUrl(URI.create(value).toASCIIString());
        redirect.setStatusCode(org.springframework.http.HttpStatus.FOUND);
        return redirect;
    }

    public record ImportRequest(@NotEmpty @Size(max = 20) List<@Size(max = 256) String> formIds) {}
}