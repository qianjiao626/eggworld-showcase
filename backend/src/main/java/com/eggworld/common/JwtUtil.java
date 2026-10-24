package com.eggworld.common;

import com.eggworld.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT 工具类（jjwt 0.12.x API）
 * - 签发：userId + role + nickname，有效期 7 天
 * - 解析：返回 LoginUser，失败返回 null
 */
@Component
public class JwtUtil {

    private final SecretKey key;
    private final long expireMillis;

    public JwtUtil(AppProperties props) {
        // 密钥至少 32 字符，否则 hmacShaKeyFor 会抛异常
        this.key = Keys.hmacShaKeyFor(props.getJwt().getSecret().getBytes(StandardCharsets.UTF_8));
        this.expireMillis = props.getJwt().expireMillis();
    }

    /** 签发 token */
    public String createToken(LoginUser user) {
        Date now = new Date();
        return Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .claim("role", user.getRole())
                .claim("nickname", user.getNickname())
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expireMillis))
                .signWith(key)
                .compact();
    }

    /** 解析 token，失败返回 null（过期/篡改/格式错误） */
    public LoginUser parseToken(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return new LoginUser(
                    Long.valueOf(claims.getSubject()),
                    claims.get("role", String.class),
                    claims.get("nickname", String.class)
            );
        } catch (Exception e) {
            return null;
        }
    }
}
