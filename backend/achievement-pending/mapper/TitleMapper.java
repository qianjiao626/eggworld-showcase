package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.Title;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 称号定义 Mapper
 */
@Mapper
public interface TitleMapper extends BaseMapper<Title> {

    @Select("SELECT * FROM titles ORDER BY sort_order, id")
    List<Title> selectAllOrdered();
}
