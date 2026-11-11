import Image, { type ImageProps } from 'next/image';

import { cn } from '@/lib/utils';

/**
 * The Nkwapa wordmark in both themes (R7.6). The logo teal measures 4.25:1 on the dark card and
 * reads dim, so dark gets the same art with only the teal lifted to the dark `--brand`
 * (188 80% 47%, 7.66:1). Both render and globals.css hides the other theme's, so the right one is
 * there on first paint. The app-icon mark (`nkwapa-mark.png`) is a filled tile and stays as is.
 */
export function BrandWordmark({ alt, className, ...props }: Omit<ImageProps, 'src'>) {
  return (
    <>
      <Image
        src="/images/nkwapa-logo.png"
        alt={alt}
        className={cn('theme-light-only', className)}
        {...props}
      />
      <Image
        src="/images/nkwapa-logo-dark.png"
        alt={alt}
        className={cn('theme-dark-only', className)}
        {...props}
      />
    </>
  );
}
