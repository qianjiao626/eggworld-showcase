package com.eggworld.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * 读取 application.yml 中 eggworld.* 自定义配置
 */
@Data
@Component
@ConfigurationProperties(prefix = "eggworld")
public class AppProperties {

    /** JWT 相关配置 */
    private Jwt jwt = new Jwt();

    /** 邮件验证码相关配置 */
    private Mail mail = new Mail();

    /** 单实例实时通道资源上限。 */
    private WebSocket websocket = new WebSocket();
    private Traffic traffic = new Traffic();

    /** 功能开关（应急回滚用）：改配置 + 重启即可切回旧流程，不必回滚代码 */
    private Features features = new Features();

    @Data
    public static class Jwt {
        /** 签名密钥（生产环境务必更换） */
        private String secret;
        /** 有效期天数 */
        private int expireDays;

        /** 计算 token 有效毫秒数 */
        public long expireMillis() {
            return expireDays * 24L * 3600 * 1000;
        }
    }

    @Data
    public static class Mail {
        /** 发件人显示名，需与控制台发信地址的别名一致 */
        private String fromName;
        /** 发信地址（腾讯云 SES 控制台已验证的发信地址） */
        private String fromAddress;
        /** 通知类邮件总开关（验证码不受影响） */
        private boolean notifyEnabled = true;
        /** 验证码有效期（分钟）；改动时需同步 SES 模板正文里的有效期文案 */
        private int codeExpireMinutes = 5;
        /** 同邮箱重复发送间隔（秒） */
        private int codeResendIntervalSeconds = 60;
        private int maxCodeEntries = 10000;
        private int codeSendsPerMinute = 300;
        /** 腾讯云邮件推送 SES 配置 */
        private Ses ses = new Ses();
    }

    @Data
    public static class Traffic {
        private int windowSeconds = 60;
        private int maxKeys = 20000;
        // 校园出口共用 IP：IP 额度高于账号额度；不直接信任客户端转发头。
        private Quota read = new Quota(600, 6000, 30000);
        private Quota write = new Quota(120, 1200, 6000);
        private Quota auth = new Quota(30, 120, 1200);
        private Quota verifyCode = new Quota(10, 120, 600);
        private Quota upload = new Quota(20, 200, 1000);
    }
    @Data
    @lombok.AllArgsConstructor
    @lombok.NoArgsConstructor
    public static class Quota {
        private int account;
        private int ip;
        private int global;
    }

    @Data
    public static class WebSocket {
        private int maxConnections = 2000;
        private int maxConnectionsPerUser = 5;
        private int maxSubscriptionsPerConnection = 128;
        private int maxSubscriptionAttemptsPerMinute = 256;
        private int messageSizeLimit = 16384;
        private int sendBufferSizeLimit = 262144;
        private int sendTimeLimitMs = 10000;
        private int timeToFirstMessageMs = 10000;
    }

    /** 腾讯云邮件推送 SES（API 模板发信）配置 */
    @Data
    public static class Ses {
        /** 地域：SES 仅支持 ap-guangzhou / ap-hongkong */
        private String region = "ap-guangzhou";
        /** 云 API SecretId；未配置时不真发邮件，日志不输出邮箱或验证码 */
        private String secretId;
        /** 云 API SecretKey */
        private String secretKey;
        /** 各场景在控制台审核通过的模板 ID：key 取 MailScene#getKey（verify-code / invite-task） */
        private Map<String, Long> templates = new HashMap<>();
        /** 连接超时（秒），防止 API 不可达时请求卡死 */
        private int connectTimeoutSeconds = 5;
        /** 读取超时（秒） */
        private int readTimeoutSeconds = 5;
    }

    /** 功能开关（应急回滚止血用；改完需重启服务才生效） */
    @Data
    public static class Features {
        /**
         * 教学 / 组队任务是否走「上线自动建群 + 认领即入队」新流程。
         * <ul>
         *   <li><b>true（默认）</b>：上线自动建任务群；认领当场占名额、进群，组队同时冻 10 币</li>
         *   <li><b>false（回滚）</b>：不建群，报名进候选池等发布者用 {@code pair()} 挑人，
         *       组队出资回到「发布者选中时」才冻结，联系方式恢复必填</li>
         * </ul>
         * ⚠️ 这是**止血开关**、不是完整回滚：前端文案/按钮与已产生的历史数据不受它影响，
         *    完整回滚见 releases/迁移文档/2026-09-26_任务绑定群聊.md 第六节（恢复 jar + index.html）。
         */
        private boolean taskAutoGroup = true;
    }
}
