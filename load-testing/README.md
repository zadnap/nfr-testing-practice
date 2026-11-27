# Hướng dẫn thiết lập môi trường kiểm thử tải Shopizer

## 1. Cấu hình máy ảo Ubuntu

### 1.1. Cấu hình phần cứng

Sử dụng máy ảo Ubuntu Server làm máy chủ triển khai Shopizer.

Cấu hình đề xuất:

| Thành phần   | Cấu hình       |
| ------------ | -------------- |
| Hệ điều hành | Ubuntu Server  |
| CPU          | 4 cores        |
| RAM          | 8 GB           |
| Disk         | 40 GB          |
| Java         | JDK 17         |
| Database     | H2             |
| Application  | Shopizer 3.2.5 |

Đây là cấu hình dành cho máy chủ kiểm thử. Không cần cài giao diện đồ họa vì các thao tác quản trị có thể thực hiện qua Terminal hoặc SSH.

### 1.2. Cài đặt Ubuntu Server

1. Tải file ISO Ubuntu Server phù hợp với kiến trúc CPU của máy chủ.
2. Mở phần mềm ảo hóa và tạo máy ảo mới.
3. Chọn file ISO Ubuntu Server để cài đặt.
4. Cấu hình CPU, RAM và dung lượng ổ đĩa theo mục 2.1.
5. Tiến hành cài đặt Ubuntu, tạo tài khoản và mật khẩu quản trị.
6. Bật tùy chọn cài đặt OpenSSH Server nếu trình cài đặt hỗ trợ.
7. Sau khi cài đặt hoàn tất, tháo file ISO khỏi ổ đĩa ảo và khởi động lại máy ảo.

Sau khi đăng nhập, cập nhật hệ thống:

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.3. Cài đặt SSH

Nếu OpenSSH Server chưa được cài đặt:

```bash
sudo apt install openssh-server -y
sudo systemctl enable --now ssh
```

Kiểm tra trạng thái:

```bash
sudo systemctl status ssh
```

### 1.4. Cấu hình mạng và xác định IP máy ảo

Để các máy tính khác trong cùng mạng LAN truy cập được Shopizer, máy ảo cần sử dụng chế độ mạng cho phép các thiết bị trong LAN kết nối trực tiếp, chẳng hạn Bridged Adapter nếu phần mềm ảo hóa và mạng hiện tại hỗ trợ.

Kiểm tra địa chỉ IP:

```bash
hostname -I
```

Hoặc:

```bash
ip -br addr
```

Ví dụ kết quả:

```text
192.168.1.100
```

Trong đó, `192.168.1.100` là địa chỉ IP ví dụ. Khi triển khai thực tế, sử dụng địa chỉ IP được cấp cho máy ảo.

Ghi lại địa chỉ IP này để sử dụng trong các bước kiểm tra API và chạy k6.

### 1.5. Kết nối SSH từ Windows

Trên máy Windows, mở PowerShell:

```powershell
ssh <username>@<VM_IP>
```

Ví dụ:

```powershell
ssh ubuntu@192.168.1.100
```

Nhập mật khẩu Ubuntu khi được yêu cầu.

Sau khi kết nối thành công, có thể quản trị máy ảo trực tiếp từ Windows mà không cần thao tác trên cửa sổ máy ảo.

## 2. Chuẩn bị môi trường

### 2.1. Clone repository

Trên máy ảo Ubuntu, mở Terminal và thực hiện:

```bash
git clone https://github.com/zadnap/nfr-testing-practice.git
cd nfr-testing-practice
```

### 2.2. Cài đặt Java

Shopizer 3.2.5 sử dụng Java 17.

Trên Ubuntu:

```bash
sudo apt update
sudo apt install openjdk-17-jdk -y
```

Kiểm tra phiên bản Java:

```bash
java -version
```

Đảm bảo sử dụng Java 17.

Nếu chưa cài đặt, có thể tải JDK 17 từ:

- Eclipse Temurin: https://adoptium.net/
- Oracle JDK: https://www.oracle.com/java/technologies/downloads/

### 2.3. Kiểm tra Maven Wrapper

Repository đã có Maven Wrapper (`mvnw`), do đó không cần cài Maven riêng.

Trên macOS/Linux, nếu gặp lỗi permission:

