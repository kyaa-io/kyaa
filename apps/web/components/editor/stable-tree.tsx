import { cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

/** Marks what a document mapping hands to React as a real component (a photo, a video, an embed). `stableTree` leaves it untouched. */
export function RichIsland({ children }: { children: ReactNode }) {
  return children;
}

/**
 * The static document renderer wraps every node and mark in a function it creates again on each call. React sees a new component type
 * at every level, so a second render of the same document unmounted and remounted the whole body: photos were fetched again and videos
 * restarted (the flash on a like, a translation switch, or a re-read after the window regained focus).
 *
 * Those wrappers hold no state, so they are called here and only what they return is kept: plain tags, in the renderer's own key order.
 * React then matches a later render tag by tag and changes only the text that differs. Real components sit inside a `RichIsland`, or are
 * named in `keep` when the renderer's children pass through them (a link).
 */
export function stableTree(node: ReactNode, keep: readonly unknown[] = []): ReactNode {
  if (Array.isArray(node)) return node.map(child => stableTree(child, keep));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === RichIsland) return element;
  if (typeof element.type === "function" && !keep.includes(element.type)) {
    const output = stableTree((element.type as (props: unknown) => ReactNode)(element.props), keep);
    return isValidElement(output) && element.key != null ? cloneElement(output, { key: element.key }) : output;
  }
  if (typeof element.type !== "string" && element.type !== Fragment && !keep.includes(element.type)) return element;
  const children = element.props.children;
  return children == null ? element : cloneElement(element, undefined, stableTree(children, keep));
}
