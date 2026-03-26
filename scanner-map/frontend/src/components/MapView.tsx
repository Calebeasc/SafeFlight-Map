import React, { useEffect, useRef } from "react";
import L from "leaflet";

export default function MapView({ geojson }: { geojson: any }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    mapRef.current = L.map(ref.current).setView([37.7749, -122.4194], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapRef.current);
  }, []);
  useEffect(() => {
    if (!mapRef.current) return;
    const layer = L.geoJSON(geojson, {
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 8, color: "#f03", fillOpacity: 0.5 + Math.min(0.5, ((f?.properties?.intensity || 0) / 100)) })
    }).addTo(mapRef.current);
    return () => { layer.remove(); };
  }, [geojson]);
  return <div ref={ref} style={{ height: 520, width: "100%" }} />;
}
