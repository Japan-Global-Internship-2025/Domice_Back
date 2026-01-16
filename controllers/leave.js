export const requestLeave = async (req, res) => {
        try {
            const { leave_date, reason } = req.body;
            const user_id = req.user.id;

            if (!leave_date || !reason) {
                return sendErr(
                    res,
                    "BAD_REQUEST",
                    "user_id, leave_date(YYYY-MM-DD), reason은 필수입니다.",
                    400
                );
            }

            const { data, error } = await supabase
                .from("leave_requests")
                .insert({
                    user_id,
                    leave_date,
                    reason,
                })
                .select(
                    "id, user_id, leave_date, reason, created_at"
                )
                .single();

            if (error) {
                console.error("외출 신청 등록 에러:", error);
                return sendErr(
                    res,
                    "SERVER_ERROR",
                    "외출 신청 등록 중 오류가 발생했습니다.",
                    500
                );
            }

            return sendOk(res, data, 201);
        } catch (e) {
            console.error("외출 신청 등록 예외:", e);
            return sendErr(
                res,
                "SERVER_ERROR",
                "서버 내부 오류가 발생했습니다.",
                500
            );
        }
    }

export const getLeaveRequests = async (req, res) => {
        try {
            const limit = Math.min(Number(req.query.limit) || 20, 50);
            const userId = req.user.id;
            const role = req.user.role;

            let query = supabase
                .from("leave_requests")

            if (role !== 'teacher') {
                query = query.select("id, user_id, leave_date, reason, status, approved_at, created_at").eq("user_id", userId);
            }
            else {
                query = query.select("id, user_id, leave_date, reason, status, approved_at, created_at, profiles(*, stu_details(*))");
            }

            query = query.order("created_at", { ascending: false })
                .limit(limit);

            let { data, error } = await query;

            if (error) {
                console.error("외출 신청 내역 조회 에러:", error);
                return sendErr(
                    res,
                    "SERVER_ERROR",
                    "외출 신청 내역 조회 중 오류가 발생했습니다.",
                    500
                );
            }

            return sendOk(res, data);
        } catch (e) {
            console.error("외출 신청 내역 조회 예외:", e);
            return sendErr(
                res,
                "SERVER_ERROR",
                "서버 내부 오류가 발생했습니다.",
                500
            );
        }
    }

export const checkLeaveRequest = async (req, res) => {
    try {
        const { id, approval } = req.body;

        const { data, error } = await supabase
            .from('leave_requests')
            .update({ status: approval ? 1 : 2 })
            .eq('id', id)
            .select();

        if (!data.length) {
            return sendErr(
                res,
                "NOT_FOUND",
                "존재하지 않은 외출 신청건입니다.",
                404
            );
        }

        if (error) {
            console.error("외출 신청 확인 처리 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "외출 신청 확인 처리 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, {
            message: "외출이 확인되었습니다.",
        });
    }
    catch (e) {
        console.error("외출 신청 확인 처리 예외:", e);
        return sendErr(
            res,
            "SERVER_ERROR",
            "서버 내부 오류가 발생했습니다.",
            500
        );
    }
}