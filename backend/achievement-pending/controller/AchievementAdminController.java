package com.eggworld.controller;

import com.eggworld.annotation.AdminOnly;
import com.eggworld.common.BusinessException;
import com.eggworld.common.Result;
import com.eggworld.dto.AchievementAdminDTO;
import com.eggworld.entity.Achievement;
import com.eggworld.mapper.AchievementMapper;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/admin/achievements")
@RequiredArgsConstructor
public class AchievementAdminController {
    private final AchievementMapper mapper;

    @AdminOnly @GetMapping
    public Result<List<Achievement>> list() { return Result.ok(mapper.selectList(null)); }

    @AdminOnly @PutMapping("/{id}")
    public Result<Void> update(@PathVariable Long id, @Valid @RequestBody AchievementAdminDTO dto) {
        Achievement patch = new Achievement();
        patch.setId(id); patch.setEnabled(dto.getEnabled());
        patch.setCondValue(dto.getCondValue()); patch.setSortOrder(dto.getSortOrder());
        if (mapper.updateById(patch) == 0) throw new BusinessException("成就不存在");
        return Result.ok();
    }
}
