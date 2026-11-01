/**
 * Hands the browser a file to save. In an app added to the iOS Home Screen there is no download
 * bar, so a `download` link goes nowhere useful; the share sheet ("Save to Files") does (#206).
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (iosStandalone && typeof File !== 'undefined') {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (error) {
        // Closing the share sheet is a choice, not a failure; anything else falls back.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari can still be reading the URL when click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
