package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 用户 Mapper
 */
@Mapper
public interface UserMapper extends BaseMapper<User> {

    /**
     * 按邮箱查询用户（登录、查重用）
     */
    @Select("SELECT * FROM users WHERE email = #{email} AND deleted = 0")
    User selectByEmail(@Param("email") String email);

    /**
     * 按 ID 查询并加行锁（蛋蛋币变更时使用，防止并发超扣）
     */
    @Select("SELECT * FROM users WHERE id = #{id} FOR UPDATE")
    User selectByIdForUpdate(@Param("id") Long id);
}
