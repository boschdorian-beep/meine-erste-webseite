// --- GLOBAL STATE & UI ELEMENTS ---
let appState = 'IDLE'; // 'IDLE', 'OPTIMIZING', 'PAUSED', 'META_OPTIMIZING'
let allDatasets = {}; // { 'filename.tsv': { raw: [...], features: [...], trainingFeatures: [...], validationFeatures: [...], benchmarkDailyReturn: X } }
let performanceChart = null;
let detailChart = null;
let workerPool = []; 
let optimizerState = { runCount: 0, sortColumn: 'robustnessRatio', sortDirection: 'desc', learningIntervalId: null };
let optimizerResultsCache = {}; 
let optimizerConstraints = {};
let robustnessResultsCache = {};
let metaOptimizerState = { isRunning: false, timeoutId: null, results: [] };

const parameterConfig = {
    patternLength: { label: 'Muster-Länge', min: 1, max: 5, value: 1, step: 1, unit: '' },
    holdingPeriod: { label: 'Haltedauer', min: 1, max: 5, value: 1, step: 1, unit: '' },
    lookback: { label: 'Lookback Period', min: 10, max: 500, value: 100, step: 1, unit: '' },
    tolerance: { label: 'Ähnlichkeit', min: 0, max: 5, value: 1, step: 1, unit: '' },
    minOccurrences: { label: 'Min. Vorkommen', min: 1, max: 100, value: 5, step: 1, unit: '' },
    maxOccurrences: { label: 'Max. Vorkommen', min: 1, max: 100, value: 50, step: 1, unit: '' },
};

// NEU: Konfiguration für die Gewichtung des Robustheits-Ratios
const ratioWeightsConfig = {
    annualReturn: { label: 'Jahresrendite', value: 20 },
    avgDailyTradeReturn: { label: 'Rendite/Tag', value: 20 },
    winRate: { label: 'Trefferquote', value: 20 },
    maxDrawdown: { label: 'Max. Drawdown', value: 20 },
    longestDrawdownDuration: { label: 'Max. DDauer', value: 20 }
};

// This is now hidden but still needed for the simulation logic
const filterConfig = {
    filterEnabled: { label: 'Filter aktiv', type: 'toggle', value: false },
    filterTradeLookback: { label: 'Anzahl Trades', min: 1, max: 20, value: 5, step: 1, unit: '' },
    filterMinPerformance: { label: 'Min. Perf./Tag', min: -1.0, max: 2.0, value: 0.1, step: 0.1, unit: '%' }
};

const ui = { 
    fileInput: document.getElementById('tsv-upload'), fileNameEl: document.getElementById('file-name'), 
    startBtn: document.getElementById('start-btn'), resetBtn: document.getElementById('reset-btn'), 
    strategyLogicSelect: document.getElementById('strategy-logic'), 
    addFactorBtn: document.getElementById('add-factor-btn'), factorContainer: document.getElementById('factor-container'),
    parameterContainer: document.getElementById('parameter-container'),
    filterContainer: document.getElementById('filter-container'),
    ratioWeightsContainer: document.getElementById('ratio-weights-container'),
    analysisTitle: document.getElementById('analysis-title'),
    tradeCountEl: document.getElementById('trade-count'), annualReturnEl: document.getElementById('annual-return'),
    robustnessRatioEl: document.getElementById('robustness-ratio'),
    maxDdDurationEl: document.getElementById('max-dd-duration'),
    maxDrawdownEl: document.getElementById('max-drawdown'),
    winRateEl: document.getElementById('win-rate'),
    startOptimizerBtn: document.getElementById('start-optimizer-btn'), 
    pauseOptimizerBtn: document.getElementById('pause-optimizer-btn'),
    stopOptimizerBtn: document.getElementById('stop-optimizer-btn'),
    clearOptimizerBtn: document.getElementById('clear-optimizer-btn'),
    optimizerInterval: document.getElementById('optimizer-interval'),
    optimizerStatus: document.getElementById('optimizer-status'), optimizerConstraints: document.getElementById('optimizer-constraints'),
    optimizerResults: document.getElementById('optimizer-results'), resultsHeader: document.getElementById('results-header'),
    optimizerSortCriteria: document.getElementById('optimizer-sort-criteria'),
    robustnessCheckPanel: document.getElementById('robustness-check-panel'),
    trainingDataSelect: document.getElementById('training-data-select'),
    runRobustnessCheckBtn: document.getElementById('run-robustness-check-btn'),
    robustnessResults: document.getElementById('robustness-results'),
    // Meta Optimizer UI
    startMetaOptimizerBtn: document.getElementById('start-meta-optimizer-btn'),
    metaTradesMin: document.getElementById('meta-trades-min'),
    metaTradesMax: document.getElementById('meta-trades-max'),
    metaTradesStep: document.getElementById('meta-trades-step'),
    metaPerfMin: document.getElementById('meta-perf-min'),
    metaPerfMax: document.getElementById('meta-perf-max'),
    metaPerfStep: document.getElementById('meta-perf-step'),
    metaCombinationsCount: document.getElementById('meta-combinations-count'),
    metaOptimizerSplit: document.getElementById('meta-optimizer-split'),
    metaOptimizerDuration: document.getElementById('meta-optimizer-duration'),
    metaOptimizerLearningEnabled: document.getElementById('meta-optimizer-learning-enabled'),
    metaOptimizerStatus: document.getElementById('meta-optimizer-status'),
    metaOptimizerResults: document.getElementById('meta-optimizer-results'),
    metaRankAnalysisSection: document.getElementById('meta-rank-analysis-section'),
    metaRankAnalysisDays: document.getElementById('meta-rank-analysis-days'),
    metaRankAnalysisPerf: document.getElementById('meta-rank-analysis-perf'),
    // Weights Analysis
    weightsAnalysisSection: document.getElementById('weights-analysis-section'),
    weightsAnalysisRuns: document.getElementById('weights-analysis-runs'),
    startWeightsAnalysisBtn: document.getElementById('start-weights-analysis-btn'),
    weightsAnalysisStatus: document.getElementById('weights-analysis-status'),
    weightsAnalysisResults: document.getElementById('weights-analysis-results'),
    // Meta Detail Modal
    metaDetailModal: document.getElementById('meta-detail-modal'),
    closeMetaDetailModalBtn: document.getElementById('close-meta-detail-modal'),
    metaDetailTitle: document.getElementById('meta-detail-title'),
    metaDetailContent: document.getElementById('meta-detail-content')
};

// --- UI INITIALIZATION & EVENT LISTENERS ---
function createParameterRow(key, config, container) {
    const template = document.getElementById('parameter-template');
    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('.parameter-row');
    
    row.querySelector('label').textContent = config.label;
    const slider = row.querySelector('input');
    const valueDisplay = row.querySelector('.value-display');
    const lockBtn = row.querySelector('.lock-btn');

    slider.name = key;
    slider.min = config.min;
    slider.max = config.max;
    slider.value = config.value;
    slider.step = config.step;
    valueDisplay.textContent = parseFloat(config.value).toFixed(config.step < 1 ? 1 : 0) + config.unit;
    
    slider.addEventListener('input', () => {
        valueDisplay.textContent = parseFloat(slider.value).toFixed(config.step < 1 ? 1 : 0) + config.unit;
    });

    if (config.type === 'toggle') {
        slider.style.display = 'none';
        valueDisplay.style.display = 'none';
    }

    lockBtn.addEventListener('click', () => {
        const isLocked = lockBtn.classList.toggle('locked');
        slider.dataset.locked = isLocked ? 'true' : 'false';
        slider.disabled = isLocked;
        if(config.type === 'toggle') {
            slider.value = isLocked ? '1' : '0';
        }
        lockBtn.querySelector('svg').innerHTML = isLocked ?
            '<path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>' :
            '<path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/>';
    });
    container.appendChild(row);
}

function initializeParameters() {
    ui.parameterContainer.innerHTML = '';
    Object.keys(parameterConfig).forEach(key => createParameterRow(key, parameterConfig[key], ui.parameterContainer));
    
    // Initialize weight sliders
    ui.ratioWeightsContainer.innerHTML = '';
    Object.keys(ratioWeightsConfig).forEach(key => {
        const config = ratioWeightsConfig[key];
        const template = document.getElementById('weight-slider-template');
        const clone = template.content.cloneNode(true);
        const row = clone.querySelector('div');
        
        row.querySelector('label').textContent = config.label;
        const slider = row.querySelector('input');
        const valueDisplay = row.querySelector('.value-display');

        slider.name = key;
        slider.value = config.value;
        valueDisplay.textContent = slider.value + '%';
        slider.addEventListener('input', () => {
            valueDisplay.textContent = slider.value + '%';
        });
        ui.ratioWeightsContainer.appendChild(row);
    });
}

ui.addFactorBtn.addEventListener('click', () => addFactorRow());
ui.fileInput.addEventListener('change', handleFileUpload);
ui.startBtn.addEventListener('click', startManualSimulation);
ui.resetBtn.addEventListener('click', () => setAppState('IDLE'));
ui.startOptimizerBtn.addEventListener('click', handleStartOptimizer);
ui.pauseOptimizerBtn.addEventListener('click', handlePauseOptimizer);
ui.stopOptimizerBtn.addEventListener('click', () => setAppState('IDLE'));
ui.optimizerResults.addEventListener('click', handleOptimizerResultClick);
ui.resultsHeader.addEventListener('click', handleHeaderClick);
ui.clearOptimizerBtn.addEventListener('click', handleClearResults);
ui.optimizerSortCriteria.addEventListener('change', handleSortCriteriaChange);
ui.trainingDataSelect.addEventListener('change', handleTrainingDataChange);
ui.runRobustnessCheckBtn.addEventListener('click', runRobustnessCheck);

// Meta Optimizer listeners
[ui.metaTradesMin, ui.metaTradesMax, ui.metaTradesStep, ui.metaPerfMin, ui.metaPerfMax, ui.metaPerfStep].forEach(el => {
    el.addEventListener('input', updateMetaCombinationsCount);
});
ui.startMetaOptimizerBtn.addEventListener('click', handleStartMetaOptimizer);
ui.startWeightsAnalysisBtn.addEventListener('click', startWeightsAnalysis);
ui.closeMetaDetailModalBtn.addEventListener('click', () => ui.metaDetailModal.classList.add('hidden'));
ui.metaOptimizerResults.addEventListener('click', (e) => {
    if (e.target.matches('.view-meta-details-btn')) {
        const ruleName = e.target.dataset.ruleName;
        openMetaDetailModal(ruleName);
    }
});

