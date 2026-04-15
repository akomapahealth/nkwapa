/**
 * GSAP + ScrollTrigger registration for client-side use.
 * Import this in components that use GSAP to ensure ScrollTrigger is registered.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export { gsap, ScrollTrigger };
