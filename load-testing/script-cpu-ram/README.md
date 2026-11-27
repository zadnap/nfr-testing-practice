# Hướng dẫn cài đặt và chạy thử giám sát CPU/RAM

## 1. Cài công cụ trên Ubuntu

Mở terminal trong máy ảo Ubuntu, dùng **cùng tài khoản chạy Shopizer**:

```bash
sudo apt update
sudo apt install -y sysstat procps
```

Kiểm tra:

```bash
pidstat -V
vmstat -V
```

Bước này chỉ cần làm một lần.

## 2. Đưa script vào Ubuntu

Lấy file `monitor-resources.sh`, đặt trong thư mục home của tài khoản Ubuntu:

```text
~/monitor-resources.sh
```

Kiểm tra:

```bash
ls -l ~/monitor-resources.sh
bash -n ~/monitor-resources.sh
```

Nếu lệnh kiểm tra cú pháp không báo lỗi thì tiếp tục.

## 3. Khởi động Shopizer và tìm PID

Khởi động Shopizer.

- **Nếu khởi động bằng file `.jar`:**

  Mở terminal Ubuntu khác và chạy:

  ```bash
  pgrep -af '[s]hopizer.jar'
  ```

- **Nếu khởi động bằng `spring-boot:run`:**

  Mở terminal Ubuntu khác và chạy:

  ```bash
  sudo ss -lntp 'sport = :8080'
  ```

Ví dụ kết quả:

- Khởi động bằng file JAR:

  ```text
  1234 java -jar shopizer.jar --server.address=0.0.0.0
  ```

- Khởi động bằng `spring-boot:run`:

  ```text
  users:(("java",pid=1234,fd=123))
  ```

PID ví dụ là `1234`. **Các lệnh sau phải thay bằng PID thực tế.**

## 4. Chạy thử giám sát

```bash
run_id="monitor-smoke-$(date -u +%Y%m%dT%H%M%SZ)"
bash ~/monitor-resources.sh 1234 "$run_id"
```

Chờ khoảng **5–10 giây**, nhấn **Ctrl+C tại terminal giám sát**.

Kiểm tra:

```bash
ls -lh "$HOME/perf-results/$run_id"
head -n 8 "$HOME/perf-results/$run_id/java-pidstat.log"
head -n 5 "$HOME/perf-results/$run_id/vm-memory.csv"
tail -n 5 "$HOME/perf-results/$run_id/metadata.txt"
head -n 5 "$HOME/perf-results/$run_id/vm-vmstat.log"
```

Kiểm tra có đủ bốn file kết quả, các file có số liệu, không báo lỗi và Shopizer vẫn hoạt động sau khi dừng giám sát.



**Trước mỗi lần chạy k6:**

1. Trên Ubuntu, thiết lập và kiểm tra điều kiện mạng A hoặc B theo hướng dẫn của Phan Duy Mạnh.
2. Bắt đầu giám sát CPU/RAM và ghi lại `run_id`.
3. Trên máy phát tải, chạy **một kịch bản k6**, lưu kết quả bằng cùng `run_id`.
4. Khi k6 kết thúc, nhấn **Ctrl+C tại terminal giám sát trên Ubuntu**. Giữ Shopizer tiếp tục chạy nếu còn lượt kiểm thử.