function addFactorRow(factorKey = 'change', weight = 100) {
    const factorRow = document.createElement('div');
    factorRow.className = 'factor-row grid grid-cols-12 gap-2 items-center';
    factorRow.innerHTML = `
        <div class="col-span-5">
            <select class="factor-select w-full p-2 text-sm rounded-lg text-white">
                <option value="change" ${factorKey === 'change' ? 'selected' : ''}>Kursänderung</option>
                <option value="volumeChange" ${factorKey === 'volumeChange' ? 'selected' : ''}>Volumenänderung</option>
                <option value="absoluteVolume" ${factorKey === 'absoluteVolume' ? 'selected' : ''}>Absolutes Volumen</option>
                <option value="closePos" ${factorKey === 'closePos' ? 'selected' : ''}>Schlussposition</option>
                <option value="upperStrength" ${factorKey === 'upperStrength' ? 'selected' : ''}>Stärke nach Oben</option>
                <option value="lowerStrength" ${factorKey === 'lowerStrength' ? 'selected' : ''}>Stärke nach Unten</option>
            </select>
        </div>
        <div class="col-span-5 flex items-center gap-2">
            <input type="range" class="factor-weight w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider-thumb" min="0" max="100" value="${weight}">
            <span class="factor-weight-value font-bold text-white w-14 text-center">${weight}%</span>
        </div>
        <button class="lock-btn col-span-1" title="Faktor für Optimierer sperren/entsperren">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                 <path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/>
            </svg>
        </button>
        <button class="remove-factor-btn col-span-1 text-red-400 hover:text-red-600 font-bold text-xl">&times;</button>
    `;
    const weightSlider = factorRow.querySelector('.factor-weight');
    const weightValue = factorRow.querySelector('.factor-weight-value');
    const lockBtn = factorRow.querySelector('.lock-btn');

    weightSlider.addEventListener('input', () => { weightValue.textContent = `${weightSlider.value}%`; });
    factorRow.querySelector('.remove-factor-btn').addEventListener('click', () => { factorRow.remove(); });
    lockBtn.addEventListener('click', () => {
        const isLocked = lockBtn.classList.toggle('locked');
        factorRow.dataset.locked = isLocked ? 'true' : 'false';
        factorRow.querySelector('.factor-select').disabled = isLocked;
        factorRow.querySelector('.factor-weight').disabled = isLocked;
        lockBtn.querySelector('svg').innerHTML = isLocked ?
            '<path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>' :
            '<path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/>';
    });

    ui.factorContainer.appendChild(factorRow);
}

// DATA HANDLING & UTILITIES
async function handleFileUpload(event) {
    if (appState !== 'IDLE') return;
    const files = event.target.files;
    if (!files.length) return;
    
    ui.fileNameEl.textContent = `${files.length} Datei(en) ausgewählt`;
    allDatasets = {};
    
    const promises = Array.from(files).map(file => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const parsedData = parseTSV(e.target.result);
                    allDatasets[file.name] = { raw: parsedData, features: null };
                    resolve();
                } catch (error) {
                    reject(new Error(`Fehler in Datei ${file.name}: ${error.message}`));
                }
            };
            reader.onerror = () => reject(new Error(`Fehler beim Lesen von ${file.name}`));
            reader.readAsText(file);
        });
    });

    try {
        await Promise.all(promises);
        ui.robustnessCheckPanel.classList.remove('hidden');
        updateTrainingDataSelect();
        handleTrainingDataChange();
    } catch (error) {
        alert(error.message);
    }
}

function updateTrainingDataSelect() {
    ui.trainingDataSelect.innerHTML = '';
    Object.keys(allDatasets).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        ui.trainingDataSelect.appendChild(option);
    });
}

function handleTrainingDataChange() {
    if (appState !== 'IDLE') return;
    const selectedFile = ui.trainingDataSelect.value;
    if (!selectedFile) return;

    prepareAllData(selectedFile);
    clearOptimizerResults();
    setAppState('IDLE', true); // Force UI update
}

function parseTSV(tsv) {
    const lines = tsv.trim().split('\n').slice(1), data = [];
    lines.forEach(line => {
        const values = line.trim().split('\t'); if (values.length < 6) return;
        try {
            const dateStr = values[0]; const parts = dateStr.match(/(\d+)/g); if (!parts || parts.length < 3) return;
            const [d, m, y] = parts.map(p => parseInt(p, 10)); const date = new Date(Date.UTC(y < 100 ? 2000 + y : y, m - 1, d));
            const parseValue = (val) => val && val.trim() !== "" ? parseFloat(val.trim().replace(/\./g, '').replace(',', '.')) : NaN;
            const row = { date, open: parseValue(values[1]), high: parseValue(values[2]), low: parseValue(values[3]), close: parseValue(values[4]), volume: parseValue(values[5]) };
            if (Object.values(row).every(v => v instanceof Date || !isNaN(v))) data.push(row);
        } catch (e) { console.error("Fehler beim Parsen der Zeile:", line, e); }
    });
    if (data.length === 0) throw new Error('Keine gültigen Datenzeilen.');
    return data.sort((a, b) => a.date - b.date);
}

function prepareAllData(fileName) {
    const dataset = allDatasets[fileName];
    if (!dataset || !dataset.raw || dataset.raw.length === 0) return;

    dataset.features = dataset.raw.map((row, i, arr) => {
        if (i === 0) return { ...row };
        const prev = arr[i - 1];
        return { 
            ...row, 
            change: (row.close - prev.close) / prev.close * 100, 
            closePos: (row.high - row.low) > 0 ? (row.close - row.low) / (row.high - row.low) : 0.5,
            volumeChange: prev.volume > 0 ? (row.volume - prev.volume) / prev.volume * 100 : 0, 
            absoluteVolume: row.volume,
            upperStrength: (row.high - prev.close) / prev.close * 100, 
            lowerStrength: (row.low - prev.close) / prev.close * 100,
        };
    }).slice(1);
    
    dataset.features.forEach((f, index) => f.index = index);
}

function finalizeFeatures(features, calculateBins = true, binsToApply = null) {
    const finalFeatures = features.map((row, i, arr) => {
        const futureReturns = {};
        for(let hp = 1; hp <= 5; hp++) {
            futureReturns[hp] = (i + hp < arr.length) ? (arr[i + hp].close - row.close) / row.close * 100 : 0;
        }
        return { ...row, futureReturns };
    });

    let bins = binsToApply;
    if (calculateBins) {
        bins = {};
        const allMetrics = ['change', 'closePos', 'volumeChange', 'absoluteVolume', 'upperStrength', 'lowerStrength'];
        allMetrics.forEach(metric => {
            bins[metric] = qcut(finalFeatures.map(d => d[metric]), 10);
        });
    }

    const rankedFeatures = finalFeatures.map(d => ({
        ...d,
        changeRank: getRank(d.change, bins.change),
        closePosRank: getRank(d.closePos, bins.closePos),
        volumeChangeRank: getRank(d.volumeChange, bins.volumeChange),
        absoluteVolumeRank: getRank(d.absoluteVolume, bins.absoluteVolume),
        upperStrengthRank: getRank(d.upperStrength, bins.upperStrength),
        lowerStrengthRank: getRank(d.lowerStrength, bins.lowerStrength)
    }));
    
    return { processedFeatures: rankedFeatures, bins: bins };
}


function getQuantile(sorted, p) { const pos=(sorted.length-1)*p,b=Math.floor(pos),r=pos-b; return sorted[b+1]!==undefined?sorted[b]+r*(sorted[b+1]-sorted[b]):sorted[b];}
function qcut(values, bins) { const unique=Array.from(new Set(values.filter(isFinite))).sort((a,b)=>a-b); if(unique.length<bins)return[]; const res=[]; for(let i=1;i<bins;i++){res.push(getQuantile(unique,i/bins));} return res; }
function getRank(val, bins) { let r=0; if(!bins||bins.length===0) return 5; while(r<bins.length && val>bins[r]){r++;} return r; }
const formatDate = (date) => date.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });

