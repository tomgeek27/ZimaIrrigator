import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Droplet, Power, Activity, RefreshCw,
  FileText, Sliders, Calendar
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api';

interface HistoryPoint {
  timestamp: number;
  moisture: number;
  pumpState: number;
}

interface PlantStats {
  litersDelivered: number;
  activations: number;
  minMoisture: number;
  maxMoisture: number;
}

interface Plant {
  id: string;
  name: string;
  moisture: number;
  minThreshold: number;
  maxThreshold: number;
  autoEnabled: boolean;
  autoStartEnabled: boolean;
  autoStopEnabled: boolean;
  isPumpOn: boolean;
  relayPin: number;
  stats: PlantStats;
  history: HistoryPoint[];
}

interface LogEvent {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'warning' | 'error';
}

interface BackendPlantConfig {
  id: string;
  name: string;
  moistureMin: number;
  moistureMax: number;
  autoEnabled: boolean;
  startEnabled: boolean;
  stopEnabled: boolean;
  relayPin: number;
}

interface BackendPlantState {
  config: BackendPlantConfig;
  currentMoisture: number;
  pumpActive: boolean;
}

interface BackendHistoryPoint {
  timestamp: number | string;
  moisture: number;
  pumpState: number;
}

interface BackendLogEvent {
  eventType: string;
  triggerType: string;
  message: string;
  timestamp: number | string;
}

type PlantsData = Record<string, Plant>;
type TimeOption = { label: string; value: string; ms: number };

const TIME_OPTIONS: TimeOption[] = [
  { label: 'Ultimi 5 min', value: '5m', ms: 5 * 60 * 1000 },
  { label: 'Ultimi 15 min', value: '15m', ms: 15 * 60 * 1000 },
  { label: 'Ultimi 30 min', value: '30m', ms: 30 * 60 * 1000 },
  { label: 'Ultima ora', value: '1h', ms: 60 * 60 * 1000 },
  { label: 'Ultime 12 ore', value: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: 'Ultime 24 ore', value: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Ultimi 3 giorni', value: '3d', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: 'Ultimi 7 giorni', value: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
];

const EMPTY_STATS: PlantStats = {
  litersDelivered: 0,
  activations: 0,
  minMoisture: 0,
  maxMoisture: 0
};

const wsUrl = (() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname; // solo hostname, non host:port del frontend
  return `${protocol}//${host}:3001/ws`;
})();

function toLogType(eventType: string): LogEvent['type'] {
  if (eventType === 'PUMP_ON') return 'warning';
  if (eventType === 'PUMP_OFF') return 'info';
  return 'info';
}

function plantFromBackend(state: BackendPlantState, existing?: Plant): Plant {
  return {
    id: state.config.id,
    name: state.config.name,
    moisture: state.currentMoisture,
    minThreshold: state.config.moistureMin,
    maxThreshold: state.config.moistureMax,
    autoEnabled: state.config.autoEnabled,
    autoStartEnabled: state.config.startEnabled,
    autoStopEnabled: state.config.stopEnabled,
    isPumpOn: state.pumpActive,
    relayPin: state.config.relayPin,
    stats: existing?.stats || EMPTY_STATS,
    history: existing?.history || []
  };
}

function computeStats(history: HistoryPoint[]): PlantStats {
  if (history.length === 0) return EMPTY_STATS;

  let minMoisture = history[0].moisture;
  let maxMoisture = history[0].moisture;
  let activations = 0;
  let litersDelivered = 0;

  for (let i = 0; i < history.length; i += 1) {
    const point = history[i];
    minMoisture = Math.min(minMoisture, point.moisture);
    maxMoisture = Math.max(maxMoisture, point.moisture);
    if (i > 0 && history[i - 1].pumpState === 0 && point.pumpState === 100) {
      activations += 1;
    }
    if (point.pumpState === 100) {
      litersDelivered += 0.02;
    }
  }

  return {
    litersDelivered: Number(litersDelivered.toFixed(2)),
    activations,
    minMoisture,
    maxMoisture
  };
}

