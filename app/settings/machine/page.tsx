"use client";

import { AppLayout } from '@/components/AppLayout';
import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/db';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Play, Square, Save, RefreshCw, Terminal, Plus, Trash2,
  CheckCircle, AlertTriangle, AlertCircle, Info, Copy,
  Wifi, Sliders, FileText, Database, ShieldAlert
} from 'lucide-react';

interface ParameterMapping {
  [machineCode: string]: number; // machineCode to LIS parameterId (Int)
}

interface TestMapping {
  [lisTestId: string]: string; // lisTestId to machineTestCode (String)
}

interface MachineConfig {
  connectionType: 'LAN' | 'COM';
  tcpPort: number;
  tcpMode: 'Server' | 'Client';
  tcpHost: string;
  comPort: string;
  baudRate: number;
  dataBits: number;
  parity: 'none' | 'odd' | 'even';
  stopBits: number;
  protocol: 'ASTM' | 'HL7';
  bidirectional: boolean;
  autoApproveNormal: boolean;
  parameterMapping: ParameterMapping;
  valueFactors?: Record<string, number>; // machine code -> multiplier for unit conversion
  testMapping: TestMapping;
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'SYSTEM' | 'RAW' | 'PARSED' | 'ERROR';
  message: string;
}

interface TestNode {
  id: number;
  name: string;
  code: string;
  parameters: {
    id: number;
    name: string;
    shortName: string | null;
    unit: string | null;
    isHeader?: boolean;
  }[];
}

interface ResultNotification {
  id: string;
  patientName: string;
  orderNo: string;
  count: number;
  timestamp: string;
}

interface OrphanScan {
  id: string;
  barcode: string;
  timestamp: string;
  results: {
    parameter: string;
    value: string;
    unit: string | null;
    refRange: string | null;
    flag: string | null;
  }[];
}

interface PendingOrderNode {
  id: string;
  orderNo: string;
  patientName: string;
}

