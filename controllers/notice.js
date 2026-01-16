// ===================== 공지 =====================

// 공지 전체 목록 조회 (?sort=latest|oldest, ?limit)
const getNoticeList = async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 20, 50);
        const { column, ascending } = getSortOption(req, "created_at");

        const { data, error } = await supabase
            .from("notices")
            .select("*")
            .order(column, { ascending })
            .limit(limit);

        if (error) {
            console.error("공지 목록 조회 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "공지 목록 조회 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, data);
    } catch (e) {
        console.error("공지 목록 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

// 오늘 공지 개수 조회 (?grade=1)
const getTodayNoticeCount = async (req, res) => {
    try {
        const { grade } = String(req.user.stu_num)[1];
        const { start, end } = getTodayRange();

        let query = supabase
            .from("notices")
            .select("id", { count: "exact", head: true })
            .gte("created_at", start)
            .lte("created_at", end);

        if (grade) {
            query = query.contains("target", [Number(grade)]);
        }

        const { count, error } = await query;

        if (error) {
            console.error("오늘 공지 개수 조회 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "오늘 공지 개수 조회 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, { count: count || 0 });
    } catch (e) {
        console.error("오늘 공지 개수 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

// 공지 작성 (선생님 전용)
// body: { title, content, target_grades: "[1,2,3]" or [1,2,3] }
const createNotice = async (req, res) => {
    try {
        const { title, content, target } = req.body;
        const userId = req.user.id;

        if (!title || !content) {
            return sendErr(res, "BAD_REQUEST", "title, content는 필수입니다.", 400);
        }
        const { data, error } = await supabase
            .from("notices")
            .insert({
                title,
                content,
                target,
                author: userId,
            })
            .select("id, title, content, target, author, created_at")
            .single();

        if (error) {
            console.error("공지 작성 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "공지 작성 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, data, 201);
    } catch (e) {
        console.error("공지 작성 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
};

// 공지 상세 조회
const getNotice = async (req, res) => {
    try {
        const noticeId = Number(req.params.noticeId);

        if (Number.isNaN(noticeId)) {
            return sendErr(res, "BAD_REQUEST", "유효한 noticeId가 필요합니다.", 400);
        }

        const { data, error } = await supabase
            .from("notices")
            .select("id, title, content, target, author, created_at")
            .eq("id", noticeId)
            .single();

        if (error || !data) {
            console.error("공지 상세 조회 에러:", error);
            return sendErr(res, "NOT_FOUND", "해당 공지를 찾을 수 없습니다.", 404);
        }

        return sendOk(res, data);
    } catch (e) {
        console.error("공지 상세 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

const updateNotice = async (req, res) => {
    try {
        const noticeId = Number(req.params.noticeId);
        const { title, content, target } = req.body;

        if (Number.isNaN(noticeId)) {
            return sendErr(res, "BAD_REQUEST", "유효한 noticeId가 필요합니다.", 400);
        }

        const updateFields = {};

        updateFields.title = title;
        updateFields.content = content;
        updateFields.target = target;

        const { error } = await supabase
            .from("notices")
            .update(updateFields)
            .eq("id", noticeId);

        if (error) {
            console.error("공지 수정 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "공지 수정 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, true);
    } catch (e) {
        console.error("공지 수정 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
};

const deleteNotice = async (req, res) => {
    try {
        const noticeId = Number(req.params.noticeId);

        if (Number.isNaN(noticeId)) {
            return sendErr(res, "BAD_REQUEST", "유효한 noticeId가 필요합니다.", 400);
        }

        const { error } = await supabase.from("notices").delete().eq("id", noticeId);

        if (error) {
            console.error("공지 삭제 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "공지 삭제 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, true);
    } catch (e) {
        console.error("공지 삭제 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

export { getNoticeList, createNotice, getNotice, updateNotice, deleteNotice };