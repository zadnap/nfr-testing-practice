# Hướng dẫn thiết lập môi trường kiểm thử tải Shopizer

## 1. Chuẩn bị môi trường

### 1.1. Clone repository

```bash
git clone https://github.com/zadnap/nfr-testing-practice.git
cd nfr-testing-practice
```

### 1.2. Cài đặt Java

Shopizer 3.2.5 sử dụng Java 17.

Kiểm tra phiên bản Java:

```bash
java -version
```

Đảm bảo sử dụng Java 17.

Nếu chưa cài đặt, có thể tải JDK 17 từ:

- Eclipse Temurin: https://adoptium.net/
- Oracle JDK: https://www.oracle.com/java/technologies/downloads/

### 1.3. Kiểm tra Maven Wrapper

Repository đã có Maven Wrapper (`mvnw`), do đó không cần cài Maven riêng.

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
.\mvnw.cmd -version
```

### 1.4. Build dự án

```bash
./mvnw clean install -DskipTests
```

Trên Windows:

```powershell
.\mvnw.cmd clean install -DskipTests
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

## 3. Khởi chạy Shopizer

### 3.1. Chạy ứng dụng

Di chuyển vào thư mục `sm-shop`:

```bash
cd sm-shop
```

Khởi chạy Spring Boot:

```bash
../mvnw spring-boot:run
```

Trên Windows:

```powershell
..\mvnw.cmd spring-boot:run
```

### 3.2. Kiểm tra ứng dụng

```bash
curl -I http://localhost:8080
```

## 4. Cài đặt k6

### 4.1. macOS

```bash
brew install k6
```

### 4.2. Windows

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

## 7. Chạy kịch bản kiểm thử tải

### 7.1. Cấu hình biến môi trường

macOS/Linux:

```bash
export BASE_URL="http://localhost:8080"
export STORE="DEFAULT"
export LANG="en"
export PAGE_SIZE=20
```

Windows PowerShell:

```powershell
$env:BASE_URL="http://localhost:8080"
$env:STORE="DEFAULT"
$env:LANG="en"
$env:PAGE_SIZE="20"
```

### 7.2. Chạy các kịch bản kiểm thử

```bash
k6 run <./load-testing/scripts/nfr01-product-list.js>
```

```bash
k6 run <./load-testing/scripts/nfr02-product-list.js>
```
