import { sendOk, sendErr } from '../utils/send.js';

// ===================== 사감쌤 ===================
const teacherInfo = (req, res) => {
    try {
        const gender = req.query.gender;

        if (!gender) {
            return sendErr(res, "BAD_REQUEST", "gende 필수입니다.", 400);
        }

        const teachers = {
            male: [{ name: '박진리', phone: '010-9876-1234' }, { name: '남택민', phone: '010-1245-5689' }],
            female: [{ name: '김선경', phone: '010-4567-8901' }, { name: '김아람', phone: '010-2468-1357' }]
        }

        const user_gender = gender == 0 ? 'male' : 'female';

        const now = new Date();
        const currentDay = now.getDay();
        const idx = currentDay % 2;

        const data = teachers[user_gender][idx];

        return sendOk(res, data, 200);
    } catch (e) {
        console.error("사감쌤 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

export { teacherInfo };