export default function MachineInterfacingPage() {
  const [config, setConfig] = useState<MachineConfig>({
    connectionType: 'LAN',
    tcpPort: 5000,
    tcpMode: 'Server',
    tcpHost: '127.0.0.1',
    comPort: 'COM1',
    baudRate: 9600,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    protocol: 'ASTM',
    bidirectional: true,
    autoApproveNormal: false,
    parameterMapping: {},
    testMapping: {}
  });

  const [status, setStatus] = useState<string>('Inactive');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [tests, setTestsList] = useState<TestNode[]>([]);
  
  // Unmatched scans & reconciliation states
  const [orphans, setOrphans] = useState<OrphanScan[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrderNode[]>([]);
  const [reconciliationSelections, setReconciliationSelections] = useState<{ [orphanId: string]: string }>({});
  const [rightTab, setRightTab] = useState<'terminal' | 'orphans'>('terminal');

  // Mappings form states
  const [selectedTestId, setSelectedTestId] = useState<string>('');
  const [selectedParamId, setSelectedParamId] = useState<string>('');
  const [mappingMachineCode, setMappingMachineCode] = useState<string>('');
  const [mappingFactor, setMappingFactor] = useState<string>('');

  const [selectedMappingTestId, setSelectedMappingTestId] = useState<string>('');
  const [mappingMachineTestCode, setMappingMachineTestCode] = useState<string>('');

  const [simulatorPreset, setSimulatorPreset] = useState<string>('Mindray ASTM');
  const [serialPorts, setSerialPorts] = useState<{ path: string; label: string }[]>([]);
  
  // Notification states
  const [notifications, setNotifications] = useState<ResultNotification[]>([]);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;

  // Fetch pending LIS orders (helper)
  const fetchPendingOrders = async () => {
    try {
      const orders = await db.query('testOrder', 'findMany', {
        where: {
          status: 'PENDING'
        },
        include: {
          patient: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      setPendingOrders((orders || []).map((o: any) => ({
        id: o.id.toString(),
        orderNo: o.orderNo,
        patientName: o.patient ? o.patient.name : 'Unknown'
      })));
    } catch (err) {
      console.error('Failed to load pending orders:', err);
    }
  };

  // 1. Fetch parameters & initial config/status
  useEffect(() => {
    const initData = async () => {
      try {
        const testsData = await db.query('test', 'findMany', {
          include: { parameters: true }
        });
        setTestsList(testsData || []);
      } catch (err) {
        console.error('Failed to load tests list:', err);
      }

      await fetchPendingOrders();

      if (isElectron) {
        const eAPI = (window as any).electronAPI;
        try {
          const savedConfig = await eAPI.machineGetConfig();
          if (savedConfig) {
            setConfig({
              ...config,
              ...savedConfig,
              parameterMapping: savedConfig.parameterMapping || {},
              testMapping: savedConfig.testMapping || {}
            });
          }

          const currentStatus = await eAPI.machineGetStatus();
          if (currentStatus) setStatus(currentStatus);

          const cachedLogs = await eAPI.machineGetLogs();
          if (cachedLogs) setLogs(cachedLogs);

          const cachedOrphans = await eAPI.machineGetOrphans();
          if (cachedOrphans) setOrphans(cachedOrphans);

          if (eAPI.machineListPorts) setSerialPorts(await eAPI.machineListPorts());
        } catch (err) {
          console.error('Failed to query Electron machine server APIs:', err);
        }
      } else {
        setLogs([
          { id: '1', timestamp: new Date().toISOString(), type: 'SYSTEM', message: 'Machine Interfacing UI running in browser demo mode.' },
          { id: '2', timestamp: new Date().toISOString(), type: 'SYSTEM', message: 'Connect actual laboratory machines via the installed desktop app.' }
        ]);
      }
    };

    initData();
  }, [isElectron]);

  // 2. Real-time Electron event listeners
  useEffect(() => {
    if (!isElectron) return;

    const eAPI = (window as any).electronAPI;

    const cleanupStatus = eAPI.onMachineStatus((newStatus: string) => {
      setStatus(newStatus);
    });

    const cleanupLog = eAPI.onMachineLog((logEntry: LogEntry) => {
      setLogs((prev) => [logEntry, ...prev].slice(0, 300));
    });

    const cleanupResultParsed = eAPI.onMachineResultParsed((data: { patientName: string; orderNo: string; count: number }) => {
      const newNotif: ResultNotification = {
        id: Math.random().toString(),
        patientName: data.patientName,
        orderNo: data.orderNo,
        count: data.count,
        timestamp: new Date().toLocaleTimeString()
      };
      setNotifications((prev) => [newNotif, ...prev]);
      
      setTimeout(() => {
        setNotifications((prev) => prev.filter(n => n.id !== newNotif.id));
      }, 8000);

      // Re-fetch pending orders list
      fetchPendingOrders();
    });

    const cleanupOrphans = eAPI.onOrphansUpdated((list: OrphanScan[]) => {
      setOrphans(list);
      fetchPendingOrders();
    });

    return () => {
      cleanupStatus();
      cleanupLog();
      cleanupResultParsed();
      cleanupOrphans();
    };
  }, [isElectron]);

  // 3. Autoscroll logic
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      const consoleEl = terminalEndRef.current.parentElement?.parentElement;
      if (consoleEl) consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  }, [logs, autoScroll, logFilter]);

  const triggerToast = (text: string, type: 'success' | 'error') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // 4. Action Handlers
  const handleSaveConfig = async (updatedConfig: MachineConfig = config) => {
    if (isElectron) {
      const success = await (window as any).electronAPI.machineSaveConfig(updatedConfig);
      if (success) {
        triggerToast('Configuration saved successfully.', 'success');
      } else {
        triggerToast('Failed to save configuration.', 'error');
      }
    } else {
      triggerToast('Configuration saved (Demo mode).', 'success');
    }
  };

  const handleStartListener = async () => {
    if (isElectron) {
      await (window as any).electronAPI.machineSaveConfig(config);
      const success = await (window as any).electronAPI.machineStart();
      if (success) {
        triggerToast('Interfacing listener started successfully.', 'success');
      } else {
        triggerToast('Failed to start interfacing listener. Check settings.', 'error');
      }
    } else {
      setStatus('Listening');
      triggerToast('Interfacing active (Demo mode).', 'success');
    }
  };

  const handleStopListener = async () => {
    if (isElectron) {
      const success = await (window as any).electronAPI.machineStop();
      if (success) {
        triggerToast('Interfacing listener stopped.', 'success');
      } else {
        triggerToast('Failed to stop listener.', 'error');
      }
    } else {
      setStatus('Inactive');
      triggerToast('Interfacing stopped.', 'success');
    }
  };

  const handleClearLogs = async () => {
    if (isElectron) {
      const success = await (window as any).electronAPI.machineClearLogs();
      if (success) setLogs([]);
    } else {
      setLogs([]);
    }
  };

  const handleCopyLogs = () => {
    const rawText = logs
      .map((l) => `[${l.timestamp}] [${l.type}] ${l.message}`)
      .reverse()
      .join('\n');
    navigator.clipboard.writeText(rawText);
    triggerToast('Logs copied to clipboard.', 'success');
  };

  // Parameter Mapping Add/Delete
  const handleAddMapping = () => {
    if (!selectedParamId || !mappingMachineCode.trim()) {
      triggerToast('Please select a parameter and enter a machine code.', 'error');
      return;
    }

    const cleanCode = mappingMachineCode.trim().toUpperCase();
    const paramId = parseInt(selectedParamId);

    const updatedMapping = {
      ...config.parameterMapping,
      [cleanCode]: paramId
    };

    const factor = Number(mappingFactor);
    const valueFactors = { ...(config.valueFactors || {}) };
    if (mappingFactor.trim() && factor > 0 && factor !== 1) valueFactors[cleanCode] = factor;
    else delete valueFactors[cleanCode];

    const updatedConfig = {
      ...config,
      parameterMapping: updatedMapping,
      valueFactors
    };

    setConfig(updatedConfig);
    handleSaveConfig(updatedConfig);
    setMappingMachineCode('');
    setMappingFactor('');
    triggerToast(`Mapped machine code "${cleanCode}" successfully.`, 'success');
  };

  const handleDeleteMapping = (machineCode: string) => {
    const updatedMapping = { ...config.parameterMapping };
    delete updatedMapping[machineCode];
    const valueFactors = { ...(config.valueFactors || {}) };
    delete valueFactors[machineCode];

    const updatedConfig = {
      ...config,
      parameterMapping: updatedMapping,
      valueFactors
    };

    setConfig(updatedConfig);
    handleSaveConfig(updatedConfig);
    triggerToast(`Removed mapping for code "${machineCode}".`, 'success');
  };

  // Test Mapping Add/Delete (Bidirectional Host Query)
  const handleAddTestMapping = () => {
    if (!selectedMappingTestId || !mappingMachineTestCode.trim()) {
      triggerToast('Please select a test and enter a machine command code.', 'error');
      return;
    }

    const cleanCode = mappingMachineTestCode.trim().toUpperCase();
    const testId = selectedMappingTestId;

    const updatedMapping = {
      ...(config.testMapping || {}),
      [testId]: cleanCode
    };

    const updatedConfig = {
      ...config,
      testMapping: updatedMapping
    };

    setConfig(updatedConfig);
    handleSaveConfig(updatedConfig);
    setMappingMachineTestCode('');
    triggerToast(`Mapped LIS test to machine order code "${cleanCode}" successfully.`, 'success');
  };

  const handleDeleteTestMapping = (testId: string) => {
    const updatedMapping = { ...(config.testMapping || {}) };
    delete updatedMapping[testId];

    const updatedConfig = {
      ...config,
      testMapping: updatedMapping
    };

    setConfig(updatedConfig);
    handleSaveConfig(updatedConfig);
    triggerToast(`Removed test code mapping.`, 'success');
  };

  // Unmatched scans reconciliation handlers
  const handleReconcile = async (orphanId: string) => {
    const targetBarcode = reconciliationSelections[orphanId];
    if (!targetBarcode) {
      triggerToast('Please select a pending LIS patient order to link.', 'error');
      return;
    }

    if (isElectron) {
      triggerToast('Reconciling scan parameters...', 'success');
      const success = await (window as any).electronAPI.machineReconcileOrphan(orphanId, targetBarcode);
      if (success) {
        triggerToast('Results reconciled and matched to LIS patient order.', 'success');
        const list = await (window as any).electronAPI.machineGetOrphans();
        if (list) setOrphans(list);
        
        // Remove selection state
        const updatedSelections = { ...reconciliationSelections };
        delete updatedSelections[orphanId];
        setReconciliationSelections(updatedSelections);

        fetchPendingOrders();
      } else {
        triggerToast('Failed to reconcile scan results.', 'error');
      }
    } else {
      setOrphans(prev => prev.filter(o => o.id !== orphanId));
      triggerToast('Results matched (Demo Mode).', 'success');
    }
  };

  const handleDeleteOrphan = async (orphanId: string) => {
    if (isElectron) {
      const success = await (window as any).electronAPI.machineDeleteOrphan(orphanId);
      if (success) {
        const list = await (window as any).electronAPI.machineGetOrphans();
        if (list) setOrphans(list);
        triggerToast('Unmatched scan data discarded.', 'success');
      }
    } else {
      setOrphans(prev => prev.filter(o => o.id !== orphanId));
      triggerToast('Unmatched scan data discarded (Demo).', 'success');
    }
  };

  const handleRunSimulation = async () => {
    if (isElectron) {
      // Simulate. If targeting host query or invalid barcode, it might fail or cache as orphan
      const isOrphanSim = simulatorPreset.includes('Host Query') === false; // standard data sim uses barcode
      triggerToast(`Simulating transmission for "${simulatorPreset}"...`, 'success');
      
      const success = await (window as any).electronAPI.machineSimulate(simulatorPreset);
      if (!success) {
        // If simulated standard result fails because database is empty, simulate it as a fresh unmatched scan!
        if (isOrphanSim) {
          triggerToast('Prisma database empty. Simulating scan as unmatched (Orphan Result).', 'success');
          // Feed mock unmatched scan to server mock directly
          await (window as any).electronAPI.machineReconcileOrphan('nonexistent_id', 'BARCODE-MOCK-' + Date.now().toString().slice(-4));
        } else {
          triggerToast('Simulation failed. Verify SQLite data is configured.', 'error');
        }
      }
    } else {
      const timestamp = new Date().toISOString();
      let mockLogs: LogEntry[] = [];
      
      if (simulatorPreset.includes('Host Query')) {
        mockLogs = [
          { id: Math.random().toString(), timestamp, type: 'SYSTEM', message: `[Simulator] Simulating "${simulatorPreset}"...` },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Received: <ENQ>' },
          { id: Math.random().toString(), timestamp, type: 'SYSTEM', message: 'Mock handshake active. Sending ACK...' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Received: <STX>1Q|1|^LAB-ORD-101||||||||||Q<ETX>33' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Received: <EOT>' },
          { id: Math.random().toString(), timestamp, type: 'SYSTEM', message: '[Host Query] ASTM Query received for barcode: "LAB-ORD-101". Searching database...' },
          { id: Math.random().toString(), timestamp, type: 'SYSTEM', message: '[Host Query] ASTM Match! Programming tests [CBC] for patient "Demo Patient"' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Sending: <ENQ> to start host query response.' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Simulator Socket Received: <ACK> from machine.' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Sending Frame 1/4: <STX>1H|\\^&|||LIS||||||||1394-97<ETX>12' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Sending Frame 2/4: <STX>2P|1|||Demo Patient|||||||||||||||<ETX>2A' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Sending Frame 3/4: <STX>3O|1|LAB-ORD-101||^^^CBC||||||||||||||||||||O<ETX>3E' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Sending Frame 4/4: <STX>4L|1|N<ETX>05' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Sending: <EOT> to terminate host query response.' },
          { id: Math.random().toString(), timestamp, type: 'SYSTEM', message: '[Host Query Simulation] Host query response completed.' }
        ];
      } else {
        mockLogs = [
          { id: Math.random().toString(), timestamp, type: 'SYSTEM', message: `[Simulator] Simulating "${simulatorPreset}"...` },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Received: <ENQ>' },
          { id: Math.random().toString(), timestamp, type: 'SYSTEM', message: 'Mock handshake active. Sending ACK...' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Received: <STX>1H|\\^&|||LIS||||||||1394-97<ETX>3A' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Received: <STX>2P|1|||Demo Patient|||||||||||||||<ETX>2F' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Received: <STX>3O|1|LAB-ORD-101||^^^CBC||||||||||||||||||||F<ETX>4D' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Received: <STX>4R|1|^^^WBC|7.50|10*9/L|4.0-10.0|N||F<ETX>6F' },
          { id: Math.random().toString(), timestamp, type: 'RAW', message: 'Received: <STX>5R|2|^^^HGB|14.2|g/dL|12.0-16.0|N||F<ETX>72' },
          { id: Math.random().toString(), timestamp, type: 'PARSED', message: 'SUCCESS: Saved parameter WBC = 7.50 [Flag: Normal]' },
          { id: Math.random().toString(), timestamp, type: 'PARSED', message: 'SUCCESS: Saved parameter HGB = 14.2 [Flag: Normal]' },
          { id: Math.random().toString(), timestamp, type: 'SYSTEM', message: 'Completed results injection. Matched & saved 2 parameters.' }
        ];
      }
      setLogs((prev) => [...mockLogs.reverse(), ...prev]);

      // Trigger mock orphan result in demo mode
      if (simulatorPreset === 'BioChem HL7' && orphans.length === 0) {
        setOrphans([
          {
            id: 'mock_orphan_1',
            barcode: 'MOCK-BARCODE-999',
            timestamp: new Date().toISOString(),
            results: [
              { parameter: 'GLU', value: '145.0', unit: 'mg/dL', refRange: '70-110', flag: 'H' },
              { parameter: 'CREA', value: '1.92', unit: 'mg/dL', refRange: '0.6-1.2', flag: 'H' }
            ]
          }
        ]);
      }
    }
  };

  const getParameterDetails = (paramId: number) => {
    for (const t of tests) {
      const p = t.parameters.find(p => p.id === paramId);
      if (p) {
        return {
          testName: t.name,
          paramName: p.name,
          shortName: p.shortName || '-'
        };
      }
    }
    return { testName: 'Unknown Test', paramName: `Param #${paramId}`, shortName: '-' };
  };

  const filteredLogs = logs.filter((l) => {
    if (logFilter === 'ALL') return true;
    return l.type === logFilter;
  });

  return (
    <AppLayout title="Advanced Machine Interfacing" breadcrumbs={[{ label: 'System Settings' }, { label: 'Machine Interfacing' }]}>
      <div className="relative space-y-6">
        
        {/* Floating Real-time Toast Notifications */}
        <AnimatePresence>
          {toastMsg && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-xl backdrop-blur-md ${
                toastMsg.type === 'success'
                  ? 'bg-teal-950/80 border-teal-500/30 text-teal-200'
                  : 'bg-destructive/10 border-destructive/20 text-destructive'
              }`}
            >
              {toastMsg.type === 'success' ? (
                <CheckCircle className="h-5 w-5 text-teal-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400" />
              )}
              <span className="text-sm font-semibold">{toastMsg.text}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Real-time Match Success Notifications */}
        <div className="fixed bottom-4 right-4 z-50 space-y-2.5 w-80">
          <AnimatePresence>
            {notifications.map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.9 }}
                className="flex flex-col gap-1.5 rounded-xl border border-teal-500/30 bg-teal-950/90 text-teal-100 p-4 shadow-2xl backdrop-blur-lg"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500 text-teal-950">
                    <CheckCircle className="h-4 w-4 stroke-[3]" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-400">Results Synced</span>
                  <span className="ml-auto text-[10px] text-teal-400/60 font-medium">{n.timestamp}</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold">{n.patientName}</h4>
                  <p className="text-xs text-teal-300/80 mt-0.5">Order: {n.orderNo}</p>
                </div>
                <div className="border-t border-teal-500/20 pt-1.5 mt-0.5 flex justify-between text-[11px] font-semibold text-teal-400">
                  <span>Automated Parameters:</span>
                  <span>{n.count} parameters</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ─── STATUS HEADER BANNER ─── */}
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-r from-card to-accent/20 p-6 shadow-md relative">
          <div className="absolute right-[-50px] top-[-50px] w-48 h-48 rounded-full bg-primary/5 blur-[50px] pointer-events-none" />
          
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between relative z-10">
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-md ${
                status === 'Listening'
                  ? 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-teal-500/20'
                  : status === 'Error'
                  ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-red-500/20'
                  : 'bg-gradient-to-br from-slate-500 to-slate-600 text-white'
              }`}>
                <Cpu className={`h-6 w-6 ${status === 'Listening' ? 'animate-pulse' : ''}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">Automation Interfacing status</h2>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                    status === 'Listening'
                      ? 'bg-teal-500/10 text-teal-500 border-teal-500/30'
                      : status === 'Error'
                      ? 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}>
                    <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${status === 'Listening' ? 'bg-teal-500 animate-ping' : status === 'Error' ? 'bg-red-500' : 'bg-muted-foreground'}`} />
                    {status === 'Listening' ? 'CONNECTED (ACTIVE)' : status === 'Connecting' ? 'CONNECTING…' : status === 'Error' ? 'CONNECTION ERROR' : 'INACTIVE'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                  {status === 'Listening'
                    ? config.connectionType === 'COM'
                      ? `Reading ${config.protocol} data from ${config.comPort} at ${config.baudRate} baud.`
                      : config.tcpMode === 'Client'
                        ? `Connected to the analyzer at ${config.tcpHost}:${config.tcpPort} (${config.protocol}).`
                        : `Listening on TCP port ${config.tcpPort} for ${config.protocol} messages.`
                    : status === 'Connecting'
                      ? 'Waiting for the analyzer. The connection is retried automatically every 5 seconds.'
                      : 'Interfacing is stopped. Start it to capture results from your analyzers automatically.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {status !== 'Inactive' ? (
                <button
                  onClick={handleStopListener}
                  className="flex items-center gap-2 rounded-xl bg-destructive hover:bg-destructive/90 px-5 py-3 text-sm font-bold text-destructive-foreground shadow-lg shadow-destructive/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Square className="h-4 w-4 fill-current" />
                  Stop Interfacing Server
                </button>
              ) : (
                <button
                  onClick={handleStartListener}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-600 hover:from-primary/95 hover:to-violet-650 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Start Analyzer Server
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ─── GRID LAYOUT ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: SETTINGS & MAPS (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* CARD 1: CONFIG FORM */}
            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b p-4">
                <Sliders className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-foreground">Device Connection Configuration</h3>
              </div>
              <div className="p-5 space-y-4">
                
                {/* Connection Type Toggle */}
                <div>
                  <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-widest">Interface Connection Type</label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, connectionType: 'LAN' })}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                        config.connectionType === 'LAN'
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'border-border bg-background hover:bg-accent text-muted-foreground'
                      }`}
                    >
                      LAN Port (TCP/IP Client/Server)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, connectionType: 'COM' })}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                        config.connectionType === 'COM'
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'border-border bg-background hover:bg-accent text-muted-foreground'
                      }`}
                    >
                      Serial Port (COM Port / RS232)
                    </button>
                  </div>
                </div>

                {/* Protocol Selection */}
                <div>
                  <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-widest">Medical Protocol</label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, protocol: 'ASTM' })}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                        config.protocol === 'ASTM'
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'border-border bg-background hover:bg-accent text-muted-foreground'
                      }`}
                    >
                      ASTM E1394 Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, protocol: 'HL7' })}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                        config.protocol === 'HL7'
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'border-border bg-background hover:bg-accent text-muted-foreground'
                      }`}
                    >
                      HL7 v2.x MLLP
                    </button>
                  </div>
                </div>

                {/* Conditional Fields based on connectionType */}
                <div className="border-t border-border/60 pt-4 space-y-4">
                  {config.connectionType === 'LAN' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">LIS Role</label>
                        <select
                          value={config.tcpMode}
                          onChange={(e) => setConfig({ ...config, tcpMode: e.target.value as 'Server' | 'Client' })}
                          className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                        >
                          <option value="Server">Server (analyzer connects to this PC)</option>
                          <option value="Client">Client (this PC connects to analyzer)</option>
                        </select>
                      </div>
                      {config.tcpMode === 'Client' && (
                        <div>
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Analyzer IP Address</label>
                          <input
                            type="text"
                            value={config.tcpHost}
                            onChange={(e) => setConfig({ ...config, tcpHost: e.target.value.trim() })}
                            placeholder="e.g. 192.168.1.50"
                            className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                          />
                        </div>
                      )}
                      <div className={config.tcpMode === 'Client' ? 'col-span-2' : ''}>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{config.tcpMode === 'Client' ? 'Analyzer Port' : 'Listen Port'}</label>
                        <input
                          type="number"
                          value={config.tcpPort}
                          onChange={(e) => setConfig({ ...config, tcpPort: Number(e.target.value) })}
                          placeholder="e.g. 5000"
                          className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">COM Port</label>
                        <input
                          list="detected-com-ports"
                          value={config.comPort}
                          onChange={(e) => setConfig({ ...config, comPort: e.target.value.trim().toUpperCase() })}
                          placeholder="e.g. COM3"
                          className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                        />
                        <datalist id="detected-com-ports">
                          {serialPorts.map((p) => (
                            <option key={p.path} value={p.path}>{p.label}</option>
                          ))}
                        </datalist>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {serialPorts.length ? `Detected: ${serialPorts.map((p) => p.label).join(', ')}` : 'No serial ports detected. Plug in the RS-232/USB cable.'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Baud Rate</label>
                        <select
                          value={config.baudRate}
                          onChange={(e) => setConfig({ ...config, baudRate: Number(e.target.value) })}
                          className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                        >
                          {[4800, 9600, 19200, 38400, 57600, 115200].map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Data Bits</label>
                        <select
                          value={config.dataBits}
                          onChange={(e) => setConfig({ ...config, dataBits: Number(e.target.value) })}
                          className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                        >
                          {[7, 8].map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Parity</label>
                        <select
                          value={config.parity}
                          onChange={(e) => setConfig({ ...config, parity: e.target.value as any })}
                          className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                        >
                          {['none', 'odd', 'even'].map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Stop Bits</label>
                        <select
                          value={config.stopBits}
                          onChange={(e) => setConfig({ ...config, stopBits: Number(e.target.value) })}
                          className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                        >
                          {[1, 2].map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Handshake Bidirectional toggle */}
                <div className="flex items-center justify-between border-t border-border/60 pt-4">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Bidirectional Handshake</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Auto-responds with ACKs (essential for ASTM analyzers)</p>
                  </div>
                  <button
                    onClick={() => setConfig({ ...config, bidirectional: !config.bidirectional })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.bidirectional ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.bidirectional ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* [FEATURE 2]: Auto Approve Normal toggle */}
                <div className="flex items-center justify-between border-t border-border/60 pt-4">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Auto-Approve Normal Results</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Automatically signs off reports with 100% normal ranges</p>
                  </div>
                  <button
                    onClick={() => setConfig({ ...config, autoApproveNormal: !config.autoApproveNormal })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.autoApproveNormal ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.autoApproveNormal ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => handleSaveConfig()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent hover:bg-accent/80 text-foreground py-2.5 text-xs font-bold border transition-all"
                  >
                    <Save className="h-4 w-4" />
                    Save Settings
                  </button>
                </div>
              </div>
            </div>

            {/* CARD 2: PARAMETER MAPS */}
            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b p-4">
                <Database className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-foreground">Parameter Mappings</h3>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Map codes sent by the machine (e.g. <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold font-mono">HGB</code>, <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold font-mono">GLU</code>) to LIS parameters.
                </p>

                {/* Map Form */}
                <div className="bg-muted/40 p-4 rounded-xl border border-border/50 space-y-3">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Add Mapped Parameter</h4>
                  
                  <div className="space-y-2.5">
                    <div>
                      <select
                        value={selectedTestId}
                        onChange={(e) => {
                          setSelectedTestId(e.target.value);
                          setSelectedParamId('');
                        }}
                        className="w-full rounded-xl border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                      >
                        <option value="">Select test type...</option>
                        {tests.map((t) => (
                          <option key={t.id} value={t.id.toString()}>{t.name} ({t.code})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <select
                        disabled={!selectedTestId}
                        value={selectedParamId}
                        onChange={(e) => setSelectedParamId(e.target.value)}
                        className="w-full rounded-xl border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary font-semibold disabled:opacity-50"
                      >
                        <option value="">Select parameter...</option>
                        {selectedTestId &&
                          tests
                            .find((t) => t.id === parseInt(selectedTestId))
                            ?.parameters.filter(p => !p.isHeader)
                            .map((p) => (
                              <option key={p.id} value={p.id.toString()}>{p.name} {p.shortName ? `(${p.shortName})` : ''}</option>
                            ))
                        }
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={mappingMachineCode}
                        onChange={(e) => setMappingMachineCode(e.target.value)}
                        placeholder="Machine Code (e.g. WBC)"
                        className="w-full rounded-xl border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary font-mono font-bold uppercase"
                      />
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={mappingFactor}
                        onChange={(e) => setMappingFactor(e.target.value)}
                        placeholder="× 1"
                        title="Unit conversion: the analyzer value is multiplied by this. E.g. WBC sent in 10³/µL → ×1000 for cells/cu.mm; platelets in 10³/µL → ×0.01 for lakh/cu.mm."
                        aria-label="Multiply analyzer value by"
                        className="w-24 shrink-0 rounded-xl border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                      />
                      <button
                        onClick={handleAddMapping}
                        className="flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-4 text-xs font-bold hover:scale-[1.02] transition-all"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden border border-border/80 rounded-xl bg-background max-h-[220px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-muted text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b">
                        <th className="py-2.5 px-3">Machine Code</th>
                        <th className="py-2.5 px-3">LIS Parameter</th>
                        <th className="py-2.5 px-3">Factor</th>
                        <th className="py-2.5 px-3 w-[50px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(config.parameterMapping).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-xs text-muted-foreground font-medium">
                            No parameter mappings configured.
                            <br />
                            <span className="text-[10px] opacity-70">Codes that equal a parameter&apos;s short name or full name match automatically. Map the rest here, with a unit factor where needed.</span>
                          </td>
                        </tr>
                      ) : (
                        Object.keys(config.parameterMapping).map((code) => {
                          const paramId = config.parameterMapping[code];
                          const details = getParameterDetails(paramId);
                          return (
                            <tr key={code} className="border-b border-border/50 text-xs hover:bg-muted/30">
                              <td className="py-2.5 px-3 font-mono font-bold text-foreground uppercase tracking-wide">{code}</td>
                              <td className="py-2.5 px-3">
                                <span className="font-semibold text-foreground">{details.paramName}</span>
                                <span className="block text-[10px] text-muted-foreground">{details.testName}</span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-muted-foreground">×{config.valueFactors?.[code] ?? 1}</td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  onClick={() => handleDeleteMapping(code)}
                                  className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                                  title="Delete mapping"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            </div>

            {/* CARD 2B: TEST MAPS (BIDIRECTIONAL) */}
            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b p-4">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-foreground">Test Code Mappings (Host Query)</h3>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Map LIS tests to machine host query codes (e.g. Test <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold font-mono">Complete Blood Count</code> &rarr; Machine code <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold font-mono">CBC</code>).
                </p>

                {/* Add Test Map Form */}
                <div className="bg-muted/40 p-4 rounded-xl border border-border/50 space-y-3">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Add Mapped Test</h4>
                  
                  <div className="space-y-2.5">
                    <div>
                      <select
                        value={selectedMappingTestId}
                        onChange={(e) => setSelectedMappingTestId(e.target.value)}
                        className="w-full rounded-xl border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                      >
                        <option value="">Select LIS test...</option>
                        {tests.map((t) => (
                          <option key={t.id} value={t.id.toString()}>{t.name} ({t.code})</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={mappingMachineTestCode}
                        onChange={(e) => setMappingMachineTestCode(e.target.value)}
                        placeholder="Machine Order Code (e.g. CBC)"
                        className="w-full rounded-xl border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary font-mono font-bold uppercase"
                      />
                      <button
                        onClick={handleAddTestMapping}
                        className="flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-4 text-xs font-bold hover:scale-[1.02] transition-all"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden border border-border/80 rounded-xl bg-background max-h-[220px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-muted text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b">
                        <th className="py-2.5 px-3">LIS Test</th>
                        <th className="py-2.5 px-3">Machine Code</th>
                        <th className="py-2.5 px-3 w-[50px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {!config.testMapping || Object.keys(config.testMapping).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-xs text-muted-foreground font-medium">
                            No test mappings configured.
                            <br />
                            <span className="text-[10px] opacity-70">(System will auto-match using test code/shortName)</span>
                          </td>
                        </tr>
                      ) : (
                        Object.keys(config.testMapping).map((testId) => {
                          const machineCode = config.testMapping[testId];
                          const targetTest = tests.find(t => t.id === parseInt(testId));
                          return (
                            <tr key={testId} className="border-b border-border/50 text-xs hover:bg-muted/30">
                              <td className="py-2.5 px-3">
                                <span className="font-semibold text-foreground">{targetTest ? targetTest.name : `Test #${testId}`}</span>
                                <span className="block text-[10px] text-muted-foreground">{targetTest ? targetTest.code : ''}</span>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-foreground uppercase tracking-wide">{machineCode}</td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  onClick={() => handleDeleteTestMapping(testId)}
                                  className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                                  title="Delete mapping"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: LOGS TERMINAL & UNMATCHED SCANS (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* CARD 3: ANALYZER SIMULATOR */}
            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b p-4">
                <ShieldAlert className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-foreground">Interactive Hardware Emulator / Simulator</h3>
              </div>
              <div className="p-5">
                <p className="text-xs text-muted-foreground mb-4">
                  Simulate local TCP/Serial transmissions from Mindray or BioChem analyzers. The emulator compiles ASTM or HL7 data containing recent barcode orders, decodes them through the engine, writes records to SQLite, and updates UI reports.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <select
                      value={simulatorPreset}
                      onChange={(e) => setSimulatorPreset(e.target.value)}
                      className="w-full h-11 rounded-xl border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                    >
                      <option value="Mindray ASTM">Mindray BC-5000 CBC Analyzer (ASTM Protocol)</option>
                      <option value="BioChem HL7">BioChem BS-200 Analyzer (HL7 Protocol)</option>
                      <option value="Mindray ASTM Host Query">Mindray BC-5000 Host Query (ASTM)</option>
                      <option value="BioChem HL7 Host Query">BioChem BS-200 Host Query (HL7)</option>
                      <option value="QC Simulator">QC Control Analyzer (ASTM QC Sample)</option>
                    </select>
                  </div>
                  <button
                    onClick={handleRunSimulation}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white px-6 text-sm font-bold shadow-lg shadow-indigo-500/20 active:scale-[0.98] hover:scale-[1.01] transition-all"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Simulate Device Transmission
                  </button>
                </div>
              </div>
            </div>

            {/* CARD 4: TABBED CONTROL CENTER (TERMINAL + RECONCILIATION) */}
            <div className="rounded-2xl border border-border bg-card shadow-sm flex flex-col h-[560px] overflow-hidden">
              
              {/* Tab Header Selector */}
              <div className="flex border-b border-border select-none">
                <button
                  onClick={() => setRightTab('terminal')}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-all ${
                    rightTab === 'terminal'
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Terminal className="h-4 w-4" />
                    Live Log Terminal
                  </div>
                </button>
                <button
                  onClick={() => setRightTab('orphans')}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-all relative ${
                    rightTab === 'orphans'
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Database className="h-4 w-4" />
                    Unmatched Results Manager
                    {orphans.length > 0 && (
                      <span className="absolute top-2.5 right-6 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white animate-pulse">
                        {orphans.length}
                      </span>
                    )}
                  </div>
                </button>
              </div>

              {/* Conditional Content rendering */}
              {rightTab === 'terminal' ? (
                <div className="flex flex-col flex-1 overflow-hidden">
                  {/* Terminal Header controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b p-4 gap-3 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-primary" />
                      <span className="text-xs font-bold text-muted-foreground">Streaming network buffers</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyLogs}
                        disabled={logs.length === 0}
                        className="flex items-center gap-1.5 rounded-lg border bg-background hover:bg-accent hover:text-foreground text-xs font-semibold px-2.5 py-1.5 transition-colors disabled:opacity-50"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                      <button
                        onClick={handleClearLogs}
                        disabled={logs.length === 0}
                        className="flex items-center gap-1.5 rounded-lg border hover:bg-destructive/10 hover:text-destructive text-xs font-semibold px-2.5 py-1.5 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear
                      </button>
                      <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
                          autoScroll
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'border-border bg-background hover:bg-accent text-muted-foreground'
                        }`}
                      >
                        Auto-Scroll
                      </button>
                    </div>
                  </div>

                  {/* Terminal Filter Bar */}
                  <div className="flex gap-1.5 px-4 py-2 bg-muted/30 border-b border-border/80 overflow-x-auto">
                    {['ALL', 'SYSTEM', 'RAW', 'PARSED', 'ERROR'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setLogFilter(tab)}
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md transition-all ${
                          logFilter === tab
                            ? 'bg-foreground text-background shadow-sm'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {tab === 'RAW' ? 'Raw Packets' : tab === 'PARSED' ? 'Parsed Data' : tab}
                      </button>
                    ))}
                  </div>

                  {/* Terminal Screen */}
                  <div className="flex-1 bg-black/95 font-mono text-[11px] p-4 overflow-y-auto leading-relaxed shadow-inner">
                    {filteredLogs.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-500 italic select-none">
                        No connection logs captured. Start the listener server or run a simulation.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {filteredLogs
                          .slice()
                          .reverse()
                          .map((log) => {
                            let colorClass = 'text-slate-300';
                            if (log.type === 'SYSTEM') colorClass = 'text-indigo-400 font-bold';
                            else if (log.type === 'RAW') colorClass = 'text-emerald-500';
                            else if (log.type === 'PARSED') colorClass = 'text-teal-400 font-semibold';
                            else if (log.type === 'ERROR') colorClass = 'text-rose-450 font-bold';

                            return (
                              <div key={log.id} className="flex items-start gap-2 border-b border-slate-900 pb-1 last:border-b-0">
                                <span className="text-slate-600 select-none flex-shrink-0">
                                  {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                                <span className={`px-1 rounded text-[9px] uppercase font-bold tracking-widest flex-shrink-0 select-none ${
                                  log.type === 'SYSTEM'
                                    ? 'bg-indigo-950 text-indigo-300 border border-indigo-500/20'
                                    : log.type === 'RAW'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/20'
                                    : log.type === 'PARSED'
                                    ? 'bg-teal-950 text-teal-300 border border-teal-500/20'
                                    : 'bg-red-950 text-red-300 border border-red-500/20'
                                }`}>
                                  {log.type}
                                </span>
                                <span className={`${colorClass} break-all whitespace-pre-wrap flex-1`}>
                                  {log.message}
                                </span>
                              </div>
                            );
                          })}
                        <div ref={terminalEndRef} />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* [FEATURE 3]: UNMATCHED (ORPHAN) RECONCILIATION PANEL */
                <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-muted/5">
                  {orphans.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 italic text-center py-24 select-none">
                      <CheckCircle className="h-12 w-12 text-teal-500 mb-3 stroke-[1.5] animate-pulse" />
                      <span className="font-bold text-foreground">All Scans Reconciled!</span>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                        All incoming test analyzer results successfully matched and saved to LIS patient records.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 border border-amber-500/25 p-3 rounded-xl">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        <p className="text-[11px] font-semibold leading-relaxed">
                          Technician ran these tubes on the machine before registering them in the LIS. Select the correct LIS patient order below to save these values.
                        </p>
                      </div>

                      <div className="space-y-4">
                        {orphans.map((o) => (
                          <div key={o.id} className="border border-border rounded-xl p-4 bg-card space-y-3 shadow-sm relative overflow-hidden">
                            {/* Card Header */}
                            <div className="flex items-center justify-between border-b border-border/80 pb-2">
                              <div>
                                <span className="text-xs font-bold text-muted-foreground">Scanned Barcode: </span>
                                <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">{o.barcode}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  {new Date(o.timestamp).toLocaleTimeString()} - {new Date(o.timestamp).toLocaleDateString()}
                                </span>
                                <button
                                  onClick={() => handleDeleteOrphan(o.id)}
                                  className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-colors"
                                  title="Discard unmatched scan"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Parsed results preview */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                              {o.results.map((r, rIdx) => (
                                <div key={rIdx} className="bg-muted/40 border border-border/50 rounded-lg p-2 flex flex-col justify-between">
                                  <span className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-wide">{r.parameter}</span>
                                  <div className="flex items-baseline gap-1 mt-0.5">
                                    <span className="text-xs font-bold text-foreground">{r.value}</span>
                                    <span className="text-[9px] text-muted-foreground font-medium">{r.unit || ''}</span>
                                    {r.flag && (
                                      <span className={`text-[8px] font-extrabold px-1 rounded-sm ${
                                        r.flag.includes('!') ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'
                                      }`}>{r.flag}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Match reconciliation dropdown form */}
                            <div className="flex flex-col sm:flex-row gap-2.5 pt-3 border-t border-border/80">
                              <div className="flex-1">
                                <select
                                  value={reconciliationSelections[o.id] || ''}
                                  onChange={(e) => setReconciliationSelections({
                                    ...reconciliationSelections,
                                    [o.id]: e.target.value
                                  })}
                                  className="w-full rounded-xl border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                                >
                                  <option value="">Select Pending LIS Patient Order...</option>
                                  {pendingOrders.map((po) => (
                                    <option key={po.id} value={po.orderNo}>{po.patientName} ({po.orderNo})</option>
                                  ))}
                                </select>
                              </div>
                              <button
                                onClick={() => handleReconcile(o.id)}
                                className="flex items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 text-xs font-bold hover:scale-[1.01] active:scale-[0.99] shadow transition-all"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                Link Patient
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
    </AppLayout>
  );
}
