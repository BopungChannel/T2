import React, { useState, useEffect, useRef } from "react";
import {
  Lock,
  ShieldAlert,
  Monitor,
  CheckCircle,
  Unlock,
  Settings,
  AlertTriangle,
  Volume2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Smartphone,
  KeyRound,
  QrCode,
  X,
  UserCheck,
  Eye,
  EyeOff,
  PlayCircle,
  LogIn,
  ChevronLeft,
  LayoutDashboard,
  Save,
  RotateCw,
  Power,
  ShieldX,
  Radio,
  Link as LinkIcon,
  Database,
  Plus,
  Trash2,
  Check,
  Hash,
  Timer,
  Hourglass,
  LogOut,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
// --- KONFIGURASI FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBxmnSVJcMNqLvPzqUKMYdgi8ZlwRhzIyw",
  authDomain: "simeong-3617f.firebaseapp.com",
  projectId: "simeong-3617f",
  storageBucket: "simeong-3617f.firebasestorage.app",
  messagingSenderId: "366580363977",
  appId: "1:366580363977:web:bc65536ca7d27124589318",
};

const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "default-app-id";

/**
 * LOGIKA TOTP (GOOGLE AUTHENTICATOR)
 */
const TOTP_ENGINE = {
  base32ToBuf: (base32: string) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (let i = 0; i < base32.length; i++) {
      const val = alphabet.indexOf(base32.charAt(i).toUpperCase());
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, "0");
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substr(i, 8), 2));
    }
    return new Uint8Array(bytes);
  },
  generate: async (secret: string) => {
    try {
      const epoch = Math.floor(Date.now() / 1000.0);
      const counter = Math.floor(epoch / 30);
      const buffer = new ArrayBuffer(8);
      const dataview = new DataView(buffer);
      dataview.setUint32(4, counter);
      const keyData = TOTP_ENGINE.base32ToBuf(secret);
      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: { name: "SHA-1" } },
        false,
        ["sign"]
      );
      const signature = await window.crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        buffer
      );
      const hmac = new Uint8Array(signature);
      const offset = hmac[hmac.length - 1] & 0xf;
      const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
      return (code % 1000000).toString().padStart(6, "0");
    } catch (err) {
      return "000000";
    }
  },
};

