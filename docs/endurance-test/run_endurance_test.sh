#!/bin/bash
# This script only outputs to stdout/stderr. Logging is handled by the caller.

PID_FILE="endurance_test.pid"

# Write the PID to the PID file. This will be created in the CWD.
echo $$ > "$PID_FILE"

INTERVAL_NS=$((10 * 1000000000)) # 10 seconds in nanoseconds

while true
do
    start_time_ns=$(date +%s%N)

    echo "========================================"
    echo "Test started at: $(date)"
    echo "========================================"
    runn run endr.yml --env-file .env --verbose --scopes read:parent
    RESULT=$?
    if [ $RESULT -ne 0 ]; then
        echo "runn command failed with exit code $RESULT at $(date)"
    fi
    end_time_ns=$(date +%s%N)
    execution_time_ns=$((end_time_ns - start_time_ns))
    execution_time_s=$(echo "scale=9; $execution_time_ns / 1000000000" | bc)
    echo "========================================"
    echo "Test finished at: $(date)"
    echo "Execution time: ${execution_time_s} s"
    
    wait_time_ns=$((INTERVAL_NS - execution_time_ns))

    if [ "$wait_time_ns" -gt 0 ]; then
        wait_time_s=$(echo "scale=9; $wait_time_ns / 1000000000" | bc)
        echo "Wait time: ${wait_time_s} s"
        echo "========================================"
        printf "\n\n"
        sleep "$wait_time_s"
    else
        echo "Wait time: 0 s"
        echo "========================================"
        printf "\n\n"
    fi
done
