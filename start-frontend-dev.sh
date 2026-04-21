#!/bin/sh
set -e

cd "$(dirname "$0")/frontend"

if [ ! -d node_modules ]; then
    echo "node_modules non trovato — eseguo npm install..."
    npm install
fi

npm run dev
