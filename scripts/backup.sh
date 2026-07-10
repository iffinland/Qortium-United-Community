#!/usr/bin/env bash
#
# Qortium United Community – Backup Script
# Creates a timestamped .tar.gz backup and keeps only the 2 most recent backups.
#

set -euo pipefail

PROJECT_NAME="qortium-united-community"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_ROOT="/home/iffiolen/VS-Code-Projects/_workspace_backups/QORTIUM"
TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
BACKUP_FILE="${PROJECT_NAME}_${TIMESTAMP}.tar.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_ROOT"

echo "📦 Creating backup: $BACKUP_FILE"
tar -czf "$BACKUP_ROOT/$BACKUP_FILE" \
    -C "$(dirname "$PROJECT_DIR")" \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.git' \
    "$(basename "$PROJECT_DIR")"

echo "✅ Backup created: $BACKUP_ROOT/$BACKUP_FILE"

# Keep only the 2 most recent backups
echo "🧹 Cleaning old backups (keeping 2 most recent)..."
cd "$BACKUP_ROOT"
BACKUPS=($(ls -1t ${PROJECT_NAME}_*.tar.gz 2>/dev/null || true))
if [ ${#BACKUPS[@]} -gt 2 ]; then
    OLD="${BACKUPS[@]:2}"
    for f in $OLD; do
        echo "   Deleting: $f"
        rm -f "$f"
    done
fi

echo "🎉 Done! Current backups:"
ls -1th ${PROJECT_NAME}_*.tar.gz 2>/dev/null || echo "   (none)"
