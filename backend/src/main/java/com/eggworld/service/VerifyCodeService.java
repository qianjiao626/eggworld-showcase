package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.config.AppProperties;
import com.eggworld.service.mail.MailScene;
import com.eggworld.service.mail.MailSendException;
import com.eggworld.service.mail.SesMailClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import java.util.Locale;

import java.security.SecureRandom;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 邮箱验证码服务
 * <p>
 * 验证码缓存于内存（MVP 阶段，二期可换 Redis）。
 * 邮件经 {@link SesMailClient} 以 SES 模板发信方式发送；
 * 未配置发信参数时不发送邮件，仅记录不含敏感信息的诊断；生产必须配置。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VerifyCodeService {

    /** 邮件主题 */
    private static final String MAIL_SUBJECT = "【蛋蛋世界】邮箱验证码";
    /** 验证码模板里的变量名（须与控制台模板一致） */
    private static final String TEMPLATE_VAR = "code";
    /** 验证码最多错误尝试次数 */
    private static final int MAX_VERIFY_ATTEMPTS = 5;

    private final AppProperties props;
    private final SesMailClient mailClient;

    /** 验证码缓存：email → 条目（code + 过期时间 + 发送时间） */
    private final ConcurrentHashMap<String, CodeEntry> cache = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    private long budgetWindow;
    private int budgetUsed;
    private long lastCleanup;
    // Aggregate-only diagnostics, guarded by cache; never key logs by email or code.
    private long admittedTotal, cooldownRejected, capacityRejected, budgetRejected, sendFailures, expiredTotal;
    private int inFlight;
    private boolean quotaDirty;
    private long lastQuotaLogAt;

    /** 先原子预留名额，再在锁外发信；失败/超时也保留冷却，避免快速重试风暴。 */
    public void sendCode(String email) {
        email = normalize(email);
        long now = System.currentTimeMillis();
        CodeEntry entry;
        synchronized (cache) {
            if (now - lastCleanup >= 60_000) cleanupExpired();
            CodeEntry existing = cache.get(email);
            long interval = Math.max(1, props.getMail().getCodeResendIntervalSeconds()) * 1000L;
            if (existing != null && (existing.sending || now - existing.sentAt < interval)) {
                cooldownRejected++; quotaDirty = true;
                throw new com.eggworld.common.RateLimitException(Math.max(1, (interval - (now - existing.sentAt) + 999) / 1000));
            }
            if (existing == null && cache.size() >= Math.max(1, props.getMail().getMaxCodeEntries())) {
                capacityRejected++; quotaDirty = true;
                throw new com.eggworld.common.RateLimitException(60);
            }
            if (now - budgetWindow >= 60_000) { budgetWindow = now; budgetUsed = 0; }
            if (budgetUsed >= Math.max(1, props.getMail().getCodeSendsPerMinute())) {
                budgetRejected++; quotaDirty = true;
                throw new com.eggworld.common.RateLimitException(Math.max(1, (60_000 - (now - budgetWindow) + 999) / 1000));
            }
            budgetUsed++; admittedTotal++; inFlight++; quotaDirty = true;
            String code = String.format("%06d", random.nextInt(1_000_000));
            entry = new CodeEntry(code, now + Math.max(1, props.getMail().getCodeExpireMinutes()) * 60_000L, now);
            entry.sending = true;
            entry.ready = false;
            cache.put(email, entry);
        }
        boolean completed = false;
        try {
            sendMail(email, entry.code);
            synchronized (entry) { entry.ready = true; entry.sending = false; }
            completed = true;
        } catch (RuntimeException e) {
            // 不删除预留条目：超时可能已实际发信；该码不能被消费且同邮箱仍冷却。
            synchronized (entry) { entry.sending = false; entry.ready = false; }
            throw e;
        } finally {
            synchronized (cache) {
                inFlight--;
                if (!completed) sendFailures++;
                quotaDirty = true;
            }
        }
    }

    /** 一次性消费验证码，但保留发送冷却记录。 */
    public void verify(String email, String code) {
        email = normalize(email);
        CodeEntry entry = cache.get(email);
        if (entry == null) throw new BusinessException("请先获取验证码");
        synchronized (entry) {
            if (cache.get(email) != entry || !entry.ready || entry.sending || entry.attempts >= MAX_VERIFY_ATTEMPTS) {
                throw new BusinessException("请先获取验证码");
            }
            if (System.currentTimeMillis() >= entry.expireAt) {
                entry.ready = false;
                throw new BusinessException("验证码已过期，请重新获取");
            }
            if (!entry.code.equals(code)) {
                if (++entry.attempts >= MAX_VERIFY_ATTEMPTS) {
                    throw new BusinessException("验证码错误次数过多，已失效，请重新获取");
                }
                throw new BusinessException("验证码错误，还可尝试 " + (MAX_VERIFY_ATTEMPTS - entry.attempts) + " 次");
            }
            entry.ready = false;
        }
    }

    @Scheduled(fixedDelay = 60_000)
    public void cleanupExpired() {
        synchronized (cache) {
            long now = System.currentTimeMillis();
            long interval = Math.max(1, props.getMail().getCodeResendIntervalSeconds()) * 1000L;
            int previousSize = cache.size();
            cache.entrySet().removeIf(e -> !e.getValue().sending
                    && now >= Math.max(e.getValue().expireAt, e.getValue().sentAt + interval));
            int removed = previousSize - cache.size();
            if (removed > 0) { expiredTotal += removed; quotaDirty = true; }
            lastCleanup = now;
            // Fixed-cardinality cumulative counters; at most one line per minute after activity.
            // This is an internal diagnostic, not a public monitoring endpoint or delivery receipt.
            if (quotaDirty && now - lastQuotaLogAt >= 60_000) {
                lastQuotaLogAt = now; quotaDirty = false;
                log.info("[VERIFY_CODE_QUOTA] entries={} capacity={} windowUsed={} windowLimit={} inFlight={} admittedTotal={} cooldownRejected={} capacityRejected={} budgetRejected={} sendFailures={} expiredTotal={}",
                        cache.size(), Math.max(1, props.getMail().getMaxCodeEntries()),
                        now - budgetWindow >= 60_000 ? 0 : budgetUsed,
                        Math.max(1, props.getMail().getCodeSendsPerMinute()), inFlight, admittedTotal,
                        cooldownRejected, capacityRejected, budgetRejected, sendFailures, expiredTotal);
            }
        }
    }

    private String normalize(String email) {
        if (email == null || email.isBlank() || email.length() > 254) throw new BusinessException("邮箱格式不正确");
        return email.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * 发送验证码邮件。
     * 发信参数或验证码模板未配置时走开发降级：不真发邮件，也不输出邮箱或验证码。
     */
    private void sendMail(String email, String code) {
        if (!mailClient.isConfigured() || mailClient.templateIdOf(MailScene.VERIFY_CODE) <= 0) {
            // 本地测试从桩或隔离缓存取得合成验证码；日志不能成为验证码旁路。
            log.warn("[DEV] 未配置腾讯云 SES 发信参数或验证码模板，验证码邮件未发送");
            return;
        }
        try {
            mailClient.sendTemplate(email, MailScene.VERIFY_CODE, MAIL_SUBJECT, TEMPLATE_VAR, code);
        } catch (MailSendException e) {
            throw new BusinessException(e.getCode(), e.getMessage());
        }
    }

    /** 验证码缓存条目 */
    private static final class CodeEntry {
        private final String code;
        private final long expireAt;
        private final long sentAt;
        private int attempts;
        private volatile boolean sending;
        private boolean ready = true;

        private CodeEntry(String code, long expireAt, long sentAt) {
            this.code = code;
            this.expireAt = expireAt;
            this.sentAt = sentAt;
        }
    }
}
