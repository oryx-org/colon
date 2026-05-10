/**
 * Video Scrubber Service (Planned)
 *
 * Future feature: Bi-directional code-to-video scrubbing.
 * Clicking a line of code seeks to the corresponding animation frame,
 * and scrubbing the video highlights the active code line.
 *
 * Implementation plan:
 * - Parse Manim scene script to build a timeline map:
 *   { codeLine: number, animationIndex: number, startTime: number, endTime: number }
 * - Embed timeline metadata into the video's meta.json
 * - Frontend VideoPlayer component reads timeline and syncs with editor cursor
 * - Editor decorations highlight the active line during playback
 *
 * @module videoScrubber
 * @status planned
 * @since v2.0
 */

/**
 * @typedef {Object} TimelineEntry
 * @property {number} codeLine - Line number in the source code
 * @property {number} animationIndex - Index of the Manim animation step
 * @property {number} startTime - Start time in seconds
 * @property {number} endTime - End time in seconds
 * @property {string} description - Human-readable description of the step
 */

/**
 * Build a timeline map from a Manim scene script.
 * @param {string} sceneScript - The generated Manim Python script
 * @param {number} videoDuration - Total video duration in seconds
 * @returns {TimelineEntry[]} Timeline entries
 */
function buildTimeline(sceneScript, videoDuration) {
    // TODO: Implement in v2.0
    throw new Error('Video scrubber is not yet implemented. Coming in v2.0.');
}

/**
 * Find the timeline entry for a given code line.
 * @param {TimelineEntry[]} timeline - Built timeline
 * @param {number} codeLine - Source code line number
 * @returns {TimelineEntry|null} Matching entry or null
 */
function getEntryForCodeLine(timeline, codeLine) {
    return timeline.find(e => e.codeLine === codeLine) || null;
}

module.exports = { buildTimeline, getEntryForCodeLine };
