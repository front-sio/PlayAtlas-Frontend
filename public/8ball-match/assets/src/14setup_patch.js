// Add new back navigation function
function navigateBack() {
  // Use window navigation to go back to /game page
  if (window.parent !== window) {
    // If in iframe, post message to parent
    window.parent.postMessage({ type: 'GAME_EXIT' }, '*');
  } else {
    // Direct navigation
    window.location.href = '/game';
  }
}
