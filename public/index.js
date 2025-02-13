let width, height;
let data,
	svgMap,
	path,
	countries,
	categories,
	svgBar,
	mapSvgDataPaths,
	brush,
	brushCell;

const numFormat = new Intl.NumberFormat();

const config = {
	stroke: '#ececec',
	map: {
		fill: '#fff',
		stroke: '#ececec'
	}
};

const countryCentroids = {};

// country names are not consistent between geoJSON data and terrorist attack data
// 'from csv': 'to geoJSON'
const countryNameTransformation = {
	'United States': 'United States of America'
};
function transformCountryNames(a) {
	if (a.Entity in countryNameTransformation) {
		a.Entity = countryNameTransformation[a.Entity];
	}
	return a;
}

function repaintMap(grow = false) {
	mapSvgDataPaths.classed('hidden', c => c.properties.ADMIN in data && data[c.properties.ADMIN].isHidden);
	if (grow) {
		mapSvgDataPaths.sort((a, b) => a.isHidden ? 1 : -1);
		mapSvgDataPaths.classed('grow', c => c.properties.ADMIN in data && !data[c.properties.ADMIN].isHidden);
	}
}

function drawMap() {
	const extent = d3.extent(Object.values(data).map(a => a.total));
	const colorMappingScale = d3.scaleSequential(d =>
		d3.interpolateReds(
			d3.scaleLog().domain(extent)(d)
		)
	);

	buildLegend(extent, colorMappingScale);
	
	svgMap.selectAll('*').remove();

	const mapSvgData = svgMap.append('g');
	mapSvgDataPaths = mapSvgData.selectAll('path')
		.data(countries.features)
		.enter()
		.append('path')
		.attr('d', path)
		.attr('class', 'country')
		.style('transform-origin', c => c.properties.ADMIN in data ? `${countryCentroids[c.properties.ADMIN][0]}px ${countryCentroids[c.properties.ADMIN][1]}px` : null)
		.attr('fill', c => {
			if (!(c.properties.ADMIN in data)) {
				return 'black';
			}
			return colorMappingScale(Math.max(...Object.entries(data[c.properties.ADMIN]).filter(([key, value]) => categories.includes(key)).map(([key, value]) => value)));
		})
		.classed('hidden', c => c.properties.ADMIN in data && data[c.properties.ADMIN].isHidden);

		/**
		 * Brush stuff for map
		 */
		brush = d3.brush()
			.extent([[0, 0], [width, height]])
			.on('start', brushstarted)
			.on('brush', debounceBrushed)
			.on('end', brushended);
		mapSvgData.call(brush);
		function brushstarted() {
			if (brushCell !== this) {
				d3.select(brushCell).call(brush.move, null);
				brushCell = this;
			}
		}
		function brushed({selection}) {
			if (selection) {
				const [[x0, y0], [x1, y1]] = selection;
				mapSvgDataPaths.classed('hidden', c => {
					const country = c.properties.ADMIN;
					const [x, y] = countryCentroids[country];
					const isHidden = x0 > x || x1 < x || y0 > y || y1 < y;
					if (country in data) {
						data[country].isHidden = isHidden;
					}
					return isHidden;
				});
			}
			drawBar();
			drawTable();
		}
		let brushTimer = null;
		function debounceBrushed(event) {
			clearTimeout(brushTimer);
			brushTimer = setTimeout(function() {
				brushed(event);
			}, 75);
		}
		function brushended({selection}) {
			if (selection) return;
			mapSvgDataPaths.classed('hidden', false);
			for (const country in data) {
				data[country].isHidden = false;
			}
			drawBar();
			drawTable();
		}
}

