/**
 * Detection panel bookkeeping - a faithful port of the borg_detect_wall/trap/
 * door/evil/obj arrays and the panel-index math that indexes them
 * (reference/src/borg/borg-update.c:82-86, borg-update.c:1260-1458,2094-2104;
 * reference/src/borg/borg-cave-util.c:60-96; reference/src/ui-term.h:257-274).
 *
 * WHAT A "PANEL" IS UPSTREAM. Angband's own dungeon max is far bigger than one
 * screen (AUTO_MAX_X x AUTO_MAX_Y = 198x66, see world/grid.ts), so the game
 * scrolls a SCREEN_WID x SCREEN_HGT viewport around inside it, and the Borg
 * remembers, per coarse screen-sized region ("panel"), whether it has already
 * cast each detection spell there - so borg_check_light does not recast Find
 * Traps/Doors/Stairs, Detect Evil, Magic Mapping or Detect Objects on every
 * single step, only when it walks into a chunk of the level it has not yet
 * swept. `q_x = w_x / borg_panel_wid()` / `q_y = w_y / borg_panel_hgt()`
 * locate the panel holding the top-left of the CURRENT screen; borg_check_light
 * then treats a 2x2 block of panel indices (q and q+1 in both axes) as "needs
 * redetecting" if ANY of the four is unmarked - a deliberately conservative
 * check that tolerates the screen straddling a panel boundary.
 *
 * FIDELITY REDUCTION: w_x/w_y are terminal scroll state, which this port has
 * no analogue for - the same reduction already made for BORG_OKAY
 * (flow-kill.ts's killWouldBeVisible: "the port has no panel, every grid it
 * holds is a grid it could examine"). That precedent is about VISIBILITY
 * within the viewport and does not carry over here: this module is dungeon-
 * REGION bookkeeping for detection cadence, which stays meaningful with no
 * viewport at all. q_x/q_y are derived directly from the Borg's own grid
 * position (self.c) divided by the panel size - the natural substitute for
 * "which screen is currently showing", since the real game keeps the visible
 * screen scrolled to follow the player.
 *
 * PANEL SIZE. borg_panel_wid()/hgt() return the live terminal's map viewport
 * in tiles, which the reference borg almost always runs at the game's default
 * full-screen size: an 80x24 terminal, unscaled tiles, standard sidebar -
 * SCREEN_HGT = Term->hgt(24) - ROW_MAP(1) - ROW_BOTTOM_MAP(1) = 22,
 * SCREEN_WID = (Term->wid(80) - COL_MAP(13) - 1) / tile_width(1) = 66
 * (ui-term.c:303-305). That divides the 198x66 dungeon into an exact 3x3 grid
 * of panels, which this port fixes as a constant instead of a live terminal
 * query. (Upstream's array is oversized at [6][18] - AUTO_MAX/11 in each axis
 * - to also cover much smaller/tile-scaled terminals, down to an 11x11 panel;
 * this port only needs to support the one terminal size it is modelling, so
 * the arrays here are sized to the 3x3 case plus the q+1 headroom the
 * quadrant check reads.)
 *
 * THE borg_detect_obj WART. borg-update.c's new-level wipe (2094-2104) clears
 * wall/trap/door/evil but NOT obj - a real upstream omission, preserved here
 * (BorgDetectGrid.wipe() below does not clear "obj" either). The Borg mod
 * ports the reference borg's own scheduling choices, warts included.
 */

import { AUTO_MAX_X, AUTO_MAX_Y } from "./grid.js";

/** borg_panel_wid()/hgt() at the reference borg's usual 80x24 terminal. */
export const PANEL_WID = 66;
export const PANEL_HGT = 22;

/** Panel-index grid dimensions: exact 3x3 coverage, plus the q+1 quadrant read. */
export const PANEL_COLS = Math.floor(AUTO_MAX_X / PANEL_WID) + 1; /* 4 */
export const PANEL_ROWS = Math.floor(AUTO_MAX_Y / PANEL_HGT) + 1; /* 4 */

/** q_x = w_x / borg_panel_wid() (borg-light.c:276), read off the Borg's own x. */
export function panelCol(x: number): number {
  return Math.floor(x / PANEL_WID);
}

/** q_y = w_y / borg_panel_hgt() (borg-light.c:277), read off the Borg's own y. */
export function panelRow(y: number): number {
  return Math.floor(y / PANEL_HGT);
}

/** The five borg_detect_* arrays (borg-update.c:82-86). */
export type DetectKind = "wall" | "trap" | "door" | "evil" | "obj";
const DETECT_KINDS: readonly DetectKind[] = [
  "wall",
  "trap",
  "door",
  "evil",
  "obj",
];

function makeGrid(): boolean[][] {
  const rows: boolean[][] = [];
  for (let y = 0; y < PANEL_ROWS; y++) {
    rows.push(new Array<boolean>(PANEL_COLS).fill(false));
  }
  return rows;
}

/**
 * borg_detect_wall/trap/door/evil/obj[6][18] (borg-update.c:82-86): per-panel
 * "have I already detected this here" memory, one grid per detection kind.
 */
export class BorgDetectGrid {
  private readonly grids: Record<DetectKind, boolean[][]> = {
    wall: makeGrid(),
    trap: makeGrid(),
    door: makeGrid(),
    evil: makeGrid(),
    obj: makeGrid(),
  };

  /** True once (qy, qx) has been swept for `kind`. Out-of-range reads as swept. */
  isDetected(kind: DetectKind, qy: number, qx: number): boolean {
    const row = this.grids[kind][qy];
    if (!row) return true;
    return row[qx] ?? true;
  }

  /**
   * do_trap / do_door / do_wall / do_evil / do_obj (borg-light.c:280-352): true
   * if ANY cell of the 2x2 panel-index block starting at (qy, qx) is still
   * unswept for `kind`.
   */
  quadrantNeedsDetect(kind: DetectKind, qy: number, qx: number): boolean {
    return (
      !this.isDetected(kind, qy + 0, qx + 0) ||
      !this.isDetected(kind, qy + 0, qx + 1) ||
      !this.isDetected(kind, qy + 1, qx + 0) ||
      !this.isDetected(kind, qy + 1, qx + 1)
    );
  }

  /**
   * borg_handle_self's per-kind marking (borg-update.c:1359-1458): mark the
   * whole 2x2 panel-index block swept for `kind`.
   */
  markQuadrant(kind: DetectKind, qy: number, qx: number): void {
    this.setIfInBounds(kind, qy + 0, qx + 0);
    this.setIfInBounds(kind, qy + 0, qx + 1);
    this.setIfInBounds(kind, qy + 1, qx + 0);
    this.setIfInBounds(kind, qy + 1, qx + 1);
  }

  private setIfInBounds(kind: DetectKind, qy: number, qx: number): void {
    const row = this.grids[kind][qy];
    if (row && qx >= 0 && qx < row.length) row[qx] = true;
  }

  /**
   * The new-level "panel" reset (borg-update.c:2094-2104). Faithfully leaves
   * "obj" unwiped - see the module header's WART note.
   */
  wipe(): void {
    for (const kind of DETECT_KINDS) {
      if (kind === "obj") continue;
      for (const row of this.grids[kind]) row.fill(false);
    }
  }
}
