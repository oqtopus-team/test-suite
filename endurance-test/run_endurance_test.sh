#!/bin/bash
# This script only outputs to stdout/stderr. Logging is handled by the caller.

PID_FILE="endurance_test.pid"

# Write the PID to the PID file. This will be created in the CWD.
echo $$ > "$PID_FILE"

while true
do
    start_time=$(date +%s%N)
    echo "========================================"
    echo "Test started at: $(date)"
    echo "========================================"
    runn run endr.yml --env-file .env --verbose --scopes read:parent
    RESULT=$?
    if [ $RESULT -ne 0 ]; then
        echo "runn command failed with exit code $RESULT at $(date)"
    fi
    end_time=$(date +%s%N)
    echo "========================================"
    echo "Test finished at: $(date)"
    echo "Execution time: $((($end_time - $start_time) / 1000000)) ms"
    echo "========================================"
    printf "\n\n"
done
