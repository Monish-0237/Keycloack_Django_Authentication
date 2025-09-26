import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactKeycloakProvider } from '@react-keycloak/web';
import App from './App.jsx';
import keycloak from './keycloak.js';
import './index.css';

createRoot(document.getElementById('root')).render(
  <ReactKeycloakProvider
    authClient={keycloak}
    initOptions={{ onLoad: 'login-required', pkceMethod: 'S256' }}
     
  >
    <App />
  </ReactKeycloakProvider>
);
