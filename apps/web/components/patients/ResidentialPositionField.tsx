'use client';

import { useId, useState } from 'react';
import { ExternalLink, LocateFixed, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldError, fieldErrorProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  describePositionCapture,
  formatPosition,
  googleMapsUrl,
  parsePosition,
  POSITION_PARSE_ERRORS,
  type ResidentialPosition,
} from '@/lib/residential-location';
import { isInGhana } from '@nkwapa/db/ghana-locations';

/** A device fix looser than this is shown as rough, with a nudge to try again outdoors. */
const ROUGH_ACCURACY_M = 100;

type DeviceState =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'confirm'; fix: ResidentialPosition }
  | { kind: 'unavailable'; message: string };

const GEOLOCATION_MESSAGES: Record<number, string> = {
  1: 'Location permission is off for this browser. Paste a shared location instead.',
  2: 'This device could not find its location. Paste a shared location instead.',
  3: 'Finding the location took too long. Try again outdoors, or paste a shared location.',
};

/**
 * The optional home position (#343). Pasting what the patient shares from their own phone is the
 * main path; the device button is for home visits only, because at a clinic or screening hub the
 * device is at the hub. Nothing here touches the network: parsing is local and the map link only
 * opens when tapped, so the section works offline.
 */
export function ResidentialPositionField({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: ResidentialPosition | null;
  onChange: (next: ResidentialPosition | null) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const pasteId = `${idPrefix}-position-paste`;
  const confirmHeadingId = useId();
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState<string>();
  const [device, setDevice] = useState<DeviceState>({ kind: 'idle' });

  const applyPasted = (text: string) => {
    if (!text.trim()) {
      setPasteError(undefined);
      return;
    }
    const parsed = parsePosition(text);
    if (!parsed.ok) {
      setPasteError(POSITION_PARSE_ERRORS[parsed.reason]);
      return;
    }
    setPasteError(undefined);
    setPasted('');
    setDevice({ kind: 'idle' });
    onChange({
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      source: 'PASTED',
      accuracyM: null,
      capturedAt: new Date().toISOString(),
    });
  };

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDevice({
        kind: 'unavailable',
        message: 'This browser cannot share its location. Paste a shared location instead.',
      });
      return;
    }
    setDevice({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        const latitude = Math.round(coords.latitude * 1e6) / 1e6;
        const longitude = Math.round(coords.longitude * 1e6) / 1e6;
        if (!isInGhana(latitude, longitude)) {
          setDevice({ kind: 'unavailable', message: POSITION_PARSE_ERRORS['outside-ghana'] });
          return;
        }
        setDevice({
          kind: 'confirm',
          fix: {
            latitude,
            longitude,
            source: 'DEVICE',
            accuracyM: Math.round(coords.accuracy),
            capturedAt: new Date(timestamp || Date.now()).toISOString(),
          },
        });
      },
      (error) =>
        setDevice({
          kind: 'unavailable',
          message: GEOLOCATION_MESSAGES[error.code] ?? GEOLOCATION_MESSAGES[2],
        }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 disabled:opacity-60">
      <legend className="type-label">
        Map position <span className="font-normal text-muted-foreground">(optional)</span>
      </legend>

      {value ? (
        <div className="flex flex-col gap-3 rounded-md border border-rule bg-muted/40 p-3 sm:flex-row sm:items-center">
          <MapPin className="hidden h-4 w-4 shrink-0 text-primary sm:block" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium tabular-nums text-foreground">
              {formatPosition(value)}
            </p>
            <p className="text-sm leading-5 text-muted-foreground">
              {describePositionCapture(value)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={googleMapsUrl(value)} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Check on map
                <span className="sr-only">(opens Google Maps in a new tab)</span>
              </a>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
              <span className="sr-only">map position</span>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor={pasteId}>Shared location</Label>
            <div className="flex gap-2">
              <Input
                id={pasteId}
                className="min-w-0"
                value={pasted}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="Google Maps link, or 5.6037, -0.1870"
                aria-describedby={[`${pasteId}-hint`, pasteError ? `${pasteId}-error` : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-invalid={fieldErrorProps(pasteId, pasteError)['aria-invalid']}
                onChange={(event) => {
                  setPasted(event.currentTarget.value);
                  if (pasteError) setPasteError(undefined);
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData('text');
                  if (text) {
                    event.preventDefault();
                    setPasted(text);
                    applyPasted(text);
                  }
                }}
                onBlur={() => applyPasted(pasted)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    // Enter would submit the whole registration; here it means "use this".
                    event.preventDefault();
                    applyPasted(pasted);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={() => applyPasted(pasted)}
              >
                Use
              </Button>
            </div>
            <p id={`${pasteId}-hint`} className="text-sm leading-5 text-muted-foreground">
              Ask the patient to share their location from Google Maps or WhatsApp, then paste it
            </p>
            <FieldError id={pasteId} message={pasteError} />
          </div>

          {device.kind === 'confirm' ? (
            <div
              role="group"
              aria-labelledby={confirmHeadingId}
              className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3 motion-safe:duration-200 motion-safe:ease-out-strong motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1"
            >
              <div>
                <p id={confirmHeadingId} className="text-sm font-medium text-foreground">
                  Is the patient&apos;s home here?
                </p>
                <p className="text-sm leading-5 tabular-nums text-muted-foreground">
                  {formatPosition(device.fix)} · accurate to about {device.fix.accuracyM} m
                </p>
                {(device.fix.accuracyM ?? 0) > ROUGH_ACCURACY_M ? (
                  <p className="mt-1 text-sm leading-5 text-foreground">
                    That is a rough fix. Step outside, wait a moment and try again for a closer one.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 [&>button]:h-auto [&>button]:whitespace-normal">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onChange(device.fix);
                    setDevice({ kind: 'idle' });
                  }}
                >
                  Yes, save this position
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={locate}>
                  Try again
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDevice({ kind: 'idle' })}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button
                type="button"
                variant="outline"
                // Wraps at large text sizes instead of pushing the page sideways.
                className="h-auto max-w-full self-start whitespace-normal text-left"
                loading={device.kind === 'locating'}
                onClick={locate}
              >
                <LocateFixed className="h-4 w-4" aria-hidden />
                Use this device&apos;s location
              </Button>
              <p className="text-sm leading-5 text-muted-foreground">
                Home visits only. At a clinic or screening hub this records the hub, not the home.
              </p>
            </div>
          )}
          {device.kind === 'unavailable' ? (
            <p role="status" className="text-sm leading-5 text-muted-foreground">
              {device.message}
            </p>
          ) : null}
        </>
      )}
    </fieldset>
  );
}