const App = () => {
  const [currentView, setCurrentView] = useState("setup");
  const [isLocked, setIsLocked] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [user, setUser] = useState(null);

  // State Utama
  const [inputCodeOrUrl, setInputCodeOrUrl] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [violationCount, setViolationCount] = useState(0);
  const [message, setMessage] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isExamOpen, setIsExamOpen] = useState(false); // Global access state

  // Admin
  const [adminId, setAdminId] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showPass, setShowPass] = useState(false);

  // Database
  const [examLinks, setExamLinks] = useState([]);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newCombinationCode, setNewCombinationCode] = useState("");

  const secretKey = "JBSWY3DPEHPK3PXP";
  const [currentOTP, setCurrentOTP] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const sessionStartTime = useRef(Date.now());
  const examTimerInterval = useRef(null);
  const [isScanning, setIsScanning] = useState(false);

  // LOGO (SIMEONG-LOGO-UP.png)
  const simeongLogo = "https://i.ibb.co.com/JWpHmdYR/SIMEONG-LOGO-UP.png";

  const audioContextRef = useRef(null);
  const sirenIntervalRef = useRef(null);
  const isLockedRef = useRef(false);

  // PWA & SW
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("./sw.js")
          .catch((err) => console.log(err));
      });
    }
  }, []);

  const startSiren = () => {
    if (sirenIntervalRef.current) return;
    if (!audioContextRef.current)
      audioContextRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") ctx.resume();
    const playTone = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    };
    playTone();
    sirenIntervalRef.current = setInterval(playTone, 600);
  };

  const stopSiren = () => {
    if (sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
  };

  const handleUnlock = () => {
    if (otpToken === currentOTP) {
      stopSiren();
      setIsLocked(false);
      isLockedRef.current = false;
      setOtpToken("");
      setErrorMsg("");
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      setErrorMsg("Token OTP Salah!");
    }
  };

  const handleFinalExit = () => {
    stopSiren();
    setCurrentView("setup");
    setIsLocked(false);
    isLockedRef.current = false;
    setElapsedTime(0);
    setShowExitConfirm(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  // Auth Listener
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth Error:", e);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;
    const controlDoc = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "remoteControls",
      "globalState"
    );
    const unsubControl = onSnapshot(
      controlDoc,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setIsExamOpen(data.isExamOpen || false);
          if (data.timestamp > sessionStartTime.current) {
            if (
              data.action === "LOCK_ALL" &&
              currentView === "exam" &&
              !isLockedRef.current
            ) {
              handleViolation("Layar Dikunci Jarak Jauh oleh Pengawas!");
            } else if (data.action === "RELOAD_ALL" && currentView === "exam") {
              window.location.reload();
            } else if (data.action === "KICK_ALL" && currentView === "exam") {
              handleFinalExit();
            }
          }
        }
      },
      (err) => console.error(err)
    );

    const linksCol = collection(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "examLinks"
    );
    const unsubLinks = onSnapshot(
      linksCol,
      (snapshot) => {
        const links = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setExamLinks(links);
      },
      (err) => console.error(err)
    );

    return () => {
      unsubControl();
      unsubLinks();
    };
  }, [user, currentView]);

  // Exam Timer
  useEffect(() => {
    if (currentView === "exam" && !isLocked && !showExitConfirm) {
      examTimerInterval.current = setInterval(
        () => setElapsedTime((p) => p + 1),
        1000
      );
    } else {
      clearInterval(examTimerInterval.current);
    }
    return () => clearInterval(examTimerInterval.current);
  }, [currentView, isLocked, showExitConfirm]);

  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // OTP Sync
  useEffect(() => {
    const sync = async () => {
      const code = await TOTP_ENGINE.generate(secretKey);
      setCurrentOTP(code);
    };
    sync();
    const int = setInterval(sync, 1000);
    return () => clearInterval(int);
  }, []);

  const handleViolation = (reason) => {
    if (currentView === "exam" && !isLockedRef.current) {
      isLockedRef.current = true;
      setIsLocked(true);
      setViolationCount((prev) => prev + 1);
      setMessage(String(reason));
      startSiren();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden")
        handleViolation("Pindah Tab Terdeteksi!");
    };
    const handleBlur = () => {
      setTimeout(() => {
        if (
          document.activeElement &&
          document.activeElement.tagName === "IFRAME"
        )
          return;
        if (!isLockedRef.current) handleViolation("Keluar dari Jendela Ujian!");
      }, 400);
    };
    if (currentView === "exam" && !isLocked) {
      window.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("blur", handleBlur);
    }
    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [currentView, isLocked]);

  const handleStartExam = () => {
    setErrorMsg("");
    if (!isExamOpen) {
      setErrorMsg("Sistem Terkunci: Silakan menunggu admin membuka soal");
      return;
    }
    if (!inputCodeOrUrl) {
      setErrorMsg("Masukkan Tautan atau Kode Akses!");
      return;
    }

    const foundLink = examLinks.find(
      (l) =>
        String(l.combinationCode).toUpperCase() ===
        inputCodeOrUrl.toUpperCase().trim()
    );
    const finalUrl = foundLink ? foundLink.url : inputCodeOrUrl;

    if (otpToken === currentOTP) {
      setFormUrl(finalUrl);
      setElapsedTime(0);
      document.documentElement.requestFullscreen().catch(() => {});
      sessionStartTime.current = Date.now();
      setCurrentView("exam");
      setOtpToken("");
    } else {
      setErrorMsg("Token OTP Salah!");
    }
  };

  const sendRemoteCommand = async (action, extraData = {}) => {
    if (!user) return;
    try {
      const controlDoc = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "remoteControls",
        "globalState"
      );
      await setDoc(
        controlDoc,
        { action, timestamp: Date.now(), sender: "admin92", ...extraData },
        { merge: true }
      );
    } catch (e) {
      console.error(e);
    }
  };

  const toggleExamAccess = async (open) => {
    if (!user) return;
    const controlDoc = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "remoteControls",
      "globalState"
    );
    await setDoc(
      controlDoc,
      { isExamOpen: open, timestamp: Date.now() },
      { merge: true }
    );
  };

  // --- SCANNER LOGIC ---
  const startScanner = async () => {
    setIsScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", true);
        videoRef.current.play();
        requestRef.current = requestAnimationFrame(tick);
      }
    } catch (err) {
      setErrorMsg("Kamera tidak tersedia.");
      setIsScanning(false);
    }
  };

  const stopScanner = () => {
    setIsScanning(false);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    if (videoRef.current && videoRef.current.srcObject)
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
  };

  const tick = () => {
    if (
      videoRef.current &&
      videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
    ) {
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      canvas.height = videoRef.current.videoHeight;
      canvas.width = videoRef.current.videoWidth;
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      if (window.jsQR) {
        const code = window.jsQR(
          imageData.data,
          imageData.width,
          imageData.height,
          { inversionAttempts: "dontInvert" }
        );
        if (code) {
          setInputCodeOrUrl(code.data);
          stopScanner();
          return;
        }
      }
    }
    requestRef.current = requestAnimationFrame(tick);
  };

  // --- VIEWS ---
  if (currentView === "setup") {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6 text-white font-sans relative overflow-hidden">
        {isScanning && (
          <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4">
            <div className="relative w-full max-w-sm aspect-square bg-[#12192b] rounded-3xl overflow-hidden border-4 border-[#5b51d8]">
              <video ref={videoRef} className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <button
              onClick={stopScanner}
              className="mt-8 bg-slate-800 px-10 py-4 rounded-2xl font-bold border border-slate-700"
            >
              Tutup Kamera
            </button>
          </div>
        )}

        <div className="bg-[#12192b] p-10 rounded-[48px] shadow-2xl w-full max-w-md border border-[#1e273a] relative z-10 text-center">
          <div className="inline-block p-4 bg-[#5b51d8] rounded-[32px] mb-6 shadow-2xl border border-white/10">
            <img
              src={simeongLogo}
              alt="SIMEONG LOGO"
              className="w-24 h-24 object-contain"
            />
          </div>
          <h1 className="text-4xl font-black uppercase tracking-tight mb-2 italic text-white drop-shadow-md">
            SEB SIMEONG
          </h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[4px] mb-10">
            Sistem Ujian Terintegrasi berbasis G-Form by BopungGIS
          </p>

          <div className="space-y-6 text-left">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                <Hash size={12} className="text-indigo-400" /> Tautan atau Kode
                Kombinasi
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-grow bg-black border border-[#1e273a] p-5 rounded-2xl outline-none text-sm font-black focus:border-indigo-500 transition-all text-indigo-400 placeholder:text-slate-800 uppercase"
                  placeholder="Kode (Contoh: MTK92)"
                  value={inputCodeOrUrl}
                  onChange={(e) => setInputCodeOrUrl(e.target.value)}
                />
                <button
                  onClick={startScanner}
                  className="bg-[#1e273a] border border-[#2c374d] p-4 rounded-2xl hover:bg-[#2c374d] transition-all text-indigo-400"
                >
                  <QrCode size={20} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">
                Token OTP
              </label>
              <input
                type="text"
                maxLength={6}
                className="w-full bg-black border-2 border-[#1e273a] p-6 rounded-[32px] outline-none text-6xl font-mono text-center tracking-[15px] text-[#5b51d8] focus:border-[#5b51d8] transition-all"
                value={otpToken}
                onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
              />
            </div>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl text-red-500 text-[11px] font-black uppercase text-center py-3 animate-pulse">
                {String(errorMsg)}
              </div>
            )}

            <button
              onClick={handleStartExam}
              disabled={!isExamOpen}
              className={`w-full py-6 rounded-[32px] font-black text-xl shadow-2xl transition-all flex items-center justify-center gap-3 text-white active:scale-95 ${
                isExamOpen
                  ? "bg-[#5b51d8] hover:bg-[#4a40c7] shadow-[#5b51d8]/30"
                  : "bg-slate-800 opacity-50 cursor-not-allowed"
              }`}
            >
              {isExamOpen ? <PlayCircle size={24} /> : <Lock size={20} />}
              {isExamOpen ? "MULAI KERJAKAN" : "AKSES TERKUNCI"}
            </button>

            {!isExamOpen && (
              <p className="text-[10px] text-center font-bold text-slate-600 uppercase tracking-widest animate-pulse mt-2">
                Silakan menunggu admin membuka soal
              </p>
            )}
          </div>

          <div className="mt-12 flex justify-center">
            <button
              onClick={() => {
                setErrorMsg("");
                setCurrentView("admin-login");
              }}
              className="text-[9px] font-bold text-slate-700 uppercase tracking-widest hover:text-indigo-400 flex items-center gap-2 transition-colors"
            >
              <LayoutDashboard size={12} /> Masuk sebagai Admin
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === "admin-login") {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-6 text-white font-sans">
        <div className="bg-[#12192b] p-10 rounded-[48px] shadow-2xl w-full max-w-md border border-[#1e273a] text-center relative">
          <button
            onClick={() => setCurrentView("setup")}
            className="absolute top-8 left-8 text-slate-500 hover:text-white transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="mb-10 mt-6 text-center flex flex-col items-center">
            <div className="p-4 bg-indigo-600/20 rounded-3xl mb-4 border border-indigo-500/30">
              <img
                src={simeongLogo}
                alt="LOGO"
                className="w-12 h-12 object-contain"
              />
            </div>
            <h2 className="text-2xl font-black uppercase italic text-indigo-400">
              Admin Login
            </h2>
          </div>
          <div className="space-y-4">
            <input
              type="text"
              className="w-full bg-[#1e273a] border border-[#2c374d] p-5 rounded-[22px] outline-none font-bold text-white placeholder:text-slate-700"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              placeholder="ID Admin"
            />
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                className="w-full bg-[#1e273a] border border-[#2c374d] p-5 rounded-[22px] outline-none text-white placeholder:text-slate-700"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                placeholder="Password"
              />
              <button
                onClick={() => setShowPass(!showPass)}
                className="absolute right-5 top-5 text-slate-600"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errorMsg && (
              <p className="text-red-500 text-[10px] font-bold uppercase text-center py-2">
                {String(errorMsg)}
              </p>
            )}
            <button
              onClick={() => {
                if (adminId === "admin92" && adminPass === "Sekolahku92")
                  setCurrentView("dashboard");
                else setErrorMsg("Login Gagal!");
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-500 py-6 rounded-[32px] font-black text-lg text-white active:scale-95 transition-all"
            >
              MASUK DASHBOARD
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === "dashboard") {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans pb-20">
        <header className="bg-white border-b px-8 py-6 flex justify-between items-center shadow-sm sticky top-0 z-50">
          <div className="flex items-center gap-4 text-left">
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-xl">
              <img
                src={simeongLogo}
                alt="LOGO"
                className="w-8 h-8 object-contain brightness-0 invert"
              />
            </div>
            <div>
              <h1 className="font-black text-lg uppercase italic leading-none text-slate-800">
                SIMEONG Control Center
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Sistem Manajemen Ujian
              </p>
            </div>
          </div>
          <button
            onClick={() => setCurrentView("setup")}
            className="bg-slate-100 hover:bg-red-50 hover:text-red-600 p-3 rounded-2xl font-bold text-xs uppercase flex items-center gap-2 transition-all"
          >
            Keluar <X size={16} />
          </button>
        </header>

        <main className="max-w-6xl mx-auto p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <button
              onClick={() => toggleExamAccess(!isExamOpen)}
              className={`p-8 rounded-[40px] shadow-sm border transition-all flex flex-col items-center gap-4 group ${
                isExamOpen
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                  : "bg-red-50 border-red-100 text-red-600"
              }`}
            >
              <div
                className={`p-5 rounded-[24px] group-hover:scale-110 transition-transform ${
                  isExamOpen ? "bg-emerald-100" : "bg-red-100"
                }`}
              >
                {isExamOpen ? (
                  <ToggleRight size={32} />
                ) : (
                  <ToggleLeft size={32} />
                )}
              </div>
              <span className="font-black uppercase text-xs tracking-widest">
                {isExamOpen ? "Tutup Akses Ujian" : "Buka Akses Ujian"}
              </span>
            </button>

            <button
              onClick={() => sendRemoteCommand("LOCK_ALL")}
              className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 hover:bg-red-50 flex flex-col items-center gap-4 group transition-all"
            >
              <div className="p-5 bg-red-100 text-red-600 rounded-[24px] group-hover:scale-110 transition-transform">
                <Lock size={32} />
              </div>
              <span className="font-black uppercase text-xs text-red-600">
                Kunci Semua
              </span>
            </button>
            <button
              onClick={() => sendRemoteCommand("RELOAD_ALL")}
              className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 hover:bg-indigo-50 flex flex-col items-center gap-4 group transition-all"
            >
              <div className="p-5 bg-indigo-100 text-indigo-600 rounded-[24px] group-hover:scale-110 transition-transform">
                <RotateCw size={32} />
              </div>
              <span className="font-black uppercase text-xs text-slate-700">
                Reload Semua
              </span>
            </button>
            <button
              onClick={() => sendRemoteCommand("KICK_ALL")}
              className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 hover:bg-slate-900 hover:text-white flex flex-col items-center gap-4 group transition-all"
            >
              <div className="p-5 bg-slate-100 text-slate-900 rounded-[24px] group-hover:scale-110 transition-transform">
                <Power size={32} />
              </div>
              <span className="font-black uppercase text-xs text-slate-700 group-hover:text-white">
                Keluar Semua
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6 flex flex-col">
              <h3 className="font-black uppercase text-sm italic flex items-center gap-3 text-slate-800">
                <Database size={20} className="text-emerald-600" /> Database
                Kode Akses
              </h3>
              <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    className="bg-white border p-4 rounded-2xl outline-none text-sm"
                    placeholder="Judul Soal"
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                  />
                  <input
                    type="text"
                    className="bg-white border-2 border-emerald-100 p-4 rounded-2xl outline-none text-sm font-black uppercase text-emerald-700"
                    placeholder="Kode"
                    value={newCombinationCode}
                    onChange={(e) => setNewCombinationCode(e.target.value)}
                  />
                </div>
                <input
                  type="text"
                  className="w-full bg-white border p-4 rounded-2xl outline-none text-sm"
                  placeholder="Link Google Form..."
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                />
                <button
                  onClick={() => {
                    if (!newLinkTitle || !newLinkUrl || !newCombinationCode)
                      return;
                    const linksCol = collection(
                      db,
                      "artifacts",
                      appId,
                      "public",
                      "data",
                      "examLinks"
                    );
                    addDoc(linksCol, {
                      title: newLinkTitle,
                      url: newLinkUrl,
                      combinationCode: newCombinationCode.toUpperCase().trim(),
                      createdAt: Date.now(),
                    });
                    setNewLinkTitle("");
                    setNewLinkUrl("");
                    setNewCombinationCode("");
                  }}
                  className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-xs uppercase shadow-lg active:scale-95 transition-all"
                >
                  Simpan Kode
                </button>
              </div>

              <div className="flex-grow overflow-y-auto max-h-[350px] space-y-3">
                {examLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-3xl hover:border-emerald-200 shadow-sm transition-all"
                  >
                    <div className="text-left overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-900 text-white text-[10px] font-black px-2 py-0.5 rounded italic">
                          {String(link.combinationCode)}
                        </span>
                        <h4 className="font-black text-sm text-slate-800 truncate">
                          {String(link.title)}
                        </h4>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 truncate mt-1">
                        {String(link.url)}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() =>
                          setInputCodeOrUrl(String(link.combinationCode))
                        }
                        className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => {
                          const linkDoc = doc(
                            db,
                            "artifacts",
                            appId,
                            "public",
                            "data",
                            "examLinks",
                            link.id
                          );
                          deleteDoc(linkDoc);
                        }}
                        className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
              <h3 className="font-black uppercase text-sm italic flex items-center gap-3 text-slate-800">
                <Monitor size={20} className="text-indigo-600" /> Tautan Aktif
              </h3>
              <input
                type="text"
                className="w-full bg-slate-50 border p-4 rounded-2xl outline-none text-sm font-medium focus:ring-2 focus:ring-indigo-500 transition-all"
                value={inputCodeOrUrl}
                onChange={(e) => setInputCodeOrUrl(e.target.value)}
                placeholder="Tautan atau Kode..."
              />
              <button
                onClick={startScanner}
                className="w-full bg-slate-800 text-white py-5 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              >
                <QrCode size={18} /> Scan QR Guru
              </button>

              <div
                className={`p-8 rounded-[32px] border ${
                  isExamOpen
                    ? "bg-emerald-50 border-emerald-100"
                    : "bg-red-50 border-red-100"
                } text-center`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Status Gerbang Ujian
                </p>
                <h4
                  className={`text-2xl font-black uppercase italic ${
                    isExamOpen ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {isExamOpen ? "Akses Terbuka" : "Akses Tertutup"}
                </h4>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (currentView === "exam") {
    return (
      <div className="h-screen flex flex-col bg-white overflow-hidden select-none relative font-sans text-slate-800">
        <header className="bg-white px-8 py-4 border-b flex justify-between items-center z-50 shadow-sm">
          <div className="flex items-center gap-4 text-left">
            <div className="bg-[#5b51d8] p-2 rounded-2xl text-white shadow-lg border border-white/10">
              <img
                src={simeongLogo}
                alt="SIMEONG"
                className="w-10 h-10 object-contain"
              />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-sm uppercase italic leading-none">
                SEB SIMEONG
              </h2>
              <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#5b51d8] animate-ping"></span>{" "}
                Monitoring Aktif
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center bg-slate-50 px-8 py-2 rounded-2xl border border-slate-100 shadow-inner">
            <div className="flex items-center gap-2 text-indigo-600 mb-0.5">
              <Hourglass size={14} className="animate-spin duration-[3s]" />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Durasi Ujian
              </span>
            </div>
            <p className="font-mono text-3xl font-black text-slate-800 leading-none">
              {formatTime(elapsedTime)}
            </p>
          </div>

          <div className="flex items-center gap-6 text-right">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                Pelanggaran
              </p>
              <p className="font-black text-2xl text-red-600 leading-none mt-1">
                {violationCount}
              </p>
            </div>
            <button
              onClick={() => setShowExitConfirm(true)}
              className="bg-red-50 px-5 py-3 rounded-2xl text-red-600 border border-red-100 hover:bg-red-600 hover:text-white transition-all shadow-sm font-black text-xs flex items-center gap-2 uppercase tracking-widest active:scale-95"
            >
              <LogOut size={16} /> Keluar
            </button>
          </div>
        </header>

        <div className="bg-red-700 text-white px-6 py-2.5 text-center text-[11px] font-black tracking-[3px] animate-pulse">
          PERINGATAN: JANGAN KELUAR DARI HALAMAN INI! SIRINE AKAN BERBUNYI!
        </div>

        <main className="flex-grow relative bg-slate-100">
          <iframe
            src={formUrl}
            className="w-full h-full border-none shadow-2xl"
            title="Exam Interface"
          ></iframe>
        </main>

        {showExitConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100000] flex items-center justify-center p-6">
            <div className="bg-white p-8 rounded-[40px] max-w-sm w-full shadow-2xl text-center border border-slate-200">
              <div className="bg-red-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <LogOut size={36} className="text-red-600" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase italic tracking-tight">
                Hentikan Ujian?
              </h3>
              <p className="text-slate-500 font-medium text-sm mb-8">
                Pastikan Anda sudah mengirimkan jawaban G-Form sebelum keluar.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="bg-slate-100 py-4 rounded-2xl font-black text-slate-600 hover:bg-slate-200 transition-all uppercase text-xs tracking-widest"
                >
                  Batal
                </button>
                <button
                  onClick={handleFinalExit}
                  className="bg-red-600 py-4 rounded-2xl font-black text-white hover:bg-red-700 transition-all shadow-lg uppercase text-xs tracking-widest shadow-red-200 active:scale-95"
                >
                  Ya, Keluar
                </button>
              </div>
            </div>
          </div>
        )}

        {isLocked && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[99999] flex flex-col items-center justify-center p-6 text-white text-center">
            <div className="bg-red-600 p-8 rounded-full shadow-[0_0_120px_rgba(220,38,38,0.7)] animate-bounce mb-8 border-4 border-white/20">
              <img
                src={simeongLogo}
                alt="LOGO"
                className="w-24 h-24 object-contain brightness-0 invert"
              />
            </div>
            <h2 className="text-5xl font-black text-red-600 mb-2 uppercase italic tracking-tighter text-shadow-xl leading-none">
              AKSES TERKUNCI!
            </h2>
            <p className="text-slate-400 mb-10 font-bold text-xs uppercase tracking-widest px-8 py-2 bg-red-600/10 rounded-full border border-red-600/20 text-red-200">
              {String(message)}
            </p>
            <div className="bg-[#12192b]/95 backdrop-blur-xl p-10 rounded-[48px] border border-white/10 w-full max-w-md shadow-2xl shadow-black">
              <label className="block text-[11px] font-black text-slate-300 uppercase tracking-[5px] mb-6 text-left">
                OTP HP Pengawas
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="000000"
                className="w-full bg-black border-2 border-slate-800 p-6 rounded-[32px] text-center text-7xl font-mono font-black tracking-[15px] outline-none focus:border-red-600 mb-10 text-red-500 shadow-inner"
                value={otpToken}
                onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
              <button
                onClick={handleUnlock}
                className="w-full bg-white text-black py-7 rounded-[32px] font-black text-2xl hover:bg-slate-100 transition-all uppercase shadow-2xl active:scale-95"
              >
                Buka Kunci
              </button>
              {errorMsg && (
                <p className="text-red-500 text-[10px] font-black uppercase text-center mt-4">
                  {String(errorMsg)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default App;
