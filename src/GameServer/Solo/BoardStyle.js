'use strict';

// Community Board sizes shared by the Solo Helper pages.
//
// BUTTON_WIDTH: the C4 client draws the L2UI_ch3.Btn1 button texture at one fixed size,
// about 83 of our pixels, whatever width a button asks for. A wider button keeps its
// texture at that size but centres its label over the whole width, so the label runs
// off the button's right edge (seen in game on 2026-11-27 with 116 and 130). Every
// text button on the board is this wide, and its label short enough to fit (about 13
// characters).
const WIDTH = 610;
const BUTTON_WIDTH = 83;
// A cell that holds one button with a little air on each side.
const BUTTON_CELL = 92;

module.exports = { WIDTH, BUTTON_WIDTH, BUTTON_CELL };
