// frontend/public/8ball-match-withai/assets/src/11timer.js
function updateTimer() {
  var t = playState.gameInfo;
  if (!t.timerStarted || projectInfo.tutorial) return;

  if (projectInfo.isOnlineMatch && typeof projectInfo.matchTimeRemainingSeconds === "number") {
    var remainingSecondsOnline = Math.max(0, Math.floor(projectInfo.matchTimeRemainingSeconds));
    var minutesOnline = Math.floor(remainingSecondsOnline / 60);
    var secondsOnline = Math.floor(remainingSecondsOnline % 60);
    var secondsTextOnline = secondsOnline < 10 ? "0" + secondsOnline.toString() : secondsOnline.toString();
    t.timerText.text = minutesOnline.toString() + ":" + secondsTextOnline;
    return;
  }

  t.time++;
  var matchDuration = Number(projectInfo.matchDurationSeconds || 300);
  var elapsedSeconds = Math.floor(t.time / 60);
  var remainingSeconds = Math.max(0, matchDuration - elapsedSeconds);

  var minutes = Math.floor(remainingSeconds / 60);
  var seconds = Math.floor(remainingSeconds % 60);
  var secondsText = seconds < 10 ? "0" + seconds.toString() : seconds.toString();
  t.timerText.text = minutes.toString() + ":" + secondsText;
}

function startTimer() {
  playState.gameInfo.time = 0;
}

function endTimer() {
  var t = playState.gameInfo;
  if (t.gameRunning === 1) {
    t.timerText.scale = new Point(0.5, 0.5);
    t.timerText.text = "";
    t.gameOver = true;
  }
}

function increaseTime() {
  playState.gameInfo.timeRemaining += 600;
}
