import React from 'react';
import { useKeycloak } from '@react-keycloak/web';
import MapView from './components/MapView';

export default function App() {
  const { keycloak, initialized } = useKeycloak();

  if (!initialized) return <div style={{ padding: 16 }}>Loading…</div>;

  if (!keycloak.authenticated) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1>Welcome</h1>
        <p>Please sign in to view the map.</p>
        <button onClick={() => keycloak.login()}>Login</button>
      </div>
    );
  }

  const logout = () => keycloak.logout({ redirectUri: window.location.origin });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: '8px 12px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>Signed in as <b>{keycloak.tokenParsed?.preferred_username}</b></span>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0 }}>
        <MapView />
      </main>
    </div>
  );
}
