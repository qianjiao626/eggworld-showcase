package com.eggworld.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class DormitoryNoteVO {
    private Long id;
    private String schoolName;
    private String campus;
    private String building;
    private String content;
    private String sourceUrl;
    private String status;
    private String reviewReason;
    private LocalDateTime createdAt;
}
