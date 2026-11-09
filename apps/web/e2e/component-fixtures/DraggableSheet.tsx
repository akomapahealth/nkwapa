import { createRoot } from 'react-dom/client';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

function Fixture() {
  return (
    <>
      <h1>Sheet gesture verification</h1>
      {(['bottom', 'top', 'left', 'right'] as const).map((side) => (
        <Sheet key={side}>
          <SheetTrigger className="m-2 min-h-11 border p-2">Open {side}</SheetTrigger>
          <SheetContent side={side} className="flex max-h-[85dvh] flex-col gap-0 p-0">
            <SheetHeader className="p-5 pr-20 text-left">
              <SheetTitle>Synthetic {side} sheet</SheetTitle>
              <SheetDescription>
                Long synthetic content for scroll and gesture checks.
              </SheetDescription>
            </SheetHeader>
            <div data-testid="scroll-body" className="min-h-0 overflow-y-auto p-5">
              <label>
                Draft text
                <input className="block min-h-11 border" defaultValue="Retain this draft" />
              </label>
              {Array.from({ length: 30 }, (_, i) => (
                <p key={i} className="py-2">
                  Synthetic item {i + 1}
                </p>
              ))}
              <button
                className="min-h-11 border p-2"
                onClick={(e) => (e.currentTarget.textContent = 'Final action reached')}
              >
                Final action
              </button>
            </div>
          </SheetContent>
        </Sheet>
      ))}
    </>
  );
}
createRoot(document.getElementById('component-fixture')!).render(<Fixture />);
