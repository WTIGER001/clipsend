#!/bin/bash
set -e

# Remote Server Configuration
SERVER="root@157.230.85.208"
APP_DIR="~/clipsend"

echo "🚀 Starting Remote Deployment to $SERVER..."

echo "📡 Executing deployment commands on the server..."
ssh -t $SERVER "cd $APP_DIR && ./deploy.sh"

echo "✅ Remote deployment finished successfully!"
