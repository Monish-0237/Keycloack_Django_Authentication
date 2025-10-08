// App.jsx
import React, { useState } from "react";
import { useKeycloak } from "@react-keycloak/web";
import MapView from "./components/MapView";
import SearchBar from "./components/SearchBar";
import { getPlaceSummary, getNearbyPlaces } from "./lib/placeInfo";
import "./App.css";

export default function App() {
  const { keycloak, initialized } = useKeycloak();

  const [selected, setSelected] = useState(null);   // {name, lat, lng}
  const [summary, setSummary] = useState(null);     // {title, extract}
  const [nearby, setNearby] = useState([]);         // [{name, lat, lng, ...}]
  const [loading, setLoading] = useState(false);

  if (!initialized) return <div style={{ padding: 16 }}>Loading…</div>;

  if (!keycloak.authenticated) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Welcome</h1>
        <p>Please sign in to view the map.</p>
        <button onClick={() => keycloak.login()}>Login</button>
      </div>
    );
  }

  const logout = () => keycloak.logout({ redirectUri: window.location.origin });

  // When user picks a city
  const handleSelect = async (place) => {
    setSelected(place);
    setSummary(null);
    setNearby([]);
    setLoading(true);

    try {
      const token = keycloak?.token;

      // 1) description
      const s = await getPlaceSummary(place, token);
      setSummary({
        title: s?.title || place.name,
        extract: s?.extract || "No description found.",
      });

      // 2) nearby attractions
      if (place.lat && place.lng) {
        const np = await getNearbyPlaces(place.lat, place.lng, token);
        setNearby(Array.isArray(np) ? np : []);
      }
    } catch (e) {
      console.error("Error fetching place info:", e);
      setSummary({ title: place.name, extract: "No description available." });
    } finally {
      setLoading(false);
    }
  };

  // Focus a specific nearby by index (no guessing)
  const focusNearby = (poi, index) => {
    if (typeof poi?.lng === "number" && typeof poi?.lat === "number") {
      window.dispatchEvent(
        new CustomEvent("map:focus", {
          detail: { lng: poi.lng, lat: poi.lat, index },
        })
      );
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <span>
          Signed in as <b>{keycloak.tokenParsed?.preferred_username}</b>
        </span>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn-logout" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {/* Main */}
      <main>
        {/* Search on top-left */}
        <SearchBar onSelect={handleSelect} />

        {/* Map */}
        <MapView selected={selected} nearby={nearby} />

        {/* Loading pill */}
        {loading && <div className="loading-box">Loading…</div>}

        {/* Description + Nearby list */}
        {summary && (
          <div className="description-box">
            <div className="desc-header">
              <h2>{summary.title || selected?.name}</h2>
              <button
                className="desc-close"
                onClick={() => setSummary(null)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="extract">{summary.extract}</div>

            {Array.isArray(nearby) && nearby.length > 0 && (
              <>
                <div className="nearby-title">Nearby tourist spots</div>
                <ul className="nearby-list">
                  {nearby.slice(0, 24).map((p, i) => (
                    <li key={`${p.name}-${i}`}>
                      <button
                        className="nearby-link"
                        onClick={() => focusNearby(p, i)}
                        title={p.full_name || p.name}
                      >
                        {p.name}
                      </button>
                      {p.full_name && (
                        <div className="nearby-sub">{p.full_name}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
