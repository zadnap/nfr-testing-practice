#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: sudo $0 {apply|check|remove} <egress-interface>" >&2
  echo "Condition B: 50 ms egress delay and 10 Mbit/s shared egress rate." >&2
}

if [[ $# -ne 2 ]]; then usage; exit 2; fi
action=$1
iface=$2
if ! ip link show dev "$iface" >/dev/null 2>&1; then
  echo "Unknown network interface: $iface" >&2
  exit 2
fi

case "$action" in
  apply)
    current=$(tc qdisc show dev "$iface")
    if ! grep -q 'qdisc noqueue' <<<"$current" && ! grep -q 'qdisc pfifo_fast' <<<"$current" && ! grep -q 'qdisc fq_codel' <<<"$current"; then
      echo "Refusing to replace an existing root qdisc on $iface:" >&2
      echo "$current" >&2
      exit 1
    fi
    tc qdisc add dev "$iface" root handle 1: netem delay 50ms rate 10mbit
    echo "Applied Condition B to egress on $iface."
    ;;
  check)
    tc qdisc show dev "$iface"
    ;;
  remove)
    current=$(tc qdisc show dev "$iface")
    if grep -q 'qdisc netem 1:' <<<"$current"; then
      tc qdisc del dev "$iface" root
      echo "Removed Condition B root qdisc from $iface."
    else
      echo "No Condition B qdisc found on $iface; nothing changed."
    fi
    ;;
  *) usage; exit 2 ;;
esac