// --- Eingebetteter Worker-Code ---
const workerCode = `
    let featureData = null; // Store features globally in worker

    // --- UTILITIES (copied from main script) ---
    function calculateCAGR(startValue, endValue, startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (!start || !end || !isFinite(start) || !isFinite(end)) return 0;
        const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        if (years <= 0) return 0;
        return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
    }

    function getRobustnessRatio(kpis, weights) {
         // 1. Normalize KPIs to a 0-1 score
        const annualReturnScore = Math.max(0, kpis.annualReturn / 100); // Normalized against 100% annual return
        const avgDailyReturnScore = Math.max(0, kpis.avgDailyTradeReturn / 0.5); // Normalized against 0.5% daily return
        const winRateScore = kpis.winRate / 100;
        const maxDrawdownScore = 1 - kpis.maxDrawdown; // Inverted
        const longestDrawdownDurationScore = 1 - Math.min(1, (kpis.longestDrawdownDuration / 365.25) / 5); // Inverted, normalized against 5 years

        // 2. Calculate weighted sum
        const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
        if (totalWeight === 0) return 0;

        let weightedSum = 0;
        weightedSum += annualReturnScore * weights.annualReturn;
        weightedSum += avgDailyReturnScore * weights.avgDailyTradeReturn;
        weightedSum += winRateScore * weights.winRate;
        weightedSum += maxDrawdownScore * weights.maxDrawdown;
        weightedSum += longestDrawdownDurationScore * weights.longestDrawdownDuration;

        return (weightedSum / totalWeight) * 100; // Return as a score out of 100
    }

    function calculateFinalKPIs(portfolio, finalValue, startDate, endDate, holdingPeriod, maxDrawdown, longestDrawdownDurationInDays, weights) {
        const annualReturn = calculateCAGR(10000, finalValue, startDate, endDate);
        let completedTrades = 0, winningTrades = 0, totalReturnPct = 0;
        const completedTradeLog = [];

        for (let i = 0; i < portfolio.tradeLog.length - 1; i++) {
            if (portfolio.tradeLog[i].action === 'BUY' && portfolio.tradeLog[i+1].action === 'SELL') {
                const buyTrade = portfolio.tradeLog[i];
                const sellTrade = portfolio.tradeLog[i+1];
                if(buyTrade.price > 0) {
                    const tradeReturn = (sellTrade.price - buyTrade.price) / buyTrade.price; 
                    totalReturnPct += tradeReturn;
                    if (tradeReturn > 0) winningTrades++; 
                    completedTrades++;
                    completedTradeLog.push({
                        buyDate: buyTrade.date, buyPrice: buyTrade.price,
                        sellDate: sellTrade.date, sellPrice: sellTrade.price,
                        returnPct: tradeReturn * 100,
                        filterSignals: buyTrade.filterSignals || []
                    });
                }
                i++;
            }
        }
        const winRate = completedTrades > 0 ? (winningTrades / completedTrades) * 100 : 0;
        const avgTradeReturn = completedTrades > 0 ? (totalReturnPct / completedTrades) * 100 : 0;
        const avgDailyTradeReturn = completedTrades > 0 ? avgTradeReturn / holdingPeriod : 0;

        const kpis = { annualReturn, tradeCount: completedTrades, winRate, avgTradeReturn, avgDailyTradeReturn, finalValue, maxDrawdown, longestDrawdownDuration: longestDrawdownDurationInDays };
        
        kpis.robustnessRatio = getRobustnessRatio(kpis, weights);

        return { kpis, completedTradeLog };
    }


    // --- HEADLESS SIMULATION (The heavy lifting function) ---
    function runHeadlessSimulation(settings, features) {
        const processedFeatures = features.map(f => ({ ...f, date: new Date(f.date) }));
        const { lookback, tolerance, patternLength, holdingPeriod, factors, minOccurrences, maxOccurrences, strategy, filterEnabled, filterTradeLookback, filterMinPerformance, ratioWeights } = settings;
        if (!processedFeatures || processedFeatures.length <= lookback) return null;
        
        const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
        const normalizedFactors = factors.map(f => ({ rankName: \`\${f.key}Rank\`, weight: totalWeight > 0 ? f.weight / totalWeight : 1 / factors.length }));
        
        let portfolio = { cash: 10000, shares: 0, tradeLog: [] };
        const performanceData = [{ date: processedFeatures[0].date.getTime(), value: 10000 }];
        const theoreticalSignalLog = [];
        
        // Correctly initialize peak values at the start of the simulation period
        let peakValue = 10000;
        let peakDate = processedFeatures[lookback]?.date || processedFeatures[0].date;
        let longestDrawdownDurationInDays = 0;
        let maxDrawdown = 0;

        for (let i = lookback; i < processedFeatures.length; i++) {
            const today = processedFeatures[i];
            
            const lastTrade = portfolio.tradeLog[portfolio.tradeLog.length -1];
            if (portfolio.shares > 0 && lastTrade?.action === 'BUY') {
                if ((today.date.getTime() - lastTrade.date) / (1000*60*60*24) >= holdingPeriod) {
                    portfolio.cash = portfolio.shares * today.close; portfolio.shares = 0;
                    portfolio.tradeLog.push({ date: today.date.getTime(), action: 'SELL', price: today.close });
                }
            }

            if (portfolio.shares === 0 && i < processedFeatures.length - holdingPeriod) {
                const currentPatternWindow = processedFeatures.slice(i - patternLength, i);
                const similarDayOutcomes = [];
                for (let j = 0; j <= i - lookback - patternLength; j++) {
                    const histWindow = processedFeatures.slice(j, j + patternLength);
                    let totalDist = 0;
                    for (let k = 0; k < patternLength; k++) {
                        let dayDist = 0;
                        normalizedFactors.forEach(f => {
                           dayDist += Math.abs(histWindow[k][f.rankName] - currentPatternWindow[k][f.rankName]) * f.weight;
                        });
                        totalDist += dayDist;
                    }
                    if ((totalDist / patternLength) <= tolerance / (factors.length || 1)) {
                        similarDayOutcomes.push(processedFeatures[j + patternLength - 1].futureReturns[holdingPeriod]);
                    }
                }
                
                const avgReturn = similarDayOutcomes.length > 0 ? similarDayOutcomes.reduce((a, b) => a + b, 0) / similarDayOutcomes.length : 0;
                
                if (similarDayOutcomes.length >= minOccurrences && similarDayOutcomes.length <= maxOccurrences) {
                    let isSignalValid = (strategy === 'trend' && avgReturn > 0) || (strategy === 'reversion' && avgReturn < 0);
                    if (isSignalValid) {
                        const signal = { signalDayIndex: i, holdingPeriod: holdingPeriod };
                        theoreticalSignalLog.push(signal);
                        
                        let executeTrade = true;
                        if(filterEnabled && theoreticalSignalLog.length > filterTradeLookback) {
                            // Important: We check against signals that occurred *before* the current day 'i'.
                            const recentSignals = theoreticalSignalLog.slice(-filterTradeLookback -1, -1);
                            const completedSignals = recentSignals.filter(s => i >= s.signalDayIndex + s.holdingPeriod);
                            
                            if(completedSignals.length > 0) {
                                const dailyReturns = completedSignals.map(s => processedFeatures[s.signalDayIndex].futureReturns[s.holdingPeriod] / s.holdingPeriod);
                                const avgDailyReturn = dailyReturns.reduce((a,b) => a+b, 0) / dailyReturns.length;
                                if (avgDailyReturn < filterMinPerformance) executeTrade = false;
                            } else {
                                executeTrade = false; // Not enough completed trades to form an opinion
                            }
                        }

                        if (executeTrade && portfolio.cash > today.open) {
                            portfolio.shares = portfolio.cash / today.open; portfolio.cash = 0;
                            portfolio.tradeLog.push({ date: today.date.getTime(), action: 'BUY', price: today.open });
                        }
                    }
                }
            }
            const currentValue = portfolio.cash + portfolio.shares * today.close;
            performanceData.push({ date: today.date.getTime(), value: currentValue });

            if (currentValue > peakValue) {
                peakValue = currentValue;
                peakDate = today.date;
            } else {
                const currentDrawdownDuration = (today.date.getTime() - peakDate.getTime()) / (1000 * 60 * 60 * 24);
                if(currentDrawdownDuration > longestDrawdownDurationInDays) {
                    longestDrawdownDurationInDays = currentDrawdownDuration;
                }
            }
            const drawdown = (peakValue - currentValue) / peakValue;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }
        const lastPrice = processedFeatures.length > 0 ? processedFeatures[processedFeatures.length - 1].close : 0;
        const finalValue = portfolio.cash + portfolio.shares * lastPrice;
        
        const startDateTimestamp = processedFeatures[lookback]?.date.getTime() || processedFeatures[0].date.getTime();
        const endDateTimestamp = processedFeatures[processedFeatures.length - 1]?.date.getTime();

        const {kpis, completedTradeLog} = calculateFinalKPIs(portfolio, finalValue, startDateTimestamp, endDateTimestamp, holdingPeriod, maxDrawdown, longestDrawdownDurationInDays, ratioWeights);
        
        const serializableCompletedTradeLog = completedTradeLog.map(trade => ({...trade, buyDate: trade.buyDate, sellDate: trade.sellDate}));

        return { kpis, performanceData, completedTradeLog: serializableCompletedTradeLog };
    }

    self.onmessage = function(e) {
        const { type, settings, features } = e.data;
         if (type === 'init') {
            featureData = features;
            return;
        }
        if (type === 'run' && featureData) {
            const fullResult = runHeadlessSimulation(settings, featureData);
             self.postMessage({ settings: settings, fullResult: fullResult });
        }
    };
`;