export default function SmartIrrigationDashboard(): React.JSX.Element {
  const [plants, setPlants] = useState<PlantsData>({});
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('24h');
  const [pollingInterval, setPollingInterval] = useState<number>(5);
  const [selectedPlantId, setSelectedPlantId] = useState<string>('');
  const [currentTimeWindow, setCurrentTimeWindow] = useState<{ min: number; max: number }>({ min: 0, max: 0 });
  const [logs, setLogs] = useState<LogEvent[]>([]);

  const selectedPlant = plants[selectedPlantId];
  const selectedOption = TIME_OPTIONS.find((option) => option.value === selectedTimeframe) || TIME_OPTIONS[3];
  const automationEnabled = selectedPlant?.autoEnabled ?? false;

  const addLog = useCallback((message: string, type: LogEvent['type'] = 'info'): void => {
    if (message.startsWith('Telemetria [')) return;

    const newLog: LogEvent = {
      id: String(Date.now()),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message,
      type
    };
    setLogs(prev => [newLog, ...prev].slice(0, 100));
  }, []);

  const refreshHistory = useCallback(async (plantId: string): Promise<void> => {
    if (!plantId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/history/${plantId}?timeframe=${selectedTimeframe}`);
      if (!response.ok) throw new Error('history fetch failed');
      const payload = (await response.json()) as BackendHistoryPoint[];
      const history: HistoryPoint[] = payload.map((point) => ({
        timestamp: Number(point.timestamp),
        moisture: point.moisture,
        pumpState: point.pumpState ? 100 : 0
      }));

      setPlants((prev) => {
        const plant = prev[plantId];
        if (!plant) return prev;
        return {
          ...prev,
          [plantId]: {
            ...plant,
            history,
            stats: computeStats(history)
          }
        };
      });
    } catch (_err) {
      addLog('Errore nel recupero dello storico.', 'error');
    }
  }, [addLog, selectedTimeframe]);

  // Caricamento iniziale delle piante via HTTP al mount
  useEffect(() => {
    const loadPlants = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/plants`);
        if (!response.ok) throw new Error('plants fetch failed');
        const plantsData = (await response.json()) as Record<string, BackendPlantState>;

        const converted: PlantsData = {};
        Object.entries(plantsData).forEach(([id, state]) => {
          converted[id] = plantFromBackend(state);
        });

        setPlants(converted);

        // Seleziona la prima pianta se disponibile
        const firstPlantId = Object.keys(converted)[0];
        if (firstPlantId) {
          setSelectedPlantId(firstPlantId);
        }
      } catch (_err) {
        addLog('Errore nel caricamento delle piante.', 'error');
      }
    };

    void loadPlants();
  }, [addLog]);

  useEffect(() => {
    const updateWindow = () => {
      const max = Date.now();
      const min = max - selectedOption.ms;
      setCurrentTimeWindow({ min, max });
    };

    updateWindow();
    const interval = setInterval(updateWindow, 1000);
    return () => clearInterval(interval);
  }, [selectedOption.ms]);

  // useEffect(() => {
  //   const socket = new WebSocket(wsUrl);

  //   socket.onmessage = (event) => {
  //     try {
  //       const payload = JSON.parse(event.data) as { type: 'INIT' | 'UPDATE'; data: Record<string, BackendPlantState> };
  //       const incoming = payload.data || {};

  //       setPlants((prev) => {
  //         const next: PlantsData = { ...prev };
  //         Object.entries(incoming).forEach(([id, state]) => {
  //           const existing = prev[id];
  //           const mapped = plantFromBackend(state, existing);

  //           const livePoint: HistoryPoint = {
  //             timestamp: Date.now(),
  //             moisture: mapped.moisture,
  //             pumpState: mapped.isPumpOn ? 100 : 0
  //           };

  //           const history = [...(existing?.history || []), livePoint].slice(-800);

  //           next[id] = {
  //             ...mapped,
  //             history,
  //             stats: computeStats(history)
  //           };
  //         });
  //         return next;
  //       });

  //       const ids = Object.keys(incoming);
  //       if (!selectedPlantId && ids.length > 0) {
  //         setSelectedPlantId(ids[0]);
  //       }
  //     } catch (_err) {
  //       addLog('Payload WebSocket non valido.', 'error');
  //     }
  //   };

  //   socket.onerror = () => addLog('Connessione WebSocket non disponibile.', 'warning');

  //   return () => socket.close();
  // }, [addLog, selectedPlantId]);

  useEffect(() => {
    let isCancelled = false;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      if (isCancelled) socket.close(); // StrictMode: se già smontato, chiudi subito senza allarmare
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as
          | { type: 'INIT' | 'UPDATE'; data: Record<string, BackendPlantState> }
          | { type: 'LOG'; data: { message: string; level: 'info' | 'warning' | 'error'; timestamp: number } };

        if (payload.type === 'LOG') {
          addLog(payload.data.message, payload.data.level);
          return;
        }

        const incoming = payload.data || {};

        setPlants((prev) => {
          const next: PlantsData = { ...prev };

          Object.entries(incoming).forEach(([id, state]) => {
            const existing = prev[id];
            const mapped = plantFromBackend(state, existing);

            const livePoint: HistoryPoint = {
              timestamp: Date.now(),
              moisture: mapped.moisture,
              pumpState: mapped.isPumpOn ? 100 : 0
            };

            const history = [...(existing?.history || []), livePoint].slice(-800);

            next[id] = {
              ...mapped,
              history,
              stats: computeStats(history)
            };
          });

          return next;
        });

        const ids = Object.keys(incoming);
        if (ids.length > 0) {
          setSelectedPlantId((current) => current || ids[0]);
        }
      } catch (_err) {
        addLog('Payload WebSocket non valido.', 'error');
      }
    };
    socket.onerror = () => {
      if (!isCancelled) addLog('Connessione WebSocket non disponibile.', 'warning');
    };

    return () => {
      isCancelled = true;
      socket.close();
    };
  }, []); // <-- nessuna dipendenza: il socket vive per tutta la vita del componente

  useEffect(() => {
    if (!selectedPlantId) return;

    refreshHistory(selectedPlantId);
    const interval = setInterval(() => refreshHistory(selectedPlantId), pollingInterval * 1000);

    return () => clearInterval(interval);
  }, [pollingInterval, refreshHistory, selectedPlantId]);

  useEffect(() => {
    if (!selectedPlantId) return;

    const refreshLogs = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/logs/${selectedPlantId}`);
        if (!response.ok) throw new Error('logs fetch failed');

        const payload = (await response.json()) as BackendLogEvent[];
        const mapped: LogEvent[] = payload.map((event, index) => ({
          id: `${event.timestamp}-${index}`,
          timestamp: new Date(Number(event.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          message: `[${event.triggerType}] ${event.message}`,
          type: toLogType(event.eventType)
        }));
        setLogs(mapped);
      } catch (_err) {
        addLog('Errore nel recupero dei log.', 'error');
      }
    };

    refreshLogs();
    const interval = setInterval(refreshLogs, Math.max(10000, pollingInterval * 2000));

    return () => clearInterval(interval);
  }, [addLog, pollingInterval, selectedPlantId]);

  const persistConfig = useCallback(async (plant: Plant): Promise<void> => {
    try {
      const body = {
        id: plant.id,
        name: plant.name,
        moistureMin: plant.minThreshold,
        moistureMax: plant.maxThreshold,
        autoEnabled: plant.autoEnabled,
        startEnabled: plant.autoStartEnabled,
        stopEnabled: plant.autoStopEnabled,
        relayPin: plant.relayPin
      };

      const response = await fetch(`${API_BASE_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('config post failed');
    } catch (_err) {
      addLog(`Errore salvataggio configurazione di ${plant.name}.`, 'error');
    }
  }, [addLog]);

  const persistSelectedConfig = useCallback(() => {
    if (!selectedPlantId || !plants[selectedPlantId]) return;
    void persistConfig(plants[selectedPlantId]);
  }, [persistConfig, plants, selectedPlantId]);

  const updatePlant = useCallback((plantId: string, patch: Partial<Plant>) => {
    setPlants((prev) => {
      const plant = prev[plantId];
      if (!plant) return prev;
      return {
        ...prev,
        [plantId]: {
          ...plant,
          ...patch
        }
      };
    });
  }, []);

  const togglePumpManual = async (id: string): Promise<void> => {
    const plant = plants[id];
    if (!plant) return;

    const nextState = !plant.isPumpOn;
    updatePlant(id, { isPumpOn: nextState });

    try {
      const response = await fetch(`${API_BASE_URL}/pump`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relayPin: plant.relayPin, active: `${nextState ? 'ON' : 'OFF'}` })
      });

      if (!response.ok) throw new Error('pump post failed');
      addLog(`[Manuale] Override relè [${plant.name}] -> ${nextState ? 'ON' : 'OFF'}`, nextState ? 'warning' : 'info');
    } catch (_err) {
      updatePlant(id, { isPumpOn: !nextState });
      addLog(`Errore comando pompa per ${plant.name}.`, 'error');
    }
  };

  const filteredHistory = useMemo(() => {
    if (!selectedPlant) return [];
    return selectedPlant.history.filter(point => point.timestamp >= currentTimeWindow.min);
  }, [selectedPlant, currentTimeWindow.min]);

  const formatXAxis = (tickItem: number) => {
    const date = new Date(tickItem);
    if (selectedOption.ms > 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const date = new Date(payload[0].payload.timestamp);
      return (
        <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl text-[11px] font-mono shadow-xl">
          <p className="text-slate-500 mb-1 font-bold">Data: {date.toLocaleString()}</p>
          <p className="text-blue-400">Umidità: <span className="font-bold text-slate-100">{payload[0].value}%</span></p>
          <p className="text-emerald-400">
            Pompa: <span className="font-bold text-slate-100">{payload[1]?.value === 100 ? 'ON' : 'OFF'}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col md:flex-row">

      {/* SIDEBAR NAVIGATION */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 sticky top-0 h-screen p-4 justify-between shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-2 px-2 py-1">
            <Droplet className="text-emerald-400 fill-emerald-400/20" size={22} />
            <h1 className="text-lg font-black text-emerald-400 tracking-tight">ZimaIrrigation</h1>
          </div>
        </div>

        <div className="bg-slate-950/50 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-500 font-bold">POLLING INTERVAL</span>
          <div className="flex items-center gap-1.5 text-slate-200">
            <RefreshCw size={10} className="animate-spin text-emerald-400" />
            <select value={pollingInterval} onChange={(e) => setPollingInterval(Number(e.target.value))} className="bg-transparent focus:outline-none font-bold">
              <option value={2} className="bg-slate-900">2s</option>
              <option value={5} className="bg-slate-900">5s</option>
            </select>
          </div>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <header className="md:hidden sticky top-0 z-30 backdrop-blur-md bg-slate-950/80 border-b border-slate-900 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplet className="text-emerald-400 fill-emerald-400/20" size={18} />
          <h1 className="text-base font-black text-emerald-400 tracking-tight">ZimaIrrigation OS</h1>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-2.5 py-1 rounded-xl text-[10px] font-bold text-slate-400">
          <RefreshCw size={10} className="animate-spin text-emerald-400" />
          <select value={pollingInterval} onChange={(e) => setPollingInterval(Number(e.target.value))} className="bg-transparent focus:outline-none text-slate-200">
            <option value={2} className="bg-slate-900">2s</option>
            <option value={5} className="bg-slate-900">5s</option>
          </select>
        </div>
      </header>

      {/* CONTENUTORE PRINCIPALE */}
      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full space-y-6 pb-8 overflow-y-auto">

        {selectedPlant && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* COLONNA SINISTRA */}
            <div className="lg:col-span-4 space-y-4 w-full">

              {/* SELETTORE PIANTE */}
              <div className="bg-slate-900/40 border border-slate-900 p-2 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider px-2 block mb-2">Canali Sensori</span>
                <div className="flex gap-2 md:flex-col overflow-x-auto pb-1 md:pb-0 scrollbar-none snap-x">
                  {Object.values(plants).map((plant) => (
                    <button
                      key={plant.id}
                      onClick={() => setSelectedPlantId(plant.id)}
                      className={`flex items-center justify-between p-3.5 rounded-xl min-w-[140px] md:min-w-0 border text-left transition-all snap-start ${selectedPlantId === plant.id ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-lg shadow-emerald-500/10' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                    >
                      <div>
                        <span className="text-[9px] opacity-70 block font-mono">CH-0{plant.id}</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xs font-bold block truncate">{plant.name}</span>
                          <span className="text-[8px] text-slate-500 font-mono shrink-0">PIN:{plant.relayPin}</span>
                        </div>
                      </div>
                      <span className="text-sm font-black font-mono">{plant.moisture}%</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* LIVE MONITOR CARD */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider">Monitor Attivo</span>
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-xl font-black tracking-tight">{selectedPlant.name}</h2>
                    <span className="text-[10px] text-slate-500 font-mono">PIN:{selectedPlant.relayPin}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Umidità</span>
                  <span className="text-3xl font-black font-mono text-blue-400">{selectedPlant.moisture}%</span>
                </div>
              </div>

              {/* RELE OVERRIDE BUTTON */}
              <button
                disabled={automationEnabled}
                onClick={() => {
                  if (automationEnabled) return;
                  void togglePumpManual(selectedPlant.id);
                }}
                className={`w-full py-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 border transition-all tracking-wider ${automationEnabled
                  ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-70'
                  : selectedPlant.isPumpOn
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-blue-500 text-slate-950 border-blue-400 shadow-md shadow-blue-500/10 hover:bg-blue-400'
                  }`}
              >
                <Power size={14} />
                {selectedPlant.isPumpOn ? "STOP RELÈ (HARDWARE OVERRIDE)" : "AVVIA RELÈ (HARDWARE OVERRIDE)"}
              </button>
            </div>

            {/* COLONNA DESTRA */}
            <div className="lg:col-span-8 space-y-6 w-full">

              {/* CONFIGURAZIONE AUTOMAZIONE SOGLIE */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex justify-between items-center pb-3 border-b border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <Sliders size={15} className={automationEnabled ? 'text-emerald-400' : 'text-slate-500'} />
                    <div>
                      <h3 className="font-black text-xs uppercase text-slate-200 tracking-wide">Automazione Idrica Logica</h3>
                      <p className="text-[10px] text-slate-400">Logica condizionale elaborata dallo ZimaBlade</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer h-5">
                    <input
                      type="checkbox"
                      checked={automationEnabled}
                      onChange={(e) => {
                        updatePlant(selectedPlant.id, { autoEnabled: e.target.checked });
                        const nextPlant = { ...selectedPlant, autoEnabled: e.target.checked };
                        void persistConfig(nextPlant);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[2px] after:bg-slate-500 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-slate-950" />
                  </label>
                </div>

                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-all duration-300 ${!automationEnabled ? 'opacity-25 pointer-events-none' : ''}`}>
                  <div className="space-y-1 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/40">
                    <span className="text-xs font-bold text-slate-300 block mb-1">Minima (Inizio Irrigazione)</span>
                    <div className="flex justify-between items-center gap-3">
                      <input
                        type="range"
                        min="1"
                        max="49"
                        value={selectedPlant.minThreshold}
                        onChange={(e) => updatePlant(selectedPlant.id, { minThreshold: parseInt(e.target.value, 10) || 0 })}
                        onMouseUp={persistSelectedConfig}
                        onTouchEnd={persistSelectedConfig}
                        className="flex-1 h-1.5 accent-blue-500 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="font-mono text-xs text-blue-400 font-bold bg-blue-500/10 px-2.5 py-1 rounded shrink-0">{selectedPlant.minThreshold}%</span>
                    </div>
                  </div>

                  <div className="space-y-1 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/40">
                    <span className="text-xs font-bold text-slate-300 block mb-1">Massima (Target Spegnimento)</span>
                    <div className="flex justify-between items-center gap-3">
                      <input
                        type="range"
                        min="50"
                        max="99"
                        value={selectedPlant.maxThreshold}
                        onChange={(e) => updatePlant(selectedPlant.id, { maxThreshold: parseInt(e.target.value, 10) || 0 })}
                        onMouseUp={persistSelectedConfig}
                        onTouchEnd={persistSelectedConfig}
                        className="flex-1 h-1.5 accent-cyan-400 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="font-mono text-xs text-cyan-400 font-bold bg-cyan-400/10 px-2.5 py-1 rounded shrink-0">{selectedPlant.maxThreshold}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* GRAFICO TEMPORALE */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-1">
                  <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                    <Activity size={14} className="text-blue-400" /> Analisi Lineare dell'Intervallo Scelto
                  </span>

                  <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2 py-1.5 rounded-xl text-[10px] font-bold text-slate-300 self-end sm:self-auto">
                    <Calendar size={12} className="text-emerald-400" />
                    <select
                      value={selectedTimeframe}
                      onChange={(e) => setSelectedTimeframe(e.target.value)}
                      className="bg-transparent focus:outline-none cursor-pointer text-slate-200 pr-1"
                    >
                      {TIME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value} className="bg-slate-900">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* AREA CHART CON ANIMAZIONI DISATTIVATE (isAnimationActive={false}) */}
                <div className="h-56 sm:h-64 md:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={filteredHistory} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="timestamp"
                        type="number"
                        domain={[currentTimeWindow.min, currentTimeWindow.max]}
                        tickFormatter={formatXAxis}
                        stroke="#475569"
                        tick={{ fontSize: 8, fontFamily: 'monospace' }}
                      />
                      <YAxis domain={[0, 100]} stroke="#475569" tick={{ fontSize: 9 }} />
                      <Tooltip content={<CustomTooltip />} />

                      {/* Umidità - Animazione Rimossa */}
                      <Area
                        type="monotone"
                        dataKey="moisture"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fillOpacity={0.01}
                        fill="#2563eb"
                        isAnimationActive={false}
                      />

                      {/* Stato Pompa ON/OFF - Animazione Rimossa */}
                      <Area
                        type="stepAfter"
                        dataKey="pumpState"
                        stroke="#10b981"
                        strokeWidth={1}
                        fillOpacity={0.1}
                        fill="#10b981"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-[10px] font-mono text-center text-slate-500">
                  Dati caricati da backend reale via WebSocket + API REST.
                </div>
              </div>

            </div>
          </div>
        )}

        {/* PANNELLO LOG DI SISTEMA */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 min-h-[35vh] flex flex-col shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-2">
              <FileText size={16} className="text-emerald-400" /> Registro Eventi Hardware & Automazioni
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 text-[11px] font-mono pr-1 max-h-[42vh]">
            {logs.map((log) => (
              <div key={log.id} className="p-2.5 bg-slate-950/40 rounded-lg border border-slate-950/60 flex gap-2.5">
                <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                <span className={log.type === 'error' ? 'text-rose-400' : log.type === 'warning' ? 'text-amber-400' : 'text-slate-300'}>{log.message}</span>
              </div>
            ))}
          </div>
        </div>

      </main>

    </div>
  );
}