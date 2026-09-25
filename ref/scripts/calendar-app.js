/* =========================================================
   Quicker WebView2 适配层
   参考已验证可用的 RedNote Pro：
   - 仅以 $quickerSync 判断 Quicker 原生宿主；
   - getVar/setVar 都通过 Promise.resolve 统一等待桥接返回值；
   - 读取后再 JSON.parse，不直接把 HostObject/Promise 当状态对象。
   ========================================================= */
(() => {
    const quickerSync = window.$quickerSync
        || (typeof $quickerSync !== 'undefined' ? $quickerSync : null);

    const STATE_VAR = 'calendar_countdown_state_json';

    window.__APP_NATIVE_QUICKER_HOST__ = Boolean(quickerSync);

    function safeParse(raw, fallback) {
        if (!raw) return fallback;

        // 正常情况下 Quicker 文本变量应返回字符串。
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw);
            } catch (error) {
                console.warn(`Quicker 状态变量 ${STATE_VAR} JSON 损坏。`, error);
                return fallback;
            }
        }

        // 兼容桥接层已经返回普通 JS 对象的情况，
        // 但绝不把 Promise/thenable/HostObject 包装值直接当作状态。
        if (
            raw
            && typeof raw === 'object'
            && typeof raw.then !== 'function'
            && Object.getPrototypeOf(raw) === Object.prototype
        ) {
            return raw;
        }

        return fallback;
    }

    window.CalendarQuicker = {
        isHost: Boolean(quickerSync),
        stateVar: STATE_VAR,

        readState: async () => {
            if (!quickerSync?.getVar) return null;

            try {
                // 关键：与 RedNote Pro 一致。
                // 即使 getVar 返回 Promise / HostObject 包装值，也先等待真正结果。
                const raw = await Promise.resolve(
                    quickerSync.getVar(STATE_VAR)
                );
                return safeParse(raw, null);
            } catch (error) {
                console.warn(`读取 Quicker 状态变量 ${STATE_VAR} 失败。`, error);
                return null;
            }
        },

        writeState: async (state) => {
            if (!quickerSync?.setVar) return false;

            try {
                // 关键：与 RedNote Pro 一致，等待桥接真正完成。
                await Promise.resolve(
                    quickerSync.setVar(
                        STATE_VAR,
                        JSON.stringify(state)
                    )
                );
                return true;
            } catch (error) {
                console.warn(`写入 Quicker 状态变量 ${STATE_VAR} 失败。`, error);
                return false;
            }
        }
    };
})();

const API_KEY = 'KIuZpcRpAjs6bGazSjpQNICDKI';
const API_BASE_URL = 'https://api.shwgij.com/api/lunars/lunar';
const API_TIMEOUT_MS = 5000;

const today = new Date();
today.setHours(0, 0, 0, 0);
let currentDate = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDate = new Date(today);
const apiDataMap = {};

// 只保留每年日期固定的纪念日。旧版写死的连续休假日期和 specific2026 已删除。
const solarHolidays = {
    '01-01': { text: '元旦', isHoliday: true, color: 'text-red-500' },
    '02-14': { text: '情人节', color: 'text-pink-500' },
    '03-08': { text: '妇女节', color: 'text-pink-500' },
    '05-01': { text: '劳动节', isHoliday: true, color: 'text-red-500' },
    '06-01': { text: '儿童节', color: 'text-blue-500' },
    '07-01': { text: '建党节', color: 'text-red-500' },
    '08-01': { text: '建军节', color: 'text-red-500' },
    '09-10': { text: '教师节', color: 'text-orange-500' },
    '10-01': { text: '国庆节', isHoliday: true, color: 'text-red-500' },
    '12-25': { text: '圣诞节', color: 'text-green-500' }
};
const constellations = ['水瓶座 ♒', '双鱼座 ♓', '白羊座 ♈', '金牛座 ♉', '双子座 ♊', '巨蟹座 ♋', '狮子座 ♌', '处女座 ♍', '天秤座 ♎', '天蝎座 ♏', '射手座 ♐', '摩羯座 ♑'];
const solarTermNames = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
const solarTermMinutes = [0,21208,42467,63836,85337,107014,128867,150921,173149,195551,218072,240693,263343,285989,308563,331033,353350,375494,397447,419210,440795,462224,483532,504758];
const lunarDayNames = ['', '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

const pad2 = value => String(value).padStart(2, '0');
const formatDateStr = date => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const formatChineseDate = date => `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日`;
const getWeekText = date => ['周日','周一','周二','周三','周四','周五','周六'][date.getDay()];
const getConstellation = (month, day) => constellations[(day >= [20,19,21,20,21,22,23,23,23,24,23,22][month - 1] ? month : month - 1) % 12];

function parseDateInput(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
}

function addCalendarDays(date, days) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() + days);
    return result;
}

function naturalDayDifference(start, end) {
    const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((endUtc - startUtc) / 86400000);
}

function getSolarTermName(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const candidates = [month * 2, month * 2 + 1];
    for (const index of candidates) {
        const utcMillis = Date.UTC(1900, 0, 6, 2, 5)
            + 31556925974.7 * (year - 1900)
            + solarTermMinutes[index] * 60000;
        // 该经典分钟数公式应直接按 UTC 日期取日号。
        // 再额外加 8 小时会把大寒、谷雨、小满等临界节气错误推到次日。
        const termDate = new Date(utcMillis);
        if (
            termDate.getUTCFullYear() === year
            && termDate.getUTCMonth() === month
            && termDate.getUTCDate() === date.getDate()
        ) {
            return solarTermNames[index];
        }
    }
    return null;
}

