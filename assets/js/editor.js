// Install some useful jQuery extensions that we use a lot

$.extend($.fn, {
	modifyClass: function(className, add) {
		return this[add ? 'addClass' : 'removeClass'](className);
	},

	orNull: function() {
		return this.length > 0 ? this : null;
	},

	findAndSelf: function(selector) {
		return this.find(selector).add(this.filter(selector));
	}
});

function createCodeMirror(place, options, source) {
	return new CodeMirror(place, $.extend({
		lineNumbers: true,
		matchBrackets: true,
		indentUnit: 4,
		tabMode: 'shift',
		value: source.html().replace(/\t/gi, '    ').match(
			// Remove first & last empty line
			/^\s*?[\n\r]?([\u0000-\uffff]*?)[\n\r]?\s*?$/)[1]
	}, options));
}

function createPaperScript(element) {
	var scriptName = 'paperjs_' + document.documentURI.match(/\/([^\/]*)$/)[1],
		script = $('script', element).orNull(),
		runButton = $('.button.run', element).orNull();
	if (!script || !runButton)
		return;
	var canvas = $('canvas', element),
		showSplit = element.hasClass('split'),
		sourceFirst = element.hasClass('source'),
		consoleContainer = $('.console', element).orNull(),
		editor = null,
		tools = $('.tools', element),
		inspectorButton = $('.tools .button.inspector', element).orNull(),
		inspectorInfo = $('.tools .info', element),
		source = $('.source', element),
		code = localStorage[scriptName] || '',
		scope;

	script.html(code);

	function showSource(show) {
		source.modifyClass('hidden', !show);
		runButton.text(show ? 'Run' : 'Source');
		if (show && !editor) {
			editor = createCodeMirror(source[0], {
				onKeyEvent: function(editor, event) {
					localStorage[scriptName] = editor.getValue();
					/*
					event = new DomEvent(event);
					if (event.type == 'keydown') {
						var pos = editor.getCursor();
						pos.ch += 4;
						editor.setCursor(pos);
						event.stop();
					}
					*/
				}
			}, script);
		}
	}

	function evaluateCode() {
		scope.setup(canvas[0]);
		scope.evaluate(code);
		createInspector();
	}

	function runCode() {
		// Update script to edited version
		code = editor.getValue();
		script.html(code);
		// In order to be able to install our own error handlers first, we are
		// not relying on automatic script loading, which is disabled by the use
		// of data-paper-ignore="true". So we need to create a new paperscope
		// each time.
		if (scope)
			scope.remove();
		scope = new paper.PaperScope(script[0]);
		createConsole();
		// parseInclude() triggers evaluateCode() in the right moment for us.
		parseInclude();
	}

	if (consoleContainer) {
		// Append to a container inside the console, so css can use :first-child
		consoleContainer = $('<div class="content"/>').appendTo(consoleContainer);
	}

	function createConsole() {
		if (!consoleContainer)
			return;
		// Override the console object with one that logs to our new
		// console
		function print(className, args) {
			$('<div/>')
				.addClass(className)
				.text(paper.Base.each(args, function(arg) {
									this.push(arg + '');
								}, []).join(' '))
				.appendTo(consoleContainer);
			consoleContainer.scrollTop(consoleContainer.prop('scrollHeight'));
		}

		$.extend(scope, {
			console: {
				log: function() {
					print('line', arguments);
				},

				error: function() {
					print('line error', arguments);
				}
			}
		});
	}

	function clearConsole() {
		if (consoleContainer) {
			consoleContainer.children().remove();
		}
	}

	// Install an error handler to log the errors in our log too:
	window.onerror = function(error, url, lineNumber) {
		scope.console.error('Line ' + lineNumber + ': ' + error);
		paper.view.draw();
	};

	function parseInclude() {
		var includes = [];
		// Parse code for includes, and load them synchronously, if present
		code.replace(/\binclude\(['"]([^)]*)['"]\)/g, function(all, url) {
			includes.push(url);
		});

		// Install empty include() function, so code can execute include()
		// statements, which we process separately above.
		scope.include = function(url) {
		};

		// Load all includes sequentially, and finally evaluate code, since 
		// the code will probably be interdependent.
		function load() {
			var url = includes.shift();
			if (url) {
				$.getScript(url, load);
			} else {
				evaluateCode();
			}
		}
		load();
	}

	var inspectorTool,
		previousTool,
		toggleInspector = false;

	function createInspector() {
		if (!inspectorButton)
			return;
		previousTool = scope.tools[0];
		inspectorTool = new paper.Tool();
		prevItem = null;
		inspectorTool.onMouseDown = function(event) {
			if (prevItem) {
				prevItem.selected = false;
			}
			var item = event.item;
			if (item) {
				var handle = item.hitTest(event.point, {
					segments: true,
					tolerance: 4
				});
				if (handle) {
					item = handle.segment;
				}
				item.selected = true;
			}
			inspectorInfo.modifyClass('hidden', !item);
			if (item) {
				var text;
				if (item instanceof paper.Segment) {
					text = 'Segment';
					text += '<br />point: ' + item.point;
					if (!item.handleIn.isZero())
						text += '<br />handleIn: ' + item.handleIn;
					if (!item.handleOut.isZero())
						text += '<br />handleOut: ' + item.handleOut;
				} else {
					text = item.constructor._name;
					text += '<br />position: ' + item.position;
					text += '<br />bounds: ' + item.bounds;
				}
				inspectorInfo.html(text);
			}
			prevItem = item;
		};
		inspectorTool.onSelect = function() {
			console.log('select');
		};
		// reactivate previous tool for now
		if (previousTool) {
			previousTool.activate();
		}
	}

	if (inspectorButton) {
		inspectorButton.click(function(event) {
			if (inspectorTool) {
				(toggleInspector && previousTool ? previousTool : inspectorTool).activate();
				if (toggleInspector) {
					if (prevItem)
						prevItem.selected = false;
					prevItem = null;
				}
				toggleInspector = !toggleInspector;
			}
		});
	}

	var panes = element.findAndSelf('.split-pane');
	panes.each(function() {
		var pane = $(this);
		pane.split({
			orientation: pane.attr('data-orientation') == 'hor' ? 'vertical' : 'horizontal',
			position: pane.attr('data-percentage'),
			limit: 100
		});
	});

	// Refresh editor if parent gets resized
	$('.editor', element).parents('.split-pane').on('splitter.resize', function() {
		editor.refresh();
	});

	canvas.parents('.split-pane').on('splitter.resize', function() {
		var pane = $('.canvas', element);
		scope.view.setViewSize(pane.width(), pane.height());
	});

	function toggleView() {
		var show = source.hasClass('hidden');
		canvas.modifyClass('hidden', show);
		showSource(show);
		if (!show)
			runCode();
	}

	$(window).resize(function() {
		// Do not have .paperscript automatically resize to 100%, instead
		// resize it in the resize handler, for much smoother redrawing,
		// since the splitter panes are aligning using right: 0 / bottom: 0.
		element.width($(window).width()).height($(window).height());
		if (editor) {
			panes.trigger('splitter.resize');
			editor.refresh();
		}
	}).trigger('resize');

	// Run the script once the window is loaded
	$(window).load(runCode);

	if (showSplit) {
		showSource(true);
	} else if (sourceFirst) {
		toggleView();
	}

	$('.button', element).mousedown(function(event) {
		return false;
	});

	runButton.click(function() {
		if (showSplit) {
			runCode();
		} else {
			toggleView();
		}
		return false;
	});

	$('.button.clear-console', element).click(function() {
		clearConsole();
	});
}

$(function() {
	$('.paperscript').each(function() {
		createPaperScript($(this));
	});
	$(document).keydown(function(event) {
		if ((event.metaKey || event.ctrlKey) && event.which == 69) {
			$('.paperscript .button.run').trigger('click', event);
			return false;
		}
	});
});
