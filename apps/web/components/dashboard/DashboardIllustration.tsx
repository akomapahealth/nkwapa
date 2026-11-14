'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AnimationItem } from 'lottie-web';
import { helloRest } from './hello-rest';
import { checklistRest } from './checklist-rest';
import styles from './dashboard-illustration.module.css';

/** Only checked-in, exported SVG is inserted here; no API or user-authored markup. */
export function DashboardIllustration({ kind }: { kind: 'hello' | 'checklist' }) {
  const host = useRef<HTMLDivElement>(null);
  const id = useId().replaceAll(':', '');
  const rest = useMemo(
    () =>
      (kind === 'hello' ? helloRest : checklistRest).replaceAll('__lottie_element_', `rest-${id}-`),
    [kind, id],
  );
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const controller = new AbortController();
    let player: AnimationItem | undefined;
    let disposed = false;
    const restFrame = kind === 'hello' ? 60 : 98;
    const fallback = () => {
      setReady(false);
      player?.destroy();
      player = undefined;
    };
    // The static rest frame is immediate, including slow imports and failed asset/player loads.
    async function play(container: HTMLDivElement) {
      if (reduce.matches) return;
      try {
        const [module, response] = await Promise.all([
          import('lottie-web'),
          fetch(`/lottie/${kind === 'hello' ? 'Hello' : 'checklist'}.json`, {
            signal: controller.signal,
          }),
        ]);
        if (!response.ok) return;
        const data = await response.json();
        if (disposed || reduce.matches) return;
        player = module.default.loadAnimation({
          container,
          animationData: data,
          renderer: 'svg',
          loop: false,
          autoplay: false,
        });
        player.addEventListener('DOMLoaded', () => {
          if (disposed || !player) return;
          if (reduce.matches) {
            fallback();
            return;
          }
          setReady(true);
          player.playSegments([0, restFrame], true);
        });
        player.addEventListener('complete', () => {
          player?.goToAndStop(restFrame, true);
          container.dataset.frame = String(restFrame);
        });
        player.addEventListener('data_failed', fallback);
        player.addEventListener('error', fallback);
      } catch {
        if (!disposed) fallback();
      }
    }
    const onReduce = () => {
      if (reduce.matches) fallback();
    };
    reduce.addEventListener('change', onReduce);
    void play(container);
    return () => {
      disposed = true;
      controller.abort();
      reduce.removeEventListener('change', onReduce);
      player?.destroy();
    };
  }, [kind]);

  return (
    <div
      aria-hidden="true"
      className={styles.art}
      data-testid={`illustration-${kind}`}
      data-playing={ready}
    >
      <div
        className={styles.rest}
        style={{ visibility: ready ? 'hidden' : 'visible' }}
        dangerouslySetInnerHTML={{ __html: rest }}
      />
      <div
        ref={host}
        className={styles.player}
        style={{ visibility: ready ? 'visible' : 'hidden' }}
      />
    </div>
  );
}
