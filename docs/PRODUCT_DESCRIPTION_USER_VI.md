# Mô tả sản phẩm — Hệ sinh thái Kế hoạch AI (AI Planning Ecosystem)

> Tài liệu này mô tả **chỉ những gì đã được kiểm chứng** bằng cách chạy thật mã nguồn trong
> kho lưu trữ này. Mỗi khả năng nêu dưới đây đều được xác minh bằng một bài kiểm thử tự động đã
> chạy, một lệnh acceptance probe đã chạy, hoặc một lần kiểm tra thủ công đã ghi nhận. Những gì
> **chưa có** được ghi rõ ở mục "Chưa có sẵn" — tài liệu này không hứa hẹn điều không tồn tại.
>
> - **Phiên bản:** V1.1 (đường cơ sở triển khai)
> - **Ngày:** 2026-10-28
> - **Nền tảng:** Node.js ≥ 24, chạy hoàn toàn cục bộ trên máy của bạn
> - **Bằng chứng:** `docs/spec/APE_V1_1_TRACEABILITY.md` (ma trận truy xuất AT01–AT55),
>   `docs/reports/` (các báo cáo acceptance), `docs/DECISION_LOG.md` (các quyết định D-001…D-040)

---

## 1. Sản phẩm này là gì

**Hệ sinh thái Kế hoạch AI** là một **trình lập kế hoạch cá nhân chạy cục bộ** (local-first planner).
Nó giúp bạn:
- Ghi lại nhanh công việc cần làm (không tự động xếp lịch khi bạn chưa muốn),
- Cấu trúc hóa thành nhiệm vụ, mục tiêu và thói quen,
- Nhìn thấy thời gian trống thực sự trong tuần,
- Nhận **đề xuất** lịch trình từ bộ lập lịch (scheduler) — nhưng **không bao giờ** tự động áp dụng,
- Theo dõi việc đã làm, điều chỉnh, và hoàn tác mọi thay đổi về lịch.

**Dữ liệu của bạn nằm trên máy bạn.** Ứng dụng không gửi dữ liệu đi đâu, không dùng dịch vụ trả phí,
không gọi mô hình AI bên ngoài, không có telemetry, không tải font từ CDN. Toàn bộ mã chạy nội bộ.

---

## 2. Những gì đã được kiểm chứng (Verified)

Các mục dưới đây đã được xác minh bằng **lệnh thật đã chạy** trên bản dựng cuối cùng
(`dist/server.mjs` + `dist/client/`), trên một cơ sở dữ liệu mới tạo (không đụng dữ liệu thật của
developer). Chi tiết bằng chứng nằm ở mục 5.

### 2.1 Tài khoản và phiên làm việc
- Đăng ký bằng **tên người dùng + mật khẩu** (không dùng email, không OAuth). Mật khẩu phải đủ mạnh.
- Đăng nhập, đăng xuất; mã thông báo phiên (bearer token) được lưu trong `localStorage` của trình duyệt.
- Một lỗi `401` từ API sẽ đưa ứng dụng quay lại màn hình đăng nhập.
- **Không có màn hình "Cài đặt" (Settings) trong giao diện** — cài đặt chỉ thao tác qua API
  (xem mục 4 "Chưa có sẵn", theo đặc tả triển khai §11.1).

### 2.2 Nhiệm vụ (Tasks)
- Thêm nhanh chỉ với tiêu đề: nhiệm vụ rơi vào **Hộp thư đến (Inbox)** và **không** được tự động
  xếp vào một khung giờ bừa bãi.
- Đánh giá thời gian (estimate), ngày hết hạn, mức độ ưu tiên, nhiệm vụ cha/con, liên kết mục tiêu.
- Chuyển đổi trạng thái: nhiệm vụ hoàn thành **không** tự động ghi công nỗ lực; hoàn thành sớm chỉ
  giải phóng đúng các khung giờ của chính nhiệm vụ đó.
- Sửa tiêu đề qua biểu mẫu (biểu mẫu từ chối tiêu đề rỗng/khoảng trắng — không bao giờ "xóa trắng"
  một bản ghi trong im lặng).

### 2.3 Lịch (Calendar)
- Sự kiện cố định (fixed), ngày nghỉ (rest), và **khung giờ làm việc tự đặt** (work block).
- Xung đột lịch được **báo cáo**, không bao giờ bị ghi đè trong im lặng.
- Tính thời gian trống (free time) dựa trên cửa sổ làm việc và các sự kiện đã khóa.
- Khóa/mở khóa/xóa sự kiện từ giao diện. Việc **di chuyển / thay đổi kích thước** được máy chủ
  kiểm tra bằng cùng bộ validator xung đột khi gọi API tương ứng — nhưng giao diện kéo-thả cho
  thao tác đó **chưa được dựng** (xem mục 4).

