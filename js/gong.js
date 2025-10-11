// GONG – Web Audio + Auto Scheduler
(() => {
    /** -----------------------------
     *  DOM helpers and references
     *  ----------------------------- */
    const $ = (id) => document.getElementById(id);
    const els = {
        testBtn: $('test-button'),
        engageBtn: $('engage-button'),
        volume: $('volume'),
        tone: $('tone'),
        dampen: $('dampen'),
        nextLocal: $('auto-next'),
        nextGlobal: $('auto-next-global'),
        autoToggle: $('auto-toggle'),
        autoLower: $('auto-lower'),
        autoUpper: $('auto-upper'),
    };

    const STORAGE_KEY = 'gong:settings:v1';

    /** -----------------------------
     *  Audio setup and gong synthesis
     *  ----------------------------- */
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    let ctx = null;

    // Ensure a single AudioContext instance exists
    const ensureCtx = () => {
        if (!ctx) ctx = new AudioContextCtor();
        return ctx;
    };

    // Unlock/resume audio on first user gesture (mobile/desktop autoplay policies)
    const unlockAudioOnce = () => {
        ensureCtx();
        if (ctx.state === 'suspended') ctx.resume();
        window.removeEventListener('pointerdown', unlockAudioOnce);
    };
    window.addEventListener('pointerdown', unlockAudioOnce);

    // Synthesize a gong-like strike
    const playGong = ({ volume = 0.6, tone = 150, dampen = 1.4 } = {}) => {
        const ac = ensureCtx();
        const now = ac.currentTime;

        // Master gain
        const master = ac.createGain();
        master.gain.value = volume;
        master.connect(ac.destination);

        // Short noise burst (mallet hit)
        const bufferSize = 2 * ac.sampleRate;
        const noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
        const ndata = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            ndata[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.02));
        }
        const noise = ac.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseGain = ac.createGain();
        noiseGain.gain.value = 1.0;
        noise.connect(noiseGain).connect(master);
        noise.start(now);
        noise.stop(now + 0.05);

        // Inharmonic partials (metal overtones)
        const partials = [1, 1.9, 2.7, 3.6, 4.8, 6.1];
        partials.forEach((p, i) => {
            const osc = ac.createOscillator();
            osc.type = 'sine';
            const freq = tone * p * (1 + (Math.random() - 0.5) * 0.02);
            osc.frequency.setValueAtTime(freq, now);

            const g = ac.createGain();
            g.gain.value = Math.pow(0.6, i) * 0.9;

            const decay = 0.5 * (i + 1) * dampen;
            g.gain.setValueAtTime(g.gain.value, now + 0.001);
            g.gain.exponentialRampToValueAtTime(0.0001, now + decay);

            osc.connect(g).connect(master);
            osc.start(now);
            osc.stop(now + decay + 0.1);
        });

        // Band-pass filter to shape tone
        const band = ac.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = tone * 1.2;
        band.Q.value = 6;

        master.disconnect();
        master.connect(band).connect(ac.destination);

        // Long release on master
        master.gain.setValueAtTime(volume, now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 6 * dampen);
    };

    /** -----------------------------
     *  Settings (read/load/save)
     *  ----------------------------- */
    const readUISettings = () => ({
        volume: Number(els.volume?.value ?? 0.6),
        tone: Number(els.tone?.value ?? 150),
        dampen: Number(els.dampen?.value ?? 1.4),
    });

    const saveSettings = () => {
        try {
            const data = {
                volume: Number(els.volume?.value ?? 0.6),
                tone: Number(els.tone?.value ?? 150),
                dampen: Number(els.dampen?.value ?? 1.4),
                autoLower: parseInt(els.autoLower?.value ?? '5', 10) || 1,
                autoUpper: parseInt(els.autoUpper?.value ?? '10', 10) || 1,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch {
            /* ignore storage errors */
        }
    };

    const loadSettings = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (els.volume && data.volume != null) els.volume.value = String(Number(data.volume));
            if (els.tone && data.tone != null) els.tone.value = String(data.tone);
            if (els.dampen && data.dampen != null) els.dampen.value = String(Number(data.dampen));
            if (els.autoLower && data.autoLower != null) els.autoLower.value = String(parseInt(data.autoLower, 10) || 1);
            if (els.autoUpper && data.autoUpper != null) els.autoUpper.value = String(parseInt(data.autoUpper, 10) || 1);
            enforceBounds();
        } catch {
            /* ignore parse/IO errors */
        }
    };

    /** -----------------------------
     *  Auto scheduler + countdown
     *  ----------------------------- */
    let autoTimer = null;
    let nextTimeoutAt = null; // ms epoch when next strike will fire
    let nextTicker = null;    // setInterval id for countdown

    const setNextText = (txt) => {
        if (els.nextLocal) { els.nextLocal.value = txt; els.nextLocal.textContent = txt; }
        if (els.nextGlobal) { els.nextGlobal.value = txt; els.nextGlobal.textContent = txt; }
    };

    const startNextTicker = () => {
        stopNextTicker();
        if (!els.nextLocal && !els.nextGlobal) return;

        nextTicker = setInterval(() => {
            if (!nextTimeoutAt) { setNextText('-'); return; }
            const remaining = Math.max(0, nextTimeoutAt - Date.now());
            const secs = Math.ceil(remaining / 1000).toString();
            setNextText(secs);
        }, 200);
    };

    const stopNextTicker = () => {
        if (nextTicker) clearInterval(nextTicker);
        nextTicker = null;
        setNextText('-');
    };

    const parseBounds = () => {
        const a = parseInt(els.autoLower?.value ?? '1', 10) || 1;
        const b = parseInt(els.autoUpper?.value ?? '1', 10) || 1;
        const min = Math.max(1, Math.min(a, b));
        const max = Math.max(min, Math.max(a, b));
        return { min, max };
    };

    const scheduleNext = () => {
        const { min, max } = parseBounds();

        // Ensure AudioContext can play (autoplay policy)
        ensureCtx();
        if (ctx && ctx.state === 'suspended') {
            setNextText('tap');
            const onUser = () => {
                window.removeEventListener('pointerdown', onUser);
                ctx.resume().finally(scheduleNext);
            };
            window.addEventListener('pointerdown', onUser);
            return;
        }

        // Random integer seconds in [min, max]
        const delaySec = Math.floor(min + Math.random() * (max - min + 1));
        if (autoTimer) clearTimeout(autoTimer);

        const ms = delaySec * 1000;
        nextTimeoutAt = Date.now() + ms;

        autoTimer = setTimeout(() => {
            playGong(readUISettings());
            scheduleNext(); // schedule subsequent strike
        }, ms);

        startNextTicker();
    };

    const startAuto = () => {
        if (autoTimer) return;
        scheduleNext(); // plan first strike (not immediate)
    };

    const stopAuto = () => {
        if (autoTimer) clearTimeout(autoTimer);
        autoTimer = null;
        nextTimeoutAt = null;
        stopNextTicker();
    };

    const enforceBounds = () => {
        const minVal = parseInt(els.autoLower?.value ?? '1', 10) || 1;
        let maxVal = parseInt(els.autoUpper?.value ?? '1', 10) || 1;
        if (maxVal < minVal) {
            maxVal = minVal;
            if (els.autoUpper) els.autoUpper.value = String(maxVal);
        }
        if (els.autoUpper) els.autoUpper.min = String(minVal);
    };

    /** -----------------------------
     *  Engage button (hard-linked to auto)
     *  ----------------------------- */
    const updateEngageLabel = () => {
        if (!els.engageBtn || !els.autoToggle) return;
        const on = !!els.autoToggle.checked;
        els.engageBtn.textContent = on ? 'Disengage' : 'Engage';
        els.engageBtn.setAttribute('aria-pressed', String(on));
        els.engageBtn.classList.toggle('engaged', on);
    };

    /** -----------------------------
     *  Event wiring
     *  ----------------------------- */
    // Test: play immediately
    els.testBtn?.addEventListener('click', () => playGong(readUISettings()));

    // Manual checkbox toggle for auto
    els.autoToggle?.addEventListener('change', () => {
        if (els.autoToggle.checked) startAuto(); else stopAuto();
        updateEngageLabel();
        saveSettings();
    });

    // Engage button toggles auto and plays an immediate strike on start
    if (els.engageBtn && els.autoToggle) {
        els.engageBtn.addEventListener('click', () => {
            els.autoToggle.checked = !els.autoToggle.checked;

            if (els.autoToggle.checked) {
                playGong(readUISettings()); // immediate first strike
                startAuto();
            } else {
                stopAuto();
            }

            updateEngageLabel();
            saveSettings();
        });
    }

    // Bounds changes (restart scheduler when active)
    [els.autoLower, els.autoUpper].forEach((el) => {
        el?.addEventListener('input', () => {
            enforceBounds();
            if (els.autoToggle?.checked) {
                stopAuto();
                scheduleNext();
            }
            saveSettings();
        });
    });

    // Save sliders/selects on change
    [els.volume, els.tone, els.dampen].forEach((el) => {
        el?.addEventListener('input', saveSettings);
    });

    /** -----------------------------
     *  Init
     *  ----------------------------- */
    loadSettings();
    updateEngageLabel();

    // If auto is already checked (e.g., via HTML/devtools), start scheduling
    if (els.autoToggle?.checked) scheduleNext();
})();
