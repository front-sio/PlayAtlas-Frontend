var menuState={init:function(){this.menuInfo=new Object,game.scale.setResizeCallback(this.onResize,this);

// Initialize server integration
if (window.ServerIntegration && !window.ServerIntegration.initialized) {
    window.ServerIntegration.init();
    window.ServerIntegration.initialized = true;
}

// Set default AI level
if(window.__POOL_AUTOSTART__ && window.__POOL_AUTOSTART__.ai){
    projectInfo.aiRating=window.__POOL_AUTOSTART__.ai;
} else {
    projectInfo.aiRating=3;
}

// Listen for AI level changes
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'UPDATE_AI_LEVEL') {
        projectInfo.aiRating = event.data.level;
    }
});

// Set practice mode defaults
projectInfo.mode=1;
projectInfo.levelName="practice_ai_"+projectInfo.aiRating.toString();
projectInfo.tutorial=false;
projectInfo.clickedHelpButton=false;

// Initialize scores if not exists
if(null==window.famobi.localStorage.getItem("bestScore")){
    projectInfo.bestScore=0;
} else {
    projectInfo.bestScore=window.famobi.localStorage.getItem("bestScore");
}
if(null==window.famobi.localStorage.getItem("numGames")){
    projectInfo.numGames=0;
} else {
    projectInfo.numGames=window.famobi.localStorage.getItem("numGames");
}},

onResize:function(t,e){this.resizeGame(t,e)},

create:function(){var t=this.menuInfo;
    console.log('[8Ball Practice] Creating practice UI');
    
    // Simple black background
    game.stage.backgroundColor="#000000";
    
    // Create main container
    t.practiceContainer = new Phaser.Group(game, game.stage, "practiceContainer");
    t.practiceContainer.x = game.width/2;
    t.practiceContainer.y = game.height/2;
    
    // Get player info
    var playerName = (window.ServerIntegration && window.ServerIntegration.playerName) || 'Player';
    
    // Simple title
    t.practiceTitle = new Phaser.BitmapText(game, 0, -150, "font2", "PRACTICE MODE", 48);
    t.practiceTitle.anchor = new Point(0.5, 0.5);
    t.practiceContainer.addChild(t.practiceTitle);
    
    // Player name
    t.playerText = new Phaser.BitmapText(game, 0, -80, "font3", playerName, 32);
    t.playerText.anchor = new Point(0.5, 0.5);
    t.practiceContainer.addChild(t.playerText);
    
    // Large PLAY button (moved up, no AI controls)
    t.playButton = new Phaser.Button(game, 0, 0, "playButton", function(){
        // Start practice game immediately with default AI level
        projectInfo.mode = 1;
        projectInfo.aiRating = 3; // Default medium AI
        projectInfo.levelName = "practice_ai_" + projectInfo.aiRating.toString();
        game.add.tween(t.practiceContainer).to({alpha:0}, 800, Phaser.Easing.Linear.None, true).onComplete.add(function(){
            game.state.start("play");
        }, this);
    }, this, 1, 0, 1, 0);
    t.playButton.anchor = new Point(0.5, 0.5);
    t.playButton.scale = new Point(1.3, 1.3); // Make it bigger
    t.practiceContainer.addChild(t.playButton);
    
    // PLAY text on button
    t.playText = new Phaser.BitmapText(game, 0, 0, "font2", "PLAY", 42);
    t.playText.anchor = new Point(0.5, 0.5);
    t.practiceContainer.addChild(t.playText);
    
    // Simple instruction
    t.instructionText = new Phaser.BitmapText(game, 0, 80, "font3", "Practice against AI opponent", 24);
    t.instructionText.anchor = new Point(0.5, 0.5);
    t.practiceContainer.addChild(t.instructionText);
    
    // Back button (positioned where refresh would be, top-left area)
    t.backButton = new Phaser.Button(game, -game.width/2 + 80, -game.height/2 + 60, "quitButton", function(){
        // Navigate back to main menu/dashboard
        window.location.href = '/dashboard';
    }, this, 1, 0, 1, 0);
    t.backButton.anchor = new Point(0.5, 0.5);
    t.backButton.scale = new Point(0.6, 0.6);
    t.practiceContainer.addChild(t.backButton);
    
    // Resize function
    this.resizeGame = function(e, n) {
        t.practiceContainer.x = game.width/2;
        t.practiceContainer.y = game.height/2;
        
        // Reposition back button to top-left area
        if (t.backButton) {
            t.backButton.x = -game.width/2 + 80;
            t.backButton.y = -game.height/2 + 60;
        }
    };
    
    // Monitor server state
    window.updateGameHUD = function(state) {
        if (state && state.playerName && t.playerText) {
            t.playerText.text = state.playerName;
        }
    };
    
    // Auto-start if enabled
    if(window.__POOL_AUTOSTART__ && window.__POOL_AUTOSTART__.enabled && window.__POOL_AUTOSTART__.mode === 'practice'){
        setTimeout(function(){
            projectInfo.mode = 1;
            projectInfo.levelName = "practice_ai_" + projectInfo.aiRating.toString();
            game.state.start("play");
        }, 100);
        return;
    }
    
    // Fade in effect
    t.practiceContainer.alpha = 0;
    game.add.tween(t.practiceContainer).to({alpha:1}, 1000, Phaser.Easing.Linear.None, true);
    
    // Game ready
    if (window.famobi && window.famobi.gameReady) {
        window.famobi.gameReady();
    }
    if (window.famobi && window.famobi.playerReady) {
        window.famobi.playerReady();
    }
},

update:function(){
    // No complex update logic needed for practice mode
},

shutdown:function(){
    var menuInfo = this.menuInfo;
    if (menuInfo && menuInfo.practiceContainer) {
        game.stage.removeChild(menuInfo.practiceContainer);
        menuInfo.practiceContainer.destroy();
    }
    this.menuInfo = null;
}};

// No complex menu functions needed for practice mode