# AI PLANNING ECOSYSTEM
## MASTER PRODUCT SPECIFICATION V1.0 — BẢN ĐỀ XUẤT CUỐI ĐỂ PRODUCT OWNER PHÊ DUYỆT

**Ngày:** 19/10/2026  
**Trạng thái:** REVIEW CANDIDATE — **CHƯA ĐƯỢC DUYỆT**  
**Phạm vi:** Nghiên cứu, phản biện, chiến lược, sản phẩm, trải nghiệm, kiến trúc khái niệm, đặc tả hành vi, kiểm thử, roadmap.  
**Không cho phép:** Viết code sản phẩm; thay đổi repository; dùng dịch vụ trả phí; kết nối tài khoản người dùng; thu thập dữ liệu thật; deploy; migrate dữ liệu; tự xem đây là lệnh triển khai.

> **Cách đọc nhãn:** `[C]` = người dùng đã lựa chọn/xác nhận trong các vòng khảo sát; `[P]` = quyết định thiết kế đề xuất, cần duyệt; `[V]` = giả thuyết phải kiểm chứng; `[F]` = giai đoạn sau, vẫn thuộc tầm nhìn sản phẩm; `[O]` = quyết định còn mở. Các lựa chọn khảo sát có thể xung đột hoặc chưa đủ điều kiện vận hành: một lựa chọn `[C]` không đồng nghĩa toàn bộ hành vi kỹ thuật đã được phê duyệt.

---

# PHẦN A — TỰ PHẢN BIỆN VÀ CHIẾN LƯỢC SẢN PHẨM

## A1. Tổng kết điều người dùng thực sự cần

Người dùng muốn một nền tảng quản lý thời gian cho cá nhân, trước hết phù hợp với người học bận rộn và sau đó có thể mở rộng tới người đi làm. Họ muốn tổ chức **Goal → Milestone → Task → Subtask**, thói quen, sự kiện cố định và thời gian thực hiện; được cảnh báo khi trùng lịch; AI hỗ trợ chia mục tiêu, dự đoán khả thi, xếp lịch, nhận ra kế hoạch bị lệch và đề xuất/tự điều chỉnh trong phạm vi được cấp quyền. Người dùng phải dùng được sản phẩm kể cả khi không bật AI. UX phải đẹp, liền mạch, dễ thao tác; cần web, mobile, đồng bộ và về dài hạn có Android/offline cùng các tích hợp học tập.

Các lựa chọn đã xác nhận đáng chú ý:
- `[C]` Người dùng có thể tự xếp lịch, chấp nhận trùng lịch **nếu chủ động xác nhận**; có cảnh báo và phương án khác.
- `[C]` Task có thể bắt đầu trễ hoặc người dùng quên nhấn Start; phải cho phép hồi tố thời gian/tiến độ đã làm.
- `[C]` Có nút **Cần thêm thời gian**, timer, theo dõi task chưa xong khi kết thúc phiên hoặc qua deadline.
- `[C]` AI được mong muốn có quyền kéo dài task, dời trong/sang ngày khác trước deadline, chia time block, điều chỉnh habit, giải phóng phần lịch khi xong sớm, nhưng không được động vào task ưu tiên cao và lịch khóa; người dùng cấu hình giới hạn và được thông báo/Undo.
- `[C]` Habit có streak, số phiên/tuần, thời lượng và chỉ số định lượng, tạm dừng, nhiều lần/ngày, đo linh hoạt theo từng habit.
- `[C]` Muốn lịch sử kiểu Git: timeline, diff, merge thay đổi không xung đột, chọn khi conflict và restore task/ngày.
- `[C]` Muốn web đẹp, kéo-thả trực tiếp, calendar và task list đi cùng, AI contextual, command palette, dashboard tùy biến, animation chất lượng.

## A2. Tự phản biện 12 điểm, gồm các đề xuất của chính trợ lý

| ID | Luận điểm cũ | Tự phản biện | Điều chỉnh đề xuất |
|---|---|---|---|
| CR01 | “Adaptive Replanning” là USP | Motion, Reclaim, Sunsama và các đối thủ đã hỗ trợ những phần đáng kể | `[V]` USP mới là **Goal-to-Execution-to-Recovery**, không tuyên bố chưa ai có |
| CR02 | Càng tự động càng thông minh | Dễ phá sự tin cậy, làm xáo trộn lịch, tốn AI | `[P]` Mặc định suggest-only; permissioned-auto theo từng tác vụ, opt-in |
| CR03 | AI Chat là nơi tương tác chính | Chat chậm và thừa cho Quick Add, check done, sửa block | `[P]` Direct manipulation là mặc định, chat là đường bổ trợ |
| CR04 | Tối ưu scheduling bằng tổng điểm | Trọng số có thể vô tình đánh đổi quy tắc bất khả xâm phạm | `[P]` Hard constraints → feasibility → xếp hạng soft preferences |
| CR05 | Task = thời gian trên lịch | Có thể làm nhiều phiên hoặc hoàn thành ngoài lịch | `[P]` Task, TimeBlock, WorkSession là 3 thực thể khác nhau |
| CR06 | Timer phản ánh thời gian làm việc | Người dùng có thể quên bấm hoặc để timer chạy | `[P]` Timer là tín hiệu, cho chỉnh manual log có provenance |
| CR07 | Streak là thước đo habit tốt nhất | Gây nhiễu khi habit theo tuần, tạm dừng, nghỉ có kế hoạch | `[P]` Period attainment là mặc định, streak là một chỉ số phụ |
| CR08 | “Git-like sync” = làm Git cho mọi thứ | CRDT/branch/merge phức tạp, phụ thuộc bản chất trường dữ liệu | `[P]` Version + semantic undo + field-aware conflict, mở rộng sau |
| CR09 | Free-first nghĩa là AI miễn phí rộng rãi | LLM/API và sync là chi phí tăng theo người dùng | `[P]` Core productivity miễn phí, AI có ngân sách và giới hạn minh bạch |
| CR10 | MVP phải đầy đủ mọi tính năng | Rủi ro hoàn thành một ứng dụng rộng mà không có workflow đặc sắc | `[P]` Vertical slice Goal → Plan → Do → Recover trước |
| CR11 | Chỉ đọc tài liệu đối thủ đủ để khẳng định vượt trội | Website là mô tả chức năng, không phải test UX/độ chính xác | `[V]` Benchmark hands-on riêng trước tuyên bố thương mại |
| CR12 | “Chưa code” đồng nghĩa đã sẵn sàng triển khai | Thiếu prototype thật, kiểm chứng, chốt chi phí và privacy | `[P]` Approval gates riêng: scope, UX, architecture, data, implementation |

## A3. Kết luận chiến lược (chưa phải sự thật thị trường)

**Tên làm việc:** AI Planning Ecosystem.  
**Định vị `[V]`:** “Kế hoạch vẫn tiến về phía mục tiêu ngay cả khi lịch trình thay đổi.”  
**Trải nghiệm chủ đạo:** **Capture → Clarify → Plan → Schedule → Execute → Measure → Recover → Reflect.**  
**Đối tượng ưu tiên `[P]`:** học sinh/sinh viên và người tự học có lịch thay đổi, dự án dài hạn, deadline, habit. Nhóm thứ hai: cá nhân đi làm. Chưa làm tính năng dành riêng cho tổ chức lớn ở MVP.  
**Điểm phân biệt cần kiểm chứng:** cách kết nối lượng việc thực tế còn lại và tiến độ mục tiêu với các phương án phục hồi, cùng mức kiểm soát mà người dùng cảm nhận được.

## A4. Bằng chứng từ đối thủ và giới hạn

