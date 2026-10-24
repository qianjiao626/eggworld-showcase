package com.eggworld.dto;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CheckinVO {
    private boolean checked;
    private int expReward;
    private int pointReward;
    private int totalExp;
    private int totalPoints;
}
