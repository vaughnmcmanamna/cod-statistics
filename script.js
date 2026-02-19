// --- Theme ---

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        updateThemeIcon('light');
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    if (newTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('.theme-icon');
        if (icon) {
            icon.textContent = theme === 'light' ? '🌙' : '☀️';
        }
    }
}

initTheme();

// --- Config ---

const config = {
    defaultGamemode: "all",
    defaultMetric: "Skill",
    dateField: "UTC Timestamp",
    dateFormat: "%Y-%m-%d %H:%M",
    cutoffDate: new Date(2024, 11, 1), // December 1, 2024
    margin: { top: 30, right: 50, bottom: 50, left: 60 },
    width: () => Math.min(window.innerWidth * 0.9, 900),  // Max 900px wide
    height: () => Math.min(window.innerHeight * 0.7, 700), // Max 700px tall
    csvPath: "cod_stats1.csv",
    dotRadius: 4,
    dotRadiusHover: 10,
    transitionDuration: 200,
    colors: {
        line: "#8b8b8b",
        win: "#37c593",
        loss: "#eb5757",
        dotHover: "#ffffff",
        neutralValue: "#6b7280"
    },
    apiBaseUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:8000'
        : 'https://cod-stats-api.onrender.com',
    useApi: true,
    rankedMaps: ['Vault', 'Rewind', 'Protocol', 'Hacienda', 'Skyline', 'Red Card', 'Dealership'],
    rankedModes: ['Hardpoint', 'Search and Destroy', 'Control']
};


// --- Helpers ---

function getMapImage(mapName) {
    const imageMap = {
        'Vault': 'images/Vault_MenuScreen_BO6.webp',
        'Rewind': 'images/Rewind_MenuScreen_BO6.webp',
        'Protocol': 'images/Protocol_MenuScreen_BO6.webp',
        'Hacienda': 'images/Hacienda_MenuScreen_BO4.webp',
        'Skyline': 'images/Skyline_MenuScreen_BO6.webp',
        'Red Card': 'images/RedCard_MenuScreen_BO6.webp',
        'Dealership': 'images/Dealership_MenuScreen_BO6.webp'
    };
    return imageMap[mapName] || null;
}

// --- State ---

let state = {
    data: null,
    filteredData: null,
    sortedData: null,
    currentGamemode: config.defaultGamemode,
    currentMetric: config.defaultMetric,
    currentMap: "all",
    svg: null,
    chartGroup: null,
    xScale: null,
    yScale: null,
    isZooming: false
};

function initVisualization() {
    loadData();
    window.addEventListener("resize", debounce(resizeChart, 250));
}
function calculatePearsonCorrelation(x, y) {
    const n = x.length;
    const xMean = x.reduce((sum, val) => sum + val, 0) / n;
    const yMean = y.reduce((sum, val) => sum + val, 0) / n;

    let covariance = 0;
    let xStdDev = 0;
    let yStdDev = 0;

    for (let i = 0; i < n; i++) {
        const xDiff = x[i] - xMean;
        const yDiff = y[i] - yMean;
        covariance += xDiff * yDiff;
        xStdDev += xDiff * xDiff;
        yStdDev += yDiff * yDiff;
    }

    if (xStdDev === 0 || yStdDev === 0) return 0;
    return covariance / (Math.sqrt(xStdDev) * Math.sqrt(yStdDev));
}

// --- Analytics Utilities ---

function calculateWinLossCounts(data) {
    let wins = 0;
    let losses = 0;

    data.forEach(d => {
        if (d.isWin === true) {
            wins++;
        } else if (d.isWin === false) {
            losses++;
        }
    });

    return { wins, losses };
}

function calculateAverage(data, metric) {
    const validData = data.filter(d => d[metric] !== undefined && !isNaN(d[metric]));
    const sum = validData.reduce((acc, d) => acc + d[metric], 0);
    return sum / validData.length;
}

// --- Data Loading ---

function loadData() {
    const savedData = localStorage.getItem('codStatsData');
    if (savedData) {
        try {
            const parsedData = JSON.parse(savedData);
            const data = parsedData.map(d => ({
                ...d,
                'UTC Timestamp': new Date(d['UTC Timestamp'])
            }));
            console.log(`Loaded ${data.length} matches from localStorage`);
            state.data = data;
            state.sortedData = data.slice().sort((a, b) => a['UTC Timestamp'] - b['UTC Timestamp']);
            updateVisualization();
            showToast('Data loaded from cache', 'success');
            return;
        } catch (error) {
            console.warn('Failed to load from localStorage:', error);
            localStorage.removeItem('codStatsData');
        }
    }

    if (config.useApi) {
        loadDataFromApi();
    } else {
        loadDataFromCsv();
    }
}

function loadDataFromApi() {
    const apiUrl = `${config.apiBaseUrl}/api/matches?limit=10000`;

    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }
            return response.json();
        })
        .then(result => {
            const data = result.data.map(d => ({
                [config.dateField]: new Date(d.match_start_timestamp),

                "Game Type": d.game_type,
                "Map": d.map,
                "Team": d.team,
                "Match Outcome": d.match_outcome,

                "Skill": d.skill,
                "Score": d.score,
                "Kills": d.kills,
                "Deaths": d.deaths,
                "Assists": d.assists,
                "Headshots": d.headshots,
                "K/D Ratio": d.kd_ratio,
                "EKIA": d.ekia,
                "EKIA/D Ratio": d.ekia_d_ratio,
                "Headshot %": d.headshot_percentage,
                "Accuracy %": d.accuracy_percentage,
                "Shots": d.shots,
                "Hits": d.hits,
                "Damage Done": d.damage_done,
                "Damage Taken": d.damage_taken,
                "Total XP": d.total_xp,
                "Score XP": d.score_xp,
                "Challenge XP": d.challenge_xp,
                "Match XP": d.match_xp,
                "Medal XP": d.medal_xp,
                "Percentage Of Time Moving": d.percentage_of_time_moving,
                "Operator": d.operator,
                "Operator Skin": d.operator_skin,
                isRanked: d.is_ranked,
                isWin: d.match_outcome && d.match_outcome.toLowerCase() === "win"
            }));

            const filteredData = data.filter(d => d["Total XP"] > 0);
            filteredData.sort((a, b) => a[config.dateField] - b[config.dateField]);

            state.data = filteredData;
            state.sortedData = filteredData;

            try {
                localStorage.setItem('codStatsData', JSON.stringify(filteredData));
                console.log(`Saved ${filteredData.length} matches to localStorage`);
            } catch (error) {
                console.warn('Failed to save to localStorage:', error);
            }

            populateControls(filteredData);
            updateVisualization();
        })
        .catch(error => {
            console.error("Error loading data from API:", error);
            console.log("Falling back to CSV...");
            config.useApi = false;
            loadDataFromCsv();
        });
}

function loadDataFromCsv() {
    d3.csv(config.csvPath).then(function(data) {
        const parseDate = d3.timeParse(config.dateFormat);

        data.forEach(d => {
            d[config.dateField] = parseDate(d[config.dateField]);

            for (let key in d) {
                 if (typeof d[key] === "string") {
                    let value = d[key].trim();

                    if (key == "Percentage Of Time Moving") {
                        d[key] = parseFloat(value.replace("%", ""));
                    }
                    if (key !== config.dateField && !isNaN(value) && value !== "") {
                        d[key] = +value;
                    }
                }
            }

            if (d.Deaths > 0) {
                d["K/D Ratio"] = parseFloat((d.Kills / d.Deaths).toFixed(2));
            } else {
                d["K/D Ratio"] = d.Kills > 0 ? 99 : 0;
            }

            if (d.Deaths > 0) {
                d["EKIA/D Ratio"] = parseFloat(((d.Kills + (d.Assists || 0)) / d.Deaths).toFixed(2));
                d["EKIA"] = parseFloat(d.Kills + (d.Assists || 0));
            } else {
                d["EKIA/D Ratio"] = (d.Kills + (d.Assists || 0)) > 0 ? 99 : 0;
                d["EKIA"] = parseFloat(d.Kills + (d.Assists || 0));
            }

            if (d.Kills > 0 && d.Headshots !== undefined) {
                d["Headshot %"] = parseFloat(((d.Headshots / d.Kills) * 100).toFixed(1));
            }

            d.isRanked = ["Hardpoint", "Search and Destroy", "Control"].includes(d["Game Type"]);

            if (d.hasOwnProperty("Match Outcome")) {
                d.isWin = d["Match Outcome"].toLowerCase() === "win";
            }
            d["Match Outcome"] = d.isWin === true ? 1 : d.isWin === false ? 0 : null;

        });

        data = data.filter(d => d["Total XP"] > 0);
        data.sort((a, b) => a[config.dateField] - b[config.dateField]);

        state.data = data;
        state.sortedData = data;

        try {
            localStorage.setItem('codStatsData', JSON.stringify(data));
            console.log(`Saved ${data.length} matches to localStorage`);
        } catch (error) {
            console.warn('Failed to save to localStorage:', error);
        }

        populateControls(data);
        updateVisualization();

    }).catch(error => {
        console.error("Error loading data:", error);
        showNoDataState();
    });
}

