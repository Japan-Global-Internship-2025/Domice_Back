import { supabase } from '../utils/supabase.js';
import { sendOk, sendErr } from '../utils/send.js';
import { getSortOption } from '../utils/sort.js';

// ===================== 1:1 문의(inquires) =====================

// 1대1 문의글 작성
const createInquire = async (req, res) => {
    try {
        const { title, content } = req.body;
        const user_id = req.user.id;

        if (!title || !content) {
            return sendErr(res, "BAD_REQUEST", "제목과 내용은 필수입니다.", 400);
        }

        const { error } = await supabase.from("inquires").insert({
            title,
            content,
            user_id,
        });

        if (error) {
            console.error("1대1 문의글 작성 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "1대1 문의글 작성 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, true, 201);
    } catch (e) {
        console.error("1대1 문의글 작성 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
};

const inquireList = async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 20, 50);
        const user_id = req.user.id;
        const role = req.user.role
        const { column, ascending } = getSortOption(req, "created_at");

        let query = supabase
            .from("inquires")
            .select("id, title, content, reply, user_id, created_at, updated_at");

        if (role !== 'teacher') {
            query = query.eq("user_id", user_id);
        }

        query = query
            .order(column, { ascending })
            .order("created_at", { ascending: false })
            .limit(limit);

        const { data, error } = await query;

        if (error) {
            console.error("1대1 문의 목록 조회 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "1대1 문의 목록 조회 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, data);
    } catch (e) {
        console.error("1대1 문의 목록 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

// 1대1 문의글 상세 조회
const getInquire = async (req, res) => {
    try {
        const postId = Number(req.params.postId);

        if (Number.isNaN(postId)) {
            return sendErr(res, "BAD_REQUEST", "유효한 postId가 필요합니다.", 400);
        }

        const { data, error } = await supabase
            .from("inquires")
            .select("id, title, content, reply, user_id, created_at, updated_at")
            .eq("id", postId)
            .single();

        if (error || !data) {
            console.error("1대1 문의 상세 조회 에러:", error);
            return sendErr(res, "NOT_FOUND", "해당 문의글을 찾을 수 없습니다.", 404);
        }

        if (data.user_id !== req.user.id && req.user.role !== "teacher") {
            return sendErr(
                res,
                "FORBIDDEN",
                "본인 또는 선생님만 1대1 문의글을 조회할 수 있습니다.",
                403
            );
        }

        return sendOk(res, data);
    } catch (e) {
        console.error("1대1 문의 상세 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}
const deleteInquire = async (req, res) => {
    try {
        const postId = Number(req.params.postId);

        if (Number.isNaN(postId)) {
            return sendErr(res, "BAD_REQUEST", "유효한 postId가 필요합니다.", 400);
        }

        const { data: post, error: fetchError } = await supabase
            .from("inquires")
            .select("user_id")
            .eq("id", postId)
            .single();

        if (fetchError || !post) {
            console.error("1대1 문의 조회 에러 (삭제 전 확인):", fetchError);
            return sendErr(
                res,
                "NOT_FOUND",
                "삭제할 1대1 문의글을 찾을 수 없습니다.",
                404
            );
        }

        if (post.user_id !== req.user.id) {
            return sendErr(
                res,
                "FORBIDDEN",
                "본인이 작성한 1대1 문의글만 삭제할 수 있습니다.",
                403
            );
        }

        const { error } = await supabase.from("inquires").delete().eq("id", postId);

        if (error) {
            console.error("1대1 문의글 삭제 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "1대1 문의글 삭제 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, true);
    } catch (e) {
        console.error("1대1 문의글 삭제 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

// 1대1 문의 답변 (선생님 전용)
const replyInquire = async (req, res) => {
    try {
        const postId = Number(req.params.postId);
        const { reply } = req.body;

        if (!reply || typeof reply !== "string") {
            return sendErr(res, "BAD_REQUEST", "유효한 reply가 필요합니다.", 400);
        }

        if (Number.isNaN(postId)) {
            return sendErr(res, "BAD_REQUEST", "유효한 postId가 필요합니다.", 400);
        }

        const { data: post, error: fetchError } = await supabase
            .from("inquires")
            .select("id")
            .eq("id", postId)
            .single();

        if (fetchError || !post) {
            console.error("1대1 문의 조회 에러 (답변 전 확인):", fetchError);
            return sendErr(
                res,
                "NOT_FOUND",
                "답변할 1대1 문의글을 찾을 수 없습니다.",
                404
            );
        }

        const { error } = await supabase
            .from("inquires")
            .update({ reply })
            .eq("id", postId);

        if (error) {
            console.error("1대1 문의글 답변 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "1대1 문의글 답변 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, true);
    } catch (e) {
        console.error("1대1 문의글 답변 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

export { createInquire, inquireList, getInquire, deleteInquire, replyInquire };