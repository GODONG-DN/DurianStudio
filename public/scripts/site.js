/*
 * DurianStudio 前端交互脚本
 *
 * 这个文件只负责“浏览器里需要运行的行为”，不负责页面结构和样式：
 * 1. 主题切换：浅色 / 黑色主题之间切换，并把选择保存到 localStorage。
 * 2. 联系方式切换：点击 GitHub / Blog / Email / Chat 图标时，切换下方说明卡片。
 * 3. 天气展示：请求浏览器定位，再通过 Open-Meteo 获取当前天气；失败时显示默认文案。
 *
 * 为什么放在 public/scripts/site.js：
 * - 用户要求 JavaScript 和 HTML 分开写。
 * - 放在 public 目录下，Astro 构建时会原样复制到 dist/scripts/site.js。
 * - index.astro 只需要用 <script src="/scripts/site.js" defer> 引用它。
 */

// 页面根节点，也就是 <html>。主题状态统一写在它的 data-theme 属性上。
const root = document.documentElement;

// localStorage 的键名。以后如果要清除主题记忆，删除这个键即可。
const themeStorageKey = 'durianstudio-theme';

/*
 * Open-Meteo 天气码到站点文案的映射。
 *
 * Open-Meteo 返回的是数字天气码，例如：
 * - 0 表示晴天
 * - 2 表示多云
 * - 61 / 63 / 65 表示不同强度的雨
 *
 * 这里不直接显示“天气码 61”，而是转换成更适合个人网站的短句。
 * 如果以后想换语气，主要改这里。
 */
const weatherCodes = {
	0: '晴空在线，太阳今天上班很积极。',
	1: '大体晴朗，适合把待办事项轻轻拿下。',
	2: '有点多云，云朵负责卖萌，你负责发光。',
	3: '云量偏多，但不影响今天继续开疆拓土。',
	45: '雾气上线，适合低调发育，高调完成。',
	48: '雾凇模式，世界自带柔焦滤镜。',
	51: '小毛毛雨，灵感可能会滴答滴答来。',
	53: '细雨中等，今天适合稳稳推进。',
	55: '细雨认真营业，记得带伞也带脑洞。',
	61: '小雨，外面在润色世界，你来润色项目。',
	63: '中雨，适合室内称王。',
	65: '大雨，今日战略：不出门也能赢。',
	80: '阵雨随机刷新，注意躲避天空的即兴发挥。',
	81: '阵雨较强，今天适合把灵感收进背包。',
	82: '暴躁阵雨，建议进行室内统治。',
	95: '雷雨，天空在打鼓，项目也该有节奏了。',
};

/*
 * 读取用户之前保存过的主题。
 *
 * 注意：
 * - localStorage 在隐私模式、禁用 Cookie、某些 WebView 环境里可能抛错。
 * - 所以这里必须用 try/catch 包起来，防止整个脚本因为读取失败而停止运行。
 * - 只接受 light / dark 两个值，避免 localStorage 被写入奇怪内容后污染主题。
 */
const readStoredTheme = () => {
	try {
		const storedTheme = localStorage.getItem(themeStorageKey);
		return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : null;
	} catch {
		return null;
	}
};

/*
 * 获取页面首次加载时应该使用的主题。
 *
 * 优先级：
 * 1. 用户上次手动选择过的主题。
 * 2. 浏览器/系统偏好的主题。
 *
 * 这样做的体验会比较自然：
 * - 用户没选过，就尊重系统。
 * - 用户选过，就尊重用户。
 */
