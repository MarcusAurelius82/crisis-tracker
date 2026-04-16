import React, { useEffect, useRef, useState } from 'react';
import { select, geoOrthographic, geoPath, geoGraticule, geoDistance, json, zoom, zoomIdentity } from 'd3';
import { RefreshCw } from 'lucide-react';
import { Crisis } from '../types';

interface GlobeProps {
  rotationSpeed?: number;
  onCrisisSelect?: (crisis: Crisis | null) => void;
  activeCrises: Crisis[];
  theme?: 'dark' | 'light';
  showFamineOverlay: boolean;
}

interface IpcEntry {
  phase: number;
  dateOfAnalysis: string;
  populationAnalyzed: number;
  phase3Plus: number;
  phase3PlusPct: number;
  phase1: number; phase1Pct: number;
  phase2: number; phase2Pct: number;
  phase3: number; phase3Pct: number;
  phase4: number; phase4Pct: number;
  phase5: number; phase5Pct: number;
}

const PHASE_COLORS: Record<number, string> = {
  1: '#d4f0a0',
  2: '#f9e04b',
  3: '#e8852a',
  4: '#c0302b',
  5: '#7a1428',
};

// Plain-English labels for everyday readers
const PHASE_LABELS: Record<number, string> = {
  1: 'Well-fed',
  2: 'At risk',
  3: 'Food crisis',
  4: 'Acute hunger',
  5: 'Famine',
};

// One-line summary headline keyed to worst phase present
const SITUATION_HEADLINE: Record<number, string> = {
  1: 'Food situation is largely stable',
  2: 'Some people are struggling to get enough food',
  3: 'A food crisis is underway — people urgently need help',
  4: 'Emergency hunger — people are acutely starving',
  5: 'Famine — catastrophic starvation is occurring',
};