- Reclaim 2.0 có AI Chat, Agents, Preview Mode cho phép kiểm tra thay đổi trước khi áp dụng; các hành động liên quan lịch có thể chạy ở chế độ xem trước. Nguồn: https://help.reclaim.ai/en/articles/15280604-reclaim-2-0-faq
- Reclaim Habit Agent có quy tắc di chuyển, rút ngắn phiên và xem trước tác động. Nguồn: https://help.reclaim.ai/en/articles/17124978-habit-agent-overview-automate-recurring-routines
- Motion đã giới thiệu AI calendar/auto-scheduling; kiểm tra chi tiết luồng project riêng trước so sánh UX. Nguồn: https://www.usemotion.com/features/ai-calendar
- Sunsama cung cấp daily planning và timeboxing; kiểm thử thật trước khi chấm điểm. Nguồn: https://help.sunsama.com/
- TickTick có task, calendar, habits, Pomodoro; Akiflow tập trung task + calendar + optimizer. Nguồn tham khảo: https://ticktick.com/ , https://akiflow.com/

**Không đã làm:** đăng nhập dùng thử mọi đối thủ, ghi video kịch bản thực tế, đo số click/latency, so điểm solver, phỏng vấn người dùng. Không dùng nhận định chưa kiểm chứng để làm tuyên bố bán hàng.

---

# PHẦN B — PHẠM VI, MỨC ƯU TIÊN VÀ NGUYÊN TẮC

## B1. Nguyên tắc sản phẩm

1. **Local agency:** Người dùng có thể vận hành toàn bộ chức năng lõi không có AI.
2. **One source of truth:** Lịch, task, phiên thực hiện và goal liên kết nhưng không bị đánh đồng.
3. **Plan is not reality:** Lịch dự kiến không tự được tính thành tiến độ thực tế.
4. **Safety of change:** Không tác động dữ liệu ngoài phạm vi quyền; tất cả thay đổi quan trọng có history và khả năng phục hồi.
5. **Predictable automation:** AI bị kiểm soát bởi policy và deterministic validations; không dựa hoàn toàn vào lời LLM.
6. **Honest feasibility:** Không bịa giờ trống hoặc “chắc chắn kịp” khi dữ liệu không đủ.
7. **Respect human time:** Không tự chiếm giờ nghỉ được bảo vệ; tránh over-scheduling.
8. **Accessible polish:** Giao diện cao cấp phải dùng được với bàn phím, màn hình nhỏ, reduced motion.
9. **Evolutionary architecture:** Hệ thống mở rộng được nhưng không over-engineer các chức năng chưa cần.
10. **Privacy first:** AI và tích hợp chỉ đọc dữ liệu cần thiết, với thông báo/đồng ý phù hợp.

## B2. Feature Audit — phân kỳ đề xuất

Ký hiệu `M` = MVP, `V1+` = bản sau ổn định, `V2` = mở rộng xa hơn.

| Nhóm | MVP đề xuất | V1+ | V2 |
|---|---|---|---|
| Tasks | Inbox, quick add, subtasks, status, priority, duration, deadlines, filter | templates, batch edit, dependencies | collaboration sâu |
| Calendar | Day/week; time blocks; drag/drop/resize; fixed/flexible; conflict check | month edit, external calendar free/busy | invitations, multi-calendar write |
| Goals | Goal → milestones → tasks; định lượng đơn giản; risk view | nhiều chỉ số/trọng số, goal review | cross-product outcome sync |
| Execution | Start/pause/resume/done, need more, late start, manual backfill | task-specific estimation learning | passive tracking nếu được đồng ý |
| Replanning | Đề xuất 2–3 phương án, preview, approve, Undo | opt-in low-impact auto | complex agent network |
| AI | Ngôn ngữ tự nhiên → bản nháp task/goal plan; explain | weekly coach, trend, personal rules | multi-app agent |
| Habits | Weekly count/time goal, occurrence, pause, history | flexible cadence, complex metric/streak | habit experiments |
| Analytics | Today/weekly basic, completion, estimate vs actual | forecasting, confidence calibration | advanced models |
| Data | revision, audit, reliable online save, export | offline read/write queue and merge | advanced Git-like workspace history |
| Experience | polished desktop responsive mobile web, accessibility, dark/light | dashboard widgets, command palette enhancements | native Android |
| Integrations | import/export, optional read-only calendar only if separately approved | Google/Outlook sync guarded | ecosystem extensibility |

**Chú ý:** MVP có habit cơ bản dù là scope lớn vì người dùng muốn sản phẩm đủ thực tế. Nếu nguồn lực quá nhỏ, có thể chạy nhóm beta Goal/Task trước rồi thêm Habit trước public beta — phải duyệt điều chỉnh, không âm thầm xóa habit.

## B3. Phân biệt ba mốc phát hành

- **Technical vertical slice:** demo nội bộ có thể hoàn thành Goal → Task → Schedule → Late → Recovery → Undo, dữ liệu giả lập; không cần mọi trang hoàn chỉnh.
- **Private alpha/MVP:** người dùng tạo tài khoản thử, sử dụng lịch và task ổn định, AI suggest-only, khung Goal/Habit cơ bản, backup/privacy được xác minh.
- **Public beta:** sản phẩm đủ an toàn, tốt trên điện thoại, có telemetry phù hợp/feedback, cải tiến dựa trên test, không có lỗi integrity nghiêm trọng; không đồng nghĩa có full V2.

## B4. Chức năng chưa nằm trong bản đầu

Group scheduling, business billing, enterprise permissions, native Android, unrestricted autonomous AI, AI offline, full collaboration, realtime multiuser editor, custom model fine-tuning, integrations hai chiều hàng loạt, multi-agent autonomous ecosystem.

---

# PHẦN C — PERSONA, CÔNG VIỆC CẦN GIẢI QUYẾT, KỊCH BẢN

## C1. Persona A: Người học có lịch bận `[P]`

Ngày có tiết học, hạn bài tập, các buổi luyện đề, mục tiêu tuần, hoạt động cá nhân. Hay gặp: tính quá ít thời gian, quên bắt đầu, lịch đè nhau, phải tự kéo nhiều phiên sau khi trễ. Thành công: biết phải làm gì tiếp theo và điều chỉnh không ảnh hưởng sự kiện cố định.

## C2. Persona B: Người làm việc cá nhân `[P]`

Nhiều dự án, meeting, deadline, thói quen học tập. Muốn lịch và task nhìn liền nhau, hạn chế thủ công, không muốn AI tự sửa họp hoặc kéo dài ngày làm việc vô tội vạ.

## C3. Persona C: Người không muốn AI `[C]`

Muốn sử dụng calendar/tasks/goals/habits như công cụ bình thường; AI có thể tắt; các thao tác liên quan AI không được là điều kiện bắt buộc của core workflow.

## C4. Top jobs-to-be-done

- JTBD01: Khi có mục tiêu mới, giúp biến thành các bước đủ rõ để bắt đầu.
- JTBD02: Khi có task mới, thấy thời gian trống và phát hiện conflict trước khi đặt.
- JTBD03: Khi bắt đầu trễ, có thể ghi thực tế hoặc dời phần còn lại.
- JTBD04: Khi task vượt thời lượng, biết còn bao nhiêu và nhận phương án không phá lịch.
- JTBD05: Khi tuần không đủ giờ, biết nguyên nhân và các đánh đổi cần chấp nhận.
- JTBD06: Khi bỏ lỡ habit, duy trì tiến độ dài hạn công bằng.
- JTBD07: Khi AI sửa kế hoạch, thấy ngay thay đổi nào đã xảy ra và có thể phục hồi.

## C5. North-star metric giả định `[V]`

**Weekly planned-and-tracked goal progress:** tỷ lệ người dùng có ít nhất một mục tiêu đang hoạt động, ghi nhận hành động liên quan và xem/điều chỉnh kế hoạch trong tuần. Tránh tối ưu metrics chỉ tăng số time blocks hoặc thời gian ở trong app. Định nghĩa cần test với cohort; không coi số giờ ghi trên lịch là năng suất thực.

---

# PHẦN D — INFORMATION ARCHITECTURE VÀ GIAO DIỆN

## D1. Cây điều hướng

