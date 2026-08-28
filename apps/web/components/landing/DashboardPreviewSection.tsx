'use client';

import { useRef, useState } from 'react';
import { motion, useInView, useReducedMotion, AnimatePresence } from 'framer-motion';
import { Users, FileText, Pill, BarChart3, ChevronRight, Circle } from 'lucide-react';
import { NoiseTexture } from './shared/NoiseTexture';
import { CountUp } from './shared/CountUp';

const tabs = [
  { id: 'patients', label: 'Patients', icon: Users },
  { id: 'encounters', label: 'Encounters', icon: FileText },
  { id: 'prescriptions', label: 'Prescriptions', icon: Pill },
] as const;

type TabId = (typeof tabs)[number]['id'];

const stats = [
  { label: 'Total Patients', value: 487 },
  { label: 'Active Encounters', value: 24 },
  { label: 'Pending Sync', value: 3 },
];

function PatientsList() {
  const rows = [
    { code: 'NK-0042', name: 'A. Mensah', condition: 'HTN Stage 2', status: 'In Progress' },
    { code: 'NK-0115', name: 'K. Osei', condition: 'DM Suspected', status: 'Waiting' },
    { code: 'NK-0089', name: 'F. Adjei', condition: 'HTN Elevated', status: 'Completed' },
    { code: 'NK-0203', name: 'B. Acheampong', condition: 'DM Flagged', status: 'Review' },
  ];
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-4 gap-2 border-b border-border/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Code</span>
        <span>Patient</span>
        <span>Condition</span>
        <span>Status</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.code}
          className="grid cursor-default grid-cols-4 gap-2 rounded-md px-3 py-2 text-[11px] transition-colors hover:bg-muted/60"
        >
          <span className="font-mono font-medium text-primary">{r.code}</span>
          <span className="text-foreground">{r.name}</span>
          <span className="text-muted-foreground">{r.condition}</span>
          <span
            className={
              r.status === 'Completed'
                ? 'text-success'
                : r.status === 'Review'
                  ? 'text-secondary'
                  : r.status === 'In Progress'
                    ? 'text-primary'
                    : 'text-muted-foreground'
            }
          >
            {r.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function EncountersList() {
  const encounters = [
    { id: 'ENC-4821', patient: 'A. Mensah', type: 'HTN Follow-up', state: 'Draft' },
    { id: 'ENC-4820', patient: 'K. Osei', type: 'DM Screening', state: 'Under Review' },
    { id: 'ENC-4819', patient: 'M. Tetteh', type: 'HTN Initial', state: 'Finalized' },
  ];
  return (
    <div className="space-y-2">
      {encounters.map((e) => (
        <div
          key={e.id}
          className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <FileText className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-foreground">{e.type}</p>
              <p className="text-[10px] text-muted-foreground">
                {e.id} · {e.patient}
              </p>
            </div>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
              e.state === 'Finalized'
                ? 'bg-success/12 text-success-ink'
                : e.state === 'Under Review'
                  ? 'bg-secondary/15 text-secondary'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {e.state}
          </span>
        </div>
      ))}
    </div>
  );
}

function PrescriptionsList() {
  const rxs = [
    { drug: 'Amlodipine 5mg', patient: 'A. Mensah', freq: 'Once daily', enc: 'ENC-4821' },
    { drug: 'Metformin 500mg', patient: 'K. Osei', freq: 'Twice daily', enc: 'ENC-4820' },
    { drug: 'Lisinopril 10mg', patient: 'M. Tetteh', freq: 'Once daily', enc: 'ENC-4819' },
  ];
  return (
    <div className="space-y-2">
      {rxs.map((rx) => (
        <div
          key={rx.drug + rx.enc}
          className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary/15">
              <Pill className="h-3.5 w-3.5 text-secondary" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-foreground">{rx.drug}</p>
              <p className="text-[10px] text-muted-foreground">
                {rx.patient} · {rx.freq}
              </p>
            </div>
          </div>
          <span className="font-mono text-[9px] text-muted-foreground">{rx.enc}</span>
        </div>
      ))}
    </div>
  );
}

const tabContent: Record<TabId, React.ReactNode> = {
  patients: <PatientsList />,
  encounters: <EncountersList />,
  prescriptions: <PrescriptionsList />,
};

export function DashboardPreviewSection() {
  const [activeTab, setActiveTab] = useState<TabId>('patients');
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  return (
    <section ref={sectionRef} className="landing-gradient-mesh-alt relative py-20 md:py-28">
      <NoiseTexture opacity={0.025} />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <motion.div
          className="mx-auto mb-12 max-w-2xl text-center"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Product preview
          </p>
          <h2 className="mt-3 font-landing-heading text-3xl font-black lowercase tracking-tight text-foreground sm:text-4xl md:text-5xl">
            see what your team sees every day
          </h2>
          <p className="mt-4 font-landing-body text-base text-muted-foreground">
            A single dashboard for patient queues, encounter workflows, and prescription
            tracking—built for clinical velocity.
          </p>
        </motion.div>

        {/* Browser chrome mockup */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 40, scale: 0.97 }}
          animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.25, 0.4, 0.25, 1] as const }}
          className="mx-auto max-w-4xl"
        >
          <div className="overflow-hidden rounded-xl border border-border shadow-2xl shadow-primary/10">
            {/* Browser title bar */}
            <div className="flex items-center gap-2 border-b border-border bg-muted/80 px-4 py-2.5">
              {/*
                These three keep literal traffic-light colours on purpose. They are not product
                status: they are a drawing of a macOS window, and a viewer reads them as a browser
                frame precisely because they are always red, amber and green. Retargeting them at
                --destructive / --warning / --success would make the illustration track the brand
                and stop reading as a browser.
              */}
              <div aria-hidden="true" className="flex gap-1.5">
                <Circle className="h-2.5 w-2.5 fill-red-400 text-red-400" />
                <Circle className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                <Circle className="h-2.5 w-2.5 fill-green-400 text-green-400" />
              </div>
              <div className="ml-3 flex flex-1 items-center rounded-md bg-background px-3 py-1">
                <span className="text-[10px] text-muted-foreground">app.nkwapa.org/dashboard</span>
              </div>
            </div>

            {/* Dashboard content */}
            <div className="flex min-h-[360px] bg-background sm:min-h-[400px]">
              {/* Sidebar */}
              <div className="hidden w-44 shrink-0 border-r border-border bg-muted/30 p-3 sm:block">
                <p className="mb-4 font-landing-heading text-sm font-bold lowercase text-foreground">
                  nkwapa
                </p>
                <nav className="space-y-1">
                  {[
                    { icon: BarChart3, label: 'Dashboard' },
                    { icon: Users, label: 'Patients' },
                    { icon: FileText, label: 'Encounters' },
                    { icon: Pill, label: 'Prescriptions' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={`flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                        item.label === 'Dashboard'
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <item.icon className="h-3.5 w-3.5" />
                      {item.label}
                    </div>
                  ))}
                </nav>
              </div>

              {/* Main content area */}
              <div className="flex-1 p-4 sm:p-5">
                {/* Stats bar */}
                <div className="mb-5 grid grid-cols-3 gap-3">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5"
                    >
                      <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                      <p className="mt-0.5 font-landing-heading text-lg font-bold text-foreground">
                        {isInView ? <CountUp to={stat.value} /> : '0'}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Tabs */}
                <div className="mb-4 flex gap-1 border-b border-border">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-[11px] font-medium transition-colors ${
                          activeTab === tab.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Tab content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? {} : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    {tabContent[activeTab]}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Caption */}
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center font-landing-body text-xs text-muted-foreground">
            <ChevronRight className="h-3 w-3 text-primary" />
            Interactive preview — click tabs to explore
          </p>
        </motion.div>
      </div>
    </section>
  );
}
