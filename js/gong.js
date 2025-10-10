// Simple gong synthesizer using Web Audio API
(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let ctx = null;

    function ensureCtx() {
        if (!ctx) ctx = new AudioContext();
        return ctx;
    }

    function playGong({ volume = 0.6, tone = 150, dampen = 1.4 } = {}) {
        const ac = ensureCtx();
        const now = ac.currentTime;

        // Create a resonant gong-ish sound by combining noise burst + inharmonic partials
        const master = ac.createGain(); master.gain.value = volume; master.connect(ac.destination);

        // Noise burst (beater attack)
        const bufferSize = 2 * ac.sampleRate;
        const noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.02));
        const noise = ac.createBufferSource(); noise.buffer = noiseBuffer;
        const noiseGain = ac.createGain(); noiseGain.gain.value = 1.0;
        noise.connect(noiseGain).connect(master);
        noise.start(now);
        noise.stop(now + 0.05);

        // Create several detuned oscillators to emulate metal partials
        const partials = [1, 1.9, 2.7, 3.6, 4.8, 6.1];
        const gains = [];
        partials.forEach((p, i) => {
            const osc = ac.createOscillator();
            osc.type = 'sine';
            // slightly inharmonic
            const freq = tone * p * (1 + (Math.random() - 0.5) * 0.02);
            osc.frequency.setValueAtTime(freq, now);

            const g = ac.createGain();
            // staggered amplitude
            g.gain.value = Math.pow(0.6, i) * 0.9;

            // long exponential decay per partial
            const decay = 0.5 * (i + 1) * dampen;
            g.gain.setValueAtTime(g.gain.value, now + 0.001);
            g.gain.exponentialRampToValueAtTime(0.0001, now + decay);

            osc.connect(g).connect(master);
            osc.start(now);
            osc.stop(now + decay + 0.1);

            gains.push(g);
        });

        // Slight metallic resonant filter to shape the tone
        const band = ac.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = tone * 1.2;
        band.Q.value = 6;
        master.disconnect();
        master.connect(band).connect(ac.destination);

        // release master slowly
        master.gain.setValueAtTime(volume, now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 6 * dampen);
    }

    // Wire up UI
    const button = document.getElementById('test-button') || document.getElementById('gong-button');
    const volume = document.getElementById('volume');
    const tone = document.getElementById('tone');
    const dampen = document.getElementById('dampen');
    const nextGlobal = document.getElementById('auto-next-global');

    function readSettings() {
        return { volume: Number(volume.value), tone: Number(tone.value), dampen: Number(dampen.value) };
    }

    button.addEventListener('click', () => playGong(readSettings()));

    // Persistent settings (localStorage)
    const STORAGE_KEY = 'gong:settings:v1';
    function saveSettings() {
        try {
            const data = {
                volume: Number(volume.value),
                tone: Number(tone.value),
                dampen: Number(dampen.value),
                autoEnabled: !!(autoToggle && autoToggle.checked),
                autoLower: parseInt(autoLower.value, 10) || 1,
                autoUpper: parseInt(autoUpper.value, 10) || 1
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) { /* ignore storage errors */ }
    }

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data.volume != null) volume.value = Number(data.volume);
            if (data.tone != null) tone.value = String(data.tone);
            if (data.dampen != null) dampen.value = Number(data.dampen);
            if (data.autoLower != null) autoLower.value = String(parseInt(data.autoLower, 10) || 1);
            if (data.autoUpper != null) autoUpper.value = String(parseInt(data.autoUpper, 10) || 1);
            enforceBounds();
            if (autoToggle && data.autoEnabled) {
                // set checked but don't start until after load completes
                autoToggle.checked = true;
            }
        } catch (e) { /* ignore parse errors */ }
    }

    // Keyboard: Space or Enter
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
            // prevent scrolling on space
            if (e.code === 'Space') e.preventDefault();
            playGong(readSettings());
        }
    });

    // unlock audio on first user gesture on some mobile/desktop browsers
    function unlock() {
        ensureCtx();
        if (ctx.state === 'suspended') ctx.resume();
        window.removeEventListener('pointerdown', unlock);
    }
    window.addEventListener('pointerdown', unlock);

    // Auto-strike scheduler
    const autoToggle = document.getElementById('auto-toggle');
    const autoLower = document.getElementById('auto-lower');
    const autoUpper = document.getElementById('auto-upper');
    let autoTimer = null;
    let nextTimeoutAt = null; // timestamp (Date.now()) when next timeout will fire
    let nextTicker = null; // interval id for updating the display

    // Next wait display (defined early so scheduleNext can call startNextTicker safely)
    const nextOutput = document.getElementById('auto-next');
    function startNextTicker() {
        stopNextTicker();
        if (!nextOutput) return;
        nextTicker = setInterval(() => {
            if (!nextTimeoutAt) { nextOutput.value = '—'; nextOutput.textContent = '—'; if(nextGlobal) nextGlobal.textContent = '—'; return; }
            const remaining = Math.max(0, nextTimeoutAt - Date.now());
            const txt = Math.ceil(remaining / 1000).toString();
            nextOutput.value = txt;
            nextOutput.textContent = txt;
            if(nextGlobal) nextGlobal.textContent = txt;
        }, 200);
    }
    function stopNextTicker() {
        if (nextTicker) { clearInterval(nextTicker); nextTicker = null; }
        if (nextOutput) { nextOutput.value = '—'; nextOutput.textContent = '—'; }
        if (nextGlobal) nextGlobal.textContent = '—';
    }

    function parseBounds() {
        // parse integer seconds
        const a = parseInt(autoLower.value, 10) || 1;
        const b = parseInt(autoUpper.value, 10) || 1;
        const min = Math.max(1, Math.min(a, b));
        const max = Math.max(min, Math.max(a, b));
        return { min, max };
    }

    function scheduleNext() {
        const { min, max } = parseBounds();
        // Ensure we have an AudioContext; if it's suspended due to autoplay policies,
        // wait for a user gesture to resume audio before scheduling the first strike.
        ensureCtx();
        if (ctx && ctx.state === 'suspended') {
            // show a hint in the Next display
            if (nextOutput) { nextOutput.value = 'tap'; nextOutput.textContent = 'tap'; }
            const onUser = () => {
                window.removeEventListener('pointerdown', onUser);
                // resume may require a user gesture; resume then schedule
                ctx.resume().finally(() => {
                    // schedule after resume
                    scheduleNext();
                });
            };
            window.addEventListener('pointerdown', onUser);
            return;
        }
        // choose integer number of seconds uniformly in [min, max]
        const delay = Math.floor(min + Math.random() * (max - min + 1));
        // clear previous timer just in case
        if (autoTimer) clearTimeout(autoTimer);
        const ms = Math.round(delay * 1000);
        nextTimeoutAt = Date.now() + ms;
        autoTimer = setTimeout(() => {
            playGong(readSettings());
            // schedule subsequent strike
            scheduleNext();
        }, ms);
        startNextTicker();
    }

    function startAuto() {
        if (autoTimer) return;
        // schedule first strike (no immediate strike)
        scheduleNext();
    }

    function stopAuto() {
        if (autoTimer) {
            clearTimeout(autoTimer);
            autoTimer = null;
            nextTimeoutAt = null;
            stopNextTicker();
        }
    }

    if (autoToggle) {
        autoToggle.addEventListener('change', () => {
            if (autoToggle.checked) startAuto(); else stopAuto();
            saveSettings();
        });
    }

    // If bounds change while running, restart scheduling to pick new intervals
    function enforceBounds() {
        // ensure autoUpper is not less than autoLower
        const minVal = parseInt(autoLower.value, 10) || 1;
        let maxVal = parseInt(autoUpper.value, 10) || 1;
        if (maxVal < minVal) {
            maxVal = minVal;
            autoUpper.value = String(maxVal);
        }
        // keep the input's min attribute in sync
        autoUpper.min = String(minVal);
    }

    [autoLower, autoUpper].forEach(el => {
        if (!el) return;
        el.addEventListener('input', () => {
            enforceBounds();
            if (autoToggle && autoToggle.checked) {
                // restart with new bounds
                stopAuto();
                scheduleNext();
            }
            saveSettings();
        });
    });

    // Save volume/tone/dampen changes
    [volume, tone, dampen].forEach(el => {
        if (!el) return;
        el.addEventListener('input', () => saveSettings());
    });

    // Load saved settings and apply on startup
    loadSettings();
    if (autoToggle && autoToggle.checked) {
        // start scheduling according to saved bounds
        scheduleNext();
    }

    // ...existing code...

})();
