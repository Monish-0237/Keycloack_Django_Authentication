// SearchBar.jsx
import React, { useEffect, useRef, useState } from "react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function SearchBar({ onSelect }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  // Debounced fetch to Mapbox Geocoding API (GLOBAL search, no country restriction)
  useEffect(() => {
    if (!q) {
      setResults([]);
      setOpen(false);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    timerRef.current = setTimeout(async () => {
      try {
        abortRef.current = new AbortController();
        const url = new URL(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
        );
        url.searchParams.set("access_token", MAPBOX_TOKEN);
        url.searchParams.set("limit", "5");
        url.searchParams.set("autocomplete", "true");

        const res = await fetch(url, { signal: abortRef.current.signal });
        const data = await res.json();
        setResults(data.features || []);
        setOpen(true);
      } catch (e) {
        if (e.name !== "AbortError") console.warn("Geocode error:", e);
      }
    }, 300);

    return () => {
      clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [q]);

  // Normalize a Mapbox feature into { name, lat, lng }
  function normalizeFeature(feature) {
    const [lng, lat] = feature.center || [];
    const name = feature.text || feature.place_name || "Selected place";
    return { name, lat, lng };
  }

  async function choose(feature) {
    setOpen(false);
    setResults([]);
    const normalized = normalizeFeature(feature);
    onSelect?.(normalized);
  }

  function submit(e) {
    e.preventDefault();
    if (results[0]) choose(results[0]);
  }

  return (
    <div className="searchbar-wrap">
      <form onSubmit={submit} className="searchbar-form">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a place…"
          className="searchbar-input"
        />
        <button type="submit" className="searchbar-btn">Search</button>
      </form>

      {open && results.length > 0 && (
        <div className="searchbar-results">
          {results.map((f) => (
            <button
              key={f.id}
              onClick={() => choose(f)}
              className="searchbar-result"
            >
              <div className="result-title">{f.text}</div>
              <div className="result-sub">{f.place_name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