function getLocalSpecial(date) {
    const key = `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    const holiday = solarHolidays[key];
    if (holiday) return holiday;
    const solarTerm = getSolarTermName(date);
    return solarTerm ? { text: solarTerm, color: 'text-green-600' } : null;
}

function getLocalLunarInfo(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const animals = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
    const chineseDigits = ['〇','一','二','三','四','五','六','七','八','九'];
    try {
        const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        const parts = Object.fromEntries(
            formatter.formatToParts(date)
                .filter(part => part.type !== 'literal')
                .map(part => [part.type, part.value])
        );
        const relatedYear = Number(parts.relatedYear || year);
        const lunarDay = lunarDayNames[Number(parts.day)] || String(parts.day || '');
        const animal = animals[((relatedYear - 4) % 12 + 12) % 12];
        const cnYear = String(relatedYear).split('').map(number => chineseDigits[Number(number)]).join('');
        return {
            lunarDate: lunarDay,
            yearStr: `${cnYear}年${parts.month || ''}${lunarDay}`,
            animalYear: `${parts.yearName || ''}（${animal}）年`,
            animal,
            constellation: getConstellation(month, day),
            yi: '',
            ji: ''
        };
    } catch (error) {
        console.warn('当前浏览器不支持内置中国农历日历。', error);
        return {
            lunarDate: '',
            yearStr: '当前浏览器不支持农历计算',
            animalYear: '',
            animal: '',
            constellation: getConstellation(month, day),
            yi: '需联网获取黄历数据',
            ji: '需联网获取黄历数据'
        };
    }
}

function extractLunarDay(lunarText, fallback = '') {
    const text = String(lunarText || '').trim().replace(/^农历/, '');
    return lunarDayNames.slice(1).find(dayName => text.endsWith(dayName)) || fallback;
}

function extractApiSolarTerm(jieQiText) {
    const text = String(jieQiText || '').trim();
    if (!text) return null;

    // 兼容接口直接返回“立秋”的情况。
    if (solarTermNames.includes(text)) return text;

    // 接口常见格式为“立秋 第10天”。
    // 只有“第1天”才是节气当天，不能把后续十几天都显示成该节气。
    const match = /^(\S+)\s*第\s*(\d+)\s*天$/.exec(text);
    return match
        && solarTermNames.includes(match[1])
        && Number(match[2]) === 1
        ? match[1]
        : null;
}

function getActiveDayInfo(date) {
    const dateKey = formatDateStr(date);
    return apiDataMap[dateKey] || {
        special: getLocalSpecial(date),
        lunarInfo: getLocalLunarInfo(date)
    };
}

async function fetchRealCalendarData(dateObj) {
    const dateKey = formatDateStr(dateObj);
    if (apiDataMap[dateKey]) {
        renderCalendarGrid();
        renderRightPanel();
        return;
    }

    const loader = document.getElementById('api-loader');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    loader.classList.remove('hidden');

    try {
        const dateParam = `${dateObj.getFullYear()}${pad2(dateObj.getMonth() + 1)}${pad2(dateObj.getDate())}120000`;
        const res = await fetch(`${API_BASE_URL}?key=${API_KEY}&date=${dateParam}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.code !== 200 && json.code !== 201) throw new Error(json.msg || '接口返回失败');

        const data = json.data || {};
        const emojis = { '水瓶座':'♒','双鱼座':'♓','白羊座':'♈','金牛座':'♉','双子座':'♊','巨蟹座':'♋','狮子座':'♌','处女座':'♍','天秤座':'♎','天蝎座':'♏','射手座':'♐','摩羯座':'♑' };
        const cName = String(data.Constellation || '').trim();
        const shortDateKey = `${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
        const fixedHoliday = solarHolidays[shortDateKey] || null;
        const apiFestival = String(data.Festivals || data.Lunar_Festivals || '').trim();
        const apiSolarTerm = extractApiSolarTerm(data.JieQi1);
        const localSolarTerm = getSolarTermName(dateObj);

        // 显示优先级：固定节日 → 接口节日 → 接口确认的节气当天 → 本地节气兜底。
        const finalSpecial = fixedHoliday
            || (apiFestival ? { text: apiFestival, color: 'text-red-500' } : null)
            || (apiSolarTerm ? { text: apiSolarTerm, color: 'text-green-600' } : null)
            || (localSolarTerm ? { text: localSolarTerm, color: 'text-green-600' } : null);

        const localLunarInfo = getLocalLunarInfo(dateObj);
        const apiLunarYear = String(data.LunarYear || '').trim();
        const apiLunarDate = String(data.Lunar || '').trim();
        const apiAnimalYear = String(data.ThisYear || '').trim();
        const apiGanZhiYear = String(data.GanZhiYear || '').trim();
        const apiAnimal = apiAnimalYear.replace(/年$/, '');

        apiDataMap[dateKey] = {
            special: finalSpecial,
            lunarInfo: {
                lunarDate: extractLunarDay(apiLunarDate, localLunarInfo.lunarDate),
                yearStr: apiLunarYear && apiLunarDate ? `${apiLunarYear}${apiLunarDate}` : localLunarInfo.yearStr,
                animalYear: apiGanZhiYear || apiAnimalYear
                    ? `${[apiGanZhiYear, apiAnimalYear].filter(Boolean).join('（')}${apiGanZhiYear && apiAnimalYear ? '）' : ''}`
                    : localLunarInfo.animalYear,
                animal: apiAnimal || localLunarInfo.animal,
                constellation: cName ? `${cName} ${emojis[cName] || ''}`.trim() : localLunarInfo.constellation,
                yi: String(data.YiDay || '').trim() || '无',
                ji: String(data.JiDay || '').trim() || '无'
            }
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('黄历接口请求超时，已使用本地农历。');
        } else {
            console.warn('黄历接口不可用，已使用本地农历。', error);
        }
    } finally {
        clearTimeout(timeoutId);
        loader.classList.add('hidden');
        renderRightPanel();
        renderCalendarGrid();
    }
}

function renderCalendarHeader() {
    document.getElementById('bg-month-number').innerText = currentDate.getMonth() + 1;
    document.getElementById('display-year').innerText = currentDate.getFullYear();
    document.getElementById('display-month').innerText = pad2(currentDate.getMonth() + 1);
}

function renderCalendarGrid() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstDayIndex = new Date(year, month, 1).getDay();
    firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const previousMonthDays = new Date(year, month, 0).getDate();
    const days = [];

    for (let i = firstDayIndex - 1; i >= 0; i--) {
        days.push({ date: new Date(year, month - 1, previousMonthDays - i), isCurrentMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
        days.push({ date: new Date(year, month, day), isCurrentMonth: true });
    }
    for (let day = 1; days.length < 42; day++) {
        days.push({ date: new Date(year, month + 1, day), isCurrentMonth: false });
    }

    document.getElementById('calendar-grid').innerHTML = days.map(item => {
        const dateStr = formatDateStr(item.date);
        const isSelected = formatDateStr(selectedDate) === dateStr;
        const dayData = getActiveDayInfo(item.date);
        const special = dayData.special;
        const isWeekend = item.date.getDay() === 0 || item.date.getDay() === 6;

        let textClass = item.isCurrentMonth ? (isWeekend && !isSelected ? 'text-red-500' : 'text-gray-800') : 'text-gray-300';
        if (isSelected) textClass = 'text-white';
        let subTextClass = item.isCurrentMonth ? (special?.color && !isSelected ? special.color : 'text-gray-400') : 'text-gray-200';
        if (isSelected) subTextClass = 'text-blue-100';
        const bottomText = special?.text || dayData.lunarInfo.lunarDate;
        const boxClass = `relative flex flex-col items-center justify-center w-14 h-14 rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-blue-500 shadow-md shadow-blue-500/30' : 'hover:bg-gray-50'} ${dateStr === formatDateStr(today) && !isSelected ? 'border border-blue-200 bg-blue-50/30' : ''}`;

        return `<div class="flex justify-center day-cell" data-date="${dateStr}">
            <div class="${boxClass}">
                <span class="text-lg font-semibold ${textClass}">${pad2(item.date.getDate())}</span>
                <span class="text-xs mt-0.5 ${subTextClass}">${bottomText}</span>
                ${special?.isHoliday ? '<span class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded">休</span>' : ''}
            </div>
        </div>`;
    }).join('');
}

