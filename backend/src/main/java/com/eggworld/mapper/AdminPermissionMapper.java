package com.eggworld.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.dto.AdminPermissionUserVO;
import com.eggworld.dto.PermissionAuditVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 管理端「权限管理」列表查询（原生 SQL，与 {@link AdminUserMapper} 同策略）
 *
 * <p>注意 1：原生 SQL 不会自动追加逻辑删除过滤，必须显式写 {@code u.deleted = 0}。
 * <p>注意 2：用户列表只列学生（含副管理员，其 role 仍为 student）；主管理员账号（role='admin'）不在其中。
 * <p>注意 3：每人的已授权权限点由 Service 另查 {@code user_permissions} 回填（列表不再按单一权限点筛选）。
 * <p>注意 4：排序带次级键 {@code u.id}，避免注册时间相同的行在分页时重复 / 漏掉。
 */
@Mapper
public interface AdminPermissionMapper {

    /**
     * 用户列表分页（不含权限点：授权状态由 Service 回填）
     *
     * @param keyword 昵称 / 邮箱模糊匹配；为 null 表示不筛（调用方把空白串转成 null）
     */
    @Select("<script>"
            + "SELECT u.id, u.nickname, u.email, u.school, u.major"
            + " FROM users u"
            + " WHERE u.deleted = 0 AND u.role = 'student'"
            + " <if test='keyword != null'>"
            + "   AND (u.nickname LIKE CONCAT('%', #{keyword}, '%')"
            + "        OR u.email LIKE CONCAT('%', #{keyword}, '%'))"
            + " </if>"
            + " ORDER BY u.created_at DESC, u.id DESC"
            + "</script>")
    Page<AdminPermissionUserVO> selectUserPage(Page<AdminPermissionUserVO> page,
                                               @Param("keyword") String keyword);

    /**
     * 审计列表分页（时间倒序；带操作人与被操作人昵称）
     */
    @Select("SELECT a.id, a.operator_id, o.nickname AS operator_nickname,"
            + " a.target_user_id, t.nickname AS target_nickname,"
            + " a.perm_code, a.action, a.created_at"
            + " FROM permission_audit a"
            + " LEFT JOIN users o ON o.id = a.operator_id"
            + " LEFT JOIN users t ON t.id = a.target_user_id"
            + " ORDER BY a.created_at DESC, a.id DESC")
    Page<PermissionAuditVO> selectAuditPage(Page<PermissionAuditVO> page);
}
