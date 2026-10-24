package com.eggworld.controller;

import com.eggworld.annotation.AdminOnly;
import com.eggworld.common.Result;
import com.eggworld.common.UserContext;
import com.eggworld.dto.DormitoryImageVO;
import com.eggworld.dto.DormitoryNoteVO;
import com.eggworld.service.DormitoryNoteService;
import com.eggworld.dto.DormitoryProfileVO;
import com.eggworld.service.DormitoryService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/dormitories")
@RequiredArgsConstructor
public class DormitoryController {
    private final DormitoryService service;
    private final DormitoryNoteService noteService;

    @GetMapping
    public Result<DormitoryProfileVO> profile(@RequestParam String school) {
        return Result.ok(service.getProfile(school));
    }

    @GetMapping("/images/{id}")
    public void image(@PathVariable Long id, HttpServletResponse response) throws IOException {
        byte[] bytes = service.getApprovedImage(id);
        String type = service.getApprovedImageType(id);
        response.setContentType(type == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : type);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setContentLength(bytes.length);
        response.getOutputStream().write(bytes);
    }

    @GetMapping("/review/images/{id}")
    public void reviewImage(@PathVariable Long id, HttpServletResponse response) throws IOException {
        byte[] bytes = service.getReviewImage(UserContext.userId(), id);
        String type = service.getReviewImageType(UserContext.userId(), id);
        response.setContentType(type == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : type);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setContentLength(bytes.length);
        response.getOutputStream().write(bytes);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<List<DormitoryImageVO>> upload(@RequestParam String school,
                                                  @RequestParam("files") List<MultipartFile> files,
                                                  @RequestParam(required = false) String campus,
                                                  @RequestParam(required = false) String building) {
        return Result.ok(service.upload(school, campus, building, UserContext.userId(), files));
    }

    @GetMapping("/mine")
    public Result<List<DormitoryImageVO>> mine() {
        return Result.ok(service.listMine(UserContext.userId()));
    }

    @GetMapping("/review/pending")
    public Result<List<DormitoryImageVO>> pending() {
        return Result.ok(service.pending(UserContext.userId()));
    }

    @PostMapping("/review/{id}")
    public Result<Void> review(@PathVariable Long id, @RequestBody(required = false) ReviewRequest request) {
        ReviewRequest body = request == null ? new ReviewRequest() : request;
        service.review(UserContext.userId(), id, body.isApprove(), body.getReason());
        return Result.ok();
    }

    @GetMapping("/notes")
    public Result<List<DormitoryNoteVO>> notes(@RequestParam String school) {
        return Result.ok(noteService.listApproved(school));
    }

    @PostMapping("/notes")
    public Result<Void> submitNote(@RequestBody NoteRequest request) {
        noteService.submit(request.getSchool(), request.getCampus(), request.getBuilding(), request.getContent(),
                request.getSourceUrl(), UserContext.userId());
        return Result.ok();
    }

    @GetMapping("/mine/notes")
    public Result<List<DormitoryNoteVO>> myNotes() {
        return Result.ok(noteService.listMine(UserContext.userId()));
    }

    @GetMapping("/review/notes/pending")
    public Result<List<DormitoryNoteVO>> pendingNotes() {
        return Result.ok(noteService.pending(UserContext.userId()));
    }

    @PostMapping("/review/notes/{id}")
    public Result<Void> reviewNote(@PathVariable Long id, @RequestBody(required = false) ReviewRequest request) {
        ReviewRequest body = request == null ? new ReviewRequest() : request;
        noteService.review(UserContext.userId(), id, body.isApprove(), body.getReason());
        return Result.ok();
    }

    @Data
    public static class NoteRequest {
        private String school;
        private String campus;
        private String building;
        private String content;
        private String sourceUrl;
    }

    @AdminOnly
    @PutMapping("/reviewers/{userId}")
    public Result<Void> setReviewer(@PathVariable Long userId, @RequestParam boolean active) {
        service.setReviewer(userId, active, UserContext.userId());
        return Result.ok();
    }

    @GetMapping("/reviewer/me")
    public Result<Boolean> reviewerMe() {
        return Result.ok(service.isReviewer(UserContext.userId()));
    }

    @Data
    public static class ReviewRequest {
        private boolean approve;
        private String reason;
    }
}