function renderRightPanel() {
    const data = getActiveDayInfo(selectedDate);
    document.getElementById('detail-date-header').innerText = `${formatDateStr(selectedDate)} ${getWeekText(selectedDate)}`;
    document.getElementById('detail-big-day').innerText = selectedDate.getDate();
    document.getElementById('detail-lunar-yearstr').innerText = data.lunarInfo.yearStr;
    document.getElementById('detail-lunar-animalyear').innerText = data.lunarInfo.animalYear;
    document.getElementById('detail-animal').innerText = data.lunarInfo.animal;
    document.getElementById('detail-constellation').innerText = data.lunarInfo.constellation;
    document.getElementById('detail-yi').innerText = data.lunarInfo.yi;
    document.getElementById('detail-ji').innerText = data.lunarInfo.ji;
}

function changeMonth(offset) {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    renderCalendarHeader();
    renderCalendarGrid();
}

function buildDropdowns() {
    const yearList = document.getElementById('list-year');
    const monthList = document.getElementById('list-month');
    for (let year = 2010; year <= 2039; year++) {
        const item = document.createElement('div');
        item.className = 'px-3 py-2 text-sm cursor-pointer text-center transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900';
        item.innerText = year;
        item.onclick = event => {
            event.stopPropagation();
            currentDate = new Date(year, currentDate.getMonth(), 1);
            renderCalendarHeader();
            renderCalendarGrid();
            yearList.classList.add('hidden');
        };
        yearList.appendChild(item);
    }
    for (let month = 0; month < 12; month++) {
        const item = document.createElement('div');
        item.className = 'px-3 py-2 text-sm cursor-pointer text-center transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900';
        item.innerText = pad2(month + 1);
        item.onclick = event => {
            event.stopPropagation();
            currentDate = new Date(currentDate.getFullYear(), month, 1);
            renderCalendarHeader();
            renderCalendarGrid();
            monthList.classList.add('hidden');
        };
        monthList.appendChild(item);
    }
    document.getElementById('btn-year').onclick = event => {
        event.stopPropagation();
        yearList.classList.toggle('hidden');
        monthList.classList.add('hidden');
    };
    document.getElementById('btn-month').onclick = event => {
        event.stopPropagation();
        monthList.classList.toggle('hidden');
        yearList.classList.add('hidden');
    };
    document.addEventListener('click', () => {
        yearList.classList.add('hidden');
        monthList.classList.add('hidden');
    });
}

function switchView(viewName, persist = true) {
    const views = ['calendar', 'tools', 'countdown'];
    const safeView = views.includes(viewName) ? viewName : 'calendar';

    activeView = safeView;
    document.querySelector('.view-switch').dataset.activeIndex = String(views.indexOf(safeView));

    views.forEach(name => {
        const isActive = name === safeView;
        const panel = document.getElementById(`view-${name}`);
        const tab = document.getElementById(`tab-${name}`);
        panel.classList.toggle('is-hidden', !isActive);
        panel.setAttribute('aria-hidden', String(!isActive));
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
    });

    if (safeView === 'countdown') {
        renderHolidayCountdowns();
        renderCustomCountdowns();
    }

    if (persist) {
        // 页签切换属于轻量 UI 状态，可以 debounce；
        // 它不会再承担自定义倒数日的关键数据保存。
        window.CalendarPersistence?.scheduleSave(250);
    }
}

function renderIntervalResult() {
    const start = parseDateInput(document.getElementById('interval-start').value);
    const end = parseDateInput(document.getElementById('interval-end').value);
    const result = document.getElementById('interval-result');
    if (!start || !end) {
        result.textContent = '请选择日期';
        return;
    }
    const days = naturalDayDifference(start, end);
    result.innerHTML = `${Math.abs(days)} 天<small>${days < 0 ? '结束日期早于开始日期' : days === 0 ? '同一天' : '自然日间隔'}</small>`;
}

