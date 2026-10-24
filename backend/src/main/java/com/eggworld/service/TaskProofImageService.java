package com.eggworld.service;

import com.eggworld.common.BusinessException;
import com.eggworld.dto.TaskProofImageVO;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 任务「技能证明图片」：发布任务时选填上传，任务详情页在「任务描述」之前展示。
 *
 * 为什么单独一套（而不是复用宿舍目录的上传）：
 *   · 宿舍图是「先审后公开」的业务（有 pending/approved 状态与审核员名单），任务证明图随任务一起送审，
 *     不需要自己的审核状态，复用会把两套状态机搅在一起；
 *   · 但校验与落盘方式刻意与宿舍保持一致：同一个 5MB 上限、同一套文件头签名校验
 *     （复用 DormitoryImageValidator，不另写一份）、同样「库里存 key、字节落盘」。
 *
 * 权限口径（写入要登录、读取公开）：
 *   · 上传：必须登录，图登记在 uploader_id 名下；
 *   · 读取：公开可读，与 /api/dormitories/images/{id} 同一策略——任务详情本来就是匿名可读接口，
 *     图片地址里的 id 是随机自增主键、不可枚举出内容；若改成「只有上传者能读」，
 *     未登录访客打开广场任务详情就看不到证明图，而「看图核实技能」正是这个功能的用途。
 */
@Service
@RequiredArgsConstructor
public class TaskProofImageService {

    /** 单张上限与宿舍目录一致（spring.servlet.multipart.max-file-size 也是 5MB） */
    public static final int MAX_BYTES = DormitoryImageValidator.MAX_BYTES;

    private final JdbcTemplate jdbc;

    @Value("${eggworld.task-proof.upload-dir:/home/xiaos/eggworld/uploads/task-proof}")
    private String uploadDirectory;

    /**
     * 保存一张证明图片：校验 → 落盘 → 登记元数据，返回可直接回填到发布请求的 id。
     * 登记失败会把刚落盘的文件删掉，不留孤儿文件。
     */
    public TaskProofImageVO save(Long userId, MultipartFile file) {
        if (userId == null) throw new BusinessException(401, "请先登录");
        if (file == null || file.isEmpty()) throw new BusinessException("请选择要上传的图片");
        if (file.getSize() > MAX_BYTES) throw new BusinessException("图片不能超过 5 MB");

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException error) {
            throw new BusinessException("图片读取失败，请重新选择");
        }
        // 只信真实文件头，不信前端声明的 MIME（与宿舍上传同一套校验）
        DormitoryImageValidator.validate(bytes, file.getContentType());

        String mediaType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        String extension = switch (mediaType) {
            case "image/jpeg", "image/jpg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            default -> throw new BusinessException("仅支持 JPG、PNG、WebP 图片");
        };

        Path root = Path.of(uploadDirectory).toAbsolutePath().normalize();
        String key = UUID.randomUUID() + extension;
        Path target = root.resolve(key).normalize();
        if (!root.equals(target.getParent())) throw new BusinessException("图片存储路径无效");

        try {
            Files.createDirectories(root);
            Files.write(target, bytes);
        } catch (IOException error) {
            throw new BusinessException("图片保存失败，请稍后重试");
        }

        try {
            jdbc.update("INSERT INTO task_proof_images (uploader_id, image_key, content_type, byte_size, created_at) VALUES (?, ?, ?, ?, NOW())",
                    userId, key, mediaType, bytes.length);
            Long id = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
            TaskProofImageVO vo = new TaskProofImageVO();
            vo.setId(id);
            vo.setByteSize(bytes.length);
            vo.setImageUrl(imageUrlOf(id));
            return vo;
        } catch (RuntimeException error) {
            deleteQuietly(target);
            throw error;
        }
    }

    /** 读取图片字节（公开可读，见类注释的权限口径） */
    public byte[] load(Long id) {
        return readKey(imageKeyOf(id));
    }

    /** 读取图片 MIME，供响应头使用 */
    public String contentTypeOf(Long id) {
        if (id == null || id <= 0) throw new BusinessException(404, "图片不存在");
        List<String> rows = jdbc.query("SELECT content_type FROM task_proof_images WHERE id = ?",
                (rs, rowNum) -> rs.getString("content_type"), id);
        if (rows.isEmpty()) throw new BusinessException(404, "图片不存在");
        return rows.get(0);
    }

    /** 详情页展示地址：主文件与外联 js 都按这个口径拼 */
    public static String imageUrlOf(Long id) {
        return "/api/tasks/proof-images/" + id;
    }

    private String imageKeyOf(Long id) {
        if (id == null || id <= 0) throw new BusinessException(404, "图片不存在");
        List<String> rows = jdbc.query("SELECT image_key FROM task_proof_images WHERE id = ?",
                (rs, rowNum) -> rs.getString("image_key"), id);
        if (rows.isEmpty()) throw new BusinessException(404, "图片不存在");
        return rows.get(0);
    }

    private byte[] readKey(String key) {
        if (!StringUtils.hasText(key)) throw new BusinessException(404, "图片不存在");
        Path root = Path.of(uploadDirectory).toAbsolutePath().normalize();
        Path file = root.resolve(key).normalize();
        // 目录穿越兜底：image_key 来自库，仍按白名单式校验父目录
        if (!root.equals(file.getParent())) throw new BusinessException(404, "图片不存在");
        try {
            return Files.readAllBytes(file);
        } catch (IOException error) {
            throw new BusinessException(404, "图片不存在");
        }
    }

    private void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // 清理失败不影响本次报错语义：真正的错误要原样抛给调用方
        }
    }
}
