import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { BusinessLead } from '../types/domain';

interface LeafletMapProps {
  leads: BusinessLead[];
  onSelectLead?: (lead: BusinessLead) => void;
  heightClass?: string;
}

export function LeafletMap({ leads, onSelectLead, heightClass = 'h-[420px]' }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const mappable = leads.filter(
    (l) => typeof l.latitude === 'number' && typeof l.longitude === 'number' && Number.isFinite(l.latitude) && Number.isFinite(l.longitude)
  );

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      const initialCenter: [number, number] = mappable.length > 0
        ? [mappable[0].latitude!, mappable[0].longitude!]
        : [26.9124, 75.7873]; // Jaipur default coordinates

      mapRef.current = L.map(containerRef.current, {
        center: initialCenter,
        zoom: 12,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;
    // Clear existing circleMarkers
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    if (mappable.length > 0) {
      const bounds = L.latLngBounds([]);
      mappable.forEach((lead) => {
        const latlng: [number, number] = [lead.latitude!, lead.longitude!];
        bounds.extend(latlng);
        const marker = L.circleMarker(latlng, {
          radius: 8,
          fillColor: lead.isDemo ? '#7C3AED' : '#2563EB',
          color: '#FFFFFF',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.92,
        }).addTo(map);

        const safeName = lead.businessName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeCat = lead.category.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeLoc = (lead.address || lead.location).replace(/</g, '&lt;').replace(/>/g, '&gt;');

        marker.bindPopup(
          `<div style="min-width:180px;font-family:sans-serif">
            <div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:2px">${safeName}</div>
            <div style="font-size:11px;color:#475569;margin-bottom:4px">${safeCat} · Score ${lead.opportunityScore}/100</div>
            <div style="font-size:11px;color:#64748b">${safeLoc}</div>
          </div>`
        );

        if (onSelectLead) {
          marker.on('click', () => onSelectLead(lead));
        }
      });
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
      }
    }
  }, [mappable, onSelectLead]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (mappable.length === 0) {
    return (
      <div className={`${heightClass} w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0F172A] flex flex-col items-center justify-center p-6 text-center`}>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          No businesses with verified coordinates in the current view
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
          ClientHunt AI never invents geographic coordinates. Run a discovery search with Scrapingdog Maps or OpenStreetMap to plot real business pins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`${heightClass} w-full rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden`}
      />
      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        Showing {mappable.length} of {leads.length} businesses with verified OpenStreetMap / GPS coordinates.
      </p>
    </div>
  );
}
