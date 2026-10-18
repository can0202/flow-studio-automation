# Flow Studio Automation — Local MVP

Ứng dụng desktop Windows chạy hoàn toàn **local** để quản lý và tự động hóa quy trình tạo ảnh **Nano Banana (Imagen)** và video **Veo 3** thông qua Google Flow (Flow Studio).

---

## 1. Tính năng nổi bật

- **Kiến trúc Local Single-User**: Chạy 100% trên máy cá nhân Windows, không phụ thuộc cloud backend, không cần Redis/BullMQ.
- **SQLite Persistent Queue (Drizzle ORM)**:
  - Lưu trữ trạng thái bền vững: `pending`, `running`, `waiting_for_user`, `downloading`, `completed`, `failed`, `paused`, `cancelled`, `interrupted`.
  - Khôi phục tự động sau crash / tắt app (các job đang chạy sẽ tự động chuyển sang `interrupted`).
  - Giới hạn Concurrency và quy tắc **1 job tại một thời điểm cho mỗi session**.
  - Cơ chế retry lỗi tạm thời với **Exponential Backoff**.
- **Session Manager Cô Lập**:
  - Quản lý các phiên trình duyệt với User Data Directory riêng biệt.
  - **Open Browser**: Mở cửa sổ Chromium thực tế để người dùng tự đăng nhập Google Flow, nhập mật khẩu và vượt 2FA thủ công.
  - Tuyệt đối an toàn: Không lưu mật khẩu Google, không export cookie/token, không bypass CAPTCHA.
  - **Quota & Auth Protection**: Tự động dừng worker tương ứng khi tài khoản chạm hạn ngạch (quota exhausted) hoặc cần đăng nhập lại (auth required), gửi thông báo cho người dùng và không retry vô ích.
- **Tạo ảnh Nano Banana**:
  - Hỗ trợ đầy đủ tỷ lệ khung hình: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`.
  - Gợi ý mẫu prompt (Photorealistic, Cyberpunk, Anime, 3D Diorama).
  - Hỗ trợ ảnh tham chiếu (Reference Image), số lượng tạo hàng loạt (Batch count).
- **Tạo video Veo 3**:
  - Hỗ trợ các tỷ lệ: `16:9`, `9:16`, `1:1`, thời lượng `5s` và `10s`.
  - Presets chuyển động camera (FPV Drone Dive, Push-in, 360 Orbit, Hyperlapse).
  - Tải video trực tiếp về máy.
- **Image → Video Chained Workflow**:
  - Liên kết job tạo ảnh và job tạo video với `dependencyJobId`.
  - Tùy chọn **"Chờ người dùng duyệt ảnh trước khi tạo video"** (`waiting_for_user`).
  - Hỗ trợ chọn ảnh có sẵn từ thư mục Outputs làm frame tham chiếu cho video mới.
  - Job video không bao giờ chạy nếu dependency thất bại hoặc chưa được phê duyệt.
- **Batch Import (CSV & JSON)**:
  - Hỗ trợ paste hoặc import file CSV/JSON với nút tải template mẫu.
  - **Bản xem trước trực quan (Preview Dialog)** cho phép kiểm tra danh sách prompt và tham số trước khi enqueue vào SQLite.
- **Quản lý Output & Metadata**:
  - Cấu trúc thư mục chuẩn:
    ```
    output/
      ProjectName/
        images/
        videos/
        metadata/   # Lưu jobId.json chứa prompt, thông số, đường dẫn
    ```
  - Mở tệp trực tiếp và nút **"Mở trong Thư mục" (Show in Explorer)**.
  - Modal xem trước ảnh / phát video tích hợp sẵn.
- **Chế độ Giả lập (Simulation Mode)**:
  - Tích hợp `MockProvider` với thanh cảnh báo rõ ràng.
  - Cho phép test toàn bộ queue, concurrency, retry backoff, dependency blocking, và quota warning mà không cần gửi request lên Google Flow.
  - Tự động sinh file ảnh SVG và video MP4 thực tế vào thư mục output để kiểm thử.

---

## 2. Công nghệ sử dụng

- **Desktop Framework**: Electron (Context Isolation, an toàn không cho renderer gọi trực tiếp Node.js).
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Lucide Icons.
- **Database**: SQLite (`better-sqlite3`), Drizzle ORM (chế độ WAL).
- **Automation Engine**: Playwright Chromium (tách biệt Persistent Contexts cho từng session).
- **Testing**: Vitest.

---

## 3. Cài đặt và Khởi chạy

### Yêu cầu môi trường
- Hệ điều hành: Windows 10 / 11 64-bit.
- Node.js: >= v20 (khuyến nghị v22 hoặc v24).
- Package Manager: `pnpm` (v12+).

### Bước 1: Cài đặt Dependencies
```bash
pnpm install
```

### Bước 2: Tải Chromium cho Playwright (nếu chưa tải)
```bash
pnpm exec playwright install chromium
```

### Bước 3: Chạy ứng dụng trong môi trường phát triển (Dev)
```bash
pnpm run dev
```
Lệnh trên sẽ:
1. Build code Main Process & Preload IPC an toàn sang `dist/main/`.
2. Khởi chạy Vite Dev Server tại `http://localhost:5173`.
3. Mở cửa sổ ứng dụng desktop Electron.

