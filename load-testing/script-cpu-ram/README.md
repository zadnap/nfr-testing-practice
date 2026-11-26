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

Khởi động Shopizer, sau đó mở terminal Ubuntu khác và chạy:

```bash
pgrep -af '[s]hopizer.jar'
```

Ví dụ kết quả:

```text
1234 java -jar shopizer.jar --server.address=0.0.0.0
```

PID ví dụ là `1234`. **Các lệnh sau phải thay bằng PID thực tế.**

## 4. Chạy thử giám sát

Chạy lần lượt trong cùng một terminal Ubuntu:

```bash
run_id="monitor-smoke-$(date -u +%Y%m%dT%H%M%SZ)"

bash ~/monitor-resources.sh 1234 "$run_id"
```

Chờ khoảng **5–10 giây**, nhấn **Ctrl+C tại terminal giám sát**.

Kiểm tra:

```bash
ls -lh "$HOME/perf-results/$run_id"

head -n 8 "$HOME/perf-results/$run_id/java-pidstat.log"

head -n 5 "$HOME/perf-results/$run_id/vm-vmstat.log"

head -n 5 "$HOME/perf-results/$run_id/vm-memory.csv"

tail -n 5 "$HOME/perf-results/$run_id/metadata.txt"
```

Xác nhận:

- Có đủ bốn file kết quả.
- Các file có số liệu, không báo lỗi.
- Shopizer vẫn hoạt động sau khi dừng giám sát.