async function fetchStatusData() {
    try {
        const [statusRes, factsRes] = await Promise.all([
            fetch('http://localhost:8081/auction_items.json', {
                cache: 'no-store',
                mode: 'cors',
                headers: {
                    'Accept': 'application/json'
                }
            }),
            fetch('auction-facts.json', { cache: 'no-store' })
        ]);
        if (!statusRes.ok) throw new Error('Network response was not ok (auction_items.json from localhost:8081)');
        if (!factsRes.ok) throw new Error('Network response was not ok (auction-facts.json)');
        const statusData = await statusRes.json();
        const factsData = await factsRes.json();
        statusData.auction_facts = factsData;
        return statusData;
    } catch (error) {
        console.error('Error fetching status or facts data:', error);
        return null;
    }
}

// Countdown timer logic (single global interval)
let countdownIntervalId = null;
function updateCountdownTimer() {
    const el = document.getElementById('countdown-timer');
    if (!el) return;
    if (!window._auctionEndDateTime) {
        el.textContent = '--:--:--';
        return;
    }
    const end = new Date(window._auctionEndDateTime);
    const now = new Date();
    let diff = Math.max(0, end - now);
    const hours = Math.floor(diff / 1000 / 60 / 60);
    const mins = Math.floor((diff / 1000 / 60) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    const ms = Math.floor((diff % 1000) / 100);
    // Show ms under 5 min
    if (diff <= 5 * 60 * 1000) {
        el.textContent = `${hours.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}.${ms}`;
    } else {
        el.textContent = `${hours.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
    }
    if (diff <= 0) {
        el.textContent = '00:00:00';
        triggerCelebration();
    }
}

function ensureCountdownInterval() {
    if (countdownIntervalId !== null) return;
    countdownIntervalId = setInterval(updateCountdownTimer, 100);
}

// Animate the total counter
let lastTotal = 0;
let lastCelebratedK = 0;
let askMeModeActive = false;
let lastAskMeTotal = null;
let lastAskMeConfig = null;
let latestAuctionConfig = null;
const askMeConfettiColors = ['#ffd700', '#ff6b6b', '#4dd0e1', '#81c784', '#ba68c8', '#fff59d'];

const API_BASE = (location.origin.includes('localhost') || location.hostname === '127.0.0.1') ? 'http://localhost:8090' : '';
const INCENTIVE_DISPLAY_DURATION = 10000;
const INCENTIVE_MET_DISPLAY_DURATION = 5000;
const INCENTIVE_FADE_DURATION = 260;
const incentiveState = {
    list: [],
    mode: 'scroller',
    queue: [],
    queueIndex: 0,
    timerId: null,
    current: null,
    options: {},
    totalRaised: 0,
    handledDisplayNow: new Set(),
    pendingClears: new Set(),
    celebrations: [],
    celebrationActive: false,
    celebrationTimerId: null,
    celebratedIds: new Set(),
    pendingQueueStart: null,
    celebrationStageTimeouts: [],
    displayUntilMetMap: new Map(),
    metDisplayTimerId: null,
    celebrationPhase: 'idle',
    metSnapshot: new Map(),
    incentivesInitialized: false,
    fadeOutTimerId: null,
    fadeTransitionHandler: null
};

function parseCurrencyValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^0-9.\-]/g, '');
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function formatCurrency(amount) {
    const value = Number.isFinite(amount) ? amount : 0;
    return `$${Math.round(value).toLocaleString()}`;
}

function renderAskMeMessage(message) {
    const el = document.getElementById('ask-me-message');
    if (!el) return;
    const content = (message && message.trim().length) ? message : 'Ask us about our featured cause!';
    if (window.marked) {
        const parsed = window.marked.parse(content, { breaks: true, gfm: true });
    const allowedTags = ['p', 'em', 'strong', 'ul', 'ol', 'li', 'a', 'br', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];
    const allowedAttrs = ['href', 'title', 'target', 'rel', 'align', 'colspan', 'rowspan', 'scope'];
        const sanitized = window.DOMPurify
            ? window.DOMPurify.sanitize(parsed, { ALLOWED_TAGS: allowedTags, ALLOWED_ATTR: allowedAttrs })
            : parsed;
        el.innerHTML = sanitized;
        el.querySelectorAll('a').forEach(link => {
            if (!link.getAttribute('target')) link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        });
    } else {
        el.innerHTML = '';
        content.split(/\r?\n/).forEach((line, index) => {
            if (index > 0) {
                el.appendChild(document.createElement('br'));
            }
            el.appendChild(document.createTextNode(line));
        });
    }
}

function spawnAskMeConfetti(container) {
    for (let i = 0; i < 18; i++) {
        const piece = document.createElement('span');
        piece.className = 'ask-me-confetti';
        const angle = (Math.random() * Math.PI * 2);
        const distance = 120 + Math.random() * 120;
        piece.style.setProperty('--confetti-x', `${Math.cos(angle) * distance}px`);
        piece.style.setProperty('--confetti-y', `${Math.sin(angle) * distance}px`);
        piece.style.left = '50%';
        piece.style.top = '45%';
        piece.style.background = askMeConfettiColors[i % askMeConfettiColors.length];
        container.appendChild(piece);
        setTimeout(() => piece.remove(), 1900);
    }
}

function animateAskMeDelta(delta) {
    const container = document.getElementById('ask-me-delta-container');
    if (!container || delta === 0) return;
    const changeEl = document.createElement('div');
    changeEl.className = 'ask-me-delta';
    const prefix = delta >= 0 ? '+' : '-';
    const amount = Math.abs(Math.round(delta)).toLocaleString();
    changeEl.textContent = `${prefix}$${amount}`;
    container.appendChild(changeEl);
    spawnAskMeConfetti(container);
    setTimeout(() => changeEl.remove(), 2500);
}

function showAskMeThankYou() {
    const existing = document.querySelector('.ask-me-thankyou');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'ask-me-thankyou';
    el.textContent = 'Thank you!';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
}

function applyAskMeMode(config) {
    const overlay = document.getElementById('ask-me-overlay');
    const totalEl = document.getElementById('ask-me-total');
    const titleEl = document.getElementById('ask-me-title');
    if (!overlay || !totalEl) return;

    const enabled = Boolean(config?.askMeMode);
    const title = (config?.askMeTitle && config.askMeTitle.trim().length) ? config.askMeTitle.trim() : 'Ask Me Spotlight';
    const message = config?.askMeMessage ?? '';
    const numericTotal = Number.isFinite(Number(config?.askMeTotal)) ? Number(config.askMeTotal) : 0;
    const wasActive = askMeModeActive;

    if (enabled) {
        document.body.classList.add('ask-me-mode');
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        if (titleEl) titleEl.textContent = title;
        renderAskMeMessage(message);
        totalEl.textContent = formatCurrency(numericTotal);

        if (wasActive && lastAskMeTotal !== null && numericTotal !== lastAskMeTotal) {
            const delta = numericTotal - lastAskMeTotal;
            if (delta !== 0) animateAskMeDelta(delta);
        }

        if (!wasActive) {
            // First activation should not animate a delta; establish baseline.
            lastAskMeTotal = numericTotal;
        } else {
            lastAskMeTotal = numericTotal;
        }
        askMeModeActive = true;
    } else {
        if (askMeModeActive) {
            document.body.classList.remove('ask-me-mode');
            showAskMeThankYou();
        }
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        if (titleEl) titleEl.textContent = title;
        askMeModeActive = false;
        lastAskMeTotal = numericTotal;
    }

    lastAskMeConfig = {
        askMeMode: enabled,
        askMeTitle: title,
        askMeMessage: message,
        askMeTotal: numericTotal
    };
}

function animateTotal(targetStr) {
    const el = document.getElementById('total-animated');
    if (!el) return;
    // Remove non-numeric chars for animation
    const target = parseFloat(targetStr.replace(/[^\d.]/g, ''));
    const duration = 1200;
    const start = lastTotal;
    const startTime = performance.now();
    function animate(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const value = start + (target - start) * progress;
        el.textContent = `$${Math.floor(value).toLocaleString()}`;
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Celebrate every $1000 milestone
            const k = Math.floor(target / 1000);
            if (k > lastCelebratedK) {
                lastCelebratedK = k;
                triggerScrollerCelebration(k * 1000);
            }
            lastTotal = target;
        }
    }

    requestAnimationFrame(animate);
}

function triggerScrollerCelebration(amount) {
    const bar = document.querySelector('.bottom-bar');
    const scroller = document.getElementById('scroller-wrapper');
    if (!bar || !scroller) return;
    // Add a celebration class for animation
    bar.classList.add('scroller-celebrate');
    // Optionally, show a message overlay
    let msg = document.createElement('div');
    msg.className = 'scroller-celebrate-msg';
    msg.textContent = `🎉 Milestone: $${amount.toLocaleString()} raised! 🎉`;
    bar.appendChild(msg);
    // Remove the class and message when the animation ends for a seamless exit
    msg.addEventListener('animationend', () => {
        bar.classList.remove('scroller-celebrate');
        msg.remove();
    }, { once: true });
}

// Seamless, continuous bottom scroller with in-place value updates
let lastScrollerItems = [];
let scrollerAnimId = null;
let scrollerPos = 0;
let scrollerSpeed = 1.2; // px per frame
function updateScroller(items) {
    const scroller = document.getElementById('scroller-content');
    const scrollerDup = document.getElementById('scroller-content-dup');
    const wrapper = document.getElementById('scroller-wrapper');
    if (!scroller || !scrollerDup || !wrapper) return;

    // Compare items by title, update only changed prices in-place
    if (lastScrollerItems.length === items.length && lastScrollerItems.every((old, i) => old.title === items[i].title)) {
        // Only update changed prices
        const spans = scroller.querySelectorAll('span[data-title]');
        spans.forEach((span, i) => {
            if (items[i] && span.dataset.price !== items[i].price) {
                span.querySelector('.scroller-price').textContent = items[i].price;
                span.dataset.price = items[i].price;
            }
        });
        // Duplicate for seamless scroll
        scrollerDup.innerHTML = scroller.innerHTML;
    } else {
        // Rebuild content if items changed
        let content = '';
        items.forEach(item => {
            content += `<span data-title="${item.title}" data-price="${item.price}" style=\"margin-right: 3rem;\">
                <strong>${item.title}</strong> &mdash; <span class=\"scroller-price\" style=\"color:#ffd700;\">${item.price}</span>
            </span>`;
        });
        scroller.innerHTML = content;
        scrollerDup.innerHTML = content;
        lastScrollerItems = items.map(i => ({ title: i.title, price: i.price }));
        // Do not reset scrollerPos
    }
    // Start animation if not already running
    if (!scrollerAnimId && incentiveState.mode === 'scroller') {
        resumeScroller();
    }
}

function animateScroller() {
    const wrapper = document.getElementById('scroller-wrapper');
    const scroller = document.getElementById('scroller-content');
    if (!wrapper || !scroller) return;
    const contentWidth = scroller.offsetWidth;
    if (contentWidth <= 0) {
        scrollerAnimId = requestAnimationFrame(animateScroller);
        return;
    }
    scrollerPos -= scrollerSpeed;
    if (Math.abs(scrollerPos) >= contentWidth) {
        scrollerPos = 0;
        handleScrollerCycleComplete();
    }
    wrapper.style.transform = `translateX(${scrollerPos}px)`;
    scrollerAnimId = requestAnimationFrame(animateScroller);
}

function pauseScroller() {
    if (scrollerAnimId) {
        cancelAnimationFrame(scrollerAnimId);
        scrollerAnimId = null;
    }
}

function resumeScroller() {
    if (!scrollerAnimId) {
        scrollerAnimId = requestAnimationFrame(animateScroller);
    }
}

function handleScrollerCycleComplete() {
    if (incentiveState.mode === 'scroller') {
        processIncentiveSignals('cycle');
    }
}

function showIncentiveContainer() {
    const incentiveEl = document.getElementById('incentive-display');
    if (!incentiveEl) return;
    if (incentiveState.fadeTransitionHandler) {
        incentiveEl.removeEventListener('transitionend', incentiveState.fadeTransitionHandler);
        incentiveState.fadeTransitionHandler = null;
    }
    if (incentiveState.fadeOutTimerId) {
        clearTimeout(incentiveState.fadeOutTimerId);
        incentiveState.fadeOutTimerId = null;
    }
    const alreadyVisible = !incentiveEl.hidden && incentiveEl.classList.contains('is-visible');
    incentiveEl.hidden = false;
    incentiveEl.classList.remove('is-exiting');
    if (alreadyVisible) {
        return;
    }
    incentiveEl.classList.remove('is-visible');
    requestAnimationFrame(() => {
        incentiveEl.classList.add('is-visible');
    });
}

function hideIncentiveContainer(onComplete) {
    const incentiveEl = document.getElementById('incentive-display');
    if (!incentiveEl) {
        if (typeof onComplete === 'function') onComplete();
        return;
    }
    if (incentiveState.fadeTransitionHandler) {
        incentiveEl.removeEventListener('transitionend', incentiveState.fadeTransitionHandler);
        incentiveState.fadeTransitionHandler = null;
    }
    if (incentiveState.fadeOutTimerId) {
        clearTimeout(incentiveState.fadeOutTimerId);
        incentiveState.fadeOutTimerId = null;
    }
    if (incentiveEl.hidden || !incentiveEl.classList.contains('is-visible')) {
        incentiveEl.hidden = true;
        incentiveEl.classList.remove('is-visible');
        incentiveEl.classList.remove('is-exiting');
        if (typeof onComplete === 'function') onComplete();
        return;
    }
    incentiveEl.classList.remove('is-visible');
    incentiveEl.classList.add('is-exiting');

    const finish = () => {
        if (incentiveState.fadeTransitionHandler) {
            incentiveEl.removeEventListener('transitionend', incentiveState.fadeTransitionHandler);
            incentiveState.fadeTransitionHandler = null;
        }
        if (incentiveState.fadeOutTimerId) {
            clearTimeout(incentiveState.fadeOutTimerId);
            incentiveState.fadeOutTimerId = null;
        }
        incentiveEl.hidden = true;
        incentiveEl.classList.remove('is-exiting');
        if (typeof onComplete === 'function') onComplete();
    };

    const transitionHandler = event => {
        if (event.target !== incentiveEl) return;
        finish();
    };
    incentiveState.fadeTransitionHandler = transitionHandler;
    incentiveEl.addEventListener('transitionend', transitionHandler);
    incentiveState.fadeOutTimerId = setTimeout(finish, INCENTIVE_FADE_DURATION + 80);
}

function setBottomBarMode(mode) {
    const scrollerEl = document.querySelector('.bottom-scroller');
    const celebrationEl = document.getElementById('incentive-celebration');
    if (!scrollerEl || !celebrationEl) return;

    if (mode === 'celebration') {
        scrollerEl.classList.add('hidden');
        celebrationEl.hidden = false;
        hideIncentiveContainer();
        pauseScroller();
        incentiveState.celebrationPhase = 'overlay';
        return;
    }

    celebrationEl.hidden = true;

    if (mode === 'incentive') {
        if (incentiveState.celebrationActive && incentiveState.celebrationPhase !== 'progress') {
            return;
        }
        scrollerEl.classList.add('hidden');
        showIncentiveContainer();
        pauseScroller();
    } else {
        if (incentiveState.celebrationActive) {
            return;
        }
        hideIncentiveContainer(() => {
            scrollerEl.classList.remove('hidden');
            resumeScroller();
        });
    }
}

function renderIncentiveCard(incentive, totalRaised, { animate = true, overrideRaised, overrideGoal } = {}) {
    const wrapper = document.getElementById('incentive-progress-container');
    if (!wrapper || !incentive) return;
    const cardId = incentive.id || 'incentive';
    const goal = Number.isFinite(overrideGoal) ? overrideGoal : (Number.isFinite(incentive.target) ? incentive.target : 0);
    const raisedValue = Number.isFinite(overrideRaised) ? overrideRaised : totalRaised;
    const rawProgress = goal > 0 ? (raisedValue / goal) * 100 : 100;
    const progress = Math.max(0, Math.min(rawProgress, 100));
    let labelPercent;
    if (goal > 0 && raisedValue < goal) {
        const cappedForLabel = Math.max(0, Math.min(rawProgress, 99.999));
        labelPercent = Math.floor(cappedForLabel);
    } else {
        labelPercent = Math.max(0, Math.round(progress));
    }
    const percentLabel = `${Math.min(999, labelPercent)}%`;
    if (!wrapper.firstElementChild || wrapper.firstElementChild.dataset.incentiveId !== cardId) {
        wrapper.innerHTML = `
          <div class="incentive-card" data-incentive-id="${cardId}">
                        <span class="incentive-tag">Incentive</span>
                        <div class="incentive-info">
                            <span class="incentive-name" data-incentive-name></span>
                            <span class="incentive-target" data-incentive-target></span>
                        </div>
                        <div class="incentive-progress-track">
                            <div class="incentive-progress-fill" data-progress-fill style="width:0%;"></div>
                            <div class="incentive-progress-inner">
                                <span class="incentive-progress-percent" data-progress-percent>${percentLabel}</span>
                            </div>
                        </div>
          </div>`;
    }
    const card = wrapper.firstElementChild;
    card.dataset.incentiveId = cardId;
    const progressValue = Math.round(progress * 1000) / 1000;
    const nameText = (incentive.name || 'Incentive').trim() || 'Incentive';
    const targetText = goal > 0 ? `${formatCurrency(raisedValue)} / ${formatCurrency(goal)}` : formatCurrency(raisedValue);
    const nameEl = card.querySelector('[data-incentive-name]');
    if (nameEl) nameEl.textContent = nameText;
    const targetEl = card.querySelector('[data-incentive-target]');
    if (targetEl) targetEl.textContent = targetText;
    const percentEl = card.querySelector('[data-progress-percent]');
    if (percentEl) percentEl.textContent = percentLabel;
    const fill = card.querySelector('[data-progress-fill]');
    if (!fill) return;
    const previousProgress = card.dataset.progressValue;
    const shouldAnimate = Boolean(animate && progress > 0);
    if (!shouldAnimate) {
        const original = fill.style.transition;
        fill.style.transition = 'none';
        fill.style.width = `${progress}%`;
        requestAnimationFrame(() => {
            fill.style.transition = original || '';
        });
    } else {
        const original = fill.style.transition;
        fill.style.transition = 'none';
        fill.style.width = '0%';
        requestAnimationFrame(() => {
            fill.style.transition = original || '';
            requestAnimationFrame(() => {
                fill.style.width = `${progress}%`;
            });
        });
    }
    card.dataset.progressValue = progressValue.toString();
}

function queueIncentiveCelebration(item, totalRaised) {
    if (!item || !item.id) return;
    const safeName = (item.name || 'Incentive').trim() || 'Incentive';
    const numericTarget = Number.isFinite(item.target) ? item.target : 0;
    const numericTotal = Number.isFinite(totalRaised) ? totalRaised : 0;
    const finalAmount = Math.max(numericTarget, numericTotal);
    if (incentiveState.celebratedIds.has(item.id)) return;
    incentiveState.celebratedIds.add(item.id);
    incentiveState.celebrations.push({
        id: item.id,
        name: safeName,
        amount: finalAmount,
        goal: item.target
    });
    if (!incentiveState.celebrationActive) {
        playNextIncentiveCelebration();
    }
}

function resetCelebrationStages() {
    const celebrationEl = document.getElementById('incentive-celebration');
    if (!celebrationEl) return;
    const stages = celebrationEl.querySelectorAll('.celebration-stage');
    stages.forEach(stage => stage.classList.remove('visible'));
}

function playNextIncentiveCelebration() {
    if (incentiveState.celebrationTimerId) {
        clearTimeout(incentiveState.celebrationTimerId);
        incentiveState.celebrationTimerId = null;
    }
    incentiveState.celebrationStageTimeouts.forEach(clearTimeout);
    incentiveState.celebrationStageTimeouts = [];
    if (incentiveState.metDisplayTimerId) {
        clearTimeout(incentiveState.metDisplayTimerId);
        incentiveState.metDisplayTimerId = null;
    }
    resetCelebrationStages();
    if (!incentiveState.celebrations.length) {
        incentiveState.celebrationActive = false;
        incentiveState.celebrationPhase = 'idle';
        const pendingQueue = incentiveState.pendingQueueStart;
        incentiveState.pendingQueueStart = null;
        if (pendingQueue && incentiveState.queue.length) {
            setBottomBarMode('incentive');
            showCurrentIncentive(true);
        } else {
            setBottomBarMode('scroller');
            processIncentiveSignals();
        }
        return;
    }
    incentiveState.celebrationActive = true;
    incentiveState.celebrationPhase = 'progress';
    const payload = incentiveState.celebrations.shift();
    showMetIncentiveProgress(payload);
}

function showIncentiveCelebration(payload) {
    if (!payload) return;
    incentiveState.celebrationPhase = 'overlay';
    if (incentiveState.metDisplayTimerId) {
        clearTimeout(incentiveState.metDisplayTimerId);
        incentiveState.metDisplayTimerId = null;
    }
    const celebrationEl = document.getElementById('incentive-celebration');
    if (!celebrationEl) return;
    const nameEl = celebrationEl.querySelector('[data-celebration-name]');
    if (nameEl) nameEl.textContent = payload.name;
    const amountEl = celebrationEl.querySelector('[data-celebration-amount]');
    if (amountEl) amountEl.textContent = formatCurrency(payload.amount);

    const messageStage = celebrationEl.querySelector('.celebration-stage-message');
    const detailStage = celebrationEl.querySelector('.celebration-stage-detail');

    resetCelebrationStages();
    setBottomBarMode('celebration');

    // Force reflow so subsequent class additions animate
    void celebrationEl.offsetWidth;

    if (messageStage) {
        messageStage.classList.add('visible');
    }

    const stageTimers = [];
    const schedule = (fn, delay) => {
        const id = setTimeout(fn, delay);
        stageTimers.push(id);
    };

    schedule(() => {
        if (messageStage) {
            messageStage.classList.remove('visible');
        }
        if (detailStage) {
            detailStage.classList.add('visible');
        }
    }, 4500);

    schedule(() => {
        if (detailStage) {
            detailStage.classList.remove('visible');
        }
    }, 9500);

    incentiveState.celebrationStageTimeouts = stageTimers;

    incentiveState.celebrationTimerId = setTimeout(() => {
        playNextIncentiveCelebration();
    }, 10000);
}

function showMetIncentiveProgress(payload) {
    if (incentiveState.timerId) {
        clearTimeout(incentiveState.timerId);
        incentiveState.timerId = null;
    }
    incentiveState.current = null;
    const wrapper = document.getElementById('incentive-progress-container');
    if (wrapper) {
        wrapper.innerHTML = '';
    }
    const listMatch = incentiveState.list.find(entry => entry.id === payload.id);
    const goal = Number.isFinite(payload.goal) && payload.goal > 0 ? payload.goal : (listMatch?.target ?? 0);
    const fallbackRaised = Number.isFinite(payload.amount) && payload.amount > 0 ? payload.amount : 0;
    const raised = Math.max(fallbackRaised, incentiveState.totalRaised, goal);
    const incentive = listMatch || {
        id: payload.id,
        name: payload.name,
        target: goal,
        active: true
    };
    setBottomBarMode('incentive');
    renderIncentiveCard(incentive, incentiveState.totalRaised, {
        animate: true,
        overrideRaised: raised,
        overrideGoal: goal
    });
    incentiveState.celebrationPhase = 'progress';
    incentiveState.metDisplayTimerId = setTimeout(() => {
        showIncentiveCelebration(payload);
    }, INCENTIVE_MET_DISPLAY_DURATION);
}

function startIncentiveQueue(items, mode, options = {}) {
    const ids = (items || []).map(item => item && item.id).filter(Boolean);
    if (!ids.length) return;
    clearTimeout(incentiveState.timerId);
    incentiveState.timerId = null;
    incentiveState.queue = ids;
    incentiveState.queueIndex = 0;
    incentiveState.mode = mode;
    incentiveState.options = { duration: options.duration || INCENTIVE_DISPLAY_DURATION };
    if (incentiveState.celebrationActive) {
        incentiveState.pendingQueueStart = true;
        return;
    }
    incentiveState.pendingQueueStart = null;
    setBottomBarMode('incentive');
    showCurrentIncentive(true);
}

function showCurrentIncentive(animate) {
    if (!incentiveState.queue.length || incentiveState.queueIndex >= incentiveState.queue.length) {
        completeIncentiveQueue();
        return;
    }
    const id = incentiveState.queue[incentiveState.queueIndex];
    const incentive = incentiveState.list.find(entry => entry.id === id);
    if (!incentive) {
        incentiveState.queueIndex += 1;
        showCurrentIncentive(animate);
        return;
    }
    incentiveState.current = incentive;
    renderIncentiveCard(incentive, incentiveState.totalRaised, { animate });
    clearTimeout(incentiveState.timerId);
    incentiveState.timerId = setTimeout(() => {
        incentiveState.queueIndex += 1;
        showCurrentIncentive(true);
    }, incentiveState.options.duration);
}

function completeIncentiveQueue() {
    clearTimeout(incentiveState.timerId);
    incentiveState.timerId = null;
    const previousMode = incentiveState.mode;
    incentiveState.queue = [];
    incentiveState.queueIndex = 0;
    incentiveState.current = null;
    if (previousMode === 'until') {
        const unmet = incentiveState.list.filter(item => item.displayUntilMet && item.target > incentiveState.totalRaised);
        if (unmet.length) {
            startIncentiveQueue(unmet, 'until', { duration: INCENTIVE_DISPLAY_DURATION });
            return;
        }
    }
    incentiveState.mode = 'scroller';
    if (!incentiveState.celebrationActive) {
        setBottomBarMode('scroller');
    }
    processIncentiveSignals();
}

function processIncentiveSignals(reason) {
    if (incentiveState.celebrationActive) {
        return;
    }
    const list = incentiveState.list;
    if (!Array.isArray(list) || !list.length) {
        if (reason === 'cycle' && incentiveState.mode === 'scroller') {
            setBottomBarMode('scroller');
        }
        return;
    }

    const displayNowCandidates = list.filter(item => item.displayNow && !incentiveState.handledDisplayNow.has(item.id));
    if (displayNowCandidates.length) {
        displayNowCandidates.forEach(item => incentiveState.handledDisplayNow.add(item.id));
        if (incentiveState.mode === 'priority' && incentiveState.queue.length) {
            displayNowCandidates.forEach(item => {
                if (!incentiveState.queue.includes(item.id)) {
                    incentiveState.queue.push(item.id);
                }
            });
        } else {
            startIncentiveQueue(displayNowCandidates, 'priority', { duration: INCENTIVE_DISPLAY_DURATION });
        }
        displayNowCandidates.forEach(item => clearIncentiveFlags(item.id, { displayNow: false }));
        return;
    }

    const unmetUntil = list.filter(item => item.displayUntilMet && item.target > incentiveState.totalRaised);
    if (unmetUntil.length) {
        if (incentiveState.mode !== 'until') {
            startIncentiveQueue(unmetUntil, 'until', { duration: INCENTIVE_DISPLAY_DURATION });
        } else {
            incentiveState.queue = unmetUntil.map(item => item.id);
            if (incentiveState.queueIndex >= incentiveState.queue.length) {
                incentiveState.queueIndex = 0;
            }
        }
        return;
    }

    if (incentiveState.mode !== 'scroller') {
        return;
    }

    if (reason === 'cycle') {
        const activeIncentives = list.filter(item => item.active && (item.name || '').trim().length);
        if (activeIncentives.length) {
            startIncentiveQueue(activeIncentives, 'cycle', { duration: INCENTIVE_DISPLAY_DURATION });
        }
    }
}

async function clearIncentiveFlags(id, updates) {
    if (!id || !updates) return;
    const key = `${id}:${Object.keys(updates).sort().join(',')}`;
    if (incentiveState.pendingClears.has(key)) return;
    incentiveState.pendingClears.add(key);
    try {
        await fetch(`${API_BASE}/api/incentives/${id}/state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
    } catch (err) {
        console.warn('Failed to update incentive state', err);
    } finally {
        incentiveState.pendingClears.delete(key);
    }
}

function updateIncentiveDisplay(configList, totalRaised) {
    const previousTotal = Number.isFinite(incentiveState.totalRaised) ? incentiveState.totalRaised : 0;
    const currentTotal = Number.isFinite(totalRaised) ? totalRaised : 0;
    incentiveState.totalRaised = currentTotal;
    if (!(incentiveState.metSnapshot instanceof Map)) {
        incentiveState.metSnapshot = new Map();
    }
    const metStatus = incentiveState.metSnapshot;
    const wasInitialized = incentiveState.incentivesInitialized === true;
    const normalized = Array.isArray(configList) ? configList.map(item => ({
        id: item.id,
        name: typeof item.name === 'string' ? item.name : '',
        target: Number.isFinite(Number(item.target)) ? Number(item.target) : 0,
        active: Boolean(item.active),
        displayNow: Boolean(item.displayNow),
        displayUntilMet: Boolean(item.displayUntilMet)
    })) : [];
    const untilMap = new Map(incentiveState.displayUntilMetMap);
    const presentIds = new Set();
    if (!normalized.length) {
        metStatus.clear();
        untilMap.forEach((meta, id) => {
            if (meta && meta.target > 0 && meta.target <= incentiveState.totalRaised) {
                queueIncentiveCelebration({
                    id,
                    name: meta.name,
                    target: meta.target
                }, incentiveState.totalRaised);
                untilMap.delete(id);
            }
        });
        incentiveState.list = [];
        incentiveState.handledDisplayNow.clear();
        incentiveState.displayUntilMetMap = untilMap;
        incentiveState.incentivesInitialized = true;
        if (incentiveState.mode !== 'scroller') {
            clearTimeout(incentiveState.timerId);
            incentiveState.timerId = null;
            incentiveState.queue = [];
            incentiveState.queueIndex = 0;
            incentiveState.current = null;
            incentiveState.mode = 'scroller';
            if (!incentiveState.celebrationActive) {
                setBottomBarMode('scroller');
            }
        }
        return;
    }
    incentiveState.list = normalized;

    const flaggedDisplayNowIds = new Set(normalized.filter(item => item.displayNow).map(item => item.id));
    Array.from(incentiveState.handledDisplayNow).forEach(id => {
        if (!flaggedDisplayNowIds.has(id)) {
            incentiveState.handledDisplayNow.delete(id);
        }
    });

    normalized.forEach(item => {
        if (!item || !item.id) {
            return;
        }
        const trimmedName = (item.name || 'Incentive').trim() || 'Incentive';
        presentIds.add(item.id);
        const goal = item.target;
        const seenBefore = metStatus.has(item.id);
        const prevMet = metStatus.get(item.id);
        const isMet = Boolean(item.active) && goal > 0 && currentTotal >= goal;
        metStatus.set(item.id, isMet);

        if (goal > currentTotal) {
            incentiveState.celebratedIds.delete(item.id);
        }

        const crossedDuringRun = isMet && previousTotal < goal && currentTotal >= goal;
        const metTransition = (seenBefore && !prevMet && isMet) || (!seenBefore && wasInitialized && crossedDuringRun);

        if (metTransition && !incentiveState.celebratedIds.has(item.id)) {
            queueIncentiveCelebration({
                id: item.id,
                name: trimmedName,
                target: goal
            }, incentiveState.totalRaised);
        }

        if (item.displayUntilMet) {
            untilMap.set(item.id, {
                name: trimmedName,
                target: goal
            });
        } else if (goal > incentiveState.totalRaised) {
            untilMap.delete(item.id);
        }

        const meta = untilMap.get(item.id);
        const targetForCheck = meta?.target && meta.target > 0 ? meta.target : goal;
        const shouldCelebrate = Boolean(meta) && targetForCheck > 0 && targetForCheck <= incentiveState.totalRaised;
        if (shouldCelebrate) {
            queueIncentiveCelebration({
                id: item.id,
                name: meta.name || trimmedName,
                target: targetForCheck
            }, incentiveState.totalRaised);
            clearIncentiveFlags(item.id, { displayUntilMet: false });
            untilMap.delete(item.id);
        }
    });
    untilMap.forEach((meta, id) => {
        if (!presentIds.has(id) && meta && meta.target > 0 && meta.target <= incentiveState.totalRaised) {
            queueIncentiveCelebration({
                id,
                name: meta.name,
                target: meta.target
            }, incentiveState.totalRaised);
            untilMap.delete(id);
        }
    });
    Array.from(metStatus.keys()).forEach(id => {
        if (!presentIds.has(id)) {
            metStatus.delete(id);
            incentiveState.celebratedIds.delete(id);
        }
    });
    incentiveState.displayUntilMetMap = untilMap;
    incentiveState.incentivesInitialized = true;

    const remainingUntil = normalized.filter(item => item.displayUntilMet && item.target > incentiveState.totalRaised);
    if (!remainingUntil.length && incentiveState.mode === 'until') {
        completeIncentiveQueue();
        return;
    }

    if (incentiveState.current) {
        const current = normalized.find(entry => entry.id === incentiveState.current.id);
        if (current) {
            incentiveState.current = current;
            renderIncentiveCard(current, incentiveState.totalRaised, { animate: false });
        } else {
            incentiveState.current = null;
        }
    }

    if (incentiveState.mode === 'cycle') {
        const activeList = normalized.filter(item => item.active && (item.name || '').trim().length);
        if (activeList.length) {
            incentiveState.queue = activeList.map(item => item.id);
            if (incentiveState.queueIndex >= incentiveState.queue.length) {
                incentiveState.queueIndex = 0;
            }
        } else {
            incentiveState.queue = [];
            completeIncentiveQueue();
            return;
        }
    }

    processIncentiveSignals();
}

// Rotating featured items (no/low bids)

let rotatingIndex = 0;
let rotatingItems = [];
let lastRotatingItemsKey = '';
let rotatingTimer = null;

function getItemsKey(items) {
    // Create a simple key to detect changes in the featured items list
    return items.map(i => i.title + '|' + i.price + '|' + i.value + '|' + i.bids).join('||');
}

function updateRotatingItem(force) {
    const el = document.getElementById('rotating-item');
    if (!el || rotatingItems.length === 0) return;
    // Show 6 items (2 rows of 3)
    const items = [];
        for (let i = 0; i < 6; i++) {
        items.push(rotatingItems[(rotatingIndex + i) % rotatingItems.length]);
    }
    const newKey = getItemsKey(items);
        if (!el.dataset.itemKey || force || el.dataset.itemKey !== newKey) {
            el.classList.add('fade');
            setTimeout(() => {
                el.innerHTML = `<div class="featured-items-row">
                    ${items.map(item => `
                        <div class="featured-item-card">
                            <img class="rotating-img" src="${item.picture_url}" alt="${item.title}" />
                            <div class="item-title">${item.title}</div>
                            <div class="item-price">${item.price}</div>
                            ${item.value ? `<div class="item-value">Value: ${item.value}</div>` : ''}
                            ${item.bids ? `<div class="item-bids">Bids: ${item.bids}</div>` : '<div class="item-bids" style="color:#ff6666;">No Bids</div>'}
                        </div>
                    `).join('')}
                </div>`;
                el.classList.remove('fade');
                // Trigger fade-in animation
                const row = el.querySelector('.featured-items-row');
                if (row) {
                    row.style.opacity = '0';
                    row.style.animation = 'featuredFadeIn 0.4s cubic-bezier(0.4,0,0.2,1) forwards';
                }
                el.style.opacity = '1';
                el.dataset.itemKey = newKey;
            }, 400);
    }
}

function startRotatingTimer() {
    if (rotatingTimer) return; // Only start if not already running
    rotatingTimer = setInterval(() => {
        if (rotatingItems.length === 0) return;
        rotatingIndex = (rotatingIndex + 6) % rotatingItems.length;
        updateRotatingItem();
    }, 15000);
}

// Sponsors logo rotator
let sponsors = [];
let sponsorIndex = 0;
let sponsorTimer = null;
function showSponsorLogo(idx, fade) {
    const box = document.getElementById('sponsors-logos');
    if (!box || sponsors.length === 0) return;
    box.innerHTML = '';
    // Always keep the yellow background visible
    const bg = document.createElement('div');
    bg.className = 'sponsor-logo-wrapper';
    bg.style.background = '#eaf6ff';
    bg.style.display = 'flex';
    bg.style.alignItems = 'center';
    bg.style.justifyContent = 'center';
    bg.style.height = '200px';
    bg.style.width = '75%';
    bg.style.margin = '0 auto';
    bg.style.borderRadius = '12px';
    bg.style.position = 'relative';
    box.appendChild(bg);

    const s = sponsors[idx % sponsors.length];
    let content;
    if (s.logo_url) {
        content = document.createElement('img');
        content.src = s.logo_url;
        content.alt = s.name;
        content.title = s.name;
        content.style.maxHeight = '120px';
        content.style.maxWidth = '90%';
        content.style.objectFit = 'contain';
        content.style.background = 'transparent';
        content.style.display = 'block';
        content.style.margin = '0 auto';
    } else {
        content = document.createElement('span');
        content.textContent = s.name;
        content.style.fontSize = '2rem';
        content.style.fontWeight = 'bold';
        content.style.color = '#23284a';
        content.style.textAlign = 'center';
        content.style.width = '100%';
    }
    content.style.transition = 'opacity 0.5s';
    content.style.opacity = '1';
    bg.appendChild(content);

    if (fade) {
        setTimeout(() => {
            content.style.opacity = '0';
            setTimeout(() => {
                sponsorIndex = (sponsorIndex + 1) % sponsors.length;
                showSponsorLogo(sponsorIndex, true);
            }, 500);
        }, 5500);
    }
}

async function loadSponsors() {
    try {
        const res = await fetch('sponsors.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load sponsors.json');
        sponsors = await res.json();
        sponsorIndex = 0;
        showSponsorLogo(sponsorIndex, true);
    } catch (e) {
        // fallback: show nothing
        const box = document.getElementById('sponsors-logos');
        if (box) box.innerHTML = '';
    }
}

function updateBoard(data) {
    if (!data) return;

    // Header title from auction name (if present)
    if (data.auction_facts && data.auction_facts.auctionName) {
        const headerTitle = document.getElementById('header-title');
        if (headerTitle) headerTitle.textContent = data.auction_facts.auctionName;
    }
    // Announcements
    if (Array.isArray(data.auction_facts?.announcements)) {
        const ul = document.getElementById('announcements-list');
        if (ul) {
            ul.innerHTML = '';
            data.auction_facts.announcements.forEach(text => {
                const li = document.createElement('li');
                li.textContent = text;
                ul.appendChild(li);
            });
        }
    }

    // Countdown timer
    if (data.auction_facts && data.auction_facts.endDateTime) {
        window._auctionEndDateTime = data.auction_facts.endDateTime;
        updateCountdownTimer();
        ensureCountdownInterval();
    }

    // Meta info
    let meta = document.getElementById('meta-info');
    if (meta) {
        meta.innerHTML =
            `<span>Last updated: ${data.refreshed_at ? new Date(data.refreshed_at).toLocaleString() : 'N/A'}</span> | ` +
            `<a href="${data.url}" target="_blank" style="color:#ffd700;">View Auction</a>`;
    }

    // Animate total
    animateTotal(data.total_raised);
    const numericTotalRaised = parseCurrencyValue(data.total_raised);
    updateIncentiveDisplay(data.auction_facts?.incentives, numericTotalRaised);
    updateScroller(data.items);

    // If celebration overlay is active, update the total
    const overlay = document.getElementById('celebration-overlay');
    if (overlay && overlay.classList.contains('active')) {
        const totalEl = document.getElementById('celebration-total');
        if (totalEl) {
            let total = data.total_raised;
            if (typeof total === 'string') {
                total = parseFloat(total.replace(/[^\d.]/g, ''));
            }
            if (isNaN(total)) total = 0;
            totalEl.textContent = `$${Math.floor(total).toLocaleString()}`;
        }
    }

    // Featured items: only those with value not null
    const newRotatingItems = data.items.filter(item => {
        const hasValue = item.value !== null && item.value !== undefined;
        const bidCount = typeof item.bids === 'number' ? item.bids : parseInt(item.bids, 10);
        return hasValue && bidCount >= 0 && bidCount <= 2;
    });
    let fallback = false;
    if (newRotatingItems.length === 0) {
        fallback = true;
    }
    const itemsToUse = fallback ? data.items : newRotatingItems;
    const newKey = getItemsKey(itemsToUse);
    if (newKey !== lastRotatingItemsKey) {
        // Try to keep the same item in view if possible
        let currentItem = rotatingItems[rotatingIndex % (rotatingItems.length || 1)];
        rotatingItems = itemsToUse;
        lastRotatingItemsKey = newKey;
        // Find index of currentItem in new list
        let idx = 0;
        if (currentItem) {
            idx = rotatingItems.findIndex(i => getItemsKey([i]) === getItemsKey([currentItem]));
            if (idx === -1) idx = 0;
        }
        rotatingIndex = idx;
        updateRotatingItem(true);
        if (rotatingTimer) {
            clearInterval(rotatingTimer);
            rotatingTimer = null;
        }
        startRotatingTimer();
    } else {
        // No change in items
    }
}

async function refreshBoard() {
    const data = await fetchStatusData();
    // Pull latest auction settings from API if available
    let askMeConfig = null;
    try {
        const res = await fetch(`${API_BASE}/api/auction`, { cache: 'no-store' });
        if (res.ok) {
            const auctionCfg = await res.json();
            latestAuctionConfig = auctionCfg;
            if (data) {
                data.auction_facts = data.auction_facts || {};
                if (auctionCfg.name) data.auction_facts.auctionName = auctionCfg.name;
                if (auctionCfg.endDateTime) data.auction_facts.endDateTime = auctionCfg.endDateTime;
                if (Array.isArray(auctionCfg.announcements)) data.auction_facts.announcements = auctionCfg.announcements;
                if (Array.isArray(auctionCfg.incentives)) data.auction_facts.incentives = auctionCfg.incentives;
            }
            askMeConfig = auctionCfg;
        }
    } catch (_) { /* ignore if API not available */ }
    updateBoard(data);
    if (!data && latestAuctionConfig) {
        updateIncentiveDisplay(latestAuctionConfig.incentives, incentiveState.totalRaised);
    }
    if (askMeConfig) {
        applyAskMeMode(askMeConfig);
    } else if (lastAskMeConfig) {
        applyAskMeMode(lastAskMeConfig);
    }
}

// Initial load
refreshBoard();
// Load sponsors on page load
loadSponsors();
// Poll every 5 seconds
setInterval(refreshBoard, 5000);

// Celebration overlay + fireworks
let celebrationStarted = false;
function triggerCelebration() {
    if (celebrationStarted) return;
    celebrationStarted = true;
    // Stop countdown updates; we're done
    if (countdownIntervalId !== null) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
    }
    const overlay = document.getElementById('celebration-overlay');
    const totalEl = document.getElementById('celebration-total');
    if (overlay) {
        if (totalEl) {
            const totalText = document.getElementById('total-animated')?.textContent || '$0';
            totalEl.textContent = totalText;
        }
        overlay.classList.add('active');
        document.body.classList.add('celebration-active');
        // loop a few small bursts
        let bursts = 0;
        const maxBursts = 5;
        const burstInterval = setInterval(() => {
            launchConfettiBurst(60 + Math.floor(Math.random()*40)); // 60-100 pieces per burst
            bursts++;
            if (bursts >= maxBursts) {
                clearInterval(burstInterval);
            }
        }, 900);
        // initial burst asap
        launchConfettiBurst(80);
    }
}

function launchConfettiBurst(countOverride) {
    const container = document.getElementById('confetti');
    if (!container) return;
    // Clear any previous pieces
    // Keep existing pieces; they'll auto-clean via timeout
    const colors = ['#ffd700', '#ff6b6b', '#4dd0e1', '#81c784', '#ba68c8', '#fff59d'];
    const count = countOverride ?? 180;
    for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        const size = 6 + Math.random() * 10;
        piece.style.width = `${Math.max(6, size)}px`;
        piece.style.height = `${Math.max(10, size * 1.4)}px`;
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = colors[i % colors.length];
        const duration = 2.4 + Math.random() * 2.2; // 2.4s - 4.6s
        const delay = Math.random() * 0.8;
        const rotate = (Math.random() * 720 - 360).toFixed(0);
        piece.style.animationDuration = `${duration}s, ${duration * 0.9}s, ${duration}s`;
        piece.style.animationDelay = `${delay}s, ${delay/2}s, ${delay}s`;
        piece.style.transform = `rotate(${rotate}deg)`;
        container.appendChild(piece);
    }
    // auto-clean after longest animation
    setTimeout(() => { container.innerHTML = ''; }, 8000);
}
