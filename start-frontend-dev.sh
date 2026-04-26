#!/bin/sh

cd "$(dirname "$0")/frontend"

# In sviluppo locale, l'SSR deve contattare il backend direttamente (Angular dev server non proxya SSR).
export BACKEND_ORIGIN="http://localhost:5000"

echo "Verifico dipendenze npm..."
npm install

npm run dev
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "--- Uscito con errore (codice $EXIT_CODE) ---"
    echo "Premi Invio per chiudere..."
    read _
fi