function populateControls(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn('populateControls called with empty or invalid data');
        return;
    }

    const includedGameModes = ["Hardpoint", "Control", "Search and Destroy"];
    const uniqueGameModes = [...new Set(data.map(d => d["Game Type"]))].filter(mode => includedGameModes.includes(mode));
    const gameModes = [
        { value: "all", label: "All Game Modes" },
        { value: "ranked", label: "Ranked Only" },
        ...uniqueGameModes.map(mode => ({ value: mode, label: mode }))
    ];

    const uniqueMaps = [...new Set(data.map(d => d["Map"]))];
    const maps = [
        { value: "all", label: "All Maps" },
        ...uniqueMaps.map(map => ({ value: map, label: map }))
    ];

    const sampleRow = data[0];
    const metrics = Object.keys(sampleRow).filter(key => {
        return key !== config.dateField &&
               key !== "Game Type" &&
               key !== "Map" &&
               typeof sampleRow[key] === 'number' || key === "Percentage of Time Moving";
    });
    
    const gamemodeSelector = document.getElementById('gamemodeSelector');
    if (gamemodeSelector) {
        gamemodeSelector.innerHTML = '';
        gameModes.forEach(mode => {
            const option = document.createElement('option');
            option.value = mode.value;
            option.textContent = mode.label;
            if (mode.value === state.currentGamemode) option.selected = true;
            gamemodeSelector.appendChild(option);
        });
    }

    const mapSelector = document.getElementById('mapSelector');
    if (mapSelector) {
        mapSelector.innerHTML = '';
        maps.forEach(map => {
            const option = document.createElement('option');
            option.value = map.value;
            option.textContent = map.label;
            if (map.value === state.currentMap) option.selected = true;
            mapSelector.appendChild(option);
        });
    }

    const metricSelector = document.getElementById('metricSelector');
    if (metricSelector) {
        metricSelector.innerHTML = '';

        const preferredMetrics = [
            "Skill", "Match Outcome", "K/D Ratio", "Kills", "EKIA/D Ratio", "EKIA", "Deaths", "Damage Done", "Damage Taken",
            "Assists", "Score", "Headshot %", "Accuracy %", "Percentage Of Time Moving"
        ];

        const sortedMetrics = [...metrics].sort((a, b) => {
            const indexA = preferredMetrics.indexOf(a);
            const indexB = preferredMetrics.indexOf(b);
            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        sortedMetrics.forEach(metric => {
            const option = document.createElement('option');
            option.value = metric;
            option.textContent = metric;
            if (metric === state.currentMetric) {
                option.selected = true;
            }
            metricSelector.appendChild(option);
        });
    }
}

// --- Data Filtering ---

function filterData() {
    if (!state.data) return [];

    return state.data.filter(d => {
        let gameModeMatch;
        if (state.currentGamemode === "all") {
            gameModeMatch = true;
        } else if (state.currentGamemode === "ranked") {
            gameModeMatch = ["Hardpoint", "Control", "Search and Destroy"].includes(d["Game Type"]);
        } else {
            gameModeMatch = d["Game Type"] === state.currentGamemode;
        }

        const mapMatch = state.currentMap === "all" || d["Map"] === state.currentMap;
        const validMetric = d[state.currentMetric] !== undefined && !isNaN(d[state.currentMetric]);

        if ((state.currentMetric === "K/D Ratio" || state.currentMetric === "EKIA/D Ratio") && d[state.currentMetric] > 30) {
            return false;
        }

        return gameModeMatch && mapMatch && validMetric;
    });
}

// --- Tooltip ---

function showTooltip(event, data) {
    d3.select('#tooltip').remove();

    const tooltip = d3.select('body')
        .append('div')
        .attr('id', 'tooltip')
        .style('position', 'absolute')
        .style('background', 'rgba(0, 0, 0, 0.9)')
        .style('color', '#fff')
        .style('padding', '12px')
        .style('border-radius', '8px')
        .style('font-size', '13px')
        .style('pointer-events', 'none')
        .style('z-index', '1000')
        .style('box-shadow', '0 4px 12px rgba(0,0,0,0.3)')
        .style('max-width', '250px');

    let html = '';
    for (const [key, value] of Object.entries(data)) {
        html += `<div style="margin-bottom: 4px;"><strong>${key}:</strong> ${value}</div>`;
    }
    tooltip.html(html);

    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode.offsetWidth;
    const tooltipHeight = tooltipNode.offsetHeight;

    let left = event.pageX + 15;
    let top = event.pageY - 10;

    if (left + tooltipWidth > window.innerWidth) left = event.pageX - tooltipWidth - 15;
    if (top + tooltipHeight > window.innerHeight) top = event.pageY - tooltipHeight - 10;

    tooltip
        .style('left', left + 'px')
        .style('top', top + 'px')
        .style('opacity', 0)
        .transition()
        .duration(200)
        .style('opacity', 1);
}

function hideTooltip() {
    d3.select('#tooltip')
        .transition()
        .duration(200)
        .style('opacity', 0)
        .remove();
}

// --- Visualization ---

function updateVisualization() {
    if (!state.data || state.data.length === 0) {
        showNoDataState();
        return;
    }

    const oldDataLength = state.filteredData ? state.filteredData.length : 0;
    state.filteredData = filterData();

    if (state.filteredData.length !== oldDataLength) {
        updateStatsSummary();
    }

    createOrUpdateChart();

    if (state.data && state.data.length > 0) {
        renderMatchesTable(state.data);
        renderAdvancedAnalytics(state.data);
    }
}

function updateStatsSummary() {
    const data = state.filteredData;
    if (!data || data.length === 0) return;

    const { wins, losses } = calculateWinLossCounts(data);
    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? (wins / totalGames * 100).toFixed(1) : 0;
    const avgMetric = calculateAverage(data, state.currentMetric);

    const summaryContainer = document.getElementById('statsSummary');
    if (!summaryContainer) return;

    const loadingDiv = document.querySelector('.loading');
    if (loadingDiv) loadingDiv.remove();

    summaryContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-label">Total Games</div>
            <div class="stat-value">${totalGames}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Wins</div>
            <div class="stat-value positive">${wins}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Losses</div>
            <div class="stat-value negative">${losses}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Win Rate</div>
            <div class="stat-value ${winRate >= 50 ? 'positive' : 'negative'}">${winRate}%</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Avg ${state.currentMetric}</div>
            <div class="stat-value">${avgMetric.toFixed(2)}</div>
        </div>
    `;

    renderQuickInsights(data);
    renderRecentStreak(data);
    renderMiniVetoGuide(data);
}

function renderQuickInsights(data) {
    const container = document.getElementById('quickInsights');
    if (!container || data.length === 0) return;

    const insights = [];

    const { wins, losses } = calculateWinLossCounts(data);
    const winRate = wins / (wins + losses) * 100;
    const avgKD = d3.mean(data, d => d['K/D Ratio']);
    const avgScore = d3.mean(data, d => d.Score);

    // Recent performance (last 10 games)
    const recentGames = data.slice(-10);
    const recentWins = recentGames.filter(d => d.isWin).length;
    const recentWinRate = (recentWins / recentGames.length) * 100;

    // K/D by outcome
    const kdWins = d3.mean(data.filter(d => d.isWin), d => d['K/D Ratio']);
    const kdLosses = d3.mean(data.filter(d => !d.isWin), d => d['K/D Ratio']);

    // Ranked data analysis
    const rankedData = data.filter(d => d.isRanked);
    const rankedWinRate = rankedData.length > 0
        ? (rankedData.filter(d => d.isWin).length / rankedData.length * 100)
        : 0;

    // Generate insights based on data
    // Insight 1: Win rate trend
    if (recentWinRate > winRate + 10) {
        insights.push({
            text: `You're on fire! Recent win rate (${recentWinRate.toFixed(0)}%) is up ${(recentWinRate - winRate).toFixed(0)}% from your average.`,
            type: 'positive'
        });
    } else if (recentWinRate < winRate - 10) {
        insights.push({
            text: `Recent slump detected. Win rate dropped ${(winRate - recentWinRate).toFixed(0)}%. Take a break or review your playstyle.`,
            type: 'warning'
        });
    } else {
        insights.push({
            text: `Consistent performance! Your recent win rate (${recentWinRate.toFixed(0)}%) matches your overall average.`,
            type: 'neutral'
        });
    }

    // Insight 2: K/D ratio guidance
    if (avgKD < 1.0) {
        insights.push({
            text: `Focus on staying alive. Your K/D (${avgKD.toFixed(2)}) suggests playing more conservatively might help.`,
            type: 'tip'
        });
    } else if (avgKD > 1.3) {
        insights.push({
            text: `Strong gunfights! Your ${avgKD.toFixed(2)} K/D shows you're winning most engagements.`,
            type: 'positive'
        });
    } else if (kdWins > kdLosses + 0.3) {
        insights.push({
            text: `You play better in wins (${kdWins.toFixed(2)} K/D) vs losses (${kdLosses.toFixed(2)}). Keep that momentum!`,
            type: 'positive'
        });
    }

    // Insight 3: Ranked performance
    if (rankedData.length > 5) {
        if (rankedWinRate > 55) {
            insights.push({
                text: `Ranked dominance! ${rankedWinRate.toFixed(0)}% win rate in ranked shows you're competitive.`,
                type: 'positive'
            });
        } else if (rankedWinRate < 45) {
            insights.push({
                text: `Ranked is tough (${rankedWinRate.toFixed(0)}% WR). Study pro gameplay or focus on one mode to improve.`,
                type: 'tip'
            });
        }
    }

    // Insight 4: Mode variety or specialization
    const uniqueModes = new Set(data.map(d => d['Game Type'])).size;
    if (uniqueModes === 1) {
        insights.push({
            text: `You're specializing in one mode. Try others to develop diverse skills!`,
            type: 'tip'
        });
    } else if (uniqueModes >= 5) {
        insights.push({
            text: `Versatile player! You've played ${uniqueModes} different game modes.`,
            type: 'neutral'
        });
    }

    // Ensure we have at least 3 insights, add generic ones if needed
    if (insights.length < 3) {
        insights.push({
            text: `You've logged ${data.length} matches with an average score of ${avgScore.toFixed(0)}.`,
            type: 'neutral'
        });
    }

    // Limit to 4 insights
    const displayInsights = insights.slice(0, 4);

    container.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">Quick Insights</h3>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${displayInsights.map(insight => `
                <div style="padding: 0.75rem; background: ${
                    insight.type === 'positive' ? 'var(--color-success-light)' :
                    insight.type === 'warning' ? 'var(--color-warning-light)' :
                    'var(--bg-secondary)'
                }; border-radius: 8px; border-left: 3px solid ${
                    insight.type === 'positive' ? 'var(--color-success)' :
                    insight.type === 'warning' ? 'var(--color-warning)' :
                    'var(--text-tertiary)'
                };">
                    <p style="margin: 0; font-size: 0.9rem; color: var(--text-primary); line-height: 1.5;">${insight.text}</p>
                </div>
            `).join('')}
        </div>
    `;
}

