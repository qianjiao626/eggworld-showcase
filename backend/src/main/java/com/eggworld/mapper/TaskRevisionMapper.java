package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.TaskRevision;
import org.apache.ibatis.annotations.Mapper;

/**
 * 任务修改稿 Mapper
 */
@Mapper
public interface TaskRevisionMapper extends BaseMapper<TaskRevision> {
}
