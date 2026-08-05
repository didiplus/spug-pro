#!/bin/bash
# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Released under the AGPL-3.0 License.
# Unified start/stop/restart script for all Spug services

SCRIPT_DIR=$(cd $(dirname $0); pwd)
PROJECT_DIR=$(dirname $SCRIPT_DIR)
LOG_DIR="$PROJECT_DIR/logs"
PID_DIR="$PROJECT_DIR/pids"

# Create directories if not exist
mkdir -p $LOG_DIR
mkdir -p $PID_DIR

# Activate virtual environment
if [ -f $PROJECT_DIR/venv/bin/activate ]; then
  source $PROJECT_DIR/venv/bin/activate
elif [ -f $PROJECT_DIR/.venv/bin/activate ]; then
  source $PROJECT_DIR/.venv/bin/activate
fi

# Determine python command
if command -v python3 &> /dev/null; then
  PYTHON=python3
else
  PYTHON=python
fi

# Service definitions
declare -A SERVICES
SERVICES=(
#   ["api"]="bash $SCRIPT_DIR/start-api.sh"
  ["ws"]="bash $SCRIPT_DIR/start-ws.sh"
  ["worker"]="$PYTHON $PROJECT_DIR/manage.py runworker"
  ["monitor"]="$PYTHON $PROJECT_DIR/manage.py runmonitor"
  ["scheduler"]="$PYTHON $PROJECT_DIR/manage.py runscheduler"
)

# Function to start a service
start_service() {
  local name=$1
  local cmd=$2
  local pid_file="$PID_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"

  if [ -f "$pid_file" ] && kill -0 $(cat "$pid_file") 2>/dev/null; then
    echo "[$name] is already running (PID: $(cat $pid_file))"
    return
  fi

  echo "Starting [$name]..."
  nohup $cmd > "$log_file" 2>&1 &
  echo $! > "$pid_file"
  echo "[$name] started (PID: $!)"
}

# Function to stop a service
stop_service() {
  local name=$1
  local pid_file="$PID_DIR/$name.pid"

  if [ ! -f "$pid_file" ]; then
    echo "[$name] PID file not found. Maybe not running?"
    return
  fi

  local pid=$(cat "$pid_file")
  if kill -0 $pid 2>/dev/null; then
    echo "Stopping [$name] (PID: $pid)..."
    kill $pid
    # Wait for process to terminate
    for i in {1..10}; do
      if ! kill -0 $pid 2>/dev/null; then
        break
      fi
      sleep 1
    done
    # Force kill if still running
    if kill -0 $pid 2>/dev/null; then
      echo "Force killing [$name]..."
      kill -9 $pid
    fi
    echo "[$name] stopped."
  else
    echo "[$name] process not found. Removing stale PID file."
  fi
  rm -f "$pid_file"
}

# Function to check service status
check_status() {
  local name=$1
  local pid_file="$PID_DIR/$name.pid"
  if [ -f "$pid_file" ] && kill -0 $(cat "$pid_file") 2>/dev/null; then
    echo "[$name]: Running (PID: $(cat $pid_file))"
  else
    echo "[$name]: Stopped"
  fi
}

# Main logic
case "$1" in
  start)
    echo "=== Starting Spug Services ==="
    for name in "${!SERVICES[@]}"; do
      start_service "$name" "${SERVICES[$name]}"
    done
    echo "=== All services started ==="
    ;;
  stop)
    echo "=== Stopping Spug Services ==="
    for name in "${!SERVICES[@]}"; do
      stop_service "$name"
    done
    echo "=== All services stopped ==="
    ;;
  restart)
    $0 stop
    sleep 2
    $0 start
    ;;
  status)
    echo "=== Spug Services Status ==="
    for name in "${!SERVICES[@]}"; do
      check_status "$name"
    done
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
