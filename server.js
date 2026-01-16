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
import { encrypt, decrypt } from './utils/qrCode.js';
import { authenticateToken, requireTeacher, generateToken } from './utils/auth.js';
import { getSortOption } from './utils/sort.js';

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

// 헬스 체크
app.get("/health", (req, res) => {
    return sendOk(res, { ok: true });
});

// ===================== 사감쌤 ===================
app
    .route("/api/teacherInfo")
    .get(authenticateToken, teacherInfo);

// ===================== 공지 =====================
// 공지 전체 목록 조회 (?sort=latest|oldest, ?limit)
app
    .route("/api/notices")
    .get(getNoticeList);

// 오늘 공지 개수 조회 (?grade=1)
app
    .route("/api/notices/today-count")
    .get(authenticateToken, getTodayNoticeCount);

// 공지 작성 (선생님 전용)
app
    .route("/api/notices")
    .post(authenticateToken, requireTeacher, createNotice);

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
app
    .route("/api/posts/my")
    .get(authenticateToken, getMyPostList);


// 게시판 글 상세 조회, 수정, 삭제
app
    .route("/api/posts/:postId")
    .get(getPost)
    .put(authenticateToken, updatePost)
    .delete(authenticateToken, deletePost);

// ===================== 입실 체크 =====================

//QR코드 문자 (암호화)
app
    .route("/api/roomcheckins/qr")
    .get(authenticateToken, requireTeacher, getQRCode);

// 입실 체크 등록: 하교/석식 후/8시 복귀
app
    .route("/api/roomcheckins")
    .post(authenticateToken, roomCheckin);

// 오늘 입실 체크 조회
app
    .route("/api/roomcheckins/today")
    .get(authenticateToken, getTodayRoomCheckins);

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
app
    .route("/api/meritlogs")
    .get(authenticateToken, getMeritlogs);


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
app
    .route("/api/profile")
    .get(authenticateToken, getProfile);

// ===================== 인증 (JWT) =====================

//회원가입
app
    .route("/api/auth/signup")
    .post(signup);

//로그인
app
    .route("/api/auth/login")
    .post(login);

//로그아웃
app
    .route("/api/auth/logout")
    .get(logout);

//내 정보 가져오기
app
    .route("/api/auth/me")
    .get(authenticateToken, getMe);

// ===================== 서버 시작 =====================

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
