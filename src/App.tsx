import React, { useState, useEffect, useCallback } from 'react';
import { Globe } from './components/Globe';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Crosshair, 
  Shield, 
  BarChart3, 
  Terminal, 
  Cpu, 
  RefreshCw, 
  Scan,
  ExternalLink,
  Clock,
  MapPin,
  Sun,
  Moon,
  Flame,
  Waves,
  Wind,
  Mountain,
  Biohazard,
  Radio,
  Focus,
  X
} from 'lucide-react';
import { Crisis } from './types';

export default function App() {
  const [time, setTime] = useState(new Date());
  const [crises, setCrises] = useState<Crisis[]>([]);
  const [selectedCrisis, setSelectedCrisis] = useState<Crisis | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [logs, setLogs] = useState<{msg: string; time: Date}[]>([
    {msg: 'Initializing monitoring systems...', time: new Date()},
    {msg: 'Connecting to GDACS...', time: new Date()},
    {msg: 'Connecting to ReliefWeb...', time: new Date()}
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'MAJOR_CRITICAL'>('ALL');
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [systemStatus, setSystemStatus] = useState<'OPERATIONAL' | 'WARNING' | 'CRITICAL'>('OPERATIONAL');
  const [expanded, setExpanded] = useState({
    alerts: false,
    logs: false,
    feed: false,
    metrics: false
  });

  const accentHex = theme === 'dark' ? '#f97316' : '#ea580c';

  const addLog = useCallback((message: string) => {
    setLogs(prev => [{msg: message, time: new Date()}, ...prev].slice(0, 50));
  }, []);

  const fetchCrises = useCallback(async () => {
    setLoading(true);
    addLog('Refreshing global crisis data...');
    try {
      const [gdacsRes, reliefRes] = await Promise.all([
        fetch('/api/gdacs'),
        fetch('/api/reliefweb')
      ]);

      let allCrises: Crisis[] = [];

      if (gdacsRes.ok) {
        const gdacsData = await gdacsRes.json();
        if (gdacsData.features) {
          const mapped = gdacsData.features
            .filter((f: any) => f.geometry && f.geometry.coordinates)
            .map((f: any) => ({
              id: `gdacs-${f.properties.eventid}`,
              title: f.properties.eventname,
              type: f.properties.eventtype,
              severity: f.properties.alertlevel === 'Red' ? 'RED' : f.properties.alertlevel === 'Orange' ? 'ORANGE' : 'GREEN',
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
              date: f.properties.fromdate,
              description: f.properties.description,
              source: 'GDACS',
              url: f.properties.url?.report || `https://www.gdacs.org/report.aspx?eventid=${f.properties.eventid}&eventtype=${f.properties.eventtype}`
            }));
          allCrises = [...allCrises, ...mapped];
        }
      }

      if (reliefRes.ok) {
        const reliefData = await reliefRes.json();
        if (reliefData.data) {
          const mapped = reliefData.data
            .filter((d: any) => d.fields && d.fields.primary_country && d.fields.primary_country.location)
            .map((d: any) => ({
              id: `rw-${d.id}`,
              title: d.fields.name,
              type: d.fields.primary_type?.name || 'Disaster',
              severity: d.fields.status === 'alert' ? 'RED' : 'ORANGE',
              lat: d.fields.primary_country.location.lat,
              lng: d.fields.primary_country.location.lon,
              date: d.fields.date?.created || new Date().toISOString(),
              description: d.fields.description,
              source: 'ReliefWeb',
              url: d.fields.url
            }));
          allCrises = [...allCrises, ...mapped];
        }
      }

      console.log('Mapped Crises:', allCrises);
      if (allCrises.length === 0) {
        console.warn('No crises found in GDACS or ReliefWeb. Using simulated data for visualization.');
        addLog('WARNING: Live data unavailable. Initializing simulation mode.');
        
        // Mock data fallback
        const mockCrises: Crisis[] = [
          {
            id: 'mock-1',
            title: 'Simulated Seismic Activity - Pacific Ring of Fire',
            type: 'Earthquake',
            severity: 'RED',
            lat: 35.6762,
            lng: 139.6503,
            date: new Date().toISOString(),
            description: 'Simulated high-magnitude event for system testing.',
            source: 'SIMULATION',
            url: '#'
          },
          {
            id: 'mock-2',
            title: 'Simulated Tropical Cyclone - North Atlantic',
            type: 'Cyclone',
            severity: 'ORANGE',
            lat: 25.7617,
            lng: -80.1918,
            date: new Date().toISOString(),
            description: 'Simulated storm system for visualization verification.',
            source: 'SIMULATION',
            url: '#'
          },
          {
            id: 'mock-3',
            title: 'Simulated Wildfire - Mediterranean Basin',
            type: 'Wildfire',
            severity: 'RED',
            lat: 37.9838,
            lng: 23.7275,
            date: new Date().toISOString(),
            description: 'Simulated rapid-spread wildfire event.',
            source: 'SIMULATION',
            url: '#'
          },
          {
            id: 'mock-4',
            title: 'Simulated Flood Event - Southeast Asia',
            type: 'Flood',
            severity: 'ORANGE',
            lat: 13.7563,
            lng: 100.5018,
            date: new Date().toISOString(),
            description: 'Simulated monsoon-related flooding.',
            source: 'SIMULATION',
            url: '#'
          }
        ];
        allCrises = mockCrises;
      }
      
      setCrises(allCrises);
      addLog(`Sync complete. ${allCrises.length} events active.`);
      
      const redAlerts = allCrises.filter(c => c.severity === 'RED').length;
      setSystemStatus(redAlerts > 5 ? 'CRITICAL' : redAlerts > 0 ? 'WARNING' : 'OPERATIONAL');
    } catch (error) {
      console.error('Fetch error:', error);
      addLog('ERROR: Data synchronization failed.');
      setSystemStatus('CRITICAL');
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  useEffect(() => {
    fetchCrises();
    const interval = setInterval(fetchCrises, 300000); // 5 mins
    return () => clearInterval(interval);
  }, [fetchCrises]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleExpanded = (panel: keyof typeof expanded) => {
    setExpanded(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  const filteredCrises = crises.filter(c => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = c.title.toLowerCase().includes(searchLower) ||
                         c.type.toLowerCase().includes(searchLower) ||
                         (searchLower === 'critical' && c.severity === 'RED') ||
                         (searchLower === 'major' && c.severity === 'ORANGE') ||
                         (searchLower === 'minor' && c.severity === 'GREEN');
    const matchesSeverity = filterSeverity === 'ALL' || (filterSeverity === 'MAJOR_CRITICAL' && (c.severity === 'RED' || c.severity === 'ORANGE'));
    const matchesType = filterTypes.length === 0 || filterTypes.includes(c.type);
    return matchesSearch && matchesSeverity && matchesType;
  });

  const crisisTypes: string[] = Array.from<string>(new Set(crises.map(c => c.type))).sort();

  const toggleTypeFilter = (type: string) => {
    setFilterTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  return (
    <div className={`h-screen flex flex-col font-mono selection:bg-orange-500 selection:text-black relative transition-colors duration-500 ${
      theme === 'dark' ? 'bg-neutral-950 text-orange-500' : 'bg-stone-50 text-stone-900'
    }`}>
      {/* HUD Scanlines */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.05]" 
           style={{ background: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${accentHex} 3px)` }} />
      <div className={`fixed inset-0 pointer-events-none z-50 ${
        theme === 'dark' 
          ? 'bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)]' 
          : 'bg-[radial-gradient(circle_at_center,transparent_0%,rgba(255,255,255,0.4)_100%)]'
      }`} />
      
      {/* Header */}
      <header className={`border-b p-4 flex justify-between items-center z-40 backdrop-blur-md transition-colors ${
        theme === 'dark' ? 'border-orange-900/50 bg-black/40' : 'border-stone-200 bg-white/70'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded border ${
            theme === 'dark' ? 'bg-orange-500/10 border-orange-500/20' : 'bg-stone-100 border-stone-200'
          }`}>
            <Crosshair 
              size={20} 
              className={
                systemStatus === 'CRITICAL' 
                  ? 'text-red-500 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' 
                  : theme === 'dark' 
                    ? 'text-orange-500 drop-shadow-[0_0_8px_#f9731680]' 
                    : 'text-stone-600'
              } 
            />
          </div>
          <div>
            <h1 className={`font-bold tracking-tighter text-xl ${theme === 'dark' ? 'text-orange-400' : 'text-stone-900'}`}>Crisis Tracker</h1>
            <p className="text-[11px] tracking-[0.3em] opacity-50 uppercase">Global Monitoring System</p>
          </div>
          <div className={`h-8 w-px mx-2 hidden sm:block ${theme === 'dark' ? 'bg-orange-900/30' : 'bg-stone-200'}`} />
          <div className="hidden md:flex flex-col">
            <span className="text-[11px] opacity-50 uppercase">System Status</span>
            <span className={`text-xs font-bold flex items-center gap-1 ${
              systemStatus === 'CRITICAL' ? 'text-red-500' : 
              theme === 'dark' ? 'text-orange-500' : 'text-orange-600'
            }`}>
              <Radio size={10} className={systemStatus === 'CRITICAL' ? 'animate-ping' : ''} />
              {systemStatus}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`p-2 rounded-full border transition-all ${
              theme === 'dark' 
                ? 'border-orange-500/20 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20' 
                : 'border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-[11px] opacity-50 uppercase">Active Events</span>
            <span className="text-sm font-bold">{crises.length}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[11px] opacity-50 uppercase tracking-widest">Current Time (UTC)</span>
            <span className="text-sm font-bold tabular-nums">{time.toISOString().split('T')[1].split('.')[0]}</span>
          </div>
        </div>
      </header>

      <main className={`flex-1 flex flex-col gap-2 sm:gap-0 sm:block relative overflow-y-auto sm:overflow-hidden min-h-0 transition-colors duration-500 ${theme === 'dark' ? 'bg-neutral-950' : 'bg-stone-50'}`}>
        {/* Globe Container - Middle on Mobile, Full Screen on Desktop */}
        <div className="order-3 sm:order-none h-[350px] sm:h-auto sm:flex-1 flex items-center justify-center relative sm:absolute sm:inset-0 sm:pointer-events-none">
          <div className="w-[min(85vw,85vh,800px)] aspect-square relative pointer-events-auto">
            <Globe 
              activeCrises={filteredCrises} 
              onCrisisSelect={setSelectedCrisis}
              rotationSpeed={0.01}
              theme={theme}
            />
          </div>
        </div>

        {/* Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.05] transition-opacity duration-500 hidden sm:block" 
             style={{ backgroundImage: `radial-gradient(${accentHex} 1px, transparent 1px)`, backgroundSize: '30px 30px' }} />

        {/* Corner 1: Top Left - Critical Alerts */}
        <div 
          className={`order-1 sm:order-none relative sm:absolute sm:top-6 sm:left-6 mx-4 mt-4 sm:mx-0 sm:mt-0 sm:w-72 backdrop-blur-md border rounded flex flex-col overflow-hidden z-20 transition-all duration-500 ${
            expanded.alerts ? 'sm:max-h-[40%]' : 'sm:max-h-[56px]'
          } ${theme === 'dark' ? 'bg-black/60 border-red-500/20' : 'bg-white/80 border-red-200 shadow-sm'}`}
        >
          <div 
            className="w-full flex justify-between items-center p-4 cursor-pointer shrink-0 select-none"
            onClick={() => toggleExpanded('alerts')}
          >
            <h2 className="text-xs font-bold text-red-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <Biohazard size={12} /> Critical Alerts
            </h2>
            <div className={`text-[11px] opacity-50 transition-transform duration-300 ${expanded.alerts ? 'rotate-180' : ''}`}>
              ▼
            </div>
          </div>
          
          <AnimatePresence>
            {expanded.alerts && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex-1 overflow-y-auto custom-scrollbar space-y-2 px-4 pb-4"
              >
                {crises.filter(c => c.severity === 'RED').length > 0 ? (
                  crises.filter(c => c.severity === 'RED').map(crisis => (
                    <button 
                      key={crisis.id}
                      onClick={() => setSelectedCrisis(crisis)}
                      className={`w-full text-left p-3 border transition-colors min-h-[64px] flex flex-col justify-center ${
                        theme === 'dark' 
                          ? 'bg-red-500/5 border-red-500/10 hover:bg-red-500/10 text-red-400' 
                          : 'bg-red-50 border-red-100 hover:bg-red-100 text-red-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-bold leading-tight truncate">{crisis.title}</p>
                      </div>
                      <p className={`text-[11px] opacity-50 ${theme === 'dark' ? 'text-red-300/50' : 'text-red-600/50'}`}>{crisis.type} • {new Date(crisis.date).toLocaleDateString()}</p>
                    </button>
                  ))
                ) : (
                  <p className="text-[11px] opacity-30 italic">No Critical Alerts Detected</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Corner 2: Top Right - System Logs */}
        <div 
          className={`order-2 sm:order-none relative sm:absolute sm:top-6 sm:right-6 mx-4 mt-2 sm:mx-0 sm:mt-0 sm:w-72 backdrop-blur-md border rounded flex flex-col overflow-hidden z-20 transition-all duration-500 ${
            expanded.logs ? 'sm:max-h-[40%]' : 'sm:max-h-[56px]'
          } ${theme === 'dark' ? 'bg-black/60 border-orange-500/20' : 'bg-white/80 border-stone-200 shadow-sm'}`}
        >
          <div 
            className="w-full flex justify-between items-center p-4 cursor-pointer shrink-0 select-none"
            onClick={() => toggleExpanded('logs')}
          >
            <h2 className={`text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2 ${theme === 'dark' ? 'text-orange-500' : 'text-stone-600'}`}>
              <Terminal size={12} className={theme === 'dark' ? 'drop-shadow-[0_0_5px_#f9731660]' : ''} /> System Logs
            </h2>
            <div className={`text-[11px] opacity-50 transition-transform duration-300 ${expanded.logs ? 'rotate-180' : ''}`}>
              ▼
            </div>
          </div>
          
          <AnimatePresence>
            {expanded.logs && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex-1 overflow-y-auto custom-scrollbar space-y-1 text-[11px] leading-tight px-4 pb-4"
              >
                {logs.map((log, i) => (
                  <div key={i} className={`flex gap-2 ${i === 0 ? (theme === 'dark' ? 'text-orange-400' : 'text-orange-600') : 'opacity-40'}`}>
                    <span className="shrink-0">[{log.time.toLocaleTimeString([], { hour12: false })}]</span>
                    <span>{log.msg}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Corner 3: Bottom Left - Event Feed & Search */}
        <div 
          className={`order-4 sm:order-none relative sm:absolute sm:bottom-6 sm:left-6 mx-4 mt-4 sm:mx-0 sm:mt-0 sm:w-80 backdrop-blur-md border rounded flex flex-col overflow-hidden z-20 transition-all duration-500 ${
            expanded.feed ? 'sm:max-h-[45%]' : 'sm:max-h-[56px]'
          } ${theme === 'dark' ? 'bg-black/60 border-orange-500/20' : 'bg-white/80 border-stone-200 shadow-sm'}`}
        >
          <div 
            className="w-full flex justify-between items-center p-4 cursor-pointer shrink-0 select-none"
            onClick={() => toggleExpanded('feed')}
          >
            <h2 className={`text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2 ${theme === 'dark' ? 'text-orange-500' : 'text-stone-600'}`}>
              <Activity size={12} /> Event Feed
            </h2>
            <div className={`text-[11px] opacity-50 transition-transform duration-300 ${expanded.feed ? 'rotate-180' : ''}`}>
              ▼
            </div>
          </div>
          
          <AnimatePresence>
            {expanded.feed && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex flex-col px-4 pb-4 sm:flex-1 sm:overflow-hidden"
              >
                <div className="flex gap-2 mb-3">
                  <button 
                    onClick={() => setFilterSeverity('ALL')}
                    className={`flex-1 text-[11px] py-3 border rounded uppercase tracking-tighter transition-colors ${
                      filterSeverity === 'ALL' 
                        ? (theme === 'dark' ? 'bg-orange-500 text-black border-orange-500' : 'bg-stone-800 text-white border-stone-800')
                        : (theme === 'dark' ? 'bg-transparent border-orange-900/30 text-orange-500/50 hover:border-orange-500' : 'bg-transparent border-stone-200 text-stone-400 hover:border-stone-400')
                    }`}
                  >
                    ALL EVENTS
                  </button>
                  <button 
                    onClick={() => setFilterSeverity('MAJOR_CRITICAL')}
                    className={`flex-1 text-[11px] py-3 border rounded uppercase tracking-tighter transition-colors ${
                      filterSeverity === 'MAJOR_CRITICAL' 
                        ? (theme === 'dark' ? 'bg-red-500 text-white border-red-500' : 'bg-red-600 text-white border-red-600')
                        : (theme === 'dark' ? 'bg-transparent border-red-900/30 text-red-500/50 hover:border-red-500' : 'bg-transparent border-stone-200 text-stone-400 hover:border-stone-400')
                    }`}
                  >
                    MAJOR & CRITICAL
                  </button>
                </div>
                <div className="relative group mb-3">
                  <Scan className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-30" />
                  <input 
                    type="text" 
                    placeholder="FILTER EVENTS..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full border rounded py-3 pl-8 pr-2 text-xs focus:outline-none transition-colors uppercase tracking-widest ${
                      theme === 'dark' 
                        ? 'bg-orange-950/20 border-orange-900/30 focus:border-orange-500 text-orange-400' 
                        : 'bg-stone-50 border-stone-200 focus:border-orange-500 text-stone-900'
                    }`}
                  />
                </div>
                <div className="space-y-2 sm:flex-1 sm:overflow-y-auto custom-scrollbar">
                  {filteredCrises.map(crisis => (
                    <button 
                      key={crisis.id}
                      onClick={() => setSelectedCrisis(crisis)}
                      className={`w-full text-left p-3 border transition-colors min-h-[64px] flex flex-col justify-center ${
                        selectedCrisis?.id === crisis.id 
                          ? (theme === 'dark' ? 'bg-orange-500/20 border-orange-50' : 'bg-orange-50 border-orange-500')
                          : (theme === 'dark' ? 'bg-orange-500/5 border-orange-900/20 hover:bg-orange-500/10' : 'bg-white border-stone-100 hover:bg-stone-50')
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-[10px] font-bold px-1 rounded ${
                          crisis.severity === 'RED' ? 'bg-red-500 text-white' : 
                          crisis.severity === 'ORANGE' ? 'bg-orange-500 text-white' : 
                          'bg-orange-700 text-white'
                        }`}>{crisis.severity}</span>
                        <span className="text-[10px] opacity-30">{crisis.source}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={`text-xs font-bold leading-tight truncate ${theme === 'dark' ? 'text-orange-400' : 'text-stone-800'}`}>{crisis.title}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Corner 4: Bottom Right - Global Metrics */}
        <div 
          className={`order-5 sm:order-none relative sm:absolute sm:bottom-6 sm:right-6 mx-4 mt-2 mb-4 sm:mx-0 sm:mt-0 sm:mb-0 sm:w-80 backdrop-blur-md border rounded flex flex-col overflow-hidden z-20 transition-all duration-500 ${
            expanded.metrics ? 'sm:max-h-[45%]' : 'sm:max-h-[56px]'
          } ${theme === 'dark' ? 'bg-black/60 border-orange-500/20' : 'bg-white/80 border-stone-200 shadow-sm'}`}
        >
          <div 
            className="w-full flex justify-between items-center p-4 cursor-pointer shrink-0 select-none"
            onClick={() => toggleExpanded('metrics')}
          >
            <h2 className={`text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2 ${theme === 'dark' ? 'text-orange-400' : 'text-stone-600'}`}>
              <BarChart3 size={12} /> Global Metrics
            </h2>
            <div className={`text-[11px] opacity-50 transition-transform duration-300 ${expanded.metrics ? 'rotate-180' : ''}`}>
              ▼
            </div>
          </div>
          
          <AnimatePresence>
            {expanded.metrics && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-4"
              >
                <div className="grid grid-cols-1 gap-2">
                  {crisisTypes.map(type => {
                    const count = crises.filter(c => c.type === type).length;
                    const isActive = filterTypes.includes(type);
                    
                    // Type mapping for display
                    const formatType = (t: string) => {
                      const mapping: Record<string, string> = {
                        'EQ': 'Earthquake',
                        'TC': 'Tropical Cyclone',
                        'FL': 'Flood',
                        'VO': 'Volcano',
                        'DR': 'Drought',
                        'WF': 'Wildfire',
                        'EP': 'Epidemic',
                        'HT': 'Heat Wave',
                        'CW': 'Cold Wave',
                        'ST': 'Severe Storm',
                        'LS': 'Landslide'
                      };
                      return mapping[t.toUpperCase()] || t;
                    };

                    const displayType = formatType(type);
                    
                    // Icon mapping
                    const getIcon = (t: string) => {
                      const lower = t.toLowerCase();
                      if (lower.includes('earthquake') || lower === 'eq') return <Activity size={14} />;
                      if (lower.includes('cyclone') || lower.includes('storm') || lower === 'tc' || lower === 'st') return <Wind size={14} />;
                      if (lower.includes('wildfire') || lower === 'wf') return <Flame size={14} />;
                      if (lower.includes('flood') || lower.includes('tsunami') || lower === 'fl') return <Waves size={14} />;
                      if (lower.includes('volcano') || lower === 'vo') return <Mountain size={14} />;
                      if (lower.includes('drought') || lower === 'dr') return <Sun size={14} />;
                      if (lower.includes('epidemic') || lower.includes('health') || lower === 'ep') return <Biohazard size={14} />;
                      return <Crosshair size={14} />;
                    };

                    return (
                      <button
                        key={type}
                        onClick={() => toggleTypeFilter(type)}
                        className={`p-3 border rounded text-left transition-all min-h-[56px] flex items-center gap-3 ${
                          isActive 
                            ? (theme === 'dark' ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-orange-50 border-orange-500 text-orange-700')
                            : (theme === 'dark' ? 'bg-orange-500/5 border-orange-900/20 text-orange-500/50 hover:border-orange-500/50' : 'bg-stone-50 border-stone-100 text-stone-500 hover:border-stone-300')
                        }`}
                      >
                        <div className={`shrink-0 ${isActive ? 'text-orange-500' : 'opacity-40'}`}>
                          {getIcon(type)}
                        </div>
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[11px] uppercase font-bold tracking-wider truncate">{displayType}</span>
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                            isActive 
                              ? (theme === 'dark' ? 'bg-orange-500 text-black' : 'bg-orange-500 text-white')
                              : (theme === 'dark' ? 'bg-orange-950/40 text-orange-500' : 'bg-stone-200 text-stone-600')
                          }`}>{count}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                
                <div className={`p-4 border rounded ${theme === 'dark' ? 'bg-orange-500/5 border-orange-500/10' : 'bg-stone-50 border-stone-200'}`}>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className={`text-[10px] uppercase font-bold tracking-widest mb-1 ${theme === 'dark' ? 'text-orange-400' : 'text-stone-500'}`}>Total Active Events</p>
                      <p className={`text-3xl font-bold tracking-tighter ${theme === 'dark' ? 'text-orange-400' : 'text-stone-900'}`}>{crises.length}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <Focus size={12} className="text-orange-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-orange-500 uppercase tracking-[0.2em]">Live Feed</span>
                      </div>
                      <p className="text-[9px] opacity-30 uppercase">Last Sync: {time.toLocaleTimeString()}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Selected Crisis Info Overlay - Center Bottom */}
        <AnimatePresence>
          {selectedCrisis && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`fixed sm:absolute bottom-6 sm:bottom-32 left-1/2 -translate-x-1/2 w-[92%] sm:w-full sm:max-w-2xl backdrop-blur-2xl border p-6 z-50 transition-colors duration-500 shadow-2xl ${
                theme === 'dark' 
                  ? 'bg-black/90 border-orange-500/40 shadow-[0_0_50px_rgba(249,115,22,0.2)]' 
                  : 'bg-white/95 border-stone-200 shadow-stone-200/50'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      selectedCrisis.severity === 'RED' ? 'bg-red-500 text-white' : 
                      selectedCrisis.severity === 'ORANGE' ? 'bg-orange-500 text-white' : 
                      'bg-orange-700 text-white'
                    }`}>
                      {selectedCrisis.severity} ALERT
                    </span>
                    <span className={`text-xs opacity-50 uppercase tracking-widest ${theme === 'dark' ? '' : 'text-stone-500'}`}>{selectedCrisis.type}</span>
                  </div>
                  <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-stone-900'}`}>{selectedCrisis.title}</h2>
                </div>
                <button 
                  onClick={() => setSelectedCrisis(null)}
                  className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-white/10 text-white/50 hover:text-white' : 'hover:bg-stone-100 text-stone-400 hover:text-stone-600'}`}
                >
                  <X size={18} />
                </button>
              </div>
              
              <p className={`text-xs leading-relaxed mb-6 max-h-24 overflow-y-auto ${theme === 'dark' ? 'text-orange-100/70' : 'text-stone-600'}`}>
                {selectedCrisis.description || 'No detailed description available for this event.'}
              </p>

              <div className={`flex flex-wrap gap-4 items-center justify-between border-t pt-4 ${theme === 'dark' ? 'border-orange-900/30' : 'border-stone-100'}`}>
                <div className="flex gap-6">
                  <div className="space-y-1">
                    <p className="text-[11px] opacity-50 uppercase">Coordinates</p>
                    <p className={`text-xs font-bold ${theme === 'dark' ? 'text-orange-400' : 'text-stone-700'}`}>{selectedCrisis.lat.toFixed(4)}°N, {selectedCrisis.lng.toFixed(4)}°E</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] opacity-50 uppercase">Timestamp</p>
                    <p className={`text-xs font-bold ${theme === 'dark' ? 'text-orange-400' : 'text-stone-700'}`}>{new Date(selectedCrisis.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <a 
                  href={selectedCrisis.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold transition-colors ${
                    theme === 'dark' 
                      ? 'bg-orange-500 text-black hover:bg-orange-400' 
                      : 'bg-stone-900 text-white hover:bg-stone-800'
                  }`}
                >
                  VIEW FULL REPORT <ExternalLink size={12} />
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 2px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${theme === 'dark' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(0, 0, 0, 0.1)'}; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${theme === 'dark' ? 'rgba(249, 115, 22, 0.5)' : 'rgba(0, 0, 0, 0.2)'}; }
      `}} />
    </div>
  );
}