```
Workspace
├── Today (mặc định đề xuất)
├── Calendar (Day / Week; Month read-only ở MVP nếu có)
├── Tasks (Inbox / All / Upcoming / Completed)
├── Goals (Overview / Goal detail / Milestones)
├── Habits (Active / Paused / History)
├── Activity (history, agent changes, undo)
└── Settings
    ├── Profile / timezone / locale
    ├── Working hours / rest hours / scheduling preferences
    ├── AI permissions / model consent / usage
    ├── Notifications
    ├── Data & privacy / export / deletion
    └── Connected calendars (khi được triển khai)
Global: Quick Add, Search, contextual AI, notifications, Undo, sync indicator.
```

## D2. Today dashboard — đặc tả hành vi

**Vùng A: Ngày hiện tại**: thời gian, timezone, lịch cố định, time blocks của task/habit, trạng thái rảnh/bận.  
**Vùng B: Next Action**: task tiếp theo, nút Start, Done, Need More Time, reschedule.  
**Vùng C: At Risk**: task/goal có cảnh báo deadline, reason + CTA View Plan.  
**Vùng D: Habits**: mục tiêu tuần, đã làm, cần làm; ghi hoàn thành bằng một thao tác.  
**Vùng E: Reflection**: đã làm bao nhiêu, actual vs estimated, vấn đề còn lại; không ép người dùng nộp báo cáo mỗi ngày.

Empty state: gợi ý thêm task hoặc mục tiêu bằng manual/AI; tuyệt đối không tự tạo lịch nếu không xác nhận. Loading: skeleton; error: rõ lý do, retry; offline: trạng thái đồng bộ trung thực.

## D3. Calendar

Day và Week với trục thời gian và vùng ngày. Meeting/fixed event khác màu/kiểu viền với task block và habit. Drag từ Inbox → vùng trống mở preview; drop vào chỗ trùng event thì hiển thị lỗi và lựa chọn khác hoặc ghi ngoại lệ nếu chính sách cho phép. Resize block không tự đổi estimated total effort của task nếu người dùng chỉ đổi allocation; phải hỏi hoặc làm rõ *đổi phiên* vs *đổi ước lượng*. Block nhiều phiên hiển thị liên kết tới task gốc. Các lớp hiển thị: busy, free, unavailable, preference, tentative, confirmed. Có keyboard alternative và tap-to-reschedule trên mobile.

## D4. Tasks / Inbox

Quick Add tối giản: tên → tạo Inbox ngay; optional duration, due date, priority, goal, recurrence, notes, tag. Task detail drawer hiển thị Estimate, Remaining, Deadline, Priority, Lock/flexibility, Subtasks, Scheduled Blocks, Work Logs, History, AI actions. Completion không phụ thuộc đã chạy timer hay chưa. Task có thể không được đưa vào Calendar. Filters: today, due soon, unscheduled, at risk, completed, goal. Bulk edit sau MVP nếu làm tăng phức tạp.

## D5. Goals

Goal creation: tên, mô tả kết quả đạt được, metric kiểu count/percent/milestone hoặc manual, target, deadline tùy chọn. Có AI Breakdown thành **draft** milestone/tasks; người dùng sửa rồi xác nhận. Goal detail: outcome, baseline, current, remaining, velocity dữ liệu thực, projected outcome hoặc *insufficient data*, linked tasks/habits, planned time, actual progress, reasons at risk, recovery proposals. Không đánh đồng hoàn thành task với tự động hoàn thành goal nếu metric định lượng độc lập.

## D6. Habits

Habit setup: tên, goal liên kết, kiểu mục tiêu (ví dụ 4 lần/tuần; 120 phút/tuần; 20 lần/tháng), khung giờ có thể đặt, min/max session length, optional pause. Check-in nhiều lần, tạm dừng, bỏ qua chủ đích, lịch sử theo kỳ. “Streak” là optional biểu đồ: nghỉ chủ đích xử lý theo quy tắc habit, hiển thị minh bạch; hệ thống không giả định mọi người muốn streak liên tiếp.

## D7. AI & Recovery panel

Ở Task/Goal/Calendar luôn có contextual action như “Chia nhỏ”, “Tìm giờ”, “Tại sao không kịp?”, “Cần thêm thời gian”, “Phục hồi kế hoạch”. Chat dùng để đưa ý định hoặc hỏi lại; mọi đề xuất có structured card và các nút **Preview / Edit / Approve / Dismiss**, ảnh hưởng cụ thể, Undo eligibility. Nếu AI không rõ, nêu giả định và yêu cầu người dùng kiểm tra; tuyệt đối không tự cho là đã thực hiện.

## D8. Activity & History

Chronological log có filter người dùng / AI / sync / nhập dữ liệu; event chứa actor, object, before/after, reason, timestamp, undo button nếu còn hợp lệ. Undo sau thao tác phụ thuộc phải kiểm tra impact, có thể yêu cầu chọn phương án thay thế; không tự đảo về lịch cũ gây conflict.

## D9. Mobile UX

Bottom navigation: Today, Calendar, Tasks, Goals, More; nút Quick Add thuận ngón tay. Day agenda thay cho week grid dày đặc; edit block bằng chọn giờ và gợi ý slot, không phụ thuộc precision drag. Start/Pause/Done/Need More accessible ở Today; offline banner. Responsive web trước, native Android sau. Mục tiêu thao tác nhanh không có nghĩa ép người dùng bật notification.

## D10. Design System

- Visual: hiện đại, tối giản, giàu phân cấp thị giác; không mặc định glassmorphism ở mọi nơi.
- Token: semantic colors (background, surface, primary, success, warning, danger), typography scale, 4/8 spacing, radii, elevation, focus ring, motion duration.
- Light/dark cần tương phản tốt; phân biệt task status bằng icon/text, không dùng chỉ màu.
- Animation: feedback, đổi lịch, Undo; tắt/giảm khi prefers-reduced-motion.
- Component states: hover, focus, disabled, loading, error, success, optimistic/pending, conflict, readonly.
- Keyboard: tab-order, Enter/Escape, date/time accessible inputs, command palette; không khóa người dùng vào drag-only.
- WCAG 2.2 AA làm đích thiết kế, cần audit thực tế.

## D11. Prototype scenarios bắt buộc trước code

PX01 Quick Add → Inbox → Schedule.  
PX02 Goal 30 bài → AI draft → user edit → feasibility → approve.  
PX03 TimeBlock trùng fixed event → warning → 2 slot khác.  
PX04 18:00 dự kiến, 18:30 mới bắt đầu → ghi nhận late start hoặc backfill.  
PX05 Need More Time +45 phút → impact preview 2–3 plans → approve.  
PX06 Undo proposal sau đó có task khác đã sửa.  
PX07 Mobile tap-to-reschedule, keyboard-only equivalent.  
PX08 Người dùng tắt AI nhưng vẫn xếp lịch thủ công bình thường.

---

# PHẦN E — MÔ HÌNH DỮ LIỆU KHÁI NIỆM

## E1. Thực thể và trách nhiệm

| Entity | Trách nhiệm | Các thuộc tính quan trọng |
|---|---|---|
| User | Chủ dữ liệu | id, locale, timezone, preferences |
| CalendarSource | Nguồn sự kiện nội bộ/ngoài | source, permissions, sync state |
| CalendarEvent | Meeting, lớp học, lịch cố định | start/end, timezone, availability, locked, origin |
| Goal | Kết quả hướng đến | metric type, target, current, deadline, status |
| Milestone | Điểm đo trên hành trình goal | goal ref, target, dependency, status |
| Task | Việc cần hoàn thành | title, status, due, estimate, remaining, priority, flexibility |
| TaskLink | Parent/subtask, liên hệ Goal | parent, child, relation, ordering |
| TimeBlock | Thời gian dự kiến cho Task/Habit | reference, planned start/end, status, lock |
| WorkSession | Việc thật đã làm | actual start/end or minutes, entry source, edited flag |
| HabitDefinition | Quy tắc thói quen | cadence, metric, target, allowed windows, pause |
| HabitOccurrence | Lần/kỳ theo dõi habit | period, completion, work amount, skip reason |
| ScheduleProposal | Phương án tương lai chưa commit | snapshot revision, changes, score, impact, expiration |
| AgentPermission | Phạm vi thao tác được cấp | categories, limits, scope, active, updated at |
| AgentAction | Hành động từ AI | proposal, authorization, outcome, undo link |
| AuditEvent/Revision | Lịch sử đã xảy ra | actor, diff, reason, timestamp, revision |
| SyncMutation/Conflict | Hàng đợi/offline conflict | idempotency key, base revision, diff, resolution |
| Notification | Thông báo | trigger, severity, delivery, read state |

