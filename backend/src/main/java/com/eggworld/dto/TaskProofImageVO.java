package com.eggworld.dto;

import lombok.Data;

/**
 * 任务「技能证明图片」上传结果。
 * 只回传 id 与读取地址：文件本体落盘、库里只留元数据，任务表存 id（见 tasks.proof_image_id）。
 */
@Data
public class TaskProofImageVO {

    /** task_proof_images.id，发布任务时原样回填到 PublishTaskDTO.proofImageId */
    private Long id;

    /** 详情页展示用的读取地址（需登录，带 Bearer token 取，见 TaskProofImageService） */
    private String imageUrl;

    /** 字节数，前端可用于「原图大小」提示 */
    private Integer byteSize;
}
