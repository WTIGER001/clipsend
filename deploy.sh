#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Starting ClipSend deployment..."

# 1. Pull latest code from git (if inside a git repository)
if [ -d .git ]; then
  echo "📥 Pulling latest code from Git..."
  git pull
else
  echo "ℹ️ Skipping Git pull (not a Git repository)..."
fi

# 2. Determine Docker Compose command
if docker compose version >/dev/null 2>&1; then
  DOCKER_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_CMD="docker-compose"
else
  echo "❌ Error: Neither 'docker compose' nor 'docker-compose' found on this system."
  exit 1
fi

# 3. Build images first
echo "🐳 Building new Docker images in the background..."
$DOCKER_CMD build

# 4. Recreate containers instantly
echo "🔄 Swapping running containers to new versions..."
$DOCKER_CMD up -d

# 5. Cleanup unused Docker images to save space on small VPS
echo "🧹 Cleaning up dangling Docker images..."
docker image prune -f

echo "✅ ClipSend deployment complete! It is running through Caddy on clipsend.bauerstuff.com."
