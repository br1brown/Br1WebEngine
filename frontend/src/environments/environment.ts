export const environment = {
  production: false,
  // In sviluppo usa sempre path relativi /api.
  // Il target reale viene deciso dal proxy Angular:
  // - npm start        -> proxy locale verso il backend lanciato da Visual Studio
  // - npm run start:docker -> proxy interno verso il container backend
  apiUrl: '',
  apiKey: 'frontend'
};
