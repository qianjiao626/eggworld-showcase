package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.GossipLike;
import org.apache.ibatis.annotations.Mapper;

/**
 * 八卦点赞 Mapper
 */
@Mapper
public interface GossipLikeMapper extends BaseMapper<GossipLike> {
}
