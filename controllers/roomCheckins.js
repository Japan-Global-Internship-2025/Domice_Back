// ===================== 입실 체크 =====================

//QR코드 문자 (암호화)
export const getQRCode = async (req, res) => {
    const today = new Date().toISOString().split('T')[0];

    const payload = JSON.stringify({
        date: today,          // 오늘 날짜
        type: 'DOMICE',   // 데이터 타입
        nonce: crypto.randomBytes(4).toString('hex')
    });

    try {
        const qrData = encrypt(payload);
        const data = {
            message: 'QR 코드가 생성되었습니다.',
            qr_raw_data: qrData, // 암호화된 문자열
            note: '이 qr_raw_data 문자열을 QR코드로 변환하세요.'
        }

        return sendOk(res, data, 200);
    } catch (error) {
        return sendErr(res, "SERVER_ERROR", '암호화 실패', 500)
    }
}

// 입실 체크 등록: 하교/석식 후/8시 복귀
// body: { check_type: "AFTER_SCHOOL" | "AFTER_DINNER" | "AFTER_8PM" }
export const roomCheckin = async (req, res) => {
    console.log(req.body);
    const { qrData } = req.body;
    const user_id = req.user.id;

    if (!qrData) {
        return sendErr(res, "Bad_Request", 'QR 데이터가 필요합니다.', 400);
    }

    try {
        const decryptedString = decrypt(qrData);
        const payload = JSON.parse(decryptedString);
        const today = new Date().toISOString().split('T')[0];

        if (payload.type !== 'DOMICE') {
            throw new Error('유효하지 않은 QR 타입');
        }

        // 2-2. 날짜 확인 (오늘 날짜와 QR 날짜가 같은지)
        if (payload.date !== today) {
            return sendErr(res, "Forbidden", "만료된 QR코드", 403);
        }

        // 3. 성공 처리 (DB에 입실 기록 저장 등은 여기서 수행)
        console.log(`[입실 승인] 아이디: ${user_id}, 시간: ${new Date().toLocaleString()}`);

    } catch (error) {
        console.error('복호화 또는 검증 실패:', error.message);
        return sendErr(res, 'Unauthorized', "유효하지 않은 QR코드", 401);
    }

    try {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const totalMinutes = hour * 60 + minute;

        const TIME_LIMITS = {
            AFTER_SCHOOL_START: 960,
            AFTER_DINNER_START: 990,
            AFTER_DINNER_START_ACTUAL: 1040,
            RETURN_8PM_START: 1100,
            RETURN_8PM_END: 1230,
            LATE_START: 1230,
        };

        let check_type;
        if (totalMinutes < TIME_LIMITS.AFTER_SCHOOL_START) {
            check_type = 'EARLY';
        } else if (totalMinutes < TIME_LIMITS.AFTER_DINNER_START) {
            check_type = 'AFTER_SCHOOL';
        } else if (totalMinutes < TIME_LIMITS.RETURN_8PM_START) {
            check_type = 'AFTER_DINNER';
        } else if (totalMinutes < TIME_LIMITS.LATE_START) {
            check_type = 'RETURN_8PM';
        } else {
            check_type = 'LATE';
        }
        const checkDate = getTodayDateStr();
        const checkTime = `${String(now.getHours()).padStart(2, "0")}:${String(
            now.getMinutes()
        ).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

        const { error } = await supabase.from("room_checkins").insert({
            user_id: user_id,
            check_date: checkDate,
            check_time: checkTime,
            check_type,
        });

        if (error) {
            console.error("입실 체크 등록 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "입실 체크 등록 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, true, 201);
    } catch (e) {
        console.error("입실 체크 등록 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}

// 오늘 입실 체크 조회
export const getTodayRoomCheckins = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const checkDate = getTodayDateStr();

        let query = supabase.from('room_checkins')

        if (role !== 'teacher') {
            query = query.select('*').eq("user_id", userId)
        }
        else {
            query = query.select('*, profiles(*, stu_details(*))')
        }

        query = query.eq("check_date", checkDate)
            .order("check_time", { ascending: true });

        let { data, error } = await query

        let processedData = data.map(item => {
            item.isCheckIn = true;
            return item;
        });
        if (error) {
            console.error("오늘 입실 체크 조회 에러:", error);
            return sendErr(
                res,
                "SERVER_ERROR",
                "오늘 입실 체크 조회 중 오류가 발생했습니다.",
                500
            );
        }

        return sendOk(res, processedData);
    } catch (e) {
        console.error("오늘 입실 체크 조회 예외:", e);
        return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
}