function drawBar() {
	const dataToDraw = Object.values(data).filter(d => !d.isHidden);
	if (!dataToDraw.length) { // case where everything is hidden, clear bars from chart and exit
		svgBar.selectAll('g.bars').remove();
		return;
	};
	const barData = categories.map(c => ({ category: c, value: 0 }));
	for (const d of dataToDraw) {
		for (const category of categories) {
			barData.find(a => a.category === category).value += d[category];
		}
	}
	const padding = 200, barWidth = 40, bWidth = width / 4, bHeight = height / 2;
	svgBar.selectAll('g').remove();
	svgBar.attr('width', bWidth).attr('height', bHeight);
	const categoryScale = d3.scaleOrdinal(d3.schemeCategory10).domain(categories); // TODO not perfect because there are 12 categories and only 10 colors :(
	const barScale = d3.scaleLinear().domain(d3.extent(barData, d => d.value)).range([0, bHeight - padding]);
	let xPos = 0;
	svgBar.append('g')
		.attr('class', 'bars')
		.selectAll('rect')
		.data(barData)
		.enter()
		.append('rect')
		.attr('x', d => xPos += barWidth)
		.attr('y', d => svgBar.attr('height') - barScale(d.value) - padding)
		.attr('width', barWidth)
		.attr('height', d => barScale(d.value))
		.style('stroke', config.stroke)
		.style('stroke-width', '1')
		.style('fill', d => categoryScale(d.category));


	const xAxis = d3.axisBottom()
		.scale(d3.scalePoint().domain(categories).range([barWidth, barWidth * categories.length]))
	const xAxisGroup = svgBar.append('g')
		.attr('class', 'axis')
		.attr('transform', `translate(${barWidth / 2}, ${bHeight - padding})`)
	xAxisGroup.call(xAxis);
	xAxisGroup.attr('text-anchor', 'left')
		.attr('font-size', '16');
	xAxisGroup.selectAll('.tick > text')
		.style('transform', 'rotate(90deg) translate(10px, -14px)')
		.style('-webkit-font-smoothing', 'subpixel-antialiased')
		.style('user-select', 'none');

	const yAxisScale = d3.scaleLinear().domain(d3.extent(barData, d => d.value)).range([bHeight - padding, 0]);
	const yAxis = d3.axisLeft()
		.scale(yAxisScale)
	const yAxisGroup = svgBar.append('g')
		.attr('class', 'axis')
		.attr('transform', `translate(${barWidth}, 0)`)
		yAxisGroup.call(yAxis);
		yAxisGroup.selectAll('.tick > text')
		.style('-webkit-font-smoothing', 'subpixel-antialiased')
		.style('user-select', 'none');
}

function drawTable() {
	const tableBody = table.querySelector('#table > tbody')
	const rows = tableBody.querySelectorAll('tr');
	for (const row of rows) {
		row.remove();
	}
	for (const country in data) {
		if (!data[country].isHidden) {
			const newRow = document.createElement('tr');
			const countryName = document.createElement('td');
			countryName.classList.add('bind-country-name');
			countryName.innerText = country;
			const counts = [document.createElement('td')];
			counts[0].innerText = numFormat.format(data[country].total);
			for (const category of categories) {
				const idx = counts.push(document.createElement('td'));
				counts[idx - 1].innerText = numFormat.format(data[country][category]);
			}
			newRow.append(countryName, ...counts);
			tableBody.append(newRow);
		}
	}
}

function buildLegend(extent, scale) {
	const [lo, hi] = extent;
	const interval = parseInt((hi - lo) / 200);
	const legendData = d3.range(1, 201);
	const legend = d3.select('#legend');
	const w = 1
	legend.selectAll('rect')
		.data(legendData)
		.enter()
		.append('rect')
		.attr('x', d => d * w)
		.attr('y', 50)
		.attr('height', 20)
		.attr('width', w)
		.attr('fill', d => scale(lo + d * interval))
		.attr('stroke', 'none');

	const loText = numFormat.format(extent[0]);
	const hiText = numFormat.format(extent[1]);

	legend.append('text')
		.text('# Attacks (Log)')
		.attr('fill', config.stroke)
		.attr('x', 100)
		.attr('width', 200)
		.attr('y', 30)
		.attr('font-size', '1.25em')
		.attr('font-weight', 'bold')
		.attr('text-anchor', 'middle');
	legend.append('text')
		.text(loText)
		.attr('fill', config.stroke)
		.attr('x', 0)
		.attr('y', 90);
	legend.append('text')
		.text(hiText)
		.attr('fill', config.stroke)
		.attr('x', 200)
		.attr('y', 90)
		.attr('text-anchor', 'end');
}

