package com.eggworld.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class DormitoryProfileVO {
    private String schoolName;
    private String displayName;
    private String occupancy;
    private String roomConfiguration;
    private String facilities;
    private String accommodationCost;
    private String sourceUrl;
    private Integer sourceYear;
    private String verificationStatus;
    private String note;
    private List<DormitoryImageVO> images;
}
