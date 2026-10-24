package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.TaskClaim;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Param;
import com.eggworld.dto.TaskClaimCounts;
import java.util.List;

/**
 * 任务认领 Mapper
 */
@Mapper
public interface TaskClaimMapper extends BaseMapper<TaskClaim> {
    @Select("""
        <script>
        SELECT task_id, COUNT(*) AS claim_count,
          SUM(CASE WHEN selected = 1 AND status IN
            <foreach collection="statuses" item="status" open="(" separator="," close=")">#{status}</foreach>
            THEN 1 ELSE 0 END) AS member_count
        FROM task_claims WHERE task_id IN
          <foreach collection="taskIds" item="id" open="(" separator="," close=")">#{id}</foreach>
        GROUP BY task_id
        </script>
        """)
    List<TaskClaimCounts> countForTasks(@Param("taskIds") List<Long> taskIds, @Param("statuses") List<String> statuses);

}