function renderRecentStreak(data) {
    const container = document.getElementById('recentStreak');
    if (!container || data.length === 0) return;

    const recentGames = data.slice(-10);

    let currentStreak = 0;
    let streakType = null;
    for (let i = recentGames.length - 1; i >= 0; i--) {
        const game = recentGames[i];
        if (streakType === null) {
            streakType = game.isWin ? 'win' : 'loss';
            currentStreak = 1;
        } else if ((streakType === 'win' && game.isWin) || (streakType === 'loss' && !game.isWin)) {
            currentStreak++;
        } else {
            break;
        }
    }

    const gameIcons = recentGames.map((game, i) => {
        const isWin = game.isWin;
        const isInStreak = (streakType === 'win' && isWin || streakType === 'loss' && !isWin) &&
                          i >= recentGames.length - currentStreak;
        return `
            <div style="
                width: 32px;
                height: 32px;
                border-radius: 6px;
                background: ${isWin ? '#10b981' : '#ef4444'};
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1rem;
                color: white;
                font-weight: 700;
                opacity: ${isInStreak ? '1' : '0.5'};
                border: ${isInStreak ? '2px solid var(--text-primary)' : 'none'};
            ">
                ${isWin ? 'W' : 'L'}
            </div>
        `;
    }).join('');

    const streakLabel = streakType === 'win' ? 'WIN STREAK' : 'LOSS STREAK';
    const streakColor = streakType === 'win' ? '#10b981' : '#ef4444';

    container.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; color: ${streakColor}; margin-bottom: 0.5rem; text-transform: uppercase;">${streakLabel}</div>
            <div style="font-size: 2rem; font-weight: 700; color: ${streakColor}; margin-bottom: 0.25rem;">
                ${currentStreak}
            </div>
            <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
                ${streakType} streak
            </div>
            <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                Last 10 Games
            </div>
            <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
                ${gameIcons}
            </div>
        </div>
    `;
}

function renderMiniVetoGuide(data) {
    const container = document.getElementById('miniVetoGuide');
    if (!container) return;

    const rankedData = data.filter(d =>
        config.rankedMaps.includes(d.Map) &&
        config.rankedModes.includes(d['Game Type'])
    );

    if (rankedData.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-tertiary);">
                <p style="margin: 0; font-size: 0.95rem;">Play more ranked matches to see map veto recommendations</p>
            </div>
        `;
        return;
    }

    const mapPerformance = config.rankedMaps.map(map => {
        const mapData = rankedData.filter(d => d.Map === map);
        if (mapData.length === 0) return null;

        const wins = mapData.filter(d => d['Match Outcome'] === 'win').length;
        const winRate = (wins / mapData.length) * 100;
        const avgKD = d3.mean(mapData, d => d['K/D Ratio']);
        const avgScore = d3.mean(mapData, d => d.Score);

        return {
            map,
            winRate,
            avgKD,
            avgScore,
            matches: mapData.length,
            score: (winRate * 0.5) + (avgKD * 20) + (avgScore / 100)
        };
    }).filter(d => d !== null).sort((a, b) => a.score - b.score);

    if (mapPerformance.length < 2) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-tertiary);">
                <p style="margin: 0; font-size: 0.95rem;">Play more maps to get veto recommendations</p>
            </div>
        `;
        return;
    }

    const worstMaps = mapPerformance.slice(0, Math.min(2, mapPerformance.length));
    const bestMaps = mapPerformance.slice(-Math.min(2, mapPerformance.length)).reverse();

    container.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">Map Veto Cheat Sheet</h3>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
            <!-- Ban These -->
            <div>
                <div style="margin-bottom: 1rem;">
                    <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--color-error);">BAN THESE</h4>
                </div>
                ${worstMaps.map(m => `
                    <div style="padding: 0.75rem; background: var(--color-error-light); border-radius: 8px; border-left: 3px solid var(--color-error); margin-bottom: 0.75rem;">
                        <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); margin-bottom: 0.25rem;">${m.map}</div>
                        <div style="display: flex; gap: 1rem; font-size: 0.8rem; color: var(--text-secondary);">
                            <span>${m.winRate.toFixed(0)}% WR</span>
                            <span>${m.avgKD.toFixed(2)} K/D</span>
                            <span>${m.matches} matches</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Protect These -->
            <div>
                <div style="margin-bottom: 1rem;">
                    <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--color-success);">PROTECT THESE</h4>
                </div>
                ${bestMaps.map(m => `
                    <div style="padding: 0.75rem; background: var(--color-success-light); border-radius: 8px; border-left: 3px solid var(--color-success); margin-bottom: 0.75rem;">
                        <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); margin-bottom: 0.25rem;">${m.map}</div>
                        <div style="display: flex; gap: 1rem; font-size: 0.8rem; color: var(--text-secondary);">
                            <span>${m.winRate.toFixed(0)}% WR</span>
                            <span>${m.avgKD.toFixed(2)} K/D</span>
                            <span>${m.matches} matches</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function createOrUpdateChart() {
    const data = state.filteredData;
    if (!data || data.length === 0) {
        console.warn("No data available to display");
        return;
    }
    
    // Set up dimensions
    const width = config.width() - config.margin.left - config.margin.right;
    const height = config.height() - config.margin.top - config.margin.bottom;
    
    // Get time domain with padding
    const minDate = d3.min(data, d => d[config.dateField]);
    const maxDate = d3.max(data, d => d[config.dateField]);
    const timeRange = [
        d3.timeDay.offset(minDate, -2),
        d3.timeDay.offset(maxDate, 2)
    ];
    
    // Get metric domain with padding
    const minValue = d3.min(data, d => d[state.currentMetric]);
    const maxValue = d3.max(data, d => d[state.currentMetric]);
    
    // Special handling for ratio metrics - use reasonable ranges
    let valueRange;
    
    if (state.currentMetric.includes("Ratio") || state.currentMetric.includes("K/D") || state.currentMetric.includes("EKIA/D")) {
        // For ratio metrics, use a more sensible range
        valueRange = [
            0, // Always start at 0
            Math.min(10, maxValue * 1.3) // Cap at 10 or actual max + 30%
        ];
    } else if (state.currentMetric.includes("%")) {
        // For percentage metrics
        valueRange = [
            0, // Start at 0
            Math.min(100, maxValue * 1.2) // Cap at 100 or actual max + 20%
        ];
    } else {
        // For other metrics
        valueRange = [
            Math.max(0, minValue * 0.9), // Lower bound, minimum of 0
            maxValue * 1.3 // Upper bound with 30% padding (increased from 10%)
        ];
    }
    
    // Create scales
    const xScale = d3.scaleTime()
        .domain(timeRange)
        .range([0, width]);
        
    const yScale = d3.scaleLinear()
        .domain(valueRange)
        .range([height, 0]);
    
    // Store in state for zoom handler
    state.xScale = xScale;
    state.yScale = yScale;

    // Create or select SVG - target the dashboard chart container specifically
    const chartContainer = d3.select('#dashboardChart');

    // Clear the container completely (remove loading text and any old content)
    chartContainer.selectAll('*').remove();

    // Reset state.svg to force fresh creation
    state.svg = null;

    if (!state.svg) {
        state.svg = chartContainer.append("svg")
            .attr("width", width + config.margin.left + config.margin.right)
            .attr("height", height + config.margin.top + config.margin.bottom)
            .style("display", "block")
            .style("margin", "0 auto");
            
        // Add title
        state.svg.append("text")
            .attr("class", "chart-title")
            .attr("x", config.margin.left + width / 2)
            .attr("y", 20)
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("font-weight", "bold");
            
        // Add win/loss counter
        state.svg.append("text")
            .attr("class", "win-loss-counter")
            .attr("x", config.margin.left + width / 2)
            .attr("y", 50) // Adjust this value to move the counter down
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "bold");
            
        // Create main group for chart elements
        state.chartGroup = state.svg.append("g")
            .attr("class", "chart-group")
            .attr("transform", `translate(${config.margin.left},${config.margin.top})`);
            
        // Add clip path
        state.chartGroup.append("clipPath")
            .attr("id", "chart-area-clip")
            .append("rect")
            .attr("width", width)
            .attr("height", height);
            
        // Create group for clipped elements
        state.chartGroup.append("g")
            .attr("class", "clipped-elements")
            .attr("clip-path", "url(#chart-area-clip)");
            
        // Add axes
        state.chartGroup.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`);
            
        state.chartGroup.append("g")
            .attr("class", "y-axis");
            
        // Add axis labels
        state.chartGroup.append("text")
            .attr("class", "x-axis-label")
            .attr("x", width / 2)
            .attr("y", height + 35)
            .attr("text-anchor", "middle")
            .text("Date");
            
        state.chartGroup.append("text")
            .attr("class", "y-axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2)
            .attr("y", -40)
            .attr("text-anchor", "middle");
            
        // Add legend for win/loss colors
        const legend = state.svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${width - 150}, 50)`);
            
        // Win indicator
        legend.append("circle")
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("r", 6)
            .style("fill", config.colors.win);
            
        legend.append("text")
            .attr("x", 15)
            .attr("y", 4)
            .style("font-size", "12px")
            .text("Win");
            
        // Loss indicator
        legend.append("circle")
            .attr("cx", 0)
            .attr("cy", 20)
            .attr("r", 6)
            .style("fill", config.colors.loss);
            
        legend.append("text")
            .attr("x", 15)
            .attr("y", 24)
            .style("font-size", "12px")
            .text("Loss");
            
        // Add average value indicator with dashed line
        legend.append("line")
            .attr("x1", -10)
            .attr("y1", 40)
            .attr("x2", 10)
            .attr("y2", 40)
            .style("stroke", "grey")
            .style("stroke-dasharray", "4,4")
            .style("stroke-width", 2);
            
        legend.append("text")
            .attr("class", "average-legend")
            .attr("x", 14)
            .attr("y", 43)
            .style("font-size", "12px")
            .style("font-weight", "normal");
            
        // Setup zoom behavior
        setupZoom(width, height);
    } else {
        // Update SVG dimensions
        state.svg
            .attr("width", width + config.margin.left + config.margin.right)
            .attr("height", height + config.margin.top + config.margin.bottom);
            
        // Update clip path
        state.chartGroup.select("#chart-area-clip rect")
            .attr("width", width)
            .attr("height", height);
    }
    // Update chart title
    state.svg.select(".chart-title")
        .text(`${state.currentMetric} Over Time${state.currentGamemode !== "all" ? ` (${state.currentGamemode})` : ''}`);
    
    // Update win/loss counter
    const { wins, losses } = calculateWinLossCounts(state.filteredData);
    state.svg.select(".win-loss-counter")
        .text(`Wins: ${wins}`)  // Set text for wins
        .append("tspan")
        .attr("x", config.margin.left + width / 2)
        .attr("dy", "1.3em")
        .text(`Losses: ${losses}`)  // Set text for losses
        .append("tspan")
        .attr("x", config.margin.left + width / 2)
        .attr("dy", "1.2em")
        .text(`Ratio: ${(wins / (wins + losses) * 100).toFixed(1)}%`);  // Set text for ratio

    // Update y-axis label
    state.chartGroup.select(".y-axis-label")
        .text(state.currentMetric);
        
    // Update axes
    state.chartGroup.select(".x-axis")
        .call(d3.axisBottom(xScale));
        
    state.chartGroup.select(".y-axis")
        .call(d3.axisLeft(yScale));
        
    // Line generator
    const line = d3.line()
        .x(d => xScale(d[config.dateField]))
        .y(d => yScale(d[state.currentMetric]))
        .curve(d3.curveMonotoneX);
        
    // Get clipped elements group
    const clippedGroup = state.chartGroup.select(".clipped-elements");
    
    // Update line
    let path = clippedGroup.select(".line-path");
    if (path.empty()) {
        path = clippedGroup.append("path")
            .attr("class", "line-path")
            .style("fill", "none")
            .style("stroke", config.colors.line)
            .style("stroke-width", 2);
    }
    
    path.datum(data)
        .transition()
        .duration(config.transitionDuration)
        .attr("d", line);
        
    // Update dots with data join
    const dots = clippedGroup.selectAll(".data-point")
        .data(data, d => d[config.dateField].getTime());
        
    // Enter selection
    dots.enter()
        .append("circle")
        .attr("class", "data-point")
        .attr("cx", d => xScale(d[config.dateField]))
        .attr("cy", d => yScale(d[state.currentMetric]))
        .attr("r", 0)
        .style("fill", d => {
            // Color dots based on win/loss status
            if (d.isWin === true) {
                return config.colors.win; // Green for wins
            } else if (d.isWin === false) {
                return config.colors.loss; // Red for losses
            } else {
                return config.colors.neutralValue; // Gray for unknown
            }
        })
        .style("opacity", 0.7)
        .on("mouseover", handlePointMouseOver)
        .on("mouseout", handlePointMouseOut)
        .transition()
        .duration(config.transitionDuration)
        .attr("r", config.dotRadius);
        
    // Update selection
    dots.transition()
        .duration(config.transitionDuration)
        .attr("cx", d => xScale(d[config.dateField]))
        .attr("cy", d => yScale(d[state.currentMetric]))
        .style("fill", d => {
            // Color dots based on win/loss status
            if (d.isWin === true) {
                return config.colors.win; // Green for wins
            } else if (d.isWin === false) {
                return config.colors.loss; // Red for losses
            } else {
                return config.colors.neutralValue; // Gray for unknown
            }
        });
        
    // Exit selection
    dots.exit()
        .transition()
        .duration(config.transitionDuration)
        .attr("r", 0)
        .remove();
    
    // Calculate and add average line
    const averageValue = calculateAverage(data, state.currentMetric);
    state.chartGroup.selectAll(".average-line").remove(); // Remove existing average line if any
    
    // Add visible average line
    state.chartGroup.append("line")
        .attr("class", "average-line")
        .attr("x1", 0)
        .attr("y1", yScale(averageValue))
        .attr("x2", width)
        .attr("y2", yScale(averageValue))
        .style("stroke", "grey")
        .style("stroke-dasharray", "4,4")
        .style("stroke-width", 2);
    
    // Update average value in legend
    state.svg.select(".average-legend")
        .text(`Average: ${averageValue.toFixed(2)}`);
}

// Set up zoom behavior
function setupZoom(width, height) {
    const zoom = d3.zoom()
        .scaleExtent([0.5, 500])
        .translateExtent([[-width * 0.2, -height * 0.2], [width * 1.2, height * 1.2]])
        .on("start", () => { state.isZooming = true; })
        .on("zoom", handleZoom)
        .on("end", () => { state.isZooming = false; });
        
    state.svg.call(zoom);
}

// Handle zoom events
function handleZoom(event) {
    // Skip if no data
    if (!state.filteredData || !state.xScale) return;
    
    // Get transformed scales
    const newXScale = event.transform.rescaleX(state.xScale);
    
    // Update x-axis
    state.chartGroup.select(".x-axis")
        .call(d3.axisBottom(newXScale));
        
    // Update clipped elements using the new scale
    const clippedGroup = state.chartGroup.select(".clipped-elements");
    
    // Update line path
    const lineData = d3.line()
        .x(d => newXScale(d[config.dateField]))
        .y(d => state.yScale(d[state.currentMetric]))
        .curve(d3.curveMonotoneX);
    
    clippedGroup.select(".line-path")
        .attr("d", lineData(state.filteredData));
            
    // Update dots positions only (no transitions during zoom for performance)
    clippedGroup.selectAll(".data-point")
        .attr("cx", d => newXScale(d[config.dateField]));
}

// Modify the handlePointMouseOver function to create a static tooltip
function handlePointMouseOver(event, d) {
    // Skip during active zooming for performance
    if (state.isZooming) return;
    
    const point = d3.select(this);
    
    // Highlight point with no transition for immediate feedback
    point.attr("r", config.dotRadiusHover)
        .style("fill", config.colors.dotHover);
        
    // Format date
    const dateFormatter = d3.timeFormat("%Y-%m-%d %H:%M");
    const formattedDate = dateFormatter(d[config.dateField]);
    
    // Create tooltip content with more details
    let tooltipContent = [
        `${state.currentMetric}: ${d[state.currentMetric].toFixed(1)}`,
        `Date: ${formattedDate}`,
        `Game Type: ${d["Game Type"]}`,
        `Result: ${d.isWin === true ? "Win" : d.isWin === false ? "Loss" : "Unknown"}`
    ];
    
    // Add more stats if they exist
    let additionalContent = [];
    
    // Show Kill stats
    if (d.Kills !== undefined) additionalContent.push(`Kills: ${d.Kills}`);
    if (d.Deaths !== undefined) additionalContent.push(`Deaths: ${d.Deaths}`);
    if (d.Assists !== undefined) additionalContent.push(`Assists: ${d.Assists}`);
    
    // If we're looking at a derived metric, also show the components
    if (state.currentMetric === "K/D Ratio" && d.Kills !== undefined && d.Deaths !== undefined) {
        additionalContent.push(`K: ${d.Kills} / D: ${d.Deaths}`);
    }
    
    if (state.currentMetric === "EKIA/D Ratio" && d.Kills !== undefined && d.Deaths !== undefined) {
        additionalContent.push(`EKIA: ${d.Kills + (d.Assists || 0)} / D: ${d.Deaths}`);
    }
    
    // Show team scores if available
    if (d["Team Score"] !== undefined && d["Enemy Score"] !== undefined) {
        additionalContent.push(`Score: ${d["Team Score"]} - ${d["Enemy Score"]}`);
    }
    
    // Calculate how tall the tooltip needs to be
    const totalLines = tooltipContent.length + additionalContent.length;
    const tooltipHeight = 15 + (totalLines * 18);
    const tooltipWidth = 200;
    
    // Remove any existing tooltip
    state.chartGroup.selectAll(".tooltip").remove();
    
    // Get mouse coordinates
    const [mouseX, mouseY] = d3.pointer(event);
    
    // Add tooltip at mouse position with offset
    const tooltip = state.chartGroup.append("g")
        .attr("class", "tooltip")
        .attr("transform", `translate(${mouseX + 10}, ${mouseY - tooltipHeight - 10})`); // Position with offset
            
    // Background rectangle
    tooltip.append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", tooltipWidth)
        .attr("height", tooltipHeight)
        .attr("rx", 5) // Rounded corners
        .attr("ry", 5)
        .style("fill", "white")
        .style("stroke", "#ccc")
        .style("stroke-width", 1)
        .style("opacity", 0.9);
    
    // Add main content
    tooltipContent.forEach((text, i) => {
        tooltip.append("text")
            .attr("x", 10)
            .attr("y", 20 + (i * 18))
            .style("font-size", "12px")
            .text(text);
    });
    
    // Add additional content
    additionalContent.forEach((text, i) => {
        tooltip.append("text")
            .attr("x", 10)
            .attr("y", 20 + ((tooltipContent.length + i) * 18))
            .style("font-size", "12px")
            .text(text);
    });
}

// Update the handlePointMouseOut function
function handlePointMouseOut(event, d) {
    // Skip during active zooming for performance
    if (state.isZooming) return;
    
    // Reset point appearance immediately (no transition)
    d3.select(this)
        .attr("r", config.dotRadius)
        .style("fill", d => {
            if (d.isWin === true) {
                return config.colors.win;
            } else if (d.isWin === false) {
                return config.colors.loss;
            } else {
                return config.colors.neutralValue;
            }
        });
    
    // Remove tooltip
    state.chartGroup.selectAll(".tooltip").remove();
}

function resizeChart() {
    // Update visualization
    updateVisualization();
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// --- Upload ---

async function handleUpload() {
    const fileInput = document.getElementById('csvFileInput');
    const feedback = document.getElementById('uploadFeedback');
    const uploadButton = document.getElementById('uploadButton');

    // Clear previous feedback
    feedback.textContent = '';
    feedback.className = 'upload-feedback';

    // Check if file selected
    if (!fileInput.files || fileInput.files.length === 0) {
        feedback.textContent = 'Please select a CSV file';
        feedback.className = 'upload-feedback error';
        return;
    }

    const file = fileInput.files[0];

    // Validate file type
    if (!file.name.endsWith('.csv')) {
        feedback.textContent = 'Invalid file type. Please select a CSV file';
        feedback.className = 'upload-feedback error';
        return;
    }

    // Show uploading status
    feedback.innerHTML = `
        <div>Processing your data...</div>
        <div style="margin-top: 6px; font-size: 0.8rem; opacity: 0.8;">
            The backend runs on a free server that sometimes needs a moment to wake up.
            I didn't want to pay for a faster one — so please hang tight, usually 10–30 seconds.
        </div>
    `;
    feedback.className = 'upload-feedback info';
    uploadButton.disabled = true;
    uploadButton.textContent = 'Processing...';

    // Create form data
    const formData = new FormData();
    formData.append('file', file);

    try {
        // Upload to API
        const response = await fetch(`${config.apiBaseUrl}/api/upload`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        console.log('Upload response:', result);

        if (response.ok && result.status === 'success') {
            // Success - display uploaded data
            feedback.textContent = `Success! ${result.message}`;
            feedback.className = 'upload-feedback success';

            // Clear file input
            fileInput.value = '';

            // Check if data exists
            if (!result.data || !Array.isArray(result.data)) {
                console.error('Invalid data format in response:', result);
                feedback.textContent = 'Upload succeeded but data format is invalid';
                feedback.className = 'upload-feedback error';
                return;
            }

            // Display the uploaded data (convert to frontend format)
            try {
                displayUploadedData(result.data);
            } catch (displayError) {
                console.error('Error displaying data:', displayError);
                feedback.textContent = `Upload succeeded but failed to display data: ${displayError.message}`;
                feedback.className = 'upload-feedback error';
                return;
            }

            // Auto-close modal after successful upload
            setTimeout(() => {
                closeUploadModal();
            }, 1500);
        } else {
            // Error
            feedback.textContent = result.detail || result.message || 'Upload failed';
            feedback.className = 'upload-feedback error';
        }
    } catch (error) {
        feedback.textContent = `Upload failed: ${error.message}`;
        feedback.className = 'upload-feedback error';
    } finally {
        // Reset button
        uploadButton.disabled = false;
        uploadButton.textContent = 'Upload CSV';
    }
}

function displayUploadedData(apiData) {
    console.log(`Processing ${apiData.length} matches from API`);

    const data = apiData.map((d, index) => {
        try {
            let timestamp;
            if (d.match_start_timestamp) {
                timestamp = new Date(d.match_start_timestamp);
            } else if (d.utc_timestamp) {
                timestamp = new Date(d.utc_timestamp);
            } else {
                console.warn(`Row ${index + 1}: Missing timestamp, using current time`);
                timestamp = new Date();
            }

            if (isNaN(timestamp.getTime())) {
                console.warn(`Row ${index + 1}: Invalid timestamp, using current time`);
                timestamp = new Date();
            }

            return {
                [config.dateField]: timestamp,
                "Game Type": d.game_type || '',
                "Map": d.map || '',
                "Team": d.team || '',
                "Match Outcome": d.match_outcome || '',
                "Skill": d.skill || 0,
                "Score": d.score || 0,
                "Kills": d.kills || 0,
                "Deaths": d.deaths || 0,
                "Assists": d.assists || 0,
                "Headshots": d.headshots || 0,
                "K/D Ratio": d.kd_ratio || 0,
                "EKIA": d.ekia || 0,
                "EKIA/D Ratio": d.ekia_d_ratio || 0,
                "Headshot %": d.headshot_percentage || 0,
                "Accuracy %": d.accuracy_percentage || 0,
                "Shots": d.shots || 0,
                "Hits": d.hits || 0,
                "Damage Done": d.damage_done || 0,
                "Damage Taken": d.damage_taken || 0,
                "Total XP": d.total_xp || 0,
                "Score XP": d.score_xp || 0,
                "Challenge XP": d.challenge_xp || 0,
                "Match XP": d.match_xp || 0,
                "Medal XP": d.medal_xp || 0,
                "Percentage Of Time Moving": d.percentage_of_time_moving || 0,
                "Operator": d.operator || '',
                "Operator Skin": d.operator_skin || '',
                isRanked: d.is_ranked || false,
                isWin: d.match_outcome && d.match_outcome.toLowerCase() === "win"
            };
        } catch (error) {
            console.error(`Error processing row ${index + 1}:`, error, d);
            return null;
        }
    }).filter(d => d !== null);

    // Allow matches without Total XP (like sample data) to pass through
    const filteredData = data.filter(d => !d["Total XP"] || d["Total XP"] > 0);

    console.log(`Filtered ${filteredData.length} matches (from ${data.length} total)`);

    filteredData.sort((a, b) => a[config.dateField] - b[config.dateField]);
    state.data = filteredData;

    try {
        localStorage.setItem('codStatsData', JSON.stringify(filteredData));
        console.log(`Saved ${filteredData.length} matches to localStorage`);
    } catch (error) {
        console.warn('Failed to save to localStorage:', error);
    }

    populateControls(filteredData);
    updateVisualization();
}

// --- Match Table ---

const tableState = {
    data: [],
    filteredData: [],
    currentPage: 1,
    rowsPerPage: 25,
    sortColumn: 'UTC Timestamp',
    sortDirection: 'desc',
    searchTerm: '',
    gameTypeFilter: '',
    mapFilter: ''
};

// Map name to color mapping for placeholder thumbnails
const mapColors = {
    'Nuketown': '#ff6b6b',
    'Babylon': '#4ecdc4',
    'Payback': '#95e1d3',
    'Vorkuta': '#f38181',
    'Red Card': '#aa96da',
    'Derelict': '#fcbad3',
    'Skyline': '#a8e6cf',
    'Protocol': '#ffd3b6',
    'Hacienda': '#ffaaa5',
    'Pit': '#dab894'
};

// Get placeholder color for a map
function getMapColor(mapName) {
    return mapColors[mapName] || '#9ca3af'; // Default gray if not found
}

function renderMatchesTable(data) {
    if (!data || data.length === 0) {
        document.getElementById('matches-table-container').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"></div>
                <div class="empty-state-title">No Match Data</div>
                <div class="empty-state-text">
                    Upload a CSV file to view your match history in table format.
                </div>
            </div>
        `;
        return;
    }

    // Update table state
    tableState.data = data;
    tableState.filteredData = filterTableData();

    // Populate filter dropdowns
    populateTableFilters();

    // Render the table
    renderTable();
    renderPagination();
}

