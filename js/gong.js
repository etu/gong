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
    const button = document.getElementById('gong-button');
    const volume = document.getElementById('volume');
    const tone = document.getElementById('tone');
    const dampen = document.getElementById('dampen');

    function readSettings() {
        return { volume: Number(volume.value), tone: Number(tone.value), dampen: Number(dampen.value) };
    }

    button.addEventListener('click', () => playGong(readSettings()));

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
})();
