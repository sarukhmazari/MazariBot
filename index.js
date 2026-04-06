require('dotenv').config();
const { initSession, question } = require('./lib/baileys-helper');
const supabase = require('./lib/supabase');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

async function launch() {
  console.log(chalk.cyan(`🚀 Starting Mazari Bot Multi-Session System...`));
  console.log(chalk.gray(`🆔 [PROCESS] ID: ${process.pid}`));

  // Ensure directories exist
  const sessionDir = path.join(__dirname, 'session');
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  // Load configuration from settings.js if needed
  const settings = require('./settings');
  console.log(chalk.green(`✅ Bot Name: ${settings.botName}`));

  // 0. Ensure Data Directory and essential files exist
  const dataDir = path.join(__dirname, 'data');
  const bannedPath = path.join(dataDir, 'banned.json');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(chalk.gray('📁 [SYSTEM] Created data directory.'));
  }
  if (!fs.existsSync(bannedPath)) {
    fs.writeFileSync(bannedPath, JSON.stringify({}, null, 2));
    console.log(chalk.gray('📝 [SYSTEM] Initialized empty banned.json.'));
  }

  // 1. Health check: Try to connect and verify table existence
  console.log(chalk.yellow('📡 Checking database connectivity...'));
  const { error: healthError } = await supabase.from('bot_sessions').select('count', { count: 'exact', head: true });

  if (healthError) {
    console.log(chalk.red(`⚠️ DB Connection failed: ${healthError.message}`));
    console.log(chalk.yellow('🔄 Falling back to local session storage...'));

    // Fallback logic
    const localSessions = fs.readdirSync(sessionDir)
      .filter(name => fs.lstatSync(path.join(sessionDir, name)).isDirectory());

    console.log(chalk.blue(`📁 Loading ${localSessions.length} sessions from local storage...`));
    for (const phone of localSessions) {
      await initSession(phone);
    }
  } else {
    console.log(chalk.green('✅ Supabase connection successful.'));

    // 2. Fetch existing sessions from database
    const { data: dbSessions } = await supabase.from('bot_sessions').select('phone_number').eq('is_paired', true);

    // 3. Always ask for a phone number as requested
    console.log(chalk.blue('\n🌐 Starting Mazari Bot Interactive Flow...'));
    let primaryPhone = await question(chalk.bgBlack(chalk.cyan(`
‹⧼ © MAZARI BOT ⧽›
‹⧼ Version Official ⧽›
=========================================
 ❖ Script by MAZARI BOT
╭────────────────╼
╎ Please type your WhatsApp number 92xxx
╎ Format: 923xxxxxxxx (without + or spaces) : 
╰────────────────╼ `)));

    if (primaryPhone) {
      primaryPhone = primaryPhone.replace(/[^0-9]/g, '');
      console.log(chalk.yellow(`\n🔄 Initializing new session for ${primaryPhone}...`));
      await initSession(primaryPhone, { usePairingCode: true });
    } else {
      console.log(chalk.yellow('\nℹ️ No number entered. Resuming existing sessions...'));
    }

    // 4. Then initialize all other existing sessions
    const pairedSessions = dbSessions || [];
    if (pairedSessions.length > 0) {
      console.log(chalk.blue(`📡 Resuming ${pairedSessions.length} active sessions from database...`));
      for (const session of pairedSessions) {
        // Don't re-initialize if we just did it above
        if (session.phone_number !== primaryPhone) {
          await initSession(session.phone_number);
        }
      }
    } else if (!primaryPhone) {
      // Fallback to local if DB is empty and no new number provided
      const localSessions = fs.readdirSync(sessionDir).filter(name => fs.lstatSync(path.join(sessionDir, name)).isDirectory());
      if (localSessions.length > 0) {
        console.log(chalk.blue(`📁 Resuming ${localSessions.length} sessions from local storage...`));
        for (const phone of localSessions) {
          await initSession(phone);
        }
      } else {
        console.log(chalk.red('❌ No active sessions found.'));
      }
    }
  }

  process.on('uncaughtException', (err) => console.error('💥 Uncaught Exception:', err));
  process.on('unhandledRejection', (reason) => console.error('💥 Unhandled Rejection:', reason));

  console.log(chalk.cyan('✨ Mazari Bot is online and waiting for commands.'));
}

launch().catch(err => {
  console.error('Launch failed:', err);
  process.exit(1);
});
