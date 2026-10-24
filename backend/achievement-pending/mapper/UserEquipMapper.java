package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.dto.DecoVO;
import com.eggworld.entity.UserEquip;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.Collection;
import java.util.List;

/**
 * 用户穿戴 Mapper
 */
@Mapper
public interface UserEquipMapper extends BaseMapper<UserEquip> {

    /**
     * 批量加载多个用户的装扮（单次查询，禁止在循环内逐用户查询）。
     * 称号额外 JOIN titles 带出名称与样式，省去前端二次查表。
     */
    @Select("<script>" +
            "SELECT ue.user_id AS userId," +
            "       ue.aura_key AS aura, ue.cloak_key AS cloak, ue.outfit_key AS outfit," +
            "       ue.frame_key AS frame, ue.charm_key AS charm, ue.skin_key AS skin," +
            "       ue.title_key AS title, t.name AS titleName, t.style_class AS titleStyle " +
            "FROM user_equip ue " +
            "LEFT JOIN titles t ON t.title_key = ue.title_key " +
            "WHERE ue.user_id IN " +
            "<foreach collection='ids' item='id' open='(' separator=',' close=')'>#{id}</foreach>" +
            "</script>")
    List<DecoVO> selectDecosByUserIds(@Param("ids") Collection<Long> ids);
    @Insert("<script>INSERT INTO user_equip (user_id, <choose><when test='slot == \"aura\"'>aura_key</when><when test='slot == \"cloak\"'>cloak_key</when><when test='slot == \"outfit\"'>outfit_key</when><when test='slot == \"frame\"'>frame_key</when><when test='slot == \"charm\"'>charm_key</when><when test='slot == \"title\"'>title_key</when><when test='slot == \"skin\"'>skin_key</when><otherwise>user_id</otherwise></choose>) VALUES (#{userId},#{key}) ON DUPLICATE KEY UPDATE  <choose><when test='slot == \"aura\"'>aura_key</when><when test='slot == \"cloak\"'>cloak_key</when><when test='slot == \"outfit\"'>outfit_key</when><when test='slot == \"frame\"'>frame_key</when><when test='slot == \"charm\"'>charm_key</when><when test='slot == \"title\"'>title_key</when><when test='slot == \"skin\"'>skin_key</when><otherwise>user_id</otherwise></choose> = #{key}</script>")
    int upsertSlot(@Param("userId") Long userId, @Param("slot") String slot, @Param("key") String key);
}
