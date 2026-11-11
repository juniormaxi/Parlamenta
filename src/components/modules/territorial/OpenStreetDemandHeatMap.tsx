import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Layers,
  Maximize2,
  Minimize2,
  RefreshCw,
  Compass,
  MapPin,
  Flame,
  Info,
} from 'lucide-react';
import { MunicipalityData } from '../../../types';

interface OpenStreetDemandHeatMapProps {
  municipalities: MunicipalityData[];
  selectedMunicipality: MunicipalityData;
  onSelectMunicipality: (m: MunicipalityData) => void;
  regionFilter?: string;
}

// Real geographic coordinates for Mato Grosso municipalities (Latitude, Longitude)
export const MT_MUNICIPALITY_COORDINATES: Record<string, [number, number]> = {
  cuiaba: [-15.6014, -56.0979],
  varzea_grande: [-15.6548, -56.1322],
  rondonopolis: [-16.4674, -54.6361],
  sinop: [-11.8608, -55.5097],
  sorriso: [-12.5425, -55.7214],
  tangara_da_serra: [-14.6225, -57.4933],
  primavera_do_leste: [-15.5578, -54.2981],
  barra_do_garcas: [-15.8928, -52.2567],
  caceres: [-16.0744, -57.6811],
  lucas_do_rio_verde: [-13.0644, -55.9108],
  juina: [-11.3789, -58.7419],
};

type TileStyle = 'osm' | 'voyager' | 'topo';

