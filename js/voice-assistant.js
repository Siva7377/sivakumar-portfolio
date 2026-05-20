/**
 * Vamshi Voice Assistant
 * Wake word detection, speech recognition, and animated UI
 */

class VamshiVoiceAssistant {
  constructor() {
    this.isListening = false;
    this.isActive = false;
    this.isProcessing = false;
    this.shouldKeepListening = false;
    this.isMobileVoice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.conversationHistory = [];
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.apiUrl = 'https://vamshi-chat-api.onrender.com/api/v1'; // Update with your deployed API URL
    
    // Wake words
    this.wakeWords = ['hey vamshi', 'hi vamshi', 'hello vamshi'];
    
    this.init();
  }

  init() {
    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('Speech recognition not supported');
      return;
    }

    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = !this.isMobileVoice;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.setupRecognition();
    this.createUI();
  }

  setupRecognition() {
    this.recognition.onstart = () => {
      console.log('Voice recognition started');
      this.isListening = true;
      this.updateUI();
    };

    this.recognition.onresult = (event) => {
      if (this.isProcessing) return;

      const result = event.results[event.results.length - 1];
      const transcript = Array.from(result)
        .map(item => item.transcript)
        .join(' ')
        .toLowerCase()
        .trim();

      console.log('Heard:', transcript);
      if (transcript) {
        this.updateTranscript(`You said: "${transcript}"`);
      }

      // Check for wake word
      if (!this.isActive) {
        const hasWakeWord = this.wakeWords.some(word => transcript.includes(word));
        if (hasWakeWord) {
          this.activate();
        }
      } else {
        // Active - process command
        if (result.isFinal) {
          this.processCommand(transcript);
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.isListening = false;
      this.shouldKeepListening = false;
      this.updateUI();
      this.showBetaMessage('Voice assistant is in beta. I could not hear clearly. Tap the mic and speak after the prompt.');
      if (event.error === 'no-speech') {
        // Desktop can recover from no-speech; mobile works better as one tap per question.
        if (!this.isMobileVoice && this.shouldKeepListening) {
          try {
            this.recognition.start();
          } catch (e) {
            console.log('Recognition restart delayed');
          }
        }
      }
    };

    this.recognition.onend = () => {
      console.log('Voice recognition ended');
      this.isListening = false;
      this.updateUI();

      // Auto-restart only on desktop. Mobile browsers frequently break continuous mode.
      if (!this.isMobileVoice && this.shouldKeepListening && !this.isProcessing) {
        setTimeout(() => {
          try {
            this.recognition.start();
          } catch (e) {
            console.log('Recognition restart delayed');
          }
        }, 300);
      }
    };
  }

  activate() {
    console.log('Voice assistant activated!');
    this.isActive = true;
    this.updateUI();
    this.showAssistantUI();
    this.updateStatus('Listening...');
    this.updateTranscript('Ask anything about Vamshi.');
  }

  deactivate() {
    this.isActive = false;
    this.conversationHistory = [];
    this.updateUI();
    this.hideAssistantUI();
    this.stopSpeaking();
  }

  async sendToBackend(message) {
    try {
      this.isProcessing = true;
      this.pauseRecognitionForResponse();
      this.showThinking();
      this.updateTranscript(`You asked: "${message}"`);
      
      const response = await fetch(`${this.apiUrl}/voice/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          conversation_history: this.conversationHistory,
        }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      const reply = data.reply || "I received an empty response. Please try asking again.";
      
      // Add to history
      this.conversationHistory.push({ role: 'user', content: message });
      this.conversationHistory.push({ role: 'assistant', content: reply });
      this.updateTranscript(reply);
      
      // Speak response
      await this.speak(reply);
      this.showReadyForNextQuestion();
      
      return reply;
    } catch (error) {
      console.error('Backend error:', error);
      this.hideThinking();
      const betaMessage = "Voice assistant is in beta. The chat API is working, but voice response had a temporary issue. Please try again or use Ask AI.";
      this.showBetaMessage(betaMessage);
      await this.speak(betaMessage);
    } finally {
      this.isProcessing = false;
    }
  }

  async processCommand(command) {
    if (!command || this.isProcessing) return;

    // Check for exit commands
    const exitCommands = ['stop', 'exit', 'close', 'bye', 'goodbye', 'thank you'];
    if (exitCommands.some(cmd => command.includes(cmd))) {
      this.shouldKeepListening = false;
      this.speak("Goodbye! Tap the mic anytime to talk again.");
      setTimeout(() => this.deactivate(), 2000);
      return;
    }

    // Send to backend
    await this.sendToBackend(command);
  }

  speak(text) {
    // Cancel any ongoing speech
    this.synthesis.cancel();

    return new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      // Try to use a good English voice
      const voices = this.synthesis.getVoices();
      const preferredVoice = voices.find(voice => 
        voice.lang.startsWith('en') && (voice.name.includes('Google') || voice.name.includes('Natural'))
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      this.synthesis.speak(utterance);
      this.showSpeaking();
      
      utterance.onend = () => {
        this.hideSpeaking();
        resolve();
      };
      utterance.onerror = () => {
        this.hideSpeaking();
        resolve();
      };
    });
  }

  stopSpeaking() {
    this.synthesis.cancel();
    this.hideSpeaking();
  }

  startListening() {
    if (!this.isListening) {
      try {
        this.isActive = true;
        this.shouldKeepListening = !this.isMobileVoice;
        this.showAssistantUI();
        this.updateStatus(this.isMobileVoice ? 'Listening...' : 'Voice beta: listening...');
        this.updateTranscript('Speak now. Ask your question about Vamshi.');
        this.updateUI();
        this.recognition.start();
      } catch (e) {
        console.log('Recognition already started');
        this.showBetaMessage('Voice assistant is in beta. If the mic does not start, allow microphone access and try again.');
      }
    }
  }

  stopListening() {
    this.isListening = false;
    this.shouldKeepListening = false;
    this.recognition.stop();
    this.deactivate();
  }

  pauseRecognitionForResponse() {
    this.shouldKeepListening = false;
    if (this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        console.log('Recognition already stopped');
      }
    }
  }

  createUI() {
    // Create voice assistant container
    const container = document.createElement('div');
    container.id = 'voice-assistant-container';
    container.innerHTML = `
      <style>
        #voice-assistant-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 10000;
        }

        #voice-toggle-btn {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0f766e, #2563eb);
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(15, 118, 110, 0.4);
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        #voice-toggle-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 30px rgba(15, 118, 110, 0.6);
        }

        #voice-toggle-btn.active {
          background: linear-gradient(135deg, #dc2626, #f59e0b);
        }

        #voice-toggle-btn.listening::before {
          content: '';
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.3); opacity: 0; }
        }

        #voice-toggle-btn svg {
          width: 28px;
          height: 28px;
          fill: white;
          z-index: 1;
        }

        #voice-assistant-ui {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) scale(0);
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          z-index: 9999;
          width: 90%;
          max-width: 500px;
          transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
          opacity: 0;
        }

        #voice-assistant-ui.active {
          transform: translate(-50%, -50%) scale(1);
          opacity: 1;
        }

        #voice-visualizer {
          width: 200px;
          height: 200px;
          margin: 0 auto 30px;
          position: relative;
        }

        .voice-circle {
          position: absolute;
          border-radius: 50%;
          border: 3px solid;
          animation: voiceRipple 2s ease-in-out infinite;
        }

        .voice-circle:nth-child(1) {
          width: 80px;
          height: 80px;
          top: 60px;
          left: 60px;
          border-color: #0f766e;
          animation-delay: 0s;
        }

        .voice-circle:nth-child(2) {
          width: 120px;
          height: 120px;
          top: 40px;
          left: 40px;
          border-color: #2563eb;
          animation-delay: 0.3s;
        }

        .voice-circle:nth-child(3) {
          width: 160px;
          height: 160px;
          top: 20px;
          left: 20px;
          border-color: #f59e0b;
          animation-delay: 0.6s;
        }

        @keyframes voiceRipple {
          0% {
            transform: scale(0.8);
            opacity: 1;
          }
          50% {
            transform: scale(1);
            opacity: 0.6;
          }
          100% {
            transform: scale(0.8);
            opacity: 1;
          }
        }

        .voice-center-icon {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #0f766e, #2563eb);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 30px rgba(15, 118, 110, 0.5);
        }

        .voice-center-icon svg {
          width: 32px;
          height: 32px;
          fill: white;
        }

        #voice-status {
          text-align: center;
          color: white;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 10px;
        }

        #voice-transcript {
          text-align: center;
          color: rgba(255, 255, 255, 0.7);
          font-size: 14px;
          min-height: 56px;
          line-height: 1.6;
          max-height: 180px;
          overflow-y: auto;
        }

        #voice-close-btn {
          position: absolute;
          top: 15px;
          right: 15px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        #voice-close-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: rotate(90deg);
        }

        #voice-close-btn svg {
          width: 20px;
          height: 20px;
          stroke: white;
          stroke-width: 2;
        }

        @media (max-width: 768px) {
          #voice-toggle-btn {
            width: 54px;
            height: 54px;
          }

          #voice-assistant-ui {
            width: 95%;
            padding: 30px 20px;
          }
          
          #voice-visualizer {
            width: 150px;
            height: 150px;
          }
          
          .voice-circle:nth-child(1) { width: 60px; height: 60px; top: 45px; left: 45px; }
          .voice-circle:nth-child(2) { width: 90px; height: 90px; top: 30px; left: 30px; }
          .voice-circle:nth-child(3) { width: 120px; height: 120px; top: 15px; left: 15px; }
        }
      </style>

      <button id="voice-toggle-btn" title="Activate Voice Assistant">
        <svg viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
      </button>

      <div id="voice-assistant-ui">
        <button id="voice-close-btn">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        
        <div id="voice-visualizer">
          <div class="voice-circle"></div>
          <div class="voice-circle"></div>
          <div class="voice-circle"></div>
          <div class="voice-center-icon">
            <svg viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </div>
        </div>

        <div id="voice-status">Say "Hey Vamshi" to start</div>
        <div id="voice-transcript"></div>
      </div>
    `;

    document.body.appendChild(container);

    // Attach event listeners
    document.getElementById('voice-toggle-btn').addEventListener('click', () => {
      if (this.isListening) {
        this.stopListening();
      } else {
        this.startListening();
      }
    });

    document.getElementById('voice-close-btn').addEventListener('click', () => {
      this.stopListening();
    });
  }

  updateUI() {
    const btn = document.getElementById('voice-toggle-btn');
    if (this.isListening) {
      btn.classList.add('listening');
    } else {
      btn.classList.remove('listening');
    }

    if (this.isActive) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  showAssistantUI() {
    const ui = document.getElementById('voice-assistant-ui');
    ui.classList.add('active');
    this.updateStatus('Listening...');
  }

  hideAssistantUI() {
    const ui = document.getElementById('voice-assistant-ui');
    ui.classList.remove('active');
  }

  updateStatus(text) {
    document.getElementById('voice-status').textContent = text;
  }

  updateTranscript(text) {
    document.getElementById('voice-transcript').textContent = text;
  }

  showBetaMessage(text) {
    this.showAssistantUI();
    this.updateStatus('Voice beta');
    this.updateTranscript(text);
  }

  showThinking() {
    this.updateStatus('Thinking...');
    this.updateTranscript('');
  }

  hideThinking() {
    this.updateStatus('Listening...');
  }

  showSpeaking() {
    this.updateStatus('Speaking...');
  }

  hideSpeaking() {
    this.updateStatus('Listening...');
  }

  showReadyForNextQuestion() {
    if (this.isMobileVoice) {
      this.isActive = false;
      this.isListening = false;
      this.updateStatus('Tap mic to ask again');
      this.updateUI();
    } else {
      this.shouldKeepListening = true;
      this.updateStatus('Listening...');
      try {
        this.recognition.start();
      } catch (e) {
        console.log('Recognition restart delayed');
      }
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.vamshiVoice = new VamshiVoiceAssistant();
  });
} else {
  window.vamshiVoice = new VamshiVoiceAssistant();
}
