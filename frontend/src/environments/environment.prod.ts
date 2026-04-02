export const environment = {
  production: true,
  // In produzione: __API_URL__ viene sostituito a runtime dal docker-entrypoint.sh.
  // Vuoto = stesso dominio (Node SSR proxya /api/* al backend).
  // Valorizzato = host remoto (es. https://api.terzo.it) per deploy separato.
  apiUrl: '__API_URL__',
  apiKey: '__API_KEY__'
};