function renderAddResult() {
    const start = parseDateInput(document.getElementById('add-start').value);
    const daysInput = document.getElementById('add-days');
    const parsedDays = Number.parseInt(daysInput.value, 10);
    const days = Number.isFinite(parsedDays) ? parsedDays : 0;
    if (!start) {
        document.getElementById('add-result').textContent = '请选择日期';
        return;
    }
    const resultDate = addCalendarDays(start, days);
    document.getElementById('add-result').innerHTML = `${formatChineseDate(resultDate)}<small>${getWeekText(resultDate)}</small>`;
}

function daysInCalendarMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function shiftDatePart(date, part, amount) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    if (part === 'day') {
        const result = new Date(year, month, day);
        result.setDate(result.getDate() + amount);
        return result;
    }

    if (part === 'month') {
        const monthAnchor = new Date(year, month + amount, 1);
        const safeDay = Math.min(day, daysInCalendarMonth(monthAnchor.getFullYear(), monthAnchor.getMonth()));
        return new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), safeDay);
    }

    const targetYear = year + amount;
    const safeDay = Math.min(day, daysInCalendarMonth(targetYear, month));
    return new Date(targetYear, month, safeDay);
}

function setupSegmentedDateControl(control) {
    const hiddenInput = control.querySelector('input[type="hidden"]');
    const segments = [...control.querySelectorAll('.date-segment')];

    function getDate() {
        return parseDateInput(hiddenInput.value) || new Date(today);
    }

    function render() {
        const date = getDate();
        const values = {
            year: String(date.getFullYear()),
            month: pad2(date.getMonth() + 1),
            day: pad2(date.getDate())
        };
        segments.forEach(segment => {
            segment.querySelector('.date-segment-value').textContent = values[segment.dataset.datePart];
        });
    }

    function setValue(value, emit = true) {
        hiddenInput.value = value;
        render();
        if (emit) hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function adjust(segment, amount) {
        const nextDate = shiftDatePart(getDate(), segment.dataset.datePart, amount);
        setValue(formatDateStr(nextDate));
        segment.classList.remove('is-changing');
        void segment.offsetWidth;
        segment.classList.add('is-changing');
        window.setTimeout(() => segment.classList.remove('is-changing'), 170);
    }

    segments.forEach((segment, index) => {
        segment.addEventListener('focus', () => {
            segments.forEach(item => item.classList.toggle('is-active', item === segment));
        });
        segment.addEventListener('blur', () => segment.classList.remove('is-active'));
        segment.addEventListener('click', () => segment.focus());
        segment.addEventListener('wheel', event => {
            event.preventDefault();
            event.stopPropagation();
            adjust(segment, event.deltaY < 0 ? 1 : -1);
        }, { passive: false });
        segment.addEventListener('keydown', event => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                adjust(segment, event.key === 'ArrowUp' ? 1 : -1);
                return;
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                const offset = event.key === 'ArrowLeft' ? -1 : 1;
                segments[(index + offset + segments.length) % segments.length].focus();
            }
        });
    });

    hiddenInput.addEventListener('change', render);
    hiddenInput.addEventListener('segment-date-render', render);
    control.setDateValue = setValue;
    render();
}

function setSegmentedDateValue(input, value, emit = false) {
    const control = input.closest('.segmented-date');
    if (control?.setDateValue) {
        control.setDateValue(value, emit);
    } else {
        input.value = value;
    }
}

function initDateTools() {
    const todayValue = formatDateStr(today);
    const tomorrowValue = formatDateStr(addCalendarDays(today, 1));
    const intervalStart = document.getElementById('interval-start');
    const intervalEnd = document.getElementById('interval-end');
    const addStart = document.getElementById('add-start');
    const addDays = document.getElementById('add-days');

    document.querySelectorAll('.segmented-date').forEach(setupSegmentedDateControl);

    function resetInterval() {
        setSegmentedDateValue(intervalStart, todayValue);
        setSegmentedDateValue(intervalEnd, tomorrowValue);
        renderIntervalResult();
    }
    function resetAdd() {
        setSegmentedDateValue(addStart, todayValue);
        addDays.value = '1';
        renderAddResult();
    }

    intervalStart.addEventListener('input', renderIntervalResult);
    intervalEnd.addEventListener('input', renderIntervalResult);
    addStart.addEventListener('input', renderAddResult);
    addDays.addEventListener('input', renderAddResult);
    addDays.addEventListener('wheel', event => {
        event.preventDefault();
        event.stopPropagation();
        addDays.value = String((Number.parseInt(addDays.value, 10) || 0) + (event.deltaY < 0 ? 1 : -1));
        renderAddResult();
    }, { passive: false });
    document.getElementById('days-minus').addEventListener('click', () => {
        addDays.value = String((Number.parseInt(addDays.value, 10) || 0) - 1);
        renderAddResult();
    });
    document.getElementById('days-plus').addEventListener('click', () => {
        addDays.value = String((Number.parseInt(addDays.value, 10) || 0) + 1);
        renderAddResult();
    });
    document.getElementById('interval-reset').addEventListener('click', resetInterval);
    document.getElementById('add-reset').addEventListener('click', resetAdd);
    resetInterval();
    resetAdd();
}


const CUSTOM_COUNTDOWN_STORAGE_KEY = 'calendar-custom-countdowns-v1';
const ACTIVE_VIEW_STORAGE_KEY = 'calendar-active-view-v1';
/* =========================================================
   Persistence Center（精简版）
   核心原则：
   1. appState 是唯一状态源；
   2. Quicker 与浏览器存储严格互斥，不互相 fallback；
   3. 只有用户真正修改后 dirty=true；
   4. dirty=false 时，visibilitychange / beforeunload 绝不写回；
   5. 新增/删除倒数日立即保存，页签切换短 debounce；
   6. Quicker 写入严格串行，避免旧快照覆盖新快照。
   ========================================================= */

