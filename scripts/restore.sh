#!/usr/bin/env bash
#
# Qortium United Community – Restore Script
# Lists available backups and lets you pick one to restore.
#

set -euo pipefail

PROJECT_NAME="qortium-united-community"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_ROOT="/home/iffiolen/VS-Code-Projects/_workspace_backups/QORTIUM"

echo "🔍 Available backups for $PROJECT_NAME:"
echo ""

BACKUPS=($(ls -1t "$BACKUP_ROOT"/${PROJECT_NAME}_*.tar.gz 2>/dev/null || true))

if [ ${#BACKUPS[@]} -eq 0 ]; then
    echo "   ❌ No backups found in $BACKUP_ROOT"
    exit 1
fi

# Print numbered list
for i in "${!BACKUPS[@]}"; do
    FILE="$(basename "${BACKUPS[$i]}")"
    SIZE="$(du -h "${BACKUPS[$i]}" | cut -f1)"
    printf "  [%d]  %s  (%s)\n" "$((i+1))" "$FILE" "$SIZE"
done

echo ""
read -r -p "👉 Enter number (1-${#BACKUPS[@]}) or 'q' to quit: " CHOICE

if [[ "$CHOICE" == "q" || "$CHOICE" == "Q" ]]; then
    echo "👋 Cancelled."
    exit 0
fi

if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt ${#BACKUPS[@]} ]; then
    echo "❌ Invalid choice. Exiting."
    exit 1
fi

SELECTED="${BACKUPS[$((CHOICE-1))]}"
echo ""
echo "⚠️  This will OVERWRITE the current workspace at:"
echo "   $PROJECT_DIR"
read -r -p "Are you sure you want to restore '$(basename "$SELECTED")'? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "👋 Cancelled."
    exit 0
fi

echo ""
echo "🔄 Restoring from: $(basename "$SELECTED") ..."

# Remove current project contents (except scripts/, .git, node_modules)
echo "   Cleaning current workspace..."
find "$PROJECT_DIR" -mindepth 1 -maxdepth 1 \
    ! -name 'scripts' \
    ! -name '.git' \
    ! -name 'node_modules' \
    -exec rm -rf {} +

# Extract backup one level above project dir
tar -xzf "$SELECTED" -C "$(dirname "$PROJECT_DIR")"

echo "✅ Restore complete!"
echo ""
echo "💡 Tip: Run 'npm install' if node_modules are missing."
