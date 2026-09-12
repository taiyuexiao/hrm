package com.hr.backend.filter;

import com.hr.backend.entity.User;
import com.hr.backend.service.UserService;
import com.hr.backend.utils.JwtUtils;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    @Autowired
    private JwtUtils jwtUtils;

    @Autowired
    private UserService userService;

    private static final Set<String> ALLOWED_PATHS_WHEN_NEED_CHANGE_PASSWORD = Set.of(
            "/api/auth/login",
            "/api/auth/change-password"
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                      HttpServletResponse response,
                                      FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            try {
                String username = jwtUtils.getUsernameFromToken(token);
                if (username != null && !jwtUtils.isTokenExpired(token)) {
                    UsernamePasswordAuthenticationToken authentication =
                            new UsernamePasswordAuthenticationToken(username, null, new ArrayList<>());
                    SecurityContextHolder.getContext().setAuthentication(authentication);

                    // Load full user info into request attribute for controllers
                    User user = userService.findByUsername(username);
                    if (user != null) {
                        Map<String, Object> currentUser = new LinkedHashMap<>();
                        currentUser.put("id", String.valueOf(user.getId()));
                        currentUser.put("username", user.getUsername());
                        currentUser.put("name", user.getName());
                        currentUser.put("role", user.getRole());
                        currentUser.put("dept", user.getDept());
                        currentUser.put("permissions", user.getPermissions());
                        request.setAttribute("currentUser", currentUser);
                    }

                    // 如果用户还没修改初始密码，只允许访问登录/改密接口
                    if (jwtUtils.isNeedChangePassword(token)) {
                        String uri = request.getRequestURI();
                        String contextPath = request.getContextPath();
                        String path = uri.substring(contextPath.length());
                        if (!ALLOWED_PATHS_WHEN_NEED_CHANGE_PASSWORD.contains(path)) {
                            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                            response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"success\":false,\"code\":\"MUST_CHANGE_PASSWORD\",\"message\":\"请先修改初始密码\"}");
                            return;
                        }
                    }
                }
            } catch (Exception e) {
                logger.error("JWT token validation failed: " + e.getMessage());
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"success\":false,\"code\":\"UNAUTHORIZED\",\"message\":\"登录已失效，请重新登录\"}");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }
}
