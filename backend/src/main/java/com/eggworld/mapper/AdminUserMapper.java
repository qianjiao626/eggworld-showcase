package com.eggworld.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.dto.AdminUserVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;

/**
 * 管理端「用户管理」列表查询（不对应单一实体，与 {@link AdminStatsMapper} 同策略）
 *
 * <p>注意 1：此处为原生 SQL，MyBatis-Plus 的逻辑删除不会自动追加过滤条件，
 * 所以必须显式写 {@code u.deleted = 0}。
 * <p>注意 2：列表要按「邀请人数」排序，而该值需要跨表聚合，故用派生表 LEFT JOIN 一次查出，
 * 避免逐行查询（N+1）。
 * <p>注意 3：排序必须带次级键 {@code u.created_at}，否则邀请数相同的行在分页时可能重复或漏掉。
 * <p>注意 4：列表只列学生（含副管理员，其 role 仍为 student），主管理员账号（role='admin'）不在其中；
 * 该口径与工作台「注册蛋蛋总数」一致，前端角标也用本查询的 total，避免几处数字对不上。
 */
@Mapper
public interface AdminUserMapper {

    /**
     * 用户列表分页（含邀请数统计）
     *
     * @param keyword     昵称 / 邮箱模糊匹配；为 null 表示不筛（调用方负责把空白串转成 null）
     * @param createdFrom 注册时间下限（含）；为 null 表示不筛
     * @param status      active（正常）/ banned（已封禁）；其他值或 null 表示不筛
     * @param sort        created_desc（默认，按注册时间倒序）/ invite_desc / invite_asc
     */
    @Select("<script>"
            + "SELECT u.id, u.nickname, u.email, u.role, u.school, u.major, u.mbti_type, u.points, u.exp,"
            + " u.reputation, u.banned, u.sub_admin, u.created_at,"
            + " COALESCE(g.rewarded, 0) AS invite_count,"
            + " COALESCE(g.pending, 0) AS invite_pending_count"
            + " FROM users u"
            + " LEFT JOIN ("
            + "   SELECT inviter_id,"
            + "          SUM(status = 'rewarded') AS rewarded,"
            + "          SUM(status = 'pending') AS pending"
            + "   FROM invite_records GROUP BY inviter_id"
            + " ) g ON g.inviter_id = u.id"
            + " WHERE u.deleted = 0 AND u.role = 'student'"
            + " <if test='keyword != null'>"
            + "   AND (u.nickname LIKE CONCAT('%', #{keyword}, '%')"
            + "        OR u.email LIKE CONCAT('%', #{keyword}, '%'))"
            + " </if>"
            + " <if test='createdFrom != null'> AND u.created_at &gt;= #{createdFrom}</if>"
            + " <if test=\"status == 'active'\"> AND u.banned = 0</if>"
            + " <if test=\"status == 'banned'\"> AND u.banned = 1</if>"
            + " ORDER BY"
            + " <choose>"
            + "   <when test=\"sort == 'invite_asc'\">invite_count ASC, u.created_at DESC</when>"
            + "   <when test=\"sort == 'invite_desc'\">invite_count DESC, u.created_at DESC</when>"
            + "   <otherwise>u.created_at DESC</otherwise>"
            + " </choose>"
            + "</script>")
    Page<AdminUserVO> selectUserPage(Page<AdminUserVO> page,
                                     @Param("keyword") String keyword,
                                     @Param("createdFrom") LocalDateTime createdFrom,
                                     @Param("status") String status,
                                     @Param("sort") String sort);
}
