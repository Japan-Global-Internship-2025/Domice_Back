import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.set('trust proxy', true)
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;

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

// 오늘 날짜 문자열/범위
const getTodayDateStr = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getTodayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

// 헬스 체크
app.get("/health", (req, res) => {
  return sendOk(res, { ok: true });
});

// ===================== 인증 / 권한 =====================

// 인증 미들웨어
function authenticateToken(req, res, next) {
  const token = req.cookies.access_token;

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

// ===================== 공지 =====================

// 공지 전체 목록 조회 (?sort=latest|oldest, ?limit)
app.get("/api/notices", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const { column, ascending } = getSortOption(req, "created_at");

    const { data, error } = await supabase
      .from("notices")
      .select("id, title, content, target_grades, author, created_at, updated_at")
      .order(column, { ascending })
      .limit(limit);

    if (error) {
      console.error("공지 목록 조회 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "공지 목록 조회 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("공지 목록 조회 예외:", e);
    return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
});

// 오늘 공지 개수 조회 (?grade=1)
app.get("/api/notices/today-count", authenticateToken, async (req, res) => {
  try {
    const { grade } = req.query;
    const { start, end } = getTodayRange();

    let query = supabase
      .from("notices")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lte("created_at", end);

    if (grade) {
      query = query.contains("target_grades", [Number(grade)]);
    }

    const { count, error } = await query;

    if (error) {
      console.error("오늘 공지 개수 조회 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "오늘 공지 개수 조회 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, { count: count || 0 });
  } catch (e) {
    console.error("오늘 공지 개수 조회 예외:", e);
    return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
});

// 공지 작성 (선생님 전용)
// body: { title, content, target_grades: "[1,2,3]" or [1,2,3] }
app.post("/api/notices", authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { title, content, target_grades } = req.body;
    const userId = req.user.id;

    if (!title || !content) {
      return sendErr(res, "BAD_REQUEST", "title, content는 필수입니다.", 400);
    }

    let gradesArray = null;
    if (typeof target_grades === "string") {
      try {
        gradesArray = JSON.parse(target_grades);
      } catch (e) {
        return sendErr(
          res,
          "BAD_REQUEST",
          'target_grades는 "[1,2,3]" 문자열이거나 배열이어야 합니다.',
          400
        );
      }
    } else if (Array.isArray(target_grades)) {
      gradesArray = target_grades;
    }

    const { data, error } = await supabase
      .from("notices")
      .insert({
        title,
        content,
        target_grades: gradesArray,
        author: userId,
      })
      .select("id, title, content, target_grades, author, created_at, updated_at")
      .single();

    if (error) {
      console.error("공지 작성 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "공지 작성 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, data, 201);
  } catch (e) {
    console.error("공지 작성 예외:", e);
    return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
});

// 공지 상세 조회
app.get("/api/notices/:noticeId", async (req, res) => {
  try {
    const noticeId = Number(req.params.noticeId);

    if (Number.isNaN(noticeId)) {
      return sendErr(res, "BAD_REQUEST", "유효한 noticeId가 필요합니다.", 400);
    }

    const { data, error } = await supabase
      .from("notices")
      .select("id, title, content, target_grades, author, created_at, updated_at")
      .eq("id", noticeId)
      .single();

    if (error || !data) {
      console.error("공지 상세 조회 에러:", error);
      return sendErr(res, "NOT_FOUND", "해당 공지를 찾을 수 없습니다.", 404);
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("공지 상세 조회 예외:", e);
    return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
});

// 공지 수정 (선생님 전용)
app.put(
  "/api/notices/:noticeId",
  authenticateToken,
  requireTeacher,
  async (req, res) => {
    try {
      const noticeId = Number(req.params.noticeId);
      const { title, content, target_grades } = req.body;

      if (Number.isNaN(noticeId)) {
        return sendErr(res, "BAD_REQUEST", "유효한 noticeId가 필요합니다.", 400);
      }

      const updateFields = {};

      if (typeof title === "string") updateFields.title = title;
      if (typeof content === "string") updateFields.content = content;

      if (typeof target_grades === "string") {
        try {
          updateFields.target_grades = JSON.parse(target_grades);
        } catch (e) {
          return sendErr(
            res,
            "BAD_REQUEST",
            'target_grades는 "[1,2,3]" 문자열이거나 배열이어야 합니다.',
            400
          );
        }
      } else if (Array.isArray(target_grades)) {
        updateFields.target_grades = target_grades;
      }

      const { error } = await supabase
        .from("notices")
        .update(updateFields)
        .eq("id", noticeId);

      if (error) {
        console.error("공지 수정 에러:", error);
        return sendErr(
          res,
          "SERVER_ERROR",
          "공지 수정 중 오류가 발생했습니다.",
          500
        );
      }

      return sendOk(res, true);
    } catch (e) {
      console.error("공지 수정 예외:", e);
      return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
  }
);

// 공지 삭제 (선생님 전용)
app.delete(
  "/api/notices/:noticeId",
  authenticateToken,
  requireTeacher,
  async (req, res) => {
    try {
      const noticeId = Number(req.params.noticeId);

      if (Number.isNaN(noticeId)) {
        return sendErr(res, "BAD_REQUEST", "유효한 noticeId가 필요합니다.", 400);
      }

      const { error } = await supabase.from("notices").delete().eq("id", noticeId);

      if (error) {
        console.error("공지 삭제 에러:", error);
        return sendErr(
          res,
          "SERVER_ERROR",
          "공지 삭제 중 오류가 발생했습니다.",
          500
        );
      }

      return sendOk(res, true);
    } catch (e) {
      console.error("공지 삭제 예외:", e);
      return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
  }
);

// ===================== 게시판(전체 게시판) =====================

// 게시글 목록 조회 (?sort=latest|oldest, ?limit)
app.get("/api/posts", async (req, res) => {
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
});

// 내가 쓴 게시글 목록 조회
app.get("/api/posts/my", authenticateToken, async (req, res) => {
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
});

// 게시글 작성
app.post("/api/posts", authenticateToken, async (req, res) => {
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
});

// 게시글 상세 조회
app.get("/api/posts/:postId", async (req, res) => {
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
});

// 게시글 수정
app.put("/api/posts/:postId", authenticateToken, async (req, res) => {
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
});

// 게시글 삭제
app.delete("/api/posts/:postId", authenticateToken, async (req, res) => {
  try {
    const postId = Number(req.params.postId);

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

    if (post.user_id !== req.user.id) {
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
});

// ===================== 입실 체크 =====================

// 입실 체크 등록: 하교/석식 후/8시 복귀
// body: { check_type: "AFTER_SCHOOL" | "AFTER_DINNER" | "AFTER_8PM" }
app.post("/api/roomcheckins", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { check_type } = req.body;

    if (!["AFTER_SCHOOL", "AFTER_DINNER", "AFTER_8PM"].includes(check_type)) {
      return sendErr(res, "BAD_REQUEST", "유효하지 않은 check_type입니다.", 400);
    }

    const now = new Date();
    const checkDate = getTodayDateStr();
    const checkTime = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    const { error } = await supabase.from("roomcheckins").insert({
      user_id: userId,
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
});

// 오늘 입실 체크 조회
app.get("/api/roomcheckins/today", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const checkDate = getTodayDateStr();

    const { data, error } = await supabase
      .from("roomcheckins")
      .select("id, check_date, check_time, check_type")
      .eq("user_id", userId)
      .eq("check_date", checkDate)
      .order("check_time", { ascending: true });

    if (error) {
      console.error("오늘 입실 체크 조회 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "오늘 입실 체크 조회 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("오늘 입실 체크 조회 예외:", e);
    return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
});

// ===================== 외출/잔류 여부(stay_status) =====================

// 외출/잔류 여부 제출
// body: { status: "OUT" | "STAY" }
app.post("/api/stay", authenticateToken, async (req, res) => {
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

    const dateString = getTodayDateStr();

    const { data: existing, error: fetchError } = await supabase
      .from("stay_status")
      .select("id, status")
      .eq("user_id", user_id)
      .eq("date", dateString)
      .maybeSingle();

    if (fetchError) {
      console.error("외출/잔류 조회 에러:", fetchError);
      return sendErr(
        res,
        "SERVER_ERROR",
        "외출/잔류 조회 중 오류가 발생했습니다.",
        500
      );
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("stay_status")
        .update({ status })
        .eq("id", existing.id);

      if (updateError) {
        console.error("외출/잔류 상태 업데이트 에러:", updateError);
        return sendErr(
          res,
          "SERVER_ERROR",
          "외출/잔류 상태 업데이트 중 오류가 발생했습니다.",
          500
        );
      }

      return sendOk(res, {
        message: "외출/잔류 상태가 수정되었습니다.",
        status,
      });
    } else {
      const { error: insertError } = await supabase.from("stay_status").insert({
        user_id,
        date: dateString,
        status,
      });

      if (insertError) {
        console.error("외출/잔류 상태 저장 에러:", insertError);
        return sendErr(
          res,
          "SERVER_ERROR",
          "외출/잔류 상태 저장 중 오류가 발생했습니다.",
          500
        );
      }

      return sendOk(res, {
        message: "외출/잔류 상태가 저장되었습니다.",
        status,
      });
    }
  } catch (e) {
    console.error("외출/잔류 여부 제출 예외:", e);
    return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
});

// 외출/잔류 기록 조회 (내가 제출한 것들)
app.get("/api/stay", authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id;

    const { data, error } = await supabase
      .from("stay_status")
      .select("id, date, status")
      .eq("user_id", user_id)
      .order("date", { ascending: false });

    if (error) {
      console.error("외출/잔류 조회 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "외출/잔류 조회 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("외출/잔류 조회 예외:", e);
    return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
});

// ===================== 상벌점 =====================

// 상벌점 로그 조회 (학생 본인)
app.get("/api/meritlogs", authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id;

    const { data, error } = await supabase
      .from("meritlogs")
      .select("id, reason, plus_score, minus_score, created_at")
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
});


// 호실별 학생 목록 조회 (관리자 페이지에서 사용)
// GET /api/admin/rooms/:room/students
app.get(
  "/api/admin/rooms/:room/students",
  authenticateToken,
  requireTeacher,
  async (req, res) => {
    try {
      const room = req.params.room; // 예: "301"

      if (!room) {
        return sendErr(res, "BAD_REQUEST", "room 파라미터가 필요합니다.", 400);
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(`
          id,
          name,
          gender,
          profile_img,
          room,
          role,
          stu_details (
            region,
            stu_num
          )
        `)
        .eq("role", "student")
        .eq("room", room)
        .order("id", { ascending: true });

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
);

// 선택한 학생에게 상벌점 부여
// POST /api/admin/meritlogs
// body: { user_id, reason, plus_score, minus_score }
app.post(
  "/api/admin/meritlogs",
  authenticateToken,
  requireTeacher,
  async (req, res) => {
    try {
      const { user_id, reason, plus_score = 0, minus_score = 0 } = req.body;

      if (!user_id || !reason) {
        return sendErr(
          res,
          "BAD_REQUEST",
          "user_id와 reason은 필수입니다.",
          400
        );
      }

      const plus = Number(plus_score) || 0;
      const minus = Number(minus_score) || 0;

      if (plus === 0 && minus === 0) {
        return sendErr(
          res,
          "BAD_REQUEST",
          "plus_score 또는 minus_score 중 하나는 0이 아니어야 합니다.",
          400
        );
      }

      // 1) meritlogs에 기록 추가
      const { error: insertError } = await supabase.from("meritlogs").insert({
        user_id,
        reason,
        plus_score: plus,
        minus_score: minus,
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
        .select("plus_score, minus_score")
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

      const newPlus = (profile.plus_score || 0) + plus;
      const newMinus = (profile.minus_score || 0) + minus;

      const { error: updateError } = await supabase
        .from("profiles")
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

      return sendOk(res, {
        user_id,
        reason,
        plus_score: plus,
        minus_score: minus,
        total_plus_score: newPlus,
        total_minus_score: newMinus,
      });
    } catch (e) {
      console.error("상벌점 부여 예외:", e);
      return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
  }
);

// ===================== 1:1 문의(inquires) =====================

// 1대1 문의글 작성
app.post("/api/inquires", authenticateToken, async (req, res) => {
  try {
    const { title, content } = req.body;
    const user_id = req.user.id;

    if (!title || !content) {
      return sendErr(res, "BAD_REQUEST", "제목과 내용은 필수입니다.", 400);
    }

    const { error } = await supabase.from("inquires").insert({
      title,
      content,
      user_id,
    });

    if (error) {
      console.error("1대1 문의글 작성 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "1대1 문의글 작성 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, true, 201);
  } catch (e) {
    console.error("1대1 문의글 작성 예외:", e);
    return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
});

// 1대1 문의 목록 조회 (?sort=latest|oldest)
app.get("/api/inquires", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const user_id = req.user.id;
    const role = req.user.role
    const { column, ascending } = getSortOption(req, "created_at");

    let query = supabase
      .from("inquires")
      .select("id, title, content, reply, user_id, created_at, updated_at");

    if (role !== 'teacher') {
      query = query.eq("user_id", user_id);
    }

    query = query
      .order(column, { ascending })
      .order("created_at", { ascending: false })
      .limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error("1대1 문의 목록 조회 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "1대1 문의 목록 조회 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("1대1 문의 목록 조회 예외:", e);
    return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
});

// 1대1 문의글 상세 조회
app.get("/api/inquires/:postId", authenticateToken, async (req, res) => {
  try {
    const postId = Number(req.params.postId);

    if (Number.isNaN(postId)) {
      return sendErr(res, "BAD_REQUEST", "유효한 postId가 필요합니다.", 400);
    }

    const { data, error } = await supabase
      .from("inquires")
      .select("id, title, content, reply, user_id, created_at, updated_at")
      .eq("id", postId)
      .single();

    if (error || !data) {
      console.error("1대1 문의 상세 조회 에러:", error);
      return sendErr(res, "NOT_FOUND", "해당 문의글을 찾을 수 없습니다.", 404);
    }

    if (data.user_id !== req.user.id && req.user.role !== "teacher") {
      return sendErr(
        res,
        "FORBIDDEN",
        "본인 또는 선생님만 1대1 문의글을 조회할 수 있습니다.",
        403
      );
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("1대1 문의 상세 조회 예외:", e);
    return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
});

// 1대1 문의글 삭제 (작성자만)
app.delete("/api/inquires/:postId", authenticateToken, async (req, res) => {
  try {
    const postId = Number(req.params.postId);

    if (Number.isNaN(postId)) {
      return sendErr(res, "BAD_REQUEST", "유효한 postId가 필요합니다.", 400);
    }

    const { data: post, error: fetchError } = await supabase
      .from("inquires")
      .select("user_id")
      .eq("id", postId)
      .single();

    if (fetchError || !post) {
      console.error("1대1 문의 조회 에러 (삭제 전 확인):", fetchError);
      return sendErr(
        res,
        "NOT_FOUND",
        "삭제할 1대1 문의글을 찾을 수 없습니다.",
        404
      );
    }

    if (post.user_id !== req.user.id) {
      return sendErr(
        res,
        "FORBIDDEN",
        "본인이 작성한 1대1 문의글만 삭제할 수 있습니다.",
        403
      );
    }

    const { error } = await supabase.from("inquires").delete().eq("id", postId);

    if (error) {
      console.error("1대1 문의글 삭제 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "1대1 문의글 삭제 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, true);
  } catch (e) {
    console.error("1대1 문의글 삭제 예외:", e);
    return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
});

// 1대1 문의 답변 (선생님 전용)
app.post(
  "/api/inquires/:postId/reply",
  authenticateToken,
  requireTeacher,
  async (req, res) => {
    try {
      const postId = Number(req.params.postId);
      const { reply } = req.body;

      if (!reply || typeof reply !== "string") {
        return sendErr(res, "BAD_REQUEST", "유효한 reply가 필요합니다.", 400);
      }

      if (Number.isNaN(postId)) {
        return sendErr(res, "BAD_REQUEST", "유효한 postId가 필요합니다.", 400);
      }

      const { data: post, error: fetchError } = await supabase
        .from("inquires")
        .select("id")
        .eq("id", postId)
        .single();

      if (fetchError || !post) {
        console.error("1대1 문의 조회 에러 (답변 전 확인):", fetchError);
        return sendErr(
          res,
          "NOT_FOUND",
          "답변할 1대1 문의글을 찾을 수 없습니다.",
          404
        );
      }

      const { error } = await supabase
        .from("inquires")
        .update({ reply })
        .eq("id", postId);

      if (error) {
        console.error("1대1 문의글 답변 에러:", error);
        return sendErr(
          res,
          "SERVER_ERROR",
          "1대1 문의글 답변 중 오류가 발생했습니다.",
          500
        );
      }

      return sendOk(res, true);
    } catch (e) {
      console.error("1대1 문의글 답변 예외:", e);
      return sendErr(res, "SERVER_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
  }
);

// ===================== 내 정보 (profiles + stu_details) =====================

// 내 정보 조회
app.get("/api/profile", authenticateToken, async (req, res) => {
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
});

// ===================== 인증 (JWT) =====================

//회원가입
app.post("/api/auth/signup", async (req, res) => {
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
});

//로그인
app.post("/api/auth/login", async (req, res) => {
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
      userData = await response.json();
      if (userData.email === 'kjt081025@gmail.com') {
        userData.role = 'teacher';
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
      .select("id, stu_details(*)")
      .eq("id", id)

    console.log(data);

    userData.room = data.length == 1 && data.role == 'student' ? data[0].stu_details.room : null;
    userData.join = data.length == 1 ? true : false;

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
      role: userData.role
    };

    const token = generateToken(payload);

    res.cookie('access_token', token, {
      maxAge: 1000 * 60 * 60 * 24 * 30,
      httpOnly: true,
      // secure: req.secure,
      secure: true,
      // sameSite: req.secure ? 'None' : 'lax',
      sameSite: 'none'
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
});

//로그아웃
app.get("/api/auth/logout", async (req, res) => {
  res.clearCookie('access_token', {
    httpOnly: true,
    // secure: req.secure,
    secure: true,
    // sameSite: req.secure ? 'None' : 'lax',
    sameSite: 'none'
  });

  return sendOk(res, { success: "true" });
});

//내 정보 가져오기
app.get("/api/auth/me", authenticateToken, async (req, res) => {
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
});

// ===================== 서버 시작 =====================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
