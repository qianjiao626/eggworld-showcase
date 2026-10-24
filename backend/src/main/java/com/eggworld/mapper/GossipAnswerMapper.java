package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.GossipAnswer;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Param;

/**
 * 八卦回答 Mapper
 */
@Mapper
public interface GossipAnswerMapper extends BaseMapper<GossipAnswer> {
    @Update("UPDATE gossip_answers SET likes = COALESCE(likes, 0) + 1 WHERE id = #{id}")
    int incrLikes(@Param("id") Long id);
}
