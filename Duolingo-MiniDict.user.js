// ==UserScript==
// @name       Duolingo-MiniDict
// @namespace  https://github.com/killkeeper/duolingo-minidict
// @version    0.1
// @description  A built-in dictionary for Duolingo
// @resource css https://brianreavis.github.io/selectize.js/css/selectize.default.css
// @match      https://www.duolingo.com/*
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
        this.vocab_list = {};
        this.el = null;
        this.$el = null;
        this.selectize_api = null;
        
        this.opts = $.extend({
            update_freq: 3600 * 3, // 3 hours
            force_update: false,
            datatableify: false,
            max_options: 15,
            sort_by: 'levdist', // levdist, strength, last_practiced
        }, settings);
        
        this.local_storage = (typeof Storage == 'function');
        console.log(this.local_storage);
        this.data_pending = false;
        this.last_updated = {};
        
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
            /* check languages */
            this.learning_language = duo.user.get('learning_language');
            this.from_language = duo.user.get('ui_language');
            this.dict_lang = this.learning_language + "/" + this.from_language;
            
            this.check_vocab_list_updates();
            this.init_dom();
        }
        
        this.check_vocab_list_updates = function() {
            /* To throttle API requests, the user's words are cached in via
			 * HTML5's localStorage object. By default the cache is good for 
			 * 3 hours until the settings suggest another value otherwise. */
            
            console.log("local_storage:", this.local_storage);
            if (this.local_storage) {
                $.extend(this.last_updated,
                         JSON.parse(localStorage.getItem('dmdict-last-updated')) || {});
                var dict_last_updated = this.last_updated[this.dict_lang] || 0;
                
                var secs_elapsed = (new Date() - new Date(dict_last_updated)) / 1000;
                console.log('Dictionary ' + this.dict_lang + ' updated ' + 
                            secs_elapsed + ' ago.');
                
                if (secs_elapsed > this.opts.update_freq || secs_elapsed < 0 || 
                    this.opts.force_update) {
                    return this.fetch_vocab_list();
                }
                else {
                    var _cached = localStorage.getItem(
                        'dmdict-cache-' + this.dict_lang);
                    if (!_cached) return this.fetch_vocab_list();
                    
                    this.vocab_list[this.dict_lang] = JSON.parse(_cached);
                    console.log(this.vocab_list[this.dict_lang]);
                }
            }
            else {
                this.fetch_vocab_list();
            }
        }
        
        this.init_dom = function() {
            
            $("ul.topbar-nav-main").append('<li><a id="duo-minidict" href="javascript:void(0);">' +
                                           '<span class="icon icon-search-gray"></span><small>Mdict</small></a></li>');
            $("ul.topbar-nav-main").append('<div class="popover" role="tooltip" style="display: none; overflow-y: visible; width: 512px;" id="duo-selectize-container">' + 
                                           '<h6 class="popover-title">MiniDict - Type to search:</h6>' +
                                           '<div class="popover-content" id="md-selectize">' +
                                           '<select id="select-word" class="wordlist" placeholder="Search for a word..."></select>' +
                                           '</div></div>');
            
            this.$el = $("#duo-selectize-container");
            this.el = this.$el.get(0);
            
            $('<link rel="stylesheet" href="https://brianreavis.github.io/selectize.js/css/selectize.default.css" />').appendTo('head');
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
              ' font-weight: bold; }</style>'
             ).appendTo('head');
            
            var load_callback = (function(self) {
                return function(query_str, callback) {
                    if (!query_str.length) return callback();
                    
                    var query = self.build_query(query_str);
                    self.query(self.dict_lang, query, callback);
                }
            })(this);
            
            $('#select-word').selectize({
                valueField: 'word_string',
                labelField: 'word_string',
                searchField: 'word_string',
                loadThrottle: 500,
                maxOptions: 10,
                options: [],
                create: false,
                render: {
                    option: function(item, escape) {
                        return '<div><span class="title"><span class="word">' + 
                            escape(item.word_string) + '</span><span class="attrs">' + 
                            escape(item.pos) + 
                            (item.gender ? " (" + item.gender.substr(0, 1).toLowerCase() + ".)" : "") +
                            (item.infinitive ? " (inf: " + item.infinitive + ")" : "") +
                            '</span></span><span class="hints">' + 
                            escape(item.hints.slice(0, 10).join(", ")) + 
                            '</span><ul class="meta">' + 
                            '<li>Skill: <span>' + escape(item.skill) + '</span></li>' +
                            '</ul></div>';
                    }
                },
                load: load_callback
            });
            
            this.selectize_api = $("#select-word")[0].selectize;
            
            $('#duo-minidict').on("click", (function($el, $api) {
                return function() {
                    var p = $(this).position();
                    var h = $(this).height();
                    $el.toggle().css({
                        'top': p.top + h + 24,
                        'left': p.left - 224
                    });
                    if ($el.is(":visible")) {
                        /* to allow prompt input */
                        $api.focus();
                    }
                };
            })(this.$el, this.selectize_api));
            
            
            this.$el.find('input[type="text"]').blur((function($el) {
                return function() {
                    if ($el.is(":visible")) {
                        $el.fadeOut();
                    }
                };
            })(this.$el));
            
            
        }
        
        this.fetch_vocab_list = function() {
            this.data_pending = true;
            
            var vlist = new duo.VocabList;
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
            
            var filter_regexp = /(([a-zA-Z-_])+:)?(\S+)/g;
            $.map(search.match(filter_regexp), function(d, i) {
                if (d.indexOf(":") != -1) {
                    var _f = d.split(":");
                    filters[_f[0]] = _f[1];
                }
                else {
                    query.keyword = query.keyword || d;
                }
            });
            
            query.filters = filters;
            console.log(query);
            
            return query;
        }
        
        this.query = function(lang, query, callback) {
            /* */
            console.log("Query:", lang, this.vocab_list[lang], query, callback);
            if (this.vocab_list[lang] == undefined) return callback();
            var regex = new RegExp(query.keyword);
            
            var wl = $.grep(this.vocab_list[lang].words, function(w, i) {
                return regex.test(w.word_string);
            });
            
            /* sort the word list */
            if (this.opts.sort_by == "levdist") {
                var self = this;
                wl = _.sortBy(wl, function(w) {
                    return self.lev_distance(query.keyword, w.word_string);
                });
            }
            
            $.map(query.filters, function(f, i) {
                var regex = new RegExp(f);
                wl = _.filter(wl, function(w) {
                    // invalid filter, skip
                    if (w[f] == undefined) return true; 
                    return regex.test(w[f]);
                });
            });
            
            /* well, nothing qualifies */
            if (wl.length == 0) return callback();
            
            var tokens = {};
            $.each(wl.slice(0, this.opts.max_options), function(i, w) {
                tokens[w.word_string] = w;
            });
            
            var ajax_callback = (function($callback, $tokens) {
                return function(data) {
                    console.log(data);
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
        
        this.parse_vocab_list = function(vlist) {
            console.log(vlist.toJSON());
            var flang = vlist.from_language,
                llang = vlist.learning_language,
                dlang = llang + '/' + flang,
                len = vlist.length,
                words = vlist.toJSON();
            
            var dict = {
                from_lang: flang,
                learn_lang: llang,
                num_words: len,
                words: words
            };
            
            this.learning_language = llang;
            this.from_language = flang;
            this.dict_lang = dlang;
            
            this.vocab_list[dlang] = dict;
            if (this.local_storage) {
                localStorage.setItem('dmdict-cache-' + dlang, JSON.stringify(dict));
                var _l = {};
                _l[dlang] = new Date();
                $.extend(this.last_updated, _l);
                localStorage.setItem('dmdict-last-updated', JSON.stringify(this.last_updated));
            }
            
            console.log("Dictionary cached for language: " + dlang + "; " +
                        len + "words in dictionary.");
            
            //console.log(localStorage.getItem('dmdict-cache-' + dlang));
            this.data_pending = false;
        }
    };
    
    $(document).ready(function() {
        
        /* load selectize, which is used for the enhanced search functionality.
		 * */
        $.getScript("https://brianreavis.github.io/selectize.js/js/selectize.js",
                    function() {
                        console.log("Loaded!");
                        var dmDict = new DMDict();
                        dmDict.initialize();
                        
                    });
    });
})(jQuery);