// Populate table filter dropdowns
function populateTableFilters() {
    const gameTypes = [...new Set(tableState.data.map(d => d['Game Type']))];
    const maps = [...new Set(tableState.data.map(d => d.Map))];

    const gameTypeFilter = document.getElementById('tableGameTypeFilter');
    const mapFilter = document.getElementById('tableMapFilter');

    // Populate game type filter
    gameTypeFilter.innerHTML = '<option value="">All Game Types</option>';
    gameTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        gameTypeFilter.appendChild(option);
    });

    // Populate map filter
    mapFilter.innerHTML = '<option value="">All Maps</option>';
    maps.forEach(map => {
        const option = document.createElement('option');
        option.value = map;
        option.textContent = map;
        mapFilter.appendChild(option);
    });
}

function filterTableData() {
    let filtered = [...tableState.data];

    if (tableState.searchTerm) {
        const search = tableState.searchTerm.toLowerCase();
        filtered = filtered.filter(d => {
            return (
                d['Game Type']?.toLowerCase().includes(search) ||
                d.Map?.toLowerCase().includes(search) ||
                d['Match Outcome']?.toLowerCase().includes(search)
            );
        });
    }

    if (tableState.gameTypeFilter) {
        filtered = filtered.filter(d => d['Game Type'] === tableState.gameTypeFilter);
    }

    if (tableState.mapFilter) {
        filtered = filtered.filter(d => d.Map === tableState.mapFilter);
    }

    filtered.sort((a, b) => {
        let aVal = a[tableState.sortColumn];
        let bVal = b[tableState.sortColumn];

        if (aVal instanceof Date) {
            aVal = aVal.getTime();
            bVal = bVal.getTime();
        }

        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return tableState.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        } else {
            const comparison = String(aVal).localeCompare(String(bVal));
            return tableState.sortDirection === 'asc' ? comparison : -comparison;
        }
    });

    return filtered;
}

