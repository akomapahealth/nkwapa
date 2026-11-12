import type { ReactNode } from 'react';

export interface Figure {
  value: ReactNode;
  /** Shown smaller after the value, e.g. "min" or "%". Units always shown (MASTER 12). */
  unit?: string;
  label: string;
}

/**
 * The four figures that matter to a role, right under the greeting band (pilot `.pulse`). Number
 * first and large, label second and quiet; hairlines between cells, two columns on a phone.
 * Not a grid of KPI cards: one ruled strip, no icons, no tiles.
 */
export function FigureStrip({ label, figures }: { label: string; figures: Figure[] }) {
  return (
    <ul
      aria-label={label}
      data-testid="figure-strip"
      className="grid grid-cols-2 border-y border-rule sm:grid-cols-4"
    >
      {figures.map((figure, index) => (
        <li
          key={figure.label}
          className={[
            'min-w-0 px-4 py-4 sm:px-6 sm:py-5 xl:px-8',
            // Right hairline on every cell but the row's last; bottom hairline on the phone's top row.
            index % 2 === 0 ? 'border-r border-rule' : 'sm:border-r sm:border-rule',
            index === figures.length - 1 ? 'sm:border-r-0' : '',
            index < 2 ? 'border-b border-rule sm:border-b-0' : '',
          ].join(' ')}
        >
          <p className="type-metric leading-none text-foreground">
            {figure.value}
            {figure.unit ? (
              <span className="ml-0.5 text-[0.5em] font-medium tracking-normal">
                {figure.unit === '%' ? '%' : ` ${figure.unit}`}
              </span>
            ) : null}
          </p>
          <p className="type-meta mt-1.5 text-muted-foreground">{figure.label}</p>
        </li>
      ))}
    </ul>
  );
}