// --- MAIN THREAD SIMULATION LOGIC (for validation) ---
function local_calculateCAGR(startValue, endValue, startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const years = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (years <= 0) return 0;
    return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

function getRobustnessRatio(kpis, weights) {
     // 1. Normalize KPIs to a 0-1 score
    const annualReturnScore = Math.max(0, kpis.annualReturn / 100); // Normalized against 100% annual return
    const avgDailyReturnScore = Math.max(0, kpis.avgDailyTradeReturn / 0.5); // Normalized against 0.5% daily return
    const winRateScore = kpis.winRate / 100;
    const maxDrawdownScore = 1 - kpis.maxDrawdown; // Inverted
    const longestDrawdownDurationScore = 1 - Math.min(1, (kpis.longestDrawdownDuration / 365.25) / 5); // Inverted, normalized against 5 years

    // 2. Calculate weighted sum
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    if (totalWeight === 0) return 0;

    let weightedSum = 0;
    weightedSum += annualReturnScore * weights.annualReturn;
    weightedSum += avgDailyReturnScore * weights.avgDailyTradeReturn;
    weightedSum += winRateScore * weights.winRate;
    weightedSum += maxDrawdownScore * weights.maxDrawdown;
    weightedSum += longestDrawdownDurationScore * weights.longestDrawdownDuration;

    return (weightedSum / totalWeight) * 100; // Return as a score out of 100
}

// This function is a 1:1 copy of the worker's KPI calculation to ensure consistency
function local_calculateFinalKPIs(portfolio, finalValue, startDate, endDate, holdingPeriod, maxDrawdown, longestDrawdownDurationInDays, weights) {
    const annualReturn = local_calculateCAGR(10000, finalValue, startDate, endDate);
    let completedTrades = 0, winningTrades = 0, totalReturnPct = 0;
    
    for (let i = 0; i < portfolio.tradeLog.length - 1; i++) {
        if (portfolio.tradeLog[i].action === 'BUY' && portfolio.tradeLog[i+1].action === 'SELL') {
            const buyTrade = portfolio.tradeLog[i];
            const sellTrade = portfolio.tradeLog[i+1];
            if(buyTrade.price > 0) {
                const tradeReturn = (sellTrade.price - buyTrade.price) / buyTrade.price; 
                totalReturnPct += tradeReturn;
                if (tradeReturn > 0) winningTrades++; 
                completedTrades++;
            }
            i++;
        }
    }
    const winRate = completedTrades > 0 ? (winningTrades / completedTrades) * 100 : 0;
    const avgTradeReturn = completedTrades > 0 ? (totalReturnPct / completedTrades) * 100 : 0;
    const avgDailyTradeReturn = completedTrades > 0 ? avgTradeReturn / holdingPeriod : 0;

    const kpis = { annualReturn, tradeCount: completedTrades, winRate, avgTradeReturn, avgDailyTradeReturn, finalValue, maxDrawdown, longestDrawdownDuration: longestDrawdownDurationInDays };
    kpis.robustnessRatio = getRobustnessRatio(kpis, weights);
    return kpis;
}

function local_runHeadlessSimulation(settings, features) {
    const { lookback, tolerance, patternLength, holdingPeriod, factors, minOccurrences, maxOccurrences, strategy, filterEnabled, filterTradeLookback, filterMinPerformance, ratioWeights } = settings;

    if (!features || features.length <= lookback) return null;
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const normalizedFactors = factors.map(f => ({ rankName: `${f.key}Rank`, weight: totalWeight > 0 ? f.weight / totalWeight : 1 / factors.length }));
    
    let portfolio = { cash: 10000, shares: 0, tradeLog: [] };
    const performanceData = [{ date: features[0].date, value: 10000 }];
    const theoreticalSignalLog = [];

    let peakValue = 10000;
    let peakDate = features[lookback]?.date || features[0].date;
    let longestDrawdownDurationInDays = 0;
    let maxDrawdown = 0;

    for (let i = lookback; i < features.length; i++) {
        const today = features[i];
        
        const lastTrade = portfolio.tradeLog[portfolio.tradeLog.length -1];
        if (portfolio.shares > 0 && lastTrade?.action === 'BUY') {
            if ((today.date.getTime() - lastTrade.date.getTime()) / (1000*60*60*24) >= holdingPeriod) {
                portfolio.cash = portfolio.shares * today.close; portfolio.shares = 0;
                portfolio.tradeLog.push({ date: today.date, action: 'SELL', price: today.close });
            }
        }

        if (portfolio.shares === 0 && i < features.length - holdingPeriod) {
            const currentPatternWindow = features.slice(i - patternLength, i);
            const similarDayOutcomes = [];
            for (let j = 0; j <= i - lookback - patternLength; j++) {
                const histWindow = features.slice(j, j + patternLength);
                let totalDist = 0;
                for (let k = 0; k < patternLength; k++) {
                    let dayDist = 0;
                    normalizedFactors.forEach(f => {
                       dayDist += Math.abs(histWindow[k][f.rankName] - currentPatternWindow[k][f.rankName]) * f.weight;
                    });
                    totalDist += dayDist;
                }
                if ((totalDist / patternLength) <= tolerance / (factors.length || 1)) {
                    similarDayOutcomes.push(features[j + patternLength - 1].futureReturns[holdingPeriod]);
                }
            }
            const avgReturn = similarDayOutcomes.length > 0 ? similarDayOutcomes.reduce((a, b) => a + b, 0) / similarDayOutcomes.length : 0;
            
            if (similarDayOutcomes.length >= minOccurrences && similarDayOutcomes.length <= maxOccurrences) {
                let isSignalValid = (strategy === 'trend' && avgReturn > 0) || (strategy === 'reversion' && avgReturn < 0);
                if (isSignalValid) {
                    const signal = { signalDayIndex: i, holdingPeriod: holdingPeriod };
                    theoreticalSignalLog.push(signal);
                    
                    let executeTrade = true;
                     if(filterEnabled && theoreticalSignalLog.length > filterTradeLookback) {
                        const recentSignals = theoreticalSignalLog.slice(-filterTradeLookback -1, -1);
                        const completedSignals = recentSignals.filter(s => i >= s.signalDayIndex + s.holdingPeriod);
                        
                        if(completedSignals.length > 0) {
                            const dailyReturns = completedSignals.map(s => features[s.signalDayIndex].futureReturns[s.holdingPeriod] / s.holdingPeriod);
                            const avgDailyReturn = dailyReturns.reduce((a,b) => a+b, 0) / dailyReturns.length;
                            if (avgDailyReturn < filterMinPerformance) executeTrade = false;
                        } else {
                            executeTrade = false; 
                        }
                    }

                    if (executeTrade && portfolio.cash > today.open) {
                        portfolio.shares = portfolio.cash / today.open; portfolio.cash = 0;
                        portfolio.tradeLog.push({ date: today.date, action: 'BUY', price: today.open });
                    }
                }
            }
        }
        const currentValue = portfolio.cash + portfolio.shares * today.close;
        performanceData.push({ date: today.date, value: currentValue });

        if (currentValue > peakValue) {
            peakValue = currentValue;
            peakDate = today.date;
        } else {
             const currentDrawdownDuration = (today.date.getTime() - peakDate.getTime()) / (1000 * 60 * 60 * 24);
            if(currentDrawdownDuration > longestDrawdownDurationInDays) {
                longestDrawdownDurationInDays = currentDrawdownDuration;
            }
        }
        const drawdown = (peakValue - currentValue) / peakValue;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    }
    const lastPrice = features.length > 0 ? features[features.length - 1].close : 0;
    const finalValue = portfolio.cash + portfolio.shares * lastPrice;
    
    const startDate = features[lookback]?.date || features[0].date;
    const endDate = features[features.length - 1]?.date;
    const kpis = local_calculateFinalKPIs(portfolio, finalValue, startDate, endDate, holdingPeriod, maxDrawdown, longestDrawdownDurationInDays, ratioWeights);
    
    return { kpis, performanceData, completedTradeLog: [] };
}

// --- STATE MANAGEMENT ---
function setAppState(newState, forceUpdate = false) {
    if (appState === newState && !forceUpdate) return;
    
    if (newState === 'IDLE') {
        stopAndResetOptimization();
    }
    appState = newState;

    const hasData = Object.keys(allDatasets).length > 0;
    const isIdle = appState === 'IDLE';
    const isRunning = appState === 'OPTIMIZING' || appState === 'META_OPTIMIZING';
    const isPaused = appState === 'PAUSED';

    // Optimizer buttons
    ui.startOptimizerBtn.disabled = !hasData || !isIdle;
    ui.pauseOptimizerBtn.disabled = !isRunning && !isPaused;
    ui.stopOptimizerBtn.disabled = !isRunning && !isPaused;
    ui.clearOptimizerBtn.disabled = !isIdle || Object.keys(optimizerResultsCache).length === 0;

    // Meta-Optimizer buttons
    ui.startMetaOptimizerBtn.disabled = !hasData || !isIdle;
    ui.startWeightsAnalysisBtn.disabled = !hasData || !isIdle;

    // Manual test buttons
    ui.startBtn.disabled = !hasData || !isIdle;
    ui.resetBtn.disabled = !hasData; // Reset should always be available if data is loaded
    
    // Other controls
    const controlsShouldBeDisabled = !isIdle || !hasData;
    document.querySelectorAll('.parameter-row input, .parameter-row button, .factor-row select, .factor-row input, .factor-row button, #strategy-logic, #optimizer-interval, #optimizer-sort-criteria, #meta-optimizer-split, #meta-optimizer-duration, #meta-optimizer-learning-enabled, .meta-rule-row input, .meta-rule-row button, #meta-trades-min, #meta-trades-max, #meta-trades-step, #meta-perf-min, #meta-perf-max, #meta-perf-step').forEach(el => {
        if (!el.classList.contains('lock-btn') && !el.classList.contains('remove-factor-btn')) {
             el.disabled = controlsShouldBeDisabled;
        }
    });
    ui.fileInput.disabled = !isIdle;

    // Update text content and specific states
    ui.pauseOptimizerBtn.textContent = isPaused ? 'Fortsetzen' : 'Pause';

    if (isIdle) {
        ui.optimizerStatus.textContent = 'Status: Gestoppt.';
        ui.metaOptimizerStatus.textContent = hasData ? 'Status: Bereit.' : 'Status: Bereit. Laden Sie Daten, um zu starten.';
        if (hasData) {
           initializeChart(ui.trainingDataSelect.value);
        }
    }

    if (isPaused) {
        ui.optimizerStatus.textContent = `Pausiert nach ${optimizerState.runCount} Tests.`;
    }
}


// --- Web Worker Initialisierung und Steuerung ---
function initializeOptimizerWorkers(features, onMessageCallback) {
    if (workerPool.length > 0) {
        workerPool.forEach(w => w.terminate());
        workerPool = [];
    }
    
    const coreCount = navigator.hardwareConcurrency || 4;
    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);

    for (let i = 0; i < coreCount; i++) {
        const worker = new Worker(workerUrl);

        const serializableFeatures = features.map(f => ({ ...f, date: f.date.getTime() }));
        worker.postMessage({ type: 'init', features: serializableFeatures });

        worker.onmessage = onMessageCallback(worker, coreCount);

        worker.onerror = function(error) {
            console.error("Fehler im Web Worker:", error.message, error);
        };
        
        workerPool.push(worker);
    }
    
    runOptimizationLoop();
}


// --- INTELLIGENTER OPTIMIERER LOGIK ---
function handleStartOptimizer() {
    if (appState !== 'IDLE') return;
    const trainingFile = ui.trainingDataSelect.value;
    const dataset = allDatasets[trainingFile];
    // Ensure data is ranked before starting
    const { processedFeatures } = finalizeFeatures(dataset.features, true);
    dataset.rankedFeatures = processedFeatures;

    setAppState('OPTIMIZING');
    startOptimization(false, true);
}

function handlePauseOptimizer() {
    if (appState === 'OPTIMIZING' || appState === 'META_OPTIMIZING') {
        setAppState('PAUSED');
    } else if (appState === 'PAUSED') {
        const wasMeta = metaOptimizerState.isRunning;
        setAppState(wasMeta ? 'META_OPTIMIZING' : 'OPTIMIZING');
        runOptimizationLoop(); 
        setupLearningCycle();
    }
}

function handleClearResults() {
    if (appState !== 'IDLE') return;
    clearOptimizerResults();
    ui.optimizerStatus.textContent = 'Status: Gestoppt. Ergebnisse gelöscht.';
}


