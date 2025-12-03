import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from 'jsonwebtoken';
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
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

const corsOptions = {
  origin: 'http://domice-front.vercel.app',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

//유틸 함수
const sendOk = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });

const sendErr = (res, code, message, status = 400) =>
  res.status(status).json({
    success: false,
    error: { code, message },
  });

//헬스 체크 무시 ㄱㄱ
app.get("/health", (req, res) => {
  return sendOk(res, { ok: true });
});

// app.get("/health/db", async (req, res) => {
//   try {
//     const { data, error } = await supabase
//       .from("notices")       
//       .select("id")
//       .limit(1);

//     if (error) {
//       console.error("DB 헬스 체크 에러:", error);
//       return res.status(500).json({
//         success: false,
//         error: {
//           code: "DB_ERROR",
//           message: "Supabase DB 연결에 실패했습니다.",
//           detail: error.message,
//         },
//       });
//     }
//     return res.json({
//       success: true,
//       data: {
//         connected: true,
//         sampleCount: data.length,
//       },
//     });
//   } catch (e) {
//     console.error("DB 헬스 체크 예외:", e);
//     return res.status(500).json({
//       success: false,
//       error: {
//         code: "SERVER_ERROR",
//         message: "서버 내부 오류",
//       },
//     });
//   }
// });


// 공지 전체 목록 조회 (최신순)
app.get("/api/notices", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const { data, error } = await supabase
      .from("notices")
      .select("id, title, target, author, created_at")
      .order("created_at", { ascending: false })
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
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
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
      .select("id, title, content, target, author, created_at")
      .eq("id", noticeId)
      .single();

    if (error || !data) {
      console.error("공지 상세 조회 에러:", error);
      return sendErr(
        res,
        "NOT_FOUND",
        "해당 공지를 찾을 수 없습니다.",
        404
      );
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("공지 상세 조회 예외:", e);
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});



// 게시글 목록 조회
app.get("/api/posts", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const { data, error } = await supabase
      .from("posts")
      .select("id, title, content, user_id, is_secret, created_at, updated_at, profiles(name)")
      .order("created_at", { ascending: false })
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

    // author_name은 profiles 조인헤서 붙일거면 로직 추가 해야함
    return sendOk(res, data);
  } catch (e) {
    console.error("게시글 목록 조회 예외:", e);
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});