## E2. Các bất biến dữ liệu

1. Một Task có 0..n TimeBlocks và 0..n WorkSessions; 1 block không bắt buộc tương ứng 1 actual session.
2. Goal progress có thể định lượng độc lập; 1 task hoàn thành không tự tăng đơn vị đo nếu thiếu mapping rõ.
3. Sự kiện external không được ngầm sở hữu bởi hệ thống; provider là nguồn dữ liệu gốc cho thuộc tính ngoại lai.
4. Mọi write có owner, revision và audit; tránh ghi đè không phát hiện.
5. Actual Work Log do người dùng ghi bổ sung/điều chỉnh không được bí mật sửa các block đã tồn tại.
6. Time lưu dạng absolute instant + IANA timezone/locale dùng hiển thị/recurrence; ngày không phải instant cần phân biệt.
7. Xóa có quy trình restore theo retention; không tự xóa dây chuyền task/subtask/goal không xác nhận.
8. AI proposal có snapshot version và thời điểm hết hiệu lực; không commit trên snapshot stale.

## E3. Task state machine

```
not_started → in_progress → paused → in_progress → completed
     │              │              └────────→ completed
     ├──────────────┴───────────────────────→ cancelled (confirmed)
     └──────────────────────────────────────→ completed (manual marking)
```

Đánh dấu độc lập: `late_start`, `overdue`, `overtime`, `at_risk`; các flag có thể đồng thời đúng. Deadline đã qua không có nghĩa task tự chuyển `cancelled` hoặc `completed`. Không tự coi block kết thúc = task thất bại; cần đánh giá remaining/progress.

## E4. Thời gian dự kiến và thực tế

- `estimated_effort`: tổng nỗ lực dự kiến; `scheduled_allocation`: tổng thời lượng đã đặt trên lịch; `actual_effort`: ghi nhận thực tế từ work sessions, có thể thiếu dữ liệu.
- `remaining_effort` ban đầu là estimate; khi có work log có thể hỏi còn bao nhiêu, không máy móc lấy estimated - actual nếu nỗ lực bị đánh giá sai.
- Nếu người dùng không dùng timer, có thể nhập công việc đã thực hiện theo phút và outcome; event này có nguồn 'manual' để phân biệt với timer.
- WorkSession không tự suy ra năng suất/khả năng học chỉ từ số phút.

---

# PHẦN F — SCHEDULING ENGINE ĐẶC TẢ

## F1. Phân tầng trách nhiệm

Scheduler là **deterministic constraint and proposal service**; LLM có thể diễn đạt yêu cầu và giải thích, nhưng **không có quyền tự tuyên bố một slot trống hoặc ghi thẳng**. Giao diện manual calendar luôn gọi cùng validator để cảnh báo và lưu ngoại lệ đã đồng ý.

## F2. Inputs

Snapshot lịch hiện tại + revision; user timezone, working/unavailable/rest windows, event busy status; task estimate/remaining; earliest start/desired due; task priority/goal importance/flexibility/splittability/min block; habit cadence/min/max; locks, external calendar cache freshness; agent permission profile; scheduling horizon và performance cap.

## F3. Hard Constraints

- H1 Locked/fixed event không bị auto-moving/unlocking.
- H2 Mọi move/extend/split do agent cần quyền hành động tương ứng và quyền đối tượng.
- H3 Không auto-overlap trong thời gian unavailable/busy/locked; manual override chỉ cho các conflict mà user có quyền override, có ghi ngoại lệ.
- H4 Không tự sửa due/deadline hoặc xóa task.
- H5 Không tự xếp ngoài vùng nghỉ bảo vệ/hours hard; giờ nghỉ mềm chỉ đánh đổi trong điều kiện rõ ràng.
- H6 Không scheduling task khi prerequisite chưa sẵn sàng, nếu dependency feature bật.
- H7 Block có duration dương, thời điểm tồn tại hợp lệ, timezone/recurrence không mơ hồ.
- H8 Validate revision trước apply; reject stale proposals.
- H9 Không đặt phần còn lại quá deadline hard rồi mô tả “đảm bảo kịp”; nếu user chấp nhận risky plan phải ghi nhận cảnh báo.
- H10 Không tạo session nếu task/habit đã bị archived/cancelled.
- H11 Respect max workload/guardrails được người dùng khóa cấu hình.

## F4. Soft Objectives (xếp sau mọi hard rules)

S1 giảm nguy cơ trễ deadline; S2 ưu tiên mức quan trọng Goal/Task; S3 đáp ứng target Habit; S4 hạn chế xâm lấn rest soft; S5 ưu tiên giờ làm việc yêu thích; S6 giảm thay đổi lịch đã ổn định; S7 tránh fragmentation; S8 tăng completion potential; S9 fairness giữa các goal và thói quen. MVP dùng 2–3 preset dễ hiểu: **Đúng hạn / Cân bằng / Giữ lịch ổn định**; advanced weights xuất hiện sau khi có phản hồi thật.

## F5. Ranking minh bạch

1. Loại candidate vi phạm hard constraints.
2. Với candidate hợp lệ, tính deadline risk (mức trễ dự báo và số task at risk) rồi đánh giá mục tiêu; nếu không đủ data báo uncertain.
3. Dùng weighted rank cho soft objectives **sau** feasibility; giới hạn số lần move và fragmentation.
4. Chọn tối đa 3 giải pháp đa dạng thực sự (không phải 3 lịch gần như giống nhau), với tradeoff rõ: Minimal Change / Deadline First / Balanced.
5. Nếu không có phương án hợp lệ, đưa report không khả thi, shortfall và cách người dùng có thể quyết định giảm scope, dời deadline, giảm cadence hoặc chấp nhận rủi ro. Việc user chọn thay đổi deadline là thao tác riêng cần xác nhận.

## F6. Loại yêu cầu và trigger

- Manual drag/resize/create/delete trên calendar.
- `Need More Time`: người dùng nhập/ước lượng phần còn lại; không nhất thiết +n bằng n giờ đã chạy.
- `Late Start`: đã đến start + grace period, chưa ghi nhận Start; hệ thống có thể nhắc/dò trạng thái, không tự kết luận người dùng không làm.
- End time reached but task unfinished: cảnh báo, offer log/done/remaining.
- Timer > estimate: cảnh báo cân nhắc, không tự pause hoặc kết luận thất bại.
- Deadline approaching/risk: nếu có data, proactive alert.
- New fixed event overrides flexible plan.
- User explicitly chooses “Optimize” / weekly planning.

## F7. Chiến lược xử lý task bắt đầu trễ

1. Khi tới time block mà chưa Start, chờ grace period cấu hình.
2. Sau grace, đưa actions “Bắt đầu ngay”, “Đã làm rồi”, “Dời phiên”, “Bỏ qua phiên”, “Không nhắc lại”.
3. Nếu user chọn “Đã làm rồi”, nhập khoảng thời gian thực và ghi provenance manual; tính lại remaining theo câu trả lời thực tế.
4. Nếu Start muộn, hệ thống so block end và next fixed event; chỉ kéo dài nếu slot phù hợp và có quyền.
5. Nếu phần còn lại quá lớn, đề xuất tách phiên/di chuyển block và nêu goal impact.
6. Không tự lặp thông báo gây phiền; setting snooze/mute.

