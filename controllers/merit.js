import { supabase } from '../utils/supabase.js';
import { sendOk, sendErr } from '../utils/send.js';

// ===================== 상벌점 =====================

// 상벌점 로그 조회 (학생 본인)
const getMeritlogs = async (req, res) => {
    try {
        const user_id = req.user.id;

        const { data, error } = await supabase
            .from("merit_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("상벌점 조회 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "상벌점 조회 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, data);
    } catch (e) {
        console.error("상벌점 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}


// 호실별 학생 목록 조회 (관리자 페이지에서 사용)
// GET /api/admin/rooms/:room/students
const getStudentsByRoom = async (req, res) => {
    try {
        const room = req.params.room; // 예: "301"

        if (!room) {
            return sendErr(res, "BAD_REQUEST", "room 파라미터가 필요합니다.", 400);
        }

        const { data, error } = await supabase
            .from("profiles")
            .select(`
          *, stu_details!inner (*)
        `)
            .eq("role", "student")
            .eq("stu_details.room", room)
            .order("stu_num", {
                ascending: true,
                foreignTable: "stu_details" // 외래 테이블 지정
            });

        if (error) {
            console.error("호실별 학생 조회 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "호실별 학생 조회 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, data);
    } catch (e) {
        console.error("호실별 학생 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

// 선택한 학생에게 상벌점 부여
// POST /api/admin/meritlogs
// body: { user_id, reason, plus_score, minus_score }
const addMerit = async (req, res) => {
    try {
        const { user_id, reason, score, type } = req.body;

        if (!user_id || !reason || !score || !type) {
            return sendErr(
                res,
                "BAD_REQUEST",
                "user_id와 reason, scroe, type은 필수입니다.",
                400
            );
        }

        // 1) meritlogs에 기록 추가
        const { error: insertError } = await supabase.from("merit_logs").insert({
            user_id,
            reason,
            log_type: type === 'plus' ? '상점' : '벌점',
            score: score
        });

        if (insertError) {
            console.error("상벌점 기록 추가 에러:", insertError);
            return sendErr(
                res,
                "SERVER_ERROR",
                "상벌점 기록 추가 중 오류가 발생했습니다.",
                500
            );
        }

        // 2) profiles의 총점 업데이트
        const { data: profile, error: fetchError } = await supabase
            .from("profiles")
            .select("stu_details(plus_score, minus_score)")
            .eq("id", user_id)
            .single();

        if (fetchError || !profile) {
            console.error("프로필 조회 에러 (상벌점 반영 전):", fetchError);
            return sendErr(
                res,
                "NOT_FOUND",
                "해당 학생 프로필을 찾을 수 없습니다.",
                404
            );
        }

        const newPlus = (profile.stu_details.plus_score || 0) + (type == 'plus' && Number(score));
        const newMinus = (profile.stu_details.minus_score || 0) + (type == 'minus' && Number(score));

        const { error: updateError } = await supabase
            .from("stu_details")
            .update({
                plus_score: newPlus,
                minus_score: newMinus,
            })
            .eq("id", user_id);

        if (updateError) {
            console.error("프로필 상벌점 합계 업데이트 에러:", updateError);
            return sendErr(
                res,
                "SERVER_ERROR",
                "상벌점 합계 업데이트 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, true, 201);
    } catch (e) {
        console.error("상벌점 부여 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

export { getMeritlogs, getStudentsByRoom, addMerit };