// 게시글 작성
app.post("/api/posts", authenticateToken, async (req, res) => {
  try {
    const { title, content, is_secret } = req.body;

    if (!title || !content || is_secret) {
      return sendErr(
        res,
        "BAD_REQUEST",
        "title, content, is_secret는 필수입니다.",
        400
      );
    }
    const user_id = req.user.id

    const { error } = await supabase.from("posts").insert({
      title,
      content,
      is_secret,
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
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
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
      return sendErr(
        res,
        "NOT_FOUND",
        "해당 게시글을 찾을 수 없습니다.",
        404
      );
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("게시글 상세 조회 예외:", e);
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});

// 게시글 수정
app.put("/api/posts/:postId", async (req, res) => {
  try {
    const postId = Number(req.params.postId);
    if (Number.isNaN(postId)) {
      return sendErr(res, "BAD_REQUEST", "유효한 postId가 필요합니다.", 400);
    }

    const { title, content, is_secret } = req.body;

    if (
      typeof title !== "string" &&
      typeof content !== "string" &&
      typeof is_secret !== "boolean"
    ) {
      return sendErr(
        res,
        "BAD_REQUEST",
        "title, content, is_secret 중 최소 하나는 있어야 합니다.",
        400
      );
    }

    const updateFields = {};
    if (typeof title === "string") updateFields.title = title;
    if (typeof content === "string") updateFields.content = content;
    if (typeof is_secret === "boolean") updateFields.is_secret = is_secret;
    updateFields.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("posts")
      .update(updateFields)
      .eq("id", postId)
      .select("id, title, content, is_secret, user_id, created_at, updated_at")
      .single();

    if (error || !data) {
      console.error("게시글 수정 에러:", error);
      return sendErr(
        res,
        "NOT_FOUND",
        "해당 게시글을 찾을 수 없습니다.",
        404
      );
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("게시글 수정 예외:", e);
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});

// 게시글 삭제
app.delete("/api/posts/:postId", async (req, res) => {
  try {
    const postId = Number(req.params.postId);
    if (Number.isNaN(postId)) {
      return sendErr(res, "BAD_REQUEST", "유효한 postId가 필요합니다.", 400);
    }

    const { data, error } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId)
      .select("id")
      .single();

    if (error || !data) {
      console.error("게시글 삭제 에러:", error);
      return sendErr(
        res,
        "NOT_FOUND",
        "해당 게시글을 찾을 수 없습니다.",
        404
      );
    }

    return sendOk(res, { deleted: true, id: postId });
  } catch (e) {
    console.error("게시글 삭제 예외:", e);
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});

//1대 1문의 목록 조회
app.get("/api/inquires", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const user_id = req.user.id

    const { data, error } = await supabase
      .from("inquires")
      .select("id, title, content, reply, user_id, created_at, updated_at")
      .order("created_at", { ascending: false })
      .eq("user_id", user_id)
      .limit(limit);

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
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});

// 1대1 문의글 상세 조회
app.get("/api/inquires/:postId", authenticateToken, async (req, res) => {
  try {
    const postId = Number(req.params.postId);

    const user_id = req.user.id

    const { data, error } = await supabase
      .from("inquires")
      .select("id, title, content, reply, user_id, created_at, updated_at")
      .eq("id", postId)
      .single();

    if (error) {
      console.error("1대1 문의 상세 조회 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "1대1 문의글 조회 중 에러가 발생했습니다.",
        404
      );
    }

    if (!data) {
      return sendErr(res, "NOT_FOUND", "해당 게시물을 찾을 수 없습니다.", 404);
    }

    if (data.user_id !== user_id) {
      return sendErr(
        res,
        "FORBIDDEN",
        "해당 게시물을 열람할 권한이 없습니다.",
        403
      );
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("1대1 문의글 상세 조회 예외:", e);
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});

// 1대1 문의글 작성
app.post("/api/inquires", authenticateToken, async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return sendErr(
        res,
        "BAD_REQUEST",
        "title, content는 필수입니다.",
        400
      );
    }

    const user_id = req.user.id

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
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});


// 내 정보 조회
app.get("/api/profile", authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, gender, region, profile_img, room, stu_num, plus_score, minus_score")
      .eq("id", user_id)
      .single();

    // console.log(data);

    if (error || !data) {
      console.error("내 정보 조회 에러:", error);
      return sendErr(
        res,
        "NOT_FOUND",
        "프로필 정보를 찾을 수 없습니다.",
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

// 내 정보 수정
app.put("/api/profile", async (req, res) => {
  try {
    const { user_id, name, class_num, room_num, province, gender } = req.body;

    if (!user_id) {
      return sendErr(res, "BAD_REQUEST", "user_id는 필수입니다.", 400);
    }

    const updateFields = {};
    if (typeof name === "string") updateFields.name = name;
    if (typeof class_num === "number") updateFields.class_num = class_num;
    if (typeof room_num === "number") updateFields.room_num = room_num;
    if (typeof province === "number") updateFields.province = province;
    if (typeof gender === "string") updateFields.gender = gender;

    if (Object.keys(updateFields).length === 0) {
      return sendErr(res, "BAD_REQUEST", "수정할 필드가 없습니다.", 400);
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(updateFields)
      .eq("id", user_id)
      .select("id, name, class_num, room_num, province, gender")
      .single();

    if (error || !data) {
      console.error("내 정보 수정 에러:", error);
      return sendErr(
        res,
        "NOT_FOUND",
        "프로필 정보를 찾을 수 없습니다.",
        404
      );
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("내 정보 수정 예외:", e);
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});

// 외출/잔류 선택 제출
app.post("/api/stay", async (req, res) => {
  try {
    const { user_id, type } = req.body;

    if (!user_id || !["외출", "잔류"].includes(type)) {
      return sendErr(
        res,
        "BAD_REQUEST",
        "user_id와 type(외출/잔류)은 필수입니다.",
        400
      );
    }

    const { data, error } = await supabase
      .from("stay_requests")
      .insert({ user_id, type })
      .select("id, user_id, type, created_at")
      .single();

    if (error) {
      console.error("외출/잔류 선택 제출 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "외출/잔류 선택 제출 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, data, 201);
  } catch (e) {
    console.error("외출/잔류 선택 제출 예외:", e);
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});

// 외출/잔류 선택 조회
app.get("/api/stay", async (req, res) => {
  try {
    const userId = req.query.user_id;
    const date = req.query.date;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    if (!userId) {
      return sendErr(
        res,
        "BAD_REQUEST",
        "user_id 쿼리 파라미터가 필요합니다.",
        400
      );
    }

    let query = supabase
      .from("stay_requests")
      .select("id, user_id, type, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (date) {
      const from = `${date}T00:00:00`;
      const to = `${date}T23:59:59`;
      query = query.gte("created_at", from).lte("created_at", to);
    }

    const { data, error } = await query;

    if (error) {
      console.error("외출/잔류 선택 조회 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "외출/잔류 선택 조회 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, data);
  } catch (e) {
    console.error("외출/잔류 선택 조회 예외:", e);
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});

//상벌점
app.get("/api/meritlogs", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    if (!userId) {
      return sendErr(
        res,
        "BAD_REQUEST",
        "user_id 쿼리 파라미터가 필요합니다.",
        400
      );
    }

    const { data, error } = await supabase
      .from("merit_logs")
      .select("id, log_type, reason, score, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

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
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});

// 입실 체크 등록
app.post("/api/roomcheckins", authenticateToken, async (req, res) => {
  try {
    const { session_type } = req.body;
    const user_id = req.user.id;

    if (
      !user_id ||
      !["AFTER_SCHOOL", "AFTER_DINNER", "RETURN_8PM"].includes(session_type)
    ) {
      return sendErr(
        res,
        "BAD_REQUEST",
        "user_id와 session_type(AFTER_SCHOOL / AFTER_DINNER / RETURN_8PM)이 필요합니다.",
        400
      );
    }

    const now = new Date();
    const check_date = now.toISOString().slice(0, 10); //년월일
    const check_time = now.toTimeString().slice(0, 8); //시분초 

    const { data, error } = await supabase
      .from("room_checkins")
      .insert({
        user_id,
        session_type,
        check_date,
        check_time,
      })
      .select("id, user_id, check_date, check_time, session_type, created_at")
      .single();

    if (error) {
      console.error("입실 체크 등록 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "입실 체크 등록 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, data, 201);
  } catch (e) {
    console.error("입실 체크 등록 예외:", e);
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});

// 오늘 입실 기록 조회
app.get("/api/roomcheckins/today", authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id
    // const sessionType = req.query.session_type;

    if (!user_id) {
      return sendErr(
        res,
        "BAD_REQUEST",
        "user_id 쿼리 파라미터가 필요합니다.",
        400
      );
    }

    const today = new Date().toISOString().slice(0, 10); // 2020-02-02 형식

    let query = supabase
      .from("room_checkins")
      .select("id, user_id, check_date, check_time, session_type, created_at")
      .eq("user_id", user_id)
      .eq("check_date", today)
      .order("created_at", { ascending: false })
      .limit(1);

    const { data, error } = await query;

    console.log(data);

    if (error) {
      console.error("오늘 입실 기록 조회 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "오늘 입실 기록 조회 중 오류가 발생했습니다.",
        500
      );
    }

    return sendOk(res, data[0] || null);
  } catch (e) {
    console.error("오늘 입실 기록 조회 예외:", e);
    return sendErr(
      res,
      "SERVER_ERROR",
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
});


// 외출 신청 등록
app.post("/api/leave", async (req, res) => {
  try {
    const { user_id, leave_date, reason } = req.body;

    if (!user_id || !leave_date || !reason) {
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
        is_approved: null,
        approved_at: null,
      })
      .select(
        "id, user_id, leave_date, reason, is_approved, approved_at, created_at"
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
});

// 외출 신청 내역 조회
app.get("/api/leave", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const userId = req.user.id;

    const { data, error } = await supabase
      .from("leave_requests")
      .select(
        "id, user_id, leave_date, reason, is_approved, approved_at, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

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
});

//회원가입
app.post("/api/auth/signup", async (req, res) => {
  try {
    console.log(req.body)
    const { id,
      name,
      room,
      gender,
      region,
      email,
      profile_img,
      stu_num } = req.body;
    if (!id) {
      return sendErr(
        res,
        "BAD_REQUEST",
        "유저 정보가 필요합니다.",
        400
      );
    }

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        id,
        name,
        room,
        gender,
        region,
        email,
        profile_img,
        stu_num
      })
      .select(
        "id, name, room, gender, region, email, profile_img, stu_num"
      )
      .single();

    if (error) {
      console.error("로그인 에러:", error);
      return sendErr(
        res,
        "SERVER_ERROR",
        "유저 조회중 에러가 발생했습니다.",
        500
      );
    }

    return sendOk(res, data, 201);
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


//로그인
app.post("/api/auth/login", async (req, res) => {
  try {
    const { accessToken } = req.body;
    let userData;
    if (!accessToken) {
      return sendErr(
        res,
        "BAD_REQUEST",
        "access_token가 필요합니다.",
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
      if (userData.email.split("@")[1] != "e-mirim.hs.kr") {
        return sendErr(res,
          "Forbiddena",
          "미림마이스터고등학교 구글 계정만 가능합니다.",
          403);
      }
      userData.stu_num = userData.family_name.slice(0, 4);
    } catch (error) {
      console.error('Error fetching user info:', error);
    }

    const id = userData.id;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, room, stu_num")
      .eq("id", id)

    console.log(data.length);

    userData.join = data.length == 1 ? true : false;
    userData.room = data.length == 1 && data[0].room;

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
      id: userData.id
    };

    const token = generateToken(payload);

    res.cookie('auth_token', token, {
      maxAge: 1000 * 60 * 60 * 24 * 30,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
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
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  });

  return sendOk(res, { success: "true" });
});

function generateToken(payload) {
  // 토큰 생성
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

function authenticateToken(req, res, next) {
  const token = req.cookies.auth_token;

  if (!token) {
    return sendErr(res, 'Unauthorized', '인증 토큰이 누락되었습니다.', 401);
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();

  } catch (err) {
    return sendErr(res, 'Forbidden', "유효하지 않거나 만료된 토큰입니다.", 403);
  }
}

// console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
// console.log("SERVICE_ROLE_KEY 시작 10글자:", process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
