const getPostList = async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 20, 50);
        const { column, ascending } = getSortOption(req, "created_at");

        const { data, error } = await supabase
            .from("posts")
            .select("id, title, content, user_id, is_secret, created_at, updated_at, profiles(name)")
            .order(column, { ascending })
            .limit(limit);

        if (error) {
            console.error("게시글 목록 조회 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "게시글 목록 조회 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, data);
    } catch (e) {
        console.error("게시글 목록 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}
const createPost = async (req, res) => {
    try {
        const { title, content, is_secret } = req.body;

        if (!title || !content) {
            return sendErr(res, "BAD_REQUEST", "title, content는 필수입니다.", 400);
        }

        const user_id = req.user.id;

        const { error } = await supabase.from("posts").insert({
            title,
            content,
            is_secret: !!is_secret,
            user_id,
        });

        if (error) {
            console.error("게시글 작성 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "게시글 작성 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, true, 201);
    } catch (e) {
        console.error("게시글 작성 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

// 내가 쓴 게시글 목록 조회
const getMyPostList = async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = Math.min(Number(req.query.limit) || 20, 50);
        const { column, ascending } = getSortOption(req, "created_at");

        const { data, error } = await supabase
            .from("posts")
            .select("id, title, content, user_id, is_secret, created_at, updated_at, profiles(name)")
            .eq("user_id", userId)
            .order(column, { ascending })
            .limit(limit);

        if (error) {
            console.error("내 게시글 목록 조회 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "내 게시글 목록 조회 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, data);
    } catch (e) {
        console.error("내 게시글 목록 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

// 게시글 상세 조회
const getPost = async (req, res) => {
    try {
        const postId = Number(req.params.postId);

        if (Number.isNaN(postId)) {
            return sendErr(res, "BAD_REQUEST", "유효한 postId가 필요합니다.", 400);
        }

        const { data, error } = await supabase
            .from("posts")
            .select("id, title, content, is_secret, user_id, created_at, updated_at, profiles(name)")
            .eq("id", postId)
            .single();

        if (error || !data) {
            console.error("게시글 상세 조회 에러:", error);
            return sendErr(res, "NOT_FOUND", "해당 게시글을 찾을 수 없습니다.", 404);
        }

        return sendOk(res, data);
    } catch (e) {
        console.error("게시글 상세 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

const updatePost = async (req, res) => {
    try {
        const postId = Number(req.params.postId);

        if (Number.isNaN(postId)) {
            return sendErr(res, "BAD_REQUEST", "유효한 postId가 필요합니다.", 400);
        }

        const { title, content, is_secret } = req.body;

        const { data: post, error: fetchError } = await supabase
            .from("posts")
            .select("user_id")
            .eq("id", postId)
            .single();

        if (fetchError || !post) {
            console.error("게시글 조회 에러 (수정 전 확인):", fetchError);
            return sendErr(res, "NOT_FOUND", "수정할 게시글을 찾을 수 없습니다.", 404);
        }

        if (post.user_id !== req.user.id) {
            return sendErr(
                res,
                "FORBIDDEN",
                "본인이 작성한 게시글만 수정할 수 있습니다.",
                403
            );
        }

        const updateFields = {};
        if (typeof title === "string") updateFields.title = title;
        if (typeof content === "string") updateFields.content = content;
        if (typeof is_secret === "boolean") updateFields.is_secret = is_secret;

        const { error } = await supabase.from("posts").update(updateFields).eq("id", postId);

        if (error) {
            console.error("게시글 수정 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "게시글 수정 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, true);
    } catch (e) {
        console.error("게시글 수정 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

const deletePost = async (req, res) => {
    try {
        const postId = Number(req.params.postId);
        const role = req.user.role;

        if (Number.isNaN(postId)) {
            return sendErr(res, "BAD_REQUEST", "유효한 postId가 필요합니다.", 400);
        }

        const { data: post, error: fetchError } = await supabase
            .from("posts")
            .select("user_id")
            .eq("id", postId)
            .single();

        if (fetchError || !post) {
            console.error("게시글 조회 에러 (삭제 전 확인):", fetchError);
            return sendErr(res, "NOT_FOUND", "삭제할 게시글을 찾을 수 없습니다.", 404);
        }

        if (role != 'teacher' && post.user_id !== req.user.id) {
            return sendErr(
                res,
                "FORBIDDEN",
                "본인이 작성한 게시글만 삭제할 수 있습니다.",
                403
            );
        }

        const { error } = await supabase.from("posts").delete().eq("id", postId);

        if (error) {
            console.error("게시글 삭제 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "게시글 삭제 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, true);
    } catch (e) {
        console.error("게시글 삭제 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

export { getPostList, createPost, getMyPostList, getPost, updatePost, deletePost };