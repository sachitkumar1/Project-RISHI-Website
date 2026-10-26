import Ridgelines from "./Ridgelines";
import Foliage from "./Foliage";

/**
 * The dawn backdrop for the public pages' headers (About, Projects, the four
 * project pages, Apply, Contact, Donate): drawn ridgelines along the bottom
 * that shift with depth as you scroll, and a deodar bough in the corner.
 * Pair with a section carrying the `dawn-header` class (globals.css).
 */
export default function HeaderScenery({ bough = true }: { bough?: boolean }) {
  return (
    <>
      <div aria-hidden className="ridge-scope pointer-events-none absolute inset-x-0 bottom-0 h-[var(--ridge-h)]">
        <Ridgelines className="h-full w-full" />
      </div>
      {bough && (
        <Foliage kind="deodar" seed={7} flip className="-right-12 top-[calc(var(--header-h)+0.5rem)] hidden h-[24vh] w-[34vw] max-w-[460px] sm:block" />
      )}
    </>
  );
}
