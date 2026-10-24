package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.PageView;
import org.apache.ibatis.annotations.Mapper;

/**
 * 页面浏览埋点 Mapper（仅写入）
 * 统计类查询统一放在 AdminStatsMapper，便于聚合逻辑集中维护。
 */
@Mapper
public interface PageViewMapper extends BaseMapper<PageView> {
}