### Bước 4: Chạy kiểm thử tự động (Unit & Integration Tests)
```bash
pnpm test
```
Đã có sẵn 11 test cases kiểm thử:
- Khởi tạo SQLite, WAL mode, Crash recovery.
- Hàng đợi persistent queue, concurrency, dependency resolution.
- Chế độ giả lập MockProvider, sinh file output, exponential backoff retry.
- Xử lý lỗi quota exhausted.
- Parser CSV & JSON batch import.

### Bước 5: Build bản Production
```bash
pnpm run build
```

---

## 4. Hướng dẫn sử dụng chi tiết

### 4.1. Thử nghiệm nhanh với Chế độ Giả lập (Simulation Mode)
1. Ứng dụng mặc định kích hoạt **Simulation Mode** để bảo vệ tài khoản và giúp kiểm thử ngay lập tức.
2. Tại trang **Dashboard**, bạn sẽ thấy thanh màu vàng **"Simulation Mode Active"**.
3. Bấm các nút test nhanh:
   - **+ Image Job**: Enqueue một job tạo ảnh Nano Banana mẫu.
   - **+ Video Job**: Enqueue một job video Veo 3 mẫu.
   - **Test Retry**: Tạo job mô phỏng lỗi mạng ở lần thử 1 và thành công ở lần thử 2 (kiểm chứng backoff).
   - **Test Quota**: Tạo job mô phỏng tài khoản hết quota (worker tự ngắt an toàn).
4. Quan sát thanh tiến trình cập nhật theo thời gian thực và kiểm tra file đầu ra tại tab **Outputs**.

### 4.2. Quản lý Session Google Flow thực tế
1. Truy cập tab **Sessions**.
2. Bấm **"Thêm Session Mới"** (ví dụ: `Account 1`).
3. Bấm **"Open Browser (Login)"**: Một cửa sổ Chromium tách biệt sẽ mở ra trang Google Flow.
4. Bạn đăng nhập tài khoản Google của mình một cách hoàn toàn thủ công. Cookie và session sẽ được lưu bền vững trong thư mục hồ sơ riêng tại `.data/sessions/<id>/`.
5. Sau khi đăng nhập xong, đóng cửa sổ trình duyệt và bấm **"Test Connection"** để kiểm tra trạng thái session sẵn sàng (`ready`).

### 4.3. Quy trình Image → Video
1. Truy cập tab **Image → Video**.
2. Chọn chế độ **"Quy trình chuỗi khép kín (Full Pipeline)"**:
   - Nhập prompt ảnh ở Bước 1.
   - Bật tùy chọn **"Chờ người dùng duyệt ảnh trước khi tạo video"**.
   - Nhập prompt chuyển động video ở Bước 2.
   - Bấm **"Khởi tạo Pipeline Liên hoàn"**.
3. Khi ảnh hoàn thành, trạng thái job sẽ là **"Review Needed"**. Bạn có thể kiểm tra ảnh, nếu ưng ý thì bấm **"Approve"** để job video tự động nhận ảnh làm frame tham chiếu và tiếp tục render.

### 4.4. Batch Import Prompts
1. Truy cập tab **Queue** và bấm **"Batch Import (CSV / JSON)"**.
2. Bấm **"Load Template CSV Mẫu"** để xem định dạng mẫu:
   ```csv
   prompt,type,aspectRatio,duration
   "Neon cyberpunk warrior standing under rain in futuristic alleyway",image,16:9,5
   "Drone camera sweeping over snowy mountain ridge at golden sunrise",video,16:9,5
   ```
3. Xem bảng xem trước (**Live Preview**) các dòng hợp lệ.
4. Bấm **"Enqueue Job(s) vào Queue"** để nạp tất cả vào SQLite.

---

## 5. Troubleshooting (Xử lý sự cố)

| Hiện tượng | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| **Lỗi `Cannot find Playwright browser`** | Chưa tải binary Chromium cho Playwright | Chạy lệnh `pnpm exec playwright install chromium`. |
| **Worker dừng và báo `Auth Required`** | Phiên Google Flow hết hạn hoặc đăng xuất | Vào tab **Sessions** -> chọn session tương ứng -> bấm **Open Browser** để đăng nhập lại. |
| **Worker dừng và báo `Quota Exhausted`** | Tài khoản đã hết hạn ngạch generation trong ngày | Ứng dụng tự động dừng an toàn để không spam lỗi. Vui lòng chuyển sang session khác hoặc đợi Google reset quota ngày hôm sau. |
| **Ứng dụng bị tắt đột ngột (Crash / Mất điện)** | Ứng dụng đóng trong khi đang xử lý dở dang | Khi mở lại ứng dụng, tính năng **Crash Recovery** sẽ tự động quét cơ sở dữ liệu SQLite và chuyển các job dở dang sang trạng thái `interrupted`. Bạn chỉ cần bấm **Retry** trên bảng Queue để tiếp tục. |
| **File output không hiển thị ảnh ngoài Explorer** | Định dạng file giả lập là `.svg` | File `.svg` có thể mở trực tiếp bằng trình duyệt (Chrome/Edge) hoặc click nút **"Mở File"** trong app để xem bản render độ nét cao. |

---

## 6. Tuân thủ an toàn

- **Tôn trọng chính sách Google**: Ứng dụng không thực hiện reverse-engineering, không can thiệp vào token nội bộ, không bypass bảo vệ chống bot CAPTCHA.
- **Bảo mật dữ liệu cá nhân**: Toàn bộ database SQLite, cấu hình và tệp media đều nằm trên ổ cứng nội bộ của người dùng Windows.
