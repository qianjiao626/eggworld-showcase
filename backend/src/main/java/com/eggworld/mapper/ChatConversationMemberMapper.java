package com.eggworld.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.eggworld.entity.ChatConversationMember;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.List;

/** ChatConversationMember 数据访问。 */
@Mapper
public interface ChatConversationMemberMapper extends BaseMapper<ChatConversationMember> {
    /** 实时读取权限：一次 JOIN 同时确认账号、会话和成员仍可读。无结果返回 null。 */
    @Select("""
        SELECT 1
        FROM chat_conversation_members m
        JOIN chat_conversations c ON c.id = m.conversation_id
        JOIN users u ON u.id = m.user_id
        WHERE m.conversation_id = #{conversationId}
          AND m.user_id = #{userId}
          AND m.status = 'active'
          AND c.status = 'active'
          AND u.deleted = 0
          AND COALESCE(u.banned, 0) = 0
        LIMIT 1
        """)
    Integer selectReadableConversation(@Param("conversationId") Long conversationId,
                                       @Param("userId") Long userId);

    /** 一条原子 UPDATE 替代逐成员 SELECT/UPDATE；仍会锁住匹配行，容量需另测。 */
    @Update("""
        <script>
        UPDATE chat_conversation_members
        SET unread_count = unread_count + 1,
            mention_unread = mention_unread +
            <choose><when test="mentions != null and !mentions.isEmpty()">
                CASE WHEN user_id IN
                <foreach collection="mentions" item="id" open="(" separator="," close=")">#{id}</foreach>
                THEN 1 ELSE 0 END
            </when><otherwise>0</otherwise></choose>
        WHERE conversation_id = #{conversationId} AND user_id &lt;&gt; #{senderId} AND status = 'active'
        </script>
        """)
    int incrementUnread(@Param("conversationId") Long conversationId, @Param("senderId") Long senderId,
                        @Param("mentions") List<Long> mentions);

}
