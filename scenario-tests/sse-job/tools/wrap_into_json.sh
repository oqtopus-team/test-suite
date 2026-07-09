#
##!/usr/bin/env bash
#
#python_file="$1"
#
#`jq -Rs '{sse_program: .}' "$python_file"` | tee "$pyhton_file"
#
#zip aaa.zip $json


#!/usr/bin/env bash
set -euo pipefail

input="$1"

# 拡張子を除いたベース名取得
base="${input%.*}"

json_file="${base}.json"
zip_file="${base}.zip"

# JSON生成
jq -Rs '{sse_program: .}' "$input" | tee "$json_file"

# zip化
zip -q -j "$zip_file" "$json_file"

echo "Created: $json_file"
echo "Created: $zip_file"


