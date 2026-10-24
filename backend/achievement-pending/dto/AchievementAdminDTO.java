package com.eggworld.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

/** Admin can adjust evaluation only; reward definitions are never accepted from clients. */
@Data
public class AchievementAdminDTO {
    @NotNull @Min(0) @Max(1) private Integer enabled;
    @NotNull @Min(1) @Max(1000000) private Integer condValue;
    @NotNull @Min(0) @Max(1000000) private Integer sortOrder;
}