## F8. Recovery Planning

Input: task unfinished + remaining effort, locks, available slots, priority, goal milestone dependencies, habit commitments, rest windows, deadlines, permission and revisions. Output: structured plan alternatives.

Một recovery card chứa: trigger; snapshot time; `remaining` và confidence; các event/task/habit bị thay đổi; danh sách move/add/split/release; vì sao; risk; plan preview; permission requirement; undo eligibility; expiry; nếu infeasible có shortfall giờ/việc.

Three strategies:
- **Minimal Disruption:** ưu tiên giữ lịch cũ, chia phần còn lại sang giờ trống gần nhất.
- **Deadline Priority:** ưu tiên công việc gấp, dời task flexible thấp hơn trong giới hạn.
- **Balanced:** duy trì giờ nghỉ/habit/goal khác, có thể đề nghị user điều chỉnh scope.

## F9. Trường hợp đặc biệt

- Task completed early: đề xuất hoặc tự release đúng **phần đã được phép**; không thay đổi task thứ ba nếu không được cấp.
- Task overdue với no time: hiển thị rủi ro và lựa chọn giảm scope/đổi deadline thủ công.
- Deadline thay đổi thủ công: re-evaluate linked tasks, không tự xóa lịch cũ nếu locked.
- Recurrence/daylight saving: sinh occurrence theo local timezone; day DST skip/repeat cần chính sách rõ.
- Two providers busy update: stale free/busy status làm auto-action dừng và yêu cầu refresh.
- Scheduling oscillation: giới hạn số lần replan, cooldown, min benefit to move, ưu tiên ổn định.
- Multi-task balance: tránh luôn đẩy habit hoặc task ít ưu tiên xuống vô hạn.
- High-priority task: mặc định protected auto-move; user có thể chủ động dời thủ công.
- Uncertain estimate: trả range; không phát ra “100% sẽ hoàn thành”.

## F10. Pseudo-contract (đặc tả, không phải code)

**Request** = user identity + action + object IDs + base revisions + constraints + preferences + time horizon.  
**Proposal Response** = feasible flag + shortfall if any + proposals[] with changes, impact, confidence caveats, expires_at + required authorization.  
**Commit Request** = selected proposal ID + snapshot revision + explicit decision or permission token.  
**Commit Result** = applied change IDs + new revisions + audit reference + undo capability OR precise reason rejected.

---

# PHẦN G — AI AGENT: SCOPE, QUYỀN, CHẤT LƯỢNG

## G1. Agent capability map

| Action | MVP default | Opt-in future | Bảo vệ |
|---|---|---|---|
| Tạo draft goal/milestone/task | Allowed as proposal | Có thể lưu sau xác nhận | Không tạo thật từ text mơ hồ |
| Tìm giờ trống, giải thích xung đột | Allowed | N/A | Đọc trong phạm vi quyền |
| Đề xuất replan | Allowed | N/A | Scheduler validate |
| Move flexible task trong cùng ngày | Requires approval | Auto within scope | Không locked/high priority |
| Move sang ngày khác trước deadline | Requires approval | Auto within scope | Respect due + available |
| Extend/split time block | Requires approval | Auto within scope | Respect fixed and rest |
| Điều chỉnh giờ/habit duration | Requires approval | Auto within scope | Chỉ trong min/max đã duyệt |
| Release block done early | Requires approval | Auto within scope | Không tự sửa actual logs |
| Ước lượng thời lượng từ history | Suggest/preview | Opt-in | Không tự ghi đè dữ liệu gốc |
| Thay deadline, xóa task, mở khóa event | Manual only | No unattended action | Xác nhận cụ thể |
| Gửi dữ liệu sang tích hợp bên thứ ba | Not in MVP | Per-connector consent | Least privilege + redaction |

## G2. Policy model

Permission = who (user/workspace) + what (action) + which objects (scope) + allowed timing + thresholds (minutes, moved task count, day shift, importance) + validity + explicit revocation. Default **Suggest Only**. Advanced config dựa impact; ràng buộc bảo vệ không bị bỏ qua bởi slider người dùng. Quyền revoked trong khi AI tính thì commit phải fail.

## G3. Execution lifecycle

`Intent → Draft → Structured Proposal → Scheduler Validate → Impact Classify → Permission Check → Preview/Approval → Atomic Revalidate & Commit → Audit → Notify → Undo possible`. Không có bước nào cho LLM tự bypass validator. Mọi callback/retry phải idempotent.

## G4. AI quality / hallucination resistance

- AI có thể sai khi trích xuất duration/deadline, tạo task mơ hồ hoặc bịa priority. Mọi field suy diễn phải có mark `assumed` và hỗ trợ sửa.
- Generate only structured drafts; task không có date/estimate thì hỏi hoặc đặt default minh bạch, không giả làm user đã chọn.
- Không giao cho LLM phép so khoảng thời gian làm nguồn sự thật; scheduler engine xử lý.
- Eval prompt với ambiguous phrases, multi-language (Việt/Anh), timezone, deadlines, schedules, conflicting instructions.
- Nếu model failure, sử dụng manual workflow; không xóa kế hoạch cũ.
- Token/cost budgets cho từng loại tác vụ; cache khi hợp lệ, tuyệt đối không cache dữ liệu riêng sang người khác.

## G5. Notification policy

Thông báo khi AI commit một thay đổi, khi cần xác nhận, khi rủi ro deadline đáng kể, khi sync conflict. Có xem lại trong Activity, aggregate/batch khi nhiều thay đổi để tránh notification spam. User quản lý kênh thông báo và quiet hours; urgent không được tự vượt quiet hours nếu user không chọn.

## G6. Explainability

Mọi card giải thích: nguyên nhân trigger, assumption, before-after, ảnh hưởng deadline/goal/habit, tại sao ưu tiên phương án, nội dung người dùng phải quyết định, cách Undo. Nếu do AI model viết rationale, phải kiểm tra khớp structured facts, không tự bịa.

---

# PHẦN H — HABIT, GOAL, PROGRESS & PERSONALIZATION

## H1. Habit vs Recurring Task

**Habit:** cam kết duy trì một hành vi/thực hành, mục tiêu theo kỳ (lần/phút/lượng), có thể skip/pause, linh hoạt xếp lịch.  
**Recurring Task:** mỗi chu kỳ sinh một nghĩa vụ/task cần được hoàn thành; mỗi occurrence có thể có due riêng và trạng thái riêng. Một người có thể chuyển kiểu về sau bằng thao tác chủ động; không tự đồng nhất hai entity.

## H2. Habit rules

MVP: cadence weekly + daily, target count/duration, completion log, pause, history; later monthly/custom and mixed metrics. Quá hạn chu kỳ: đánh giá attainment đã làm/target, vẫn giữ quá khứ; không backdate completion im lặng. Pause giữ metadata và lựa chọn có tính kỳ pause vào streak hay không. Người dùng có thể ghi nhiều lần mỗi ngày; ngăn đếm trùng activity nếu đồng bộ timer + manual nhập.

## H3. Goal progress

- Count goal: actual units / target units; ví dụ 18/30 bài.
- Milestone goal: completion of explicit milestones with weights if configured; thiếu weight dùng quy tắc rõ.
- Task completion goal: fraction finished, không đồng nghĩa outcome nếu goal has measurable units.
- Composite goal: weighted dimensions with provenance, user view can inspect breakdown; chỉ thêm khi nhu cầu đã kiểm chứng.
- Risk: expected effort left vs available permissible time; học từ lịch sử khi đủ sample; nếu không, hiển thị “ước lượng ban đầu / ít dữ liệu”.

## H4. Estimation learning

Phase 1: show estimated vs actual and allow manual adjustment. Phase 2: recommend effort ranges for similar tasks based on enough comparable sessions, consent and clear uncertainty. Không nói “AI hiểu chính xác bạn”, không suy luận y tế/tính cách từ thời gian làm việc.