const getPreferredTheme = () => {
	const storedTheme = readStoredTheme();
	if (storedTheme) return storedTheme;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// 读取当前页面实际主题。这里以 <html data-theme="..."> 为准。
const getTheme = () => (root.dataset.theme === 'light' ? 'light' : 'dark');

/*
 * 设置主题，并同步更新按钮状态。
 *
 * 这里做了三件事：
 * 1. 修改 <html data-theme>，让 CSS 变量切换到对应主题。
 * 2. 写入 localStorage，下次打开网页还能记住选择。
 * 3. 更新按钮的 aria-label / aria-pressed / title / 可见文字，保证可访问性和提示文案正确。
 */
const setTheme = (theme) => {
	root.dataset.theme = theme;
	try {
		localStorage.setItem(themeStorageKey, theme);
	} catch {
		// localStorage may be unavailable in private contexts.
	}

	const themeToggle = document.querySelector('[data-theme-toggle]');
	const themeLabel = document.querySelector('[data-theme-label]');

	// instanceof 检查是为了避免 querySelector 拿到非按钮元素后访问 title 等属性报错。
	if (themeToggle instanceof HTMLButtonElement) {
		const isDark = theme === 'dark';
		themeToggle.setAttribute('aria-pressed', String(isDark));
		themeToggle.setAttribute('aria-label', isDark ? '切换到浅色主题' : '切换到黑色主题');
		themeToggle.title = isDark ? '切换到浅色主题' : '切换到黑色主题';
	}
	if (themeLabel instanceof HTMLElement) themeLabel.textContent = theme === 'dark' ? '黑色' : '浅色';

	// 主题切换后通知像素墙：只让当前主题对应的 wall 动起来，隐藏的那一套保持静止。
	window.dispatchEvent(new CustomEvent('durianstudio:themechange', { detail: { theme } }));
};

/*
 * 初始化联系方式切换。
 *
 * 页面结构约定：
 * - 每个图标按钮都有 data-link-tab="github/blog/email/chat"。
 * - 每个详情面板都有 data-link-panel="github/blog/email/chat"。
 * - 两边的 id 保持一致，就可以完成“一点按钮，显示对应面板”的交互。
 *
 * 以后新增联系方式时：
 * 1. 在 index.astro 的 linkItems 里新增一项。
 * 2. 只要 id 唯一，这段 JS 不需要改。
 */
const initContactTabs = () => {
	const tabs = Array.from(document.querySelectorAll('[data-link-tab]'));
	const panels = Array.from(document.querySelectorAll('[data-link-panel]'));

	// 根据传入 id 激活一个按钮和一个面板，其余全部关闭。
	const selectLink = (id) => {
		tabs.forEach((tab) => {
			if (!(tab instanceof HTMLElement)) return;
			const active = tab.dataset.linkTab === id;

			// is-active 控制视觉状态，例如高亮图标按钮。
			tab.classList.toggle('is-active', active);

			// aria-selected 给辅助技术使用，表示当前选中的 tab。
			tab.setAttribute('aria-selected', String(active));
		});
		panels.forEach((panel) => {
			if (panel instanceof HTMLElement) {
				// 详情面板本身通过 CSS 的 .is-active 控制显示/隐藏和过渡动画。
				panel.classList.toggle('is-active', panel.dataset.linkPanel === id);
			}
		});
	};

	tabs.forEach((tab) => {
		if (!(tab instanceof HTMLElement)) return;
		tab.addEventListener('click', () => {
			// tab.dataset.linkTab 为空时不处理，避免无效按钮触发错误状态。
			if (tab.dataset.linkTab) selectLink(tab.dataset.linkTab);
		});
	});
};

/*
 * 初始化主题按钮。
 *
 * 页面加载时先根据偏好设置一次主题；
 * 之后每次点击按钮，就在 dark / light 之间切换。
 */
const initThemeToggle = () => {
	setTheme(getPreferredTheme());

	const themeToggle = document.querySelector('[data-theme-toggle]');
	if (themeToggle instanceof HTMLButtonElement) {
		themeToggle.addEventListener('click', () => {
			setTheme(getTheme() === 'dark' ? 'light' : 'dark');
		});
	}
};

/*
 * 初始化天气模块。
 *
 * 天气逻辑是增强功能，不应该影响主页面可用性：
 * - 用户拒绝定位：显示默认天气。
 * - 浏览器不支持定位：显示默认天气。
 * - Open-Meteo 请求失败：显示默认天气。
 * - API 返回结构不符合预期：显示默认天气。
 *
 * 这样即使天气服务挂了，页面仍然是正常的个人网站。
 */
const initWeather = () => {
	const weatherLine = document.querySelector('[data-weather-line]');
	const weatherTemp = document.querySelector('[data-weather-temp]');

	// 天气兜底文案。任何失败路径都走这里，保证 UI 不会空着。
	const fallbackWeather = () => {
		if (weatherLine instanceof HTMLElement) weatherLine.textContent = '阳光明媚，云朵正在摸鱼。';
		if (weatherTemp instanceof HTMLElement) weatherTemp.textContent = '晴朗 + 微云';
	};

	// 如果页面上没有天气 DOM，或者浏览器没有 geolocation，就不继续请求。
	if (!(weatherLine instanceof HTMLElement) || !('geolocation' in navigator)) {
		fallbackWeather();
		return;
	}

	// 请求定位前先给用户一个状态反馈，避免看起来像卡住。
	weatherLine.textContent = '正在向天空申请情报，稍等一下。';
	navigator.geolocation.getCurrentPosition(
		async ({ coords }) => {
			try {
				/*
				 * Open-Meteo 是免 key 的天气 API。
				 *
				 * current_weather=true：只拿当前天气，减少响应体积。
				 * timezone=auto：让服务端根据坐标自动判断时区。
				 */
				const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current_weather=true&timezone=auto`;
				const response = await fetch(url);
				if (!response.ok) throw new Error('weather unavailable');

				const data = await response.json();
				if (!data.current_weather) throw new Error('weather payload missing');

				const current = data.current_weather;

				// 如果遇到未覆盖的天气码，就显示一条通用但不生硬的文案。
				const message = weatherCodes[current.weathercode] ?? '天气有点神秘，但今天依旧适合搞点东西。';
				if (weatherTemp instanceof HTMLElement) {
					weatherTemp.textContent = `${Math.round(current.temperature)}°C`;
				}
				weatherLine.textContent = message;
			} catch {
				// 网络失败、API 失败、数据异常，都回到默认状态。
				fallbackWeather();
			}
		},
		// 用户拒绝定位、定位超时、定位失败时，也回到默认天气。
		fallbackWeather,

		/*
		 * timeout: 最多等 5 秒，不让天气模块拖住用户。
		 * maximumAge: 30 分钟内的定位缓存可以复用，减少重复请求定位权限/定位耗时。
		 */
		{ timeout: 5000, maximumAge: 30 * 60 * 1000 },
	);
};

/*
 * 初始化中间像素墙。
 *
 * 原始素材来自 assets/wall/dark.html 和 assets/wall/light.html：
 * - dark 版本：Durian / Pixel / Wave / Glow 循环变形。
 * - light 版本：Durian 单词漂浮。
 *
 * 极致优化版：
 * 1. 每套 wall 只有一个 canvas，不再创建 56 x 16 x 2 个 DOM 像素格。
 * 2. 不再逐格写 style，所有像素用 Canvas 2D 绘制。
 * 3. 空白贡献墙预渲染到离屏 canvas，每帧只画发光像素。
 * 4. 当前主题、进入视口、页面可见，三者同时满足才启动动画。
 * 5. 帧率限制到约 24fps，并且 devicePixelRatio 最高只取 1.5，防止高分屏把成本放大。
 */
const initPixelWalls = () => {
	const wallElements = Array.from(document.querySelectorAll('[data-wall]'));
	const wallSection = document.querySelector('.wall-section');
	const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (!wallElements.length || !(wallSection instanceof HTMLElement)) return;

	const cols = 56;
	const rows = 16;
	const totalCells = cols * rows;
	const wordHold = 2600;
	const morphTime = 980;
	const entryTime = 1400;
	const frameInterval = 1000 / 24;

	const font = {
		D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
		u: ['10001', '10001', '10001', '10001', '10001', '10011', '01101'],
		r: ['10110', '11001', '10000', '10000', '10000', '10000', '10000'],
		i: ['010', '000', '010', '010', '010', '010', '010'],
		a: ['01110', '00001', '01111', '10001', '10001', '10011', '01101'],
		n: ['10110', '11001', '10001', '10001', '10001', '10001', '10001'],
		P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
		x: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
		e: ['01110', '10001', '11111', '10000', '10000', '10001', '01110'],
		l: ['100', '100', '100', '100', '100', '100', '111'],
		W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
		v: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
		G: ['01111', '10000', '10000', '10011', '10001', '10001', '01110'],
		o: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
		w: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
	};

	const fireworks = [
		{ cx: 6, cy: 4, hue: 32, delay: 0, size: 1.25 },
		{ cx: 49, cy: 4, hue: 207, delay: 0.55, size: 1.25 },
		{ cx: 6, cy: 12, hue: 286, delay: 1.05, size: 1.15 },
		{ cx: 49, cy: 12, hue: 125, delay: 1.5, size: 1.15 },
	];

	const sparkPattern = [
		[0, 0, 1],
		[0, -2, 0.62],
		[2, 0, 0.62],
		[0, 2, 0.62],
		[-2, 0, 0.62],
		[1, -1, 0.42],
		[1, 1, 0.42],
		[-1, 1, 0.42],
		[-1, -1, 0.42],
	];

	const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
	const easeOut = (value) => 1 - Math.pow(1 - value, 3);
	const easeInOut = (value) => (value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2);
	const getPixelRatio = () => Math.min(window.devicePixelRatio || 1, 1.5);
	const getPalette = (light) => ({
		empty: light ? '#ebedf0' : '#161b22',
		emptyBorder: light ? 'rgba(175, 184, 193, 0.72)' : 'rgba(48, 54, 61, 0.72)',
		wordBorder: light ? 'rgba(31, 35, 40, 0.18)' : 'rgba(240, 246, 252, 0.16)',
		sparkBorder: light ? 'rgba(31, 35, 40, 0.18)' : 'rgba(240, 246, 252, 0.2)',
	});

	const roundedRect = (context, x, y, width, height, radius) => {
		const safeRadius = Math.min(radius, width / 2, height / 2);
		if (typeof context.roundRect === 'function') {
			context.beginPath();
			context.roundRect(x, y, width, height, safeRadius);
			return;
		}

		context.beginPath();
		context.moveTo(x + safeRadius, y);
		context.arcTo(x + width, y, x + width, y + height, safeRadius);
		context.arcTo(x + width, y + height, x, y + height, safeRadius);
		context.arcTo(x, y + height, x, y, safeRadius);
		context.arcTo(x, y, x + width, y, safeRadius);
	};

	const getWordPixels = (word) => {
		const letterGap = 1;
		const glyphHeight = 7;
		const glyphs = [...word].map((letter) => font[letter] || font[letter.toLowerCase()] || font[letter.toUpperCase()]).filter(Boolean);
		const wordWidth = glyphs.reduce((sum, glyph, index) => sum + glyph[0].length + (index === glyphs.length - 1 ? 0 : letterGap), 0);
		const startX = Math.floor((cols - wordWidth) / 2);
		const startY = Math.floor((rows - glyphHeight) / 2);
		const points = [];
		let cursor = startX;

		glyphs.forEach((glyph) => {
			glyph.forEach((row, gy) => {
				[...row].forEach((value, gx) => {
					if (value === '1') points.push({ x: cursor + gx, y: startY + gy, localX: cursor + gx - startX, localY: gy, wordWidth });
				});
			});
			cursor += glyph[0].length + letterGap;
		});

		return points;
	};

	const addToBuffer = (buffer, x, y, data) => {
		if (x < 0 || x >= cols || y < 0 || y >= rows || data.alpha <= 0.02) return;
		const key = y * cols + x;
		if (buffer.alpha[key] === 0) buffer.keys.push(key);
		if (data.alpha <= buffer.alpha[key]) return;

		buffer.alpha[key] = data.alpha;
		buffer.hue[key] = data.hue;
		buffer.kind[key] = data.type === 'spark' ? 2 : 1;
		buffer.yMove[key] = data.yMove;
		buffer.scale[key] = data.scale;
	};

	const createRenderer = (wall) => {
		if (!(wall instanceof HTMLElement)) return null;
		const canvas = wall.querySelector('[data-wall-canvas]');
		if (!(canvas instanceof HTMLCanvasElement)) return null;

		const context = canvas.getContext('2d', { alpha: true });
		const staticCanvas = document.createElement('canvas');
		const staticContext = staticCanvas.getContext('2d', { alpha: true });
		if (!context || !staticContext) return null;

		const words = (wall.dataset.wallWords || 'Durian').split(',').map((word) => word.trim()).filter(Boolean);
		const wordMaps = words.map((word) => ({ word, points: getWordPixels(word) }));
		const isLightWall = wall.dataset.wallTheme === 'light';
		const palette = getPalette(isLightWall);
		const buffer = {
			alpha: new Float32Array(totalCells),
			hue: new Float32Array(totalCells),
			kind: new Uint8Array(totalCells),
			yMove: new Float32Array(totalCells),
			scale: new Float32Array(totalCells),
			keys: [],
		};

		let active = false;
		let animationFrame = 0;
		let frameTimer = 0;
		let startTime = performance.now();
		let ratio = getPixelRatio();
		let cssWidth = 0;
		let cssHeight = 0;
		let cellSize = 0;
		let gap = 0;
		let gridX = 0;
		let gridY = 0;
		let needsStaticFrame = true;

		const measure = () => {
			const width = Math.max(1, Math.floor(canvas.clientWidth));
			const height = Math.max(1, Math.floor(canvas.clientHeight || width * (rows / cols)));
			const nextRatio = getPixelRatio();
			if (width === cssWidth && height === cssHeight && nextRatio === ratio) return false;

			cssWidth = width;
			cssHeight = height;
			ratio = nextRatio;
			canvas.width = Math.round(cssWidth * ratio);
			canvas.height = Math.round(cssHeight * ratio);
			staticCanvas.width = canvas.width;
			staticCanvas.height = canvas.height;
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			staticContext.setTransform(ratio, 0, 0, ratio, 0, 0);

			gap = clamp(cssWidth * 0.0034, 1, 3);
			cellSize = Math.min((cssWidth - gap * (cols - 1)) / cols, (cssHeight - gap * (rows - 1)) / rows);
			gridX = (cssWidth - (cellSize * cols + gap * (cols - 1))) / 2;
			gridY = (cssHeight - (cellSize * rows + gap * (rows - 1))) / 2;
			needsStaticFrame = true;
			return true;
		};

		const drawCell = (targetContext, key, options) => {
			const x = key % cols;
			const y = Math.floor(key / cols);
			const drawX = gridX + x * (cellSize + gap);
			const drawY = gridY + y * (cellSize + gap) + options.yMove;
			const size = cellSize * options.scale;
			const offset = (cellSize - size) / 2;

			targetContext.save();
			targetContext.fillStyle = options.fill;
			targetContext.strokeStyle = options.stroke;
			targetContext.lineWidth = Math.max(0.7, cellSize * 0.08);
			if (options.shadowBlur > 0) {
				targetContext.shadowColor = options.shadowColor;
				targetContext.shadowBlur = options.shadowBlur;
			}
			roundedRect(targetContext, drawX + offset, drawY + offset, size, size, Math.max(2, cellSize * 0.22));
			targetContext.fill();
			targetContext.stroke();
			targetContext.restore();
		};

		const buildStaticFrame = () => {
			measure();
			staticContext.clearRect(0, 0, cssWidth, cssHeight);
			for (let key = 0; key < totalCells; key += 1) {
				drawCell(staticContext, key, {
					fill: palette.empty,
					stroke: palette.emptyBorder,
					shadowBlur: 0,
					shadowColor: 'transparent',
					yMove: 0,
					scale: 1,
				});
			}

			const gloss = staticContext.createLinearGradient(0, gridY, 0, gridY + cellSize * rows + gap * (rows - 1));
			gloss.addColorStop(0, isLightWall ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)');
			gloss.addColorStop(0.45, 'rgba(255,255,255,0)');
			gloss.addColorStop(1, isLightWall ? 'rgba(9,105,218,0.05)' : 'rgba(57,211,83,0.08)');
			staticContext.fillStyle = gloss;
			staticContext.fillRect(gridX, gridY, cellSize * cols + gap * (cols - 1), cellSize * rows + gap * (rows - 1));
			needsStaticFrame = false;
		};

		const drawFireworks = (time) => {
			fireworks.forEach((firework) => {
				const t = ((time / 1000 + firework.delay) % 2.4) / 2.4;
				const fade = Math.pow(Math.sin(t * Math.PI), 1.6) * firework.size;
				sparkPattern.forEach(([dx, dy, weight], index) => {
					const alpha = Math.max(0, fade * weight - index * 0.012);
					if (alpha <= 0.04) return;
					addToBuffer(buffer, firework.cx + dx, firework.cy + dy, {
						type: 'spark',
						alpha,
						hue: firework.hue + index * 7 + Math.sin(time / 680) * 7,
						yMove: 0,
						scale: 0.96 + alpha * 0.08,
					});
				});
			});
		};

		const drawEntry = (time) => {
			const progress = clamp(time / entryTime);
			const colorMove = time * 0.034;
			const yFloat = Math.sin(time / 540) * 2.8;
			(wordMaps[0]?.points || []).forEach((point) => {
				const delay = (point.localX / point.wordWidth) * 0.42 + (point.localY / 7) * 0.18;
				const appear = easeOut(clamp((progress - delay) / 0.42));
				addToBuffer(buffer, point.x, point.y, {
					type: 'word',
					alpha: appear,
					hue: (point.x * 8.4 - colorMove + point.y * 4.2 + 360) % 360,
					yMove: yFloat + (1 - appear) * 8,
					scale: 0.82 + appear * 0.18,
				});
			});
		};

		const drawMorphingWord = (time) => {
			const elapsed = time - entryTime;
			const cycle = wordHold + morphTime;
			const index = Math.floor(elapsed / cycle) % wordMaps.length;
			const nextIndex = (index + 1) % wordMaps.length;
			const phase = elapsed % cycle;
			const morphing = wordMaps.length > 1 && phase > wordHold;
			const morph = morphing ? easeInOut((phase - wordHold) / morphTime) : 0;
			const current = wordMaps[index]?.points || [];
			const next = wordMaps[nextIndex]?.points || current;
			const colorMove = time * 0.034;
			const yFloat = Math.sin(time / 540) * (isLightWall ? 3.2 : 2.8);

			if (!morphing) {
				current.forEach((point) => {
					addToBuffer(buffer, point.x, point.y, {
						type: 'word',
						alpha: 1,
						hue: (point.x * 8.4 - colorMove + point.y * 4.2 + 360) % 360,
						yMove: yFloat,
						scale: isLightWall ? 0.99 + Math.sin(time / 680) * 0.018 : 1,
					});
				});
				return;
			}

			current.forEach((point) => {
				const wave = Math.sin((point.localX / Math.max(1, point.wordWidth)) * Math.PI);
				const alpha = (1 - morph) * (0.55 + wave * 0.45);
				addToBuffer(buffer, point.x, point.y, {
					type: 'word',
					alpha,
					hue: (point.x * 8.4 - colorMove + point.y * 4.2 + 360) % 360,
					yMove: yFloat - morph * 7,
					scale: 1 - morph * 0.14,
				});
			});

			next.forEach((point) => {
				const appear = easeOut(clamp((morph - (point.localX / Math.max(1, point.wordWidth)) * 0.28) / 0.72));
				addToBuffer(buffer, point.x, point.y, {
					type: 'word',
					alpha: appear,
					hue: (point.x * 8.4 - colorMove + point.y * 4.2 + 120 + 360) % 360,
					yMove: yFloat + (1 - appear) * 7,
					scale: 0.84 + appear * 0.16,
				});
			});
		};

		const paintBuffer = () => {
			if (needsStaticFrame) buildStaticFrame();
			context.clearRect(0, 0, cssWidth, cssHeight);
			context.drawImage(staticCanvas, 0, 0, cssWidth, cssHeight);

			for (const key of buffer.keys) {
				const alpha = clamp(buffer.alpha[key]);
				const hue = buffer.hue[key];
				const isSpark = buffer.kind[key] === 2;
				const light = isSpark
					? isLightWall ? 48 + alpha * 26 : 30 + alpha * 38
					: isLightWall ? 48 + Math.sin((hue * Math.PI) / 180) * 4 : 38 + alpha * 18;
				const saturation = isSpark ? 84 : isLightWall ? 76 : 68 + alpha * 12;
				drawCell(context, key, {
					fill: `hsla(${hue}, ${saturation}%, ${light}%, ${isSpark ? 0.3 + alpha * 0.58 : 0.18 + alpha * 0.82})`,
					stroke: isSpark ? palette.sparkBorder : palette.wordBorder,
					shadowBlur: alpha > 0.42 ? 2 + alpha * 4 : 0,
					shadowColor: `hsla(${hue}, 82%, 58%, ${alpha * 0.2})`,
					yMove: buffer.yMove[key],
					scale: buffer.scale[key],
				});

				buffer.alpha[key] = 0;
				buffer.hue[key] = 0;
				buffer.kind[key] = 0;
				buffer.yMove[key] = 0;
				buffer.scale[key] = 0;
			}
			buffer.keys.length = 0;
		};

		const renderStillFrame = () => {
			buildStaticFrame();
			(wordMaps[0]?.points || []).forEach((point) => {
				addToBuffer(buffer, point.x, point.y, {
					type: 'word',
					alpha: 1,
					hue: (point.x * 8.4 + point.y * 4.2) % 360,
					yMove: 0,
					scale: 1,
				});
			});
			paintBuffer();
		};

		const scheduleFrame = () => {
			window.clearTimeout(frameTimer);
			frameTimer = window.setTimeout(() => {
				if (active) animationFrame = requestAnimationFrame(render);
			}, frameInterval);
		};

		const render = (now) => {
			if (!active) return;
			measure();
			const time = now - startTime;
			drawFireworks(time);
			if (time < entryTime) drawEntry(time);
			else drawMorphingWord(time);
			paintBuffer();
			scheduleFrame();
		};

		return {
			theme: wall.dataset.wallTheme || 'dark',
			resize() {
				if (measure()) renderStillFrame();
			},
			setActive(nextActive) {
				if (active === nextActive) return;
				active = nextActive;
				cancelAnimationFrame(animationFrame);
				window.clearTimeout(frameTimer);
				wall.classList.toggle('is-running', active && !prefersReducedMotion);

				if (!active) return;

				startTime = performance.now();
				renderStillFrame();
				if (!prefersReducedMotion) scheduleFrame();
			},
		};
	};

	const renderers = wallElements.map(createRenderer).filter(Boolean);
	let sectionInView = false;
	let pageVisible = document.visibilityState === 'visible';

	const syncActiveWall = () => {
		const currentTheme = getTheme();
		renderers.forEach((renderer) => {
			renderer.setActive(sectionInView && pageVisible && renderer.theme === currentTheme);
		});
	};

	const observer = new IntersectionObserver(
		([entry]) => {
			sectionInView = Boolean(entry?.isIntersecting);
			syncActiveWall();
		},
		{ rootMargin: '180px 0px' },
	);

	observer.observe(wallSection);
	window.addEventListener('durianstudio:themechange', syncActiveWall);
	document.addEventListener('visibilitychange', () => {
		pageVisible = document.visibilityState === 'visible';
		syncActiveWall();
	});

	if ('ResizeObserver' in window) {
		let resizeFrame = 0;
		const resizeObserver = new ResizeObserver(() => {
			cancelAnimationFrame(resizeFrame);
			resizeFrame = requestAnimationFrame(() => {
				renderers.forEach((renderer) => renderer.resize());
				syncActiveWall();
			});
		});
		wallElements.forEach((wall) => resizeObserver.observe(wall));
	} else {
		window.addEventListener('resize', () => {
			renderers.forEach((renderer) => renderer.resize());
			syncActiveWall();
		});
	}

	renderers.forEach((renderer) => renderer.resize());
	syncActiveWall();
};

// 页面所有交互功能的统一入口。以后新增小交互，也可以在这里挂初始化函数。
const initSite = () => {
	initThemeToggle();
	initContactTabs();
	initWeather();
	initPixelWalls();
};

/*
 * 启动脚本。
 *
 * 因为脚本使用 defer 加载，通常 DOM 已经准备好了；
 * 但为了兼容各种加载方式，仍然做一次 document.readyState 判断。
 */
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initSite, { once: true });
} else {
	initSite();
}