function renderTable() {
    const container = document.getElementById('matches-table-container');
    const startIdx = (tableState.currentPage - 1) * tableState.rowsPerPage;
    const endIdx = startIdx + tableState.rowsPerPage;
    const pageData = tableState.filteredData.slice(startIdx, endIdx);

    if (tableState.filteredData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"></div>
                <div class="empty-state-title">No Matches Found</div>
                <div class="empty-state-text">
                    Try adjusting your filters or search term.
                </div>
            </div>
        `;
        return;
    }

    const tableHTML = `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th onclick="sortTable('UTC Timestamp')" class="sortable ${tableState.sortColumn === 'UTC Timestamp' ? 'sorted-' + tableState.sortDirection : ''}">
                            Date ${tableState.sortColumn === 'UTC Timestamp' ? (tableState.sortDirection === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th>Map</th>
                        <th onclick="sortTable('Game Type')" class="sortable ${tableState.sortColumn === 'Game Type' ? 'sorted-' + tableState.sortDirection : ''}">
                            Type ${tableState.sortColumn === 'Game Type' ? (tableState.sortDirection === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th onclick="sortTable('Match Outcome')" class="sortable ${tableState.sortColumn === 'Match Outcome' ? 'sorted-' + tableState.sortDirection : ''}">
                            Result ${tableState.sortColumn === 'Match Outcome' ? (tableState.sortDirection === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th onclick="sortTable('Kills')" class="sortable ${tableState.sortColumn === 'Kills' ? 'sorted-' + tableState.sortDirection : ''}">
                            K ${tableState.sortColumn === 'Kills' ? (tableState.sortDirection === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th onclick="sortTable('Deaths')" class="sortable ${tableState.sortColumn === 'Deaths' ? 'sorted-' + tableState.sortDirection : ''}">
                            D ${tableState.sortColumn === 'Deaths' ? (tableState.sortDirection === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th onclick="sortTable('K/D Ratio')" class="sortable ${tableState.sortColumn === 'K/D Ratio' ? 'sorted-' + tableState.sortDirection : ''}">
                            K/D ${tableState.sortColumn === 'K/D Ratio' ? (tableState.sortDirection === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th onclick="sortTable('EKIA/D Ratio')" class="sortable ${tableState.sortColumn === 'EKIA/D Ratio' ? 'sorted-' + tableState.sortDirection : ''}">
                            EKIA/D ${tableState.sortColumn === 'EKIA/D Ratio' ? (tableState.sortDirection === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th onclick="sortTable('Skill')" class="sortable ${tableState.sortColumn === 'Skill' ? 'sorted-' + tableState.sortDirection : ''}">
                            Skill ${tableState.sortColumn === 'Skill' ? (tableState.sortDirection === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th onclick="sortTable('Score')" class="sortable ${tableState.sortColumn === 'Score' ? 'sorted-' + tableState.sortDirection : ''}">
                            Score ${tableState.sortColumn === 'Score' ? (tableState.sortDirection === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th onclick="sortTable('Accuracy %')" class="sortable ${tableState.sortColumn === 'Accuracy %' ? 'sorted-' + tableState.sortDirection : ''}">
                            Acc% ${tableState.sortColumn === 'Accuracy %' ? (tableState.sortDirection === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th onclick="sortTable('Headshot %')" class="sortable ${tableState.sortColumn === 'Headshot %' ? 'sorted-' + tableState.sortDirection : ''}">
                            HS% ${tableState.sortColumn === 'Headshot %' ? (tableState.sortDirection === 'asc' ? '↑' : '↓') : ''}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    ${pageData.map(match => renderTableRow(match)).join('')}
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = tableHTML;
}

// Render a single table row
function renderTableRow(match) {
    const dateFormatter = d3.timeFormat("%Y-%m-%d %H:%M");
    const date = dateFormatter(match['UTC Timestamp']);
    const mapColor = getMapColor(match.Map);
    const mapInitial = match.Map ? match.Map.charAt(0).toUpperCase() : '?';
    const outcomeClass = match.isWin ? 'positive' : 'negative';
    const outcomeIcon = match.isWin ? '✓' : '✗';

    return `
        <tr class="table-row">
            <td>${date}</td>
            <td>
                <div class="map-cell">
                    <div class="map-thumbnail" style="background-color: ${mapColor}">
                        ${mapInitial}
                    </div>
                    <span>${match.Map}</span>
                </div>
            </td>
            <td>${match['Game Type']}</td>
            <td><span class="outcome-badge ${outcomeClass}">${outcomeIcon} ${match.isWin ? 'Win' : 'Loss'}</span></td>
            <td>${match.Kills || 0}</td>
            <td>${match.Deaths || 0}</td>
            <td>${match['K/D Ratio'] ? match['K/D Ratio'].toFixed(2) : '0.00'}</td>
            <td>${match['EKIA/D Ratio'] ? match['EKIA/D Ratio'].toFixed(2) : '0.00'}</td>
            <td>${match.Skill || 0}</td>
            <td>${match.Score || 0}</td>
            <td>${match['Accuracy %'] ? match['Accuracy %'].toFixed(1) + '%' : 'N/A'}</td>
            <td>${match['Headshot %'] ? match['Headshot %'].toFixed(1) + '%' : 'N/A'}</td>
        </tr>
    `;
}

// Render pagination controls
function renderPagination() {
    const totalPages = Math.ceil(tableState.filteredData.length / tableState.rowsPerPage);
    const paginationContainer = document.getElementById('tablePagination');

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let paginationHTML = '<div class="pagination">';

    // Previous button
    if (tableState.currentPage > 1) {
        paginationHTML += `<button onclick="changePage(${tableState.currentPage - 1})" class="pagination-btn">← Previous</button>`;
    }

    // Page numbers
    const maxVisiblePages = 7;
    let startPage = Math.max(1, tableState.currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        paginationHTML += `<button onclick="changePage(1)" class="pagination-btn">1</button>`;
        if (startPage > 2) {
            paginationHTML += `<span class="pagination-ellipsis">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === tableState.currentPage ? 'active' : '';
        paginationHTML += `<button onclick="changePage(${i})" class="pagination-btn ${activeClass}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span class="pagination-ellipsis">...</span>`;
        }
        paginationHTML += `<button onclick="changePage(${totalPages})" class="pagination-btn">${totalPages}</button>`;
    }

    // Next button
    if (tableState.currentPage < totalPages) {
        paginationHTML += `<button onclick="changePage(${tableState.currentPage + 1})" class="pagination-btn">Next →</button>`;
    }

    paginationHTML += `</div>`;
    paginationHTML += `<div class="pagination-info">Showing ${((tableState.currentPage - 1) * tableState.rowsPerPage) + 1}-${Math.min(tableState.currentPage * tableState.rowsPerPage, tableState.filteredData.length)} of ${tableState.filteredData.length} matches</div>`;

    paginationContainer.innerHTML = paginationHTML;
}

// Sort table by column
function sortTable(column) {
    if (tableState.sortColumn === column) {
        // Toggle direction if same column
        tableState.sortDirection = tableState.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New column, default to descending for most columns, ascending for dates
        tableState.sortColumn = column;
        tableState.sortDirection = column === 'UTC Timestamp' ? 'desc' : 'desc';
    }

    tableState.filteredData = filterTableData();
    renderTable();
    renderPagination();
}

// Change page
function changePage(page) {
    tableState.currentPage = page;
    renderTable();
    renderPagination();

    // Scroll to top of table
    document.getElementById('matches-view').scrollIntoView({ behavior: 'smooth' });
}

// Handle table search
function handleTableSearch(event) {
    tableState.searchTerm = event.target.value;
    tableState.currentPage = 1;
    tableState.filteredData = filterTableData();
    renderTable();
    renderPagination();
}

// Handle game type filter
function handleGameTypeFilter(event) {
    tableState.gameTypeFilter = event.target.value;
    tableState.currentPage = 1;
    tableState.filteredData = filterTableData();
    renderTable();
    renderPagination();
}

// Handle map filter
function handleMapFilter(event) {
    tableState.mapFilter = event.target.value;
    tableState.currentPage = 1;
    tableState.filteredData = filterTableData();
    renderTable();
    renderPagination();
}

// Attach event listeners for table filters (called once on page load)
function attachTableEventListeners() {
    const searchInput = document.getElementById('tableSearch');
    const gameTypeFilter = document.getElementById('tableGameTypeFilter');
    const mapFilter = document.getElementById('tableMapFilter');

    if (searchInput) {
        searchInput.addEventListener('input', handleTableSearch);
    }

    if (gameTypeFilter) {
        gameTypeFilter.addEventListener('change', handleGameTypeFilter);
    }

    if (mapFilter) {
        mapFilter.addEventListener('change', handleMapFilter);
    }
}

// Export table data to CSV (Phase 5)
function exportTableToCSV() {
    if (!tableState.filteredData || tableState.filteredData.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    // Define columns to export
    const columns = [
        { key: 'UTC Timestamp', label: 'Date' },
        { key: 'Game Type', label: 'Game Type' },
        { key: 'Map', label: 'Map' },
        { key: 'Match Outcome', label: 'Outcome' },
        { key: 'Kills', label: 'Kills' },
        { key: 'Deaths', label: 'Deaths' },
        { key: 'Assists', label: 'Assists' },
        { key: 'K/D Ratio', label: 'K/D Ratio' },
        { key: 'EKIA', label: 'EKIA' },
        { key: 'EKIA/D Ratio', label: 'EKIA/D Ratio' },
        { key: 'Skill', label: 'Skill' },
        { key: 'Score', label: 'Score' },
        { key: 'Accuracy %', label: 'Accuracy %' },
        { key: 'Headshot %', label: 'Headshot %' },
        { key: 'Damage Done', label: 'Damage Done' },
        { key: 'Damage Taken', label: 'Damage Taken' }
    ];

    // Build CSV header
    let csvContent = columns.map(col => col.label).join(',') + '\n';

    // Build CSV rows
    const dateFormatter = d3.timeFormat("%Y-%m-%d %H:%M");
    tableState.filteredData.forEach(row => {
        const values = columns.map(col => {
            let value = row[col.key];

            // Format dates
            if (col.key === 'UTC Timestamp' && value instanceof Date) {
                value = dateFormatter(value);
            }

            // Format match outcome
            if (col.key === 'Match Outcome') {
                value = row.isWin ? 'Win' : 'Loss';
            }

            // Format numbers
            if (typeof value === 'number') {
                value = value.toFixed(2);
            }

            // Handle undefined/null
            if (value === undefined || value === null) {
                value = '';
            }

            // Escape commas and quotes
            value = String(value).replace(/"/g, '""');
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                value = `"${value}"`;
            }

            return value;
        });

        csvContent += values.join(',') + '\n';
    });

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `cod-matches-${new Date().toISOString().split('T')[0]}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported ${tableState.filteredData.length} matches to ${filename}`, 'success');
}

// Show toast notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 3000);
}

const analyticsState = {
    currentChart: 'ranked-overview',  // Match the default active tab in HTML
    barChartMetric: 'K/D Ratio',
    donutChartFilter: 'all'
};

// --- Analytics ---

function renderAdvancedAnalytics(data) {
    if (!data || data.length === 0) {
        ['mapPerformanceChart', 'timeOfDayChart', 'sessionFatigueChart', 'barChart', 'donutChart', 'heatmapChart'].forEach(id => {
            const elem = document.getElementById(id);
            if (elem) {
                elem.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"></div>
                        <div class="empty-state-title">No Data Available</div>
                        <div class="empty-state-text">
                            Upload a CSV file to view advanced analytics.
                        </div>
                    </div>
                `;
            }
        });
        return;
    }

    // Only render the default/active chart - others will be lazy-loaded when clicked
    // This dramatically improves initial load performance
    const currentChart = analyticsState.currentChart;
    renderChartByType(currentChart, data);

    // Attach event listeners
    attachAnalyticsEventListeners();
}

// Helper: Render specific chart by type (for lazy loading)
function renderChartByType(chartType, data) {
    const chartRenderers = {
        'ranked-overview': renderRankedOverview,
        'map-veto': renderMapVetoGuide,
        'consistency': renderConsistencyAnalysis,
        'win-rate-grid': renderWinRateGrid,
        'map-performance': renderMapPerformance,
        'time-of-day': renderTimeOfDay,
        'session-fatigue': renderSessionFatigue,
        'bar': renderBarChart,
        'donut': renderDonutChart,
        'heatmap': renderHeatmap
    };

    const renderer = chartRenderers[chartType];
    if (renderer && data) {
        renderer(data);
    }
}

// Switch between analytics charts
function switchAnalyticsChart(chartType) {
    analyticsState.currentChart = chartType;

    // Update tab buttons
    document.querySelectorAll('.chart-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-chart') === chartType) {
            btn.classList.add('active');
        }
    });

    // Show/hide chart containers
    document.querySelectorAll('#analytics-view .chart-section').forEach(section => {
        section.classList.remove('active-chart');
    });

    const chartMap = {
        'ranked-overview': 'ranked-overview-container',
        'map-veto': 'map-veto-container',
        'consistency': 'consistency-container',
        'win-rate-grid': 'win-rate-grid-container',
        'map-performance': 'map-performance-container',
        'time-of-day': 'time-of-day-container',
        'session-fatigue': 'session-fatigue-container',
        'bar': 'bar-chart-container',
        'donut': 'donut-chart-container',
        'heatmap': 'heatmap-container'
    };

    const containerId = chartMap[chartType];
    if (containerId) {
        document.getElementById(containerId).classList.add('active-chart');
    }

    // Lazy render: Only render the chart when switching to it
    if (state.data) {
        renderChartByType(chartType, state.data);
    }
}

function renderBarChart(data) {
    const container = d3.select('#barChart');
    container.selectAll('*').remove();

    const metric = analyticsState.barChartMetric;

    // Group data by game type
    const gameTypes = [...new Set(data.map(d => d['Game Type']))];
    const chartData = gameTypes.map(type => {
        const typeData = data.filter(d => d['Game Type'] === type);
        const avgValue = d3.mean(typeData, d => d[metric]);
        return {
            gameType: type,
            value: avgValue || 0,
            count: typeData.length
        };
    }).filter(d => d.count > 0);

    // Set up dimensions
    const margin = { top: 40, right: 30, bottom: 80, left: 60 };
    const width = Math.min(800, container.node().getBoundingClientRect().width) - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Create SVG
    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3.scaleBand()
        .domain(chartData.map(d => d.gameType))
        .range([0, width])
        .padding(0.3);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.value) * 1.1])
        .range([height, 0]);

    // Add axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale))
        .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end')
        .style('font-size', '12px');

    svg.append('g')
        .call(d3.axisLeft(yScale))
        .selectAll('text')
        .style('font-size', '12px');

    // Add bars
    svg.selectAll('.bar')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => xScale(d.gameType))
        .attr('width', xScale.bandwidth())
        .attr('y', height)
        .attr('height', 0)
        .attr('fill', '#6366f1')
        .attr('rx', 4)
        .on('mouseover', function(event, d) {
            d3.select(this).attr('fill', '#4f46e5');

            // Show tooltip
            svg.append('text')
                .attr('class', 'bar-tooltip')
                .attr('x', xScale(d.gameType) + xScale.bandwidth() / 2)
                .attr('y', yScale(d.value) - 10)
                .attr('text-anchor', 'middle')
                .style('font-size', '14px')
                .style('font-weight', 'bold')
                .style('fill', '#111827')
                .text(`${d.value.toFixed(2)} (${d.count} matches)`);
        })
        .on('mouseout', function(event, d) {
            d3.select(this).attr('fill', '#6366f1');
            svg.selectAll('.bar-tooltip').remove();
        })
        .transition()
        .duration(800)
        .attr('y', d => yScale(d.value))
        .attr('height', d => height - yScale(d.value));

    // Add value labels on bars
    svg.selectAll('.bar-label')
        .data(chartData)
        .enter()
        .append('text')
        .attr('class', 'bar-label')
        .attr('x', d => xScale(d.gameType) + xScale.bandwidth() / 2)
        .attr('y', d => yScale(d.value) - 5)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('fill', '#111827')
        .text(d => d.value.toFixed(1));

    // Add Y-axis label
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -40)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#6b7280')
        .text(`Average ${metric}`);
}

function renderDonutChart(data) {
    const container = d3.select('#donutChart');
    container.selectAll('*').remove();

    // Filter data based on selection
    let filteredData = data;
    if (analyticsState.donutChartFilter === 'ranked') {
        filteredData = data.filter(d => d.isRanked);
    }

    // Count wins and losses
    const wins = filteredData.filter(d => d.isWin === true).length;
    const losses = filteredData.filter(d => d.isWin === false).length;
    const total = wins + losses;

    if (total === 0) {
        container.html(`
            <div class="empty-state">
                <div class="empty-state-icon"></div>
                <div class="empty-state-title">No Match Data</div>
            </div>
        `);
        return;
    }

    const winRate = ((wins / total) * 100).toFixed(1);

    const pieData = [
        { label: 'Wins', value: wins, color: '#10b981' },
        { label: 'Losses', value: losses, color: '#ef4444' }
    ];

    // Set up dimensions
    const width = 400;
    const height = 400;
    const radius = Math.min(width, height) / 2 - 40;
    const innerRadius = radius * 0.6;

    // Create SVG
    const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);

    // Create pie and arc generators
    const pie = d3.pie()
        .value(d => d.value)
        .sort(null);

    const arc = d3.arc()
        .innerRadius(innerRadius)
        .outerRadius(radius);

    const arcHover = d3.arc()
        .innerRadius(innerRadius)
        .outerRadius(radius + 10);

    // Draw arcs
    const arcs = svg.selectAll('.arc')
        .data(pie(pieData))
        .enter()
        .append('g')
        .attr('class', 'arc');

    arcs.append('path')
        .attr('d', arc)
        .attr('fill', d => d.data.color)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 3)
        .on('mouseover', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('d', arcHover);
        })
        .on('mouseout', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('d', arc);
        })
        .transition()
        .duration(800)
        .attrTween('d', function(d) {
            const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
            return function(t) {
                return arc(interpolate(t));
            };
        });

    // Add center text
    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.5em')
        .style('font-size', '48px')
        .style('font-weight', '700')
        .style('fill', '#111827')
        .text(`${winRate}%`);

    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.5em')
        .style('font-size', '16px')
        .style('fill', '#6b7280')
        .text('Win Rate');

    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '3em')
        .style('font-size', '14px')
        .style('fill', '#9ca3af')
        .text(`${total} matches`);

    // Add legend
    const legend = svg.append('g')
        .attr('transform', `translate(${radius + 40}, ${-radius + 20})`);

    pieData.forEach((d, i) => {
        const legendRow = legend.append('g')
            .attr('transform', `translate(0, ${i * 30})`);

        legendRow.append('rect')
            .attr('width', 20)
            .attr('height', 20)
            .attr('rx', 4)
            .attr('fill', d.color);

        legendRow.append('text')
            .attr('x', 30)
            .attr('y', 15)
            .style('font-size', '14px')
            .style('fill', '#111827')
            .text(`${d.label}: ${d.value}`);
    });
}

function renderHeatmap(data) {
    const container = d3.select('#heatmapChart');
    container.selectAll('*').remove();

    // Select metrics to correlate
    const metrics = [
        'K/D Ratio',
        'EKIA/D Ratio',
        'Skill',
        'Score',
        'Kills',
        'Deaths',
        'Accuracy %',
        'Headshot %',
        'Damage Done'
    ];

    // Calculate correlation matrix
    const correlationMatrix = [];
    metrics.forEach((metric1, i) => {
        const row = [];
        metrics.forEach((metric2, j) => {
            const validData = data.filter(d =>
                d[metric1] !== undefined && !isNaN(d[metric1]) &&
                d[metric2] !== undefined && !isNaN(d[metric2])
            );

            if (validData.length > 5) {
                const correlation = calculatePearsonCorrelation(
                    validData.map(d => d[metric1]),
                    validData.map(d => d[metric2])
                );
                row.push({
                    x: j,
                    y: i,
                    metric1: metric1,
                    metric2: metric2,
                    correlation: correlation
                });
            } else {
                row.push({
                    x: j,
                    y: i,
                    metric1: metric1,
                    metric2: metric2,
                    correlation: 0
                });
            }
        });
        correlationMatrix.push(row);
    });

    // Flatten matrix
    const flatMatrix = correlationMatrix.flat();

    // Set up dimensions
    const cellSize = 60;
    const margin = { top: 100, right: 50, bottom: 50, left: 120 };
    const width = metrics.length * cellSize;
    const height = metrics.length * cellSize;

    // Create SVG
    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Color scale
    const colorScale = d3.scaleLinear()
        .domain([-1, 0, 1])
        .range(['#ef4444', '#f3f4f6', '#10b981']);

    // Draw cells
    svg.selectAll('.cell')
        .data(flatMatrix)
        .enter()
        .append('rect')
        .attr('class', 'cell')
        .attr('x', d => d.x * cellSize)
        .attr('y', d => d.y * cellSize)
        .attr('width', cellSize - 2)
        .attr('height', cellSize - 2)
        .attr('rx', 4)
        .attr('fill', d => colorScale(d.correlation))
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2)
        .on('mouseover', function(event, d) {
            d3.select(this)
                .attr('stroke', '#111827')
                .attr('stroke-width', 3);

            // Show tooltip
            const tooltip = svg.append('g')
                .attr('class', 'heatmap-tooltip')
                .attr('transform', `translate(${d.x * cellSize + cellSize / 2}, ${d.y * cellSize - 10})`);

            const text = `${d.correlation.toFixed(2)}`;
            const bbox = { width: 60, height: 30 };

            tooltip.append('rect')
                .attr('x', -bbox.width / 2)
                .attr('y', -bbox.height)
                .attr('width', bbox.width)
                .attr('height', bbox.height)
                .attr('rx', 4)
                .attr('fill', '#111827')
                .attr('opacity', 0.9);

            tooltip.append('text')
                .attr('text-anchor', 'middle')
                .attr('y', -bbox.height / 2 + 5)
                .style('font-size', '14px')
                .style('font-weight', 'bold')
                .style('fill', '#ffffff')
                .text(text);
        })
        .on('mouseout', function(event, d) {
            d3.select(this)
                .attr('stroke', '#ffffff')
                .attr('stroke-width', 2);
            svg.selectAll('.heatmap-tooltip').remove();
        });

    // Add correlation values
    svg.selectAll('.cell-text')
        .data(flatMatrix)
        .enter()
        .append('text')
        .attr('class', 'cell-text')
        .attr('x', d => d.x * cellSize + cellSize / 2)
        .attr('y', d => d.y * cellSize + cellSize / 2 + 5)
        .attr('text-anchor', 'middle')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('fill', d => Math.abs(d.correlation) > 0.5 ? '#ffffff' : '#111827')
        .style('pointer-events', 'none')
        .text(d => d.correlation.toFixed(2));

    // Add X-axis labels
    svg.selectAll('.x-label')
        .data(metrics)
        .enter()
        .append('text')
        .attr('class', 'x-label')
        .attr('x', (d, i) => i * cellSize + cellSize / 2)
        .attr('y', -10)
        .attr('text-anchor', 'end')
        .attr('transform', (d, i) => `rotate(-45, ${i * cellSize + cellSize / 2}, -10)`)
        .style('font-size', '12px')
        .style('fill', '#6b7280')
        .text(d => d);

    // Add Y-axis labels
    svg.selectAll('.y-label')
        .data(metrics)
        .enter()
        .append('text')
        .attr('class', 'y-label')
        .attr('x', -10)
        .attr('y', (d, i) => i * cellSize + cellSize / 2 + 5)
        .attr('text-anchor', 'end')
        .style('font-size', '12px')
        .style('fill', '#6b7280')
        .text(d => d);
}

// ===== NEW ACTIONABLE ANALYTICS CHARTS =====

// 1. Map Performance Chart
function renderMapPerformance(data) {
    const container = d3.select('#mapPerformanceChart');
    container.selectAll('*').remove();

    // Group by map and calculate stats
    const mapGroups = d3.group(data, d => d.Map);
    const mapStats = Array.from(mapGroups, ([map, matches]) => {
        const wins = matches.filter(m => m.isWin).length;
        const total = matches.length;
        const winRate = (wins / total) * 100;
        const avgKD = d3.mean(matches, m => m['K/D Ratio']);
        return {
            map,
            winRate,
            avgKD,
            total,
            wins
        };
    }).sort((a, b) => b.winRate - a.winRate);

    // Create table
    const table = container.append('div')
        .attr('class', 'table-wrapper')
        .append('table')
        .attr('class', 'data-table');

    // Header
    const thead = table.append('thead').append('tr');
    thead.selectAll('th')
        .data(['Rank', 'Map', 'Win Rate', 'Avg K/D', 'Matches', 'Performance'])
        .enter()
        .append('th')
        .text(d => d);

    // Rows
    const tbody = table.append('tbody');
    const rows = tbody.selectAll('tr')
        .data(mapStats)
        .enter()
        .append('tr');

    // Rank
    rows.append('td')
        .style('font-weight', '700')
        .text((d, i) => i + 1);

    // Map name
    rows.append('td')
        .html(d => {
            const mapColor = getMapColor(d.map);
            const initial = d.map ? d.map.charAt(0).toUpperCase() : '?';
            return `
                <div class="map-cell">
                    <div class="map-thumbnail" style="background-color: ${mapColor}">${initial}</div>
                    <span>${d.map}</span>
                </div>
            `;
        });

    // Win rate
    rows.append('td')
        .style('font-weight', '600')
        .style('color', d => d.winRate >= 50 ? '#10b981' : '#ef4444')
        .text(d => `${d.winRate.toFixed(1)}%`);

    // Avg K/D
    rows.append('td')
        .style('font-weight', '600')
        .style('color', d => d.avgKD >= 1.0 ? '#10b981' : '#ef4444')
        .text(d => d.avgKD.toFixed(2));

    // Total matches
    rows.append('td')
        .text(d => d.total);

    // Performance indicator
    rows.append('td')
        .html(d => {
            let grade, color;
            if (d.winRate >= 60 && d.avgKD >= 1.2) {
                grade = 'S';
                color = '#10b981';
            } else if (d.winRate >= 50 && d.avgKD >= 1.0) {
                grade = 'A';
                color = '#10b981';
            } else if (d.winRate >= 45) {
                grade = 'B';
                color = '#f59e0b';
            } else {
                grade = 'C';
                color = '#ef4444';
            }
            return `<span style="display: inline-block; padding: 4px 12px; border-radius: 6px; background: ${color}22; color: ${color}; font-weight: 700; font-size: 14px;">${grade}</span>`;
        });
}

// 4. Time of Day Performance
function renderTimeOfDay(data) {
    const container = d3.select('#timeOfDayChart');
    container.selectAll('*').remove();

    if (!data || data.length === 0) {
        container.html('<div class="empty-state"><p>No data available</p></div>');
        return;
    }

    // Extract hour and group
    const hourGroups = d3.group(data, d => d['UTC Timestamp'].getHours());
    const hourStats = Array.from(hourGroups, ([hour, matches]) => {
        const wins = matches.filter(m => m.isWin).length;
        const total = matches.length;
        const winRate = (wins / total) * 100;
        const avgKD = d3.mean(matches, m => m['K/D Ratio']);
        return {
            hour,
            winRate,
            avgKD,
            total
        };
    }).sort((a, b) => a.hour - b.hour);

    if (hourStats.length === 0) {
        container.html('<div class="empty-state"><p>No time data available</p></div>');
        return;
    }

    // Set up dimensions
    const margin = { top: 40, right: 30, bottom: 60, left: 60 };
    const containerWidth = container.node() ? container.node().getBoundingClientRect().width : 900;
    const width = Math.min(900, containerWidth) - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Create SVG
    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleBand()
        .domain(hourStats.map(d => d.hour))
        .range([0, width])
        .padding(0.2);

    const yScale = d3.scaleLinear()
        .domain([0, 100])
        .range([height, 0]);

    // Axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(h => `${h}:00`))
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');

    svg.append('g')
        .call(d3.axisLeft(yScale).tickFormat(d => `${d}%`))
        .style('font-size', '12px');

    // Bars
    svg.selectAll('.bar')
        .data(hourStats)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => xScale(d.hour))
        .attr('y', d => yScale(d.winRate))
        .attr('width', xScale.bandwidth())
        .attr('height', d => height - yScale(d.winRate))
        .attr('fill', d => d.winRate >= 50 ? '#10b981' : '#ef4444')
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this).attr('opacity', 0.7);
            showTooltip(event, {
                Hour: `${d.hour}:00`,
                'Win Rate': `${d.winRate.toFixed(1)}%`,
                'Avg K/D': d.avgKD.toFixed(2),
                Matches: d.total
            });
        })
        .on('mouseout', function() {
            d3.select(this).attr('opacity', 1);
            hideTooltip();
        });

    // Labels
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + 55)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#6b7280')
        .text('Hour of Day');

    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -45)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#6b7280')
        .text('Win Rate (%)');

    // Best hour indicator
    const bestHour = hourStats.reduce((best, current) =>
        current.winRate > best.winRate ? current : best
    );

    svg.append('text')
        .attr('x', width - 10)
        .attr('y', 20)
        .attr('text-anchor', 'end')
        .style('font-size', '14px')
        .style('font-weight', '600')
        .style('fill', '#10b981')
        .text(`Best: ${bestHour.hour}:00 (${bestHour.winRate.toFixed(1)}%)`);
}

// 5. Session Fatigue Analysis
function renderSessionFatigue(data) {
    const container = d3.select('#sessionFatigueChart');
    container.selectAll('*').remove();

    // Sort by timestamp
    const sortedData = data.slice().sort((a, b) => a['UTC Timestamp'] - b['UTC Timestamp']);

    // Detect sessions (games within 2 hours of each other)
    const sessionGap = 2 * 60 * 60 * 1000; // 2 hours in ms
    const sessions = [];
    let currentSession = [];

    sortedData.forEach((game, i) => {
        if (i === 0 || (game['UTC Timestamp'] - sortedData[i-1]['UTC Timestamp']) <= sessionGap) {
            currentSession.push(game);
        } else {
            if (currentSession.length >= 3) {
                sessions.push(currentSession);
            }
            currentSession = [game];
        }
    });
    if (currentSession.length >= 3) {
        sessions.push(currentSession);
    }

    if (sessions.length === 0) {
        container.append('div')
            .attr('class', 'empty-state')
            .html(`
                <div class="empty-state-icon"></div>
                <div class="empty-state-title">Not Enough Session Data</div>
                <div class="empty-state-text">
                    Need at least one session with 3+ games to analyze fatigue patterns.
                </div>
            `);
        return;
    }

    // Calculate average K/D by game number in session
    const maxGameNum = Math.max(...sessions.map(s => s.length));
    const gameNumStats = [];

    for (let gameNum = 1; gameNum <= maxGameNum; gameNum++) {
        const gamesAtPosition = sessions
            .filter(s => s.length >= gameNum)
            .map(s => s[gameNum - 1]);

        if (gamesAtPosition.length >= 3) {
            gameNumStats.push({
                gameNum,
                avgKD: d3.mean(gamesAtPosition, g => g['K/D Ratio']),
                count: gamesAtPosition.length
            });
        }
    }

    // Check if we have enough data
    if (gameNumStats.length === 0) {
        container.append('div')
            .attr('class', 'empty-state')
            .html(`
                <div class="empty-state-icon"></div>
                <div class="empty-state-title">Not Enough Data</div>
                <div class="empty-state-text">
                    Need more games per session to analyze fatigue patterns.
                </div>
            `);
        return;
    }

    // Set up dimensions
    const margin = { top: 40, right: 30, bottom: 60, left: 60 };
    const width = Math.min(900, container.node().getBoundingClientRect().width) - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Create SVG
    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
        .domain([1, maxGameNum])
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain([d3.min(gameNumStats, d => d.avgKD) * 0.9, d3.max(gameNumStats, d => d.avgKD) * 1.1])
        .range([height, 0]);

    // Axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(maxGameNum))
        .style('font-size', '12px');

    svg.append('g')
        .call(d3.axisLeft(yScale))
        .style('font-size', '12px');

    // Line
    const line = d3.line()
        .x(d => xScale(d.gameNum))
        .y(d => yScale(d.avgKD))
        .curve(d3.curveMonotoneX);

    svg.append('path')
        .datum(gameNumStats)
        .attr('fill', 'none')
        .attr('stroke', '#6366f1')
        .attr('stroke-width', 3)
        .attr('d', line);

    // Points
    svg.selectAll('.point')
        .data(gameNumStats)
        .enter()
        .append('circle')
        .attr('cx', d => xScale(d.gameNum))
        .attr('cy', d => yScale(d.avgKD))
        .attr('r', 6)
        .attr('fill', '#6366f1')
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this).attr('r', 8);
            showTooltip(event, {
                'Game #': d.gameNum,
                'Avg K/D': d.avgKD.toFixed(2),
                'Sample Size': `${d.count} sessions`
            });
        })
        .on('mouseout', function() {
            d3.select(this).attr('r', 6);
            hideTooltip();
        });

    // Labels
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + 45)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#6b7280')
        .text('Game Number in Session');

    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -45)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#6b7280')
        .text('Average K/D Ratio');

    // Fatigue indicator
    const firstGameKD = gameNumStats[0].avgKD;
    const lastGameKD = gameNumStats[gameNumStats.length - 1].avgKD;
    const fatiguePercent = ((lastGameKD - firstGameKD) / firstGameKD * 100).toFixed(1);
    const fatigueText = fatiguePercent < -5 ? 'Significant drop' : fatiguePercent < 0 ? 'Slight decline' : 'Stable';

    svg.append('text')
        .attr('x', width - 10)
        .attr('y', 20)
        .attr('text-anchor', 'end')
        .style('font-size', '14px')
        .style('font-weight', '600')
        .style('fill', fatiguePercent < -5 ? '#ef4444' : fatiguePercent < 0 ? '#f59e0b' : '#10b981')
        .text(fatigueText);
}

// ============================================
// NEW COMPETITIVE INSIGHTS ANALYTICS
// ============================================

// 1. Ranked Overview - Shows performance on ranked maps/modes only
function renderRankedOverview(data) {
    // Filter to ranked maps and modes only
    const rankedData = data.filter(d =>
        config.rankedMaps.includes(d.Map) &&
        config.rankedModes.includes(d['Game Type'])
    );

    const statsContainer = document.getElementById('rankedOverviewStats');
    const chartContainer = d3.select('#rankedOverviewChart');

    if (rankedData.length === 0) {
        statsContainer.innerHTML = '<div class="empty-state"><p>No ranked matches found</p></div>';
        chartContainer.html('<div class="empty-state"><p>No ranked matches found</p></div>');
        return;
    }

    // Calculate overall ranked stats
    const wins = rankedData.filter(d => d['Match Outcome'] === 'win').length;
    const totalMatches = rankedData.length;
    const winRate = ((wins / totalMatches) * 100).toFixed(1);
    const avgKD = d3.mean(rankedData, d => d['K/D Ratio']).toFixed(2);

    // Compact stats display (single row)
    statsContainer.innerHTML = `
        <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 20px; border-radius: 8px; flex: 1; min-width: 150px;">
                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Win Rate</div>
                <div style="font-size: 28px; font-weight: 700;">${winRate}%</div>
                <div style="font-size: 11px; opacity: 0.8;">${wins}W - ${totalMatches - wins}L</div>
            </div>
            <div style="background: var(--bg-card); border: 2px solid var(--border-color); padding: 12px 20px; border-radius: 8px; flex: 1; min-width: 120px;">
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Avg K/D</div>
                <div style="font-size: 28px; font-weight: 700; color: var(--text-primary);">${avgKD}</div>
            </div>
            <div style="background: var(--bg-card); border: 2px solid var(--border-color); padding: 12px 20px; border-radius: 8px; flex: 1; min-width: 120px;">
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Matches</div>
                <div style="font-size: 28px; font-weight: 700; color: var(--text-primary);">${totalMatches}</div>
            </div>
        </div>
    `;

    // Chart: Grouped bar chart - Maps on X-axis, Modes grouped
    chartContainer.selectAll('*').remove();

    // Prepare data: group by MAP first, then by mode
    const rankedMaps = config.rankedMaps;
    const mapsWithData = [];

    rankedMaps.forEach(map => {
        const mapData = {};
        mapData.map = map;
        let hasData = false;

        config.rankedModes.forEach(mode => {
            const subset = rankedData.filter(d => d.Map === map && d['Game Type'] === mode);
            if (subset.length > 0) {
                const modeWins = subset.filter(d => d['Match Outcome'] === 'win').length;
                mapData[mode] = {
                    winRate: (modeWins / subset.length) * 100,
                    matches: subset.length
                };
                hasData = true;
            }
        });

        if (hasData) {
            mapsWithData.push(mapData);
        }
    });

    if (mapsWithData.length === 0) {
        chartContainer.html('<div class="empty-state"><p>No data to display</p></div>');
        return;
    }

    // Get modes that have data
    const modesWithData = config.rankedModes.filter(mode =>
        rankedData.some(d => d['Game Type'] === mode)
    );

    const margin = { top: 60, right: 140, bottom: 60, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 350 - margin.top - margin.bottom;

    const svg = chartContainer
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales - maps on x-axis, modes are grouped bars
    const x0 = d3.scaleBand()
        .domain(mapsWithData.map(d => d.map))
        .range([0, width])
        .padding(0.3);

    const x1 = d3.scaleBand()
        .domain(modesWithData)
        .range([0, x0.bandwidth()])
        .padding(0.05);

    const y = d3.scaleLinear()
        .domain([0, 100])
        .range([height, 0]);

    // Mode colors (different colors for each mode)
    const modeColors = {
        'Hardpoint': '#3b82f6',
        'Control': '#8b5cf6',
        'Search and Destroy': '#ef4444'
    };

    // Draw grouped bars
    const mapGroups = svg.selectAll('.map-group')
        .data(mapsWithData)
        .enter()
        .append('g')
        .attr('class', 'map-group')
        .attr('transform', d => `translate(${x0(d.map)},0)`);

    modesWithData.forEach(mode => {
        mapGroups
            .filter(d => d[mode])
            .append('rect')
            .attr('x', x1(mode))
            .attr('y', d => y(d[mode].winRate))
            .attr('width', x1.bandwidth())
            .attr('height', d => height - y(d[mode].winRate))
            .attr('fill', modeColors[mode] || '#6b7280')
            .attr('rx', 3)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                d3.select(this).attr('opacity', 0.7);
                showTooltip(event, {
                    'Map': d.map,
                    'Mode': mode,
                    'Win Rate': `${d[mode].winRate.toFixed(1)}%`,
                    'Matches': d[mode].matches
                });
            })
            .on('mouseout', function() {
                d3.select(this).attr('opacity', 1);
                hideTooltip();
            });
    });

    // Axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x0))
        .selectAll('text')
        .style('font-size', '12px')
        .style('font-weight', '600');

    svg.append('g')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + '%'))
        .style('font-size', '11px');

    // 50% reference line
    svg.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(50))
        .attr('y2', y(50))
        .attr('stroke', '#6b7280')
        .attr('stroke-dasharray', '4,4')
        .attr('stroke-width', 1);

    // Legend - showing modes
    const legend = svg.append('g')
        .attr('transform', `translate(${width + 20}, 0)`);

    modesWithData.forEach((mode, i) => {
        const legendItem = legend.append('g')
            .attr('transform', `translate(0, ${i * 22})`);

        legendItem.append('rect')
            .attr('width', 14)
            .attr('height', 14)
            .attr('rx', 3)
            .attr('fill', modeColors[mode] || '#6b7280');

        legendItem.append('text')
            .attr('x', 20)
            .attr('y', 11)
            .style('font-size', '11px')
            .style('font-weight', '600')
            .text(mode);
    });

    // Title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', -30)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', '700')
        .style('fill', '#111827')
        .text('Win Rate by Map & Mode');
}

// 2. Map Veto Guide - Recommendations for which maps to ban
function renderMapVetoGuide(data) {
    const rankedData = data.filter(d =>
        config.rankedMaps.includes(d.Map) &&
        config.rankedModes.includes(d['Game Type'])
    );

    const container = document.getElementById('mapVetoContent');

    if (rankedData.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No ranked matches found</p></div>';
        return;
    }

    // Calculate performance by map with mode breakdowns
    const mapPerformance = config.rankedMaps.map(map => {
        const mapData = rankedData.filter(d => d.Map === map);
        if (mapData.length === 0) return null;

        const wins = mapData.filter(d => d['Match Outcome'] === 'win').length;
        const winRate = (wins / mapData.length) * 100;
        const avgKD = d3.mean(mapData, d => d['K/D Ratio']);
        const avgScore = d3.mean(mapData, d => d.Score);

        // Calculate per-mode stats
        const modeStats = config.rankedModes.map(mode => {
            const modeData = mapData.filter(d => d['Game Type'] === mode);
            if (modeData.length === 0) return null;
            const modeWins = modeData.filter(d => d['Match Outcome'] === 'win').length;
            return {
                mode,
                winRate: (modeWins / modeData.length) * 100,
                matches: modeData.length
            };
        }).filter(d => d !== null);

        return {
            map,
            winRate,
            avgKD,
            avgScore,
            matches: mapData.length,
            modeStats,
            score: (winRate * 0.5) + (avgKD * 20) + (avgScore / 100) // Composite score
        };
    }).filter(d => d !== null).sort((a, b) => a.score - b.score);

    // Worst 2 maps (should veto)
    const worstMaps = mapPerformance.slice(0, 2);
    // Best 2 maps (should never veto)
    const bestMaps = mapPerformance.slice(-2).reverse();

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px;">
            <div>
                <h4 style="color: #ef4444; font-size: 18px; font-weight: 700; margin-bottom: 16px;">
                    VETO THESE MAPS
                </h4>
                <p style="color: #6b7280; margin-bottom: 20px;">Ban these maps when possible - they're your weakest</p>
                ${worstMaps.map((m, i) => `
                    <div class="stat-card" style="margin-bottom: 16px; border-left: 4px solid #ef4444; position: relative; overflow: hidden;">
                        ${getMapImage(m.map) ? `
                            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0.08; background-image: url('${getMapImage(m.map)}'); background-size: cover; background-position: center;"></div>
                        ` : ''}
                        <div style="position: relative; display: flex; gap: 16px; align-items: center;">
                            ${getMapImage(m.map) ? `
                                <img src="${getMapImage(m.map)}" alt="${m.map}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; flex-shrink: 0;">
                            ` : ''}
                            <div style="flex: 1;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">${i + 1}. ${m.map}</div>
                                        <div style="color: #6b7280; font-size: 14px;">${m.matches} matches played</div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="font-size: 24px; font-weight: 700; color: #ef4444;">${m.winRate.toFixed(0)}%</div>
                                        <div style="color: #6b7280; font-size: 12px;">Win Rate</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                            <div>
                                <div style="color: #6b7280; font-size: 12px;">K/D</div>
                                <div style="font-weight: 600;">${m.avgKD.toFixed(2)}</div>
                            </div>
                            <div>
                                <div style="color: #6b7280; font-size: 12px;">Avg Score</div>
                                <div style="font-weight: 600;">${m.avgScore.toFixed(0)}</div>
                            </div>
                        </div>
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                            <div style="color: #6b7280; font-size: 11px; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Win Rate by Mode</div>
                            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                ${m.modeStats.map(ms => `
                                    <div style="flex: 1; min-width: 80px; padding: 6px 8px; background: ${ms.winRate < 45 ? '#fee2e2' : ms.winRate > 55 ? '#d1fae5' : '#f3f4f6'}; border-radius: 6px; text-align: center;">
                                        <div style="font-size: 10px; color: #6b7280; margin-bottom: 2px;">${ms.mode}</div>
                                        <div style="font-size: 16px; font-weight: 700; color: ${ms.winRate < 45 ? '#ef4444' : ms.winRate > 55 ? '#10b981' : '#6b7280'};">${ms.winRate.toFixed(0)}%</div>
                                        <div style="font-size: 9px; color: #9ca3af;">${ms.matches}m</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div>
                <h4 style="color: #10b981; font-size: 18px; font-weight: 700; margin-bottom: 16px;">
                    PROTECT THESE MAPS
                </h4>
                <p style="color: #6b7280; margin-bottom: 20px;">Never veto these - they're your strongest maps</p>
                ${bestMaps.map((m, i) => `
                    <div class="stat-card" style="margin-bottom: 16px; border-left: 4px solid #10b981; position: relative; overflow: hidden;">
                        ${getMapImage(m.map) ? `
                            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0.08; background-image: url('${getMapImage(m.map)}'); background-size: cover; background-position: center;"></div>
                        ` : ''}
                        <div style="position: relative; display: flex; gap: 16px; align-items: center;">
                            ${getMapImage(m.map) ? `
                                <img src="${getMapImage(m.map)}" alt="${m.map}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; flex-shrink: 0;">
                            ` : ''}
                            <div style="flex: 1;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">${i + 1}. ${m.map}</div>
                                        <div style="color: #6b7280; font-size: 14px;">${m.matches} matches played</div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="font-size: 24px; font-weight: 700; color: #10b981;">${m.winRate.toFixed(0)}%</div>
                                        <div style="color: #6b7280; font-size: 12px;">Win Rate</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                            <div>
                                <div style="color: #6b7280; font-size: 12px;">K/D</div>
                                <div style="font-weight: 600;">${m.avgKD.toFixed(2)}</div>
                            </div>
                            <div>
                                <div style="color: #6b7280; font-size: 12px;">Avg Score</div>
                                <div style="font-weight: 600;">${m.avgScore.toFixed(0)}</div>
                            </div>
                        </div>
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                            <div style="color: #6b7280; font-size: 11px; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Win Rate by Mode</div>
                            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                ${m.modeStats.map(ms => `
                                    <div style="flex: 1; min-width: 80px; padding: 6px 8px; background: ${ms.winRate < 45 ? '#fee2e2' : ms.winRate > 55 ? '#d1fae5' : '#f3f4f6'}; border-radius: 6px; text-align: center;">
                                        <div style="font-size: 10px; color: #6b7280; margin-bottom: 2px;">${ms.mode}</div>
                                        <div style="font-size: 16px; font-weight: 700; color: ${ms.winRate < 45 ? '#ef4444' : ms.winRate > 55 ? '#10b981' : '#6b7280'};">${ms.winRate.toFixed(0)}%</div>
                                        <div style="font-size: 9px; color: #9ca3af;">${ms.matches}m</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// 3. Consistency Analysis
function renderConsistencyAnalysis(data) {
    const statsContainer = document.getElementById('consistencyStats');
    const chartContainer = d3.select('#consistencyChart');

    if (data.length === 0) {
        statsContainer.innerHTML = '<div class="empty-state"><p>No data available</p></div>';
        chartContainer.html('<div class="empty-state"><p>No data available</p></div>');
        return;
    }

    // Calculate consistency metrics
    const kdValues = data.map(d => d['K/D Ratio']).filter(v => v > 0);
    const skillValues = data.map(d => d.Skill).filter(v => v > 0);
    const scoreValues = data.map(d => d.Score).filter(v => v > 0);

    const kdStdDev = d3.deviation(kdValues) || 0;
    const kdMean = d3.mean(kdValues) || 0;
    const kdCV = kdMean > 0 ? (kdStdDev / kdMean) * 100 : 0;

    const skillStdDev = skillValues.length > 1 ? (d3.deviation(skillValues) || 0) : null;
    const skillMean = skillValues.length > 0 ? d3.mean(skillValues) : null;

    const scoreStdDev = d3.deviation(scoreValues) || 0;
    const scoreMean = d3.mean(scoreValues) || 0;

    // Consistency Score (lower CV = more consistent, capped at reasonable range)
    const consistencyScore = kdMean > 0 ? Math.max(0, Math.min(100, 100 - kdCV)) : null;
    const consistencyGrade = consistencyScore === null ? 'N/A'
        : consistencyScore >= 80 ? 'S'
        : consistencyScore >= 70 ? 'A'
        : consistencyScore >= 60 ? 'B'
        : consistencyScore >= 50 ? 'C' : 'D';
    const consistencyColor = consistencyScore === null ? '#6b7280'
        : consistencyScore >= 80 ? '#10b981'
        : consistencyScore >= 70 ? '#3b82f6'
        : consistencyScore >= 60 ? '#f59e0b' : '#ef4444';

    const skillCard = skillMean !== null
        ? `<div class="stat-card">
            <div class="stat-label">Skill Variation</div>
            <div class="stat-value">±${skillStdDev.toFixed(0)}</div>
            <div class="stat-change">avg ${skillMean.toFixed(0)} · std dev ${skillStdDev.toFixed(0)}</div>
        </div>`
        : `<div class="stat-card">
            <div class="stat-label">Skill Variation</div>
            <div class="stat-value" style="color: var(--text-secondary); font-size: 1rem;">No Data</div>
            <div class="stat-change">No ranked skill rating found</div>
        </div>`;

    statsContainer.innerHTML = `
        <div class="stat-card" style="border-left: 4px solid ${consistencyColor};">
            <div class="stat-label">Consistency Grade</div>
            <div class="stat-value" style="color: ${consistencyColor};">${consistencyGrade}</div>
            <div class="stat-change">${consistencyScore !== null ? consistencyScore.toFixed(0) + '/100 score' : 'Insufficient K/D data'}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">K/D Variation</div>
            <div class="stat-value">±${kdStdDev.toFixed(2)}</div>
            <div class="stat-change">avg ${kdMean.toFixed(2)} · std dev ${kdStdDev.toFixed(2)}</div>
        </div>
        ${skillCard}
        <div class="stat-card">
            <div class="stat-label">Score Variation</div>
            <div class="stat-value">±${scoreStdDev.toFixed(0)}</div>
            <div class="stat-change">avg ${scoreMean.toFixed(0)} · std dev ${scoreStdDev.toFixed(0)}</div>
        </div>
    `;

    // Chart: K/D distribution histogram
    chartContainer.selectAll('*').remove();

    const margin = { top: 40, right: 30, bottom: 60, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = chartContainer
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create histogram
    const histogram = d3.bin()
        .domain([0, d3.max(kdValues)])
        .thresholds(20);

    const bins = histogram(kdValues);

    const xScale = d3.scaleLinear()
        .domain([0, d3.max(kdValues)])
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length)])
        .range([height, 0]);

    // Bars
    svg.selectAll('.bar')
        .data(bins)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => xScale(d.x0) + 1)
        .attr('y', d => yScale(d.length))
        .attr('width', d => xScale(d.x1) - xScale(d.x0) - 2)
        .attr('height', d => height - yScale(d.length))
        .attr('fill', '#6366f1')
        .attr('rx', 4)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this).attr('opacity', 0.8);
            showTooltip(event, {
                'K/D Range': `${d.x0.toFixed(1)} - ${d.x1.toFixed(1)}`,
                'Matches': d.length,
                'Percentage': `${((d.length / data.length) * 100).toFixed(1)}%`
            });
        })
        .on('mouseout', function() {
            d3.select(this).attr('opacity', 1);
            hideTooltip();
        });

    // Mean line
    svg.append('line')
        .attr('x1', xScale(kdMean))
        .attr('x2', xScale(kdMean))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', '#10b981')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,4');

    svg.append('text')
        .attr('x', xScale(kdMean))
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#10b981')
        .style('font-weight', '600')
        .text(`Avg: ${kdMean.toFixed(2)}`);

    // Axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale))
        .style('font-size', '12px');

    svg.append('g')
        .call(d3.axisLeft(yScale))
        .style('font-size', '12px');

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height + 45)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#6b7280')
        .text('K/D Ratio');

    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -45)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#6b7280')
        .text('Number of Matches');
}

// 4. Win Rate Grid - Heatmap of win rates by map and mode
function renderWinRateGrid(data) {
    const container = d3.select('#winRateGridChart');
    container.selectAll('*').remove();

    if (data.length === 0) {
        container.html('<div class="empty-state"><p>No data available</p></div>');
        return;
    }

    // Get unique maps and game types
    const maps = [...new Set(data.map(d => d.Map))].sort();

    // Filter to only show main game modes (remove weird playlist names)
    const mainGameModes = ['Control', 'Domination', 'FFA', 'Hardpoint', 'Search and Destroy', 'Search & Destroy', 'S&D', 'SnD', 'Team Deathmatch', 'Kill Confirmed'];
    const allGameModes = [...new Set(data.map(d => d['Game Type']))];
    const gameModes = allGameModes.filter(mode => mainGameModes.includes(mode)).sort();

    // Calculate win rate for each map/mode combination
    const gridData = [];
    maps.forEach(map => {
        gameModes.forEach(mode => {
            const subset = data.filter(d => d.Map === map && d['Game Type'] === mode);
            if (subset.length > 0) {
                const wins = subset.filter(d => d['Match Outcome'] === 'win').length;
                const winRate = (wins / subset.length) * 100;
                gridData.push({
                    map,
                    mode,
                    winRate,
                    matches: subset.length,
                    isRanked: config.rankedMaps.includes(map) && config.rankedModes.includes(mode)
                });
            }
        });
    });

    const margin = { top: 120, right: 40, bottom: 60, left: 180 };
    const cellSize = 110;  // Larger cells for better readability
    const width = maps.length * cellSize;  // Maps on X-axis (horizontal)
    const height = gameModes.length * cellSize;  // Modes on Y-axis (vertical)

    const svg = container
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .style('background', '#ffffff')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Better color scale with more vibrant colors
    const colorScale = d3.scaleLinear()
        .domain([0, 35, 50, 65, 100])
        .range(['#dc2626', '#f59e0b', '#fbbf24', '#84cc16', '#10b981']);

    // Add subtle grid background
    svg.append('rect')
        .attr('x', -5)
        .attr('y', -5)
        .attr('width', width + 10)
        .attr('height', height + 10)
        .attr('fill', '#f9fafb')
        .attr('rx', 12)
        .style('opacity', 0.5);

    // Create cells with improved styling
    svg.selectAll('.cell')
        .data(gridData)
        .enter()
        .append('rect')
        .attr('class', 'cell')
        .attr('x', d => maps.indexOf(d.map) * cellSize + 5)
        .attr('y', d => gameModes.indexOf(d.mode) * cellSize + 5)
        .attr('width', cellSize - 10)
        .attr('height', cellSize - 10)
        .attr('fill', d => colorScale(d.winRate))
        .attr('stroke', d => d.isRanked ? '#8b5cf6' : '#e5e7eb')
        .attr('stroke-width', d => d.isRanked ? 4 : 1)
        .attr('rx', 8)
        .style('cursor', 'pointer')
        .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))')
        .style('transition', 'all 0.2s ease')
        .on('mouseover', function(event, d) {
            d3.select(this)
                .attr('stroke-width', d.isRanked ? 5 : 2)
                .style('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))');
            showTooltip(event, {
                'Map': d.map,
                'Mode': d.mode,
                'Win Rate': `${d.winRate.toFixed(1)}%`,
                'Matches': d.matches,
                'Status': d.isRanked ? 'Ranked' : 'Casual'
            });
        })
        .on('mouseout', function(event, d) {
            d3.select(this)
                .attr('stroke-width', d.isRanked ? 4 : 1)
                .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');
            hideTooltip();
        });

    // Add text labels with better styling
    svg.selectAll('.cell-text')
        .data(gridData)
        .enter()
        .append('text')
        .attr('class', 'cell-text')
        .attr('x', d => maps.indexOf(d.map) * cellSize + cellSize / 2)
        .attr('y', d => gameModes.indexOf(d.mode) * cellSize + cellSize / 2 - 5)
        .attr('text-anchor', 'middle')
        .style('font-size', '24px')
        .style('font-weight', '700')
        .style('fill', d => d.winRate > 55 || d.winRate < 45 ? '#ffffff' : '#111827')
        .style('pointer-events', 'none')
        .style('text-shadow', d => d.winRate > 55 || d.winRate < 45 ? '0 1px 2px rgba(0,0,0,0.3)' : 'none')
        .text(d => `${d.winRate.toFixed(0)}%`);

    // Add match count below percentage
    svg.selectAll('.cell-matches')
        .data(gridData)
        .enter()
        .append('text')
        .attr('class', 'cell-matches')
        .attr('x', d => maps.indexOf(d.map) * cellSize + cellSize / 2)
        .attr('y', d => gameModes.indexOf(d.mode) * cellSize + cellSize / 2 + 18)
        .attr('text-anchor', 'middle')
        .style('font-size', '11px')
        .style('font-weight', '500')
        .style('fill', d => d.winRate > 55 || d.winRate < 45 ? 'rgba(255,255,255,0.8)' : '#6b7280')
        .style('pointer-events', 'none')
        .text(d => `${d.matches} match${d.matches !== 1 ? 'es' : ''}`);

    // X-axis map images with background
    maps.filter(d => getMapImage(d)).forEach(map => {
        const mapIndex = maps.indexOf(map);
        const g = svg.append('g')
            .attr('transform', `translate(${mapIndex * cellSize + cellSize / 2}, -70)`);

        // Image background/border
        g.append('rect')
            .attr('x', -38)
            .attr('y', -38)
            .attr('width', 76)
            .attr('height', 76)
            .attr('rx', 10)
            .attr('fill', '#ffffff')
            .attr('stroke', config.rankedMaps.includes(map) ? '#8b5cf6' : '#e5e7eb')
            .attr('stroke-width', config.rankedMaps.includes(map) ? 3 : 2)
            .style('filter', 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))');

        // Map image
        g.append('image')
            .attr('xlink:href', getMapImage(map))
            .attr('x', -35)
            .attr('y', -35)
            .attr('width', 70)
            .attr('height', 70)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', 'inset(0% round 8px)');
    });

    // X-axis labels (maps) with better positioning
    svg.selectAll('.x-label')
        .data(maps)
        .enter()
        .append('text')
        .attr('class', 'x-label')
        .attr('x', (d, i) => i * cellSize + cellSize / 2)
        .attr('y', -8)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', '700')
        .style('fill', d => config.rankedMaps.includes(d) ? '#8b5cf6' : '#111827')
        .text(d => d);

    // Y-axis labels (game modes) with badges
    gameModes.forEach((mode, i) => {
        const g = svg.append('g')
            .attr('transform', `translate(-15, ${i * cellSize + cellSize / 2})`);

        const isRanked = config.rankedModes.includes(mode);

        // Background badge
        const bbox = {width: mode.length * 9 + 20, height: 28};
        g.append('rect')
            .attr('x', -bbox.width)
            .attr('y', -14)
            .attr('width', bbox.width)
            .attr('height', bbox.height)
            .attr('rx', 6)
            .attr('fill', isRanked ? '#8b5cf6' : '#f3f4f6')
            .attr('stroke', isRanked ? '#7c3aed' : '#e5e7eb')
            .attr('stroke-width', 1)
            .style('filter', 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))');

        // Mode text
        g.append('text')
            .attr('x', -bbox.width / 2)
            .attr('y', 4)
            .attr('text-anchor', 'middle')
            .style('font-size', '13px')
            .style('font-weight', '700')
            .style('fill', isRanked ? '#ffffff' : '#374151')
            .text(mode);
    });

    // Note: Title and legend are in the HTML header above to stay centered during scroll
}

// Attach event listeners for analytics controls
function attachAnalyticsEventListeners() {
    const barMetricSelect = document.getElementById('barChartMetric');
    const donutFilterSelect = document.getElementById('donutChartFilter');

    if (barMetricSelect) {
        barMetricSelect.addEventListener('change', function() {
            analyticsState.barChartMetric = this.value;
            if (state.data) renderBarChart(state.data);
        });
    }

    if (donutFilterSelect) {
        donutFilterSelect.addEventListener('change', function() {
            analyticsState.donutChartFilter = this.value;
            if (state.data) renderDonutChart(state.data);
        });
    }
}

// --- Empty States ---

function showNoDataState() {
    const statsSummary = document.getElementById('statsSummary');

    if (statsSummary) {
        statsSummary.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 4rem 2rem; text-align: center;">
                <div class="empty-state-icon" style="margin-bottom: 1rem;"></div>
                <div class="empty-state-title" style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem;">
                    No Data Loaded
                </div>
                <div class="empty-state-text" style="font-size: 1rem; color: var(--text-secondary); margin-bottom: 2rem; max-width: 500px; margin-left: auto; margin-right: auto;">
                    Upload your Call of Duty match data CSV to start analyzing your performance.
                </div>
                <button class="btn-primary" onclick="openUploadModal()" style="font-size: 1rem; padding: 12px 32px;">
                    Upload CSV Data
                </button>
            </div>
        `;
    }

    const matchesTableContainer = document.getElementById('matches-table-container');
    if (matchesTableContainer) {
        matchesTableContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"></div>
                <div class="empty-state-title">No Matches to Display</div>
                <div class="empty-state-text">
                    Upload your CSV file to view your match history.
                </div>
                <button class="btn-primary" onclick="openUploadModal()">Upload Data</button>
            </div>
        `;
    }

    // Show empty state in all analytics charts
    const analyticsChartIds = ['mapPerformanceChart', 'timeOfDayChart', 'sessionFatigueChart', 'barChart', 'donutChart', 'heatmapChart'];
    analyticsChartIds.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            elem.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"></div>
                    <div class="empty-state-title">No Data Available</div>
                    <div class="empty-state-text">
                        Upload a CSV file to view analytics.
                    </div>
                </div>
            `;
        }
    });
}

// --- Init ---

function clearCachedData() {
    if (confirm('Are you sure you want to clear all cached data? You will need to re-upload your CSV.')) {
        localStorage.removeItem('codStatsData');
        showToast('Cache cleared. Please upload your CSV again.', 'info');
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    }
}

window.addEventListener("load", function() {
    initVisualization();
    attachTableEventListeners();
});