window.CalendarPersistence = (() => {
    const SCHEMA_VERSION = 3;
    const BROWSER_STATE_KEY = 'calendar-state-v3';

    let restoring = true;
    let dirty = false;
    let saveTimer = null;
    let writeQueue = Promise.resolve();

    let appState = createDefaultState();

    function createDefaultState() {
        return {
            version: SCHEMA_VERSION,
            updatedAt: 0,
            data: {
                customCountdowns: []
            },
            session: {
                activeView: 'calendar'
            }
        };
    }

    function clone(value) {
        if (typeof structuredClone === 'function') {
            return structuredClone(value);
        }
        return JSON.parse(JSON.stringify(value));
    }
    // #region 数据转换
    function normalizeCountdowns(items) {
        if (!Array.isArray(items)) return [];

        return items
            .filter(item => item && item.name && item.date)
            .map(item => ({
                id: String(
                    item.id
                    || `${Date.now()}-${Math.random().toString(16).slice(2)}`
                ),
                name: String(item.name),
                date: String(item.date)
            }));
    }

    function normalizeActiveView(value) {
        return ['calendar', 'tools', 'countdown'].includes(value)
            ? value
            : 'calendar';
    }
    // #region 状态转换
    function normalizeState(saved) {
        const defaults = createDefaultState();
        const source = saved && typeof saved === 'object' ? saved : {};

        // 兼容此前几个版本的结构。
        const countdowns =
            source?.data?.customCountdowns
            ?? source?.session?.customCountdowns
            ?? source?.customCountdowns
            ?? (Array.isArray(source) ? source : []);

        const active =
            source?.session?.activeView
            ?? source?.activeView
            ?? 'calendar';

        return {
            version: SCHEMA_VERSION,
            updatedAt: Number(source.updatedAt || source.syncUpdatedAt) || 0,
            data: {
                customCountdowns: normalizeCountdowns(countdowns)
            },
            session: {
                activeView: normalizeActiveView(active)
            }
        };
    }

    function readBrowserState() {
        // 仅普通浏览器调用。
        try {
            const raw = localStorage.getItem(BROWSER_STATE_KEY);
            if (raw) return normalizeState(JSON.parse(raw));
        } catch (error) {
            console.warn('读取浏览器统一状态失败。', error);
        }

        // 只在普通浏览器中迁移旧 key；Quicker 环境绝不使用这些本机数据兜底。
        try {
            const legacyCountdowns = JSON.parse(
                localStorage.getItem(CUSTOM_COUNTDOWN_STORAGE_KEY) || '[]'
            );
            const legacyView =
                localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY) || 'calendar';

            const migrated = normalizeState({
                data: { customCountdowns: legacyCountdowns },
                session: { activeView: legacyView }
            });

            if (
                migrated.data.customCountdowns.length > 0
                || migrated.session.activeView !== 'calendar'
            ) {
                localStorage.setItem(
                    BROWSER_STATE_KEY,
                    JSON.stringify(migrated)
                );
            }

            return migrated;
        } catch (error) {
            console.warn('迁移浏览器旧状态失败。', error);
            return createDefaultState();
        }
    }

    function writeBrowserState(snapshot) {
        try {
            localStorage.setItem(
                BROWSER_STATE_KEY,
                JSON.stringify(snapshot)
            );
            return true;
        } catch (error) {
            console.warn('写入浏览器状态失败。', error);
            return false;
        }
    }

    async function writeQuickerState(snapshot) {
        writeQueue = writeQueue
            .catch(() => {})
            .then(() => window.CalendarQuicker.writeState(snapshot));

        return await writeQueue;
    }

    function applyStateToUI(state) {
        appState = normalizeState(state);

        // 页面业务变量只是 appState 的访问镜像，避免改动原有业务函数签名。
        customCountdowns = appState.data.customCountdowns;
        activeView = appState.session.activeView;
    }

    function syncUIIntoState() {
        appState.data.customCountdowns =
            normalizeCountdowns(customCountdowns);
        appState.session.activeView =
            normalizeActiveView(activeView);
    }

    async function restoreAll() {
        restoring = true;
        dirty = false;

        try {
            if (window.CalendarQuicker?.isHost) {
                // Quicker 环境只认 Quicker 状态。
                // 读取失败/为空时使用默认状态，绝不拿本机 localStorage 回填 Quicker。
                const saved = await window.CalendarQuicker.readState();
                applyStateToUI(
                    saved && typeof saved === 'object'
                        ? saved
                        : createDefaultState()
                );
            } else {
                // 普通浏览器才使用 localStorage。
                applyStateToUI(readBrowserState());
            }
        } catch (error) {
            console.warn('状态恢复失败，将使用默认状态。', error);
            applyStateToUI(createDefaultState());
        } finally {
            restoring = false;
            dirty = false;
        }
    }

    function markDirty() {
        if (restoring) return false;
        dirty = true;
        return true;
    }

    async function saveNow() {
        if (restoring || !dirty) return false;

        syncUIIntoState();
        appState.version = SCHEMA_VERSION;
        appState.updatedAt = Date.now();

        const snapshot = clone(appState);

        let ok = false;
        if (window.CalendarQuicker?.isHost) {
            ok = await writeQuickerState(snapshot);
        } else {
            ok = writeBrowserState(snapshot);
        }

        // 只有真正写成功才清 dirty。
        if (ok !== false) {
            dirty = false;
        }

        return ok !== false;
    }

    function scheduleSave(delay = 250) {
        if (!markDirty()) return;

        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            saveNow().catch(error => {
                console.warn('自动保存失败。', error);
            });
        }, delay);
    }

    async function saveCriticalNow() {
        if (!markDirty()) return false;

        clearTimeout(saveTimer);
        saveTimer = null;

        return await saveNow();
    }

    function flushIfDirty() {
        clearTimeout(saveTimer);
        saveTimer = null;

        // 关键保护：只是打开又关闭，不产生任何写操作。
        if (restoring || !dirty) return;

        saveNow().catch(error => {
            console.warn('退出前最终保存失败。', error);
        });
    }

    return {
        restoreAll,
        scheduleSave,
        saveCriticalNow,
        flushIfDirty,
        isDirty: () => dirty,
        isRestoring: () => restoring,
        getState: () => clone(appState)
    };
})();