## H5. Weekly review

Số goal tiến triển, task hoàn thành/chưa, habit adherence, time estimates accuracy và 1–3 đề xuất khả thi. Không đánh giá đạo đức/người dùng qua năng suất; có thể tắt reminders và analytics không cần thiết.

---

# PHẦN I — SYNC, VERSIONING, OFFLINE

## I1. MVP reliability baseline

Ứng dụng web lưu dữ liệu authoritative ở server, version trên entity, optimistic UI chỉ được báo thành công khi server xác nhận, conflict server được hiển thị. Có export dữ liệu và account-delete flow; backup và restore drill ở phía vận hành trước public beta.

## I2. Future offline model

Device local cache + durable mutation outbox + unique idempotency ID + base entity revision + eventual server reconcile. Offline UX phải hiện dữ liệu có thể cũ, tình trạng pending, last sync và retry. Nếu có conflicting edits lên `start_time`, `due`, `lock`, không last-write-wins mù quáng.

## I3. Git-like concepts but not Git itself

- Timeline của thay đổi; diff hai revisions; selective semantic Undo/restore.
- Field-level merge cho nonoverlapping compatible edits, nhưng vẫn chạy cross-field validator.
- Conflict rõ ràng khi hai thiết bị đổi cùng date/time hoặc các trường liên quan gây vi phạm constraint.
- Day restore là một **plan proposal**, không được ghi đè changes về sau mà thiếu preview.
- Retention/version cap, quyền xóa/khôi phục và privacy giải quyết trước khi triển khai.

## I4. Đồng bộ lịch bên ngoài

Điều chỉnh theo quyền riêng: chọn connection, đọc busy/free hay detail, phạm vi lịch, sync freshness, revoke. Bản đầu đề xuất chỉ hiển thị hoặc free-busy khi đã duyệt; không tự ghi/cancel meetings của nguồn ngoài. Khi sync stale/failed, scheduler cảnh báo và không auto-commit kế hoạch dựa trên availability chưa đáng tin.

## I5. Conflict scenario mẫu

Laptop đổi Task A start 18:00 → 19:00; điện thoại offline sửa description: merge có điều kiện nếu revision hợp lệ và validation pass. Nếu điện thoại cũng đổi start thành 20:00, hiển thị hai phiên bản và downstream impact; người dùng chọn giữ 19:00, 20:00 hoặc sửa khác. Audit phải lưu quyết định, không mất manual work logs.

---

# PHẦN J — AN TOÀN DỮ LIỆU, QUYỀN RIÊNG TƯ, CHẤT LƯỢNG

## J1. Privacy & security requirements

- Tách dữ liệu theo owner/workspace; object-level authorization ở server; không chỉ ẩn trên UI.
- Không đưa secrets/API keys vào client bundle; session token an toàn và xoay vòng phù hợp.
- Encrypt transport, secure server storage and backups, least privilege database and services.
- Mọi LLM request có data minimization, user consent khi gửi thông tin sang provider, rõ phạm vi lưu log/retention theo hợp đồng và pháp luật áp dụng.
- Không nhúng nội dung toàn lịch trong telemetry/traces. Redact private task titles where possible.
- Account export, delete account, data retention schedule, restore policies cần chốt trước user beta.
- Threat scenarios: prompt injection trong description/task/imported event; AI asked to delete tasks; calendar permissions escalation; cross-user data leakage; stale proposals; replay of actions.
- Nếu phục vụ người dưới 18, cần thiết kế age-appropriate privacy/notification, công khai việc xử lý dữ liệu và xem xét yêu cầu pháp lý theo khu vực trước release.

## J2. Accessibility

WCAG 2.2 AA là đích thiết kế; keyboard-only tasks, contrast, visible focus, semantic labels, motion reduction, responsive 320px+, screen-reader calendar alternative. Cần kiểm tra bằng công cụ và người dùng, không khẳng định đạt tiêu chuẩn chỉ vì đã ghi trong tài liệu.

## J3. Performance & cost requirements

- UX critical actions phải có phản hồi tức thời/feedback rõ, với SLO định lượng p95 thiết lập sau baseline trên hardware mục tiêu.
- Solver có timeout và fallback: trả phương án giản lược hoặc “không thể tìm trong giới hạn xử lý” thay vì treo.
- AI có per-user quota/budget controls; khi hết quota vẫn dùng được core features; không buộc mua chỉ để xem dữ liệu đã tạo.
- Track reliability metrics: error rate, scheduler failures, sync conflicts, unauthorized writes, successful undo, AI draft acceptance, recovery usefulness.
- Release blocker: dữ liệu mất/hỏng, AI ghi vượt quyền, solver phá hard constraint, account leak.

---

# PHẦN K — ACCEPTANCE CRITERIA CÓ THỂ KIỂM THỬ

Dưới đây là danh sách test bằng hành vi; tài liệu hiện chỉ **định nghĩa** test, chưa chạy chúng.

## K1. Tasks & Goals

- AT01 Tạo task chỉ với tiêu đề: task vào Inbox, không tự đặt giờ ngẫu nhiên.
- AT02 Task có due nhưng thiếu estimate: UI cho đặt lịch thủ công, AI ghi nhận estimate chưa có.
- AT03 Một task có ba time blocks; hoàn thành một block không đổi task thành completed.
- AT04 Task hoàn thành thủ công mà không Start: task completed, actual effort không tự gán thời lượng block.
- AT05 Subtask được sắp lại thứ tự, không làm mất liên kết goal.
- AT06 Goal 30 đơn vị; ghi 18 outcome, hiển thị 18/30 kể cả nếu số task completed khác.
- AT07 Chỉnh goal metric dẫn tới thay đổi progress: có cảnh báo nếu dữ liệu cũ không tương thích.
- AT08 AI tạo 12 draft subtasks: người dùng xóa/chỉnh trước khi save; chưa duyệt thì không có record thật.

## K2. Calendar & Scheduling

- AT09 Drag block vào lịch cố định → warning, không auto-overwrite event.
- AT10 Người dùng cố ý override một conflict được phép → xác nhận, audit exception.
- AT11 Agent không được override conflict nếu không có quyền, kể cả user đặt weight 5/5.
- AT12 Fixed meeting không di chuyển trong mọi test auto-replan.
- AT13 Protected rest block không được tự chiếm; soft rest có biểu thị tradeoff.
- AT14 TimeBlock resize không tự sửa estimated total của task nếu không xác nhận.
- AT15 Split task 2h thành các phiên 45+45+30 hợp lệ theo min duration.
- AT16 Task deadline đến trước các slot trống → report shortfall, không khẳng định feasible.
- AT17 Hai task cùng priority, deadline: ranking có quy tắc tie-break và ổn định.
- AT18 Replan ba lần cùng input không dao động vô cớ.
- AT19 DST gap/fold; timezone travel; leap day và gần nửa đêm: không mất hoặc nhân đôi thời gian.
- AT20 External calendar stale → auto-commit bị chặn; manual warning hợp lệ.

## K3. Execution & Recovery

- AT21 Time block start 18:00, user bắt đầu 18:30: late-start recognized nhưng chưa coi là chưa làm.
- AT22 User chọn “đã làm nhưng quên Start”: lưu WorkSession manual và cập nhật outcome riêng.
- AT23 Timer vượt estimate: không tự complete, không tự kết luận 100% actual productive.
- AT24 Need More Time 45 phút; 19:00 fixed event: chỉ đề xuất slot khác hợp lệ.
- AT25 Hoàn thành sớm: release unused block trong giới hạn được phép, không thay đổi unrelated events.
- AT26 No available time: hiển thị ít nhất một phương án thủ công (scope/deadline) hoặc lý do không thể.
- AT27 Recovery preview cho biết count và danh tính task bị move và deadline risk.
- AT28 User dismiss proposal → không có thay đổi dữ liệu.
- AT29 Proposal stale do edits on another device → commit rejected, refresh.
- AT30 Undo change khi schedule hiện tại còn compatible → restore + audit.
- AT31 Undo change gây conflict mới → không blind restore; hiển thị preview/conflict.

