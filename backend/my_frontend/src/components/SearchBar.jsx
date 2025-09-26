import React, { useEffect, useRef, useState } from 'react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function SearchBar({ onSelect }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  // Debounced fetch to Mapbox Geocoding API
  useEffect(() => {
    if (!q) { setResults([]); setOpen(false); return; }

    // cancel previous debounce + request
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    timerRef.current = setTimeout(async () => {
      try {
        abortRef.current = new AbortController();
        const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`);
        url.searchParams.set('access_token', MAPBOX_TOKEN);
        url.searchParams.set('limit', '5');
        url.searchParams.set('autocomplete', 'true');
        url.searchParams.set('types', 'place,region,address,poi,locality,neighborhood,postcode');

        const res = await fetch(url, { signal: abortRef.current.signal });
        const data = await res.json();
        setResults(data.features || []);
        setOpen(true);
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('Geocode error:', e);
      }
    }, 300);

    return () => {
      clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [q]);

  function choose(feature) {
    setOpen(false);
    setResults([]);
    onSelect?.(feature); // parent handles flyTo/marker
  }

  function submit(e) {
    e.preventDefault();
    if (results[0]) choose(results[0]);
  }

  return (
    <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2, width: 460 }}>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a place…"
          style={{ flex: 1, padding: 10, borderRadius: 6, border: '1px solid #444', background: '#2b2b2b', color: '#fff' }}
        />
        <button type="submit" style={{ padding: '8px 12px', borderRadius: 6 }}>Search</button>
      </form>

      {open && results.length > 0 && (
        <div
          style={{
            marginTop: 8,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0,0,0,.25)',
            maxHeight: 260,
            overflowY: 'auto'
          }}
        >
          {results.map((f) => (
            <button
              key={f.id}
              onClick={() => choose(f)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 600 }}>{f.text}</div>
              <div style={{ fontSize: 12, color: '#555' }}>{f.place_name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
