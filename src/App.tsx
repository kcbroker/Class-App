import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Clock, MapPin, User, Users, ChevronRight, X, CheckCircle2, AlertCircle, Loader2, Settings, Mail, ExternalLink } from 'lucide-react';
import { cn } from './lib/utils';
import { ClassItem } from './types';

// --- Utils ---

const parseDate = (str: string | undefined) => {
  if (!str) return null;
  // Handle YYYY-MM-DD
  let match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  // Handle M/D/YYYY or MM/DD/YYYY
  match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
  }
  // Fallback
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

const getCentralToday = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(now);
  
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  
  return new Date(Number(year), Number(month) - 1, Number(day));
};

// --- Components ---

const Header = () => (
  <header className="border-b border-gray-100 bg-white sticky top-0 z-10">
    <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white font-bold text-xl">KW</div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">KW Classes</h1>
      </div>
      <nav className="flex items-center gap-6">
        <a href="/" className="text-sm font-medium text-gray-600 hover:text-primary">Catalog</a>
        <a href="/admin" className="text-sm font-medium text-gray-600 hover:text-primary flex items-center gap-1">
          <Settings className="w-4 h-4" />
          Admin
        </a>
      </nav>
    </div>
  </header>
);

const ClassCard = ({ item, onRegister }: { item: ClassItem; onRegister: (item: ClassItem) => void }) => {
  const isSelfPaced = item.type?.toLowerCase() === 'self-paced';
  const isUnlimited = item.available_seats === 'Unlimited' || item.available_seats === 'unlimited';
  const isFull = !isSelfPaced && !isUnlimited && Number(item.available_seats) <= 0;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow flex flex-col"
    >
      <div className="p-6 flex-grow">
        <div className="flex justify-between items-start mb-4">
          <span className={cn(
            "text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded",
            item.type === 'Virtual' ? "bg-blue-50 text-blue-600" : 
            item.type === 'Self-Paced' ? "bg-purple-50 text-purple-600" : "bg-green-50 text-green-600"
          )}>
            {item.type}
          </span>
          {!isSelfPaced && (
            <div className="flex items-center gap-1 text-gray-500 text-sm">
              <Users className="w-4 h-4" />
              <span>{isUnlimited ? 'Unlimited' : `${item.available_seats} left`}</span>
            </div>
          )}
        </div>
        
        <h3 className="text-xl font-bold text-gray-900 mb-2 leading-tight">{item.name}</h3>
        <p className="text-gray-600 text-sm line-clamp-3 mb-6">{item.description}</p>
        
        <div className="space-y-3">
          {item.date && (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Calendar className="w-4 h-4 text-primary" />
              <span>{item.date}</span>
            </div>
          )}
          {item.time && (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Clock className="w-4 h-4 text-primary" />
              <span>{item.time}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="truncate">{item.location}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <User className="w-4 h-4 text-primary" />
            <span>{item.instructor}</span>
          </div>
        </div>
      </div>
      
      <div className="p-4 bg-gray-50 border-t border-gray-100">
        <button 
          onClick={() => onRegister(item)}
          disabled={isFull}
          className={cn(
            "w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all",
            isFull 
              ? "bg-gray-200 text-gray-500 cursor-not-allowed" 
              : "bg-primary text-white hover:bg-opacity-90 active:scale-[0.98]"
          )}
        >
          {isFull ? 'Class Full' : isSelfPaced ? 'Access Course' : 'Register Now'}
          {!isFull && <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </motion.div>
  );
};

const RegistrationModal = ({ classItem, onClose, onSuccess }: { classItem: ClassItem; onClose: () => void; onSuccess: () => void }) => {
  const [formData, setFormData] = useState({
    agentName: '',
    email: '',
    phone: '',
    marketCenter: 'KW Kansas City North'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          classId: classItem.id,
          className: classItem.name,
          classDate: classItem.date || "",
          classTime: classItem.time || "",
          classType: classItem.type,
          webAddress: classItem.webAddress || ""
        })
      });

      if (!response.ok) throw new Error('Registration failed');
      
      // If self-paced, open class in new tab
      if (classItem.type.toLowerCase() === 'self-paced' && classItem.webAddress) {
        window.open(classItem.webAddress, '_blank');
      }
      
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-primary text-white">
          <div>
            <h2 className="text-xl font-bold">Register for Class</h2>
            <p className="text-white/80 text-sm truncate max-w-[250px]">{classItem.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Full Name</label>
            <input 
              required
              type="text" 
              className="input-field"
              value={formData.agentName}
              onChange={e => setFormData({...formData, agentName: e.target.value})}
              placeholder="John Doe"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Email Address</label>
            <input 
              required
              type="email" 
              className="input-field"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              placeholder="john@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Phone Number</label>
            <input 
              required
              type="tel" 
              className="input-field"
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
              placeholder="(555) 000-0000"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Market Center</label>
            <select 
              className="input-field"
              value={formData.marketCenter}
              onChange={e => setFormData({...formData, marketCenter: e.target.value})}
            >
              <option>Kansas City North</option>
              <option>Realty Partners</option>
              <option>Platinum Partners</option>
              <option>One Legacy Partners</option>
            </select>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full btn-primary py-4 text-lg mt-4 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Registration'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const SuccessView = ({ onClose, webAddress }: { onClose: () => void; webAddress?: string }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center"
    >
      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-12 h-12" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Registration Successful!</h2>
      <p className="text-gray-600 mb-8">
        We've added you to the class list. You'll receive a confirmation email shortly.
        {webAddress && <span className="block mt-2 font-medium text-primary">Your class is opening in a new tab...</span>}
      </p>
      
      <div className="space-y-3">
        {webAddress && (
          <a 
            href={webAddress} 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full btn-primary py-3 flex items-center justify-center gap-2"
          >
            Go to Class Now <ExternalLink className="w-4 h-4" />
          </a>
        )}
        <button onClick={onClose} className="w-full bg-gray-100 text-gray-700 hover:bg-gray-200 py-3 rounded-lg font-bold transition-colors">
          Back to Catalog
        </button>
      </div>
    </motion.div>
  </div>
);

// --- Main Pages ---

const CatalogPage = () => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    fetchClasses();
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config-check');
      const data = await res.json();
      setDebugInfo(data);
    } catch (e) {
      console.error("Failed to fetch config check", e);
    }
  };

  const fetchClasses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
        setClasses([]);
      } else if (Array.isArray(data)) {
        setClasses(data);
      } else {
        setClasses([]);
        setError("Received invalid data format from server.");
      }
    } catch (err: any) {
      console.error(err);
      setError("Failed to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && (error.includes("GOOGLE_SHEET_ID not configured") || error.includes("unsupported") || error.includes("DECODER") || error.includes("Authentication Error"))) {
    const isKeyError = error.includes("unsupported") || error.includes("DECODER");
    const isAuthError = error.includes("Authentication Error");
    
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6",
          (isKeyError || isAuthError) ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
        )}>
          <AlertCircle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {isKeyError ? "Invalid Private Key Format" : isAuthError ? "Authentication Failed" : "Configuration Required"}
        </h2>
        <div className="text-gray-600 mb-8 space-y-4">
          {isKeyError ? (
            <div className="space-y-4">
              <p>
                The <code className="bg-gray-100 px-1 rounded mx-1">GOOGLE_PRIVATE_KEY</code> you provided is not in a valid PEM format. 
                This usually happens when the key is pasted incorrectly, has been double-escaped, or is missing the required headers.
              </p>
              <p className="text-red-600 font-mono text-xs bg-red-50 p-2 rounded">{error}</p>
            </div>
          ) : isAuthError ? (
            <div className="space-y-4">
              <p className="text-red-600 font-medium">{error}</p>
              <p>
                This error means Google does not recognize the Service Account email address. 
                Please verify that the email in your Secrets panel exactly matches the one in your Google Cloud Console.
              </p>
            </div>
          ) : (
            <p>
              The Google Sheets integration has not been configured yet. Please add your 
              <code className="bg-gray-100 px-1 rounded mx-1">GOOGLE_SHEET_ID</code>, 
              <code className="bg-gray-100 px-1 rounded mx-1">GOOGLE_CLIENT_EMAIL</code>, and 
              <code className="bg-gray-100 px-1 rounded mx-1">GOOGLE_PRIVATE_KEY</code> 
              to the Secrets panel in AI Studio.
            </p>
          )}
        </div>

        <div className="bg-gray-50 p-6 rounded-xl text-left border border-gray-200 mb-8">
          <h3 className="font-bold text-gray-900 mb-2">
            {isKeyError ? "How to fix the Key:" : isAuthError ? "Troubleshooting Email:" : "Setup Steps:"}
          </h3>
          {isKeyError ? (
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-600">
              <li>Ensure the key starts with <code className="bg-gray-100 px-1 rounded">-----BEGIN PRIVATE KEY-----</code></li>
              <li>Ensure the key ends with <code className="bg-gray-100 px-1 rounded">-----END PRIVATE KEY-----</code></li>
              <li>If copying from a JSON file, copy the <b>entire</b> value of the <code className="bg-gray-100 px-1 rounded">private_key</code> field.</li>
              <li>Do not remove the <code className="bg-gray-100 px-1 rounded">\n</code> characters; the app will handle them.</li>
            </ul>
          ) : isAuthError ? (
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-600">
              <li>Check for accidental spaces at the beginning or end of the email in the Secrets panel.</li>
              <li>Ensure you didn't accidentally include the <code className="bg-gray-100 px-1 rounded">client_email:</code> label.</li>
              <li>Verify the email ends with <code className="bg-gray-100 px-1 rounded">.iam.gserviceaccount.com</code>.</li>
              <li>Make sure the Service Account hasn't been deleted in Google Cloud.</li>
            </ul>
          ) : (
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
              <li>Create a Google Sheet with "Classes" and "Registrations" tabs.</li>
              <li>Create a Service Account in Google Cloud Console.</li>
              <li>Share your Sheet with the Service Account email (Editor).</li>
              <li>Add the credentials to the Secrets panel in AI Studio.</li>
            </ol>
          )}
        </div>

        {debugInfo && (
          <div className="mt-8">
            {debugInfo.sheetIdIsUrl && (
              <div className="mb-4 p-3 bg-amber-50 text-amber-700 text-xs rounded-lg border border-amber-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>Warning: Your <b>GOOGLE_SHEET_ID</b> looks like a full URL. Please use only the ID part (the string between /d/ and /edit).</span>
              </div>
            )}
            {debugInfo.privateKeyCoreLength < 1000 && debugInfo.privateKeyCoreLength > 0 && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>Warning: Your <b>GOOGLE_PRIVATE_KEY</b> seems too short ({debugInfo.privateKeyCoreLength} chars). It might be truncated. A full key is usually ~1600+ characters.</span>
              </div>
            )}
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="text-xs text-gray-400 hover:text-gray-600 underline flex items-center gap-1 mx-auto"
            >
              <Settings className="w-3 h-3" />
              {showDebug ? "Hide" : "Show"} Technical Debug Info
            </button>
            
            {showDebug && (
              <div className="mt-4 p-4 bg-gray-900 rounded-lg text-left overflow-x-auto">
                <pre className="text-[10px] text-green-400 font-mono">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-12 text-center">
        <h2 className="text-4xl font-extrabold text-gray-900 mb-4">Available Classes</h2>
        <p className="text-gray-600 max-w-2xl mx-auto">Enhance your real estate skills with our expert-led training sessions. Browse the catalog below and register to secure your spot.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {classes
          .filter((item) => {
            // Always show self-paced classes
            if (item.type?.toLowerCase() === 'self-paced') return true;
            if (!item.date) return true;
            
            const classDate = parseDate(item.date);
            if (!classDate) return true; // Show if date format is unknown
            
            const today = getCentralToday();
            return classDate >= today;
          })
          .sort((a, b) => {
            const isASelfPaced = a.type === 'Self-Paced';
            const isBSelfPaced = b.type === 'Self-Paced';

            if (isASelfPaced && !isBSelfPaced) return -1;
            if (!isASelfPaced && isBSelfPaced) return 1;

            // Sort by date soonest first
            const dateA = parseDate(a.date)?.getTime() || 0;
            const dateB = parseDate(b.date)?.getTime() || 0;
            
            if (dateA !== dateB) {
              // If one has no date, it should go after self-paced but maybe before/after others?
              // parseDate returns null if no date, which becomes 0 here.
              // But filter already removed past dates.
              return dateA - dateB;
            }
            
            return (a.name || '').localeCompare(b.name || '');
          })
          .map((item) => (
            <ClassCard key={item.id} item={item} onRegister={setSelectedClass} />
          ))}
      </div>

      <AnimatePresence>
        {selectedClass && (
          <RegistrationModal 
            classItem={selectedClass} 
            onClose={() => setSelectedClass(null)} 
            onSuccess={() => {
              const url = (selectedClass.type.toLowerCase() === 'self-paced' || selectedClass.type.toLowerCase() === 'virtual') ? selectedClass.webAddress : null;
              setSelectedClass(null);
              setSuccessUrl(url || null);
              setShowSuccess(true);
              fetchClasses(); // Refresh seat count
            }}
          />
        )}
        {showSuccess && <SuccessView onClose={() => { setShowSuccess(false); setSuccessUrl(null); }} webAddress={successUrl || undefined} />}
      </AnimatePresence>
    </div>
  );
};

const AdminPage = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [editingClass, setEditingClass] = useState<Partial<ClassItem> | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [adminAlert, setAdminAlert] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');

  const handleTestEmail = async () => {
    if (!testEmailAddress) return;

    setTestingEmail(true);
    setEmailTestResult(null);
    try {
      const res = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmailAddress })
      });
      const data = await res.json();
      if (res.ok) {
        setEmailTestResult({ success: true });
        setAdminAlert({ type: 'success', message: "Test email sent successfully! Please check your inbox (and spam folder)." });
        setShowEmailPrompt(false);
      } else {
        setEmailTestResult({ success: false, error: data.error });
        setAdminAlert({ type: 'error', message: `Failed to send test email: ${data.error}` });
      }
    } catch {
      setEmailTestResult({ success: false, error: 'Failed to reach server' });
      setAdminAlert({ type: 'error', message: "Failed to reach server. Please try again." });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/test-connection');
      const data = await res.json();
      if (res.ok) {
        setTestResult({ success: true, message: data.message });
      } else {
        setTestResult({ success: false, error: data.error || 'Connection failed' });
      }
    } catch {
      setTestResult({ success: false, error: 'Failed to reach server' });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    
    try {
      const res = await fetch('/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: deletingId, password })
      });
      
      if (res.ok) {
        fetchClasses();
        setAdminAlert({ type: 'success', message: 'Class deleted successfully!' });
      } else {
        const data = await res.json();
        setAdminAlert({ type: 'error', message: data.error || "Failed to delete class" });
      }
    } catch (err) {
      console.error(err);
      setAdminAlert({ type: 'error', message: "Failed to reach server" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (res.ok) {
      setIsLoggedIn(true);
      fetchClasses();
    } else {
      setError('Invalid password');
    }
  };

  const fetchClasses = async () => {
    const res = await fetch('/api/classes');
    const data = await res.json();
    setClasses(data);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const action = editingClass?.id ? 'edit' : 'add';
    try {
      const res = await fetch('/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          password,
          id: editingClass?.id,
          classData: editingClass
        })
      });
      if (res.ok) {
        setEditingClass(null);
        fetchClasses();
        setAdminAlert({ type: 'success', message: 'Class saved successfully!' });
      } else {
        const data = await res.json();
        setAdminAlert({ type: 'error', message: `Failed to save class: ${data.error || 'Unknown error'}` });
      }
    } catch {
      setAdminAlert({ type: 'error', message: "Failed to reach server. Please check your connection." });
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="max-w-md mx-auto mt-20 p-8 border border-gray-200 rounded-2xl shadow-sm">
        <h2 className="text-2xl font-bold mb-6">Admin Login</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <input 
            type="password" 
            className="input-field" 
            placeholder="Enter Admin Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <button type="submit" className="w-full btn-primary">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold">Manage Classes</h2>
        <div className="flex gap-3">
          <button 
            onClick={handleTestConnection} 
            disabled={testing}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border transition-all",
              testResult?.success ? "bg-green-50 text-green-600 border-green-200" : 
              testResult?.error ? "bg-red-50 text-red-600 border-red-200" :
              "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            )}
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {testResult?.success ? "Connected!" : testResult?.error ? "Failed" : "Test Connection"}
          </button>
          <button 
            onClick={() => setShowEmailPrompt(true)} 
            disabled={testingEmail}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border transition-all",
              emailTestResult?.success ? "bg-green-50 text-green-600 border-green-200" : 
              emailTestResult?.error ? "bg-red-50 text-red-600 border-red-200" :
              "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            )}
          >
            {testingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {emailTestResult?.success ? "Email Sent!" : emailTestResult?.error ? "Email Error" : "Test Email"}
          </button>
          <button onClick={() => setEditingClass({})} className="btn-primary">Add New Class</button>
        </div>
      </div>

      {testResult?.error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold mb-1">Google Sheets Connection Failed</p>
            <p className="mb-2">{testResult.error}</p>
            <p className="text-xs opacity-80 italic">Tip: Ensure the service account email is shared with the Google Sheet as an 'Editor'.</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Class Name</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Date/Time</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Seats</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Web Address</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {classes.map(c => {
              const classDate = parseDate(c.date);
              const today = getCentralToday();
              const isPast = classDate && classDate < today;
              
              return (
                <tr key={c.id} className={cn(isPast && "bg-gray-50/50 opacity-75")}>
                  <td className="px-6 py-4 font-medium">
                    <div className="flex items-center gap-2">
                      {c.name}
                      {isPast && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase">Past</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {c.type === 'Self-Paced' || (!c.date && !c.time) ? 'On-Demand' : `${c.date} at ${c.time}`}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {c.type === 'Self-Paced' || c.available_seats === 'Unlimited' ? 'Unlimited' : c.available_seats}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-[150px]">
                    {c.webAddress || '-'}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => setEditingClass(c)} className="text-primary hover:underline text-sm font-bold">Edit</button>
                    <button 
                      onClick={() => {
                        const rest = { ...c };
                        delete (rest as any).id;
                        setEditingClass(rest);
                      }} 
                      className="text-blue-500 hover:underline text-sm font-bold"
                    >
                      Duplicate
                    </button>
                    <button 
                      onClick={() => setDeletingId(c.id)}
                      className="text-gray-400 hover:text-red-500 text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">{editingClass.id ? 'Edit Class' : 'Add New Class'}</h2>
              <button onClick={() => setEditingClass(null)}><X /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Class Name</label>
                <input required className="input-field" value={editingClass.name || ''} onChange={e => setEditingClass({...editingClass, name: e.target.value})} />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Description</label>
                <textarea required className="input-field h-24" value={editingClass.description || ''} onChange={e => setEditingClass({...editingClass, description: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
                <input 
                  required={editingClass.type !== 'Self-Paced' && editingClass.type !== 'Virtual'} 
                  type="date" 
                  className="input-field disabled:bg-gray-50 disabled:text-gray-400" 
                  disabled={editingClass.type === 'Self-Paced'}
                  value={editingClass.date || ''} 
                  onChange={e => setEditingClass({...editingClass, date: e.target.value})} 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Time</label>
                <input 
                  required={editingClass.type !== 'Self-Paced' && editingClass.type !== 'Virtual'} 
                  type="text" 
                  className="input-field disabled:bg-gray-50 disabled:text-gray-400" 
                  disabled={editingClass.type === 'Self-Paced'}
                  placeholder={editingClass.type === 'Self-Paced' ? 'N/A' : "e.g. 10:00 AM - 12:00 PM"} 
                  value={editingClass.time || ''} 
                  onChange={e => setEditingClass({...editingClass, time: e.target.value})} 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Location Address</label>
                <input required className="input-field" value={editingClass.location || ''} onChange={e => setEditingClass({...editingClass, location: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Instructor</label>
                <input required className="input-field" value={editingClass.instructor || ''} onChange={e => setEditingClass({...editingClass, instructor: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Available Seats</label>
                <input 
                  required={editingClass.type !== 'Self-Paced' && editingClass.type !== 'Virtual'} 
                  type="text" 
                  className="input-field disabled:bg-gray-50 disabled:text-gray-400" 
                  disabled={editingClass.type === 'Self-Paced'}
                  placeholder={editingClass.type === 'Self-Paced' ? 'Unlimited' : "Number of seats or 'Unlimited'"}
                  value={editingClass.available_seats || ''} 
                  onChange={e => setEditingClass({...editingClass, available_seats: e.target.value})} 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Type</label>
                <select className="input-field" value={editingClass.type || 'In-Person'} onChange={e => setEditingClass({...editingClass, type: e.target.value})}>
                  <option>In-Person</option>
                  <option>Virtual</option>
                  <option>Self-Paced</option>
                </select>
              </div>
              {editingClass.type === 'Self-Paced' && (
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Web Address (Class Link)</label>
                  <input 
                    type="url" 
                    className="input-field" 
                    placeholder="https://example.com/start-class"
                    value={editingClass.webAddress || ''} 
                    onChange={e => setEditingClass({...editingClass, webAddress: e.target.value})} 
                  />
                </div>
              )}
              <div className="col-span-2 pt-4">
                <button type="submit" className="w-full btn-primary py-3">Save Class</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Class?</h3>
            <p className="text-gray-500 mb-6">This action cannot be undone. Are you sure you want to remove this class?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeletingId(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmailPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Test Email</h3>
            <p className="text-gray-500 mb-4 text-sm">Enter an email address to send a test message to:</p>
            <input 
              type="email" 
              className="input-field mb-6" 
              placeholder="your-email@example.com"
              value={testEmailAddress}
              onChange={e => setTestEmailAddress(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3">
              <button 
                onClick={() => setShowEmailPrompt(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleTestEmail}
                disabled={!testEmailAddress || testingEmail}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {testingEmail ? "Sending..." : "Send Test"}
              </button>
            </div>
          </div>
        </div>
      )}

      {adminAlert && (
        <div className="fixed bottom-8 right-8 z-[100]">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border",
              adminAlert.type === 'success' ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
            )}
          >
            {adminAlert.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-medium">{adminAlert.message}</span>
            <button onClick={() => setAdminAlert(null)} className="ml-4 hover:opacity-70">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const path = window.location.pathname;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        {path === '/admin' ? <AdminPage /> : <CatalogPage />}
      </main>
      <footer className="bg-gray-50 border-t border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="w-10 h-10 bg-primary rounded flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">KW</div>
          <p className="text-gray-500 text-sm">© {new Date().getFullYear()} KW Brokerage. All rights reserved.</p>
          <p className="text-gray-400 text-[10px] mt-2 uppercase tracking-widest">Empowering Real Estate Professionals</p>
        </div>
      </footer>
    </div>
  );
}
