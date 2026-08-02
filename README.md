# AI Handwriting OCR

Trang web đọc chữ viết tay tiếng Việt từ ảnh bằng hai chế độ:

1. **AI chữ viết tay**: gửi ảnh qua backend và dùng OpenAI Vision.
2. **OCR cục bộ**: dùng Tesseract.js ngay trên trình duyệt, không tốn API.

## Vì sao cần backend?

Không được đặt `OPENAI_API_KEY` trong HTML hoặc JavaScript phía trình duyệt. Người khác có thể xem và lấy key. Project này giữ key trong file `.env` trên máy chủ.

## Cài đặt

Yêu cầu: Node.js 20 trở lên.

```bash
npm install
```

Tạo file `.env` từ mẫu:

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

### Windows CMD

```cmd
copy .env.example .env
```

Mở `.env` và điền:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6
PORT=3000
```

Chạy:

```bash
npm run dev
```

Mở trình duyệt tại:

```text
http://localhost:3000
```

Kiểm tra nhanh mã nguồn và endpoint:

```bash
npm run check
npm test
```

## Cách dùng

1. Chọn hoặc chụp ảnh.
2. Điều chỉnh độ sáng và tương phản.
3. Chọn loại tài liệu.
4. Nhập một số tên riêng, địa danh hoặc thuật ngữ có thể xuất hiện.
5. Nhấn **Đọc bằng AI**.
6. Kiểm tra tab **Chưa chắc** trước khi sử dụng số tiền, số điện thoại hoặc dữ liệu quan trọng.

## Chạy production

```bash
npm start
```

Có thể triển khai Node.js project này lên Render, Railway, Fly.io hoặc máy chủ riêng. Trên nền tảng triển khai, thêm biến môi trường:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `PORT` thường được nền tảng tự cấp
- `TRUST_PROXY=1` nếu ứng dụng chạy sau reverse proxy tin cậy; để `0` khi chạy trực tiếp

Ứng dụng dùng đường dẫn tuyệt đối tới thư mục `public`, vì vậy có thể khởi động từ
thư mục khác mà không bị mất giao diện. Khi chưa có API key, giao diện tự chuyển sang
OCR cục bộ để người dùng vẫn có thể sử dụng ngay.

## Cấu trúc

```text
ai-handwriting-ocr/
├─ public/
│  └─ index.html
├─ test/
│  └─ server.test.js
├─ .env.example
├─ .gitignore
├─ package.json
├─ server.js
└─ README.md
```

## Lưu ý độ chính xác

- AI không đảm bảo đọc đúng 100%.
- Không tự động dùng kết quả cho kế toán, pháp lý hoặc thanh toán khi chưa có người kiểm tra.
- Ảnh rõ, vuông góc và có gợi ý ngữ cảnh thường cho kết quả tốt hơn.
- Mã nguồn gửi cả ảnh gốc và một bản tăng tương phản để AI đối chiếu.
