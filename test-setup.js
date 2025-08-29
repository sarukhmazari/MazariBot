// Test script to verify setup
console.log('🧪 Testing WhatsApp Bot Setup...\n');

try {
    // Test if required packages are installed
    const whatsapp = require('whatsapp-web.js');
    console.log('✅ whatsapp-web.js is installed');
    
    const qrcode = require('qrcode-terminal');
    console.log('✅ qrcode-terminal is installed');
    
    console.log('\n🎉 All dependencies are properly installed!');
    console.log('🚀 You can now run: npm start');
    
} catch (error) {
    console.error('❌ Setup test failed:', error.message);
    console.log('\n💡 Try running: npm install');
}
