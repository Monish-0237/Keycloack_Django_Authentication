// lib/placeInfo.js
const API_BASE = "http://localhost:8000/api";

/**
 * Get a description for a place by calling Django backend.
 * Backend returns {query, title, extract}
 * @param {{name: string}} params
 * @param {string} token - Keycloak bearer token
 */
export async function getPlaceSummary({ name }, token) {
  if (!name) {
    return { title: "Unknown", extract: "No place provided." };
  }

  try {
    const url = `${API_BASE}/describe/?query=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (res.ok) {
      return {
        title: data.title || name,
        extract: data.extract || "",
      };
    }
    return { title: name, extract: data.detail || "No description available." };
  } catch (err) {
    console.error("getPlaceSummary failed:", err);
    return { title: name, extract: "Error fetching description." };
  }
}

/**
 * Get nearby tourist places around given lat/lng from backend (Wikipedia).
 * @param {number} lat
 * @param {number} lng
 * @param {string} token
 */
export async function getNearbyPlaces(lat, lng, token) {
  if (!lat || !lng) return [];
  try {
    // Use 10km to match MediaWiki GeoSearch max
    const url = `${API_BASE}/nearby/?lat=${lat}&lng=${lng}&radius=10000&limit=20`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.places)) return data.places;
    console.warn("Nearby API error:", data);
    return [];
  } catch (err) {
    console.error("getNearbyPlaces failed:", err);
    return [];
  }
}
