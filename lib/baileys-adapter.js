// Simple Baileys adapter to provide a minimal interface used by the existing bot code
// This adapter implements only the parts that `bot.js` expects: client-like events and sendMessage

import * as Baileys from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import { safeRmSync } from '../utils/fileOperations.js';
import qrcode from 'qrcode-terminal';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import pn from 'awesome-phonenumber';

// Extract all needed functions from Baileys package
const makeWASocket = Baileys.default || Baileys.makeWASocket || Baileys;
const useMultiFileAuthState = Baileys.useMultiFileAuthState;
const DisconnectReason = Baileys.DisconnectReason;
const fetchLatestBaileysVersion = Baileys.fetchLatestBaileysVersion;
const Browsers = Baileys.Browsers;

class BaileysAdapter {
  constructor() {
    this.client = null;
    this.eventHandlers = {};
    this.phoneNumber = null;
    this.usingOTP = false;
    // QR / Pairing support (interactive when no session is registered)
    this.pairingMode = 'prompt'; // 'prompt' | 'pair' | 'qr'
    this.lastQr = null;
    this.loadPhoneConfig();
  }

  loadPhoneConfig() {
    try {
      const phoneConfig = JSON.parse(fs.readFileSync('./config/phone.json', 'utf-8'));
      this.phoneNumber = phoneConfig.phoneNumber;
      this.usingOTP = phoneConfig.usingOTP || false;
      console.log(`📱 Phone number configured: ${this.phoneNumber}`);
      if (this.usingOTP) {
        console.log('🔐 OTP authentication enabled');
      }
    } catch (e) {
      console.log('⚠️ No phone config found, will use QR code authentication');
    }
  }

  on(event, handler) {
    this.eventHandlers[event] = this.eventHandlers[event] || [];
    this.eventHandlers[event].push(handler);
  }

  emit(event, ...args) {
    const handlers = this.eventHandlers[event] || [];
    handlers.forEach(h => {
      try { h(...args); } catch (e) { console.error('Event handler error', e); }
    });
  }