function startOptimization(isMetaRun = false, learningEnabled = true, onCompleteCallback = null) {
    const trainingFile = ui.trainingDataSelect.value;
    const dataset = allDatasets[trainingFile];
    
    const features = isMetaRun ? dataset.trainingFeatures : (dataset.rankedFeatures || dataset.features);

    const onMessage = (worker, coreCount) => (e) => {
        if (appState === 'IDLE' || appState === 'PAUSED') return;
        const { settings, fullResult } = e.data;
        
        if (fullResult && fullResult.kpis && fullResult.kpis.tradeCount >= 1) {
            
            const TOP_N = 10;
            const rows = ui.optimizerResults.children;
            const sortKey = optimizerState.sortColumn;
            const isDesc = optimizerState.sortDirection === 'desc';
            const newValue = fullResult.kpis[sortKey] ?? -Infinity;

            let shouldAdd = false;
            if (rows.length < TOP_N) {
                shouldAdd = true;
            } else {
                const worstRow = rows[rows.length - 1]; // Table is always sorted
                const worstValue = parseFloat(worstRow.dataset[sortKey.toLowerCase()]);
                
                if (isDesc ? newValue > worstValue : newValue < worstValue) {
                    const worstResultId = worstRow.dataset.resultId;
                    delete optimizerResultsCache[worstResultId]; 
                    worstRow.remove();
                    shouldAdd = true;
                }
            }
            
            if (shouldAdd) {
                const resultId = `res-${Date.now()}-${Math.random()}`;
                fullResult.performanceData.forEach(d => d.date = new Date(d.date));
                fullResult.completedTradeLog.forEach(t => {
                    t.buyDate = new Date(t.buyDate);
                    t.sellDate = new Date(t.sellDate);
                });

                optimizerResultsCache[resultId] = { settings, ...fullResult };
                addResultToTable(resultId, fullResult.kpis);
                sortTable();
            }
            
            optimizerState.runCount++;
            const statusText = isMetaRun ? `Meta: Trainingsphase...` : `Phase ${optimizerConstraints.phase || 1}`;
            ui.optimizerStatus.textContent = `${statusText}: ${optimizerState.runCount} Tests auf ${coreCount} Kernen...`;
        }
        
        if (appState === 'OPTIMIZING' || appState === 'META_OPTIMIZING') {
            const newSettings = generateRandomSettings();
            // For meta-optimization, we search for unfiltered strategies first
            if(isMetaRun) {
                newSettings.filterEnabled = false;
            }
            worker.postMessage({ type: 'run', settings: newSettings });
        }
    };
    
    clearOptimizerResults();
    optimizerState.runCount = 0;
    optimizerConstraints = {};
    ui.optimizerConstraints.innerHTML = 'Gelernte Regeln: ';
    initializeOptimizerWorkers(features, onMessage);
    
    if (learningEnabled) {
        setupLearningCycle();
    }

    if (isMetaRun && onCompleteCallback) {
        const durationMinutes = parseFloat(ui.metaOptimizerDuration.value) || 0.2;
        metaOptimizerState.timeoutId = setTimeout(() => {
            if (appState === 'META_OPTIMIZING') {
                 onCompleteCallback();
            }
        }, durationMinutes * 60 * 1000);
    }
}

function getCurrentRatioWeights() {
    const weights = {};
    Object.keys(ratioWeightsConfig).forEach(key => {
        const slider = ui.ratioWeightsContainer.querySelector(`input[name="${key}"]`);
        weights[key] = parseInt(slider.value, 10);
    });
    return weights;
}

function runOptimizationLoop() {
     if (appState !== 'OPTIMIZING' && appState !== 'META_OPTIMIZING') return;
    
    workerPool.forEach(worker => {
        const newSettings = generateRandomSettings();
         if(metaOptimizerState.isRunning) {
            newSettings.filterEnabled = false;
        }
        worker.postMessage({ type: 'run', settings: newSettings });
    });
}

function setupLearningCycle() {
    if (optimizerState.learningIntervalId) clearInterval(optimizerState.learningIntervalId);
    const intervalMinutes = parseFloat(ui.optimizerInterval.value) || 2;
    optimizerState.learningIntervalId = setInterval(() => {
        if (appState === 'OPTIMIZING' || appState === 'META_OPTIMIZING') {
            analyzeAndRefineSearchSpace();
        }
    }, intervalMinutes * 60 * 1000);
}
    
function stopAndResetOptimization() {
    clearInterval(optimizerState.learningIntervalId);
    clearTimeout(metaOptimizerState.timeoutId);

    if (workerPool.length > 0) {
        workerPool.forEach(w => w.terminate());
        workerPool = [];
    }
    metaOptimizerState.isRunning = false;
}

function clearOptimizerResults() {
    optimizerResultsCache = {};
    ui.optimizerResults.innerHTML = '';
    optimizerConstraints = {};
    ui.optimizerConstraints.innerHTML = 'Gelernte Regeln: ';
    optimizerState.runCount = 0;
    ui.clearOptimizerBtn.disabled = true;
}

function analyzeAndRefineSearchSpace() {
    const sortedResults = Object.values(optimizerResultsCache);
    if (sortedResults.length < 5) return;
    
    [...Object.keys(parameterConfig)].forEach(key => {
        const slider = document.querySelector(`input[name="${key}"]`);
        if (slider && slider.dataset.locked === 'true') return;
        const values = sortedResults.map(r => r.settings[key]);
        const config = { ...parameterConfig }[key];
        if(config) {
            optimizerConstraints[key] = { min: Math.min(...values), max: Math.max(...values) };
        }
    });

    const factorCounts = {};
    sortedResults.forEach(r => { r.settings.factors.forEach(f => { factorCounts[f.key] = (factorCounts[f.key] || 0) + 1; }); });
    const lockedFactors = Object.keys(factorCounts).filter(key => factorCounts[key] >= sortedResults.length * 0.9);
    if(lockedFactors.length > 0) { optimizerConstraints.lockedFactors = lockedFactors; }
    
    const numFactorsValues = sortedResults.map(r => r.settings.factors.length);
    optimizerConstraints.numFactors = { min: Math.min(...numFactorsValues), max: Math.max(...numFactorsValues) };

    optimizerConstraints.phase = (optimizerConstraints.phase || 1) + 1;
    
    displayLearnedRules();
}

function displayLearnedRules() {
    ui.optimizerConstraints.innerHTML = '<span>Gelernte Regeln: </span>';
    const learnedRules = [];
    if (optimizerConstraints.numFactors) learnedRules.push({key: 'numFactors', text: `Faktor-Anzahl (${optimizerConstraints.numFactors.min}-${optimizerConstraints.numFactors.max})`});
    if(optimizerConstraints.lockedFactors) learnedRules.push({key: 'lockedFactors', text: `Faktoren [${optimizerConstraints.lockedFactors.join(', ')}] fixiert`});
    
    Object.keys(optimizerConstraints).filter(k => k !== 'lockedFactors' && k !== 'phase' && k !== 'numFactors').forEach(key => {
       const config = { ...parameterConfig, ...filterConfig }[key];
       if (config) {
           const min = parseFloat(optimizerConstraints[key].min).toFixed(config.step < 1 ? 1 : 0);
           const max = parseFloat(optimizerConstraints[key].max).toFixed(config.step < 1 ? 1 : 0);
           learnedRules.push({key, text: `${config.label} (${min}-${max})`});
       }
    });
    
    learnedRules.forEach(rule => {
        const tag = document.createElement('span');
        tag.className = 'constraint-tag';
        tag.textContent = rule.text;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'constraint-remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => {
            delete optimizerConstraints[rule.key];
            displayLearnedRules();
        };
        tag.appendChild(removeBtn);
        ui.optimizerConstraints.appendChild(tag);
    });
}

function generateRandomSettings() {
    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randomFloat = (min, max, step) => {
        const range = (max - min) / step;
        return parseFloat((min + (Math.floor(Math.random() * (range + 1)) * step)).toFixed(1));
    };
    
    const settings = {};
    
    [...Object.keys(parameterConfig)].forEach(key => {
        const slider = document.querySelector(`input[name="${key}"]`);
        if (!slider) return;
        const config = { ...parameterConfig }[key];
        if (slider.dataset.locked === 'true') {
             settings[key] = parseFloat(slider.value);
        } else {
            const constraint = optimizerConstraints[key];
            const min = constraint?.min ?? config.min;
            const max = constraint?.max ?? config.max;
            if (config.step < 1) settings[key] = randomFloat(parseFloat(min), parseFloat(max), config.step);
            else settings[key] = randomInt(parseInt(min), parseInt(max));
        }
    });

    const allFactorKeys = ['change', 'volumeChange', 'absoluteVolume', 'closePos', 'upperStrength', 'lowerStrength'];
    const numFactors = randomInt(optimizerConstraints.numFactors?.min || 1, 5);
    const factors = [];
    const usedFactors = new Set();
    
    document.querySelectorAll('.factor-row[data-locked="true"]').forEach(row => {
        const key = row.querySelector('.factor-select').value;
        const weight = parseInt(row.querySelector('.factor-weight-value').textContent);
        if(factors.length < numFactors && !usedFactors.has(key)) {
            factors.push({key, weight});
            usedFactors.add(key);
        }
    });

    if (optimizerConstraints.lockedFactors) {
        optimizerConstraints.lockedFactors.forEach(key => {
            if (factors.length < numFactors && !usedFactors.has(key)) {
                factors.push({ key, weight: randomInt(1, 100) });
                usedFactors.add(key);
            }
        });
    }
    while(factors.length < numFactors) {
        const key = allFactorKeys[randomInt(0, allFactorKeys.length - 1)];
        if (!usedFactors.has(key)) { factors.push({ key, weight: randomInt(1, 100) }); usedFactors.add(key); }
    }
    
    settings.factors = factors;
    settings.strategy = ui.strategyLogicSelect.value;
    if(document.querySelector('#strategy-logic').dataset.locked !== 'true') { // Hypothetical lock for strategy logic
         settings.strategy = ['trend', 'reversion'][randomInt(0, 1)];
    }
    settings.maxOccurrences = randomInt(settings.minOccurrences, (optimizerConstraints.maxOccurrences?.max || parameterConfig.maxOccurrences.max));

    // Filter settings are only applied in local simulation, not here.
    settings.filterEnabled = false;
    settings.filterTradeLookback = 5;
    settings.filterMinPerformance = 0.1;

    // Add current ratio weights
    settings.ratioWeights = getCurrentRatioWeights();

    return settings;
}

function addResultToTable(resultId, kpis) {
    const newRow = document.createElement('tr');
    newRow.dataset.resultId = resultId;
    newRow.dataset.robustnessratio = kpis.robustnessRatio;
    newRow.dataset.annualreturn = kpis.annualReturn;
    newRow.dataset.avgdailytradereturn = kpis.avgDailyTradeReturn;
    newRow.dataset.tradecount = kpis.tradeCount;
    newRow.dataset.winrate = kpis.winRate;

    const formatCell = (val, dec, suf, cls='') => `<td class="${cls}">${(typeof val === 'number' && isFinite(val)) ? val.toFixed(dec) + suf : '-'}</td>`;
    
    newRow.innerHTML = `
        ${formatCell(kpis.robustnessRatio, 2, '', kpis.robustnessRatio >= 1 ? 'positive' : 'negative')}
        ${formatCell(kpis.annualReturn, 2, '%', kpis.annualReturn > 0 ? 'positive':'negative')}
        ${formatCell(kpis.avgDailyTradeReturn, 3, '%', kpis.avgDailyTradeReturn > 0 ? 'positive' : 'negative')}
        ${formatCell(kpis.tradeCount, 0, '')}
        ${formatCell(kpis.winRate, 1, '%')}`;
    
    ui.optimizerResults.appendChild(newRow);
    ui.clearOptimizerBtn.disabled = false;
}

