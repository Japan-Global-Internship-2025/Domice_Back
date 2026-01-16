export const applyStay = async (req, res) => {
    try {
        const user_id = req.user.id;
        const { status } = req.body;

        if (!["OUT", "STAY"].includes(status)) {
            return sendErr(
                res,
                "BAD_REQUEST",
                "유효한 상태(status: OUT 또는 STAY)가 필요합니다.",
                400
            );
        }

        const select_date = getThisFriday();

        const { data: existing, error: fetchError } = await supabase
            .from("stay_status")
            .select("id, status")
            .eq("user_id", user_id)
            .eq("select_date", select_date)
            .maybeSingle();

        if (fetchError) {
            console.error("외박/잔류 조회 에러:", fetchError);
            return sendErr(
                res,
                "SERVER_ERROR",
                "외박/잔류 조회 중 오류가 발생했습니다.",
                500
            );
        }

        if (existing) {
            const { error: updateError } = await supabase
                .from("stay_status")
                .update({ status })
                .eq("id", existing.id);

            if (updateError) {
                console.error("외박/잔류 상태 업데이트 에러:", updateError);
                return sendErr(
                    res,
                    "SERVER_ERROR",
                    "외박/잔류 상태 업데이트 중 오류가 발생했습니다.",
                    500
                );
            }

            return sendOk(res, {
                message: "외박/잔류 상태가 수정되었습니다.",
                status,
            });
        } else {
            const { error: insertError } = await supabase.from("stay_status").insert({
                user_id,
                select_date: select_date,
                status,
            });

            if (insertError) {
                console.error("외박/잔류 상태 저장 에러:", insertError);
                return sendErr(
                    res,
                    "SERVER_ERROR",
                    "외박/잔류 상태 저장 중 오류가 발생했습니다.",
                    500
                );
            }

            return sendOk(res, {
                message: "외박/잔류 상태가 저장되었습니다.",
                status,
            });
        }
    } catch (e) {
        console.error("외박/잔류 여부 제출 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

export const getStayStatus = async (req, res) => {
    try {
        const user_id = req.user.id;
        const role = req.user.role;

        let query = supabase
            .from("stay_status")

        if (role === 'teacher') {
            query = query.select("id, select_date, status, profiles(*, stu_details(*))")
        }
        else {
            query = query.select("id, select_date, status").eq("user_id", user_id)
        }


        if (req.query.date) {
            query = query.eq('seletd_date', req.query.date)
        }


        query = query.order("select_date", { ascending: false });

        const { data, error } = await query;

        if (error) {
            console.error("외박/잔류 조회 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "외박/잔류 조회 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, data);
    } catch (e) {
        console.error("외박/잔류 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}