### 2.4 Mục tiêu (Goals)
- Theo chỉ số **số lượng (count)** hoặc **cột mốc (milestone)**.
- Tiến độ chỉ di chuyển khi bạn **ghi nhận một cách tường minh** — không di chuyển như một tác dụng phụ.
- Khung (draft) phân rã nhiệm vụ chỉ là đề xuất; **không có gì được lưu** cho tới khi bạn cam kết.
- Cảnh báo khi đổi chỉ số làm dữ liệu cũ không còn tương thích.

### 2.5 Thói quen (Habits)
- Nhịp ngày/tuần, số lần mục tiêu, các lần ghi nhận (check-in).
- Cửa sổ tạm dừng (pause window) có chính sách rõ ràng; phạm vi lịch sử theo từng thói quen.
- **Không tạo áp lực chuỗi ngày (streak)**; thước đo chính là mức độ đạt được.

### 2.6 Bộ lập lịch Deterministic (không ngẫu nhiên)
- Bộ lọc cứng → xếp hạng mềm, **3 chiến lược** lập lịch.
- Khi không thể lập lịch được, ứng dụng báo cáo **trung thực** kèm các lựa chọn cụ thể —
  **không bao giờ âm thầm vi phạm ràng buộc cứng**.
- Mọi đề xuất chỉ là **đề xuất**: không có gì được ghi vào lịch cho tới khi bạn chấp thuận.

### 2.7 Phục hồi và thực thi
- "Cần thêm thời gian": lập lại kế hoạch quanh các sự kiện cố định và phiên hiện có, kèm **xem trước
  tác động** trước khi áp dụng.
- Ghi công sức thủ công hoặc bằng đồng hồ đếm, trả lời "còn lại bao nhiêu".
- Cờ báo: bắt đầu muộn, quá hạn, làm thêm giờ, có rủi ro.

### 2.8 Nhật ký và hoàn tác (Audit & Undo)
- **Mọi thay đổi về lịch đều quy được trách nhiệm** — dòng thời gian nhật ký cho thấy điều gì,
  khi nào, và bởi ai.
- **Hoàn tác ngữ nghĩa** (không phải hoàn tác ký tự): đi kèm **xem trước xung đột** — nếu hoàn tác
  sẽ va chạm, ứng dụng nói cho bạn biết trước.
- Xuất dữ liệu (export) ra file.

### 2.9 Truy cập và khả năng sử dụng
- Giao diện web **nhạy và dễ tiếp cận** với trạng thái đang tải / trống / lỗi.
- Hỗ trợ bàn phím, tôn trọng "giảm chuyển động" (reduced motion) của hệ điều hành.
- Có liên kết "bỏ qua" (skip link) cho trình đọc màn hình.

---

## 3. Trạng thái kiểm tra tự động (đã chạy thật)

Đây là các con số thu được từ việc **chạy** kiểm tra, không phải là mục tiêu hay tuyên bố:

| Hạng mục | Kết quả (đã chạy) |
|---|---|
| Bộ kiểm thử Vitest (toàn bộ) | **128/128 bài đạt** (4 tệp) — đường cơ sở 116 + 6 bài của Phase 2 (D-039/D-040) + 6 bài của Phase 4 (B3-07 guard đơn nguồn, B3-08 đọc 1 mục timeline) |
| `npm run check` (kiểu + kiểm thử + dựng) | **exit 0** |
| Accessibility — Lighthouse trên 6 chế độ xem (Today, Calendar, Tasks, Goals, Habits, Activity) | **1.0/1.0 trên cả 6 chế độ xem**, 0 lỗi accessibility |
| 320 px — kiểm tra responsive thật (Chromium headless, mô phỏng 320×640) | **6/6 chế độ xem** `scrollWidth ≤ 320`; **0** chữ bị cắt, **0** vùng chạm < 24 px, **0** cuộn ngang cấp trang |
| Bảo mật — security probe | **8/8 PASS** (401 chưa đăng nhập; 404 "không tìm thấy" đồng nhất với 404 lạ — không dò được dữ liệu; PATCH của người khác không ghi gì; export không lộ thông tin xác thực) |
| Persistence — dừng → khởi động lại cùng DB | **8/8 PASS** toàn bộ dữ kiện byte-identical (trong đó có 2 nhóm dữ kiện mới được bổ sung: cài đặt người dùng và nhật ký công sức); phiên cũ vẫn còn hiệu lực |
| Single-origin — không nguồn bên ngoài | **PASS** — 0 nguồn bên ngoài, mọi script tự lưu trữ |

**Lưu ý trung thực về 320 px:** phép kiểm trước đây **không xác minh được** vì thiếu công cụ mô
phỏng viewport. Trong lần chạy APE-BATCH-003 này, việc kiểm đã được thực hiện **thật** bằng
Chromium headless qua CDP (`Emulation.setDeviceMetricsOverride` 320×640) trên cả 6 chế độ xem,
và bây giờ đã ở trạng thái **đã xác minh (VERIFIED)**.