function handleSortCriteriaChange() {
    const newSortKey = ui.optimizerSortCriteria.value;
    optimizerState.sortColumn = newSortKey;
    optimizerState.sortDirection = 'desc';
    
    updateSortHeaders();
    sortTable();
}

function handleHeaderClick(e) {
    const header = e.target.closest('th');
    if (!header || !header.dataset.sort) return;
    const sortKey = header.dataset.sort;
    if (optimizerState.sortColumn === sortKey) {
        optimizerState.sortDirection = optimizerState.sortDirection === 'desc' ? 'asc' : 'desc';
    } else {
        optimizerState.sortColumn = sortKey;
        optimizerState.sortDirection = 'desc';
    }
    ui.optimizerSortCriteria.value = optimizerState.sortColumn;
    updateSortHeaders();
    sortTable();
}

function updateSortHeaders() {
    ui.resultsHeader.querySelectorAll('th').forEach(th => th.textContent = th.textContent.replace(/ [▲▼]/, ''));
    const header = ui.resultsHeader.querySelector(`th[data-sort="${optimizerState.sortColumn}"]`);
    if(header) {
        header.textContent += optimizerState.sortDirection === 'desc' ? ' ▼' : ' ▲';
    }
}

function sortTable() {
    const rows = Array.from(ui.optimizerResults.children);
    const sortKey = optimizerState.sortColumn.toLowerCase();
    const dir = optimizerState.sortDirection === 'desc' ? 1 : -1;
    rows.sort((a, b) => {
        const valA = parseFloat(a.dataset[sortKey]);
        const valB = parseFloat(b.dataset[sortKey]);
        return (valB - valA) * dir;
    });
    ui.optimizerResults.innerHTML = '';
    rows.forEach(r => ui.optimizerResults.appendChild(r));
}

function handleOptimizerResultClick(e) {
    if (appState === 'META_OPTIMIZING') return;
    const row = e.target.closest('tr');
    if (!row || !row.dataset.resultId) return;
    const result = optimizerResultsCache[row.dataset.resultId];
    if (!result) return;
    
    if (appState === 'OPTIMIZING') {
       setAppState('PAUSED');
    }
    applySettingsToUI(result.settings);
    displayResultDetails(result.kpis, result.performanceData, ui.trainingDataSelect.value);
    
    Array.from(ui.optimizerResults.children).forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
}

function applySettingsToUI(settings) {
    Object.keys(settings).forEach(key => {
        if(parameterConfig[key] || filterConfig[key]) {
            const slider = document.querySelector(`input[name="${key}"]`);
            if (slider && slider.dataset.locked !== 'true') {
                const config = { ...parameterConfig, ...filterConfig }[key];
                if(config && config.type === 'toggle') {
                    const lockBtn = slider.closest('.parameter-row').querySelector('.lock-btn');
                    if ((settings[key] && !lockBtn.classList.contains('locked')) || (!settings[key] && lockBtn.classList.contains('locked'))) {
                        lockBtn.click();
                    }
                } else if (config) {
                    slider.value = settings[key];
                    slider.dispatchEvent(new Event('input'));
                }
            }
        }
    });

    ui.strategyLogicSelect.value = settings.strategy;
    ui.factorContainer.innerHTML = '';
    settings.factors.forEach(f => addFactorRow(f.key, f.weight));
}

function displayResultDetails(kpis, performanceData, title) {
    ui.tradeCountEl.textContent = kpis.tradeCount.toFixed(0);
    ui.annualReturnEl.textContent = `${kpis.annualReturn.toFixed(2)}%`;
    ui.annualReturnEl.className = `font-bold text-2xl ${kpis.annualReturn >= 0 ? 'positive' : 'negative'}`;
    ui.robustnessRatioEl.textContent = isFinite(kpis.robustnessRatio) ? kpis.robustnessRatio.toFixed(2) : '∞';
    ui.robustnessRatioEl.className = `font-bold text-2xl ${kpis.robustnessRatio >= 1 ? 'positive' : 'negative'}`;
    ui.maxDdDurationEl.textContent = `${kpis.longestDrawdownDuration.toFixed(0)} T`;
    ui.maxDrawdownEl.textContent = `${(kpis.maxDrawdown * 100).toFixed(1)}%`;
    ui.winRateEl.textContent = `${kpis.winRate.toFixed(1)}%`;
    ui.winRateEl.className = `font-bold text-2xl ${kpis.winRate >= 50 ? 'positive' : 'negative'}`;
    
    initializeChart(title);
    if (!performanceChart) return;
    const chartData = performanceData.map(d => ({ x: d.date.getTime(), y: d.value }));
    performanceChart.data.datasets.unshift({ label: 'Strategie', data: chartData, borderColor: '#6366f1', borderWidth: 2, pointRadius: 0 });
    performanceChart.update();
}

// --- MANUELLE SIMULATION / ROBUSTNESS ---
function getSettingsFromUI() {
    const settings = {};
    document.querySelectorAll('#parameter-container input[type="range"]').forEach(slider => {
        settings[slider.name] = parseFloat(slider.value);
    });
    settings.strategy = ui.strategyLogicSelect.value;
    settings.factors = [];
    document.querySelectorAll('#factor-container .factor-row').forEach(row => {
        settings.factors.push({
            key: row.querySelector('.factor-select').value,
            weight: parseInt(row.querySelector('.factor-weight').value)
        });
    });
    settings.ratioWeights = getCurrentRatioWeights();
    // Manual simulation does not use the dynamic filter
    settings.filterEnabled = false; 
    return settings;
}

function runSingleSimulation(settings, features, callback) {
    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);
    const singleWorker = new Worker(workerUrl);

    const serializableFeatures = features.map(f => ({ ...f, date: f.date.getTime() }));
    
    singleWorker.onmessage = (e) => {
        const { fullResult } = e.data;
        if (fullResult) {
            fullResult.performanceData.forEach(d => d.date = new Date(d.date));
             fullResult.completedTradeLog.forEach(t => {
                t.buyDate = new Date(t.buyDate);
                t.sellDate = new Date(t.sellDate);
            });
        }
        callback(fullResult);
        singleWorker.terminate();
    };

    singleWorker.onerror = (error) => {
        console.error("Fehler im manuellen Worker:", error.message);
        callback(null);
        singleWorker.terminate();
    };
    
    singleWorker.postMessage({ type: 'init', features: serializableFeatures });
    singleWorker.postMessage({ type: 'run', settings: settings, features: serializableFeatures });
}

function startManualSimulation() {
    if (appState !== 'IDLE') return;
    const trainingFile = ui.trainingDataSelect.value;
    const dataset = allDatasets[trainingFile];
    if (!dataset || !dataset.features) return;

    const { processedFeatures } = finalizeFeatures(dataset.features, true);
    dataset.rankedFeatures = processedFeatures;

    const settings = getSettingsFromUI();
    ui.analysisTitle.textContent = `Analyse für: Manuelle Simulation (${trainingFile})`;

    runSingleSimulation(settings, dataset.rankedFeatures, (result) => {
        if (result) {
            displayResultDetails(result.kpis, result.performanceData, trainingFile);
        } else {
            alert("Die manuelle Simulation ergab keine Trades mit den aktuellen Einstellungen.");
        }
    });
}

async function runRobustnessCheck() {
     if (appState !== 'IDLE') return;
    
    const trainingFile = ui.trainingDataSelect.value;
    const trainingDataset = allDatasets[trainingFile];
    if (!trainingDataset || !trainingDataset.features) {
        alert("Trainingsdaten nicht gefunden.");
        return;
    }

    const { processedFeatures: rankedTrainingFeatures, bins: trainingBins } = finalizeFeatures(trainingDataset.features, true);
    const settings = getSettingsFromUI();
    ui.robustnessResults.innerHTML = '<tr><td colspan="3">Prüfung läuft...</td></tr>';
    
    const testFiles = Object.keys(allDatasets).filter(name => name !== trainingFile);
    const results = [];

    for (const testFile of testFiles) {
        const testDataset = allDatasets[testFile];
        prepareAllData(testFile);
        
        const { processedFeatures: rankedTestFeatures } = finalizeFeatures(testDataset.features, false, trainingBins);
        
        const promise = new Promise(resolve => {
            runSingleSimulation(settings, rankedTestFeatures, (result) => {
                results.push({
                    name: testFile,
                    avgReturn: result ? result.kpis.avgTradeReturn : 0,
                    trades: result ? result.kpis.tradeCount : 0
                });
                resolve();
            });
        });
        await promise;
    }

    ui.robustnessResults.innerHTML = '';
    results.forEach(res => {
        const row = document.createElement('tr');
        const avgReturnClass = res.avgReturn > 0 ? 'positive' : (res.avgReturn < 0 ? 'negative' : 'neutral');
        row.innerHTML = `<td>${res.name.substring(0, 15)}...</td><td class="${avgReturnClass}">${res.avgReturn.toFixed(3)}%</td><td>${res.trades}</td>`;
        ui.robustnessResults.appendChild(row);
    });
}


// --- CHARTING ---
function initializeChart(fileName) { 
    if(performanceChart) performanceChart.destroy();
    const ctx = document.getElementById('performance-chart').getContext('2d');
    performanceChart = new Chart(ctx, { type: 'line', data: { datasets: [] }, options: { responsive: true, maintainAspectRatio: false,
            scales: { x: { type: 'time', time: { unit: 'year', tooltipFormat: 'dd.MM.yyyy' }, grid: { color: '#374151' }, ticks: { color: '#9ca3af' } },
                y: { grid: { color: '#374151' }, ticks: { color: '#9ca3af', callback: val => `$${(val/1000).toFixed(1)}k` } }
            },
            plugins: { legend: { labels: { color: '#d1d5db' } } }
        }
    });
    if (fileName && allDatasets[fileName]?.raw.length > 0) {
        const rawData = allDatasets[fileName].raw;
        const initialCapital = 10000;
        const bhData = rawData.map(d => ({ x: d.date.getTime(), y: (d.close / rawData[0].close) * initialCapital }));
        performanceChart.data.datasets.push({ label: `Buy & Hold (${fileName.substring(0,10)}...)`, data: bhData, borderColor: '#6b7280', borderWidth: 2, borderDash: [5, 5], pointRadius: 0 });
        performanceChart.update();
    }
}

