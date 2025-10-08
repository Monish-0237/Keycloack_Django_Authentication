// MapView.jsx
import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function MapView({ selected, nearby }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mainPinRef = useRef(null);

  // Nearby pin refs and selection/popup state
  // Each item: { marker, data: { lng, lat, name } }
  const nearbyRefs = useRef([]);
  const selectedIndexRef = useRef(null);
  const selectedPopupRef = useRef(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN || "";
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [0, 0],
      zoom: 2,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: true,
      showUserHeading: true,
    });
    map.addControl(geolocate, "bottom-right");
    map.on("load", () => geolocate.trigger());

    // --- Helpers defined INSIDE the effect (so no missing-deps warning) ---
    const escapeHtml = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const findNearestIndex = (lng, lat) => {
      let best = null;
      let bestD2 = Infinity;
      nearbyRefs.current.forEach((ref, i) => {
        const ll = ref.marker.getLngLat();
        const dx = ll.lng - lng;
        const dy = ll.lat - lat;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = i;
        }
      });
      return best;
    };

    const setSelectedIndex = (idx) => {
      // remove previous highlight + popup
      const prev = selectedIndexRef.current;
      if (prev != null && nearbyRefs.current[prev]?.marker) {
        nearbyRefs.current[prev].marker
          .getElement()
          .classList.remove("pin--selected");
      }
      if (selectedPopupRef.current) {
        selectedPopupRef.current.remove();
        selectedPopupRef.current = null;
      }

      // apply new highlight
      const cur = nearbyRefs.current[idx];
      if (!cur?.marker) {
        selectedIndexRef.current = null;
        return;
      }
      cur.marker.getElement().classList.add("pin--selected");
      selectedIndexRef.current = idx;

      // popup with name
      const ll = cur.marker.getLngLat();
      const name = cur.data?.name || "Attraction";
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        anchor: "top",
        offset: 12,
        className: "poi-popup",
      })
        .setLngLat([ll.lng, ll.lat])
        .setHTML(`<div class="poi-popup__content">${escapeHtml(name)}</div>`)
        .addTo(mapRef.current);

      selectedPopupRef.current = popup;
    };

    // Focus a POI from list click
    const onFocus = (e) => {
      const { lng, lat, index } = e.detail || {};
      if (typeof lng !== "number" || typeof lat !== "number") return;

      // Center & zoom on the exact POI
      map.flyTo({ center: [lng, lat], zoom: 15.5, essential: true });

      // Persistently highlight the correct marker
      const idx =
        typeof index === "number" ? index : findNearestIndex(lng, lat);
      if (idx != null) setSelectedIndex(idx);
    };

    window.addEventListener("map:focus", onFocus);

    // Cleanup
    return () => {
      window.removeEventListener("map:focus", onFocus);
      // Map removal clears markers/popups; no need to touch refs directly
      map.remove();
      mapRef.current = null;
    };
  }, []); // no external deps needed

  // Rebuild markers when city/nearby changes
  useEffect(() => {
    const map = mapRef.current;
    if (!selected || !map) return;
    const { lat, lng } = selected;

    // Main city pin (blue)
    if (!mainPinRef.current) {
      mainPinRef.current = new mapboxgl.Marker({ color: "#1d4ed8" })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      mainPinRef.current.setLngLat([lng, lat]);
    }

    // Remove existing nearby pins + popup
    nearbyRefs.current.forEach((ref) => ref.marker.remove());
    nearbyRefs.current = [];
    if (selectedPopupRef.current) {
      selectedPopupRef.current.remove();
      selectedPopupRef.current = null;
    }
    selectedIndexRef.current = null;

    // Add new nearby pins (native Mapbox pins, green)
    if (Array.isArray(nearby) && nearby.length) {
      nearby.forEach((p) => {
        if (typeof p.lng !== "number" || typeof p.lat !== "number") return;

        const marker = new mapboxgl.Marker({ color: "#22c55e" })
          .setLngLat([p.lng, p.lat])
          .addTo(map);

        nearbyRefs.current.push({
          marker,
          data: { lng: p.lng, lat: p.lat, name: p.name },
        });
      });
    }

    // Fly to city view after search
    map.flyTo({ center: [lng, lat], zoom: 12, essential: true });
  }, [selected, nearby]);

  return <div ref={containerRef} className="map-container" />;
}
