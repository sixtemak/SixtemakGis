import React, { useState, useCallback, useRef } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  GeoJSON, 
  useMap,
  LayersControl
} from 'react-leaflet';
import L from 'leaflet';
import shp from 'shpjs';
import { 
  Upload, 
  Layers, 
  Map as MapIcon, 
  Layers2, 
  Trash2, 
  ChevronRight,
  ChevronLeft,
  Info,
  Maximize2,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

// Types
interface GeoLayer {
  id: string;
  name: string;
  data: any;
  color: string;
  visible: boolean;
}

interface BaseMap {
  id: string;
  name: string;
  url: string;
  attribution: string;
}

const BASE_MAPS: BaseMap[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  {
    id: 'dark',
    name: 'CartoDB Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  },
  {
    id: 'light',
    name: 'CartoDB Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  },
  {
    id: 'satellite',
    name: 'Esri Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
  }
];

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
];

// Fix for Leaflet default icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Map View Controller to handle centering and navigation
function MapController({ bounds, center }: { bounds: L.LatLngBounds | null, center: L.LatLngExpression | null }) {
  const map = useMap();
  
  React.useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.flyToBounds(bounds, { 
        padding: [20, 20],
        duration: 2
      });
    }
  }, [bounds, map]);

  React.useEffect(() => {
    if (center) {
      map.flyTo(center, 16, {
        animate: true,
        duration: 2.5,
        easeLinearity: 0.25
      });
    }
  }, [center, map]);

  return null;
}

function FloatingControls({ onResetView }: { onResetView: () => void }) {
  const map = useMap();
  
  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000]">
      <div className="flex flex-col bg-white/90 backdrop-blur-md rounded-xl shadow-2xl border border-white/20 p-1 overflow-hidden">
         <button 
            onClick={() => map.zoomIn()}
            className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-blue-600 hover:text-white transition-all rounded-lg font-bold"
         >+</button>
         <div className="h-px bg-gray-100 mx-1.5" />
         <button 
            onClick={() => map.zoomOut()}
            className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-blue-600 hover:text-white transition-all rounded-lg font-bold"
         >-</button>
      </div>

      <button 
        onClick={onResetView}
        title="Ajustar vista a capas"
        className="w-10 h-10 bg-white/90 backdrop-blur-md rounded-xl shadow-2xl border border-white/20 flex items-center justify-center text-gray-600 hover:text-blue-600 transition-all hover:scale-105"
      >
        <Maximize2 className="w-5 h-5" />
      </button>
    </div>
  );
}

