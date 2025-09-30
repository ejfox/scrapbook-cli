/**
 * State management for UI animations and intervals
 */
class UIState {
  constructor() {
    this.currentSummaryInterval = null;
    this.fullScreenSummaryInterval = null;
    this.fullScreenSummaryScrollOffset = 0;
    this.fullScreenSummaryLinesPerPage = 20;
  }

  stopCurrentAnimation() {
    if (this.currentSummaryInterval) {
      clearInterval(this.currentSummaryInterval);
      this.currentSummaryInterval = null;
    }
  }

  stopFullScreenAnimation() {
    if (this.fullScreenSummaryInterval) {
      clearInterval(this.fullScreenSummaryInterval);
      this.fullScreenSummaryInterval = null;
    }
  }

  setCurrentInterval(interval) {
    this.stopCurrentAnimation();
    this.currentSummaryInterval = interval;
  }

  setFullScreenInterval(interval) {
    this.stopFullScreenAnimation();
    this.fullScreenSummaryInterval = interval;
  }

  getScrollOffset() {
    return this.fullScreenSummaryScrollOffset;
  }

  setScrollOffset(offset) {
    this.fullScreenSummaryScrollOffset = offset;
  }

  getLinesPerPage() {
    return this.fullScreenSummaryLinesPerPage;
  }
}

// Create singleton instance
export const uiState = new UIState();