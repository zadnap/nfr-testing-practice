# Hướng dẫn thiết lập môi trường kiểm thử tải Shopizer

## 1. Chuẩn bị môi trường

### 1.1. Clone repository

```bash
git clone https://github.com/zadnap/nfr-testing-practice.git
cd nfr-testing-practice
```

### 1.2. Cài đặt Java

Dùng JDK 17 cho quy trình kiểm thử này.

Kiểm tra phiên bản Java:

```bash
java -version
```

Đảm bảo sử dụng Java 17.

Nếu chưa cài đặt, có thể tải JDK 17 từ:

- Eclipse Temurin: https://adoptium.net/
- Oracle JDK: https://www.oracle.com/java/technologies/downloads/

### 1.3. Kiểm tra Maven

Trên Windows, dùng Apache Maven 3.9.x để tránh lỗi `MavenWrapperMain` của Wrapper cũ khi đường dẫn dự án có dấu cách. Kiểm tra `mvn -v` để xác nhận Maven đang dùng JDK 17.

Trên macOS/Linux, nếu gặp lỗi permission:

```bash
chmod +x mvnw
```

Kiểm tra Maven Wrapper:

```bash
./mvnw -version
```

Trên Windows:

```powershell
mvn -v
```

## 2. Cấu hình H2 Database

### 2.1. Tạo file database.properties

Truy cập thư mục:

```text
sm-shop/src/main/resources/
```

Tạo file có tên:

```text
database.properties
```

### 2.2. Nội dung cấu hình

Thêm nội dung sau vào file `database.properties`:

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

### 2.3. Build dự án

Sau khi tạo cấu hình H2, chạy từ thư mục gốc.

```bash
./mvnw clean install -DskipTests
```

Trên Windows với Maven 3.9.x.

```powershell
mvn clean install '-DskipTests'
```

## 3. Cài đặt k6

### 3.1. macOS

```bash
brew install k6
```

### 3.2. Windows

Có thể cài đặt bằng Winget:

```powershell
winget install k6 --source winget
```

Hoặc sử dụng Chocolatey:

```powershell
choco install k6
```

Sau khi cài đặt, mở terminal mới và kiểm tra:

```bash
k6 version
```

## 4. Khởi chạy Shopizer và kiểm tra dữ liệu

File H2 `sm-shop/SALESMANAGER.h2.db` trong repository đã có 20 sản phẩm `Seed Chair`. Từ thư mục gốc trên PowerShell, sao chép JAR đã build ở bước 2.3 và file H2 vào thư mục tạm rồi khởi động Shopizer.

```powershell
$shopizerRun = Join-Path $env:TEMP ('shopizer-demo-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $shopizerRun | Out-Null
Copy-Item -LiteralPath './sm-shop/target/shopizer.jar','./sm-shop/SALESMANAGER.h2.db' -Destination $shopizerRun
Set-Location $shopizerRun
java -jar shopizer.jar --server.address=127.0.0.1
```

Mở terminal thứ hai trong thư mục gốc để kiểm tra ba API.

```powershell
$catalog = 'http://localhost:8080/api/v1/products?store=DEFAULT&lang=en&page=0&count=20'
(Invoke-RestMethod $catalog).products.Count
$search = Invoke-RestMethod "$catalog&name=Seed%20Chair"
$sku = $search.products[0].sku
(Invoke-RestMethod "http://localhost:8080/api/v2/product/${sku}?store=DEFAULT&lang=en").sku
```

Danh sách cần trả về 20 sản phẩm. Tìm kiếm cần trả về ít nhất một sản phẩm phù hợp và SKU ở API chi tiết phải bằng `$sku`. Với một cơ sở dữ liệu H2 mới, dữ liệu nguồn nằm trong `load-testing/data/products.json`. Có thể nạp bằng `bash ./load-testing/scripts/seed-products.sh` trong Git Bash với `jq`, `curl` và biến `SHOPIZER_TOKEN` chứa token quản trị của môi trường thử nghiệm.

## 5. Chạy k6 và lưu kết quả

### 5.1. Cấu hình biến môi trường

Script mặc định dùng `http://localhost:8080`, cửa hàng `DEFAULT`, ngôn ngữ `en`, 20 sản phẩm mỗi trang và từ khóa `Seed Chair`. Có thể đổi qua `BASE_URL`, `STORE`, `SHOPIZER_LANG`, `PAGE_SIZE` và `SEARCH_KEYWORDS`.

### 5.2. Chạy các kịch bản kiểm thử

Chạy nhanh với 1 người dùng ảo trong 5 giây để kiểm tra kết nối và phản hồi.

```powershell
$env:BASE_URL = 'http://127.0.0.1:8080'
k6 run --vus 1 --duration 5s ./load-testing/scripts/nfr01-product-list.js
k6 run --vus 1 --duration 5s ./load-testing/scripts/nfr02-product-flow.js
```

Chạy chính thức từng lệnh theo thứ tự. Mỗi kịch bản mặc định dùng 20 người dùng ảo trong 3 phút. Hai file JSON được ghi vào thư mục hiện tại.

```powershell
k6 run --summary-export nfr01-summary.json ./load-testing/scripts/nfr01-product-list.js
k6 run --summary-export nfr02-summary.json ./load-testing/scripts/nfr02-product-flow.js
```

| Chỉ số k6 | Tiêu chí đạt |
| --- | --- |
| `nfr01_request_under_200ms` | Ít nhất 95% tổng số request nhận được phản hồi trong dưới 200 ms |
| `nfr01_request_failed` | Dưới 1% tổng số request bị lỗi HTTP hoặc sai nội dung |
| `nfr02_flow_under_1500ms` | Ít nhất 95% lượt thành công dưới 1.500 ms |
| `nfr02_flow_failed` | Dưới 1% lượt có ít nhất một bước lỗi |

Xem thêm `http_req_duration` và `nfr02_flow_duration` để lấy p95. k6 trả mã thoát 99 nếu có tiêu chí tải không đạt. Kết quả dùng trong Chương 5 nằm trong [thư mục results](results/). Dừng Shopizer bằng Ctrl+C ở terminal chạy Java.