export default function App() {
  const [layers, setLayers] = useState<GeoLayer[]>([]);
  const [activeBaseMap, setActiveBaseMap] = useState(BASE_MAPS[0]);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingBounds, setPendingBounds] = useState<L.LatLngBounds | null>(null);
  const [mapCenter, setMapCenter] = useState<L.LatLngExpression | null>([-4.079178, -81.021589]);
  const [selectedProject, setSelectedProject] = useState('punta-canoas');
  const [searchTerm, setSearchTerm] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carga automática de capa base definitiva
  React.useEffect(() => {
    const loadDefaultLayer = async () => {
      try {
        const response = await fetch('/proyecto_base.zip');
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const geojson = await shp(arrayBuffer);
          
          const newLayer: GeoLayer = {
            id: 'default-layer',
            name: 'Capa Base Proyecto',
            data: geojson,
            color: COLORS[0],
            visible: true
          };

          setLayers(prev => {
            if (prev.some(l => l.id === 'default-layer')) return prev;
            return [newLayer, ...prev];
          });
          
          const tempGeoJson = L.geoJSON(geojson);
          setPendingBounds(tempGeoJson.getBounds());
        }
      } catch (error) {
        console.log('No se encontró proyecto_base.zip o hubo un error al cargar.');
      }
    };

    loadDefaultLayer();
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      alert('Por favor sube un archivo .zip que contenga el Shapefile.');
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const geojson = await shp(arrayBuffer);
      
      const newLayer: GeoLayer = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name.replace('.zip', ''),
        data: geojson,
        color: COLORS[layers.length % COLORS.length],
        visible: true
      };

      setLayers(prev => [...prev, newLayer]);
      
      // Calculate bounds for zoom
      // Use Leaflet's GeoJSON to get bounds easily
      const tempGeoJson = L.geoJSON(geojson);
      setPendingBounds(tempGeoJson.getBounds());
      
    } catch (error) {
      console.error('Error parsing shapefile:', error);
      alert('Error al procesar el archivo. Asegúrate de que sea un Shapefile válido en formato ZIP.');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const removeLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
  };

  const toggleLayerVisibility = (id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#f8f9fa] font-sans overflow-hidden">
      {/* Top Menu / Header */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 z-30 shadow-sm shrink-0 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-8 w-full">
          {/* Projects Select */}
          <div className="flex items-center gap-3 shrink-0">
             <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center shadow-lg">
                <Layers2 className="text-white w-5 h-5" />
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] text-sky-600 font-bold uppercase tracking-wider leading-none mb-1">Proyectos</p>
                <select 
                  value={selectedProject}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedProject(val);
                    if (val === 'aranda') setMapCenter([-4.885895, -80.654432]);
                    if (val === 'punta-canoas') setMapCenter([-4.079178, -81.021589]);
                    if (val === 'la-gran-piura') setMapCenter([-5.159795, -80.777207]);
                  }}
                  className="bg-transparent border-none p-0 text-sm font-semibold text-gray-900 focus:outline-none cursor-pointer"
                >
                  <option value="punta-canoas">Punta Canoas</option>
                  <option value="la-gran-piura">La Gran Piura</option>
                  <option value="aranda">Aranda</option>
                </select>
              </div>
          </div>

          <div className="w-px h-8 bg-gray-100 hidden sm:block shrink-0" />

          {/* Search section */}
          <div className="flex items-center gap-6 flex-1 max-w-2xl">
            <div className="flex items-center gap-3 shrink-0">
               <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Search className="text-gray-400 w-5 h-5" />
                </div>
                <div className="hidden sm:block">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider leading-none mb-1">Localización</p>
                  <label htmlFor="lot-search" className="text-sm font-semibold text-gray-900">Busqueda de lote</label>
                </div>
            </div>

            <div className="flex-1 max-w-sm flex gap-2">
              <div className="relative group flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-sky-500 transition-colors" />
                <input
                  id="lot-search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                  placeholder="Manzana-Lote"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all shadow-sm uppercase"
                />
              </div>
              <button className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm shrink-0 active:scale-95">
                Buscar
              </button>
            </div>
          </div>
          
          <div className="ml-auto flex items-center gap-4 shrink-0">
             <div className="text-right hidden md:block">
                <p className="text-xs font-bold text-gray-900">User Session</p>
                <div className="flex items-center justify-end gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <p className="text-[10px] text-gray-500">Conectado</p>
                </div>
             </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar Toggle Button (Visible when closed) */}
        {!isSidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-6 left-6 w-10 h-10 bg-white border border-gray-200 shadow-xl rounded-xl flex items-center justify-center z-50 text-gray-600 hover:text-blue-600 hover:scale-110 transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 320 : 0,
          opacity: isSidebarOpen ? 1 : 0
        }}
        transition={{ type: "spring", damping: 20, stiffness: 100 }}
        className="relative flex flex-col bg-sky-950 border-r border-sky-900 shadow-xl z-20 overflow-hidden text-white"
      >
        <div className="p-6 flex flex-col h-full min-w-[320px]">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-sky-500 rounded-lg flex items-center justify-center shadow-lg transform rotate-3">
                <Layers2 className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white leading-tight">SixtemakGis</h1>
                <p className="text-[10px] text-sky-300 uppercase tracking-[0.2em] font-medium italic">Portal Geográfico</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 hover:bg-sky-900 rounded-lg text-sky-300 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {/* Base Maps Selection */}
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold text-sky-400 uppercase tracking-wider mb-3">
                <MapIcon className="w-3.5 h-3.5" />
                Mapa Base
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {BASE_MAPS.map((bm) => (
                  <button
                    key={bm.id}
                    onClick={() => setActiveBaseMap(bm)}
                    className={cn(
                      "p-2 rounded-lg border text-left transition-all hover:bg-sky-900 active:scale-95",
                      activeBaseMap.id === bm.id 
                        ? "border-sky-400 bg-sky-800 text-sky-100 ring-2 ring-sky-500/20" 
                        : "border-sky-900 bg-sky-900/50 text-sky-300 hover:border-sky-700"
                    )}
                  >
                    <span className="text-[11px] font-medium block truncate lowercase first-letter:uppercase">
                      {bm.name.replace('CartoDB ', '')}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Layer Management */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-2 text-xs font-semibold text-sky-400 uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5" />
                  Capas
                </h2>
                <span className="text-[10px] font-mono text-sky-400 bg-sky-900/50 px-1.5 py-0.5 rounded border border-sky-800">
                  {layers.length}
                </span>
              </div>

              {layers.length === 0 ? (
                <div className="p-8 border-2 border-dashed border-sky-800 rounded-2xl text-center space-y-3">
                  <div className="w-10 h-10 bg-sky-900/50 rounded-full flex items-center justify-center mx-auto">
                    <Info className="text-sky-600 w-5 h-5" />
                  </div>
                  <p className="text-xs text-sky-400 leading-relaxed italic">
                    No hay capas cargadas.<br/>Sube un archivo para comenzar.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {layers.map((layer) => (
                      <motion.div
                        key={layer.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn(
                          "group p-3 rounded-xl border flex items-center gap-3 transition-all",
                          layer.visible ? "border-sky-800 bg-sky-900/50" : "border-sky-900 bg-sky-950 opacity-40"
                        )}
                      >
                        <button 
                          onClick={() => toggleLayerVisibility(layer.id)}
                          className="w-4 h-4 rounded border flex-shrink-0"
                          style={{ backgroundColor: layer.visible ? layer.color : 'transparent', borderColor: layer.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-sky-100 truncate">{layer.name}</p>
                        </div>
                        <button
                          onClick={() => removeLayer(layer.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-sky-800 text-sky-400 hover:text-red-400 rounded-lg transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>

            {/* Upload Area */}
            <section className="mt-auto pt-6">
               <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "p-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group",
                  isDragging 
                    ? "border-sky-400 bg-sky-800 animate-pulse" 
                    : "border-sky-800 hover:border-sky-500 hover:bg-sky-900"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:-translate-y-1",
                  isDragging ? "bg-sky-500 text-white" : "bg-sky-900 text-sky-400 group-hover:bg-sky-800 group-hover:text-sky-300"
                )}>
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-sky-100">Subir Shapefile</p>
                  <p className="text-[11px] text-sky-400 mt-1">Arrastra un archivo .zip</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  className="hidden"
                />
              </div>
            </section>
          </div>
        </div>
      </motion.aside>

      {/* Main Map */}
      <main className="flex-1 relative">
        <MapContainer
          center={[-4.079178, -81.021589]}
          zoom={16}
          scrollWheelZoom={true}
          zoomControl={false}
          className="z-10"
        >
          <TileLayer
            key={activeBaseMap.id}
            url={activeBaseMap.url}
            attribution={activeBaseMap.attribution}
          />
          
          {layers.filter(l => l.visible).map((layer) => (
            <GeoJSON
              key={layer.id}
              data={layer.data}
              style={{
                color: layer.color,
                weight: 2,
                opacity: 0.8,
                fillColor: layer.color,
                fillOpacity: 0.2
              }}
              onEachFeature={(feature, l) => {
                if (feature.properties) {
                  const popupContent = Object.entries(feature.properties)
                    .map(([key, val]) => `<div class="mb-1"><strong>${key}:</strong> ${val}</div>`)
                    .join('');
                  l.bindPopup(`<div class="font-sans text-xs p-1">${popupContent}</div>`);
                }
              }}
            />
          ))}

          <MapController bounds={pendingBounds} center={mapCenter} />
          <FloatingControls onResetView={() => {
            if (layers.length > 0) {
              const allBounds = L.featureGroup(layers.map(l => L.geoJSON(l.data))).getBounds();
              setPendingBounds(allBounds);
            }
          }} />

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg border border-white/40 z-[1000] flex items-center gap-4">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest whitespace-nowrap">Live Portal</span>
             </div>
             <div className="w-px h-3 bg-gray-300" />
             <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium">
                <Info className="w-3 h-3" />
                <span>Formatos soportados: Shapefile (ZIP)</span>
             </div>
          </div>
        </MapContainer>
      </main>

      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 12px;
          padding: 4px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
        }
        .leaflet-popup-tip {
          background: white;
        }
      `}</style>
    </div>
  );
}
