package com.eggworld.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.eggworld.common.BusinessException;
import com.eggworld.common.PermCode;
import com.eggworld.dto.AdminPermissionUserVO;
import com.eggworld.dto.PermCodeVO;
import com.eggworld.dto.PermissionAuditVO;
import com.eggworld.dto.PermissionBatchResultVO;
import com.eggworld.dto.PermissionGrantDTO;
import com.eggworld.entity.PermissionAudit;
import com.eggworld.entity.User;
import com.eggworld.entity.UserPermission;
import com.eggworld.mapper.AdminPermissionMapper;
import com.eggworld.mapper.PermissionAuditMapper;
import com.eggworld.mapper.UserMapper;
import com.eggworld.mapper.UserPermissionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 权限管理（学生协管员）
 *
 * <p>两段式权限模型：用户 → 权限点（无角色层）。主管理员 / 副管理员对所有权限点隐式通过，
 * 不落 {@code user_permissions}。授予 / 收回**逐人处理、不做整体回滚**，每次变更写一条审计。
 */
@Service
@RequiredArgsConstructor
public class AdminPermissionService {

    private final UserMapper userMapper;
    private final UserPermissionMapper userPermissionMapper;
    private final PermissionAuditMapper permissionAuditMapper;
    private final AdminPermissionMapper adminPermissionMapper;

    /** 用户列表（含每人已授权的权限点） */
    public IPage<AdminPermissionUserVO> listUsers(String keyword, long page, long size) {
        String kw = StringUtils.hasText(keyword) ? keyword.trim() : null;
        IPage<AdminPermissionUserVO> result = adminPermissionMapper.selectUserPage(new Page<>(page, size), kw);
        List<AdminPermissionUserVO> records = result.getRecords();
        if (records.isEmpty()) {
            return result;
        }
        List<Long> ids = records.stream().map(AdminPermissionUserVO::getId).collect(Collectors.toList());
        Map<Long, List<String>> owned = new HashMap<>();
        for (UserPermission row : userPermissionMapper.selectList(new LambdaQueryWrapper<UserPermission>()
                .in(UserPermission::getUserId, ids))) {
            owned.computeIfAbsent(row.getUserId(), k -> new ArrayList<>()).add(row.getPermCode());
        }
        records.forEach(r -> r.setPermCodes(sortByDeclaration(owned.getOrDefault(r.getId(), List.of()))));
        return result;
    }

    /** 审计列表（时间倒序） */
    public IPage<PermissionAuditVO> listAudit(long page, long size) {
        return adminPermissionMapper.selectAuditPage(new Page<>(page, size));
    }

    /** 权限点清单（代码内枚举） */
    public List<PermCodeVO> listCodes() {
        return Arrays.stream(PermCode.values())
                .map(p -> new PermCodeVO(p.code(), p.label()))
                .collect(Collectors.toList());
    }

    /** 批量授予 */
    @Transactional
    public PermissionBatchResultVO grant(Long operatorId, PermissionGrantDTO dto) {
        return apply(operatorId, dto, true);
    }

    /** 批量收回 */
    @Transactional
    public PermissionBatchResultVO revoke(Long operatorId, PermissionGrantDTO dto) {
        return apply(operatorId, dto, false);
    }

    private PermissionBatchResultVO apply(Long operatorId, PermissionGrantDTO dto, boolean grant) {
        PermCode perm = PermCode.fromCode(dto.getPermCode())
                .orElseThrow(() -> new BusinessException(400, "未知权限点：" + dto.getPermCode()));

        List<Long> ids = dto.getUserIds().stream().filter(Objects::nonNull).distinct().collect(Collectors.toList());
        if (ids.isEmpty()) {
            throw new BusinessException(400, "请至少选择一名用户");
        }

        PermissionBatchResultVO result = new PermissionBatchResultVO();
        for (Long userId : ids) {
            User target = userMapper.selectById(userId);
            if (target == null || (target.getDeleted() != null && target.getDeleted() == 1)) {
                result.addFail(userId, "用户不存在");
                continue;
            }
            if ("admin".equals(target.getRole())) {
                result.addFail(userId, "主管理员无需授权");
                continue;
            }
            boolean already = hasPermission(userId, perm);
            if (grant == already) {
                // 授权时已授权 / 收回时未授权 → 跳过（幂等）
                result.addSkipped();
                continue;
            }
            if (grant) {
                UserPermission row = new UserPermission();
                row.setUserId(userId);
                row.setPermCode(perm.code());
                row.setGrantedBy(operatorId);
                row.setGrantedAt(LocalDateTime.now());
                userPermissionMapper.insert(row);
            } else {
                userPermissionMapper.delete(new LambdaQueryWrapper<UserPermission>()
                        .eq(UserPermission::getUserId, userId)
                        .eq(UserPermission::getPermCode, perm.code()));
            }
            writeAudit(operatorId, userId, perm.code(), grant ? "grant" : "revoke");
            result.addSuccess();
        }
        return result;
    }

    private boolean hasPermission(Long userId, PermCode perm) {
        return userPermissionMapper.selectCount(new LambdaQueryWrapper<UserPermission>()
                .eq(UserPermission::getUserId, userId)
                .eq(UserPermission::getPermCode, perm.code())) > 0;
    }

    private void writeAudit(Long operatorId, Long targetUserId, String permCode, String action) {
        PermissionAudit audit = new PermissionAudit();
        audit.setOperatorId(operatorId);
        audit.setTargetUserId(targetUserId);
        audit.setPermCode(permCode);
        audit.setAction(action);
        audit.setCreatedAt(LocalDateTime.now());
        permissionAuditMapper.insert(audit);
    }

    /** 按 {@link PermCode} 声明顺序排列权限点编码，保证前端标签顺序稳定 */
    private List<String> sortByDeclaration(List<String> codes) {
        return Arrays.stream(PermCode.values())
                .map(PermCode::code)
                .filter(codes::contains)
                .collect(Collectors.toList());
    }
}
