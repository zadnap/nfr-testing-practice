# Hướng dẫn `network-condition.sh`

Script này cấu hình điều kiện mạng giả định trên **VM Ubuntu chạy Shopizer**. Nó dùng `tc/netem` để thêm độ trễ 50 ms và giới hạn tổng tốc độ egress của interface ở 10 Mbit/s. Giới hạn này dùng chung cho mọi lưu lượng đi ra interface, không phải riêng cho từng VU. Script không thêm mất gói.

## Yêu cầu

- Chạy lệnh trên VM Ubuntu, không chạy trên máy Windows phát tải.
- Cài `iproute2` (cung cấp lệnh `ip` và `tc`) và có quyền `sudo`.
- Đặt script này trên VM. Nếu repo đã có trên VM, chạy từ thư mục gốc repo; nếu không, chép riêng `network-condition.sh` sang VM.
- Chọn đúng interface egress đi tới máy phát tải k6.

Kiểm tra công cụ:

```bash
ip -Version
tc -Version
```

## Tìm interface và xem cấu hình hiện tại

Trên máy Windows chạy k6, xem địa chỉ IP của máy bằng `ipconfig`. Sau đó trên VM Ubuntu chạy:

```bash
ip route get <IP_MAY_K6>
```

Trong kết quả, lấy tên sau `dev`; ví dụ `ens33`. Tiếp tục xem qdisc hiện tại:

```bash
sudo tc qdisc show dev ens33
```

Thay `ens33` bằng interface thực tế. Script chỉ chấp nhận một số qdisc mặc định quen thuộc và từ chối cấu hình khác để tránh thay thế một qdisc không mong muốn. Nếu bị từ chối, dừng lại và nhờ người quản trị VM xem cấu hình hiện tại; không xóa qdisc lạ để ép chạy.

## Chạy Condition A — LAN

Condition A là trạng thái bình thường, không áp dụng netem. Xác nhận không có qdisc netem do lượt kiểm thử trước để lại:

```bash
sudo bash load-testing/scripts/network-condition.sh check ens33
```

Nếu repo không nằm trên VM, thay đường dẫn bằng nơi đã chép script, ví dụ `~/network-condition.sh`.

Từ máy Windows chạy k6, đặt `BASE_URL` là IP thật của VM rồi chạy ba lượt NFR-01, lưu riêng từng kết quả:

```powershell
$env:BASE_URL = 'http://<IP_VM>:8080'
1..3 | ForEach-Object {
  k6 run --summary-export "load-testing/results/nfr01-lan-run$_.json" `
    load-testing/scripts/nfr01-product-list.js
}
```

## Chạy Condition B — mạng giả định

Trên VM Ubuntu, áp dụng và kiểm tra cấu hình:

```bash
sudo bash load-testing/scripts/network-condition.sh apply ens33
sudo bash load-testing/scripts/network-condition.sh check ens33
```

Xác nhận output có `qdisc netem` cùng delay 50 ms và rate 10 Mbit/s. Sau đó từ Windows chạy ba lượt với tên kết quả riêng:

```powershell
1..3 | ForEach-Object {
  k6 run --summary-export "load-testing/results/nfr01-netem-run$_.json" `
    load-testing/scripts/nfr01-product-list.js
}
```

## Gỡ Condition B

Sau khi hoàn tất các lượt Condition B, gỡ cấu hình trên VM và kiểm tra lại:

```bash
sudo bash load-testing/scripts/network-condition.sh remove ens33
sudo bash load-testing/scripts/network-condition.sh check ens33
```

`remove` xóa root qdisc netem của script để interface trở về qdisc mặc định. Lưu ý: trong khi Condition B đang bật, các kết nối egress khác cùng interface cũng chịu độ trễ và giới hạn tốc độ. Hãy gỡ cấu hình sau khi đo xong.

## Các lệnh của script

```text
sudo bash network-condition.sh apply <interface>   # áp dụng Condition B
sudo bash network-condition.sh check <interface>   # xem qdisc hiện tại
sudo bash network-condition.sh remove <interface>  # gỡ qdisc netem
```

`apply` có thể báo lỗi nếu đã có root qdisc; `check` chỉ hiển thị trạng thái; `remove` không thay đổi gì nếu không tìm thấy qdisc netem có handle mà script sử dụng. Chạy Condition A khi netem chưa được áp dụng hoặc đã được gỡ.