function help(event) {
	const modalElts = document.querySelectorAll('.modal, .modal-overlay');
	for (const elt of modalElts) {
		elt.classList.add('open');
	}
}

function unhelp(event) {
	const modalElts = document.querySelectorAll('.modal, .modal-overlay');
	for (const elt of modalElts) {
		elt.classList.remove('open');
	}
}

window.addEventListener('load', async function() {
	document.querySelector('.button-help').addEventListener('click', help);
	document.querySelector('.modal-overlay').addEventListener('click', unhelp);
	document.querySelector('.unhelp').addEventListener('click', unhelp);

	svgMap = d3.select('#map');
	svgBar = d3.select('#bar');
	const { clientWidth, clientHeight } = document.body;
	width = clientWidth;
	height = clientHeight;
	projection = d3.geoMercator();
	path = d3.geoPath(projection);

	svgMap.attr('width', width).attr('height', height);
	projection.translate([width / 2, height / 2]);
	svgBar.attr('width', width / 4).attr('height', height / 2);

	
	console.time('data fetch/parse');
	countries = await d3.json('data/countries.geo.json');
	for (const country of countries.features) {
		countryCentroids[country.properties.ADMIN] = path.centroid(country);
	}
	const countriesList = countries.features.map(feature => feature.properties.ADMIN);

	const attacks = (await d3.csv('data/Terrorist attacks by weapon type - Global Terrorism Database (2018).csv'))
		.map(transformCountryNames) // try to make country names uniform between geoJSON and csv data
		.filter(a => countriesList.includes(a.Entity.trim())) // make sure we have geoJSON data for these datapoints
		.map(a => ({
			Biological: parseInt(a.Biological),
			Chemical: parseInt(a.Chemical),
			Entity: a.Entity,
			Explosives: parseInt(a.Explosives),
			'Fake Weapons': parseInt(a['Fake Weapons']),
			Firearms: parseInt(a.Firearms),
			Incendiary: parseInt(a.Incendiary),
			Melee: parseInt(a.Melee),
			Other: parseInt(a.Other),
			Radiological: parseInt(a.Radiological),
			'Sabotage Equipment': parseInt(a['Sabotage Equipment']),
			Unknown: parseInt(a.Unknown),
			Vehicle: parseInt(a.Vehicle),
			Year: parseInt(a.Year)
		}))
		.filter(a => a.Year >= 2008);
	
	// get categories from data
	categories = Object.keys(attacks[0]).filter(key => key !== 'Entity' && key !== 'Year');

	data = attacks.reduce((acc, a) => {
		if (a.Entity in acc) {
			for (category of categories) {
				acc[a.Entity][category] += a[category];
				acc[a.Entity].total += a[category];
			}
		} else {
			const newItem = {
				...a,
				isHidden: false,
				total: 0
			};
			for (category of categories) {
				newItem.total += a[category];
			}
			delete newItem.Year;
			acc[newItem.Entity] = (newItem);
		}
		return acc;
	}, {});
	console.timeEnd('data fetch/parse');

	drawMap(svgMap, path, countries, categories, svgBar);
	drawBar(svgBar, categories);
	// make table header
	const thead = document.querySelector('#table > thead > tr');
	const tbody = document.querySelector('#table > tbody');
	for (const category of categories) {
		const th = document.createElement('th');
		th.innerText = category;
		thead.append(th);
	}
	tbody.addEventListener('click', function(event) {
		if (event.target.classList.contains('bind-country-name')) {
			event.preventDefault();
			window.scrollTo({ top: 0, behavior: 'smooth' });
			d3.select(brushCell).call(brush.clear);
			const clickedCountry = event.target.innerText;
			for (const country in data) {
				data[country].isHidden = true;
			}
			data[clickedCountry].isHidden = false;
			drawTable();
			repaintMap(true);
			drawBar();
		}
	});
	drawTable(categories);
});
