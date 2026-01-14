// Enhanced AI Difficulty System for 8Ball Pool
// Supports Practice Mode (1-100 levels) and AI Brain (1-110 levels)

window.enhancedDifficulty = {
    // Current mode: 'classic', 'practice', or 'aiBrain'
    currentMode: 'classic',
    
    // Initialize the enhanced difficulty system
    init: function() {
        this.loadSettings();
        this.setupModeHandlers();
    },
    
    // Load saved settings
    loadSettings: function() {
        // Apply URL parameters if available
        if (window.__ENHANCED_DIFFICULTY_INIT__) {
            const init = window.__ENHANCED_DIFFICULTY_INIT__;
            if (init.practiceLevel) {
                projectInfo.practiceLevel = init.practiceLevel;
                try { window.famobi.localStorage.setItem("practiceLevel", init.practiceLevel); } catch(e) {}
            }
            if (init.aiBrainLevel) {
                projectInfo.aiBrainLevel = init.aiBrainLevel;
                try { window.famobi.localStorage.setItem("aiBrainLevel", init.aiBrainLevel); } catch(e) {}
            }
            if (init.difficultyMode) {
                this.currentMode = init.difficultyMode;
                try { window.famobi.localStorage.setItem("difficultyMode", init.difficultyMode); } catch(e) {}
            }
        }
        
        // Classic AI Rating (1-5) - existing system
        if (null == window.famobi.localStorage.getItem("aiRating")) {
            projectInfo.aiRating = 2;
            try { window.famobi.localStorage.setItem("aiRating", 2); } catch(e) {}
        } else {
            projectInfo.aiRating = Number(window.famobi.localStorage.getItem("aiRating"));
        }
        
        // Practice Level (1-100) 
        if (null == window.famobi.localStorage.getItem("practiceLevel")) {
            projectInfo.practiceLevel = projectInfo.practiceLevel || 1;
            try { window.famobi.localStorage.setItem("practiceLevel", projectInfo.practiceLevel); } catch(e) {}
        } else if (!projectInfo.practiceLevel) {
            projectInfo.practiceLevel = Number(window.famobi.localStorage.getItem("practiceLevel"));
        }
        
        // AI Brain Level (1-110)
        if (null == window.famobi.localStorage.getItem("aiBrainLevel")) {
            projectInfo.aiBrainLevel = projectInfo.aiBrainLevel || 1;
            try { window.famobi.localStorage.setItem("aiBrainLevel", projectInfo.aiBrainLevel); } catch(e) {}
        } else if (!projectInfo.aiBrainLevel) {
            projectInfo.aiBrainLevel = Number(window.famobi.localStorage.getItem("aiBrainLevel"));
        }
        
        // Current difficulty mode
        if (null == window.famobi.localStorage.getItem("difficultyMode")) {
            this.currentMode = this.currentMode || 'classic';
            try { window.famobi.localStorage.setItem("difficultyMode", this.currentMode); } catch(e) {}
        } else if (!this.currentMode || this.currentMode === 'classic') {
            this.currentMode = window.famobi.localStorage.getItem("difficultyMode");
        }
        
        console.log('[Enhanced Difficulty] Loaded settings:', {
            mode: this.currentMode,
            classic: projectInfo.aiRating,
            practice: projectInfo.practiceLevel, 
            aiBrain: projectInfo.aiBrainLevel
        });
    },
    
    // Save current mode
    saveMode: function(mode) {
        this.currentMode = mode;
        try { 
            window.famobi.localStorage.setItem("difficultyMode", mode);
            console.log('[Enhanced Difficulty] Saved mode:', mode);
        } catch(e) {}
    },
    
    // Get current difficulty level based on active mode
    getCurrentLevel: function() {
        switch(this.currentMode) {
            case 'practice': return projectInfo.practiceLevel;
            case 'aiBrain': return projectInfo.aiBrainLevel;
            case 'classic':
            default: return projectInfo.aiRating;
        }
    },
    
    // Get max level for current mode
    getMaxLevel: function() {
        switch(this.currentMode) {
            case 'practice': return 100;
            case 'aiBrain': return 110;
            case 'classic':
            default: return 5;
        }
    },
    
    // Get min level for current mode
    getMinLevel: function() {
        return 1;
    },
    
    // Increase difficulty level
    increaseLevel: function() {
        const currentLevel = this.getCurrentLevel();
        const maxLevel = this.getMaxLevel();
        
        if (currentLevel < maxLevel) {
            const newLevel = currentLevel + 1;
            this.setLevel(newLevel);
            return true;
        }
        return false;
    },
    
    // Decrease difficulty level  
    decreaseLevel: function() {
        const currentLevel = this.getCurrentLevel();
        const minLevel = this.getMinLevel();
        
        if (currentLevel > minLevel) {
            const newLevel = currentLevel - 1;
            this.setLevel(newLevel);
            return true;
        }
        return false;
    },
    
    // Set level for current mode
    setLevel: function(level) {
        const maxLevel = this.getMaxLevel();
        const minLevel = this.getMinLevel();
        
        // Clamp level to valid range
        level = Math.max(minLevel, Math.min(maxLevel, level));
        
        switch(this.currentMode) {
            case 'practice':
                projectInfo.practiceLevel = level;
                try { window.famobi.localStorage.setItem("practiceLevel", level); } catch(e) {}
                break;
                
            case 'aiBrain':
                projectInfo.aiBrainLevel = level;
                try { window.famobi.localStorage.setItem("aiBrainLevel", level); } catch(e) {}
                break;
                
            case 'classic':
            default:
                projectInfo.aiRating = level;
                try { window.famobi.localStorage.setItem("aiRating", level); } catch(e) {}
                break;
        }
        
        console.log(`[Enhanced Difficulty] Set ${this.currentMode} level to ${level}`);
    },
    
    // Calculate AI skill multiplier based on current settings
    getAISkillMultiplier: function() {
        const level = this.getCurrentLevel();
        
        switch(this.currentMode) {
            case 'practice':
                // Practice mode: Linear scaling from 0.1 to 2.0
                return 0.1 + (level - 1) * (1.9 / 99);
                
            case 'aiBrain':
                // AI Brain mode: Exponential scaling for advanced difficulty
                return Math.pow(level / 110, 1.5) * 3.0;
                
            case 'classic':
            default:
                // Classic mode: Original 1-5 system
                return level / 5;
        }
    },
    
    // Calculate AI accuracy based on current settings
    getAIAccuracy: function() {
        const level = this.getCurrentLevel();
        
        switch(this.currentMode) {
            case 'practice':
                // Practice: 10% to 95% accuracy
                return 0.1 + (level - 1) * (0.85 / 99);
                
            case 'aiBrain':
                // AI Brain: 20% to 99.9% accuracy (near perfect at max)
                return 0.2 + (level - 1) * (0.799 / 109);
                
            case 'classic':
            default:
                // Classic: 20% to 80% accuracy
                return 0.2 + (level - 1) * (0.6 / 4);
        }
    },
    
    // Get AI shot calculation time (ms)
    getAIThinkTime: function() {
        const level = this.getCurrentLevel();
        
        switch(this.currentMode) {
            case 'practice':
                // Practice: 3000ms to 500ms (faster at higher levels)
                return 3000 - (level - 1) * (2500 / 99);
                
            case 'aiBrain':
                // AI Brain: 5000ms to 200ms (much more calculation at higher levels)
                return 5000 - (level - 1) * (4800 / 109);
                
            case 'classic':
            default:
                // Classic: 2000ms to 1000ms
                return 2000 - (level - 1) * (1000 / 4);
        }
    },
    
    // Get number of shot attempts AI will try
    getAITrialShots: function() {
        const level = this.getCurrentLevel();
        
        switch(this.currentMode) {
            case 'practice':
                // Practice: 5 to 50 trial shots
                return 5 + Math.floor((level - 1) * (45 / 99));
                
            case 'aiBrain':
                // AI Brain: 10 to 200 trial shots (extensive calculation)
                return 10 + Math.floor((level - 1) * (190 / 109));
                
            case 'classic':
            default:
                // Classic: 3 to 15 trial shots
                return 3 + Math.floor((level - 1) * (12 / 4));
        }
    },
    
    // Get display name for current mode
    getModeName: function() {
        switch(this.currentMode) {
            case 'practice': return 'Practice';
            case 'aiBrain': return 'AI Brain';
            case 'classic':
            default: return 'Classic';
        }
    },
    
    // Get formatted level display
    getLevelDisplay: function() {
        const level = this.getCurrentLevel();
        const maxLevel = this.getMaxLevel();
        return `${level}/${maxLevel}`;
    },
    
    // Setup mode switching handlers
    setupModeHandlers: function() {
        // Add keyboard shortcuts for quick mode switching in debug builds
        if (window.location.search.includes('debug=1')) {
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey) {
                    switch(e.key) {
                        case '1':
                            this.switchMode('classic');
                            e.preventDefault();
                            break;
                        case '2':
                            this.switchMode('practice');
                            e.preventDefault();
                            break;
                        case '3':
                            this.switchMode('aiBrain');
                            e.preventDefault();
                            break;
                    }
                }
            });
            
            console.log('[Enhanced Difficulty] Debug shortcuts enabled: Ctrl+1/2/3 to switch modes');
        }
    },
    
    // Switch difficulty mode
    switchMode: function(mode) {
        if (['classic', 'practice', 'aiBrain'].includes(mode)) {
            const oldMode = this.currentMode;
            this.currentMode = mode;
            this.saveMode(mode);
            
            console.log(`[Enhanced Difficulty] Switched from ${oldMode} to ${mode}`);
            
            // Update UI if available
            this.updateUI();
            
            return true;
        }
        return false;
    },
    
    // Update UI elements (to be called when available)
    updateUI: function() {
        // This will be called to update menu UI elements
        if (window.menuState && window.menuState.menuInfo) {
            const menuInfo = window.menuState.menuInfo;
            
            // Update mode button text if it exists
            if (menuInfo.modeButton && menuInfo.modeButton.text) {
                menuInfo.modeButton.text = this.getModeName();
            }
            
            // Update level display if it exists  
            if (menuInfo.ratingText) {
                menuInfo.ratingText.text = this.getLevelDisplay();
            }
        }
    },
    
    // Auto-advance practice level on win
    advancePracticeLevel: function() {
        if (this.currentMode === 'practice') {
            if (this.increaseLevel()) {
                console.log(`[Enhanced Difficulty] Advanced to practice level ${this.getCurrentLevel()}`);
                return true;
            }
        }
        return false;
    }
};

