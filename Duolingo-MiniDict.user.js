// ==UserScript==
// @name       Duolingo-MiniDict
// @namespace  http://github.com/killkeeper/duolingo-minidict
// @version    0.15
// @description  A built-in dictionary for Duolingo
// @updateURL  https://raw.githubusercontent.com/killkeeper/duolingo-minidict/master/Duolingo-MiniDict.user.js
// @match      *://www.duolingo.com/*
// @grant      none
// ==/UserScript==
//

/** 
 * Duoling-MiniDict
 *
 * A GreaseMonkey / TamperMonkey user script that injects a vocabulary
 * searching tool into Duolingo's top navigation bar.
 *
 * */

(function($) {
    function DMDict(settings) {
        this.vocab_list_model = null;
        this.vocab_list = null;
        this.el = null;
        this.$el = null;
        this.selectize_api = null;
        this.diacritics = {
            es: {'A':'á', 'E':'é', 'I':'í', 'O':'ó', 'U':'úü', 'N':'ñ', '1':'¡', '!':'¡', '?':'¿'},
            fr: {'A':'àâæ', 'E':'èéêë', 'I':'îï', 'O':'ôœ', 'U':'ùûü', 'C':'ç'},
            pt: {'A':'ãáâà', 'E':'éê', 'I':'í', 'O':'õóô', 'U':'úü', 'C':'ç'},
            de: {'A':'ä', 'O':'ö', 'U':'ü', 'SS':'ß' },
            it: {'A':'àá', 'E':'èé', 'I':'ìí', 'O':'òó', 'U':'ùú'},
            pl: {'A':'ą', 'C':'ć', 'E':'ę', 'L':'ł', 'N':'ń', 'O':'ó', 'S':'ś', 'Z':'źż'},
            ro: {'A':'ăâ', 'I':'î', 'S':'şș', 'T':'ţț'},
            hu: {'A':'á', 'E':'é', 'I':'í', 'O':'öóő', 'U':'üúű'},
            dn: {'E':'éë', 'I':'ï', 'O':'óö', 'U':'ü'},
            tr: {'C':'ç', 'G':'ğ', 'I':'ıİ', 'O':'ö', 'S':'ş', 'U':'ü'}
        };
        
        this.opts = $.extend({
            datatableify: false,
            max_options: 15,
            debounce_wait: 1000,
            // if only uses a filter, allow to show more
            // (e.g. list all words belonging to a skill).
            max_options_filter_only: 50,
            sort_by: 'levdist', // levdist, strength, last_practiced
            /* disable filters, you can simply search for:
			 *    "dative case mir"
			 * and it will hit 
			 *    [word_string=mir] [skill=Dative Case]
			 */
            simple_search: true, 
        }, settings);
        
        this.data_pending = true;
        this.selectize_data_loaded = false;
        this.hints_pending = {};
        
        this.duo_apis = {
            'hints': [window.location.protocol, 
                      "//d.duolingo.com/words/hints"].join("/")
        };
        
        
        // http://stackoverflow.com/questions/11919065/sort-an-array-by-the-levenshtein-distance-with-best-performance-in-javascript
        this.lev_distance = function(s, t) {
            var d = []; //2d matrix
            
            // Step 1
            var n = s.length;
            var m = t.length;
            
            if (n == 0) return m;
            if (m == 0) return n;
            
            //Create an array of arrays in javascript (a descending loop is quicker)
            for (var i = n; i >= 0; i--) d[i] = [];
            
            // Step 2
            for (var i = n; i >= 0; i--) d[i][0] = i;
            for (var j = m; j >= 0; j--) d[0][j] = j;
            
            // Step 3
            for (var i = 1; i <= n; i++) {
                var s_i = s.charAt(i - 1);
                
                // Step 4
                for (var j = 1; j <= m; j++) {
                    
                    //Check the jagged ld total so far
                    if (i == j && d[i][j] > 4) return n;
                    
                    var t_j = t.charAt(j - 1);
                    var cost = (s_i == t_j) ? 0 : 1; // Step 5
                    
                    //Calculate the minimum
                    var mi = d[i - 1][j] + 1;
                    var b = d[i][j - 1] + 1;
                    var c = d[i - 1][j - 1] + cost;
                    
                    if (b < mi) mi = b;
                    if (c < mi) mi = c;
                    
                    d[i][j] = mi; // Step 6
                    
                    //Damerau transposition
                    if (i > 1 && j > 1 && s_i == t.charAt(j - 2) && s.charAt(i - 2) == t_j) {
                        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
                    }
                }
            }
            
            // Step 7
            return d[n][m];
        }
        
        this.initialize = function() {
            this.init_dom();
            this.fetch_vocab_list();
        }
        
        this.init_dom = function() {
            $("ul.topbar-nav-main").append('<li><a id="duo-minidict" href="javascript:void(0);">' +
                                           '<span class="icon icon-search-gray"></span></a></li>');
            $("ul.topbar-nav-main").append('<div class="popover" role="tooltip" style="display: none; overflow-y: visible; width: 512px;" id="duo-selectize-container">' + 
                                           '<h6 class="popover-title">MiniDict - Type to search:</h6>' +
                                           '<div class="popover-content" id="md-selectize">' +
                                           '<select id="select-word" class="wordlist" placeholder="Search for a word..."></select>' +
                                           '</div></div>');
            
            $("ul.topbar-nav-main li").css("font-size", "13px");
            
            this.$el = $("#duo-selectize-container");
            this.el = this.$el.get(0);
            
            $('<link rel="stylesheet" href="https://cdn.rawgit.com/brianreavis/selectize.js/f293d8b3100db2cc339d4b78ac3c9d0da53d431c/dist/css/selectize.default.css" />').appendTo('head');
            $('<style type="text/css">' +
              '.popover { overflow: visible !important; width: 512px; position: absolute; }' +
              '.popover-title { margin-left: 5px; }' +
              '.selectize-control.wordlist .selectize-dropdown > div {' +
              ' border-bottom: 1px solid rgba(0,0,0,0.05); }' + 
              '.selectize-control.wordlist .selectize-dropdown .word {' +
              ' font-weight: bold; margin-right: 5px; }' +
              '.selectize-control.wordlist .selectize-dropdown .attrs {' + 
              ' font-size: 11px; opacity: 0.8; }' +
              '.selectize-control.wordlist .selectize-dropdown .title {' +
              ' display: block; }' +
              '.selectize-control.wordlist .selectize-dropdown .hints {' +
              ' font-size: 12px; display: block; color: #a0a0a0; ' +
              ' white-space: nowrap; width: 100%; text-overflow: ellipsis;' +
              ' overflow: hidden; }' + 
              '.selectize-control.wordlist .selectize-dropdown .meta {' +
              ' list-style: none; margin: 0; padding: 0; font-size: 10px; }' +
              '.selectize-control.wordlist .selectize-dropdown .meta li {' +
              ' margin: 0; padding: 0; display: inline; margin-right: 10px; ' +
              ' color: #9f9f9f; }' +
              '.selectize-control.wordlist .selectize-dropdown .meta li span {' +
              ' color: #666666; }</style>'
             ).appendTo('head');
            
            var load_callback = null, option_render = null, score_func = null;
            if (!this.opts.simple_search) {
                load_callback = (function(self) {
                    return function(query_str, callback) {
                        if (!query_str.length) return callback();
                        
                        var query = self.build_query(query_str);
                        self.query(self.dict_lang, query, callback);
                    }
                })(this);
                
                score_func = function(search) {
                    // a customiezd score function that will strip 
                    //     - the filter "key:" prefix
                    //     - quotes
                    var striped_search = search.replace(
                        /[a-zA-Z-_]+:/g, "").replace(/["']/g, "");
                    
                    return this.getScoreFunction(striped_search);
                };
                
                option_render = function(item, escape) {
                    return '<div><span class="title"><span class="word">' + 
                        escape(item.word_string) + '</span><span class="attrs">' + 
                        escape(item.pos) + 
                        (item.gender ? " (" + item.gender.substr(0, 1).toLowerCase() + ".)" : "") +
                        (item.infinitive ? " (inf: " + item.infinitive + ")" : "") +
                        '</span></span><span class="hints">' + 
                        escape(item.hints.slice(0, 10).join(", ")) + 
                        '</span><ul class="meta">' + 
                        '<li>Skill: <span>' + escape(item.skill) + '</span></li>' +
                        '<li>Strength: <span>' + $.map(new Array(item.strength_bars), function(d) { return "&bull;"}).join("") +
                        '</span></li>' +
                        '</ul></div>';
                };
            }
            else {
                option_render = (function(self) {
                    return function(item, escape) {
                        if (_.isUndefined(item.hints)) self.load_hints(item.id, item.word_string);
                        item.hints = item.hints || [];
                        return '<div><span class="title"><span class="word">' + 
                            escape(item.word_string) + '</span><span class="attrs">' + 
                            escape(item.pos) + 
                            (item.gender ? " (" + item.gender.substr(0, 1).toLowerCase() + ".)" : "") +
                            (item.infinitive ? " (inf: " + item.infinitive + ")" : "") +
                            '</span></span><span class="hints">' + 
                            escape(item.hints.slice(0, 10).join(", ")) + 
                            '</span><ul class="meta">' + 
                            '<li>Skill: <span>' + escape(item.skill) + '</span></li>' +
                            '<li>Strength: <span>' + $.map(new Array(item.strength_bars), function(d) { return "&bull;"}).join("") +
                            '</span></li>' +
                            '</ul></div>';
                        
                    };
                })(this);
            }
            
            $('#select-word').selectize({
                valueField: 'id',  // unique id for lexeme
                labelField: 'word_string',
                // there are also keys allowable when searched with filter syntax
                searchField: ['word_string', 'pos', 'skill', 'gender', 'infinitive'],
                loadThrottle: this.opts.debounce_wait,
                maxOptions: 10,
                openOnFocus : false,
                options: [],
                create: false,
                score: score_func,
                render: {
                    option: option_render
                },
                load: load_callback
            });
            
            this.selectize_api = $("#select-word")[0].selectize;
            
            /* wrap the vanilla selectize.search function */
            this.selectize_api.search_vanilla = this.selectize_api.search;
            this.selectize_api.search = function(query) {
                return this.search_vanilla(query.replace(/[a-zA-Z-_]+:/g, ""));
            }
            
            var item_add_callback = (function(self) {
                return function(value, $item) {
                    var word_model = self.vocab_list_model.get(value);
                    // create word-modal DOM if not exists
                    if ($("#word-modal").size() == 0) {
                        $('<div id="word-modal" class="modal fade hidden"></div>').appendTo('body');
                    }
                    if (word_model != undefined) {
                        var word_view = new duo.WordView({
                            el: null,
                            model: word_model,
                        });
                        word_view.openWordModal();
                    }
                }
            })(this);
            
            this.selectize_api.on("item_add", item_add_callback);
            
            $('#duo-minidict').on("click", (function(self) {
                return function() {
                    if (self.opts.simple_search && !self.selectize_data_loaded) { 
                        // in simple search mode, only load the data ONCE!
                        // lazy loading: prevent an extra "hints" API to fire
                        // if the user doesn't click "search" button.
                        self.selectize_api.load(function(callback) {
                        	callback(self.vocab_list);
                            self.selectize_data_loaded = true;
                        });
                    }
                
                    var p = $(this).position();
                    var h = $(this).height();
                    self.$el.toggle().css({
                        'top': p.top + h + 24,
                        'left': p.left - 224
                    });
                    if (self.$el.is(":visible")) {
                        /* to allow prompt input */
                        self.selectize_api.focus();
                    }
                };
            })(this));
            
            
            this.$el.find('input[type="text"]').blur((function($el) {
                return function() {
                    if ($el.is(":visible")) {
                        $el.fadeOut();
                    }
                };
            })(this.$el)).keydown((function($el) {
                return function(e) {
                    if (e.keyCode == 27) {
                        $el.fadeOut();
						return false;
                    }
                }
            })(this.$el));
            
			$("body").keydown(function(e) {
				if (e.keyCode == 191 || 
					(e.altKey == true && e.keyCode == 76)) {
					var cur_focus = $(':focus').length > 0 ? $(':focus') : null;
					if (!(cur_focus && (cur_focus.is('input') || 
								cur_focus.is('textarea')))) {
						$("#duo-minidict").trigger("click");
						return false;
					}
				}
			});
        }
        
        this.fetch_vocab_list = function() {
            var vlist = new duo.VocabList();
            var callback = (function(self) {
                return function() {
                    self.parse_vocab_list.call(self, vlist);
                };
            })(this);
            
            vlist.fetch({
                data: {},
                success: callback
            });
        }
        
        this.build_query = function(search) {
            /* builds a query object that can contain multiple filters. 
			 * (type, skill, gender etc.).
			 *
			 * The syntax is [filter:]keyword,
			 * for instance, gender:M, skill:Infinitive etc.
			 *
			 * If multiple plain keywords (i.e. without filters) are specified,
			 * only the first one is taken, since it doesn't make too much
			 * sense to search for multiple words.
			 *
			 * Filters are applied by logical AND (not logical OR).
			 */
            var query = {
                keyword: null,
                filters: []
            }, filters = {};
            
            /* allows for filter like skill:"dative case",
			 * where "dative case" is treated as the entire keyword for
			 * attribute [skill] */
            
            var filter_regexp = /([a-zA-Z-_]+:)?((["'])[^\3]+\3|\S+)/g; 
            var self = this;
            $.map(search.match(filter_regexp), function(d, i) {
                if (d.indexOf(":") != -1) {
                    var _f = d.split(":");
                    // remove quotes
                    filters[_f[0]] = self.match_diacritics(
                        _f[1].replace(/["']/g, ''));
                }
                else {
                    query.keyword = query.keyword || self.match_diacritics(d);
                }
            });
            
            query.filters = filters;
            
            return query;
        }
        
        this.match_diacritics = function(regex) {
            var diacritics = this.diacritics[this.learning_language];
            if (_.isUndefined(diacritics)) {
            	return regex;
            }
            for (letter in diacritics) {
                if (diacritics.hasOwnProperty(letter)) {
                	regex = regex.replace(
                        new RegExp(letter, 'ig'),
                        letter.length == 1 ? "[" + letter.toLowerCase() + diacritics[letter] + "]" :
                        "(" + letter.toLowerCase() + "|" + diacritics[letter] + ")"
                    );
                }
            }
            return regex;
        };
        
        this.query = function(lang, query, callback) {
            /* */
            if (this.data_pending || !this.vocab_list) return callback();
            var regex = new RegExp(query.keyword);
            
            if ((query.keyword == null || query.keyword == "") &&
                _.keys(query.filters).length == 0) return callback();
            
            var wl = null;
            if (query.keyword) {
                wl = $.grep(this.vocab_list, function(w, i) {
                    return regex.test(w.word_string);
                });
                
                /* sort the word list */
                if (this.opts.sort_by == "levdist") {
                    var self = this;
                    wl = _.sortBy(wl, function(w) {
                        return self.lev_distance(query.keyword, w.word_string);
                    });
                }
            }
            else {
                wl = this.vocab_list;
            }
            
            $.map(query.filters, function(val, key) {
                var regex = new RegExp(val, "i");
                wl = _.filter(wl, function(w) {
                    // invalid filter, skip
                    if (w[key] == undefined) return true; 
                    return regex.test(w[key]);
                });
                
            });
            
            /* well, nothing qualifies */
            if (wl.length == 0) return callback();
            
            var nmax = query.keyword ? this.opts.max_options :
            this.opts.max_options_filter_only;
            var tokens = {};
            $.each(wl.slice(0, nmax), function(i, w) {
                tokens[w.word_string] = w;
            });
            
            var ajax_callback = (function($callback, $tokens) {
                return function(data) {
                    $.each(data, function(w, hints){
                        if ($tokens[w] != undefined) {
                            $.extend($tokens[w], {hints: hints});
                        }
                    });
                    
                    $callback(_.values($tokens));
                }
            })(callback, tokens);
            
            /* fetch word hints (explanations) */
            $.ajax({
                url: this.duo_apis['hints'] + '/' + this.dict_lang,
                data: {
                    tokens: JSON.stringify(_.keys(tokens))
                },
                success: ajax_callback,
                type: 'GET',
                dataType: 'jsonp'
            });
        }
        
        this.load_hints = function(id, wstr) {
            this.hints_pending[id] = wstr;
            this.update_hints();
        }
        
        this.update_hints = _.debounce((function(self) {
            return function() {
                
                $.ajax({
                    url: self.duo_apis['hints'] + '/' + self.dict_lang,
                    data: {
                        tokens: JSON.stringify(_.values(self.hints_pending))
                    },
                    type: 'GET',
                    dataType: 'jsonp',
                    success: function(data) {
                        $.each(self.hints_pending, function(id, token) {
                            self.selectize_api.options[id].hints = data[token] || [];
                        });
                        
                        self.hints_pending = {};
                        self.selectize_api.clearCache('option');
                        self.selectize_api.refreshOptions();
                    }
                });
                
            }
        })(this), 1000);
        
        this.parse_vocab_list = function(vlist) {
            this.vocab_list = vlist.toJSON();
            console.log("Vocabulary list loaded: " + this.vocab_list.length + " lexemes loaded.");
            
            this.vocab_list_model = vlist; // this is critical
            this.learning_language = vlist.learning_language;
            this.from_language = vlist.from_language;
            this.dict_lang = [vlist.learning_language, vlist.from_language].join("/");
            
            this.data_pending = false;
        }
    };
    
    $(document).ready(function() {
        
        /* load selectize, which is used for the enhanced search functionality.
		 * */
        $.getScript("https://cdn.rawgit.com/killkeeper/selectize.js/0d1cbf41c1e0661cf0cc2f62ac01fc6d84f657e2/dist/js/standalone/selectize.min.js",
                    function() {
                        var dmDict = new DMDict();
                        dmDict.initialize();
                        
                    });
    });
})(jQuery);
