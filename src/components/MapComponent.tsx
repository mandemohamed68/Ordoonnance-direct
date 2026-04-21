import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Clock } from 'lucide-react';

// Fix Leaflet default icon issue
// @ts-ignore
import icon from 'leaflet/dist/images/marker-icon.png?url';
// @ts-ignore
import iconShadow from 'leaflet/dist/images/marker-shadow.png?url';

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

interface MapComponentProps { 
  center: [number, number];
  markers: { pos: [number, number], label: string, color?: string, type?: 'patient' | 'pharmacy' | 'delivery' | 'self' }[];
  zoom?: number;
}

export function MapComponent({ center, markers, zoom = 13 }: MapComponentProps) {
  const [route, setRoute] = useState<[number, number][]>([]);
  const [eta, setEta] = useState<number | null>(null);

  // Memoize icons to prevent memory leaks and redundant object creation
  const markerIcon = useRef(L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  }));

  useEffect(() => {
    if (markers.length === 2 || markers.length === 3) {
      let start = markers[0].pos;
      let end = markers[1].pos;
      
      if (markers.length === 3) {
        const delivery = markers.find(m => m.type === 'delivery');
        const patient = markers.find(m => m.type === 'patient');
        if (delivery && patient) {
          start = delivery.pos;
          end = patient.pos;
        }
      }

      fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`)
        .then(res => res.json())
        .then(data => {
          if (data.routes && data.routes[0]) {
            const coords = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
            setRoute(coords);
            setEta(Math.round(data.routes[0].duration / 60));
          }
        })
        .catch(console.error);
    } else {
      setRoute([]);
      setEta(null);
    }
  }, [markers]);

  return (
    <div className="h-[300px] w-full rounded-2xl overflow-hidden border border-slate-100 shadow-inner relative z-0">
      {eta !== null && (
        <div className="absolute top-4 right-4 z-[400] bg-white px-4 py-2 rounded-xl shadow-lg font-bold text-sm flex items-center gap-2 text-slate-700">
          <Clock size={16} className="text-primary" />
          ETA: {eta} min
        </div>
      )}
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterMap center={center} />
        {route.length > 0 && <Polyline positions={route} color="#10b981" weight={4} dashArray="10, 10" />}
        {markers.map((marker, idx) => (
          <Marker 
            key={`${marker.pos[0]}-${marker.pos[1]}-${idx}`} 
            position={marker.pos}
            icon={markerIcon.current}
          >
            <Popup>
              <div className="font-bold">{marker.label}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default MapComponent;