// --- META-OPTIMIERER LOGIK ---

function updateMetaCombinationsCount() {
    const tMin = parseFloat(ui.metaTradesMin.value);
    const tMax = parseFloat(ui.metaTradesMax.value);
    const tStep = parseFloat(ui.metaTradesStep.value);
    const pMin = parseFloat(ui.metaPerfMin.value);
    const pMax = parseFloat(ui.metaPerfMax.value);
    const pStep = parseFloat(ui.metaPerfStep.value);
    
    if (isNaN(tMin) || isNaN(tMax) || isNaN(tStep) || tStep <= 0 || isNaN(pMin) || isNaN(pMax) || isNaN(pStep) || pStep <= 0) {
        ui.metaCombinationsCount.textContent = '0';
        return 0;
    }

    const tCount = Math.floor((tMax - tMin) / tStep) + 1;
    const pCount = Math.round(((pMax - pMin) / pStep) * 10) / 10 + 1; // Handle float precision
    const total = tCount * pCount;
    
    ui.metaCombinationsCount.textContent = total;
    if (total > 1000) {
        ui.metaCombinationsCount.classList.add('negative');
        ui.metaCombinationsCount.classList.remove('positive');
    } else {
        ui.metaCombinationsCount.classList.remove('negative');
        ui.metaCombinationsCount.classList.add('positive');
    }
    return total;
}

function handleStartMetaOptimizer() {
    if (appState !== 'IDLE') return;
    
    const totalCombinations = updateMetaCombinationsCount();
    if (totalCombinations > 1000) {
        alert(`Zu viele Kombinationen (${totalCombinations}). Bitte reduzieren Sie die Spanne oder erhöhen Sie die Schrittweite. Das Maximum ist 1000.`);
        return;
    }
    if (totalCombinations === 0) {
         alert(`Keine Kombinationen zum Testen. Bitte überprüfen Sie die Grid-Search-Parameter.`);
        return;
    }

    const trainingFile = ui.trainingDataSelect.value;
    const dataset = allDatasets[trainingFile];
    if (!dataset?.features) {
        alert("Bitte zuerst Daten laden.");
        return;
    }

    const splitPercentage = (parseInt(ui.metaOptimizerSplit.value, 10) || 50) / 100;
    if(splitPercentage < 0.1 || splitPercentage > 0.9) {
        alert("Bitte wählen Sie einen Trainingsdaten-Anteil zwischen 10% und 90%.");
        return;
    }
    
    // --- LOOKAHEAD-BIAS FIX ---
    // 1. Split the raw features
    const splitIndex = Math.floor(dataset.features.length * splitPercentage);
    let rawTrainingFeatures = dataset.features.slice(0, splitIndex).map(f => ({...f})); // Deep copy
    let rawValidationFeatures = dataset.features.slice(splitIndex).map(f => ({...f})); // Deep copy
    
    // Calculate period-specific benchmarks
    const changesIS = rawTrainingFeatures.map(f => f.change).filter(isFinite);
    dataset.benchmarkDailyReturnIS = changesIS.length > 0 ? changesIS.reduce((a, b) => a + b, 0) / changesIS.length : 0;
    const changesOOS = rawValidationFeatures.map(f => f.change).filter(isFinite);
    dataset.benchmarkDailyReturnOOS = changesOOS.length > 0 ? changesOOS.reduce((a, b) => a + b, 0) / changesOOS.length : 0;

    // 2. Finalize training data (calculate future returns AND bins)
    const { processedFeatures: trainingFeatures, bins: trainingBins } = finalizeFeatures(rawTrainingFeatures, true);
    
    // 3. Finalize validation data (calculate future returns and APPLY training bins)
    const { processedFeatures: validationFeatures } = finalizeFeatures(rawValidationFeatures, false, trainingBins);

    dataset.trainingFeatures = trainingFeatures;
    dataset.validationFeatures = validationFeatures;
    // --- END OF FIX ---


    const rulesToRun = [];
    const tMin = parseFloat(ui.metaTradesMin.value);
    const tMax = parseFloat(ui.metaTradesMax.value);
    const tStep = parseFloat(ui.metaTradesStep.value);
    const pMin = parseFloat(ui.metaPerfMin.value);
    const pMax = parseFloat(ui.metaPerfMax.value);
    const pStep = parseFloat(ui.metaPerfStep.value);

    for (let t = tMin; t <= tMax; t += tStep) {
        for (let p = pMin; p <= pMax; p += pStep) {
            const pRounded = Math.round(p * 10) / 10;
            rulesToRun.push({
                name: `Filter ${t}T / ${pRounded}%`,
                settings: {
                    filterEnabled: true,
                    filterTradeLookback: t,
                    filterMinPerformance: pRounded
                }
            });
        }
    }
    // Also add a baseline "Filter Off" rule
    rulesToRun.unshift({
        name: 'Filter Aus',
        settings: { filterEnabled: false, filterTradeLookback: 5, filterMinPerformance: 0.1 } // Dummy values, as it's disabled
    });


    metaOptimizerState = { 
        results: [], 
        timeoutId: null,
        rulesToRun: rulesToRun,
        sortColumn: ui.optimizerSortCriteria.value,
        learningEnabled: ui.metaOptimizerLearningEnabled.checked,
        isRunning: true
    };
    ui.metaOptimizerResults.innerHTML = '';
    
    setAppState('META_OPTIMIZING');

    ui.metaOptimizerStatus.textContent = `Phase 1/2: Finde die besten 10 Basis-Strategien im Trainings-Zeitraum...`;
    
    // Start the single training run. The callback will handle the validation of all rules.
    startOptimization(true, metaOptimizerState.learningEnabled, validateAllRulesAfterTraining);
}

async function validateAllRulesAfterTraining() {
    if(appState !== 'META_OPTIMIZING') return; // If user stopped it
    
    ui.metaOptimizerStatus.textContent = `Phase 2/2: Validiere ${metaOptimizerState.rulesToRun.length} Filter-Regeln...`;

    const topResults = Object.values(optimizerResultsCache);
    if (topResults.length === 0) {
        ui.metaOptimizerStatus.textContent = "Meta-Optimierung beendet: Keine Basis-Strategien im Training gefunden.";
        setAppState('IDLE');
        return;
    }
    
    const allMetaResults = [];
    const validationFile = ui.trainingDataSelect.value;
    const dataset = allDatasets[validationFile];

    const BATCH_SIZE = 5; // Process in chunks to keep UI responsive
    for (let i = 0; i < metaOptimizerState.rulesToRun.length; i += BATCH_SIZE) {
        const batch = metaOptimizerState.rulesToRun.slice(i, i + BATCH_SIZE);
        for (const rule of batch) {
            const resultForMeta = {
                ruleName: rule.name,
                ruleSettings: rule.settings,
                totalProfit: 0,
                totalTrades: 0,
                avgDailyReturnIS: 0,
                avgDailyReturnOOS: 0,
                validationDetails: []
            };
            
            let totalDailyIS = 0, totalDailyOOS = 0, countIS = 0, countOOS = 0;

            for (const res of topResults) {
                const filteredSettings = {...res.settings, ...rule.settings};
                
                // Run simulation for IS period WITH the filter
                const isResult = local_runHeadlessSimulation(filteredSettings, dataset.trainingFeatures);
                if (isResult && isResult.kpis.tradeCount > 0) {
                    totalDailyIS += isResult.kpis.avgDailyTradeReturn * isResult.kpis.tradeCount;
                    countIS += isResult.kpis.tradeCount;
                }
                
                // Run simulation for OOS period WITH the filter
                const oosResult = local_runHeadlessSimulation(filteredSettings, dataset.validationFeatures);
                if (oosResult && oosResult.kpis) {
                    resultForMeta.totalProfit += (oosResult.kpis.finalValue - 10000);
                    resultForMeta.totalTrades += oosResult.kpis.tradeCount;
                     if(oosResult.kpis.tradeCount > 0) {
                        totalDailyOOS += oosResult.kpis.avgDailyTradeReturn * oosResult.kpis.tradeCount;
                        countOOS += oosResult.kpis.tradeCount;
                    }
                    resultForMeta.validationDetails.push({
                        baseStrategySettings: res.settings,
                        validationKpis: oosResult.kpis
                    });
                }
            }
            
            resultForMeta.avgDailyReturnIS = countIS > 0 ? totalDailyIS / countIS : 0;
            resultForMeta.avgDailyReturnOOS = countOOS > 0 ? totalDailyOOS / countOOS : 0;
            allMetaResults.push(resultForMeta);
        }
        
        metaOptimizerState.results = allMetaResults;
        updateMetaResultsTable();
        ui.metaOptimizerStatus.textContent = `Phase 2/2: Validiere Filter-Regel ${i + batch.length}/${metaOptimizerState.rulesToRun.length}...`;
        await new Promise(resolve => setTimeout(resolve, 20)); // Short pause for UI to update
    }
    
    ui.metaOptimizerStatus.textContent = "Meta-Optimierung abgeschlossen.";
    setAppState('IDLE');
}

function updateMetaResultsTable() {
    const sortedMetaResults = metaOptimizerState.results.sort((a, b) => b.avgDailyReturnOOS - a.avgDailyReturnOOS);
    
    ui.metaOptimizerResults.innerHTML = '';
    const dataset = allDatasets[ui.trainingDataSelect.value];
    const benchmarkIS = dataset.benchmarkDailyReturnIS;
    const benchmarkOOS = dataset.benchmarkDailyReturnOOS;

    sortedMetaResults.forEach(res => {
        const row = document.createElement('tr');
        const formatCell = (val, benchmark) => {
            const cls = val > benchmark ? 'positive' : (val < 0 ? 'negative' : 'neutral');
            return `<td class="${cls}">${val.toFixed(4)}%</td>`;
        };
        
        row.innerHTML = `
            <td>${res.ruleName}</td>
            ${formatCell(res.avgDailyReturnIS, benchmarkIS)}
            <td class="neutral">${benchmarkIS.toFixed(4)}%</td>
            ${formatCell(res.avgDailyReturnOOS, benchmarkOOS)}
            <td class="neutral">${benchmarkOOS.toFixed(4)}%</td>
            <td>${res.totalTrades}</td>
            <td><button class="view-meta-details-btn text-indigo-400" data-rule-name="${res.ruleName}">Details</button></td>
        `;
        ui.metaOptimizerResults.appendChild(row);
    });

    analyzeMetaResultsRanks();
    ui.metaRankAnalysisSection.classList.remove('hidden');
    ui.weightsAnalysisSection.classList.remove('hidden');
}

