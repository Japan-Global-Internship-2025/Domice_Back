// ===================== 인증 / 권한 =====================

// 인증 미들웨어
const authenticateToken = (req, res, next) => {
    const token = req.cookies.access_token;
    console.log(token);

    if (!token) {
        return sendErr(res, "Unauthorized", "로그인이 필요합니다.", 401);
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        console.error("JWT 검증 에러:", err);
        return sendErr(res, "Forbidden", "유효하지 않거나 만료된 토큰입니다.", 403);
    }
}

// 선생님(관리자) 전용 미들웨어
const requireTeacher = (req, res, next) => {
    if (!req.user || req.user.role !== "teacher") {
        return sendErr(res, "FORBIDDEN", "선생님만 이용할 수 있는 기능입니다.", 403);
    }
    next();
}

//토큰 생성 함수
const generateToken = (payload) => {
    const token = jwt.sign(
        payload,
        JWT_SECRET, // 서명에 사용할 비밀 키
        {
            expiresIn: '30d', // 토큰 만료 시간 설정
            issuer: 'domice', // 토큰 발행자 정보 (선택 사항)
        }
    );
    return token;
}

export { authenticateToken, requireTeacher, generateToken };