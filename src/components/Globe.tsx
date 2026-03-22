import React, { useEffect, useRef, useState } from 'react';
import { select, geoOrthographic, geoPath, geoGraticule, geoDistance, json, drag, zoom, zoomIdentity } from 'd3';
import { RefreshCw } from 'lucide-react';
import { Crisis } from '../types';

interface GlobeProps {
  rotationSpeed?: number;
  onCrisisSelect?: (crisis: Crisis | null) => void;
  activeCrises: Crisis[];
  theme?: 'dark' | 'light';
}

export const Globe: React.FC<GlobeProps> = ({ 
  rotationSpeed = 0.02, 
  activeCrises = [],
  onCrisisSelect,
  theme = 'dark'
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const rotationRef = useRef<[number, number, number]>([0, -30, 0]);
  const scaleRef = useRef<number>(250);
  const isInteracting = useRef(false);
  const lastInteractionTime = useRef(Date.now());

  // Load GeoJSON once
  useEffect(() => {
    const worldUrl = 'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson';
    json(worldUrl)
      .then(data => setGeoData(data))
      .catch(err => {
        console.error("Error loading GeoJSON:", err);
        // Fallback: A very simple boxy world if fetch fails
        setGeoData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { name: "Fallback Land" },
              geometry: {
                type: "Polygon",
                coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]]
              }
            }
          ]
        });
        setError("Map data sync failed. Using low-res fallback.");
      });
  }, []);

  // Animation and Render loop
  useEffect(() => {
    if (!svgRef.current || !geoData) return;

    const width = 600;
    const height = 600;
    const svg = select(svgRef.current);
    
    // Initial setup
    const projection = geoOrthographic()
      .scale(250)
      .translate([width / 2, height / 2])
      .clipAngle(90);

    const path = geoPath(projection);
    const graticule = geoGraticule();

    // Layers
    const sphereLayer = svg.selectAll('.sphere').data([null]).join('path').attr('class', 'sphere');
    const graticuleLayer = svg.selectAll('.graticule').data([null]).join('path').attr('class', 'graticule');
    const landLayer = svg.selectAll('.land').data([null]).join('g').attr('class', 'land');
    const crisisLayer = svg.selectAll('.crises').data([null]).join('g').attr('class', 'crises');

    // Drag behavior
    const dragBehavior = drag<SVGSVGElement, unknown>()
      .on('start', () => { 
        isInteracting.current = true; 
        lastInteractionTime.current = Date.now();
      })
      .on('drag', (event) => {
        lastInteractionTime.current = Date.now();
        // Variable sensitivity based on zoom level
        const sensitivity = 0.25 * (250 / scaleRef.current);
        rotationRef.current[0] += event.dx * sensitivity;
        rotationRef.current[1] -= event.dy * sensitivity;
        rotationRef.current[1] = Math.max(-90, Math.min(90, rotationRef.current[1]));
      })
      .on('end', () => { 
        isInteracting.current = false; 
        lastInteractionTime.current = Date.now();
      });

    // Zoom behavior
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([150, 5000])
      .on('start', () => {
        isInteracting.current = true;
        lastInteractionTime.current = Date.now();
      })
      .on('zoom', (event) => {
        lastInteractionTime.current = Date.now();
        scaleRef.current = event.transform.k;
      })
      .on('end', () => {
        isInteracting.current = false;
        lastInteractionTime.current = Date.now();
      });

    svg.call(dragBehavior as any);
    svg.call(zoomBehavior as any);
    // Initialize zoom scale
    svg.call(zoomBehavior.transform as any, zoomIdentity.translate(0, 0).scale(scaleRef.current));

    let frameId: number;

    const render = () => {
      try {
        const now = Date.now();
        // Only auto-rotate if not interacting and it's been 30 seconds since last interaction
        if (!isInteracting.current && (now - lastInteractionTime.current > 5000)) {
          rotationRef.current[0] += rotationSpeed * 10;
        }
        
        projection.rotate(rotationRef.current);
        projection.scale(scaleRef.current);

        // 1. Sphere
        sphereLayer
          .datum({ type: 'Sphere' })
          .attr('d', path as any)
          .attr('fill', theme === 'dark' ? '#000' : '#fff')
          .attr('stroke', theme === 'dark' ? 'rgba(249,115,22,0.3)' : 'rgba(0,0,0,0.2)')
          .attr('stroke-width', theme === 'dark' ? 1.5 : 2.5);

        // 2. Graticule
        graticuleLayer
          .datum(graticule())
          .attr('d', path as any)
          .attr('fill', 'none')
          .attr('stroke', theme === 'dark' ? 'rgba(249,115,22,0.15)' : 'rgba(0,0,0,0.1)')
          .attr('stroke-width', theme === 'dark' ? 0.5 : 1.0);

        // 3. Landmasses (Wireframe style)
        landLayer
          .selectAll('path')
          .data(geoData.features)
          .join('path')
          .attr('d', path as any)
          .attr('fill', theme === 'dark' ? 'rgba(249,115,22,0.02)' : 'rgba(0,0,0,0.02)')
          .attr('stroke', theme === 'dark' ? 'rgba(249,115,22,0.5)' : 'rgba(0,0,0,0.4)')
          .attr('stroke-width', theme === 'dark' ? 0.8 : 1.5);

        // 4. Crisis Markers (Tactical HUD Style)
        const visibleCrises = activeCrises.filter(crisis => {
          const p = projection([crisis.lng, crisis.lat]);
          if (!p) return false;
          
          // Double check visibility for Orthographic projection
          const center: [number, number] = [-rotationRef.current[0], -rotationRef.current[1]];
          const distance = geoDistance([crisis.lng, crisis.lat], center);
          return distance < Math.PI / 2;
        });

        const getIconPath = (type: string) => {
          const t = type.toLowerCase();
          // Simple SVG paths for icons (centered at 0,0 in a 10x10 space)
          if (t.includes('earthquake') || t === 'eq') {
            return 'M-4,0 L-2,4 L0,-4 L2,4 L4,0'; // Zigzag
          }
          if (t.includes('flood') || t === 'fl') {
            return 'M-4,2 Q0,-2 4,2 M-4,-2 Q0,-6 4,-2'; // Waves
          }
          if (t.includes('cyclone') || t.includes('storm') || t.includes('hurricane') || t === 'tc') {
            return 'M0,-4 A4,4 0 1,1 -4,0 M0,4 A4,4 0 1,1 4,0'; // Spiral-ish
          }
          if (t.includes('wildfire') || t === 'wf') {
            return 'M0,4 C-2,2 -4,0 -2,-2 C-1,-3 0,-5 0,-5 C0,-5 1,-3 2,-2 C4,0 2,2 0,4 Z'; // Improved Flame
          }
          if (t.includes('volcano') || t === 'vo') {
            return 'M-4,4 L0,-4 L4,4 M-1,-1 L1,-1'; // Mountain
          }
          if (t.includes('drought') || t === 'dr') {
            return 'M0,-4 L0,4 M-4,0 L4,0 M-3,-3 L3,3 M-3,3 L3,-3'; // Sun/Cracked
          }
          if (t.includes('epidemic') || t.includes('health') || t === 'ep') {
            return 'M-3,0 A3,3 0 1,1 3,0 A3,3 0 1,1 -3,0 M0,-4 L0,4 M-4,0 L4,0'; // Biohazard-ish
          }
          if (t.includes('landslide') || t.includes('mudslide')) {
            return 'M-4,4 L4,4 L0,-4 Z M-2,0 L2,0'; // Slope with debris
          }
          if (t.includes('tsunami')) {
            return 'M-4,4 Q-2,-4 0,0 Q2,4 4,-4'; // Big wave
          }
          return 'M-3,-3 L3,3 M-3,3 L3,-3'; // Default X
        };

        const markers = crisisLayer.selectAll('.marker').data(visibleCrises, (d: any) => d.id);

        const markersEnter = markers.enter().append('g').attr('class', 'marker');
        
        // Vertical line (pin stem)
        markersEnter.append('line').attr('class', 'pin-stem');
        
        // Circular badge (pin head)
        markersEnter.append('circle').attr('class', 'pin-badge');
        
        // Icon path
        markersEnter.append('path').attr('class', 'pin-icon');
        
        // Large Invisible Hit Area
        markersEnter.append('circle').attr('class', 'hit-area')
          .attr('r', 15)
          .attr('fill', 'transparent')
          .style('cursor', 'pointer')
          .on('click', (e, d) => {
            e.stopPropagation();
            onCrisisSelect?.(d);
          });

        const markersUpdate = markersEnter.merge(markers as any);

        markersUpdate.each(function(d) {
          const p = projection([d.lng, d.lat]);
          if (p) {
            const color = d.severity === 'RED' ? '#ef4444' : d.severity === 'ORANGE' ? '#f97316' : '#22c55e';
            const g = select(this);
            
            // Scale markers based on zoom level
            const zoomFactor = Math.sqrt(scaleRef.current / 250);
            const pinHeight = 18 * zoomFactor;
            const badgeRadius = 8 * zoomFactor;
            const iconScale = 1.2 * zoomFactor;
            
            // Stem
            g.select('.pin-stem')
              .attr('x1', p[0])
              .attr('y1', p[1])
              .attr('x2', p[0])
              .attr('y2', p[1] - pinHeight)
              .attr('stroke', color)
              .attr('stroke-width', 1.5 * zoomFactor)
              .attr('opacity', 0.8);
            
            // Badge
            g.select('.pin-badge')
              .attr('cx', p[0])
              .attr('cy', p[1] - pinHeight)
              .attr('r', badgeRadius)
              .attr('fill', theme === 'dark' ? '#000' : '#fff')
              .attr('stroke', color)
              .attr('stroke-width', 1.5 * zoomFactor)
              .attr('opacity', 1);
            
            // Icon
            g.select('.pin-icon')
              .attr('d', getIconPath(d.type))
              .attr('transform', `translate(${p[0]}, ${p[1] - pinHeight}) scale(${iconScale})`)
              .attr('fill', 'none')
              .attr('stroke', color)
              .attr('stroke-width', 1.2)
              .attr('stroke-linecap', 'round')
              .attr('stroke-linejoin', 'round')
              .attr('opacity', 1);
            
            g.select('.hit-area')
              .attr('cx', p[0])
              .attr('cy', p[1] - pinHeight)
              .attr('r', 15 * zoomFactor);
          }
        });

        markers.exit().remove();

        frameId = requestAnimationFrame(render);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Render error");
      }
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [geoData, rotationSpeed, activeCrises, onCrisisSelect, theme]);

  return (
    <div className={`relative flex items-center justify-center w-full aspect-square group transition-colors duration-500 ${
      theme === 'dark' ? 'bg-transparent' : 'bg-transparent'
    }`}>
      {/* Status indicator removed as requested */}
      
      {!geoData && !error && (
        <div className={`absolute inset-0 flex items-center justify-center z-10 backdrop-blur-sm ${theme === 'dark' ? 'bg-black/80' : 'bg-white/80'}`}>
          <div className="flex flex-col items-center gap-2">
            <div className={`w-8 h-8 border-2 rounded-full animate-spin ${
              theme === 'dark' ? 'border-orange-500/20 border-t-orange-500' : 'border-stone-200 border-t-stone-800'
            }`} />
            <p className={`text-[10px] animate-pulse font-mono uppercase tracking-widest ${theme === 'dark' ? 'text-orange-500' : 'text-stone-600'}`}>INITIALIZING GEODATA...</p>
          </div>
        </div>
      )}

      {error && (
        <div className={`absolute inset-0 flex items-center justify-center z-20 p-4 text-center ${theme === 'dark' ? 'bg-neutral-950/90' : 'bg-stone-50/90'}`}>
          <p className="text-[10px] text-red-500 font-mono font-bold uppercase tracking-widest">ERROR SYSTEM FAILURE: {error}</p>
        </div>
      )}

      {!geoData && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw size={24} className="animate-spin text-orange-500/50" />
            <p className="text-[10px] uppercase tracking-widest opacity-50">Syncing Map Data...</p>
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        width="600"
        height="600"
        viewBox="0 0 600 600"
        className="w-full h-full cursor-grab active:cursor-grabbing transition-opacity duration-1000 overflow-visible"
        style={{ opacity: geoData ? 1 : 0 }}
      />

      {/* Radial glow */}
      <div className={`absolute inset-0 pointer-events-none ${
        theme === 'dark' 
          ? 'bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.08)_0%,transparent_70%)]' 
          : 'bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.02)_0%,transparent_70%)]'
      }`} />
    </div>
  );
};
