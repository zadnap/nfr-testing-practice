#!/usr/bin/env bash
# Cách chạy: bash monitor-resources.sh JAVA_PID RUN_ID

set -Eeuo pipefail
export LC_ALL=C TZ=UTC S_COLORS=never S_TIME_FORMAT=ISO

# Kiểm tra tham số
if (( $# != 2 )); then
    echo "Usage: bash monitor-resources.sh JAVA_PID RUN_ID" >&2
    exit 2
fi

java_pid=$1
run_id=$2

if [[ ! "$java_pid" =~ ^[1-9][0-9]*$ ]] ||
   [[ ! "$run_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "ERROR: Invalid PID or RUN_ID." >&2
    exit 2
fi

# Kiểm tra công cụ
for tool in pidstat vmstat awk date ps readlink; do
    command -v "$tool" >/dev/null || {
        echo "ERROR: Missing tool: $tool" >&2
        exit 2
    }
done

# Kiểm tra tiến trình Java
if ! kill -0 "$java_pid" 2>/dev/null; then
    echo "ERROR: PID is not running or accessible." >&2
    exit 2
fi

java_exe=$(readlink "/proc/$java_pid/exe")

if [[ "${java_exe##*/}" != java ]]; then
    echo "ERROR: Selected PID is not Java." >&2
    exit 2
fi

if [[ "$(ps -o euid= -p "$java_pid" | awk '{print $1}')" != "$EUID" ]]; then
    echo "ERROR: Use the same Linux account that runs Shopizer." >&2
    exit 2
fi

# Nhận diện tiến trình để phát hiện PID bị sử dụng lại
process_start() {
    local line
    line=$(cat "/proc/$java_pid/stat") || return 1
    line=${line##*) }
    awk '{print $20}' <<< "$line"
}

initial_start=$(process_start)

# Tạo thư mục kết quả, không ghi đè lần chạy cũ
mkdir -p "$HOME/perf-results"
out="$HOME/perf-results/$run_id"

mkdir "$out" || {
    echo "ERROR: Output exists or cannot be created. Choose a new RUN_ID." >&2
    exit 2
}

children=()
stop_reason=unexpected_exit

# Chỉ dừng công cụ giám sát, không dừng Java
cleanup() {
    local code=$?
    trap - EXIT INT TERM

    for child in "${children[@]}"; do
        kill -TERM "$child" 2>/dev/null || true
    done

    for child in "${children[@]}"; do
        wait "$child" 2>/dev/null || true
    done

    {
        echo "monitor_end_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "stop_reason=$stop_reason"
        echo "monitor_exit_code=$code"
    } >> "$out/metadata.txt"

    echo "Monitoring stopped. Shopizer was not stopped."
    echo "Results: $out"

    exit "$code"
}

trap cleanup EXIT
trap 'stop_reason=operator_ctrl_c; exit 0' INT
trap 'stop_reason=termination_signal; exit 143' TERM

# Thông tin lần thu thập
{
    echo "run_id=$run_id"
    echo "java_pid=$java_pid"
    echo "monitor_start_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "sampling_interval_seconds=1"
    echo "timezone=UTC"
    echo "java_cpu_scale=percent_of_all_vm_cpus_pidstat_I"
    echo "memory_units=KiB"
} > "$out/metadata.txt"

# CPU/RAM tiến trình Java
pidstat -I -u -r -h -H -p "$java_pid" 1 \
    > "$out/java-pidstat.log" 2>&1 &
children+=("$!")

# CPU, swap và I/O toàn máy ảo
vmstat -w -y -t 1 > "$out/vm-vmstat.log" 2>&1 &
children+=("$!")

# RAM toàn máy ảo
echo "timestamp_utc,mem_total_kib,mem_available_kib,mem_used_est_pct" \
    > "$out/vm-memory.csv"

echo "Monitoring Java PID: $java_pid"
echo "Results: $out"
echo "Press Ctrl+C here after k6 finishes."

while true; do
    # Dừng nếu Java kết thúc hoặc PID đã đổi tiến trình
    if ! current_start=$(process_start 2>/dev/null) ||
       [[ "$current_start" != "$initial_start" ]]; then
        stop_reason=java_exited_or_pid_changed
        exit 1
    fi

    if [[ "$(ps -o stat= -p "$java_pid")" == Z* ]]; then
        stop_reason=java_exited_or_pid_changed
        exit 1
    fi

    # Phát hiện công cụ thu thập bị dừng
    for child in "${children[@]}"; do
        if ! kill -0 "$child" 2>/dev/null; then
            stop_reason=collector_failed
            exit 1
        fi
    done

    # Lưu RAM mỗi giây
    awk -v timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
        $1 == "MemTotal:" {
            total = $2
        }
        $1 == "MemAvailable:" {
            available = $2
            found = 1
        }
        END {
            if (total <= 0 || !found) exit 1
            printf "%s,%.0f,%.0f,%.3f\n",
                timestamp, total, available,
                100 * (total - available) / total
        }
    ' /proc/meminfo >> "$out/vm-memory.csv"

    sleep 1
done