```bash
chmod +x mvnw
./mvnw -version
```

Trên Windows:

```powershell
.\mvnw.cmd -version
```

### 2.4. Build dự án

```bash
./mvnw clean install -DskipTests
```

Trên Windows:

```powershell
.\mvnw.cmd clean install -DskipTests
```

Quá trình build sẽ tải các dependencies cần thiết và biên dịch dự án.

## 3. Cấu hình H2 Database

### 3.1. Tạo file database.properties

Truy cập thư mục:

```text
sm-shop/src/main/resources/
```

Tạo file có tên:

```text
database.properties
```

### 3.2. Nội dung cấu hình

Thêm nội dung sau vào file `database.properties`:

```properties
# H2 Database
db.jdbcUrl=jdbc\:h2\:file\:./SALESMANAGER;AUTOCOMMIT\=OFF;INIT\=CREATE SCHEMA IF NOT EXISTS SALESMANAGER
db.user=test
db.password=password
db.driverClass=org.h2.Driver
hibernate.dialect=org.hibernate.dialect.H2Dialect

db.preferredTestQuery=SELECT 1
db.schema=SALESMANAGER
hibernate.hbm2ddl.auto=update

db.show.sql=false

# Connection pool
db.initialPoolSize=4
db.minPoolSize=4
db.maxPoolSize=4
```

## 4. Khởi chạy Shopizer

### 4.1. Cấu hình địa chỉ lắng nghe

Mặc định, ứng dụng Spring Boot có thể chỉ lắng nghe trên giao diện localhost. Để các máy khác trong mạng LAN truy cập API, cần cho phép ứng dụng lắng nghe trên các giao diện mạng.

Trong cấu hình Spring Boot phù hợp của module `sm-shop`, bổ sung:

```properties
server.address=0.0.0.0
```

Nếu dự án đã có cấu hình `server.address`, cần kiểm tra và điều chỉnh thay vì tạo cấu hình trùng lặp.

### 4.2. Chạy ứng dụng

Trên Ubuntu, di chuyển vào thư mục `sm-shop`:

```bash
cd sm-shop
```

Khởi chạy Spring Boot:

```bash
../mvnw spring-boot:run
```

Trên Windows nếu chạy ứng dụng trực tiếp trên Windows:

```powershell
cd sm-shop
..\mvnw.cmd spring-boot:run
```

Trong mô hình triển khai dùng máy ảo, ứng dụng được khởi chạy trên Ubuntu.

Giữ Terminal đang chạy ứng dụng để theo dõi log.

### 4.3. Kiểm tra ứng dụng trên máy chủ

Trên Ubuntu:

```bash
curl -I http://localhost:8080
```

Nếu ứng dụng hoạt động, server sẽ trả về phản hồi HTTP.

Có thể kiểm tra cổng đang lắng nghe:

```bash
sudo ss -lntp | grep 8080
```

Cần đảm bảo ứng dụng đang lắng nghe trên `0.0.0.0:8080` hoặc địa chỉ mạng phù hợp, thay vì chỉ `127.0.0.1:8080`.

## 5. Cho phép truy cập API từ máy khác

### 5.1. Cấu hình Firewall trên Ubuntu

Nếu Ubuntu đang sử dụng UFW, cho phép các máy trong mạng LAN truy cập cổng 8080.

Ví dụ, nếu mạng LAN sử dụng dải địa chỉ `192.168.1.0/24`:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp
```

Nếu cần kết nối SSH từ mạng LAN:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
```

Kiểm tra:

```bash
sudo ufw status
```

Không nên mở các cổng không cần thiết ra mạng LAN hoặc Internet.

### 5.2. Kiểm tra API từ Windows

Trên máy Windows cùng mạng LAN, mở PowerShell:

```powershell
curl.exe -I http://<VM_IP>:8080
```

Ví dụ:

```powershell
curl.exe -I http://192.168.1.100:8080
```

Hoặc mở trình duyệt và truy cập:

```text
http://<VM_IP>:8080
```

Nếu nhận được phản hồi HTTP từ ứng dụng, kết nối giữa máy Windows và Shopizer đã được thiết lập.

Tiếp theo, sử dụng Postman hoặc API Client để gửi request đến các endpoint hợp lệ của Shopizer.

