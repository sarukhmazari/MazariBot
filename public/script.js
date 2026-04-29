document.addEventListener('DOMContentLoaded', () => {
    const authOverlay = document.getElementById('authOverlay');
    const dashboard = document.getElementById('dashboard');
    const loginBtn = document.getElementById('loginBtn');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // Elements
    const uptimeVal = document.getElementById('uptimeVal');
    const memoryVal = document.getElementById('memoryVal');
    const sessionsVal = document.getElementById('sessionsVal');
    const sendMsgBtn = document.getElementById('sendMsgBtn');
    
    let apiKey = localStorage.getItem('mazari_api_key');

    // Check if already logged in
    if (apiKey) {
        verifyAndLoadDashboard();
    }

    loginBtn.addEventListener('click', () => {
        apiKey = apiKeyInput.value.trim();
        if (!apiKey) return showToast('Please enter an API Key', 'error');
        verifyAndLoadDashboard();
    });

    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('mazari_api_key');
        apiKey = null;
        dashboard.style.display = 'none';
        authOverlay.style.display = 'flex';
        apiKeyInput.value = '';
    });

    sendMsgBtn.addEventListener('click', async () => {
        const to = document.getElementById('targetNum').value.trim();
        const text = document.getElementById('messageText').value.trim();

        if (!to || !text) return showToast('Please fill all fields', 'error');

        sendMsgBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
        sendMsgBtn.disabled = true;

        try {
            const res = await fetch('/api/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey
                },
                body: JSON.stringify({ to, text })
            });

            const data = await res.json();
            if (data.success) {
                showToast('Message sent successfully!', 'success');
                document.getElementById('messageText').value = '';
            } else {
                showToast(data.error || 'Failed to send message', 'error');
            }
        } catch (error) {
            showToast('Network error', 'error');
        } finally {
            sendMsgBtn.innerHTML = 'Send Message <i class="fa-solid fa-paper-plane"></i>';
            sendMsgBtn.disabled = false;
        }
    });

    async function verifyAndLoadDashboard() {
        try {
            const res = await fetch('/api/status', {
                headers: { 'x-api-key': apiKey }
            });

            if (res.status === 401) {
                localStorage.removeItem('mazari_api_key');
                showToast('Invalid API Key!', 'error');
                return;
            }

            const data = await res.json();
            
            // Login successful
            localStorage.setItem('mazari_api_key', apiKey);
            authOverlay.style.display = 'none';
            dashboard.style.display = 'flex';
            
            updateStats(data);
            
            // Start polling stats every 5 seconds
            setInterval(fetchStats, 5000);
            
        } catch (error) {
            showToast('Cannot connect to server', 'error');
        }
    }

    async function fetchStats() {
        if (!apiKey) return;
        try {
            const res = await fetch('/api/status', {
                headers: { 'x-api-key': apiKey }
            });
            if (res.ok) {
                const data = await res.json();
                updateStats(data);
            }
        } catch (e) {
            console.log('Polling failed');
        }
    }

    function updateStats(data) {
        // Format uptime
        const days = Math.floor(data.uptime / 86400);
        const hours = Math.floor((data.uptime % 86400) / 3600);
        const mins = Math.floor((data.uptime % 3600) / 60);
        
        let uptimeStr = '';
        if(days > 0) uptimeStr += `${days}d `;
        if(hours > 0) uptimeStr += `${hours}h `;
        uptimeStr += `${mins}m`;
        
        uptimeVal.textContent = uptimeStr || '< 1m';
        
        // Format memory
        const memMB = Math.round(data.memory.rss / 1024 / 1024);
        memoryVal.textContent = `${memMB} MB`;
        
        // Active sessions
        sessionsVal.textContent = data.activeSessionsCount;
    }

    function showToast(msg, type) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = `toast show ${type}`;
        setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }
});
