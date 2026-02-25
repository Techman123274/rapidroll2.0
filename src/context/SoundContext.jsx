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
        cacheRef.current.set(src, audio);
      }

      const finalVolume = clamp(volume) * prefs.masterVolume * prefs.sfxVolume;

      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = finalVolume;
        const playPromise = audio.play();
        if (playPromise?.catch) {
          playPromise.catch(() => {});
        }
      } catch {
        // ignore failed playback when browser blocks audio
      }
    },
    [isUnlocked, prefs.muted, prefs.masterVolume, prefs.sfxVolume]
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
