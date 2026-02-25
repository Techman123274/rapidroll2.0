import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const SOUND_PREF_KEY = 'rapidroll_sound_prefs_v1';

const defaultPrefs = {
  muted: false,
  masterVolume: 0.8,
  sfxVolume: 0.9
};

const SoundContext = createContext(null);

const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function SoundProvider({ children }) {
  const [prefs, setPrefs] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(SOUND_PREF_KEY) || '{}');
      return {
        muted: Boolean(parsed.muted),
        masterVolume: Number.isFinite(parsed.masterVolume) ? clamp(parsed.masterVolume) : defaultPrefs.masterVolume,
        sfxVolume: Number.isFinite(parsed.sfxVolume) ? clamp(parsed.sfxVolume) : defaultPrefs.sfxVolume
      };
    } catch {
      return defaultPrefs;
    }
  });
  const [isUnlocked, setIsUnlocked] = useState(false);

  const cacheRef = useRef(new Map());
  const cooldownRef = useRef(new Map());
  const failedSrcRef = useRef(new Set());
  const loggedMissingRef = useRef(new Set());
  const audioContextRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(SOUND_PREF_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const unlockAudio = useCallback(() => {
    if (isUnlocked) return;
    setIsUnlocked(true);
  }, [isUnlocked]);

  const setMuted = useCallback((muted) => {
    setPrefs((prev) => ({ ...prev, muted: Boolean(muted) }));
  }, []);

  const setMasterVolume = useCallback((masterVolume) => {
    setPrefs((prev) => ({ ...prev, masterVolume: clamp(masterVolume) }));
  }, []);

  const setSfxVolume = useCallback((sfxVolume) => {
    setPrefs((prev) => ({ ...prev, sfxVolume: clamp(sfxVolume) }));
  }, []);

  const toggleMute = useCallback(() => {
    setPrefs((prev) => ({ ...prev, muted: !prev.muted }));
  }, []);

  const ensureCtx = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContextRef.current = new AudioCtx();
    return audioContextRef.current;
  }, []);

  const synthFallback = useCallback(
    (key, volume = 1) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const scaled = clamp(volume) * prefs.masterVolume * prefs.sfxVolume;
      const tone = (frequency, duration, type = 'sine', gainValue = 0.08, delay = 0) => {
        const start = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, scaled * gainValue), start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      };

      if (String(key).includes('win') || String(key).includes('cashout')) {
        tone(420, 0.08, 'sine', 0.12);
        tone(640, 0.1, 'sine', 0.1, 0.08);
      } else if (String(key).includes('lose') || String(key).includes('mine')) {
        tone(170, 0.1, 'sawtooth', 0.12);
        tone(120, 0.11, 'triangle', 0.09, 0.07);
      } else if (String(key).includes('deal') || String(key).includes('tap') || String(key).includes('drop')) {
        tone(260, 0.05, 'square', 0.1);
        tone(200, 0.04, 'triangle', 0.06, 0.02);
      } else {
        tone(330, 0.06, 'triangle', 0.08);
      }
    },
    [ensureCtx, prefs.masterVolume, prefs.sfxVolume]
  );

  const play = useCallback(
    ({ key, src, volume = 1, cooldownMs = 0 }) => {
      if (!isUnlocked || prefs.muted || prefs.masterVolume <= 0 || prefs.sfxVolume <= 0 || !src) return;

      const now = performance.now();
      const stamp = cooldownRef.current.get(key) || 0;
      if (cooldownMs > 0 && now - stamp < cooldownMs) return;
      cooldownRef.current.set(key, now);

      let audio = cacheRef.current.get(src);
      if (!audio) {
        audio = new Audio(src);
        audio.preload = 'auto';
        audio.addEventListener('error', () => {
          failedSrcRef.current.add(src);
          if (!loggedMissingRef.current.has(src)) {
            console.warn(`[sound] Missing or unreadable audio file: ${src}`);
            loggedMissingRef.current.add(src);
          }
        });
        cacheRef.current.set(src, audio);
      }

      const finalVolume = clamp(volume) * prefs.masterVolume * prefs.sfxVolume;

      try {
        if (failedSrcRef.current.has(src)) {
          synthFallback(key, volume);
          return;
        }
        audio.pause();
        audio.currentTime = 0;
        audio.volume = finalVolume;
        const playPromise = audio.play();
        if (playPromise?.catch) {
          playPromise.catch(() => synthFallback(key, volume));
        }
      } catch {
        synthFallback(key, volume);
      }
    },
    [isUnlocked, prefs.muted, prefs.masterVolume, prefs.sfxVolume, synthFallback]
  );

  const value = useMemo(
    () => ({
      ...prefs,
      isUnlocked,
      unlockAudio,
      setMuted,
      setMasterVolume,
      setSfxVolume,
      toggleMute,
      play
    }),
    [prefs, isUnlocked, unlockAudio, setMuted, setMasterVolume, setSfxVolume, toggleMute, play]
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used within SoundProvider');
  }
  return context;
}