## K4. Habit & Progress

- AT32 Habit mục tiêu 4 lần/tuần, 3 lần completed: hiển thị 3/4 và không tự mark complete.
- AT33 Habit pause 7 ngày: occurrence trong khoảng được xử lý theo policy đã chọn.
- AT34 Habit nhiều sessions cùng ngày: đếm đúng theo metric, không double count.
- AT35 AI không tự giảm weekly target khi lịch chật nếu chưa được cấp quyền/duyệt.
- AT36 Goal được cập nhật bởi metric độc lập không bị thay sai khi một time block dời.

## K5. AI authorization & Data

- AT37 AI không tự xóa task, đổi deadline, unlock fixed event.
- AT38 Permission revoked mid-operation → action bị từ chối tại commit.
- AT39 AI tạo task từ text chứa prompt injection → không vượt quyền.
- AT40 Mọi commit có actor, diff, source, snapshot và audit ID.
- AT41 Duplicate request/retry không tạo hai task/block.
- AT42 Đăng nhập user B không thể xem/sửa task user A bằng đoán ID.
- AT43 Hết AI quota vẫn create/edit tasks manually.
- AT44 Export đủ dữ liệu người dùng thuộc phạm vi sản phẩm, tuân chính sách privacy.
- AT45 Server error sau optimistic update → UI rollback hoặc đưa status pending chính xác.

## K6. Offline, UX & Release

- AT46 Future offline queued edit sync một lần sau reconnect.
- AT47 Same-field conflict trên hai thiết bị hiện diff và yêu cầu resolve.
- AT48 Field non-overlap merge không phá cross-field constraints.
- AT49 Responsive mobile: Create/Complete/Need More without desktop drag.
- AT50 Keyboard-only thao tác Quick Add, task detail, conflict dialog, confirmation và Undo.
- AT51 Screen reader đọc được trạng thái fixed/flexible/locked mà không dựa chỉ màu.
- AT52 Reduced motion tắt chuyển động không thiết yếu.
- AT53 Empty state AI disabled không chặn onboarding.
- AT54 System backup restore drill kiểm tra data integrity.
- AT55 No critical data integrity/permission/solver incident trong tập kiểm thử phát hành đã phê duyệt.

## K7. Nonfunctional acceptance targets (đề xuất, chưa đo)

- 0 unauthorized mutation trong toàn bộ automated security/action tests.
- 0 hard-constraint violation trong bộ stress/property test xác định.
- 0 verified data loss trong sync/backup/restore test matrix; không tuyên bố zero risk ngoài test.
- Mục tiêu usability exploratory: tối thiểu 5–8 cuộc phỏng vấn và 5–10 prototype tests; >=80% các tác vụ lõi được hoàn thành không cần trợ giúp là **ngưỡng thử nghiệm đề xuất**, chưa đạt.
- Đặt SLO latency dựa thiết bị/network thử nghiệm và real baseline, không bịa benchmark.

---

# PHẦN L — USER RESEARCH, VALIDATION, BẰNG CHỨNG CẦN THU

## L1. Competitor hands-on experiment

Dùng cùng kịch bản: mục tiêu 30 bài thuật toán/4 tuần, học Anh 4 lần/tuần, fixed class, late start 30 phút, overrun 45 phút. Trên Reclaim, Motion, Sunsama, TickTick, Akiflow: thử task creation, goal tracking, schedule, late start, replan, undo, habit impact. Ghi bằng chứng screenshot/video, thao tác thực hiện, mức độ hiểu, latency, constraints; chấm theo scoring rubric đã xác định. Không gán score nếu chưa thử.

## L2. Người dùng cần kiểm chứng

5–8 cuộc phỏng vấn định tính ban đầu, không claim đại diện thị trường. Câu hỏi mở: “Kể lại lần gần nhất kế hoạch ngày bị vỡ”, “Bạn đã làm gì để cập nhật lịch?”, “Điều gì khiến bạn không tin AI?”, “Bạn biết mình còn bao nhiêu việc bằng cách nào?” Không hỏi dẫn: “Bạn có muốn AI tuyệt vời của chúng tôi không?”.

## L3. Prototype usability test

Cho người dùng thao tác demo: tạo task, xếp lịch, goal breakdown, late start, need more, preview/approve/undo. Theo dõi task completion, số bước, misclicks, hiểu tác động, willingness to reuse. Thu thập ý kiến để sửa UX và scope.

## L4. Hypothesis ledger

- HY01 `[V]`: Người dùng thấy Recovery Planning có giá trị hơn chỉ dời block.
- HY02 `[V]`: Goal outcome metric giúp duy trì kế hoạch nhiều tuần.
- HY03 `[V]`: Preview & explanation khiến người dùng tin tưởng automation hơn.
- HY04 `[V]`: Habit linh hoạt không tạo thêm quá tải.
- HY05 `[V]`: Target student/learner có nhu cầu đủ thường xuyên.
- HY06 `[V]`: Có khả năng vận hành AI với chi phí free-first.

Mỗi hypothesis phải có cách test, baseline, accept/reject criteria, kết quả, link bằng chứng và quyết định thay đổi. Không được tự ghi “validated”.

---

# PHẦN M — ROADMAP, KIẾN TRÚC KỸ THUẬT VÀ CỔNG DUYỆT

## M1. Công việc **trước code**

**P0 — Product Review:** thống nhất audience, positioning thử nghiệm, toàn bộ feature audit và MVP boundary.  
**P1 — UX Blueprint:** screen map, wireframe chi tiết, UI states và interactive prototype đặc biệt cho Recovery Planning.  
**P2 — Validation:** benchmark hands-on và user tests có bằng chứng, cập nhật ưu tiên theo findings. Nếu không thể thực hiện ở thời điểm hiện tại, đánh dấu pending có trách nhiệm, không giả hoàn thành.  
**P3 — Technical Decision Package:** chọn stack, data ownership, auth, DB, scheduling solver approach, LLM provider, cost cap, offline/online phase, hosting, legal/privacy review; viết ADR so sánh phương án.  
**P4 — Final Approval:** product owner duyệt phạm vi, UX, permissions, security, costs, testing, roadmap rồi mới cấp quyền code.

## M2. Kiến trúc logical recommendation

- **Presentation:** Responsive Web UI; local UI state, accessibility, optimistic interaction; không chứa secrets.
- **Application API:** authenticated CRUD, goal/task/habit operations, calendar operations, revision checks, transactions.
- **Domain Core:** Task/Goal/Habit/TimeBlock/WorkSession models, invariants, recurrence service.
- **Scheduling Service:** free interval computation, constraint validation, candidate generation, evaluation, proposal store.
- **Agent Orchestrator:** plan parsing, AI draft, permission evaluation, compose preview, read context/permissions; không ghi thẳng domain.
- **Audit & Sync:** semantic event logs, revision, transaction and idempotency, conflict resolution future.
- **Persistence & Security:** relational integrity, backups, encryption, owner-level authorization.
- **Observability:** error tracking, anonymized/limited performance metrics and cost controls.

Đề xuất **modular monolith ban đầu** thay vì microservices; ranh giới module rõ để về sau tách khi có bằng chứng tải lớn. **Chưa khóa stack cụ thể** khi chưa có review môi trường, kỹ năng và ngân sách; một số lựa chọn tham khảo trong ADR có thể gồm TypeScript full-stack, PostgreSQL, deterministic scheduling library, background job queue, nhưng không phải lệnh triển khai.

## M3. ADR bắt buộc trước development

