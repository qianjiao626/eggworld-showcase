package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.ChatConversation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

/** ChatConversation 数据访问。 */
@Mapper
public interface ChatConversationMapper extends BaseMapper<ChatConversation> {

    /**
     * 任务群归档：把会话置为只读（幂等，已是只读则影响 0 行）。
     * 只改 read_only，不动 status —— listConversations / requireActiveConversation 都要求 status='active'，
     * 置成 'archived' 会让群从会话列表消失、连历史消息都读不了。
     */
    @Update("UPDATE chat_conversations SET read_only = 1 WHERE id = #{id} AND read_only = 0")
    int archiveReadOnly(@Param("id") Long id);
}
