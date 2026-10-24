package com.eggworld.controller;

import com.eggworld.dto.ChatMessageDTO;
import com.eggworld.service.ChatMessageService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/** STOMP 消息入口：/app/chat/{conversationId}/send。 */
@Controller
@RequiredArgsConstructor
public class ChatWsController {

    private final ChatMessageService messageService;

    @MessageMapping("/chat/{conversationId}/send")
    public void send(@DestinationVariable Long conversationId, @Payload ChatMessageDTO dto, Principal principal) {
        if (principal == null) throw new IllegalArgumentException("未登录");
        messageService.send(Long.valueOf(principal.getName()), conversationId, dto);
    }
}
