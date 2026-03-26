import React, { useEffect, useRef } from "react";
import L from "leaflet";

export default function MapView({ geojson }: { geojson: any }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = L.map(ref.current, {
      preferCanvas: true,
      zoomSnap: 1,
      zoomDelta: 1,
    }).setView([37.7749, -122.4194], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);

    mapRef.current = map;

    const invalidate = () => map.invalidateSize();
    const t1 = window.setTimeout(invalidate, 100);
    const t2 = window.setTimeout(invalidate, 300);
    const t3 = window.setTimeout(invalidate, 800);
    window.addEventListener("resize", invalidate);
    window.addEventListener("load", invalidate);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("load", invalidate);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const layer = L.geoJSON(geojson, {
      pointToLayer: (f, latlng) =>
        L.circleMarker(latlng, {
          radius: 8,
          color: "#f03",
          fillOpacity: 0.5 + Math.min(0.5, (f?.properties?.intensity || 0) / 100),
        }),
    }).addTo(mapRef.current);

    mapRef.current.invalidateSize();
    return () => layer.remove();
  }, [geojson]);

  return <div id="map" ref={ref} style={{ width: "100%" }} />;
}