**Lưu ý:** Phản hồi HTTP 401, 403 hoặc 404 vẫn có thể chứng minh kết nối mạng và ứng dụng đã phản hồi. Cần sử dụng endpoint phù hợp để kiểm tra chức năng API.

## 6. Cài đặt k6

k6 được cài đặt trên máy tính thực hiện kiểm thử, không bắt buộc phải cài trên máy ảo Ubuntu.

### 6.1. macOS

```bash
brew install k6
```

### 6.2. Windows

Có thể cài đặt bằng Winget:

```powershell
winget install k6 --source winget
```

Hoặc sử dụng Chocolatey:

```powershell
choco install k6
```

Sau khi cài đặt, mở Terminal mới và kiểm tra:

```powershell
k6 version
```

## 7. Chạy kịch bản kiểm thử tải

### 7.1. Cấu hình biến môi trường

Đối với máy tính chạy k6, cần cấu hình địa chỉ IP của máy ảo Ubuntu thay vì sử dụng `localhost`.

macOS/Linux:

```bash
export BASE_URL="http://<VM_IP>:8080"
export STORE="DEFAULT"
export LANG="en"
export PAGE_SIZE=20
```

Windows PowerShell:

```powershell
$env:BASE_URL="http://<VM_IP>:8080"
$env:STORE="DEFAULT"
$env:LANG="en"
$env:PAGE_SIZE="20"
```

Ví dụ:

```powershell
$env:BASE_URL="http://192.168.1.100:8080"
```

### 7.2. Chạy các kịch bản kiểm thử

Tại thư mục gốc repository:

```bash
k6 run ./load-testing/scripts/nfr01-product-list.js
```

```bash
k6 run ./load-testing/scripts/nfr02-product-flow.js
```

Trên Windows PowerShell có thể sử dụng cùng cú pháp:

```powershell
k6 run .\load-testing\scripts\nfr01-product-list.js
```

```powershell
k6 run .\load-testing\scripts\nfr02-product-flow.js
```

Đảm bảo các biến môi trường đã được thiết lập trước khi chạy kịch bản.

## 8. Quy trình khởi động và kiểm tra môi trường

### 8.1. Khởi động môi trường

Thực hiện theo thứ tự:

1. Khởi động máy ảo Ubuntu.
2. Đăng nhập Ubuntu hoặc kết nối qua SSH.
3. Kiểm tra địa chỉ IP của máy ảo.
4. Kiểm tra Java 17.
5. Di chuyển vào thư mục `sm-shop`.
6. Khởi động Shopizer.

Các lệnh kiểm tra:

```bash
hostname -I
java -version
```

Khởi chạy ứng dụng:

```bash
cd ~/nfr-testing-practice/sm-shop
../mvnw spring-boot:run
```

Giữ Terminal đang chạy để theo dõi log.

### 8.2. Kiểm tra môi trường

| Thành phần | Cách kiểm tra                 | Kết quả mong đợi              |
| ---------- | ----------------------------- | ----------------------------- |
| Ubuntu     | `uname -a`                    | Hệ thống hoạt động            |
| Java       | `java -version`               | Java 17                       |
| Shopizer   | Kiểm tra log khởi động        | Ứng dụng khởi động thành công |
| H2         | Kiểm tra log và file database | Kết nối database thành công   |
| Network    | `hostname -I`                 | Có IP mạng LAN                |
| API        | Gửi request từ máy khác       | Nhận phản hồi HTTP            |
| Dataset    | Truy vấn API                  | Dữ liệu được nạp đầy đủ       |
| k6         | `k6 version`                  | k6 hoạt động                  |

### 8.3. Dừng môi trường

Để dừng Shopizer:

1. Quay lại Terminal đang chạy ứng dụng.
2. Nhấn `Ctrl + C`.
3. Chờ ứng dụng kết thúc và giải phóng tài nguyên.

Kiểm tra cổng 8080:

```bash
sudo ss -lntp | grep 8080
```

Nếu không còn tiến trình lắng nghe trên cổng ứng dụng, Shopizer đã dừng.

Sau đó, tắt Ubuntu:

```bash
sudo shutdown -h now
```

Không nên tắt cưỡng bức máy ảo khi ứng dụng hoặc database đang hoạt động.