export const OpenStreetDemandHeatMap: React.FC<OpenStreetDemandHeatMapProps> = ({
  municipalities,
  selectedMunicipality,
  onSelectMunicipality,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [tileStyle, setTileStyle] = useState<TileStyle>('osm');
  const [showHeatCircles, setShowHeatCircles] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Initialize and update Leaflet map with OpenStreetMap
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Center of Mato Grosso
    const mtCenter: [number, number] = [-12.98, -55.80];
    const initialZoom = 6;

    // Create Leaflet Map Instance
    const map = L.map(mapContainerRef.current, {
      center: mtCenter,
      zoom: initialZoom,
      minZoom: 5,
      maxZoom: 14,
      zoomControl: false, // We'll add custom positioned zoom controls
    });

    mapInstanceRef.current = map;

    // Custom Zoom Control top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // OpenStreetMap Tile Layers
    let tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    let attribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

    if (tileStyle === 'voyager') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
      attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
    } else if (tileStyle === 'topo') {
      tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
      attribution = 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>';
    }

    const tileLayer = L.tileLayer(tileUrl, {
      attribution,
      maxZoom: 18,
      subdomains: 'abc',
    }).addTo(map);

    // Add Heatmap Glow Circles and Markers for Each Municipality
    municipalities.forEach((m) => {
      const coords = MT_MUNICIPALITY_COORDINATES[m.id];
      if (!coords) return;

      const isSelected = selectedMunicipality.id === m.id;
      const count = m.demandsCount;

      // Color scheme based on demand intensity
      let heatColor = '#36B7A5'; // Teal moderate
      let heatFill = '#36B7A5';
      let radiusMeters = 25000;

      if (count >= 50) {
        heatColor = '#EF4444'; // Red high demand
        heatFill = '#F87171';
        radiusMeters = 48000;
      } else if (count >= 30) {
        heatColor = '#F59E0B'; // Amber medium-high
        heatFill = '#FBBF24';
        radiusMeters = 38000;
      } else {
        heatColor = '#176B80'; // Petrol blue
        heatFill = '#36B7A5';
        radiusMeters = 28000;
      }

      // 1. Heatmap Halo Rings (Círculos concêntricos de calor)
      if (showHeatCircles) {
        // Outer diffuse halo
        L.circle(coords, {
          radius: radiusMeters,
          color: heatColor,
          fillColor: heatFill,
          fillOpacity: isSelected ? 0.28 : 0.16,
          weight: isSelected ? 2 : 1,
          dashArray: isSelected ? '4 2' : undefined,
          interactive: false,
        }).addTo(map);

        // Core denser heat circle
        L.circle(coords, {
          radius: radiusMeters * 0.45,
          color: heatColor,
          fillColor: heatColor,
          fillOpacity: isSelected ? 0.45 : 0.25,
          weight: 0,
          interactive: false,
        }).addTo(map);
      }

      // 2. Custom Marker with Demand Number & City Name
      const markerHtml = `
        <div class="cursor-pointer group flex flex-col items-center transform -translate-x-1/2 -translate-y-1/2">
          ${isSelected ? '<div class="absolute -inset-2 rounded-full bg-[#36B7A5]/40 animate-ping"></div>' : ''}
          <div style="
            background: ${isSelected ? '#102C45' : heatColor};
            border: 2px solid ${isSelected ? '#36B7A5' : '#FFFFFF'};
            color: #FFFFFF;
            width: ${count >= 50 ? '34px' : '30px'};
            height: ${count >= 50 ? '34px' : '30px'};
            border-radius: 9999px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 800;
            font-family: monospace;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
          " class="group-hover:scale-110">
            ${count}
          </div>
          <div style="
            background: ${isSelected ? '#102C45' : 'rgba(255, 255, 255, 0.95)'};
            color: ${isSelected ? '#FFFFFF' : '#1E293B'};
            border: 1px solid ${isSelected ? '#176B80' : '#E2E8F0'};
            padding: 1px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            white-space: nowrap;
            margin-top: 3px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.15);
          ">
            ${m.name}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-osm-demand-pin',
        iconSize: [40, 50],
        iconAnchor: [20, 25],
      });

      const marker = L.marker(coords, { icon: customIcon }).addTo(map);

      // Popup with city demand overview
      const popupContent = `
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px; min-width: 190px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; margin-bottom: 6px;">
            <strong style="color: #102C45; font-size: 13px;">${m.name}</strong>
            <span style="font-size: 10px; font-weight: 600; color: #176B80; background: #E9F1F4; padding: 2px 5px; border-radius: 4px;">${m.region}</span>
          </div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 4px;">
            <strong>${m.demandsCount} demandas</strong> registradas (${m.demandsResolved} resolvidas)
          </div>
          <div style="font-size: 10px; color: #64748B; margin-bottom: 6px;">
            Articulador: <strong style="color: #1E293B;">${m.leadAssessor}</strong>
          </div>
          <div style="font-size: 10px; color: #0F172A; background: #F8FAFC; padding: 4px; border-radius: 4px; border: 1px solid #E2E8F0;">
            Principal pauta: <strong>${m.demandsTopThemes[0]?.theme || 'Geral'}</strong> (${m.demandsTopThemes[0]?.count || 0})
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('click', () => {
        onSelectMunicipality(m);
        map.panTo(coords, { animate: true, duration: 0.6 });
      });
    });

    // Cleanup map on unmount
    return () => {
      tileLayer.remove();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [municipalities, selectedMunicipality, tileStyle, showHeatCircles, onSelectMunicipality]);

  // Center on selected municipality if changed externally
  const handleCenterOnSelected = () => {
    if (!mapInstanceRef.current) return;
    const coords = MT_MUNICIPALITY_COORDINATES[selectedMunicipality.id];
    if (coords) {
      mapInstanceRef.current.flyTo(coords, 8, { duration: 1.2 });
    }
  };

  const handleResetStateView = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([-12.98, -55.80], 6, { duration: 1.2 });
  };

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm transition-all duration-300 ${
        isFullscreen ? 'fixed inset-4 z-50 bg-white shadow-2xl h-[calc(100vh-2rem)]' : 'h-[500px]'
      }`}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl shadow-md border border-slate-200/80 text-xs text-slate-800">
        <div className="flex items-center gap-1.5 font-bold text-[#102C45] pr-2 border-r border-slate-200">
          <Compass className="w-4 h-4 text-[#176B80]" />
          <span>OpenStreetMap · Mato Grosso</span>
        </div>

        {/* Tile Provider Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-medium">
          <button
            onClick={() => setTileStyle('osm')}
            className={`px-2 py-0.5 rounded transition-colors ${
              tileStyle === 'osm'
                ? 'bg-white text-slate-900 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="OpenStreetMap Padrão Oficial"
          >
            OSM Padrão
          </button>
          <button
            onClick={() => setTileStyle('voyager')}
            className={`px-2 py-0.5 rounded transition-colors ${
              tileStyle === 'voyager'
                ? 'bg-white text-slate-900 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="OpenStreetMap Carto Claro Executivo"
          >
            Carto Claro
          </button>
          <button
            onClick={() => setTileStyle('topo')}
            className={`px-2 py-0.5 rounded transition-colors ${
              tileStyle === 'topo'
                ? 'bg-white text-slate-900 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="OpenStreetMap Relevo e Topografia"
          >
            Relevo
          </button>
        </div>

        {/* Heatmap Rings Toggle */}
        <button
          onClick={() => setShowHeatCircles(!showHeatCircles)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors ${
            showHeatCircles
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
          title="Ativar/Desativar anéis de calor das demandas"
        >
          <Flame className="w-3.5 h-3.5 text-rose-600" />
          <span>Calor {showHeatCircles ? 'Ligado' : 'Desligado'}</span>
        </button>

        {/* Quick Action: Center Mato Grosso */}
        <button
          onClick={handleResetStateView}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1"
          title="Centralizar visão em todo o Estado de Mato Grosso"
        >
          <RefreshCw className="w-3 h-3 text-slate-500" />
          <span>Visão MT</span>
        </button>

        {/* Quick Action: Focus Selected City */}
        <button
          onClick={handleCenterOnSelected}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#176B80]/10 hover:bg-[#176B80]/20 text-[#102C45] flex items-center gap-1"
          title={`Focar mapa em ${selectedMunicipality.name}`}
        >
          <MapPin className="w-3 h-3 text-[#176B80]" />
          <span>Focar {selectedMunicipality.name}</span>
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          title={isFullscreen ? 'Reduzir mapa' : 'Expandir mapa'}
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Main Leaflet Map DOM Container */}
      <div ref={mapContainerRef} className="w-full h-full z-[1]" />

      {/* Bottom Floating Legend Bar */}
      <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl shadow-md border border-slate-200 text-xs flex flex-wrap items-center gap-3">
        <span className="font-bold text-[#102C45] text-[11px] flex items-center gap-1">
          <Flame className="w-3.5 h-3.5 text-rose-600" /> Densidade de Demandas:
        </span>
        <div className="flex items-center gap-1 text-[11px] text-slate-700">
          <span className="w-3 h-3 rounded-full bg-rose-500 inline-block border border-white" />
          <span>Alta (&gt; 50 demandas)</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-700">
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block border border-white" />
          <span>Média (30 - 49)</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-700">
          <span className="w-3 h-3 rounded-full bg-[#176B80] inline-block border border-white" />
          <span>Moderada (&lt; 30)</span>
        </div>
      </div>

      {/* Bottom Right Selected City Pill */}
      <div className="absolute bottom-3 right-3 z-[400] bg-[#102C45]/90 backdrop-blur-md text-white px-3 py-1.5 rounded-xl shadow-md border border-white/20 text-xs flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-semibold">{selectedMunicipality.name}</span>
        <span className="font-mono text-[#36B7A5] font-bold">
          {selectedMunicipality.demandsCount} demandas
        </span>
      </div>
    </div>
  );
};