// Initialize when available
if (typeof window !== 'undefined') {
    // Initialize immediately if projectInfo exists, otherwise wait
    if (window.projectInfo) {
        window.enhancedDifficulty.init();
    } else {
        // Wait for projectInfo to be available
        const checkInit = () => {
            if (window.projectInfo) {
                window.enhancedDifficulty.init();
            } else {
                setTimeout(checkInit, 100);
            }
        };
        setTimeout(checkInit, 100);
    }
}

// Export for console debugging
window.DIFFICULTY_DEBUG = {
    getCurrentSettings: () => ({
        mode: window.enhancedDifficulty.currentMode,
        level: window.enhancedDifficulty.getCurrentLevel(),
        maxLevel: window.enhancedDifficulty.getMaxLevel(),
        display: window.enhancedDifficulty.getLevelDisplay(),
        skillMultiplier: window.enhancedDifficulty.getAISkillMultiplier(),
        accuracy: window.enhancedDifficulty.getAIAccuracy(),
        thinkTime: window.enhancedDifficulty.getAIThinkTime(),
        trialShots: window.enhancedDifficulty.getAITrialShots()
    }),
    
    switchMode: (mode) => window.enhancedDifficulty.switchMode(mode),
    setLevel: (level) => window.enhancedDifficulty.setLevel(level),
    increase: () => window.enhancedDifficulty.increaseLevel(),
    decrease: () => window.enhancedDifficulty.decreaseLevel()
};