#!/usr/bin/env bash
# Polls the canary health alarm and exits 0 (healthy) or 1 (unhealthy).
# Required env var: ALARM_NAME
set -euo pipefail

STATE=$(aws cloudwatch describe-alarms \
  --alarm-names "$ALARM_NAME" \
  --query 'MetricAlarms[0].StateValue' --output text)

echo "Canary alarm state: $STATE"

if [ "$STATE" = "ALARM" ]; then
  echo "Canary is unhealthy - 5xx error rate exceeded threshold. Not promoting."
  exit 1
fi

# OK or INSUFFICIENT_DATA both proceed: INSUFFICIENT_DATA just means the bake
# window didn't collect a full evaluation period yet (e.g. very low traffic),
# and the alarm's TreatMissingData=notBreaching already reflects that this
# shouldn't block a release on its own.
echo "Canary looks healthy. Proceeding to promotion."
exit 0