ADR01 Web framework/hosting/auth.  
ADR02 Relational schema, migrations and backup.  
ADR03 Scheduling algorithm MVP (interval-based heuristic vs CP-SAT later), scalability, deterministic tests.  
ADR04 AI vendor vs local option; privacy, cost budget, failure modes.  
ADR05 External calendar integration and permission scopes.  
ADR06 Offline architecture roadmap, revision/conflict.  
ADR07 Audit/Undo design and retention.  
ADR08 Notification and user-consent design.  
ADR09 Performance/observability and accessibility baseline.  
ADR10 Legal/privacy requirements and any age-related launch restrictions.

## M4. Roadmap sau khi được cấp phép code — không có thời gian bịa đặt

- **G0:** Project setup, architecture ADRs, CI, baseline security/data tests.
- **G1:** Tasks + Calendar Day/Week + time blocks + fixed events + conflict checks + keyboard/mobile basics.
- **G2:** Goals + milestones + linking tasks; execution tracking including manual logs.
- **G3:** Deterministic Recovery proposals + preview/commit/Undo with audit.
- **G4:** AI goal breakdown/drafts + explainability + quota fallback (suggest-only).
- **G5:** Basic habits, summary, onboarding, privacy/export/backup; closed alpha.
- **G6:** Improve usability and errors from real tests; limited beta.
- **G7:** Opt-in auto-action, offline sync, calendar integrations and smarter predictions, each separately gated.
- **G8:** Broader launch, Android and ecosystem integration if data supports investment.

## M5. Release gates

No launch until: security/privacy approved; backups restored in test; no unauthorized writes/hard violations in acceptance suite; data model correct for timezone, repeat, deadlines; mobile and accessibility smoke tests pass; clear model cost cap; incident report/feedback path; owner sign-off for release. Public beta requires stronger monitoring and support than private prototype.

---

# PHẦN N — RỦI RO VÀ ĐÁNH ĐỔI

| Risk | Vì sao nghiêm trọng | Kiểm soát |
|---|---|---|
| AI thay đổi quá mức | Mất niềm tin, người dùng bỏ ứng dụng | suggest-only default, permissions, preview, Undo |
| Scheduler cho kết quả không khả thi | Trễ deadline mà tưởng an toàn | hard constraints, honest infeasible, tests |
| Dữ liệu time log thiếu/không chính xác | Estimation học sai, goal báo ảo | provenance, manual edits, confidence labels |
| Tính năng quá rộng | Không hoàn thành/UX rời rạc | vertical slice, gates, phased scope |
| Offline conflict | Mất thay đổi, trùng event | revision, outbox, field-aware reconciliation |
| Calendar integration stale | Tự đặt đè vào sự kiện mới | freshness checks, no auto-write on stale |
| AI chi phí không kiểm soát | Free-first không bền vững | budget, rate-limit, non-AI core |
| Rủi ro privacy | Lộ thông tin lịch cá nhân | minimization, access control, consent |
| Cạnh tranh | Không có USP thực tế | hands-on benchmark, prototype evidence |
| Người dùng bị quá tải tracking | Bỏ dùng vì phức tạp | progressive disclosure, defaults, optional logs |
| Thiết kế đẹp nhưng không tiếp cận được | Khó sử dụng trên mobile/keyboard | accessibility testing, functional UI |
| Dùng với người chưa thành niên | Yêu cầu privacy/compliance riêng | age-appropriate design, legal review, strict consent |

---

# PHẦN O — BẢNG QUYẾT ĐỊNH PRODUCT OWNER PHÊ DUYỆT

| Decision | Recommendation | Evidence / tradeoff | Status |
|---|---|---|---|
| D01 | Persona đầu: người học cá nhân có lịch bận | Persona gần nhu cầu đã mô tả | PENDING |
| D02 | USP thử nghiệm: Goal-to-Execution-to-Recovery | Chưa đo với users | PENDING |
| D03 | Core app chạy được khi tắt AI | User confirmed | PENDING IMPLEMENTATION POLICY |
| D04 | MVP tập trung Task+Calendar+Lean Goal+Recovery+Habit basic | Có đánh đổi scope | PENDING |
| D05 | Agent default Suggest Only | An toàn, hạn chế auto trước beta | PENDING |
| D06 | Auto permissioned actions sau MVP/opt-in | Cần test niềm tin/solver | PENDING |
| D07 | Protected: fixed/locked, deadline, delete task, high priority | User confirmed core | PENDING POLICY |
| D08 | Hard constraint before soft weights; 3 presets | Giảm UX complexity | PENDING |
| D09 | Task ≠ TimeBlock ≠ WorkSession | Bắt buộc về dữ liệu | PENDING |
| D10 | Habit weekly metric trước, advanced streak later | Giảm complexity | PENDING |
| D11 | Responsive web trước native Android | Chia giai đoạn | PENDING |
| D12 | Reliable online-first trước full offline edit | Đánh đổi mong muốn offline | PENDING |
| D13 | Read-only calendar integration optional, no live external write | Giảm rủi ro privacy/sync | OPEN |
| D14 | Version log + semantic Undo trước Git-like merge advanced | Giảm độ phức tạp | PENDING |
| D15 | AI quotas & core free-first | Cân bằng chi phí và tăng trưởng | PENDING |
| D16 | Accessibility/privacy/backup là launch gates | Chất lượng tối thiểu | PENDING |
| D17 | Chọn stack/provider/hosting bằng ADR trước code | Tránh chọn vội | OPEN |
| D18 | Prototype/user tests phải có evidence, không giả completed | Hạn chế overclaim | PENDING |

**Quy tắc duyệt:** PO có thể chấp thuận toàn bộ, chấp thuận có chỉnh sửa, hoặc yêu cầu sửa các `Dxx`. Không có dòng nào tự động chuyển sang trạng thái APPROVED chỉ vì tài liệu đã được tạo.

---

# PHẦN P — TÓM TẮT SẢN PHẨM CHO NGƯỜI DÙNG CUỐI

**AI Planning Ecosystem** giúp bạn quản lý lịch, công việc, mục tiêu và thói quen trong cùng một nơi. Bạn thêm task nhanh, kéo vào lịch hoặc xem giờ phù hợp; tạo mục tiêu dài hạn, chia thành bước nhỏ bằng AI hoặc tự làm; theo dõi mình thực sự làm được bao nhiêu, không chỉ xem đã xếp bao nhiêu giờ. Khi bắt đầu muộn hoặc cần thêm thời gian, ứng dụng đề xuất các phương án sắp xếp lại, giải thích điều gì bị ảnh hưởng và để bạn quyết định. Mỗi thay đổi quan trọng có lịch sử và khả năng hoàn tác. Bạn vẫn dùng các tính năng chính mà không cần AI. Những chức năng như tự động điều chỉnh hoàn toàn, offline toàn diện và kết nối ứng dụng khác sẽ được bổ sung theo từng phiên bản, không mặc định đã có trong bản đầu.

---

# PHẦN Q — TRẠNG THÁI THỰC TẾ VÀ GIỚI HẠN BẢN ĐẶC TẢ

**Đã hoàn thành bằng văn bản trong hồ sơ này:** product brief, tự phản biện, competitor constraints, scope mapping, personas/JTBD, UX/IA specifications, conceptual data model, scheduling/agent policies, exception catalogue, test catalogue, research plan, roadmap, owner decision matrix.  
**Chưa hoàn thành bằng hoạt động thực chứng:** UI high-fidelity mockup, clickable prototype, hands-on multi-vendor benchmark, interviews/prototype usability tests, architecture ADR stack/provider cost decisions, pháp lý theo thị trường phát hành, load tests, thực hiện test cases.  
**Chưa có phê duyệt:** bất kỳ quyết định Product Owner nào; dự án chưa đi vào coding, chưa deploy và chưa kết nối tài khoản cá nhân.

**Nguyên tắc kết thúc:** Đây là **bản đề xuất chi tiết nhất có thể xây dựng từ dữ liệu khảo sát hiện có và nghiên cứu tài liệu**. Bản này sẵn sàng để Product Owner phản biện/phê duyệt phạm vi và định hướng; không tuyên bố sẵn sàng build production khi prototype và kiểm thử chưa được thực hiện.
