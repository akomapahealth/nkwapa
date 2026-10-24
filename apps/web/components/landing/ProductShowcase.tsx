import Image from 'next/image';
import { Expand, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { DESKTOP_ALT, DesktopFrame, PhoneFrame } from './ProductFrames';

// Marker positions are percentages of the desktop screenshot, measured from desktop.png.
const ANNOTATIONS = [
  {
    title: 'The clinic day, in order',
    text: 'Today board, stations, queues, patients, appointments and registration sit together in the menu, in the order a clinic day runs.',
    left: '1.2%',
    top: '30%',
  },
  {
    title: 'Today at a glance',
    text: "Patients, today's visits, drafts, and visits waiting for review or sign-off, for the clinic you are working in.",
    left: '18.4%',
    top: '27.5%',
  },
  {
    title: 'Measurement coverage',
    text: 'How many visits have vital signs, tobacco screening and counseling recorded, with averages across the clinic’s readings.',
    left: '18.4%',
    top: '46.5%',
  },
  {
    title: 'Sync status',
    text: 'Shows whether work recorded offline has reached the server. Here, everything is synced.',
    left: '89%',
    top: '6.5%',
  },
];

function Marker({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold tabular-nums text-secondary-foreground">
      {n}
    </span>
  );
}

export function ProductShowcase() {
  return (
    <section
      id="product"
      aria-labelledby="product-title"
      className="dark bg-background py-20 text-foreground sm:py-28"
    >
      <div className="landing-container">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end" data-reveal>
          <h2
            id="product-title"
            data-split
            className="text-balance font-heading text-4xl font-semibold leading-[1.06] tracking-[-0.015em] sm:text-5xl lg:col-span-7 lg:text-6xl"
          >
            See what a clinic day looks like in Nkwapa.
          </h2>
          <p className="text-lg leading-relaxed text-muted-foreground lg:col-span-5">
            These are real screens from a clinic workspace: the dashboard a clinic director opens on
            a laptop, and the same view on a phone.
          </p>
        </div>

        <div data-showcase className="mt-14 hidden lg:block">
          <DesktopFrame priority sizes="(min-width: 1216px) 1150px, 92vw">
            {ANNOTATIONS.map((item, index) => (
              <span
                key={item.title}
                aria-hidden
                data-marker
                className="absolute"
                style={{ left: item.left, top: item.top }}
              >
                <Marker n={index + 1} />
              </span>
            ))}
          </DesktopFrame>
        </div>

        <div className="mt-12 grid gap-14 lg:mt-16 lg:grid-cols-12 lg:gap-10">
          <ol
            className="grid content-start gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-7 lg:self-center"
            data-reveal
          >
            {ANNOTATIONS.map((item, index) => (
              <li key={item.title} className="flex gap-4">
                <span className="hidden lg:block">
                  <Marker n={index + 1} />
                </span>
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-muted-foreground">{item.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <figure
            className="order-first flex flex-col items-center gap-6 lg:order-none lg:col-span-4 lg:col-start-9 lg:items-start"
            data-reveal
          >
            <PhoneFrame
              priority
              sizes="(min-width: 1024px) 260px, 64vw"
              className="w-[64%] max-w-[17rem]"
            />
            <figcaption className="max-w-sm text-center text-sm leading-relaxed text-muted-foreground lg:text-left">
              On a phone, the menu folds behind one button and the dashboard stacks into a single
              column.
            </figcaption>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="lg:hidden">
                  <Expand aria-hidden />
                  View the desktop dashboard
                </Button>
              </DialogTrigger>
              <DialogContent className="dark max-w-[min(96vw,1200px)] gap-3 p-3 text-foreground sm:p-4">
                <div className="flex items-start justify-between gap-4 px-1">
                  <div>
                    <DialogTitle className="font-heading text-lg">Desktop dashboard</DialogTitle>
                    <DialogDescription className="text-sm">
                      Scroll sideways to see the whole screen.
                    </DialogDescription>
                  </div>
                  <DialogClose asChild>
                    <Button variant="ghost" size="icon" aria-label="Close">
                      <X aria-hidden />
                    </Button>
                  </DialogClose>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Image
                    src="/desktop.png"
                    alt={DESKTOP_ALT}
                    width={3840}
                    height={2160}
                    sizes="960px"
                    loading="eager"
                    fetchPriority="high"
                    className="block h-auto w-[960px] max-w-none sm:w-full sm:max-w-full"
                  />
                </div>
              </DialogContent>
            </Dialog>
          </figure>
        </div>
      </div>
    </section>
  );
}
