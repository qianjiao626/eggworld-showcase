package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.GossipPost;
import org.apache.ibatis.annotations.Mapper;

/**
 * 八卦帖子 Mapper
 */
@Mapper
public interface GossipPostMapper extends BaseMapper<GossipPost> {
}
