import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getTodayDateStr, getTodayRange, getThisFriday } from './utils/dateFormat.js';
import { createClient } from "@supabase/supabase-js";
import { getProfile, login, logout, getMe, signup } from './controllers/auth.js';
import { getNoticeList, getTodayNoticeCount, createNotice, getNotice, updateNotice, deleteNotice } from './controllers/notice.js';
import { teacherInfo } from './controllers/teacherInfo.js';
import { getPostList, createPost, getMyPostList, getPost, updatePost, deletePost } from './controllers/post.js';
import { getQRCode, roomCheckin, getTodayRoomCheckins } from './controllers/roomCheckins.js';
import { requestLeave, checkLeaveRequest, getLeaveRequests } from './controllers/leave.js';
import { applyStay, getStayStatus } from './controllers/stay.js';
import { getMeritlogs, getStudentsByRoom, addMerit } from './controllers/merit.js';
import { createInquire, inquireList, getInquire, deleteInquire, replyInquire } from './controllers/inquires.js';

dotenv.config();

const app = express();
app.set('trust proxy', true)
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;
const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = crypto.scryptSync(process.env.QR_CODE_KEY, 'salt', 32);
const IV_LENGTH = 16;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[FATAL] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.");
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CORS 설정
const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://domice-front.vercel.app",
    "https://domice-front-72jlh40qc-minjaes-projects-f81b207b.vercel.app",
    "https://begrudgingly-homostyled-ping.ngrok-free.dev",
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // Postman 등
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.warn("[CORS] 허용되지 않은 Origin:", origin);
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

// 유틸 함수
const sendOk = (res, data, status = 200) =>
    res.status(status).json({ success: true, data });

const sendErr = (res, code, message, status = 400) =>
    res.status(status).json({
        success: false,
        error: { code, message },
    });

const getSortOption = (req, defaultColumn = "created_at") => {
    const { sort } = req.query;
    if (sort === "oldest") return { column: defaultColumn, ascending: true };
    return { column: defaultColumn, ascending: false }; // 기본: 최신순
};

// 헬스 체크
app.get("/health", (req, res) => {
    return sendOk(res, { ok: true });
});

// ===================== 인증 / 권한 =====================

// 인증 미들웨어
function authenticateToken(req, res, next) {
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
function requireTeacher(req, res, next) {
    if (!req.user || req.user.role !== "teacher") {
        return sendErr(res, "FORBIDDEN", "선생님만 이용할 수 있는 기능입니다.", 403);
    }
    next();
}

//토큰 생성 함수
function generateToken(payload) {
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

// 암호화 함수
function encrypt(text) {
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// 복호화 함수
function decrypt(text) {
    let textParts = text.split(':');

    if (textParts.length < 2) throw new Error('Invalid QR Format');

    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');

    let decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
}


// ===================== 사감쌤 ===================
app.get("/api/teacherInfo", authenticateToken, teacherInfo);

// ===================== 공지 =====================
// 공지 전체 목록 조회 (?sort=latest|oldest, ?limit)
app.get("/api/notices", getNoticeList);

// 오늘 공지 개수 조회 (?grade=1)
app.get("/api/notices/today-count", authenticateToken, getTodayNoticeCount);

// 공지 작성 (선생님 전용)
app.post("/api/notices", authenticateToken, requireTeacher, createNotice);

// 공지 상세 조회, 수정, 삭제
app
    .route("/api/notices/:noticeId")
    .get(getNotice)
    .put(authenticateToken, requireTeacher, updateNotice)
    .delete(authenticateToken, requireTeacher, deleteNotice);

// ===================== 게시판(전체 게시판) =====================
// 게시판 글 목록 조회 및 작성
app
    .route("/api/posts")
    .get(getPostList)
    .post(authenticateToken, createPost);

// 내 게시판 글 목록 조회
app.get("/api/posts/my", authenticateToken, getMyPostList);


// 게시판 글 상세 조회, 수정, 삭제
app
    .route("/api/posts/:postId")
    .get(getPost)
    .put(authenticateToken, updatePost)
    .delete(authenticateToken, deletePost);

// ===================== 입실 체크 =====================

//QR코드 문자 (암호화)
app.get("/api/roomcheckins/qr", authenticateToken, requireTeacher, getQRCode);

// 입실 체크 등록: 하교/석식 후/8시 복귀
app.post("/api/roomcheckins", authenticateToken, roomCheckin);

// 오늘 입실 체크 조회
app.get("/api/roomcheckins/today", authenticateToken, getTodayRoomCheckins);

// ==================== 외출 신청 및 내역 =================
// 외출 신청 등록 및 내역 조회
app
    .route("/api/leave")
    .post(authenticateToken, requestLeave)
    .get(authenticateToken, getLeaveRequests);

// 외출 신청 승인/반려 (선생님 전용)
app
    .route("/api/leave/check")
    .post(authenticateToken, requireTeacher, checkLeaveRequest);

// ===================== 외박/잔류 여부(stay_status) =====================

// 외박/잔류 여부 제출
// body: { status: "OUT" | "STAY" }
app
    .route("/api/stay")
    .post(authenticateToken, applyStay)
    .get(authenticateToken, getStayStatus);

// ===================== 상벌점 =====================

// 상벌점 로그 조회 (학생 본인)
app.get("/api/meritlogs", authenticateToken, getMeritlogs);


// 호실별 학생 목록 조회 (관리자 페이지에서 사용)
// GET /api/admin/rooms/:room/students
app.get(
    "/api/admin/rooms/:room/students",
    authenticateToken,
    requireTeacher,
    getStudentsByRoom);

// 선택한 학생에게 상벌점 부여
// POST /api/admin/meritlogs
// body: { user_id, reason, plus_score, minus_score }
app.post(
    "/api/admin/meritlogs",
    authenticateToken,
    requireTeacher,
    addMerit);

// ===================== 1:1 문의(inquires) =====================

// 1대1 문의글 작성
app
    .route("/api/inquires")
    .post(authenticateToken, createInquire)
    .get(authenticateToken, inquireList);

// 1대1 문의글 상세 조회
app
    .route("/api/inquires/:postId")
    .get(authenticateToken, getInquire)
    .delete(authenticateToken, deleteInquire);

// 1대1 문의 답변 (선생님 전용)
app.post(
    "/api/inquires/:postId/reply",
    authenticateToken,
    requireTeacher,
    replyInquire
);

// ===================== 내 정보 (profiles + stu_details) =====================

// 내 정보 조회
app.get("/api/profile", authenticateToken, getProfile);

// ===================== 인증 (JWT) =====================

//회원가입
app.post("/api/auth/signup", signup);

//로그인
app.post("/api/auth/login", login);

//로그아웃
app.get("/api/auth/logout", logout);

//내 정보 가져오기
app.get("/api/auth/me", authenticateToken, getMe);

// ===================== 서버 시작 =====================

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
