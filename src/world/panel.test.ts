/**
 * Detection panel bookkeeping tests (world/panel.ts): the q_x/q_y index math and
 * the BorgDetectGrid quadrant semantics that borg_check_light's scheduler
 * (item/light.ts's borgCheckLight) is built on.
 */

import { describe, expect, it } from "vitest";
import { AUTO_MAX_X, AUTO_MAX_Y } from "./grid.js";
import {
  BorgDetectGrid,
  PANEL_COLS,
  PANEL_HGT,
  PANEL_ROWS,
  PANEL_WID,
  panelCol,
  panelRow,
} from "./panel.js";

describe("panel index math", () => {
  it("divides the dungeon into an exact 3x3 grid of panels", () => {
    expect(AUTO_MAX_X % PANEL_WID).toBe(0);
    expect(AUTO_MAX_Y % PANEL_HGT).toBe(0);
    expect(AUTO_MAX_X / PANEL_WID).toBe(3);
    expect(AUTO_MAX_Y / PANEL_HGT).toBe(3);
  });

  it("panelCol/panelRow floor-divide by the panel size", () => {
    expect(panelCol(0)).toBe(0);
    expect(panelCol(PANEL_WID - 1)).toBe(0);
    expect(panelCol(PANEL_WID)).toBe(1);
    expect(panelCol(AUTO_MAX_X - 1)).toBe(2);
    expect(panelRow(0)).toBe(0);
    expect(panelRow(PANEL_HGT - 1)).toBe(0);
    expect(panelRow(AUTO_MAX_Y - 1)).toBe(2);
  });

  it("the q+1 quadrant read never runs off the array (PANEL_COLS/ROWS headroom)", () => {
    const maxQx = panelCol(AUTO_MAX_X - 1);
    const maxQy = panelRow(AUTO_MAX_Y - 1);
    expect(maxQx + 1).toBeLessThan(PANEL_COLS);
    expect(maxQy + 1).toBeLessThan(PANEL_ROWS);
  });
});

describe("BorgDetectGrid", () => {
  it("starts fully unswept: every kind needs detecting everywhere", () => {
    const g = new BorgDetectGrid();
    expect(g.isDetected("trap", 0, 0)).toBe(false);
    expect(g.quadrantNeedsDetect("wall", 1, 2)).toBe(true);
  });

  it("markQuadrant sets the 2x2 block at (qy,qx)..(qy+1,qx+1), and nothing else", () => {
    const g = new BorgDetectGrid();
    g.markQuadrant("trap", 0, 0);
    expect(g.isDetected("trap", 0, 0)).toBe(true);
    expect(g.isDetected("trap", 0, 1)).toBe(true);
    expect(g.isDetected("trap", 1, 0)).toBe(true);
    expect(g.isDetected("trap", 1, 1)).toBe(true);
    // Unrelated panel and unrelated kind are untouched.
    expect(g.isDetected("trap", 2, 2)).toBe(false);
    expect(g.isDetected("door", 0, 0)).toBe(false);
  });

  it("quadrantNeedsDetect is true if ANY of the four cells is still unswept", () => {
    const g = new BorgDetectGrid();
    g.markQuadrant("evil", 0, 0);
    // Only 3 of the 4 marked - simulate a hole by re-reading a fresh grid and
    // marking three cells directly via two overlapping quadrant calls.
    const h = new BorgDetectGrid();
    h.markQuadrant("evil", 0, 0); // marks (0,0)(0,1)(1,0)(1,1)
    expect(h.quadrantNeedsDetect("evil", 0, 0)).toBe(false);
    // A quadrant shifted by one column still has an unswept far cell.
    expect(h.quadrantNeedsDetect("evil", 0, 1)).toBe(true);
    void g;
  });

  it("wipe() clears wall/trap/door/evil but faithfully leaves obj untouched", () => {
    const g = new BorgDetectGrid();
    g.markQuadrant("wall", 0, 0);
    g.markQuadrant("trap", 0, 0);
    g.markQuadrant("door", 0, 0);
    g.markQuadrant("evil", 0, 0);
    g.markQuadrant("obj", 0, 0);
    g.wipe();
    expect(g.isDetected("wall", 0, 0)).toBe(false);
    expect(g.isDetected("trap", 0, 0)).toBe(false);
    expect(g.isDetected("door", 0, 0)).toBe(false);
    expect(g.isDetected("evil", 0, 0)).toBe(false);
    // The upstream wart (borg-update.c:2094-2104 never clears borg_detect_obj).
    expect(g.isDetected("obj", 0, 0)).toBe(true);
  });
});
