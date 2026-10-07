"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { Building2, Printer, Palette, Bell, Shield, Database, Stethoscope, Wifi, Save, Plus, Trash2, XIcon, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { RecoveryCode, postApi, btnPrimary, btnGhost, inputCls } from '@/components/kit';

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}


// Logos and signatures from a phone can be several MB; reports only need a few hundred pixels. Redraws the
// image as PNG (keeps transparency) no larger than maxW x maxH.
function shrinkImage(file: File, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxW / img.width, maxH / img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * k));
      canvas.height = Math.max(1, Math.round(img.height * k));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not an image this app can read. Use PNG or JPG.'));
    };
    img.src = url;
  });
}

const settingsSections = [
  { id: 'lab', name: 'Lab Profile', icon: Building2, desc: 'Lab name, logo, address, NABL number, GST' },
  { id: 'print', name: 'Print Settings', icon: Printer, desc: 'Report header, footer, signature, stamp' },
  { id: 'theme', name: 'Appearance', icon: Palette, desc: 'Dark mode, colors, fonts' },
  { id: 'notify', name: 'Notifications', icon: Bell, desc: 'SMS, Email, WhatsApp gateway settings' },
  { id: 'users', name: 'Staff & Logins', icon: Shield, desc: 'Managed on the Staff screen' },
  { id: 'backup', name: 'Backup & Restore', icon: Database, desc: 'Auto backup schedule, restore' },
  { id: 'doctor', name: 'Doctor/Pathologist', icon: Stethoscope, desc: 'Signing authority, qualifications' },
  { id: 'analyzer', name: 'Analyzer Integration', icon: Wifi, desc: 'Serial port, baud rate, protocol' },
];