function analyzeMetaResultsRanks() {
    const rows = Array.from(ui.metaOptimizerResults.children);
    if (rows.length === 0) {
         ui.metaRankAnalysisSection.classList.add('hidden');
        return;
    }

    const daysAnalysis = {};
    const perfAnalysis = {};

    rows.forEach((row, index) => {
        const rank = index + 1;
        const ruleName = row.children[0].textContent;
        
        const match = ruleName.match(/Filter (\d+)T \/ ([\d.-]+)%/);
        if (match) {
            const days = match[1];
            const perf = match[2];

            if (!daysAnalysis[days]) daysAnalysis[days] = { ranks: [], count: 0 };
            daysAnalysis[days].ranks.push(rank);
            daysAnalysis[days].count++;

            if (!perfAnalysis[perf]) perfAnalysis[perf] = { ranks: [], count: 0 };
            perfAnalysis[perf].ranks.push(rank);
            perfAnalysis[perf].count++;
        }
    });
    
    const calculateAndSort = (analysisObject) => {
        return Object.entries(analysisObject)
            .map(([key, value]) => ({
                key: key,
                avgRank: value.ranks.reduce((a, b) => a + b, 0) / value.count
            }))
            .sort((a, b) => a.avgRank - b.avgRank);
    };

    const sortedDays = calculateAndSort(daysAnalysis);
    const sortedPerf = calculateAndSort(perfAnalysis);

    // Render tables
    ui.metaRankAnalysisDays.innerHTML = sortedDays.map(item => `<tr><td>${item.key} Tage</td><td>${item.avgRank.toFixed(2)}</td></tr>`).join('');
    ui.metaRankAnalysisPerf.innerHTML = sortedPerf.map(item => `<tr><td>${item.key}%</td><td>${item.avgRank.toFixed(2)}</td></tr>`).join('');
}

function openMetaDetailModal(ruleName) {
    const result = metaOptimizerState.results.find(r => r.ruleName === ruleName);
    if (!result) return;
    
    const dataset = allDatasets[ui.trainingDataSelect.value];
    const benchmarkIS = dataset.benchmarkDailyReturnIS;
    const benchmarkOOS = dataset.benchmarkDailyReturnOOS;

    ui.metaDetailTitle.textContent = `Detailansicht für: ${result.ruleName}`;
    
    const kpiHTML = (value, benchmark, label) => {
        const isBetter = value > benchmark;
        const colorClass = isBetter ? 'positive' : (value < 0 ? 'negative' : '');
        return `<div class="bg-gray-800 p-3 rounded-lg text-center">
                    <p class="text-sm text-gray-400">${label}</p>
                    <p class="font-bold text-xl ${colorClass}">${value.toFixed(4)}%</p>
                </div>`;
    };
    
    ui.metaDetailContent.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            ${kpiHTML(result.avgDailyReturnIS, benchmarkIS, 'Ø Rendite/Tag (IS)')}
            <div class="bg-gray-800 p-3 rounded-lg text-center"><p class="text-sm text-gray-400">Benchmark (IS)</p><p class="font-bold text-xl">${benchmarkIS.toFixed(4)}%</p></div>
            ${kpiHTML(result.avgDailyReturnOOS, benchmarkOOS, 'Ø Rendite/Tag (OOS)')}
            <div class="bg-gray-800 p-3 rounded-lg text-center"><p class="text-sm text-gray-400">Benchmark (OOS)</p><p class="font-bold text-xl">${benchmarkOOS.toFixed(4)}%</p></div>
        </div>
        <h4 class="text-md font-semibold text-gray-300 mt-4">Performance der Top 10 Basis-Strategien mit diesem Filter (OOS)</h4>
        <div id="strategy-list" class="space-y-2"></div>
    `;

    const strategyListEl = ui.metaDetailContent.querySelector('#strategy-list');
    if (!result.validationDetails || result.validationDetails.length === 0) {
        strategyListEl.innerHTML = '<p>Keine Detaildaten für diese Regel verfügbar.</p>';
        ui.metaDetailModal.classList.remove('hidden');
        return;
    }

    result.validationDetails.sort((a, b) => b.validationKpis.robustnessRatio - a.validationKpis.robustnessRatio);

    result.validationDetails.forEach((detail, index) => {
        const kpis = detail.validationKpis;
        const profit = kpis.finalValue - 10000;
        const container = document.createElement('div');
        container.className = 'bg-gray-800 p-3 rounded-lg';
        container.innerHTML = `
            <details>
                <summary class="font-semibold cursor-pointer">
                    Basis-Strategie ${index + 1}: 
                    <span class="${kpis.robustnessRatio > 1 ? 'positive' : 'negative'}">Robustheit: ${kpis.robustnessRatio.toFixed(2)}</span> 
                    (${kpis.tradeCount} Trades, ${kpis.winRate.toFixed(1)}% WR)
                </summary>
                <div class="mt-4 pl-4 border-l-2 border-gray-600 space-y-3">
                    <div>
                        <h5 class="font-bold text-indigo-400">Parameter der Basis-Strategie:</h5>
                        <div class="text-xs grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                            ${Object.entries(detail.baseStrategySettings).filter(([key]) => parameterConfig[key]).map(([key, value]) => {
                                const config = parameterConfig[key];
                                return `<span>${config?.label || key}: <strong>${value}</strong></span>`;
                            }).join('')}
                        </div>
                         <div class="mt-2">
                            <h5 class="font-bold text-indigo-400">Faktoren:</h5>
                            <div class="text-xs grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                                ${detail.baseStrategySettings.factors.map(f => `<span>${f.key}: <strong>${f.weight}%</strong></span>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </details>
        `;
        strategyListEl.appendChild(container);
    });
    ui.metaDetailModal.classList.remove('hidden');
}

async function startWeightsAnalysis() {
    if (appState !== 'IDLE') {
        alert("Bitte warten Sie, bis andere Prozesse abgeschlossen sind.");
        return;
    }
    if (metaOptimizerState.results.length === 0) {
        alert("Bitte führen Sie zuerst eine Meta-Optimierung durch.");
        return;
    }

    const runs = parseInt(ui.weightsAnalysisRuns.value, 10);
    ui.weightsAnalysisStatus.textContent = `Analysiere ${runs} zufällige Gewichtungen...`;
    ui.weightsAnalysisResults.innerHTML = '';
    setAppState('META_OPTIMIZING'); // Block other actions

    await new Promise(resolve => setTimeout(resolve, 50)); // Allow UI to update

    const analysisResults = [];
    for (let i = 0; i < runs; i++) {
        // 1. Generate random weights that sum to 100
        const randomWeights = {};
        let total = 0;
        for(const key in ratioWeightsConfig) {
            const randVal = Math.random();
            randomWeights[key] = randVal;
            total += randVal;
        }
        for (const key in randomWeights) {
            randomWeights[key] = Math.round((randomWeights[key] / total) * 100);
        }
        
        const currentTotal = Object.values(randomWeights).reduce((a, b) => a + b, 0);
        const diff = 100 - currentTotal;
        if (diff !== 0) {
             const firstKey = Object.keys(randomWeights)[0];
             randomWeights[firstKey] += diff;
        }


        // 2. Recalculate robustness for IS and OOS for each rule
        const recalculatedResults = metaOptimizerState.results.map(rule => {
            let totalRobustnessIS = 0, countIS = 0, totalRobustnessOOS = 0, countOOS = 0;
            
            rule.validationDetails.forEach(detail => {
                // This part needs correction. We need IS KPIs as well.
                // For now, let's just use OOS results as a proxy for this analysis
                if (detail.validationKpis && detail.validationKpis.tradeCount > 0) {
                    const oosRobustness = getRobustnessRatio(detail.validationKpis, randomWeights);
                    totalRobustnessOOS += oosRobustness * detail.validationKpis.tradeCount;
                    countOOS += detail.validationKpis.tradeCount;
                }
            });

            return {
                ruleName: rule.ruleName,
                oosRobustness: countOOS > 0 ? totalRobustnessOOS / countOOS : 0,
            };
        });
        
        // 3. This analysis is flawed without proper IS/OOS comparison for the robustness score itself.
        // A simplified approach: Find which weightings produce the highest OOS robustness for the top IS rule.
        
        const topISRule = metaOptimizerState.results.sort((a,b) => b.avgDailyReturnIS - a.avgDailyReturnIS)[0];
        const topRuleRecalculated = recalculatedResults.find(r => r.ruleName === topISRule.ruleName);


        analysisResults.push({
            weights: randomWeights,
            rankStability: topRuleRecalculated ? topRuleRecalculated.oosRobustness : 0, // Simplified metric
            topOOSRuleName: recalculatedResults.sort((a,b) => b.oosRobustness - a.oosRobustness)[0]?.ruleName || "N/A"
        });
    }

    // 4. Sort and display top 10 results
    analysisResults.sort((a, b) => b.rankStability - a.rankStability); // Higher is better
    const top10 = analysisResults.slice(0, 10);

    ui.weightsAnalysisResults.innerHTML = top10.map(res => {
        const weightsString = Object.values(res.weights).join('/');
        return `<tr>
            <td>${weightsString}</td>
            <td>${res.rankStability.toFixed(2)}</td>
            <td>${res.topOOSRuleName}</td>
        </tr>`;
    }).join('');
    
    ui.weightsAnalysisStatus.textContent = `Analyse abgeschlossen. Top 10 Gewichtungen angezeigt.`;
    setAppState('IDLE');
}


// --- SEITE INITIALISIEREN ---
document.addEventListener('DOMContentLoaded', () => {
    initializeParameters();
    ui.factorContainer.innerHTML = '';
    addFactorRow('change', 100);
    addFactorRow('absoluteVolume', 100);
    
    updateMetaCombinationsCount();
    setAppState('IDLE', true); // Initial state
    updateSortHeaders();
});

