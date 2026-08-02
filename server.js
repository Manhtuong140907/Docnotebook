import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.static("public"));
app.use(express.json({ limit: "1mb" }));

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau vài phút."
  }
});

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 2
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error("Chỉ hỗ trợ JPG, PNG, WEBP và GIF không chuyển động."));
      return;
    }
    callback(null, true);
  }
});

const HandwritingOCRResult = z.object({
  transcription: z.string().describe(
    "Bản chép nguyên văn, giữ xuống dòng và dùng [không rõ] cho phần không thể đọc."
  ),
  normalized_text: z.string().describe(
    "Bản văn bản đã chuẩn hóa chính tả và khoảng trắng; không tự thêm dữ kiện."
  ),
  detected_items: z.array(
    z.object({
      label: z.string(),
      value: z.string()
    })
  ),
  uncertain_fragments: z.array(
    z.object({
      fragment: z.string(),
      alternatives: z.array(z.string()),
      location: z.string(),
      reason: z.string()
    })
  ),
  notes: z.string()
});

function safeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function toDataUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

function buildDocumentGuidance(documentType) {
  const guidance = {
    notes:
      "Đây là ghi chú/sổ tay. Ưu tiên giữ đúng từng dòng, ngày tháng, tên riêng, mũi tên và số tiền.",
    receipt:
      "Đây là phiếu thu chi/hóa đơn. Tập trung vào ngày, nội dung, đơn vị, số lượng, đơn giá, tổng tiền và ghi chú.",
    form:
      "Đây là biểu mẫu. Giữ quan hệ giữa nhãn và giá trị, ô đánh dấu, chữ ký và các trường để trống.",
    classroom:
      "Đây là bài viết/bài học. Giữ tiêu đề, công thức, số thứ tự, đáp án và cấu trúc đoạn.",
    general:
      "Đọc toàn bộ chữ viết tay và chữ in theo đúng thứ tự thị giác của tài liệu."
  };
  return guidance[documentType] || guidance.general;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-5.6"
  });
});

app.post(
  "/api/ocr-ai",
  aiLimiter,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "processedImage", maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
          error:
            "Máy chủ chưa cấu hình OPENAI_API_KEY. Hãy tạo file .env từ .env.example."
        });
      }

      const original = req.files?.image?.[0];
      const processed = req.files?.processedImage?.[0];

      if (!original) {
        return res.status(400).json({ error: "Bạn chưa gửi ảnh cần đọc." });
      }

      const documentType = safeText(req.body.documentType, 30) || "general";
      const contextHint = safeText(req.body.contextHint, 1500);
      const languageHint =
        safeText(req.body.languageHint, 80) || "Tiếng Việt, có thể xen tiếng Anh";
      const model = process.env.OPENAI_MODEL || "gpt-5.6";

      const developerPrompt = `
Bạn là hệ thống chép lại tài liệu chuyên xử lý chữ viết tay tiếng Việt của nhiều người.

QUY TẮC BẮT BUỘC:
1. Chép đúng những gì thực sự nhìn thấy; không đoán thêm sự kiện hoặc con số.
2. Giữ thứ tự đọc, xuống dòng, tiêu đề, ngày tháng, mũi tên, dấu cộng/trừ và đơn vị tiền.
3. Khi không chắc, ghi [không rõ] trong transcription và liệt kê các khả năng ở uncertain_fragments.
4. Phân biệt số 0/O, 1/7, 2/Z, 5/S, 6/G, dấu chấm hàng nghìn và dấu phẩy thập phân.
5. Không sửa tên riêng trong transcription. Chỉ chuẩn hóa nhẹ trong normalized_text khi có căn cứ rõ.
6. detected_items chỉ chứa dữ liệu có ích và nhìn thấy rõ như ngày, tuyến đường, tên người/công ty, số tiền, số phiếu.
7. Nếu ảnh thứ hai được cung cấp, đó là bản tăng tương phản của cùng tài liệu; hãy đối chiếu cả hai ảnh.
8. Không đưa lời giải thích ngoài cấu trúc kết quả đã yêu cầu.
`.trim();

      const userText = `
Loại tài liệu: ${documentType}
Ngôn ngữ dự kiến: ${languageHint}
Hướng dẫn theo loại tài liệu: ${buildDocumentGuidance(documentType)}
Gợi ý ngữ cảnh do người dùng cung cấp: ${contextHint || "(không có)"}

Hãy đọc toàn bộ nội dung trong ảnh. Mục tiêu là bản chép đáng tin cậy, không phải một bản tóm tắt.
`.trim();

      const content = [
        { type: "input_text", text: userText },
        {
          type: "input_image",
          image_url: toDataUrl(original),
          detail: "original"
        }
      ];

      if (processed) {
        content.push({
          type: "input_text",
          text: "Ảnh tiếp theo là bản đã tăng độ sáng/tương phản để đối chiếu nét chữ."
        });
        content.push({
          type: "input_image",
          image_url: toDataUrl(processed),
          detail: "original"
        });
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.responses.parse({
        model,
        input: [
          {
            role: "developer",
            content: developerPrompt
          },
          {
            role: "user",
            content
          }
        ],
        text: {
          format: zodTextFormat(HandwritingOCRResult, "handwriting_ocr_result")
        }
      });

      const result = response.output_parsed;

      if (!result) {
        return res.status(502).json({
          error: "AI không trả về kết quả có cấu trúc. Hãy thử lại với ảnh rõ hơn."
        });
      }

      res.json({
        ok: true,
        model,
        result
      });
    } catch (error) {
      next(error);
    }
  }
);

app.use((error, _req, res, _next) => {
  console.error(error);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error:
        error.code === "LIMIT_FILE_SIZE"
          ? "Ảnh vượt quá giới hạn 15 MB."
          : `Lỗi tải ảnh: ${error.message}`
    });
  }

  if (error?.status === 401) {
    return res.status(500).json({
      error: "OPENAI_API_KEY không hợp lệ hoặc đã bị thu hồi."
    });
  }

  if (error?.status === 429) {
    return res.status(429).json({
      error: "Dịch vụ AI đang bị giới hạn tốc độ hoặc tài khoản đã hết hạn mức."
    });
  }

  res.status(500).json({
    error: error?.message || "Có lỗi không xác định khi xử lý ảnh."
  });
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`AI Handwriting OCR đang chạy tại http://localhost:${port}`);
  });
}

export default app;