  async initialize() {
    console.log('Initializing Baileys connection (adapter)...');

    // Debug: Check what's available
    if (!useMultiFileAuthState) {
      console.error('❌ useMultiFileAuthState not found!');
      console.log('Available Baileys exports:', Object.keys(Baileys).slice(0, 20));
      throw new Error('useMultiFileAuthState is not available in Baileys package');
    }

    // Ensure auth directory exists
    const authDir = './auth_info_baileys';
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    // Use multi-file auth state (current Baileys API)
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // Fetch latest version
    let version;
    try {
      const versionInfo = await fetchLatestBaileysVersion();
      version = versionInfo.version;
    } catch (e) {
      console.log('⚠️ Could not fetch latest version, using default');
      version = [2, 2413, 1];
    }

    // Configure browser with phone number if available
    let browserConfig = Browsers.windows('Chrome');
    if (this.phoneNumber) {
      browserConfig = [
        'MazariBot',
        'Chrome',
        '0.0.1'
      ];
    }

    // Generate a unique client ID based on phone number if provided
    const clientId = this.phoneNumber ? `mazari-${this.phoneNumber.replace(/\D/g, '')}` : 'mazari-bot';

    // Silent logger to suppress Baileys internal debug JSON
    const logger = pino({ level: process.env.BOT_VERBOSE === 'true' ? 'info' : 'silent' });

    // Store state reference for later use (e.g., getting bot's phone number)
    this.authState = state;

    this.client = makeWASocket({
      auth: state,
      printQRInTerminal: false, // We'll handle QR display ourselves
      version,
      browser: browserConfig,
      logger,
      // Keep in low-resource mode
      getMessage: async () => { return null; },
      // Add phone number display
      markOnlineOnConnect: false,
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      generateHighQualityLinkPreview: true
    });

    // Set up connection handler IMMEDIATELY to capture QR codes (but don't display until user chooses)
    let rlInterface = null; // Store readline interface reference
    let connectionOpened = false; // Track if connection has opened
    let reconnectAttempts = 0; // Track reconnection attempts
    const MAX_RECONNECT_ATTEMPTS = 2; // Reduced to fail faster on persistent issues

    this.client.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Store QR code but only display if user chose QR mode
      if (qr) {
        this.lastQr = qr;
        // Only display QR if user explicitly chose QR mode (not in 'prompt' mode)
        if (this.pairingMode === 'qr') {
          console.log(chalk.yellow('Scan the QR with WhatsApp'));
          qrcode.generate(qr, { small: true });
        }
        // Don't emit QR event if user hasn't chosen a mode yet (still in 'prompt' mode)
        if (this.pairingMode !== 'prompt') {
          this.emit('qr', qr);
        }
      }

      // Handle OTP if phone number is configured
      if (connection === 'close' && lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut && this.phoneNumber) {
        console.log('📱 Session expired. Will attempt reconnection...');
      }

      if (connection === 'open') {
        connectionOpened = true;
        reconnectAttempts = 0; // Reset counter on successful connection

        // Check if session is fully registered
        const isRegistered = state.creds?.registered === true;

        if (isRegistered) {
          console.log(chalk.green('✅ Baileys connection opened and registered!'));
          if (this.phoneNumber) {
            console.log(chalk.cyan(`📱 Connected as: ${this.phoneNumber}`));
          }

          // Close readline interface if it's still open (prevents blocking)
          if (rlInterface) {
            try {
              rlInterface.close();
              console.log(chalk.gray('🔒 Pairing prompt closed (connection established)'));
            } catch (e) {
              // Ignore errors when closing
            }
          }

          this.emit('ready');
        } else {
          console.log(chalk.yellow('⚠️ Connection opened but not fully registered yet...'));
          console.log(chalk.gray('   Waiting for registration to complete...'));

          // Wait a bit for registration to complete
          setTimeout(() => {
            if (state.creds?.registered === true) {
              console.log(chalk.green('✅ Registration completed successfully!'));
              this.emit('ready');
            } else {
              console.log(chalk.red('❌ Registration did not complete.'));
              console.log(chalk.yellow('💡 If WhatsApp is stuck on "Logging in...", try:'));
              console.log(chalk.white('   1. Close WhatsApp and reopen it'));
              console.log(chalk.white('   2. Or run: npm run clean && npm start'));
            }
          }, 5000);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || 'Unknown error';

        console.log('🔴 Connection closed:', {
          statusCode,
          errorMessage,
          reason: lastDisconnect?.error?.output?.payload?.message || 'No reason provided'
        });

        // Log all disconnect reasons for debugging
        console.log('Available DisconnectReasons:', {
          loggedOut: DisconnectReason.loggedOut,
          conflict: 440,
          current: statusCode
        });

        // Handle specific error codes
        if (statusCode === 440) {
          // Conflict error - another session is active
          console.log(chalk.red('\n╔════════════════════════════════════════════════════════╗'));
          console.log(chalk.red('║  ⚠️  SESSION CONFLICT DETECTED                        ║'));
          console.log(chalk.red('╚════════════════════════════════════════════════════════╝\n'));
          console.log(chalk.yellow('🔍 This error means another WhatsApp session is active:'));
          console.log(chalk.white('   1. WhatsApp Web is open in a browser'));
          console.log(chalk.white('   2. Another bot instance is running'));
          console.log(chalk.white('   3. The session is being used on another device\n'));
          console.log(chalk.cyan('💡 SOLUTIONS:\n'));
          console.log(chalk.white('   Option 1: Close all other WhatsApp sessions'));
          console.log(chalk.gray('   • Close WhatsApp Web in all browsers'));
          console.log(chalk.gray('   • Stop any other bot instances'));
          console.log(chalk.gray('   • Then restart this bot\n'));
          console.log(chalk.white('   Option 2: Delete session and re-pair (RECOMMENDED)'));
          console.log(chalk.gray('   • Run: Remove-Item -Path ".\\auth_info_baileys" -Recurse -Force'));
          console.log(chalk.gray('   • Then run: npm start'));
          console.log(chalk.gray('   • Scan QR code or use pair code again\n'));

          // Clean up session automatically after conflict
          console.log(chalk.yellow('🔄 Auto-cleaning corrupted session in 5 seconds...'));
          console.log(chalk.yellow('   Press Ctrl+C to cancel\n'));

          setTimeout(async () => {
            try {
              console.log(chalk.blue('🧹 Removing corrupted session...'));
              safeRmSync(authDir, { recursive: true, force: true });
              console.log(chalk.green('✅ Session cleaned! Please restart the bot with: npm start\n'));
              process.exit(0);
            } catch (e) {
              console.log(chalk.red('❌ Failed to clean session automatically.'));
              console.log(chalk.yellow('Please manually delete the auth_info_baileys folder.\n'));
              process.exit(1);
            }
          }, 5000);

          this.emit('disconnected', 'conflict');
          return;
        }

        // Handle stream errors (515) - usually temporary
        if (statusCode === 515) {
          console.log(chalk.yellow('⚠️ Stream error detected. This is usually temporary.'));
          console.log(chalk.gray('   The bot will attempt to reconnect...\n'));
        }

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          reconnectAttempts++;

          if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            console.log(chalk.red(`❌ Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached.`));
            console.log(chalk.yellow('Please check your internet connection and try restarting the bot.'));
            console.log(chalk.yellow('If the problem persists, delete the session folder:\n'));
            console.log(chalk.gray('   Remove-Item -Path ".\\auth_info_baileys" -Recurse -Force\n'));
            this.emit('disconnected', 'max_retries');
            return;
          }

          console.log(`🔁 Connection lost. Reconnecting in 4 seconds... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          console.log('   Reason: Non-logout disconnect, attempting recovery');
          setTimeout(() => this.initialize(), 4000);
        } else {
          console.log('❌ Logged out. Please re-pair using npm start.');
          this.emit('disconnected', lastDisconnect || 'logged out');
        }
      }
    });

    // Handle pairing when not registered (after connection handler is set up to capture QR codes)
    // Check if we have a valid existing session
    const hasValidSession = state.creds?.registered === true;

    if (hasValidSession) {
      console.log(chalk.green('✅ Found existing session. Connecting automatically...'));
      console.log(chalk.gray('   Session will be validated on connection.'));
    } else {
      console.log(chalk.yellow('⚠️ No valid session found. Waiting for connection or pairing...'));

      // Wait a bit to see if connection opens automatically (reconnection scenario)
      await new Promise(r => setTimeout(r, 3000));

      // If connection opened during the wait, skip the pairing prompt
      if (connectionOpened) {
        console.log(chalk.green('✅ Connection established automatically. Skipping pairing prompt.'));
      } else {
        // Connection didn't open, show pairing prompt
        try {
          rlInterface = readline.createInterface({ input, output });
          console.log(chalk.green('\n╔════════════════════════════════════════╗'));
          console.log(chalk.green('║   🤖 MazariBot WhatsApp Connection    ║'));
          console.log(chalk.green('╚════════════════════════════════════════╝\n'));
          console.log(chalk.cyan('Select your preferred login method:\n'));
          console.log(chalk.white('  1️⃣  Pair Code') + chalk.gray(' - Enter your phone number'));
          console.log(chalk.gray('      • Receive a pairing code in this terminal'));
          console.log(chalk.gray('      • Enter the code on WhatsApp to connect\n'));
          console.log(chalk.white('  2️⃣  QR Code') + chalk.gray(' - Scan with WhatsApp'));
          console.log(chalk.gray('      • Scan QR code from your phone'));
          console.log(chalk.gray('      • Traditional connection method\n'));
          const choice = (await rlInterface.question(chalk.yellow('Enter your choice (1 or 2): '))).trim();

          if (choice === '1') {
            // Pair Code Method
            this.pairingMode = 'pair';
            console.log(chalk.green('\n✅ Pair Code method selected\n'));
            console.log(chalk.cyan('📱 Enter your WhatsApp phone number:'));
            console.log(chalk.gray('   Format: +[country code][number]'));
            console.log(chalk.gray('   Example: +923001234567\n'));
            let phoneNumber = (await rlInterface.question(chalk.yellow('Phone number: '))).trim();
            rlInterface.close();

            // Validate and normalize using awesome-phonenumber
            const cleaned = phoneNumber.replace(/[^0-9+]/g, '');
            const parsed = pn(cleaned.startsWith('+') ? cleaned : ('+' + cleaned));

            // awesome-phonenumber v7 uses 'valid' property
            if (!parsed || !parsed.valid) {
              console.error(chalk.red('⚠️ Invalid phone number. Please include country code, e.g., +923001234567'));
              return;
            }

            // awesome-phonenumber v7 uses 'number.e164' property
            const e164 = parsed.number?.e164; // +XXXXXXXXXXX
            if (!e164) {
              console.error(chalk.red('⚠️ Could not parse phone number'));
              return;
            }
            const normalized = e164.replace('+', '');

            console.log(chalk.blue(`📱 Requesting pairing code for: ${e164}`));

            try {
              // Wait for socket to be fully ready before requesting pairing code
              console.log(chalk.blue('⏳ Initializing connection...'));

              // Wait longer for connection to establish (5 seconds instead of 1.5)
              await new Promise(r => setTimeout(r, 5000));

              // Verify connection state before requesting code
              if (!this.client || !this.client.ws || this.client.ws.readyState !== 1) {
                console.log(chalk.yellow('⚠️ Connection not ready yet, waiting additional time...'));
                await new Promise(r => setTimeout(r, 3000));
              }

              console.log(chalk.blue('🔐 Requesting pairing code from WhatsApp...'));
              console.log(chalk.gray(`   Phone number: ${e164}`));
              console.log(chalk.gray(`   Normalized: ${normalized}`));

              let code = await this.client.requestPairingCode(normalized);

              if (!code) {
                throw new Error('No pairing code received from WhatsApp');
              }

              // Pretty print in XXXX-XXXX format
              const pretty = (code || '').match(/.{1,4}/g)?.join('-') || code;

              // Display pairing code with beautiful formatting
              console.log(chalk.green('\n✅ Pairing code received successfully!'));
              console.log(chalk.white('\n╔════════════════════════════════════════╗'));
              console.log(chalk.white('║') + chalk.bold.yellow(`     PAIRING CODE: ${pretty.padEnd(13)}`) + chalk.white('║'));
              console.log(chalk.white('╚════════════════════════════════════════╝\n'));

              console.log(chalk.cyan('📱 How to connect on WhatsApp:'));
              console.log(chalk.white('   1. Open WhatsApp on your phone'));
              console.log(chalk.white('   2. Go to Settings → Linked Devices'));
              console.log(chalk.white('   3. Tap "Link a Device"'));
              console.log(chalk.white('   4. Tap "Link with phone number instead"'));
              console.log(chalk.white(`   5. Enter the code: ${chalk.bold.yellow(pretty)}`));
              console.log(chalk.gray(`\n   Phone number: ${e164}`));
              console.log(chalk.red('   ⏱️  Code expires in 3-5 minutes\n'));
            } catch (e) {
              console.error(chalk.red('⚠️ Pairing error:'), e?.message || e);

              // Check if it's a connection error
              if (e?.message?.includes('Connection') || e?.message?.includes('closed')) {
                console.error(chalk.yellow('\n💡 Connection Tips:'));
                console.error(chalk.white('  1. Make sure you have a stable internet connection'));
                console.error(chalk.white('  2. Try restarting the bot: npm start'));
                console.error(chalk.white('  3. If problem persists, try QR code method instead'));
                console.error(chalk.white('  4. Check if WhatsApp servers are accessible\n'));
              } else {
                console.error(chalk.red('Please check:'));
                console.error(chalk.red('  1. Phone number is correct and has WhatsApp'));
                console.error(chalk.red('  2. You have less than 4 linked devices'));
                console.error(chalk.red('  3. Internet connection is stable'));
              }
            }
          } else {
            // QR Code Method
            this.pairingMode = 'qr';
            rlInterface.close();
            console.log(chalk.gray('\n✅ QR mode selected. Generating QR code...\n'));

            // Wait a bit for QR to be generated, then display if available
            await new Promise(r => setTimeout(r, 500));
            if (this.lastQr) {
              console.log(chalk.cyan('📱 Scan this QR code with WhatsApp:'));
              qrcode.generate(this.lastQr, { small: true });
              console.log(chalk.white('\n   1. Open WhatsApp on your phone'));
              console.log(chalk.white('   2. Go to Settings → Linked Devices'));
              console.log(chalk.white('   3. Tap "Link a Device"'));
              console.log(chalk.white('   4. Scan the QR code above\n'));
            } else {
              console.log(chalk.gray('⏳ Waiting for QR code generation...'));
            }
          }
        } catch (e) {
          console.error(chalk.red('⚠️ Input error:'), e?.message || e);
        }
      }
    }

    // Message event listeners - ALWAYS register these, regardless of registration status
    this.client.ev.on('messages.upsert', (m) => {
      // Log ALL message upserts for debugging
      console.log('🔔 Message upsert event:', {
        type: m.type,
        messageCount: m.messages?.length || 0
      });

      // Only process new messages (not old ones from sync)
      if (m.type !== 'notify') {
        console.log(`⏭️ Skipping message type: ${m.type} (only processing 'notify' type)`);
        return;
      }

      // Map message event to a similar object expected by bot
      m.messages.forEach(msg => {
        console.log('🔍 Processing message:', {
          hasMessage: !!msg.message,
          fromMe: msg.key?.fromMe,
          remoteJid: msg.key?.remoteJid,
          messageKeys: msg.message ? Object.keys(msg.message) : []
        });

        // Skip if not a proper message
        if (!msg.message) {
          console.log('⏭️ Skipping: No message content');
          return;
        }

        // NOTE: We DO NOT skip messages from ourselves (fromMe: true)
        // This allows the bot owner to send commands from their own WhatsApp
        // The bot will process commands from both the owner and other users

        // Basic wrapper
        const wrapped = this._wrapMessage(msg);

        console.log('📦 Wrapped message:', {
          body: wrapped.body,
          type: wrapped.type,
          from: wrapped.from,
          fromMe: wrapped.fromMe,
          hasBody: wrapped.body !== undefined && wrapped.body !== ''
        });

        // Only emit if message has a body or is a valid message type
        if (wrapped.body !== undefined) {
          console.log('📨 Emitting message event:', {
            from: wrapped.from,
            body: wrapped.body,
            type: wrapped.type,
            fromMe: wrapped.fromMe
          });
          this.emit('message', wrapped);
          this.emit('message_create', wrapped);
        } else {
          console.log('⏭️ Skipping: No body extracted from message');
        }
      });
    });

    // Save auth state on changes and detect registration
    let registrationEmitted = false;
    this.client.ev.on('creds.update', async () => {
      await saveCreds();

      // Check if registration just completed
      if (state.creds?.registered === true && !registrationEmitted && connectionOpened) {
        registrationEmitted = true;
        console.log(chalk.green('✅ Registration detected via credentials update!'));

        // Close readline interface if it's still open
        if (rlInterface) {
          try {
            rlInterface.close();
            console.log(chalk.gray('🔒 Pairing prompt closed'));
          } catch (e) {
            // Ignore errors when closing
          }
        }

        this.emit('ready');
      }
    });

    console.log('Baileys adapter initialized');
  }

  // Helper method to get profile picture
  async getProfilePictureUrl(jid) {
    try {
      const ppUrl = await this.client.profilePictureUrl(jid, 'image');
      return ppUrl;
    } catch (e) {
      console.log('❌ Error fetching profile picture:', e.message);
      return null;
    }
  }

  // Helper method to download media
  async downloadMediaMessage(msg) {
    try {
      const buffer = await Baileys.downloadMediaMessage(
        msg,
        'buffer',
        {},
        { logger: console }
      );
      return buffer;
    } catch (e) {
      console.error('Error downloading media:', e);
      return null;
    }
  }

  // Helper method to mark messages as read
  async readMessages(keys) {
    try {
      if (!this.client) {
        console.error('Cannot read messages: client not initialized');
        return false;
      }
      await this.client.readMessages(keys);
      return true;
    } catch (e) {
      console.error('Error marking messages as read:', e.message);
      return false;
    }
  }

  _wrapMessage(msg) {
    // Create a small wrapper providing getContact, getChat, body, from, fromMe, etc.
    const wrapper = Object.assign({}, msg);

    // Extract message body from various message types (Baileys v6 structure)
    const messageContent = msg.message;

    // Try to extract text from all possible message types
    wrapper.body =
      messageContent?.conversation ||
      messageContent?.extendedTextMessage?.text ||
      messageContent?.imageMessage?.caption ||
      messageContent?.videoMessage?.caption ||
      messageContent?.audioMessage?.caption ||
      messageContent?.documentMessage?.caption ||
      messageContent?.stickerMessage?.caption ||
      messageContent?.contactMessage?.displayName ||
      messageContent?.locationMessage?.caption ||
      messageContent?.liveLocationMessage?.caption ||
      messageContent?.buttonsResponseMessage?.selectedButtonId ||
      messageContent?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      '';

    // If body is still empty but message exists, set to empty string (for media-only messages)
    if (!wrapper.body && messageContent) {
      wrapper.body = '';
    }

    wrapper.from = msg.key?.remoteJid || 'unknown';
    wrapper.fromMe = !!msg.key?.fromMe;
    wrapper.author = msg.key?.participant || msg.key?.remoteJid;

    // Add message ID
    wrapper.id = {
      _serialized: `${msg.key.remoteJid}_${msg.key.id}`,
      id: msg.key.id,
      remote: msg.key.remoteJid
    };

    // Check if message is a reply to another message
    const contextInfo = messageContent?.extendedTextMessage?.contextInfo ||
      messageContent?.imageMessage?.contextInfo ||
      messageContent?.videoMessage?.contextInfo;
    const quotedKey = contextInfo?.quotedMessage || contextInfo?.stanzaId;
    wrapper.hasQuotedMsg = !!quotedKey;

    // Add download method to wrapper
    const selfAdapter = this; // Capture 'this' for the closure
    wrapper.download = async () => {
      try {
        return await selfAdapter.downloadMediaMessage(msg);
      } catch (e) {
        console.error('Error downloading message media:', e);
        return null;
      }
    };

    // Add getQuotedMessage method with download support
    wrapper.getQuotedMessage = async () => {
      if (!quotedKey) {
        return null; // Return null instead of throwing for easier checks
      }

      // Construct a minimal message object for the quoted message
      // This is necessary for downloadMediaMessage to work on quoted media
      const quotedContent = contextInfo.quotedMessage;
      const quotedMsgObj = {
        key: {
          remoteJid: contextInfo.remoteJid || wrapper.from,
          fromMe: contextInfo.participant === (selfAdapter.client.user?.id?.split(':')[0] + '@s.whatsapp.net'),
          id: quotedKey,
          participant: contextInfo.participant
        },
        message: quotedContent
      };

      const ctxInfo = contextInfo;

      return {
        ...quotedMsgObj, // Include raw properties
        from: ctxInfo?.participant || msg.key?.remoteJid,
        author: ctxInfo?.participant,
        body: quotedContent?.conversation ||
          quotedContent?.extendedTextMessage?.text ||
          quotedContent?.imageMessage?.caption ||
          quotedContent?.videoMessage?.caption || '',
        type: Object.keys(quotedContent || {})[0],

        getContact: async () => {
          const participant = ctxInfo?.participant || 'unknown';
          const jid = participant.split('@')[0] || 'unknown';
          return {
            name: jid,
            id: { _serialized: participant },
            number: participant,
            getProfilePicUrl: async () => {
              try {
                return await selfAdapter.getProfilePictureUrl(participant);
              } catch (e) {
                console.error('Error getting profile pic:', e);
                return null;
              }
            }
          };
        },

        // Add download method for quoted media
        download: async () => {
          try {
            return await selfAdapter.downloadMediaMessage(quotedMsgObj);
          } catch (e) {
            console.error('Error downloading quoted media:', e);
            return null;
          }
        },

        key: { remoteJid: ctxInfo?.participant || msg.key?.remoteJid }
      };
    };

    return wrapper;
  }

  async sendMessage(to, content, opts) {
    if (!this.client) throw new Error('Baileys client not initialized');
    return this.client.sendMessage(to, content, opts);
  }

  async destroy() {
    if (this.client) {
      try {
        // Add a small delay to allow ongoing operations to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.client.logout();
      } catch (error) {
        // Check if it's an EBUSY error from underlying library (whatsapp-web.js cleanup)
        const errorStr = error.message || error.toString() || '';
        const isEBUSY = error.code === 'EBUSY' ||
          errorStr.includes('EBUSY') ||
          errorStr.includes('resource busy') ||
          errorStr.includes('locked');

        // Silently handle EBUSY - the file operations utility will handle it properly
        if (!isEBUSY) {
          console.error('Error during Baileys logout:', error.message || error);
          throw error;
        }
        // EBUSY errors are handled silently - files will be cleaned up by the utility
      }
    }
  }
}

export default BaileysAdapter;