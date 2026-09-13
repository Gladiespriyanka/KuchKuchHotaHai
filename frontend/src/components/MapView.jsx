import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * Leaflet + OpenStreetMap. Circle markers instead of image pins so the map
 * needs no bundled assets and still renders if tiles are blocked.
 */
export default function MapView({ points = [], center = [26.9124, 75.7873], zoom = 11, height = 340 }) {
  return (
    <div className="border-2 border-ink" style={{ height }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p, i) => (
          <CircleMarker
            key={`${p.name}-${i}`}
            center={[p.lat, p.lng]}
            radius={p.kind === 'me' ? 10 : p.kind === 'recycler' ? 8 : 5}
            pathOptions={{
              color: '#12211C',
              weight: 2,
              fillColor:
                p.kind === 'me' ? '#E0A526' : p.kind === 'recycler' ? '#0F4D38' : '#C4561E',
              fillOpacity: 0.9,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <span className="font-semibold">{p.name}</span>
              {p.detail && <div>{p.detail}</div>}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