// 为尽量不改动现有倒数日业务代码，保留这两个变量作为 appState 的轻量访问镜像。
let customCountdowns = [];
let activeView = 'calendar';


const officialHolidayPeriods2026 = [
    { name: '元旦', start: '2026-01-01', end: '2026-01-03', days: 3 },
    { name: '春节', start: '2026-02-15', end: '2026-02-23', days: 9 },
    { name: '清明节', start: '2026-04-04', end: '2026-04-06', days: 3 },
    { name: '劳动节', start: '2026-05-01', end: '2026-05-05', days: 5 },
    { name: '端午节', start: '2026-06-19', end: '2026-06-21', days: 3 },
    { name: '中秋节', start: '2026-09-25', end: '2026-09-27', days: 3 },
    { name: '国庆节', start: '2026-10-01', end: '2026-10-07', days: 7 }
];

const holidayLogoFiles = Object.freeze({
    '元旦': '元旦节.svg',
    '春节': '春节.svg',
    '清明节': '清明节.svg',
    '劳动节': '劳动节.svg',
    '端午节': '端午节.svg',
    '中秋节': '中秋节.svg',
    '国庆节': '国庆节.svg'
});

function formatShortChineseDate(date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDateRange(start, end) {
    if (!end || formatDateStr(start) === formatDateStr(end)) return formatShortChineseDate(start);
    if (start.getMonth() === end.getMonth()) return `${start.getMonth() + 1}月${start.getDate()}–${end.getDate()}日`;
    return `${formatShortChineseDate(start)}–${formatShortChineseDate(end)}`;
}

function findLunarFestivalDate(gregorianYear, lunarMonthName, lunarDay) {
    try {
        const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' });
        const start = new Date(gregorianYear, 0, 1);
        const end = new Date(gregorianYear, 11, 31);
        for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
            const parts = Object.fromEntries(
                formatter.formatToParts(cursor)
                    .filter(part => part.type !== 'literal')
                    .map(part => [part.type, part.value])
            );
            if (String(parts.month || '') === lunarMonthName && Number(parts.day) === lunarDay) {
                return new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
            }
        }
    } catch (error) {
        console.warn('无法计算农历节日日期。', error);
    }
    return null;
}

function findQingmingDate(year) {
    for (let day = 3; day <= 6; day++) {
        const candidate = new Date(year, 3, day);
        if (getSolarTermName(candidate) === '清明') return candidate;
    }
    return new Date(year, 3, 5);
}

function buildStatutoryFestivalDates(year) {
    const items = [
        { name: '元旦', date: new Date(year, 0, 1) },
        { name: '春节', date: findLunarFestivalDate(year, '正月', 1) },
        { name: '清明节', date: findQingmingDate(year) },
        { name: '劳动节', date: new Date(year, 4, 1) },
        { name: '端午节', date: findLunarFestivalDate(year, '五月', 5) },
        { name: '中秋节', date: findLunarFestivalDate(year, '八月', 15) },
        { name: '国庆节', date: new Date(year, 9, 1) }
    ];
    return items.filter(item => item.date instanceof Date && !Number.isNaN(item.date.getTime()));
}

function getHolidayCountdownItems() {
    const startDate = new Date(today);
    const horizon = addCalendarDays(startDate, 365);
    const items = [];

    officialHolidayPeriods2026.forEach(item => {
        const start = parseDateInput(item.start);
        const end = parseDateInput(item.end);
        if (start >= startDate && start <= horizon) {
            items.push({ ...item, date: start, endDate: end, official: true });
        }
    });

    const firstGeneratedYear = Math.max(2027, startDate.getFullYear());
    for (let year = firstGeneratedYear; year <= horizon.getFullYear(); year++) {
        buildStatutoryFestivalDates(year).forEach(item => {
            if (item.date >= startDate && item.date <= horizon) {
                items.push({ ...item, official: false });
            }
        });
    }

    return items.sort((a, b) => a.date - b.date);
}

function getRemainingYearRatio(days) {
    return Math.min(1, Math.max(0, Number(days) / 365));
}

function renderHolidayCountdowns() {
    const list = document.getElementById('holiday-countdown-list');
    if (!list) return;
    const items = getHolidayCountdownItems();
    document.getElementById('holiday-countdown-badge').textContent = `${items.length} 个节日`;
    list.innerHTML = items.map(item => {
        const days = naturalDayDifference(today, item.date);
        const remainingRatio = getRemainingYearRatio(days);
        const remainingPercent = (remainingRatio * 100).toFixed(1);
        const dateText = item.official
            ? `${formatDateRange(item.date, item.endDate)} · 放假${item.days}天`
            : formatShortChineseDate(item.date);
        const logoFile = holidayLogoFiles[item.name];
        const logoMarkup = logoFile
            ? `<div class="countdown-item-logo" aria-hidden="true"><img src="./logo/${encodeURIComponent(logoFile)}" alt="" draggable="false"></div>`
            : '<span class="countdown-dot" aria-hidden="true"></span>';
        return `<div class="countdown-item holiday-countdown-item" style="--remaining-progress: ${remainingPercent}%" title="剩余 ${days} 天，占未来一年 ${remainingPercent}%">
            ${logoMarkup}
            <div class="countdown-item-main">
                <div class="countdown-item-title">${item.name}</div>
                <div class="countdown-item-meta">${item.date.getFullYear()}年 · ${dateText}</div>
            </div>
            <div class="countdown-number ${days === 0 ? 'is-today' : ''}">
                ${days === 0 ? '<strong>今天</strong>' : `<strong>${days}</strong><span>天后</span>`}
            </div>
        </div>`;
    }).join('') || '<div class="custom-countdown-empty">未来一年内暂无可显示的法定节日。</div>';
}

