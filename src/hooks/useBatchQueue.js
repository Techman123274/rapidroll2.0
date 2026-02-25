import { useCallback, useRef, useState } from 'react';

export function useBatchQueue() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ total: 0, done: 0 });
  const stopRef = useRef(false);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  const start = useCallback(async ({ total, task, intervalMs = 0, onComplete, onError }) => {
    if (isRunning) return;
    const count = Math.max(1, Number(total) || 1);
    setIsRunning(true);
    setProgress({ total: count, done: 0 });
    stopRef.current = false;

    try {
      for (let index = 0; index < count; index += 1) {
        if (stopRef.current) break;
        await task(index, count, stopRef.current);
        setProgress({ total: count, done: index + 1 });
        if (intervalMs > 0 && index < count - 1 && !stopRef.current) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }
      if (typeof onComplete === 'function') {
        onComplete(stopRef.current);
      }
    } catch (error) {
      if (typeof onError === 'function') {
        onError(error);
      }
    } finally {
      setIsRunning(false);
      stopRef.current = false;
    }
  }, [isRunning]);

  return {
    isRunning,
    progress,
    start,
    stop
  };
}