---

## 4. Chưa có sẵn (trung thực, không hứa hẹn)

Những điều dưới đây **không tồn tại** trong phiên bản này. Đây là giới hạn có chủ đích, được ghi
trong đặc tả triển khai §1.2 (D-006) và các mục tương ứng:

- **Không có màn hình "Cài đặt" (Settings screen)** trong giao diện. Cài đặt (giờ làm việc, giờ nghỉ,
  vùng ân hạn `graceMinutes`, múi giờ) chỉ thao tác qua **API**. *(Đặc tả §11.1.)*
- **Không có đồng bộ lịch bên ngoài** (Google / Apple / CalDAV).
- **Chưa có giao diện kéo-thả để di chuyển hoặc thay đổi kích thước khối/sự kiện.** Máy chủ vẫn
  kiểm tra xung đột (và từ chối với 409) khi gọi API tương ứng, nhưng thao tác này chưa có nút bấm
  trong giao diện. Khóa/mở khóa/xóa sự kiện thì có.
- **Không có hàng đợi ngoại tuyến (offline queue)** và **không có đồng bộ đa thiết bị** — ứng dụng
  hiển thị lỗi rõ ràng khi mất mạng, nhưng **không xếp hàng các thay đổi để đồng bộ sau**.
- **Không có ứng dụng Android gốc** — chỉ có giao diện web.
- **Không có mô hình LLM bên ngoài** — bộ lập lịch là **deterministic** và chạy cục bộ; nó không
  gọi dịch vụ AI bên ngoài (và điều đó cũng nghĩa là mọi "đề xuất" đều giải thích được).
- **Không có chỉ số thói quen phức tạp theo tháng** và **không có streak**.
- **Không có cài đặt / sao lưu / khôi phục có kiểm tra (backup-restore drill)**.
- **Không có triển khai hosted** và **không có cộng tác đa người dùng**.
- **Cửa sổ làm việc qua nửa đêm (ví dụ 22:00 → 08:00) hiện bị từ chối** với lỗi 400 — vì đặc tả
  chưa định nghĩa "quanh nửa đêm" được xử lý đúng, và cách xử lý cũ (âm thầm bỏ cửa sổ đi) là sai.
  Xem quyết định **D-039**.

---

## 5. Bằng chứng và cách tự kiểm chứng

- **Ma trận truy xuất:** `docs/spec/APE_V1_1_TRACEABILITY.md` — mỗi tiêu chí chấp nhận AT01–AT55
  được ánh xạ tới một bài kiểm thử đã chạy, một lệnh acceptance, hoặc một sự hoãn có ghi rõ.
- **Báo cáo acceptance:** `docs/reports/APE-ACCEPT-002-REPORT.md`,
  `docs/reports/APE-ACCEPT-FOLLOWUP-001-REPORT.md`.
- **Nhật ký quyết định:** `docs/DECISION_LOG.md` (D-001 … D-040), trong đó có các quyết định
  **D-038/D-039/D-040** về kiểm tra chặt chẽ cài đặt đồng hồ và thứ tự cửa sổ.
- **Probe acceptance có thể chạy lại:** `scripts/acceptance/README.md` mô tả 7 probe
  (`title`, `at33-boundary`, `at33-loop`, `settings-clock`, `security`, `persistence`,
  `viewport-320`) và số kết quả mong đợi của từng cái — trong đó `viewport-320` chính là phép
  kiểm 320 px đã được cam kết vào kho lưu trữ ở trên.

**Cách chạy thử trên máy của bạn:**

```powershell
npm install
npm run build
$env:APE_PORT = 8788
$env:APE_DB_FILE = "$env:TEMP\my-own-test.db"   # một file mới — không đụng dữ liệu thật
$env:APE_SESSION_SECRET = "a-local-throwaway-secret"
node dist/server.mjs
# rồi mở http://127.0.0.1:8788 trong trình duyệt
```

---

## 6. Quyền riêng tư và dữ liệu

- Dữ liệu của bạn được lưu trong một **cơ sở SQLite cục bộ** trên máy bạn.
- Ứng dụng **không** gửi dữ liệu của bạn đi bất cứ đâu: không có dịch vụ bên ngoài, không telemetry,
  không CDN, không font web từ xa.
- **AI ở đây là đề xuất, không phải thực thi:** mọi "đề xuất" đều do bộ lập lịch cục bộ tạo ra và chỉ
  có hiệu lực khi **bạn** chấp thuận. Không có mô hình AI bên ngoài nào tham gia.
- Xuất dữ liệu (export) **không kèm thông tin xác thực** (đã được probe bảo mật xác minh).

---

*Tài liệu này mô tả phần mềm như **nó thực sự chạy**, không như nó **có thể** chạy. Bất kỳ khả năng
nào không được liệt kê ở mục 2 đều chưa được xác minh và vì thế không được tuyên bố là có sẵn.*
