package com.openform.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuth;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class FirebaseBearerFilterTest {
    @Test
    void returns401WhenBearerTokenIsMissing() throws Exception {
        FirebaseBearerFilter filter = new FirebaseBearerFilter(mock(FirebaseAuth.class), new ObjectMapper());
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/google/import/forms");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> { throw new AssertionError("Unauthenticated request must not reach the API"); };

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
    }
}