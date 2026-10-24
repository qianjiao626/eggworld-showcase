package com.eggworld.dto;

import lombok.Data;
import java.util.List;

@Data
public class ChatHistoryVO {
    private List<ChatMessageVO> records;
    private Long nextBeforeId;
    private boolean hasMore;
}
