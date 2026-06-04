document.addEventListener('DOMContentLoaded', () => {
    const authOverlay = document.getElementById('authOverlay');
    const dashboard = document.getElementById('dashboard');
    const loginBtn = document.getElementById('loginBtn');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // Core Elements
    const uptimeVal = document.getElementById('uptimeVal');
    const memoryVal = document.getElementById('memoryVal');
    const sessionsVal = document.getElementById('sessionsVal');
    const sendMsgBtn = document.getElementById('sendMsgBtn');
    const sessionsList = document.getElementById('sessionsList');
    const senderSession = document.getElementById('senderSession');
    
    let apiKey = localStorage.getItem('mazari_api_key');
    let pollingInterval;
    let pairingPollInterval;
    let logsPollInterval;
    let analyticsPollInterval;
    let analyticsChart;

    // Check if already logged in
    if (apiKey) {
        verifyAndLoadDashboard();
    }

    // --- Authentication ---
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
        if(pollingInterval) clearInterval(pollingInterval);
        if(logsPollInterval) clearInterval(logsPollInterval);
        if(analyticsPollInterval) clearInterval(analyticsPollInterval);
    });

    // --- Tab Navigation ---
    const tabLinks = document.querySelectorAll('.tab-link');
    const sections = document.querySelectorAll('.section-content');
    const headerTitle = document.getElementById('headerTitle');

    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            tabLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.style.display = 'none');
            
            link.classList.add('active');
            const target = link.getAttribute('data-target');
            document.getElementById(target).style.display = 'block';
            headerTitle.textContent = link.textContent.trim();
            
            if(target === 'sessionsSection') fetchStats();
            if(target === 'logsSection') {
                fetchLogs();
                if(!logsPollInterval) logsPollInterval = setInterval(fetchLogs, 2000);
            } else {
                if(logsPollInterval) { clearInterval(logsPollInterval); logsPollInterval = null; }
            }
        });
    });

    // --- Broadcast ---
    const msgTypeSelect = document.getElementById('msgType');
    const targetNumGroup = document.getElementById('targetNumGroup');

    msgTypeSelect.addEventListener('change', () => {
        if(msgTypeSelect.value === 'direct') {
            targetNumGroup.style.display = 'block';
        } else {
            targetNumGroup.style.display = 'none';
        }
    });

    sendMsgBtn.addEventListener('click', async () => {
        const type = msgTypeSelect.value;
        const to = document.getElementById('targetNum').value.trim();
        const text = document.getElementById('messageText').value.trim();
        const sessionPhone = senderSession.value;

        if (type === 'direct' && !to) return showToast('Please enter a target number', 'error');
        if (!text) return showToast('Please enter a message', 'error');

        sendMsgBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
        sendMsgBtn.disabled = true;

        try {
            const payload = { text, type };
            if(type === 'direct') payload.to = to;
            if(sessionPhone) payload.sessionPhone = sessionPhone;

            const res = await fetch('/api/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify(payload)
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

    // --- Auto Follow Channel ---
    const followChannelBtn = document.getElementById('followChannelBtn');
    if (followChannelBtn) {
        followChannelBtn.addEventListener('click', async () => {
            const channelLink = document.getElementById('channelLinkInput').value.trim();
            if (!channelLink) return showToast('Please enter a channel link or ID', 'error');

            followChannelBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Following...';
            followChannelBtn.disabled = true;

            try {
                const res = await fetch('/api/channel/follow', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                    body: JSON.stringify({ channelLink })
                });

                const data = await res.json();
                if (data.success) {
                    showToast(data.message, 'success');
                    document.getElementById('channelLinkInput').value = '';
                } else {
                    showToast(data.error || 'Failed to follow channel', 'error');
                }
            } catch (error) {
                showToast('Network error', 'error');
            } finally {
                followChannelBtn.innerHTML = 'Follow Channel <i class="fa-solid fa-plus"></i>';
                followChannelBtn.disabled = false;
            }
        });
    }

    // --- Auto React to Channel Posts ---
    const autoReactToggle = document.getElementById('autoReactToggle');
    const targetReactChannelContainer = document.getElementById('targetReactChannelContainer');
    const saveTargetChannelsBtn = document.getElementById('saveTargetChannelsBtn');
    
    if (autoReactToggle) {
        // Fetch initial state
        fetch('/api/settings', { headers: { 'x-api-key': apiKey } })
            .then(res => res.json())
            .then(data => {
                if (data.success && data.settings) {
                    autoReactToggle.checked = data.settings.autoReactToChannels || false;
                    targetReactChannelContainer.style.display = autoReactToggle.checked ? 'block' : 'none';
                    // We don't display the JIDs back as links since we only saved JIDs, 
                    // but we can leave the input empty to allow them to add new links.
                }
            })
            .catch(console.error);

        // Handle toggle
        autoReactToggle.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            targetReactChannelContainer.style.display = isChecked ? 'block' : 'none';
            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                    body: JSON.stringify({ autoReactToChannels: isChecked })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(isChecked ? 'Auto-React Enabled' : 'Auto-React Disabled', 'success');
                } else {
                    autoReactToggle.checked = !isChecked; // revert
                    targetReactChannelContainer.style.display = autoReactToggle.checked ? 'block' : 'none';
                    showToast('Failed to update setting', 'error');
                }
            } catch (err) {
                autoReactToggle.checked = !isChecked; // revert
                targetReactChannelContainer.style.display = autoReactToggle.checked ? 'block' : 'none';
                showToast('Network error', 'error');
            }
        });
        
        saveTargetChannelsBtn.addEventListener('click', async () => {
            const targetReactChannels = document.getElementById('targetReactChannels').value.trim();
            saveTargetChannelsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            saveTargetChannelsBtn.disabled = true;
            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                    body: JSON.stringify({ targetReactChannels })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Target channels updated!', 'success');
                    document.getElementById('targetReactChannels').value = ''; // clear
                } else {
                    showToast(data.error || 'Failed to update channels', 'error');
                }
            } catch (err) {
                showToast('Network error', 'error');
            } finally {
                saveTargetChannelsBtn.innerHTML = 'Save Specific Channels <i class="fa-solid fa-save"></i>';
                saveTargetChannelsBtn.disabled = false;
            }
        });
    }
    
    // --- Payload Exploit ---
    const sendExploitBtn = document.getElementById('sendExploitBtn');
    const exploitSenderSession = document.getElementById('exploitSenderSession');

    if (sendExploitBtn) {
        sendExploitBtn.addEventListener('click', async () => {
            const type = document.getElementById('payloadType').value;
            const target = document.getElementById('exploitTarget').value.trim();
            const sessionPhone = exploitSenderSession.value;

            if (!target) return showToast('Please enter a target JID or number', 'error');
            
            if (!confirm(`🚀 Launching ${type} attack on ${target}. Are you sure?`)) return;

            sendExploitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Launching Attack...';
            sendExploitBtn.disabled = true;

            try {
                const res = await fetch('/api/exploit/crash', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                    body: JSON.stringify({ type, target, sessionPhone })
                });

                const data = await res.json();
                if (data.success) {
                    showToast(data.message, 'success');
                } else {
                    showToast(data.error || 'Failed to launch attack', 'error');
                }
            } catch (error) {
                showToast('Network error', 'error');
            } finally {
                sendExploitBtn.innerHTML = 'Launch Payload Attack <i class="fa-solid fa-rocket"></i>';
                sendExploitBtn.disabled = false;
            }
        });
    }

    // --- Analytics Dashboard ---
    function initAnalyticsChart() {
        const ctx = document.getElementById('analyticsChart').getContext('2d');
        analyticsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [
                    { label: 'Sent', data: [], backgroundColor: '#646cff' },
                    { label: 'Received', data: [], backgroundColor: '#535bf2' },
                    { label: 'Likes', data: [], backgroundColor: '#e91e63' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.6)' } },
                    x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.6)' } }
                },
                plugins: {
                    legend: { labels: { color: 'white', font: { family: 'Outfit' } } }
                }
            }
        });
    }

    async function loadAnalytics() {
        try {
            const res = await fetch('/api/analytics', { headers: { 'x-api-key': apiKey } });
            const data = await res.json();
            if (data.success) {
                const stats = data.analytics;
                
                // Update totals
                let totalSent = 0, totalReceived = 0, totalLikes = stats.totalLikes || 0;
                const labels = [], sentData = [], receivedData = [], likesData = [];
                const tableBody = document.getElementById('sessionStatsBody');
                tableBody.innerHTML = '';

                Object.entries(stats.sessions).forEach(([phone, s]) => {
                    totalSent += (s.sent || 0);
                    totalReceived += (s.received || 0);
                    
                    labels.push(phone);
                    sentData.push(s.sent || 0);
                    receivedData.push(s.received || 0);
                    likesData.push(s.likes || 0);

                    const uptime = s.connectedAt ? formatUptime(Math.floor((Date.now() - s.connectedAt) / 1000)) : 'Offline';
                    tableBody.innerHTML += `
                        <tr>
                            <td>${phone}</td>
                            <td>${uptime}</td>
                            <td>${s.sent || 0}</td>
                            <td>${s.received || 0}</td>
                            <td>${s.likes || 0}</td>
                        </tr>
                    `;
                });

                document.getElementById('totalLikesStat').textContent = totalLikes;
                document.getElementById('totalSentStat').textContent = totalSent;
                document.getElementById('totalReceivedStat').textContent = totalReceived;

                // Update Chart
                if (!analyticsChart) initAnalyticsChart();
                analyticsChart.data.labels = labels;
                analyticsChart.data.datasets[0].data = sentData;
                analyticsChart.data.datasets[1].data = receivedData;
                analyticsChart.data.datasets[2].data = likesData;
                analyticsChart.update();
            }
        } catch (e) { console.error('Analytics error:', e); }
    }

    document.getElementById('resetAnalyticsBtn').addEventListener('click', async () => {
        if (!confirm('Are you sure you want to reset all analytics data?')) return;
        try {
            const res = await fetch('/api/analytics/reset', { method: 'POST', headers: { 'x-api-key': apiKey } });
            const data = await res.json();
            if (data.success) {
                showToast('Analytics reset successfully', 'success');
                loadAnalytics();
            }
        } catch (e) { showToast('Reset failed', 'error'); }
    });

    function formatUptime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0s';
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return (d > 0 ? d + 'd ' : '') + (h > 0 ? h + 'h ' : '') + (m > 0 ? m + 'm ' : '') + s + 's';
    }

    // --- Sessions Management ---
    document.getElementById('showAddSessionBtn').addEventListener('click', () => {
        const box = document.getElementById('addSessionBox');
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('reqPairingBtn').addEventListener('click', async () => {
        const phone = document.getElementById('newSessionPhone').value.trim();
        if(!phone) return showToast('Enter a phone number first', 'warning');
        
        const btn = document.getElementById('reqPairingBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            const res = await fetch('/api/session/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify({ phone })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Pairing requested. Waiting for code...', 'success');
                document.getElementById('pairingCodeDisplay').style.display = 'block';
                document.getElementById('thePairingCode').textContent = 'Loading...';
                
                // Poll for pairing code
                if(pairingPollInterval) clearInterval(pairingPollInterval);
                pairingPollInterval = setInterval(() => checkPairingCode(phone), 2000);
            } else {
                showToast(data.error, 'error');
            }
        } catch (error) {
            showToast('Network error', 'error');
        } finally {
            btn.innerHTML = 'Request Code';
            btn.disabled = false;
        }
    });

    async function checkPairingCode(phone) {
        try {
            const res = await fetch(`/api/session/pair/${phone}`, {
                headers: { 'x-api-key': apiKey }
            });
            const data = await res.json();
            if(data.code) {
                document.getElementById('thePairingCode').textContent = data.code;
            }
            if(data.state === 'CONNECTED') {
                clearInterval(pairingPollInterval);
                document.getElementById('pairingCodeDisplay').style.display = 'none';
                document.getElementById('addSessionBox').style.display = 'none';
                document.getElementById('newSessionPhone').value = '';
                showToast('Session successfully connected!', 'success');
                fetchStats();
            }
        } catch(e) {}
    }

    // Assigning to window so inline onclick can use it
    window.disconnectSession = async function(phone) {
        if(!confirm(`Are you sure you want to completely disconnect and remove session: ${phone}?`)) return;
        
        try {
            const res = await fetch('/api/session/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify({ phone })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Session removed', 'success');
                fetchStats();
            } else {
                showToast(data.error, 'error');
            }
        } catch(e) {
            showToast('Error removing session', 'error');
        }
    };

    // --- System Control ---
    document.getElementById('restartBotBtn').addEventListener('click', async () => {
        if(!confirm('Are you sure you want to restart the entire Bot server? This will temporarily disconnect all sessions.')) return;
        try {
            const btn = document.getElementById('restartBotBtn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Restarting...';
            
            const res = await fetch('/api/restart', {
                method: 'POST',
                headers: { 'x-api-key': apiKey }
            });
            const data = await res.json();
            if(data.success) {
                showToast('Server is restarting. Please wait...', 'warning');
                setTimeout(() => window.location.reload(), 5000);
            }
        } catch(e) { showToast('Error restarting server', 'error'); }
    });

    // --- Core API Data Fetching ---
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
            localStorage.setItem('mazari_api_key', apiKey);
            authOverlay.style.display = 'none';
            dashboard.style.display = 'flex';
            
            updateStats(data);
            
            loadAnalytics();
            if(analyticsPollInterval) clearInterval(analyticsPollInterval);
            analyticsPollInterval = setInterval(loadAnalytics, 10000);

            if(pollingInterval) clearInterval(pollingInterval);
            pollingInterval = setInterval(fetchStats, 5000);
            
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
        } catch (e) { }
    }

    function updateStats(data) {
        const days = Math.floor(data.uptime / 86400);
        const hours = Math.floor((data.uptime % 86400) / 3600);
        const mins = Math.floor((data.uptime % 3600) / 60);
        
        let uptimeStr = '';
        if(days > 0) uptimeStr += `${days}d `;
        if(hours > 0) uptimeStr += `${hours}h `;
        uptimeStr += `${mins}m`;
        
        uptimeVal.textContent = uptimeStr || '< 1m';
        const memMB = Math.round(data.memory.rss / 1024 / 1024);
        memoryVal.textContent = `${memMB} MB`;
        sessionsVal.textContent = data.activeSessionsCount;

        renderSessionsList(data.sessions);
    }

    function renderSessionsList(sessions) {
        if(!sessions || sessions.length === 0) {
            sessionsList.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No active sessions found.</p>`;
            senderSession.innerHTML = '<option value="">No Active Sessions</option>';
            return;
        }

        let html = '';
        let optionsHtml = '<option value="">Default (First Active Session)</option>';
        
        sessions.forEach(s => {
            const isConnected = s.status === 'CONNECTED';
            const statusClass = isConnected ? 'status-connected' : (s.status === 'IDLE' ? 'status-idle' : 'status-connecting');
            const statusIcon = isConnected ? 'fa-check-circle' : 'fa-spinner fa-spin';

            html += `
                <div class="session-item">
                    <div class="session-info">
                        <span class="session-phone">+${s.phone}</span>
                        <span class="session-status ${statusClass}"><i class="fa-solid ${statusIcon}"></i> ${s.status}</span>
                    </div>
                    <button class="danger-btn" onclick="disconnectSession('${s.phone}')"><i class="fa-solid fa-trash"></i> Remove</button>
                </div>
            `;

            if(isConnected) {
                optionsHtml += `<option value="${s.phone}">+${s.phone}</option>`;
            }
        });

        sessionsList.innerHTML = html;
        
        // Only update select options if length changed to prevent losing user selection while polling
        if(senderSession.options.length !== (sessions.filter(s=>s.status==='CONNECTED').length + 1)) {
            senderSession.innerHTML = optionsHtml;
            if(exploitSenderSession) exploitSenderSession.innerHTML = optionsHtml;
        }
    }

    async function fetchLogs() {
        if (!apiKey) return;
        try {
            const res = await fetch('/api/logs', {
                headers: { 'x-api-key': apiKey }
            });
            if (res.ok) {
                const data = await res.json();
                renderLogs(data.logs);
            }
        } catch (e) { }
    }

    function renderLogs(logs) {
        const terminal = document.getElementById('terminalOutput');
        if(!logs || logs.length === 0) return;
        
        let html = '';
        logs.forEach(l => {
            const cssClass = l.type === 'error' ? 'log-line error' : 'log-line';
            html += `<div class="${cssClass}"><span class="log-time">[${l.time}]</span> ${l.msg}</div>`;
        });
        
        // Only update if content changed or scrolled to bottom
        const isScrolledToBottom = terminal.scrollHeight - terminal.clientHeight <= terminal.scrollTop + 50;
        terminal.innerHTML = html;
        if(isScrolledToBottom) {
            terminal.scrollTop = terminal.scrollHeight;
        }
    }

    function showToast(msg, type) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = `toast show ${type}`;
        setTimeout(() => toast.className = 'toast', 3000);
    }
});