const accentColors = [
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Green', value: '#10B981' },
  { name: 'Rose', value: '#F43F5E' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Teal', value: '#14B8A6' },
];

// Report accent colours: dark enough to print well on any printer.
const reportColors = [
  { name: 'Teal', value: '#0e7490' },
  { name: 'Navy', value: '#1e3a8a' },
  { name: 'Green', value: '#15803d' },
  { name: 'Maroon', value: '#9f1239' },
  { name: 'Purple', value: '#6b21a8' },
  { name: 'Black', value: '#1f2937' },
];

// Lab name fonts on the report (the PDF's built-in fonts, so they print the same on every PC).
const nameFonts = [
  { value: 'times', label: 'Classic (serif)', css: '"Times New Roman", Times, serif' },
  { value: 'helvetica', label: 'Modern (sans)', css: 'Arial, Helvetica, sans-serif' },
  { value: 'courier', label: 'Typewriter', css: '"Courier New", Courier, monospace' },
];
const nameSizes = [
  { value: 18, label: 'Small' },
  { value: 22, label: 'Medium' },
  { value: 26, label: 'Normal' },
  { value: 30, label: 'Large' },
  { value: 34, label: 'Extra large' },
  { value: 40, label: 'Huge' },
];

interface UserEntry {
  id: number;
  name: string;
  role: string;
  email: string;
  status: 'Active' | 'Inactive';
}

const roleColors: Record<string, string> = {
  'Super Admin': 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  'Pathologist': 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  'Technician': 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  'Receptionist': 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400',
};

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('lab');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('pathology_lab_current_user');
      if (userStr) {
        try {
          setCurrentUser(JSON.parse(userStr));
        } catch (e) {}
      }
    }
  }, []);

  // Lab Profile state
  const [logo, setLogo] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoRight, setLogoRight] = useState<string | null>(null); // optional second logo, right of the name
  const [labName, setLabName] = useState('');
  const [labMobiles, setLabMobiles] = useState(['', '', '', '']); // up to four, saved comma separated
  const [logoCaption, setLogoCaption] = useState('');
  const [labEmail, setLabEmail] = useState('');
  const [labWebsite, setLabWebsite] = useState('');
  const [labNabl, setLabNabl] = useState('');
  const [labGst, setLabGst] = useState('');
  const [labRegNo, setLabRegNo] = useState('');
  const [labGstPercent, setLabGstPercent] = useState('18');
  const [labAddress, setLabAddress] = useState('');

  // Print Settings state
  const [printHeader, setPrintHeader] = useState('');
  const [printFooter, setPrintFooter] = useState('');
  const [printShowLogo, setPrintShowLogo] = useState(true);
  const [printShowQR, setPrintShowQR] = useState(true);
  const [letterhead, setLetterhead] = useState(false);
  const [letterheadTopMm, setLetterheadTopMm] = useState(40);
  const [letterheadBottomMm, setLetterheadBottomMm] = useState(20);
  const [printColor, setPrintColor] = useState('#0e7490');
  const [printFontSize, setPrintFontSize] = useState(10);
  const [printNameFont, setPrintNameFont] = useState('times');
  const [printNameSize, setPrintNameSize] = useState(26);
  const [printNameColor, setPrintNameColor] = useState(''); // '' = darker report colour
  const [printPageBreak, setPrintPageBreak] = useState('continuous');

  // Appearance state
  const [darkMode, setDarkMode] = useState(false);
  const [accentColor, setAccentColor] = useState('#3B82F6');

  // Notifications state
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [smsGateway, setSmsGateway] = useState('');
  const [emailSmtp, setEmailSmtp] = useState('smtp.gmail.com');
  const [whatsappApi, setWhatsappApi] = useState('');

  // User Management state
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('Technician');
  const [newUserEmail, setNewUserEmail] = useState('');

  // Backup Settings state
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupTime, setBackupTime] = useState('08:00');
  const [backupRetention, setBackupRetention] = useState('30');

  // Doctor/Pathologist state
  const [doctorName, setDoctorName] = useState('');
  const [doctorQualification, setDoctorQualification] = useState('');
  const [doctorRegNo, setDoctorRegNo] = useState('');
  const [doctorSignature, setDoctorSignature] = useState('Enabled');

  // Pathology Doctor state
  const [pathologyDoctorName, setPathologyDoctorName] = useState('');
  const [pathologyDoctorQualification, setPathologyDoctorQualification] = useState('');
  const [pathologyDoctorRegNo, setPathologyDoctorRegNo] = useState('');

  // Technician state
  const [technicianName, setTechnicianName] = useState('');
  const [technicianQualification, setTechnicianQualification] = useState('');
  const [technicianRegNo, setTechnicianRegNo] = useState('');
  const [coSigningEnabled, setCoSigningEnabled] = useState(false);

  // Signatures files states
  const [technicianSignature, setTechnicianSignature] = useState<string | null>(null);
  const [technicianSignaturePreview, setTechnicianSignaturePreview] = useState<string | null>(null);

  const [doctorSignatureImage, setDoctorSignatureImage] = useState<string | null>(null);
  const [doctorSignaturePreview, setDoctorSignaturePreview] = useState<string | null>(null);

  const [pathologyDoctorSignatureImage, setPathologyDoctorSignatureImage] = useState<string | null>(null);
  const [pathologyDoctorSignaturePreview, setPathologyDoctorSignaturePreview] = useState<string | null>(null);

  // Analyzer state
  const [analyzerPort, setAnalyzerPort] = useState('COM3');
  const [analyzerBaud, setAnalyzerBaud] = useState('9600');
  const [analyzerProtocol, setAnalyzerProtocol] = useState('HL7');
  const [analyzerAutoImport, setAnalyzerAutoImport] = useState(true);

  const loadSettingsAndUsers = async () => {
    try {
      // 1. Load lab profile settings from db
      const profile = await db.query('labSettings', 'findFirst', { where: { id: 1 } });
      if (profile) {
        setLabName(profile.labName || '');
        // Older versions had one free-text number field; anything past the third number lands in the fourth box.
        const nums = String(profile.mobile || '').split(/\s*[,;/|\n]+\s*/).filter(Boolean);
        setLabMobiles([nums[0] || '', nums[1] || '', nums[2] || '', nums.slice(3).join(', ')]);
        setLogoCaption(profile.logoCaption || '');
        setPrintColor(profile.printColor || '#0e7490');
        setPrintFontSize(profile.printFontSize || 10);
        setPrintNameFont(profile.printNameFont || 'times');
        setPrintNameSize(profile.printNameSize || 26);
        setPrintNameColor(profile.printNameColor || '');
        setPrintPageBreak(profile.printPageBreak || 'continuous');
        setLabEmail(profile.email || '');
        setLabWebsite(profile.website || '');
        setLabAddress(profile.address || '');
        setLabGst(profile.gstNumber || '');
        setLabRegNo(profile.registrationNo || '');
        setPrintFooter(profile.reportFooter || '');
        setDoctorName(profile.doctorName || '');
        setDoctorQualification(profile.doctorQualification || '');
        setDoctorRegNo(profile.doctorRegNo || '');
        setPathologyDoctorName(profile.pathologyDoctorName || '');
        setPathologyDoctorQualification(profile.pathologyDoctorQualification || '');
        setPathologyDoctorRegNo(profile.pathologyDoctorRegNo || '');
        setTechnicianName(profile.technicianName || '');
        setTechnicianQualification(profile.technicianQualification || '');
        setTechnicianRegNo(profile.technicianRegNo || '');
        setPrintHeader(profile.printHeader || '');
        setLabNabl(profile.nablNumber || '');
        setPrintShowLogo(profile.printShowLogo !== false);
        setPrintShowQR(profile.printShowQR !== false);
        setDoctorSignature(profile.printSignatures === false ? 'Disabled' : 'Enabled');
        setCoSigningEnabled(profile.coSigning === true);
        setLetterhead(profile.letterhead === true);
        setLetterheadTopMm(profile.letterheadTopMm ?? 40);
        setLetterheadBottomMm(profile.letterheadBottomMm ?? 20);
        if (profile.logo) {
          let base64Logo = '';
          if (profile.logo.type === 'Buffer' && Array.isArray(profile.logo.data)) {
            base64Logo = `data:image/png;base64,${arrayBufferToBase64(new Uint8Array(profile.logo.data))}`;
          } else if (profile.logo instanceof Uint8Array || profile.logo instanceof ArrayBuffer) {
            base64Logo = `data:image/png;base64,${arrayBufferToBase64(profile.logo)}`;
          } else if (typeof profile.logo === 'string') {
            base64Logo = profile.logo.startsWith('data:') ? profile.logo : `data:image/png;base64,${profile.logo}`;
          }
          setLogo(base64Logo);
          setLogoPreview(base64Logo);
        }

        const parseBufferToB64 = (buf: any) => {
          if (!buf) return null;
          if (buf.type === 'Buffer' && Array.isArray(buf.data)) {
            return `data:image/png;base64,${arrayBufferToBase64(new Uint8Array(buf.data))}`;
          } else if (buf instanceof Uint8Array || buf instanceof ArrayBuffer) {
            return `data:image/png;base64,${arrayBufferToBase64(buf)}`;
          } else if (typeof buf === 'string') {
            return buf.startsWith('data:') ? buf : `data:image/png;base64,${buf}`;
          }
          return null;
        };

        setLogoRight(parseBufferToB64(profile.logoRight));
        if (profile.signature) {
          const sig = parseBufferToB64(profile.signature);
          setDoctorSignatureImage(sig);
          setDoctorSignaturePreview(sig);
        }
        if (profile.technicianSignature) {
          const sig = parseBufferToB64(profile.technicianSignature);
          setTechnicianSignature(sig);
          setTechnicianSignaturePreview(sig);
        }
        if (profile.pathologyDoctorSignature) {
          const sig = parseBufferToB64(profile.pathologyDoctorSignature);
          setPathologyDoctorSignatureImage(sig);
          setPathologyDoctorSignaturePreview(sig);
        }
      }

      // 2. Load users from db
      const dbUsers = await db.query('user', 'findMany', { where: { deletedAt: null } });
      if (dbUsers && dbUsers.length > 0) {
        setUsers(dbUsers.map((u: any) => ({
          id: u.id,
          name: u.name,
          role: u.role === 'SUPER_ADMIN' ? 'Super Admin' : u.role === 'PATHOLOGIST' ? 'Pathologist' : u.role === 'TECHNICIAN' ? 'Technician' : 'Receptionist',
          email: u.email,
          status: u.isActive ? 'Active' : 'Inactive'
        })));
      }

      // 3. Load non-profile settings from localStorage (for browser-side layout support)
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('pathology_lab_general_settings');
        if (stored) {
          const s = JSON.parse(stored);
          setDarkMode(!!s.darkMode);
          setAccentColor(s.accentColor || '#3B82F6');
          setSmsEnabled(!!s.smsEnabled);
          setEmailEnabled(s.emailEnabled !== false);
          setWhatsappEnabled(!!s.whatsappEnabled);
          setSmsGateway(s.smsGateway || '');
          setEmailSmtp(s.emailSmtp || 'smtp.gmail.com');
          setWhatsappApi(s.whatsappApi || '');
          setAutoBackup(s.autoBackup !== false);
          setBackupTime(s.backupTime || '08:00');
          setBackupRetention(s.backupRetention || '30');
          setAnalyzerPort(s.analyzerPort || 'COM3');
          setAnalyzerBaud(s.analyzerBaud || '9600');
          setAnalyzerProtocol(s.analyzerProtocol || 'HL7');
          setAnalyzerAutoImport(s.analyzerAutoImport !== false);
          setLabGstPercent(s.labGstPercent || '18');
        }
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsAndUsers();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleSave = async (section: string) => {
    try {
      if (section === 'Lab Profile' || section === 'Print Settings' || section === 'Doctor/Pathologist') {
        const updateData = {
          labName,
          address: labAddress,
          mobile: labMobiles.map(m => m.trim()).filter(Boolean).join(', '),
          logoCaption,
          printColor,
          printFontSize,
          printNameFont,
          printNameSize,
          printNameColor: printNameColor || null,
          printPageBreak,
          email: labEmail,
          website: labWebsite,
          gstNumber: labGst,
          registrationNo: labRegNo,
          reportFooter: printFooter,
          doctorName,
          doctorQualification,
          doctorRegNo,
          pathologyDoctorName,
          pathologyDoctorQualification,
          pathologyDoctorRegNo,
          technicianName,
          technicianQualification,
          technicianRegNo,
          printHeader,
          nablNumber: labNabl,
          printShowLogo,
          printShowQR,
          printSignatures: doctorSignature === 'Enabled',
          coSigning: coSigningEnabled,
          letterhead,
          letterheadTopMm: Math.max(0, Math.min(120, Math.round(Number(letterheadTopMm) || 0))),
          letterheadBottomMm: Math.max(0, Math.min(80, Math.round(Number(letterheadBottomMm) || 0))),
          logo,
          logoRight,
          signature: doctorSignatureImage,
          technicianSignature: technicianSignature,
          pathologyDoctorSignature: pathologyDoctorSignatureImage
        };

        await db.query('labSettings', 'upsert', {
          where: { id: 1 },
          update: updateData,
          create: updateData
        });
      }

      // Also save all visual and device configurations to local storage for instant layout loads
      if (typeof window !== 'undefined') {
        const s = {
          darkMode,
          accentColor,
          smsEnabled,
          emailEnabled,
          whatsappEnabled,
          smsGateway,
          emailSmtp,
          whatsappApi,
          autoBackup,
          backupTime,
          backupRetention,
          analyzerPort,
          analyzerBaud,
          analyzerProtocol,
          analyzerAutoImport,
          labGstPercent
        };
        localStorage.setItem('pathology_lab_general_settings', JSON.stringify(s));
      }

      setToast({ message: `${section} saved successfully!`, type: 'success' });
    } catch (err) {
      console.error('Failed to save settings:', err);
      setToast({ message: `Failed to save ${section}`, type: 'error' });
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, side: 'left' | 'right' = 'left') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const png = await shrinkImage(file, 600, 600);
      if (side === 'right') return setLogoRight(png);
      setLogo(png);
      setLogoPreview(png);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleRemoveLogo = () => {
    setLogo(null);
    setLogoPreview(null);
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>, role: 'technician' | 'doctor' | 'pathology') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let base64: string;
    try {
      base64 = await shrinkImage(file, 600, 200);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
      return;
    }
    if (role === 'technician') {
      setTechnicianSignature(base64);
      setTechnicianSignaturePreview(base64);
    } else if (role === 'doctor') {
      setDoctorSignatureImage(base64);
      setDoctorSignaturePreview(base64);
    } else if (role === 'pathology') {
      setPathologyDoctorSignatureImage(base64);
      setPathologyDoctorSignaturePreview(base64);
    }
  };

  const removeSignature = (role: 'technician' | 'doctor' | 'pathology') => {
    if (role === 'technician') {
      setTechnicianSignature(null);
      setTechnicianSignaturePreview(null);
    } else if (role === 'doctor') {
      setDoctorSignatureImage(null);
      setDoctorSignaturePreview(null);
    } else if (role === 'pathology') {
      setPathologyDoctorSignatureImage(null);
      setPathologyDoctorSignaturePreview(null);
    }
  };

  const toggleDarkMode = () => {
    const nextVal = !darkMode;
    setDarkMode(nextVal);
    document.documentElement.classList.toggle('dark', nextVal);
    // Instant save appearance
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pathology_lab_general_settings');
      const current = stored ? JSON.parse(stored) : {};
      current.darkMode = nextVal;
      localStorage.setItem('pathology_lab_general_settings', JSON.stringify(current));
    }
  };

  const SaveButton = ({ section }: { section: string }) => (
    <div className="flex justify-end pt-2">
      <button 
        onClick={() => handleSave(section)} 
        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 btn-primary-glow transition-all"
      >
        <Save className="h-4 w-4" />
        Save Settings
      </button>
    </div>
  );

  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <button onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  if (loading) {
    return (
      <AppLayout title="Settings" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Settings' }]}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-muted-foreground font-semibold text-lg animate-pulse flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Loading Lab Settings...
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Settings" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Settings' }]}>
      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar */}
        <div className="col-span-3 space-y-1.5">
          {settingsSections.map((s) => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center gap-3 rounded-lg px-4 py-3.5 text-left transition-colors ${activeSection === s.id ? 'bg-primary/10 text-primary border border-primary/30' : 'hover:bg-accent text-foreground'}`}>
              <s.icon className="h-4 w-4 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="col-span-9">
          <motion.div key={activeSection} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow duration-200">

            {/* ─── Lab Profile ─── */}
            {activeSection === 'lab' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Lab Profile</h3>
                <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">Changes here print on reports approved from now on. Reports already approved keep the details they were approved with.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Lab Name</label>
                    <input type="text" value={labName} onChange={e => setLabName(e.target.value)}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mobile Numbers <span className="normal-case font-normal">(up to 4, all print on the report)</span></span>
                    <div className="mt-1 grid grid-cols-4 gap-2">
                      {labMobiles.map((m, i) => (
                        <input key={i} type="tel" aria-label={`Mobile ${i + 1}`} placeholder={i === 0 ? 'Mobile 1' : `Mobile ${i + 1} (optional)`} value={m}
                          onChange={e => setLabMobiles(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Email</label>
                    <input type="email" value={labEmail} onChange={e => setLabEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Website</label>
                    <input type="text" value={labWebsite} onChange={e => setLabWebsite(e.target.value)}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">NABL Number</label>
                    <input type="text" value={labNabl} onChange={e => setLabNabl(e.target.value)}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">GST Number</label>
                    <input type="text" value={labGst} onChange={e => setLabGst(e.target.value)}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Registration No</label>
                    <input type="text" value={labRegNo} onChange={e => setLabRegNo(e.target.value)}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">GST %</label>
                    <input type="number" value={labGstPercent} onChange={e => setLabGstPercent(e.target.value)}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Address</label>
                    <textarea rows={2} value={labAddress} onChange={e => setLabAddress(e.target.value)}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="col-span-2 border-t pt-4 mt-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Lab Logo</label>
                    <div className="flex items-center gap-4">
                      {logoPreview ? (
                        <div className="relative h-16 w-16 border rounded-lg overflow-hidden bg-white flex items-center justify-center p-1 shadow-sm">
                          <img src={logoPreview} className="h-full w-full object-contain" alt="Lab Logo" />
                        </div>
                      ) : (
                        <div className="h-16 w-16 border border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-muted-foreground text-xs text-center px-1">
                          No Logo
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" id="logo-upload-input" />
                          <label htmlFor="logo-upload-input" className="cursor-pointer text-xs font-semibold border rounded-lg px-3 py-2 hover:bg-accent bg-background transition-colors">
                            Upload Logo
                          </label>
                          {logoPreview && (
                            <button type="button" onClick={handleRemoveLogo} className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors">
                              Remove Logo
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">PNG or JPG, square or landscape, on a white or transparent background.</p>
                      </div>
                    </div>
                    <label htmlFor="logo-caption" className="mt-4 text-xs font-bold text-muted-foreground uppercase tracking-wider block">Caption under the logo</label>
                    <input id="logo-caption" type="text" maxLength={60} value={logoCaption} onChange={e => setLogoCaption(e.target.value)} placeholder="e.g. 24 Hour Emergency Service"
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    <span className="mt-4 text-xs font-bold text-muted-foreground uppercase tracking-wider block">Second logo, right side <span className="normal-case font-normal">(optional, e.g. NABL or a partner)</span></span>
                    <div className="mt-2 flex items-center gap-4">
                      {logoRight ? (
                        <div className="h-16 w-16 border rounded-lg overflow-hidden bg-white flex items-center justify-center p-1 shadow-sm">
                          <img src={logoRight} className="h-full w-full object-contain" alt="Right logo" />
                        </div>
                      ) : (
                        <div className="h-16 w-16 border border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-muted-foreground text-xs text-center px-1">No Logo</div>
                      )}
                      <input type="file" accept="image/*" onChange={e => handleLogoUpload(e, 'right')} className="hidden" id="logo-right-upload-input" />
                      <label htmlFor="logo-right-upload-input" className="cursor-pointer text-xs font-semibold border rounded-lg px-3 py-2 hover:bg-accent bg-background transition-colors">
                        Upload Right Logo
                      </label>
                      {logoRight && (
                        <button type="button" onClick={() => setLogoRight(null)} className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors">Remove</button>
                      )}
                    </div>
                  </div>
                </div>
                <SaveButton section="Lab Profile" />
              </div>
            )}

            {/* ─── Print Settings ─── */}
            {activeSection === 'print' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Print Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="print-header" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tagline under the lab name</label>
                    <input id="print-header" type="text" value={printHeader} onChange={e => setPrintHeader(e.target.value)} placeholder="e.g. Advanced Diagnostics & Research Centre"
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label htmlFor="print-footer" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Report footer note</label>
                    <textarea id="print-footer" rows={2} value={printFooter} onChange={e => setPrintFooter(e.target.value)} placeholder="Results relate only to the sample tested. This is a computer-generated report; kindly correlate clinically."
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground">The tagline and footer note are frozen into each report when it is approved. The options below decide how any report prints, including old ones.</p>
                  <div className="rounded-lg border p-4 space-y-3">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Lab name on the report</span>
                    <div className="rounded-lg border bg-white px-3 py-4 text-center overflow-hidden">
                      <span data-testid="name-preview" style={{ fontFamily: nameFonts.find(f => f.value === printNameFont)?.css, fontSize: `${printNameSize * 0.9}px`, color: printNameColor || printColor, filter: printNameColor ? undefined : 'brightness(0.62)', fontWeight: 700 }}>
                        {(labName || 'Your Lab Name').toUpperCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <label className="block">
                        <span className="text-xs text-muted-foreground">Font</span>
                        <select aria-label="Lab name font" value={printNameFont} onChange={e => setPrintNameFont(e.target.value)}
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                          {nameFonts.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs text-muted-foreground">Size</span>
                        <select aria-label="Lab name size" value={printNameSize} onChange={e => setPrintNameSize(Number(e.target.value))}
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                          {nameSizes.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
                        </select>
                      </label>
                      <div>
                        <span className="text-xs text-muted-foreground">Colour</span>
                        <div className="mt-1 flex items-center gap-2">
                          <input type="color" aria-label="Lab name colour" value={printNameColor || '#1f2937'} onChange={e => setPrintNameColor(e.target.value)}
                            className="h-9 w-12 cursor-pointer rounded border bg-background" />
                          <button type="button" onClick={() => setPrintNameColor('')} aria-pressed={!printNameColor}
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${!printNameColor ? 'ring-2 ring-primary border-primary' : 'hover:bg-accent'}`}>
                            Match report colour
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">The name is always centred. A long name shrinks, then goes onto two lines, so it is never cut off.</p>
                  </div>
                  <label className="block rounded-lg border p-4">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">When a patient has several tests</span>
                    <select aria-label="When a patient has several tests" value={printPageBreak} onChange={e => setPrintPageBreak(e.target.value)}
                      className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="continuous">All tests together (signatures on the last page)</option>
                      <option value="department">Each department on a new page (signatures on every page)</option>
                      <option value="test">Each test on a new page (signatures on every page)</option>
                    </select>
                    <span className="mt-2 block text-xs text-muted-foreground">A test is never split over two pages when it fits on one.</span>
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Report colour</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {reportColors.map(c => (
                          <button key={c.value} type="button" onClick={() => setPrintColor(c.value)} aria-pressed={printColor === c.value}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${printColor === c.value ? 'ring-2 ring-primary border-primary' : 'hover:bg-accent'}`}>
                            <span className="h-4 w-4 rounded-full" style={{ backgroundColor: c.value }} />
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="block rounded-lg border p-4">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Result text size</span>
                      <select value={printFontSize} onChange={e => setPrintFontSize(Number(e.target.value))}
                        className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                        <option value={9}>Compact (fits more on a page)</option>
                        <option value={10}>Normal</option>
                        <option value={11}>Large</option>
                        <option value={12}>Extra large</option>
                      </select>
                      <span className="mt-2 block text-xs text-muted-foreground">High results print with a red ▲, low with a blue ▼.</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3 rounded-lg border p-4">
                      <Toggle checked={printShowLogo} onChange={setPrintShowLogo} label="Show Lab Logo" />
                      <Toggle checked={printShowQR} onChange={setPrintShowQR} label="Show QR Code" />
                    </div>
                    <div className="space-y-3 rounded-lg border p-4">
                      <Toggle checked={letterhead} onChange={setLetterhead} label="Print on pre-printed letterhead" />
                      <p className="text-xs text-muted-foreground">Leaves the top and bottom of every page blank for your printed letterhead paper.</p>
                      {letterhead && (
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Top space (mm)</span>
                            <input type="number" min={0} max={120} value={letterheadTopMm} onChange={e => setLetterheadTopMm(Number(e.target.value))}
                              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </label>
                          <label className="block">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Bottom space (mm)</span>
                            <input type="number" min={0} max={80} value={letterheadBottomMm} onChange={e => setLetterheadBottomMm(Number(e.target.value))}
                              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <SaveButton section="Print Settings" />
              </div>
            )}

            {/* ─── Appearance ─── */}
            {activeSection === 'theme' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Appearance</h3>
                <div className="space-y-5">
                  <div className="rounded-lg border p-4">
                    <Toggle checked={darkMode} onChange={() => toggleDarkMode()} label="Dark Mode" />
                    <p className="text-xs text-muted-foreground mt-1 ml-0">Switch between light and dark themes</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Accent Color</label>
                    <div className="mt-2 flex gap-3 flex-wrap">
                      {accentColors.map(c => (
                        <button key={c.value} onClick={() => setAccentColor(c.value)}
                          className={`flex items-center gap-3 rounded-xl border px-5 py-3 text-sm font-semibold transition-all ${accentColor === c.value ? 'ring-2 ring-primary border-primary shadow-sm' : 'hover:bg-accent'}`}>
                          <span className="h-5 w-5 rounded-full border" style={{ backgroundColor: c.value }} />
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <SaveButton section="Appearance" />
              </div>
            )}

            {/* ─── Notifications ─── */}
            {activeSection === 'notify' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
                <div className="space-y-4">
                  <div className="rounded-lg border p-4 space-y-3">
                    <Toggle checked={smsEnabled} onChange={setSmsEnabled} label="SMS Notifications" />
                    {smsEnabled && (
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">SMS Gateway API Key</label>
                        <input type="text" value={smsGateway} onChange={e => setSmsGateway(e.target.value)} placeholder="Enter API key..."
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border p-4 space-y-3">
                    <Toggle checked={emailEnabled} onChange={setEmailEnabled} label="Email Notifications" />
                    {emailEnabled && (
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">SMTP Server</label>
                        <input type="text" value={emailSmtp} onChange={e => setEmailSmtp(e.target.value)}
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border p-4 space-y-3">
                    <Toggle checked={whatsappEnabled} onChange={setWhatsappEnabled} label="WhatsApp Notifications" />
                    {whatsappEnabled && (
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">WhatsApp Business API</label>
                        <input type="text" value={whatsappApi} onChange={e => setWhatsappApi(e.target.value)} placeholder="Enter API endpoint..."
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    )}
                  </div>
                </div>
                <SaveButton section="Notifications" />
              </div>
            )}

            {/* ─── User Management ─── */}
            {activeSection === 'users' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Staff & Logins</h3>
                <div className="rounded-xl border bg-muted/30 p-5">
                  <p className="text-sm text-muted-foreground">Staff, their logins, roles and shifts are managed on the Staff screen (lab owner / admin only). Every login has its own password; nobody gets a shared default password.</p>
                  <a href="/staff" className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Open Staff & Logins</a>
                </div>
                <OwnerRecoveryCard />
              </div>
            )}

            {/* ─── Backup & Restore ─── */}
            {activeSection === 'backup' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Backup & Restore</h3>
                <div className="rounded-xl border bg-muted/30 p-5">
                  <p className="text-sm text-muted-foreground">Backups are real copies of the lab database: one is made automatically every day, and you can back up now, save a copy to a pendrive, or restore from the Backup screen.</p>
                  <a href="/backup" className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Open Backup</a>
                </div>
              </div>
            )}

            {/* ─── Doctor/Pathologist ─── */}
            {activeSection === 'doctor' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-lg font-semibold text-foreground">Signatures & Authorities</h3>
                  <p className="text-xs text-muted-foreground font-medium">Manage credentials that appear on printed reports</p>
                </div>
                <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">Changes here print on reports approved from now on. Reports already approved keep the details they were approved with.</p>
                
                {/* 1. Medical Lab Technician Section */}
                <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider">1. Medical Lab Technician</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Technician Name</label>
                      <input type="text" value={technicianName} onChange={e => setTechnicianName(e.target.value)}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Qualification</label>
                      <input type="text" value={technicianQualification} onChange={e => setTechnicianQualification(e.target.value)}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Reg No / Description</label>
                      <input type="text" value={technicianRegNo} onChange={e => setTechnicianRegNo(e.target.value)} placeholder="e.g. DMLT, BMLT"
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    
                    <div className="md:col-span-3 border-t pt-3 mt-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Technician Signature Image</label>
                      <div className="flex items-center gap-4">
                        {technicianSignaturePreview ? (
                          <div className="relative h-12 w-28 border rounded bg-white flex items-center justify-center p-1 shadow-sm">
                            <img src={technicianSignaturePreview} className="h-full w-full object-contain" alt="Technician Signature" />
                          </div>
                        ) : (
                          <div className="h-12 w-28 border border-dashed border-muted-foreground/30 rounded flex items-center justify-center text-muted-foreground text-xs text-center">
                            No Signature
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input type="file" accept="image/*" onChange={(e) => handleSignatureUpload(e, 'technician')} className="hidden" id="tech-sig-upload" />
                          <label htmlFor="tech-sig-upload" className="cursor-pointer text-xs font-semibold border rounded px-3 py-1.5 hover:bg-accent bg-background transition-colors">
                            Upload Signature
                          </label>
                          {technicianSignaturePreview && (
                            <button type="button" onClick={() => removeSignature('technician')} className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors">
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Doctor (Approved By / Pathologist 1) Section */}
                <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider">2. Pathologist Doctor (Approved By)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Doctor Name</label>
                      <input type="text" value={doctorName} onChange={e => setDoctorName(e.target.value)}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Qualification</label>
                      <input type="text" value={doctorQualification} onChange={e => setDoctorQualification(e.target.value)}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Registration No</label>
                      <input type="text" value={doctorRegNo} onChange={e => setDoctorRegNo(e.target.value)}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>

                    <div className="md:col-span-3 border-t pt-3 mt-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Doctor Signature Image</label>
                      <div className="flex items-center gap-4">
                        {doctorSignaturePreview ? (
                          <div className="relative h-12 w-28 border rounded bg-white flex items-center justify-center p-1 shadow-sm">
                            <img src={doctorSignaturePreview} className="h-full w-full object-contain" alt="Doctor Signature" />
                          </div>
                        ) : (
                          <div className="h-12 w-28 border border-dashed border-muted-foreground/30 rounded flex items-center justify-center text-muted-foreground text-xs text-center">
                            No Signature
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input type="file" accept="image/*" onChange={(e) => handleSignatureUpload(e, 'doctor')} className="hidden" id="doctor-sig-upload" />
                          <label htmlFor="doctor-sig-upload" className="cursor-pointer text-xs font-semibold border rounded px-3 py-1.5 hover:bg-accent bg-background transition-colors">
                            Upload Signature
                          </label>
                          {doctorSignaturePreview && (
                            <button type="button" onClick={() => removeSignature('doctor')} className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors">
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Pathology Doctor (Pathologist 2) Section */}
                {!coSigningEnabled ? (
                  <div className="rounded-lg border border-dashed border-primary/30 p-5 flex flex-col items-center justify-center text-center bg-muted/5">
                    <p className="text-xs text-muted-foreground mb-3">Do you need a second Pathologist for co-signing reports?</p>
                    <button
                      type="button"
                      onClick={() => setCoSigningEnabled(true)}
                      className="flex items-center gap-2 rounded-lg border border-primary text-primary hover:bg-primary hover:text-primary-foreground px-4 py-2 text-xs font-bold transition-all"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Co-Signing Pathologist (Doctor 2)
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-lg border p-4 bg-muted/20 animate-fade-in-up">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider">3. Co-Signing Pathologist (Doctor 2)</h4>
                      <button
                        type="button"
                        onClick={() => {
                          setCoSigningEnabled(false);
                        }}
                        className="flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-white hover:bg-red-500 border border-red-500 rounded px-2.5 py-1 transition-all"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete Doctor 2
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Doctor Name</label>
                        <input type="text" value={pathologyDoctorName} onChange={e => setPathologyDoctorName(e.target.value)}
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Qualification</label>
                        <input type="text" value={pathologyDoctorQualification} onChange={e => setPathologyDoctorQualification(e.target.value)}
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Registration No</label>
                        <input type="text" value={pathologyDoctorRegNo} onChange={e => setPathologyDoctorRegNo(e.target.value)}
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>

                      <div className="md:col-span-3 border-t pt-3 mt-1">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Pathologist Signature Image</label>
                        <div className="flex items-center gap-4">
                          {pathologyDoctorSignaturePreview ? (
                            <div className="relative h-12 w-28 border rounded bg-white flex items-center justify-center p-1 shadow-sm">
                              <img src={pathologyDoctorSignaturePreview} className="h-full w-full object-contain" alt="Pathology Doctor Signature" />
                            </div>
                          ) : (
                            <div className="h-12 w-28 border border-dashed border-muted-foreground/30 rounded flex items-center justify-center text-muted-foreground text-xs text-center">
                              No Signature
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <input type="file" accept="image/*" onChange={(e) => handleSignatureUpload(e, 'pathology')} className="hidden" id="pathology-sig-upload" />
                            <label htmlFor="pathology-sig-upload" className="cursor-pointer text-xs font-semibold border rounded px-3 py-1.5 hover:bg-accent bg-background transition-colors">
                              Upload Signature
                            </label>
                            {pathologyDoctorSignaturePreview && (
                              <button type="button" onClick={() => removeSignature('pathology')} className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors">
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border p-4">
                  <Toggle checked={doctorSignature === 'Enabled'} onChange={(v) => setDoctorSignature(v ? 'Enabled' : 'Disabled')} label="Show Signatures on PDF Reports" />
                  <p className="text-xs text-muted-foreground mt-1">If enabled, the signatures of these authorities will automatically print at the bottom of pathology reports.</p>
                </div>

                <SaveButton section="Doctor/Pathologist" />
              </div>
            )}

            {/* ─── Analyzer Integration ─── */}
            {activeSection === 'analyzer' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Analyzer Integration</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Serial Port</label>
                      <select value={analyzerPort} onChange={e => setAnalyzerPort(e.target.value)}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                        {['COM1', 'COM2', 'COM3', 'COM4', 'COM5'].map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Baud Rate</label>
                      <select value={analyzerBaud} onChange={e => setAnalyzerBaud(e.target.value)}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                        {['4800', '9600', '19200', '38400', '57600', '115200'].map(b => <option key={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Protocol</label>
                      <select value={analyzerProtocol} onChange={e => setAnalyzerProtocol(e.target.value)}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                        {['HL7', 'ASTM', 'LIS2-A2', 'Custom'].map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <div className="w-full rounded-lg border p-3">
                        <Toggle checked={analyzerAutoImport} onChange={setAnalyzerAutoImport} label="Auto Import Results" />
                      </div>
                    </div>
                  </div>
                </div>
                <SaveButton section="Analyzer Integration" />
              </div>
            )}

          </motion.div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'} fixed bottom-6 right-6 z-[200]`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}

// Owner only: whether a recovery code exists, and making a new one (the old one stops working).
function OwnerRecoveryCard() {
  const [status, setStatus] = useState<{ isOwner: boolean; hasCode: boolean } | null>(null);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    fetch('/api/auth/recovery-code').then(r => r.json()).then(setStatus).catch(() => {});
  }, []);
  if (!status?.isOwner) return null;

  const make = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      setCode((await postApi('auth/recovery-code', { password })).recoveryCode);
      setStatus({ isOwner: true, hasCode: true });
      setAsking(false);
      setPassword('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-5">
      <p className="text-sm font-semibold text-foreground">Owner recovery code</p>
      <p className="text-sm text-muted-foreground">
        {status.hasCode
          ? 'You have a recovery code. If you forget your password, use it on the sign-in screen (Forgot password or email?).'
          : 'You do not have a recovery code yet. Without one, a forgotten owner password cannot be reset. Make one now and write it down.'}
      </p>
      {code ? (
        <RecoveryCode code={code} continueLabel="Done" onContinue={() => setCode('')} />
      ) : asking ? (
        <form onSubmit={make} className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Your current password</span>
            <input type="password" autoFocus autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={`${inputCls} h-10`} />
          </label>
          <button type="submit" disabled={!password} className={btnPrimary}>Make new code</button>
          <button type="button" onClick={() => { setAsking(false); setError(''); }} className={btnGhost}>Cancel</button>
          {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
        </form>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className={status.hasCode ? btnGhost : btnPrimary}>
          {status.hasCode ? 'Make a new recovery code' : 'Make my recovery code'}
        </button>
      )}
    </div>
  );
}
