/**
 * ZOXER BOT — Web Pairing Engine Client Logic
 * Modern Glassmorphic UI with High-Res Image Flags & Country Picker
 */

document.addEventListener('DOMContentLoaded', () => {
    // Country Dataset with 2-letter ISO codes for FlagCDN
    const countries = [
        { name: "Pakistan", code: "pk", dial: "92" },
        { name: "India", code: "in", dial: "91" },
        { name: "United States", code: "us", dial: "1" },
        { name: "United Kingdom", code: "gb", dial: "44" },
        { name: "Saudi Arabia", code: "sa", dial: "966" },
        { name: "United Arab Emirates", code: "ae", dial: "971" },
        { name: "Bangladesh", code: "bd", dial: "880" },
        { name: "Nigeria", code: "ng", dial: "234" },
        { name: "Indonesia", code: "id", dial: "62" },
        { name: "Brazil", code: "br", dial: "55" },
        { name: "Germany", code: "de", dial: "49" },
        { name: "France", code: "fr", dial: "33" },
        { name: "Canada", code: "ca", dial: "1" },
        { name: "Australia", code: "au", dial: "61" },
        { name: "Turkey", code: "tr", dial: "90" },
        { name: "Egypt", code: "eg", dial: "20" },
        { name: "South Africa", code: "za", dial: "27" },
        { name: "Russia", code: "ru", dial: "7" },
        { name: "Spain", code: "es", dial: "34" },
        { name: "Italy", code: "it", dial: "39" },
        { name: "Netherlands", code: "nl", dial: "31" },
        { name: "Malaysia", code: "my", dial: "60" },
        { name: "Philippines", code: "ph", dial: "63" },
        { name: "Mexico", code: "mx", dial: "52" },
        { name: "Argentina", code: "ar", dial: "54" },
        { name: "Colombia", code: "co", dial: "57" },
        { name: "Kenya", code: "ke", dial: "254" },
        { name: "Ghana", code: "gh", dial: "233" },
        { name: "Morocco", code: "ma", dial: "212" },
        { name: "Algeria", code: "dz", dial: "213" },
        { name: "Iraq", code: "iq", dial: "964" },
        { name: "Kuwait", code: "kw", dial: "965" },
        { name: "Qatar", code: "qa", dial: "974" },
        { name: "Oman", code: "om", dial: "968" },
        { name: "Bahrain", code: "bh", dial: "973" },
        { name: "Jordan", code: "jo", dial: "962" },
        { name: "Lebanon", code: "lb", dial: "961" },
        { name: "Sri Lanka", code: "lk", dial: "94" },
        { name: "Nepal", code: "np", dial: "977" },
        { name: "Afghanistan", code: "af", dial: "93" },
        { name: "Iran", code: "ir", dial: "98" },
        { name: "Japan", code: "jp", dial: "81" },
        { name: "South Korea", code: "kr", dial: "82" },
        { name: "China", code: "cn", dial: "86" },
        { name: "Singapore", code: "sg", dial: "65" },
        { name: "Thailand", code: "th", dial: "66" },
        { name: "Vietnam", code: "vn", dial: "84" },
        { name: "New Zealand", code: "nz", dial: "64" },
        { name: "Sweden", code: "se", dial: "46" },
        { name: "Norway", code: "no", dial: "47" },
        { name: "Switzerland", code: "ch", dial: "41" },
        { name: "Belgium", code: "be", dial: "32" },
        { name: "Austria", code: "at", dial: "43" },
        { name: "Portugal", code: "pt", dial: "351" },
        { name: "Poland", code: "pl", dial: "48" },
        { name: "Ukraine", code: "ua", dial: "380" },
        { name: "Greece", code: "gr", dial: "30" },
        { name: "Ireland", code: "ie", dial: "353" }
    ];

    let selectedCountry = countries[0]; // Default: Pakistan pk (+92)

    // DOM Elements
    const countryPickerBtn = document.getElementById('countryPickerBtn');
    const countryModal = document.getElementById('countryModal');
    const btnCountryModalClose = document.getElementById('btnCountryModalClose');
    const countrySearch = document.getElementById('countrySearch');
    const countryList = document.getElementById('countryList');
    const selectedFlagImg = document.getElementById('selectedFlagImg');
    const selectedDialCode = document.getElementById('selectedDialCode');

    const pairForm = document.getElementById('pairForm');
    const phoneNumberInput = document.getElementById('phoneNumber');
    const btnSubmit = document.getElementById('btnSubmit');
    const btnSpinner = document.getElementById('btnSpinner');

    // States
    const stepInput = document.getElementById('stepInput');
    const stepLoading = document.getElementById('stepLoading');
    const stepCode = document.getElementById('stepCode');
    const stepConnected = document.getElementById('stepConnected');

    // Display Elements
    const pairCodeDisplay = document.getElementById('pairCodeDisplay');
    const displayPhone = document.getElementById('displayPhone');
    const connectedPhone = document.getElementById('connectedPhone');
    const loadingMessage = document.getElementById('loadingMessage');
    const btnCopy = document.getElementById('btnCopy');
    const copyTooltip = document.getElementById('copyTooltip');
    const codeBox = document.getElementById('codeBox');
    const btnReset = document.getElementById('btnReset');
    const btnPairAnother = document.getElementById('btnPairAnother');
    const timerCountdown = document.getElementById('timerCountdown');
    const timerFill = document.getElementById('timerFill');
    const serverStatusText = document.getElementById('serverStatusText');
    const serverStatusBadge = document.getElementById('serverStatusBadge');

    let currentFullPhone = '';
    let pollingInterval = null;
    let timerInterval = null;
    let timeLeft = 120; // 2 minutes

    // Render Country List with FlagCDN Real Images
    function renderCountryList(filterText = '') {
        const query = filterText.toLowerCase().trim();
        countryList.innerHTML = '';

        const filtered = countries.filter(c => 
            c.name.toLowerCase().includes(query) || 
            c.dial.includes(query) ||
            c.code.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            countryList.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-dim); font-size: 0.9rem;">No matching countries found</div>`;
            return;
        }

        filtered.forEach(c => {
            const item = document.createElement('div');
            item.className = `country-item ${c.code === selectedCountry.code ? 'selected' : ''}`;
            item.innerHTML = `
                <div class="country-item-left">
                    <img 
                        src="https://flagcdn.com/w40/${c.code}.png" 
                        alt="${c.name}" 
                        class="country-item-flag-img" 
                        loading="lazy" 
                    />
                    <span class="country-item-name">${c.name}</span>
                </div>
                <span class="country-item-code">+${c.dial}</span>
            `;
            item.addEventListener('click', () => {
                selectCountry(c);
                closeCountryModal();
            });
            countryList.appendChild(item);
        });
    }

    // Select Country Action
    function selectCountry(country) {
        selectedCountry = country;
        selectedFlagImg.src = `https://flagcdn.com/w40/${country.code}.png`;
        selectedFlagImg.alt = country.name;
        selectedDialCode.textContent = `+${country.dial}`;
        renderCountryList(countrySearch.value);
        phoneNumberInput.focus();
    }

    // Open / Close Country Modal
    function openCountryModal() {
        countryModal.classList.remove('hidden');
        countryPickerBtn.classList.add('active');
        countrySearch.value = '';
        renderCountryList('');
        setTimeout(() => countrySearch.focus(), 60);
    }

    function closeCountryModal() {
        countryModal.classList.add('hidden');
        countryPickerBtn.classList.remove('active');
    }

    countryPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCountryModal();
    });

    btnCountryModalClose.addEventListener('click', () => {
        closeCountryModal();
    });

    // Close on click outside modal card
    countryModal.addEventListener('click', (e) => {
        if (e.target === countryModal) {
            closeCountryModal();
        }
    });

    countrySearch.addEventListener('input', (e) => {
        renderCountryList(e.target.value);
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCountryModal();
    });

    // Initialize Countries
    renderCountryList();

    // Input sanitization & Smart Paste
    phoneNumberInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val;
    });

    // Smart Paste with international code auto-detection
    phoneNumberInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        let digits = text.replace(/[^0-9]/g, '');

        if (!digits) return;

        // Check if pasted number starts with any dial code
        const matchedCountry = countries
            .slice()
            .sort((a, b) => b.dial.length - a.dial.length) // Longest dial code first
            .find(c => digits.startsWith(c.dial) && digits.length > c.dial.length + 5);

        if (matchedCountry) {
            selectCountry(matchedCountry);
            let rest = digits.slice(matchedCountry.dial.length);
            if (rest.startsWith('0')) rest = rest.slice(1);
            phoneNumberInput.value = rest;
        } else {
            if (digits.startsWith('0')) digits = digits.slice(1);
            phoneNumberInput.value = digits;
        }
    });

    // Check Backend Server Health
    checkServerHealth();

    async function checkServerHealth() {
        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            if (data.success) {
                serverStatusText.textContent = `Online (${data.activeSessions || 0} active)`;
            }
        } catch (err) {
            serverStatusText.textContent = 'Server Offline';
            serverStatusBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
            serverStatusBadge.style.color = '#ef4444';
        }
    }

    // Handle Form Submit
    pairForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let digits = phoneNumberInput.value.trim().replace(/[^0-9]/g, '');

        // Remove leading 0 if present (e.g. 0323... -> 323...)
        if (digits.startsWith('0')) {
            digits = digits.slice(1);
        }

        if (!digits || digits.length < 6 || digits.length > 14) {
            showToast('Please enter valid phone number digits', 'error');
            phoneNumberInput.focus();
            return;
        }

        // Combine selected dial code with digits
        currentFullPhone = `${selectedCountry.dial}${digits}`;
        setLoadingState(true, `Requesting pairing code for ${selectedCountry.name} (+${currentFullPhone})...`);

        try {
            const response = await fetch('/api/pair', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phone: currentFullPhone })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to request pairing code');
            }

            if (data.alreadyConnected) {
                showConnectedState(currentFullPhone);
                showToast(`+${currentFullPhone} is already active and connected!`, 'success');
                return;
            }

            // Successfully received pairing code
            showCodeState(data.code, currentFullPhone);
            showToast('Pairing code generated! Enter it in WhatsApp.', 'success');

        } catch (error) {
            console.error('Pairing Error:', error);
            showToast(error.message || 'Error communicating with bot server', 'error');
            showInputState();
        } finally {
            setLoadingState(false);
        }
    });

    // Switch to Code Display State
    function showCodeState(code, phone) {
        stepInput.classList.add('hidden');
        stepLoading.classList.add('hidden');
        stepConnected.classList.add('hidden');
        stepCode.classList.remove('hidden');

        pairCodeDisplay.textContent = code;
        displayPhone.textContent = `+${phone}`;

        startTimer();
        startStatusPolling(phone);
    }

    // Switch to Connected Success State
    function showConnectedState(phone) {
        stopTimer();
        stopStatusPolling();

        stepInput.classList.add('hidden');
        stepLoading.classList.add('hidden');
        stepCode.classList.add('hidden');
        stepConnected.classList.remove('hidden');

        connectedPhone.textContent = `+${phone}`;
    }

    // Switch back to Input State
    function showInputState() {
        stopTimer();
        stopStatusPolling();

        stepLoading.classList.add('hidden');
        stepCode.classList.add('hidden');
        stepConnected.classList.add('hidden');
        stepInput.classList.remove('hidden');

        phoneNumberInput.value = '';
        phoneNumberInput.focus();
    }

    // Loading State Helper
    function setLoadingState(isLoading, message = 'Connecting to WhatsApp...') {
        if (isLoading) {
            stepInput.classList.add('hidden');
            stepCode.classList.add('hidden');
            stepConnected.classList.add('hidden');
            stepLoading.classList.remove('hidden');
            loadingMessage.textContent = message;
            btnSubmit.disabled = true;
            btnSpinner.style.display = 'block';
        } else {
            btnSubmit.disabled = false;
            btnSpinner.style.display = 'none';
        }
    }

    // Copy Code to Clipboard
    async function copyPairingCode() {
        const code = pairCodeDisplay.textContent.trim();
        if (!code || code.includes('- -')) return;

        try {
            await navigator.clipboard.writeText(code);
            copyTooltip.textContent = 'Copied!';
            showToast(`Code ${code} copied to clipboard!`, 'success');
            setTimeout(() => {
                copyTooltip.textContent = 'Copy';
            }, 2000);
        } catch (err) {
            // Fallback for older browsers
            const input = document.createElement('input');
            input.value = code;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            copyTooltip.textContent = 'Copied!';
            showToast(`Code ${code} copied!`, 'success');
            setTimeout(() => {
                copyTooltip.textContent = 'Copy';
            }, 2000);
        }
    }

    btnCopy.addEventListener('click', (e) => {
        e.stopPropagation();
        copyPairingCode();
    });

    codeBox.addEventListener('click', () => {
        copyPairingCode();
    });

    // Reset & Try Another Button
    btnReset.addEventListener('click', showInputState);
    btnPairAnother.addEventListener('click', showInputState);

    // 2-Minute Expiration Countdown
    function startTimer() {
        stopTimer();
        timeLeft = 120;
        updateTimerDisplay();

        timerInterval = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();

            if (timeLeft <= 0) {
                stopTimer();
                stopStatusPolling();
                showToast('Pairing code expired. Please request a new code.', 'error');
                showInputState();
            }
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function updateTimerDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerCountdown.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        const percentage = (timeLeft / 120) * 100;
        timerFill.style.width = `${percentage}%`;
    }

    // Real-Time Polling for WhatsApp Connection Confirmation
    function startStatusPolling(phone) {
        stopStatusPolling();
        pollingInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/pair/status/${phone}`);
                const data = await res.json();
                if (data.success && data.isConnected) {
                    showConnectedState(phone);
                    showToast('🎉 Connection Established! Bot is now active.', 'success');
                }
            } catch (err) {
                // Ignore temporary network polling errors
            }
        }, 2000);
    }

    function stopStatusPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    // Toast Notification System
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
});