function formatPop(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

export const Globe: React.FC<GlobeProps> = ({
  rotationSpeed = 0.02,
  activeCrises = [],
  onCrisisSelect,
  theme = 'dark',
  showFamineOverlay = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const rotationRef = useRef<[number, number, number]>([0, -30, 0]);
  const scaleRef = useRef<number>(250);
  const isInteracting = useRef(false);
  const lastInteractionTime = useRef(0);
  const activeCrisesRef = useRef(activeCrises);
  const onCrisisSelectRef = useRef(onCrisisSelect);
  const showFamineOverlayRef = useRef(showFamineOverlay);
  const ipcDataRef = useRef<Record<string, IpcEntry>>({});
  const hidePopupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInteractedRef = useRef(false);

  const [ipcPopup, setIpcPopup] = useState<{
    iso3: string;
    name: string;
    entry: IpcEntry;
    x: number;
    y: number;
  } | null>(null);

  // Keep refs in sync with props
  useEffect(() => { activeCrisesRef.current = activeCrises; }, [activeCrises]);
  useEffect(() => { onCrisisSelectRef.current = onCrisisSelect; }, [onCrisisSelect]);
  useEffect(() => { showFamineOverlayRef.current = showFamineOverlay; }, [showFamineOverlay]);
  useEffect(() => { if (!showFamineOverlay) setIpcPopup(null); }, [showFamineOverlay]);

  // Load GeoJSON once
  useEffect(() => {
    const worldUrl = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
    json(worldUrl)
      .then(data => setGeoData(data))
      .catch(err => {
        console.error("Error loading GeoJSON:", err);
        setGeoData({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: { ISO_A3: "FALLBACK", NAME: "Fallback Land" },
            geometry: {
              type: "Polygon",
              coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]]
            }
          }]
        });
        setError("Map data sync failed. Using low-res fallback.");
      });
  }, []);

  // Fetch and parse IPC CSV on mount
  useEffect(() => {
    fetch('/ipc.csv')
      .then(res => res.text())
      .then(text => {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return;
        const headers = lines[0].split(',');
        const idx = (name: string) => headers.indexOf(name);
        const f = (cols: string[], i: number) => parseFloat(cols[i]) || 0;

        const lookup: Record<string, IpcEntry> = {};
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',');
          const iso3 = cols[idx('Country')]?.trim();
          if (!iso3) continue;
          const p5 = f(cols, idx('Phase 5 number current'));
          const p4 = f(cols, idx('Phase 4 number current'));
          const p3 = f(cols, idx('Phase 3 number current'));
          const p2 = f(cols, idx('Phase 2 number current'));
          let phase = 1;
          if (p5 > 0) phase = 5;
          else if (p4 > 0) phase = 4;
          else if (p3 > 0) phase = 3;
          else if (p2 > 0) phase = 2;

          lookup[iso3] = {
            phase,
            dateOfAnalysis: cols[idx('Date of analysis')]?.trim() || '',
            populationAnalyzed: f(cols, idx('Population analyzed current')),
            phase3Plus: f(cols, idx('Phase 3+ number current')),
            phase3PlusPct: f(cols, idx('Phase 3+ percentage current')),
            phase1: f(cols, idx('Phase 1 number current')),
            phase1Pct: f(cols, idx('Phase 1 percentage current')),
            phase2: p2, phase2Pct: f(cols, idx('Phase 2 percentage current')),
            phase3: p3, phase3Pct: f(cols, idx('Phase 3 percentage current')),
            phase4: p4, phase4Pct: f(cols, idx('Phase 4 percentage current')),
            phase5: p5, phase5Pct: f(cols, idx('Phase 5 percentage current')),
          };
        }
        ipcDataRef.current = lookup;
      })
      .catch(err => console.error("Error loading IPC data:", err));
  }, []);

  // Animation and Render loop — only restarts when geoData, rotationSpeed, or theme changes
  useEffect(() => {
    if (!svgRef.current || !geoData) return;

    const width = 600;
    const height = 600;
    const svg = select(svgRef.current);

    const projection = geoOrthographic()
      .scale(250)
      .translate([width / 2, height / 2])
      .clipAngle(90);

    const path = geoPath(projection);
    const graticule = geoGraticule();

    const sphereLayer = svg.selectAll('.sphere').data([null]).join('path').attr('class', 'sphere');
    const graticuleLayer = svg.selectAll('.graticule').data([null]).join('path').attr('class', 'graticule');
    const landLayer = svg.selectAll('.land').data([null]).join('g').attr('class', 'land');
    const ipcLayer = svg.selectAll('.ipc').data([null]).join('g').attr('class', 'ipc');
    const crisisLayer = svg.selectAll('.crises').data([null]).join('g').attr('class', 'crises');

    let prevX = 0;
    let prevY = 0;
    let prevK = scaleRef.current;

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([150, 5000])
      .on('start', (event) => {
        isInteracting.current = true;
        hasInteractedRef.current = true;
        lastInteractionTime.current = Date.now();
        prevX = event.transform.x;
        prevY = event.transform.y;
        prevK = event.transform.k;
      })
      .on('zoom', (event) => {
        lastInteractionTime.current = Date.now();
        const dx = event.transform.x - prevX;
        const dy = event.transform.y - prevY;
        const scaleDelta = Math.abs(event.transform.k - prevK);

        // Only rotate on drag (not pinch — pinch changes scale significantly)
        if (scaleDelta < 1) {
          const sensitivity = 0.25 * (250 / scaleRef.current);
          rotationRef.current[0] += dx * sensitivity;
          rotationRef.current[1] -= dy * sensitivity;
          rotationRef.current[1] = Math.max(-90, Math.min(90, rotationRef.current[1]));
        }

        scaleRef.current = event.transform.k;
        prevX = event.transform.x;
        prevY = event.transform.y;
        prevK = event.transform.k;
      })
      .on('end', () => {
        isInteracting.current = false;
        lastInteractionTime.current = Date.now();
      });

    svg.call(zoomBehavior as any);
    svg.call(zoomBehavior.transform as any, zoomIdentity.translate(0, 0).scale(scaleRef.current));

    // IPC hover popup — added after zoom setup so namespace doesn't clash
    svg
      .on('mousemove.ipc', (event) => {
        if (!showFamineOverlayRef.current) return;
        if (hidePopupTimerRef.current) {
          clearTimeout(hidePopupTimerRef.current);
          hidePopupTimerRef.current = null;
        }
        const d = select(event.target as Element).datum() as any;
        const iso3 = d?.properties?.ISO_A3;
        const entry = iso3 ? ipcDataRef.current[iso3] : null;
        if (!entry) {
          // Debounce hide so moving between adjacent IPC countries doesn't flicker
          hidePopupTimerRef.current = setTimeout(() => setIpcPopup(null), 120);
          return;
        }
        const name = d.properties?.NAME || d.properties?.ADMIN || iso3;
        setIpcPopup({ iso3, name, entry, x: event.clientX, y: event.clientY });
      })
      .on('mouseleave.ipc', () => {
        if (hidePopupTimerRef.current) clearTimeout(hidePopupTimerRef.current);
        setIpcPopup(null);
      })
      .on('touchstart.ipc', (event) => {
        if (!showFamineOverlayRef.current) return;
        const touch = event.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const d = el ? (select(el).datum() as any) : null;
        const iso3 = d?.properties?.ISO_A3;
        const entry = iso3 ? ipcDataRef.current[iso3] : null;
        if (!entry) { setIpcPopup(null); return; }
        const name = d.properties?.NAME || d.properties?.ADMIN || iso3;
        // Tap same country again to dismiss; tap different country to switch
        setIpcPopup(prev =>
          prev?.iso3 === iso3 ? null : { iso3, name, entry, x: touch.clientX, y: touch.clientY }
        );
      });

    let frameId: number;

    const render = () => {
      try {
        if (!isInteracting.current && !hasInteractedRef.current) {
          rotationRef.current[0] += rotationSpeed;
        }

        projection.rotate(rotationRef.current);
        projection.scale(scaleRef.current);

        sphereLayer
          .datum({ type: 'Sphere' })
          .attr('d', path as any)
          .attr('fill', theme === 'dark' ? '#000' : '#fff')
          .attr('stroke', theme === 'dark' ? 'rgba(249,115,22,0.3)' : 'rgba(0,0,0,0.2)')
          .attr('stroke-width', theme === 'dark' ? 1.5 : 2.5);

        graticuleLayer
          .datum(graticule())
          .attr('d', path as any)
          .attr('fill', 'none')
          .attr('stroke', theme === 'dark' ? 'rgba(249,115,22,0.15)' : 'rgba(0,0,0,0.1)')
          .attr('stroke-width', theme === 'dark' ? 0.5 : 1.0);

        landLayer
          .selectAll('path')
          .data(geoData.features)
          .join('path')
          .attr('d', path as any)
          .attr('fill', theme === 'dark' ? 'rgba(249,115,22,0.02)' : 'rgba(0,0,0,0.02)')
          .attr('stroke', theme === 'dark' ? 'rgba(249,115,22,0.5)' : 'rgba(0,0,0,0.4)')
          .attr('stroke-width', theme === 'dark' ? 0.8 : 1.5);

        // IPC choropleth — fill:none on countries without data removes them from hit-testing,
        // so event.target on svg mousemove falls through to the landLayer path below (same datum).
        ipcLayer
          .selectAll('path')
          .data(geoData.features)
          .join('path')
          .attr('d', path as any)
          .attr('fill', (d: any) => {
            if (!showFamineOverlayRef.current) return 'none';
            const iso3 = d.properties?.ISO_A3;
            const entry = ipcDataRef.current[iso3];
            return entry ? PHASE_COLORS[entry.phase] : 'none';
          })
          .attr('fill-opacity', 0.4)
          .attr('stroke', 'none');

        // Use ref so this doesn't break the render loop when crises update
        const visibleCrises = activeCrisesRef.current.filter(crisis => {
          const p = projection([crisis.lng, crisis.lat]);
          if (!p) return false;
          const center: [number, number] = [-rotationRef.current[0], -rotationRef.current[1]];
          const distance = geoDistance([crisis.lng, crisis.lat], center);
          return distance < Math.PI / 2;
        });

        const getIconPath = (type: string) => {
          const t = type.toLowerCase();
          if (t.includes('earthquake') || t === 'eq') return 'M-4,0 L-2,4 L0,-4 L2,4 L4,0';
          if (t.includes('flood') || t === 'fl') return 'M-4,2 Q0,-2 4,2 M-4,-2 Q0,-6 4,-2';
          if (t.includes('cyclone') || t.includes('storm') || t.includes('hurricane') || t === 'tc') return 'M0,-4 A4,4 0 1,1 -4,0 M0,4 A4,4 0 1,1 4,0';
          if (t.includes('wildfire') || t === 'wf') return 'M0,4 C-2,2 -4,0 -2,-2 C-1,-3 0,-5 0,-5 C0,-5 1,-3 2,-2 C4,0 2,2 0,4 Z';
          if (t.includes('volcano') || t === 'vo') return 'M-4,4 L0,-4 L4,4 M-1,-1 L1,-1';
          if (t.includes('drought') || t === 'dr') return 'M0,-4 L0,4 M-4,0 L4,0 M-3,-3 L3,3 M-3,3 L3,-3';
          if (t.includes('epidemic') || t.includes('health') || t === 'ep') return 'M-3,0 A3,3 0 1,1 3,0 A3,3 0 1,1 -3,0 M0,-4 L0,4 M-4,0 L4,0';
          if (t.includes('landslide') || t.includes('mudslide')) return 'M-4,4 L4,4 L0,-4 Z M-2,0 L2,0';
          if (t.includes('tsunami')) return 'M-4,4 Q-2,-4 0,0 Q2,4 4,-4';
          return 'M-3,-3 L3,3 M-3,3 L3,-3';
        };

        const markers = crisisLayer.selectAll('.marker').data(visibleCrises, (d: any) => d.id);
        const markersEnter = markers.enter().append('g').attr('class', 'marker');

        markersEnter.append('line').attr('class', 'pin-stem');
        markersEnter.append('circle').attr('class', 'pin-badge');
        markersEnter.append('path').attr('class', 'pin-icon');
        markersEnter.append('circle').attr('class', 'hit-area')
          .attr('r', 15)
          .attr('fill', 'transparent')
          .style('cursor', 'pointer')
          .on('click', (e, d) => {
            e.stopPropagation();
            onCrisisSelectRef.current?.(d);
          });

        const markersUpdate = markersEnter.merge(markers as any);

        markersUpdate.each(function(d) {
          const p = projection([d.lng, d.lat]);
          if (p) {
            const color = d.severity === 'RED' ? '#ef4444' : d.severity === 'ORANGE' ? '#f97316' : '#22c55e';
            const g = select(this);
            const zoomFactor = Math.sqrt(scaleRef.current / 250);
            const pinHeight = 18 * zoomFactor;
            const badgeRadius = 8 * zoomFactor;
            const iconScale = 1.2 * zoomFactor;

            g.select('.pin-stem')
              .attr('x1', p[0]).attr('y1', p[1])
              .attr('x2', p[0]).attr('y2', p[1] - pinHeight)
              .attr('stroke', color).attr('stroke-width', 1.5 * zoomFactor).attr('opacity', 0.8);

            g.select('.pin-badge')
              .attr('cx', p[0]).attr('cy', p[1] - pinHeight).attr('r', badgeRadius)
              .attr('fill', theme === 'dark' ? '#000' : '#fff')
              .attr('stroke', color).attr('stroke-width', 1.5 * zoomFactor).attr('opacity', 1);

            g.select('.pin-icon')
              .attr('d', getIconPath(d.type))
              .attr('transform', `translate(${p[0]}, ${p[1] - pinHeight}) scale(${iconScale})`)
              .attr('fill', 'none').attr('stroke', color)
              .attr('stroke-width', 1.2).attr('stroke-linecap', 'round')
              .attr('stroke-linejoin', 'round').attr('opacity', 1);

            g.select('.hit-area')
              .attr('cx', p[0]).attr('cy', p[1] - pinHeight).attr('r', 15 * zoomFactor);
          }
        });

        markers.exit().remove();
        frameId = requestAnimationFrame(render);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Render error");
      }
    };

    frameId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frameId);
      if (hidePopupTimerRef.current) clearTimeout(hidePopupTimerRef.current);
    };
  }, [geoData, rotationSpeed, theme]); // removed activeCrises and onCrisisSelect — handled via refs

  // Compute popup screen position, keeping it within viewport
  const popupPos = ipcPopup ? (() => {
    const popW = 272;
    const popH = 260;
    let left = ipcPopup.x + 18;
    let top = ipcPopup.y + 18;
    if (left + popW > window.innerWidth - 8) left = ipcPopup.x - popW - 18;
    if (top + popH > window.innerHeight - 8) top = ipcPopup.y - popH - 18;
    return { left: Math.max(8, left), top: Math.max(8, top) };
  })() : null;

  return (
    <div className={`relative flex items-center justify-center w-full aspect-square group transition-colors duration-500 ${
      theme === 'dark' ? 'bg-transparent' : 'bg-transparent'
    }`}>
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
        style={{ opacity: geoData ? 1 : 0, touchAction: 'none' }}
      />

      <div className={`absolute inset-0 pointer-events-none ${
        theme === 'dark'
          ? 'bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.08)_0%,transparent_70%)]'
          : 'bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.02)_0%,transparent_70%)]'
      }`} />

      {/* IPC country popup — fixed so it escapes any overflow:hidden ancestors */}
      {ipcPopup && popupPos && (
        <div
          className={`fixed z-[70] backdrop-blur-md border rounded shadow-xl p-3.5 w-[272px] font-mono text-left ${
            theme === 'dark'
              ? 'bg-black/92 border-orange-500/30'
              : 'bg-white/96 border-stone-300 shadow-stone-300/40'
          }`}
          style={{ left: popupPos.left, top: popupPos.top }}
        >
          {/* Country name + close */}
          <div className="flex justify-between items-start mb-1.5">
            <div className="min-w-0 pr-2">
              <div className={`text-xs font-bold uppercase tracking-wider truncate ${
                theme === 'dark' ? 'text-orange-400' : 'text-stone-900'
              }`}>{ipcPopup.name}</div>
              <div className={`text-[10px] opacity-40`}>Food security · {ipcPopup.entry.dateOfAnalysis}</div>
            </div>
            <button
              onClick={() => setIpcPopup(null)}
              className={`text-[13px] shrink-0 opacity-40 hover:opacity-100 transition-opacity ${
                theme === 'dark' ? 'text-orange-300' : 'text-stone-600'
              }`}
            >
              ✕
            </button>
          </div>

          {ipcPopup.entry.populationAnalyzed > 0 ? (
            <>
              {/* Situation headline */}
              <div
                className="px-2.5 py-2 rounded mb-3 leading-snug"
                style={{
                  background: `${PHASE_COLORS[ipcPopup.entry.phase]}18`,
                  borderLeft: `3px solid ${PHASE_COLORS[ipcPopup.entry.phase]}`,
                }}
              >
                <div
                  className="text-[11px] font-bold mb-0.5"
                  style={{ color: PHASE_COLORS[ipcPopup.entry.phase] }}
                >
                  {SITUATION_HEADLINE[ipcPopup.entry.phase]}
                </div>
                {ipcPopup.entry.phase3Plus > 0 && (
                  <div className={`text-[11px] ${theme === 'dark' ? 'text-white/70' : 'text-stone-700'}`}>
                    <span className="font-bold">{formatPop(ipcPopup.entry.phase3Plus)}</span>
                    {' '}people ({(ipcPopup.entry.phase3PlusPct * 100).toFixed(0)}%) need food assistance
                  </div>
                )}
              </div>

              {/* Per-phase breakdown */}
              <div className={`text-[10px] uppercase tracking-widest mb-1.5 ${theme === 'dark' ? 'opacity-30' : 'opacity-40'}`}>
                How the population is doing
              </div>
              <div className="space-y-1.5">
                {([1, 2, 3, 4, 5] as const).map(p => {
                  const num = ipcPopup.entry[`phase${p}` as 'phase1' | 'phase2' | 'phase3' | 'phase4' | 'phase5'];
                  const pct = (num / ipcPopup.entry.populationAnalyzed) * 100;
                  // Divider before the "needs help" phases
                  const divider = p === 3 ? (
                    <div key="divider" className={`text-[9px] uppercase tracking-widest pt-1 pb-0.5 ${theme === 'dark' ? 'opacity-25' : 'opacity-35'}`}>
                      ↓ need food help
                    </div>
                  ) : null;
                  return (
                    <React.Fragment key={p}>
                      {divider}
                      <div className="flex items-center gap-1.5">
                        <div className={`w-[76px] text-[10px] shrink-0 ${theme === 'dark' ? 'opacity-60' : 'opacity-70'}`}>
                          {PHASE_LABELS[p]}
                        </div>
                        <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-white/5' : 'bg-stone-100'}`}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(100, pct)}%`, background: PHASE_COLORS[p] }}
                          />
                        </div>
                        <div className={`w-8 text-[10px] text-right shrink-0 tabular-nums ${theme === 'dark' ? 'opacity-50' : 'opacity-60'}`}>
                          {pct.toFixed(0)}%
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              <div className={`mt-2.5 text-[10px] ${theme === 'dark' ? 'opacity-25' : 'opacity-35'}`}>
                Survey covered {formatPop(ipcPopup.entry.populationAnalyzed)} people
              </div>
            </>
          ) : (
            <div className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'opacity-40' : 'opacity-50'}`}>
              No current-period survey data available for this country.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
