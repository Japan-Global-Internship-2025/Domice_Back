
import { supabase } from '../utils/supabase.js';
import { sendOk, sendErr } from '../utils/send.js';
import { generateToken } from '../utils/auth.js';

// 내 정보 조회
const getProfile = async (req, res) => {
    try {
        const user_id = req.user.id;

        const { data, error } = await supabase
            .from("profiles")
            .select(
                "id, name, gender, profile_img, role, stu_details(region, stu_num, room, plus_score, minus_score)"
            )
            .eq("id", user_id)
            .single();

        if (error || !data) {
            console.error("내 정보 조회 에러:", error);
            return sendErr(res, "NOT_FOUND", "프로필 정보를 찾을 수 없습니다.", 404);
        }

        return sendOk(res, data);
    } catch (e) {
        console.error("내 정보 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
};


//회원가입
const signup = async (req, res) => {
    try {
        console.log(req.body);
        const { id,
            name,
            room,
            gender,
            region,
            email,
            profile_img,
            stu_num,
            role } = req.body;

        if (!id) {
            return sendErr(
                res,
                "BAD_REQUEST",
                "유저 ID 정보가 필요합니다.",
                400
            );
        }

        // 1. profiles 테이블 삽입
        const { data: data1, error: error1 } = await supabase
            .from("profiles")
            .insert({
                id,
                name,
                gender,
                email,
                profile_img,
                role
            })
            .select(
                "id, name, gender, email, profile_img, role"
            );

        // 2. profiles 삽입 오류 확인
        if (error1) {
            console.error("supabase profiles 삽입 에러:", error1);
            return sendErr(
                res,
                "SERVER_ERROR",
                "프로필 정보 저장 중 에러가 발생했습니다.",
                500
            );
        }

        // 3. 학생일 경우 추가 정보 삽입
        if (role !== 'teacher') {
            const { data: data2, error: error2 } = await supabase
                .from("stu_details")
                .insert({
                    id,
                    room,
                    region,
                    stu_num
                })
                .select(
                    "id, room, region, stu_num"
                );

            // 4. stu_details 삽입 오류 확인
            if (error2) {
                console.error("supabase stu_details 삽입 에러:", error2);
                return sendErr(
                    res,
                    "SERVER_ERROR",
                    "학생 상세 정보 저장 중 에러가 발생했습니다.",
                    500
                );
            }

        }

        return sendOk(res, data1, 201);

    } catch (e) {
        console.error("회원가입 서버 내부 에러:", e);
        return sendErr(
            res,
            "SERVER_ERROR",
            "서버 내부 오류가 발생했습니다.",
            500
        );
    }
}

//로그인
const login = async (req, res) => {
    console.log(req.secure);
    try {
        const { accessToken } = req.body;
        let userData;
        if (!accessToken) {
            return sendErr(
                res,
                "BAD_REQUEST",
                "access_token이 필요합니다.",
                400
            );
        }

        try {
            const response = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            if (!response.ok) throw new Error("Google API 호출 실패"); // 실패 시 throw
            userData = await response.json();

            if (userData.email === 'kjt081025@gmail.com') {
                userData.role = 'teacher';
                userData.stu_num = null;
            }
            else if (userData.email.split("@")[1] != "e-mirim.hs.kr") {
                return sendErr(res,
                    "Forbiddena",
                    "미림마이스터고등학교 구글 계정만 가능합니다.",
                    403);
            }
            else {
                userData.stu_num = userData.family_name.slice(0, 4);
                userData.role = 'student';
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
        }
        const id = userData.id;
        console.log(id);

        const { data, error } = await supabase
            .from("profiles")
            .select("*, stu_details(*)")
            .eq("id", id)

        console.log(data);

        const userExists = data && data.length > 0;
        const dbUser = userExists ? data[0] : null;

        // 3. 안전하게 데이터 할당
        userData.join = userExists;
        userData.role = dbUser?.role || userData.role;

        if (error) {
            console.error("로그인 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "유저 조회중 에러가 발생했습니다.",
                500
            );
        }

        const payload = {
            id: userData.id,
            role: userData.role,
            stu_num: userData.stu_num,
        };

        const token = generateToken(payload);

        res.cookie('access_token', token, {
            maxAge: 1000 * 60 * 60 * 24 * 30,
            httpOnly: true,
            // secure: req.secure,
            secure: true,
            // sameSite: req.secure ? 'None' : 'lax',
            sameSite: 'none',
            path: '/',
        });

        return sendOk(res, userData);
    } catch (e) {
        console.error("로그인 에러:", e);
        return sendErr(
            res,
            "SERVER_ERROR",
            "서버 내부 오류가 발생했습니다.",
            500
        );
    }
}

//로그아웃
const logout = async (req, res) => {
    res.clearCookie('access_token', {
        httpOnly: true,
        // secure: req.secure,
        secure: true,
        // sameSite: req.secure ? 'None' : 'lax',
        sameSite: 'none'
    });

    return sendOk(res, { success: "true" });
}

//내 정보 가져오기
const getMe = async (req, res) => {
    try {
        const user_id = req.user.id;

        const { data, error } = await supabase
            .from("profiles")
            .select(`id, name, role, gender, stu_details (region) `)
            .eq("id", user_id)
            .single();

        console.log(data);

        if (error || !data) {
            console.error("내 정보 조회 에러:", error);
            return sendErr(
                res,
                "NOT_FOUND",
                "정보를 찾을 수 없습니다.",
                404
            );
        }

        return sendOk(res, data);

    } catch (e) {
        console.error("내 정보 조회 예외:", e);
        return sendErr(
            res,
            "SERVER_ERROR",
            "서버 내부 오류가 발생했습니다.",
            500
        );
    }
}

export { getProfile, signup, login, logout, getMe };