function loadCustomCountdowns() {
    return customCountdowns.map(item => ({ ...item }));
}

function reorderCustomCountdownItems(items, orderedIds) {
    const itemById = new Map(items.map(item => [item.id, item]));
    const usedIds = new Set();
    const reorderedItems = [];

    orderedIds.forEach(id => {
        const item = itemById.get(id);
        if (!item || usedIds.has(id)) return;
        usedIds.add(id);
        reorderedItems.push(item);
    });

    items.forEach(item => {
        if (!usedIds.has(item.id)) reorderedItems.push(item);
    });
    return reorderedItems;
}

function saveCustomCountdowns(items) {
    customCountdowns = Array.isArray(items)
        ? items
            .filter(item => item && item.name && item.date)
            .map(item => ({
                id: String(item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
                name: String(item.name),
                date: String(item.date)
            }))
        : [];

    window.CalendarPersistence
        .saveCriticalNow()
        .catch(error => console.warn('自定义倒数日保存失败。', error));
}

function getCountdownState(days) {
    if (days > 0) return { className: 'future', prefix: '还有', value: String(days), suffix: '天' };
    if (days < 0) return { className: 'past', prefix: '已过去', value: String(Math.abs(days)), suffix: '天' };
    return { className: 'today', prefix: '', value: '就是今天', suffix: '' };
}

function renderCustomCountdowns() {
    const list = document.getElementById('custom-countdown-list');
    if (!list) return;
    const items = loadCustomCountdowns()
        .map(item => ({ ...item, targetDate: parseDateInput(item.date) }))
        .filter(item => item.targetDate);

    document.getElementById('custom-countdown-badge').textContent = `${items.length} 项`;
    if (!items.length) {
        list.innerHTML = `<div class="custom-countdown-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3M16 3v3M4 9h16"/><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M12 13v5M9.5 15.5h5"/></svg>
            还没有自定义倒数日<br>输入名称和日期即可添加
        </div>`;
        return;
    }

    list.innerHTML = items.map(item => {
        const days = naturalDayDifference(today, item.targetDate);
        const state = getCountdownState(days);
        return `<div class="custom-countdown-card ${state.className}" draggable="true" data-countdown-id="${escapeHtml(item.id)}">
            <div class="custom-countdown-drag-handle" aria-hidden="true" title="拖动排序">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </div>
            <div class="custom-countdown-main">
                <div class="custom-countdown-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                <div class="custom-countdown-date">${formatChineseDate(item.targetDate)} · ${getWeekText(item.targetDate)}</div>
            </div>
            <div class="custom-countdown-status">
                ${state.prefix ? `<span>${state.prefix}</span>` : ''}<strong>${state.value}</strong>${state.suffix ? `<span>${state.suffix}</span>` : ''}
            </div>
            <button class="custom-countdown-delete" type="button" data-countdown-id="${item.id}" aria-label="删除 ${escapeHtml(item.name)}" title="删除">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M8 10v7M12 10v7M16 10v7M6 7l1 14h10l1-14"/></svg>
            </button>
        </div>`;
    }).join('');
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
}

function initCountdownView() {
    const form = document.getElementById('custom-countdown-form');
    const nameInput = document.getElementById('custom-countdown-name');
    const dateInput = document.getElementById('custom-countdown-date');
    const errorBox = document.getElementById('custom-countdown-error');
    const list = document.getElementById('custom-countdown-list');
    let draggedCard = null;
    let isDragAnimating = false;

    function performCountdownFlip(domChange) {
        if (isDragAnimating) return false;
        isDragAnimating = true;

        const cards = Array.from(list.querySelectorAll('.custom-countdown-card'));
        const positions = new Map(cards.map(card => {
            const rect = card.getBoundingClientRect();
            return [card, { left: rect.left, top: rect.top }];
        }));

        domChange();

        const movingCards = [];
        Array.from(list.querySelectorAll('.custom-countdown-card')).forEach(card => {
            if (card === draggedCard || !positions.has(card)) return;
            const oldPosition = positions.get(card);
            const newRect = card.getBoundingClientRect();
            const deltaX = oldPosition.left - newRect.left;
            const deltaY = oldPosition.top - newRect.top;
            if (Math.abs(deltaX) <= .5 && Math.abs(deltaY) <= .5) return;

            card.style.transition = 'none';
            card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            movingCards.push(card);
        });

        if (!movingCards.length) {
            isDragAnimating = false;
            return true;
        }

        list.offsetHeight;
        requestAnimationFrame(() => {
            movingCards.forEach(card => {
                card.style.transition = 'transform .35s cubic-bezier(.2, 0, 0, 1)';
                card.style.transform = '';
            });
        });

        window.setTimeout(() => { isDragAnimating = false; }, 80);
        window.setTimeout(() => {
            movingCards.forEach(card => {
                if (!card.style.transform) card.style.transition = '';
            });
        }, 350);
        return true;
    }

    function persistCountdownOrder() {
        const ids = Array.from(list.querySelectorAll('.custom-countdown-card'))
            .map(card => card.dataset.countdownId);
        const items = loadCustomCountdowns();
        const reorderedItems = reorderCustomCountdownItems(items, ids);
        const orderChanged = reorderedItems.some((item, index) => item.id !== items[index]?.id);
        if (!orderChanged) return;

        saveCustomCountdowns(reorderedItems);
    }

    dateInput.value = formatDateStr(today);
    renderHolidayCountdowns();
    renderCustomCountdowns();

    form.addEventListener('submit', event => {
        event.preventDefault();
        const name = nameInput.value.trim();
        const date = parseDateInput(dateInput.value);
        if (!name) {
            errorBox.textContent = '请先填写倒数日名称。';
            nameInput.focus();
            return;
        }
        if (!date) {
            errorBox.textContent = '请选择有效日期。';
            dateInput.focus();
            return;
        }

        const items = loadCustomCountdowns();
        items.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, date: formatDateStr(date) });
        saveCustomCountdowns(items);
        errorBox.textContent = '';
        nameInput.value = '';
        renderCustomCountdowns();
        nameInput.focus();
    });

    nameInput.addEventListener('input', () => { errorBox.textContent = ''; });
    dateInput.addEventListener('input', () => { errorBox.textContent = ''; });

    list.addEventListener('click', event => {
        const button = event.target.closest('.custom-countdown-delete');
        if (!button) return;
        const id = button.dataset.countdownId;
        const items = loadCustomCountdowns().filter(item => item.id !== id);
        saveCustomCountdowns(items);
        renderCustomCountdowns();
    });

    list.addEventListener('dragstart', event => {
        const card = event.target.closest('.custom-countdown-card');
        if (!card || !event.dataTransfer) return;
        draggedCard = card;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', card.dataset.countdownId);

        if (event.dataTransfer.setDragImage) {
            const rect = card.getBoundingClientRect();
            const clone = card.cloneNode(true);
            clone.classList.remove('sort-placeholder', 'dragging');
            clone.style.position = 'fixed';
            clone.style.top = '-9999px';
            clone.style.left = '-9999px';
            clone.style.zIndex = '100';
            clone.style.width = `${rect.width}px`;
            clone.style.height = `${rect.height}px`;
            clone.style.opacity = '1';
            document.body.appendChild(clone);
            event.dataTransfer.setDragImage(
                clone,
                Math.max(0, event.clientX - rect.left),
                Math.max(0, event.clientY - rect.top)
            );
            window.setTimeout(() => clone.remove(), 0);
        }

        window.setTimeout(() => {
            if (draggedCard === card) card.classList.add('sort-placeholder', 'dragging');
        }, 20);
    });

    list.addEventListener('dragenter', event => {
        if (!draggedCard) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });

    list.addEventListener('dragover', event => {
        if (!draggedCard) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (isDragAnimating) return;

        const siblings = Array.from(list.querySelectorAll('.custom-countdown-card'))
            .filter(card => card !== draggedCard);
        const nextCard = siblings.find(card => {
            const rect = card.getBoundingClientRect();
            return event.clientY < rect.top + rect.height / 2;
        }) || null;

        if (draggedCard.nextElementSibling === nextCard) return;
        performCountdownFlip(() => list.insertBefore(draggedCard, nextCard));
    });

    list.addEventListener('drop', event => {
        if (!draggedCard) return;
        event.preventDefault();
        event.stopPropagation();
        persistCountdownOrder();
    });

    list.addEventListener('dragend', () => {
        if (!draggedCard) return;
        persistCountdownOrder();
        draggedCard.classList.remove('sort-placeholder', 'dragging');
        draggedCard = null;
        isDragAnimating = false;
        list.querySelectorAll('.custom-countdown-card').forEach(card => {
            card.style.transition = '';
            card.style.transform = '';
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    buildDropdowns();
    initDateTools();

    // 先完整读取并恢复 Quicker/浏览器状态，再创建倒数日事件监听与首次渲染，
    // 避免默认空数组覆盖已保存数据。
    await window.CalendarPersistence.restoreAll();
    initCountdownView();

    // 恢复上次激活的“日历 / 工具 / 倒数日”页签。
    // persist=false，避免恢复动作本身再次触发保存。
    switchView(activeView, false);

    renderCalendarHeader();
    renderCalendarGrid();
    renderRightPanel();
    fetchRealCalendarData(selectedDate);

    document.getElementById('tab-calendar').addEventListener('click', () => switchView('calendar'));
    document.getElementById('tab-tools').addEventListener('click', () => switchView('tools'));
    document.getElementById('tab-countdown').addEventListener('click', () => switchView('countdown'));
    document.getElementById('btn-prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('btn-next-month').addEventListener('click', () => changeMonth(1));
    document.getElementById('btn-today').addEventListener('click', () => {
        selectedDate = new Date(today);
        currentDate = new Date(today.getFullYear(), today.getMonth(), 1);
        renderCalendarHeader();
        renderCalendarGrid();
        renderRightPanel();
        fetchRealCalendarData(selectedDate);
    });

    document.getElementById('calendar-grid').addEventListener('click', event => {
        const cell = event.target.closest('.day-cell');
        if (!cell) return;
        const [year, month, day] = cell.dataset.date.split('-').map(Number);
        selectedDate = new Date(year, month - 1, day);
        if (selectedDate.getMonth() !== currentDate.getMonth() || selectedDate.getFullYear() !== currentDate.getFullYear()) {
            currentDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
            renderCalendarHeader();
        }
        renderCalendarGrid();
        renderRightPanel();
        fetchRealCalendarData(selectedDate);
    });

    let wheelLocked = false;
    document.getElementById('calendar-left-area').addEventListener('wheel', event => {
        if (event.target.closest('#list-year, #list-month')) return;
        event.preventDefault();
        if (wheelLocked || Math.abs(event.deltaY) < 8) return;
        wheelLocked = true;
        changeMonth(event.deltaY > 0 ? 1 : -1);
        window.setTimeout(() => { wheelLocked = false; }, 180);
    }, { passive: false });
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        window.CalendarPersistence?.flushIfDirty();
    }
});

window.addEventListener('beforeunload', () => {
    window.CalendarPersistence?.flushIfDirty();
});
