package com.openform.model;

import java.time.Instant;

public record OAuthState(String uid, String expectedEmail, Instant expiresAt) {}