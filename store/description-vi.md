# Trang cửa hàng — Tiếng Việt

## Tên (manifest appName, 1.0.1)
Popout Authenticator

## Tóm tắt (manifest appDesc, tối đa 132 ký tự)
Ứng dụng xác thực 2FA cho trình duyệt của bạn. Tạo mã dùng một lần, mở trong cửa sổ bật lên hoặc cửa sổ riêng.

## Mô tả
(Dán dưới dạng văn bản thuần, bỏ dấu **. Tối đa năm tên sản phẩm khác, theo Câu hỏi thường gặp về spam của Chrome Web Store.)

Popout Authenticator hiển thị mã dùng một lần cho xác thực hai yếu tố (2FA) ngay trong trình duyệt của bạn: trong cửa sổ bật lên trên thanh công cụ, trong cửa sổ riêng hoặc trong bảng bên. Tiện ích tạo mã TOTP và HOTP tiêu chuẩn, là mã nguồn mở (MIT), không giới hạn số tài khoản và không cần đăng ký hay máy chủ.

**Chuyển từ ứng dụng xác thực khác**
- Nhập tệp sao lưu của tiện ích Authenticator (authenticator.cc), kể cả bản sao lưu có mật khẩu.
- Tương thích với mã QR xuất từ Google Authenticator™.
- Nhập bản sao lưu dạng văn bản thuần từ các ứng dụng xác thực khác, cùng tệp theo chuẩn Credential Exchange (CXF). Các ứng dụng được hỗ trợ (tiếng Anh): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Bản sao lưu mã hóa của một số ứng dụng không mở được ở đây. Khi đó, hãy xuất bản sao lưu dạng văn bản thuần từ ứng dụng đó trước.

**Mở ở nơi bạn cần**
- Dùng cửa sổ bật lên trên thanh công cụ, cửa sổ riêng hoặc bảng bên (thanh bên trong Firefox).
- Tìm theo trường hoặc nhiều từ, sắp xếp A–Z, nhóm, tài khoản được ghim, biểu tượng và chế độ xem gọn giúp danh sách dài luôn ngăn nắp.
- Xem tài khoản nào thuộc trang web đang mở và điền mã của nó bằng một cú nhấp, nhấp chuột phải hoặc phím tắt.
- Phím tắt toàn cục sao chép mã của ba tài khoản quan trọng đầu tiên, kể cả khi trình duyệt đang chạy nền (Chrome, Edge, Whale).
- Nút tùy chọn cạnh ô nhập mã trên các trang web bạn chọn.
- Chọn nhiều tài khoản để chuyển cùng lúc vào thùng rác, đổi tên hoặc bỏ nhóm cả một nhóm trong một lần, và sao chép tên tài khoản.

**Thêm tài khoản theo cách của bạn**
- Quét mã QR từ thẻ hiện tại, cửa sổ của ứng dụng khác, camera, hình ảnh hoặc bộ nhớ tạm.
- Dán liên kết otpauth:// hoặc tự nhập khóa bí mật.
- Hỗ trợ TOTP và HOTP với SHA-1, SHA-256 hoặc SHA-512 và từ 6 đến 10 chữ số, cùng Steam (5 ký tự) và Battle.net (8 chữ số).

**Riêng tư và được bảo vệ**
- Tài khoản được lưu trên thiết bị của bạn trong kho được mã hóa bằng AES-256-GCM. Hãy đặt mật khẩu để bảo vệ khóa của kho: nếu không có mật khẩu, khóa được lưu trên thiết bị cạnh dữ liệu.
- Khóa bằng mật khẩu (Argon2id), mã khôi phục và tùy chọn mở khóa bằng khóa truy cập (không có trong Firefox). Chọn thời điểm tự động khóa.
- Có thể yêu cầu xác minh thiết bị trước khi dùng mã (không có trong Firefox), và ẩn mã bằng phím tắt do bạn đặt.
- Mã đã sao chép có thể được xóa khỏi bộ nhớ tạm sau 30 giây, 1, 2 hoặc 5 phút (không có trong Safari).
- Không phân tích, không quảng cáo, không có máy chủ của nhà phát triển. Mã nguồn được công khai.

**Không mất quyền truy cập**
- Bản sao lưu mã hóa, cùng khả năng xuất ra văn bản otpauth, CXF và mã QR.
- Đồng bộ giữa các thiết bị qua tính năng đồng bộ của chính trình duyệt (Chrome, Edge, Firefox), được mã hóa khi bật khóa bằng mật khẩu.
- Ảnh chụp khôi phục, thùng rác 30 ngày và lịch sử thay đổi của từng tài khoản.
- Kiểm tra đồng hồ cảnh báo khi giờ trên máy tính sẽ khiến mã không dùng được.

**Chia sẻ mã, không chia sẻ khóa bí mật**
- Gửi liên kết chỉ hiển thị mã trong 5 đến 60 phút tới, có thể kèm mật khẩu. Liên kết không bao giờ chứa khóa bí mật.

**Điều nên biết**
- Nhà phát triển không vận hành dịch vụ sao lưu đám mây. Bản sao lưu là tệp do bạn tự giữ; đồng bộ đi qua trình duyệt.
- Mở khóa bằng khóa truy cập và xác minh thiết bị không có trong Firefox. Phiên bản Safari chỉ dành cho macOS.

Có 20 ngôn ngữ. Hỗ trợ chính sách được quản lý cho tổ chức.

Popout Authenticator do một nhà phát triển độc lập làm ra. Tiện ích dựa trên mã nguồn và bản dịch theo giấy phép MIT của tiện ích Authenticator (authenticator.cc) và không liên kết với các tác giả của tiện ích đó.

Google Authenticator là nhãn hiệu của Google LLC.

Chính sách quyền riêng tư: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Mã nguồn: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `bảng bên (thanh bên trong Firefox)` → `bảng bên`
- `tùy chọn mở khóa bằng khóa truy cập (không có trong Firefox)` → `tùy chọn mở khóa bằng khóa truy cập`
- `trước khi dùng mã (không có trong Firefox)` → `trước khi dùng mã`
- `qua tính năng đồng bộ của chính trình duyệt (Chrome, Edge, Firefox)` → `qua tính năng đồng bộ của Microsoft Edge`
- `đang chạy nền (Chrome, Edge, Whale).` → `đang chạy nền.`
- `5 phút (không có trong Safari).` → `5 phút.`
- 이 줄을 뺀다: `- Mở khóa bằng khóa truy cập và xác minh thiết bị không có trong Firefox. Phiên bản Safari chỉ dành cho macOS.`
