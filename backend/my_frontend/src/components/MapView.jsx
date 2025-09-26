import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import SearchBar from './SearchBar';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function MapView() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const pinRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN || '';
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [0, 0],
      zoom: 2,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: true,
      showUserHeading: true,
    });
    map.addControl(geolocate, 'top-right');

    map.on('load', () => geolocate.trigger());

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function handleSelect(feature) {
    const [lng, lat] = feature.center; // GeoJSON [lng, lat]
    const map = mapRef.current;
    if (!map) return;

    // Add or move marker
    if (!pinRef.current) {
      pinRef.current = new mapboxgl.Marker({ color: '#1d4ed8' }).setLngLat([lng, lat]).addTo(map);
    } else {
      pinRef.current.setLngLat([lng, lat]);
    }

    // Fly to result
    map.flyTo({ center: [lng, lat], zoom: 12, essential: true });
  }

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <SearchBar onSelect={handleSelect} />
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
